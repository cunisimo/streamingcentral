#!/usr/bin/env node
/**
 * Pool general para la ruleta "no sé qué ver".
 *
 * A diferencia del pool de un chip, acá NO hay clasificación temática: no
 * preguntamos "¿es navideña?" sino "¿es buena y está disponible?". Eso son
 * pisos numéricos, sin LLM.
 *
 * Usa watch_region=AR + with_watch_monetization_types=flatrate para que
 * TMDB devuelva únicamente lo que está por suscripción en Argentina.
 *
 * Uso:
 *   node --env-file=.env.local scripts/build-roulette-pool.mjs
 *   node --env-file=.env.local scripts/build-roulette-pool.mjs --min-nota 6.0
 *
 * Salida: data/pool-ruleta.json
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const arg = (f) => {
  const i = args.indexOf(f);
  return i !== -1 ? (args[i + 1] ?? null) : null;
};

const REGION = "AR";
const MIN_VOTOS = arg("--min-votos") ? Number(arg("--min-votos")) : 300;
const MIN_NOTA = arg("--min-nota") ? Number(arg("--min-nota")) : 6.2;
const PAGES_PER_SORT = arg("--pages") ? Number(arg("--pages")) : 12;
const CONCURRENCY = 8;
const LANGUAGE = "es-ES";

// Varios ordenamientos para no truncar sesgado — la lección del pool navideño.
const SORTS = ["popularity.desc", "vote_count.desc", "vote_average.desc", "revenue.desc"];

const BASE = "https://api.themoviedb.org/3";
const ACCESS_TOKEN = process.env.TMDB_ACCESS_TOKEN ?? process.env.TMDB_READ_TOKEN ?? null;
const API_KEY = process.env.TMDB_API_KEY ?? null;
const OUTPUT_PATH = resolve("data/pool-ruleta.json");

if (!ACCESS_TOKEN && !API_KEY) {
  console.error("Falta TMDB_ACCESS_TOKEN / TMDB_READ_TOKEN / TMDB_API_KEY.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tmdb(path, params = {}, attempt = 0) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  if (!ACCESS_TOKEN && API_KEY) url.searchParams.set("api_key", API_KEY);
  const headers = { accept: "application/json" };
  if (ACCESS_TOKEN) headers.authorization = `Bearer ${ACCESS_TOKEN}`;

  try {
    const res = await fetch(url, { headers });
    if (res.status === 429 && attempt < 5) {
      await sleep((Number(res.headers.get("retry-after") ?? 1) + 1) * 1000);
      return tmdb(path, params, attempt + 1);
    }
    if (!res.ok) return null;
    return await res.json();
  } catch {
    if (attempt < 3) {
      await sleep(2 ** attempt * 500);
      return tmdb(path, params, attempt + 1);
    }
    return null;
  }
}

async function mapLimit(items, limit, worker) {
  const out = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor++;
        out[i] = await worker(items[i], i);
      }
    }),
  );
  return out;
}

/**
 * Normaliza las certificaciones a una escala propia.
 * TMDB devuelve tres sistemas mezclados (US, AR y números pelados), con
 * casing inconsistente y algún valor inventado.
 * @param {string|null} raw
 * @returns {"todos"|"guia"|"adolescentes"|"adultos"|"desconocido"}
 */
function normalizarCert(raw) {
  if (!raw) return "desconocido";
  const c = raw.trim().toUpperCase();
  if (["ATP", "G", "AA"].includes(c)) return "todos";
  if (["PG", "+7", "7"].includes(c)) return "guia";
  if (["PG-13", "+13", "13", "12", "+12"].includes(c)) return "adolescentes";
  if (["R", "NC-17", "+16", "16", "+18", "18", "X"].includes(c)) return "adultos";
  return "desconocido";
}

/**
 * Certificación argentina desde release_dates. Si no hay AR, cae a US.
 * Se conserva el valor crudo además del normalizado: si mañana la
 * normalización resulta mal, no hay que re-extraer.
 * @param {object} detail Respuesta con append_to_response=release_dates
 */
function certificacion(detail) {
  const listas = detail.release_dates?.results ?? [];
  for (const pais of [REGION, "US"]) {
    const entrada = listas.find((r) => r.iso_3166_1 === pais);
    const cert = entrada?.release_dates?.find((d) => d.certification)?.certification;
    if (cert) return { cert, cert_pais: pais, edad: normalizarCert(cert) };
  }
  return { cert: null, cert_pais: null, edad: "desconocido" };
}

/** Sin acentos ni mayúsculas, para comparar nombres de género. */
const sinAcentos = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

async function main() {
  console.log(`\nBuscando películas por suscripción en ${REGION}…`);
  console.log(`  pisos: ${MIN_VOTOS} votos · nota ${MIN_NOTA}\n`);

  const encontrados = new Map();

  // Cada ventana pagina por separado. Sin esto, los 4 sorts compiten por el
  // mismo top-240 y el pool queda truncado y sesgado a lo reciente.
  const VENTANAS = [
    { desde: "1920-01-01", hasta: "1979-12-31", nombre: "hasta 1979" },
    { desde: "1980-01-01", hasta: "1989-12-31", nombre: "1980s" },
    { desde: "1990-01-01", hasta: "1999-12-31", nombre: "1990s" },
    { desde: "2000-01-01", hasta: "2009-12-31", nombre: "2000s" },
    { desde: "2010-01-01", hasta: "2019-12-31", nombre: "2010s" },
    { desde: "2020-01-01", hasta: "2029-12-31", nombre: "2020s" },
  ];

  for (const v of VENTANAS) {
    let nuevosVentana = 0;
    for (const sortBy of SORTS) {
      for (let page = 1; page <= PAGES_PER_SORT; page++) {
        const data = await tmdb("/discover/movie", {
          watch_region: REGION,
          with_watch_monetization_types: "flatrate",
          "vote_count.gte": MIN_VOTOS,
          "vote_average.gte": MIN_NOTA,
          "primary_release_date.gte": v.desde,
          "primary_release_date.lte": v.hasta,
          sort_by: sortBy,
          include_adult: false,
          language: LANGUAGE,
          page,
        });
        if (!data?.results?.length) break;
        for (const item of data.results) {
          if (!encontrados.has(item.id)) nuevosVentana++;
          encontrados.set(item.id, item);
        }
        if (page >= (data.total_pages ?? 1)) break;
      }
    }
    console.log(`  ${v.nombre}: +${nuevosVentana} nuevos  (total ${encontrados.size})`);
  }

  const crudos = [...encontrados.values()];
  console.log(`\n${crudos.length} candidatos únicos. Enriqueciendo…`);

  const enriquecidos = await mapLimit(crudos, CONCURRENCY, async (item) => {
    const detail = await tmdb(`/movie/${item.id}`, {
      language: LANGUAGE,
      append_to_response: "release_dates,watch/providers",
    });
    if (!detail) return null;

    const region = detail["watch/providers"]?.results?.[REGION] ?? null;
    const providers = [
      ...(region?.flatrate ?? []),
      ...(region?.free ?? []),
      ...(region?.ads ?? []),
    ].map((p) => p.provider_name);

    // Sin plataforma de suscripción no sirve para la ruleta.
    if (providers.length === 0) return null;

    const { cert, cert_pais, edad } = certificacion(detail);

    const generos = (detail.genres ?? []).map((g) => g.name);
    // En AR, animación y familia se doblan siempre. Es el proxy de doblaje
    // que TMDB no da: sólo el 2,5% del pool es de habla hispana original.
    const generoInfantil = generos.some((g) =>
      ["animacion", "familia"].includes(sinAcentos(g)),
    );

    return {
      tmdb_id: detail.id,
      media_type: "movie",
      title: detail.title,
      original_title: detail.original_title,
      year: detail.release_date ? Number(detail.release_date.slice(0, 4)) : null,
      overview: (detail.overview ?? "").trim(),
      genres: generos,
      runtime: detail.runtime ?? null,
      original_language: detail.original_language ?? null,
      en_espanol: (detail.original_language ?? "") === "es",
      certificacion: cert,
      certificacion_pais: cert_pais,
      edad,
      apto_chicos: generoInfantil && ["todos", "guia"].includes(edad),
      vote_count: detail.vote_count ?? 0,
      vote_average: detail.vote_average ?? null,
      popularity: detail.popularity ?? null,
      providers: [...new Set(providers)],
    };
  });

  const pool = enriquecidos
    .filter((t) => t && t.overview.length > 0)
    .sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0));

  // ── Informes ──────────────────────────────────────────────────────────────

  const porProveedor = new Map();
  for (const t of pool) {
    for (const p of t.providers) porProveedor.set(p, (porProveedor.get(p) ?? 0) + 1);
  }

  console.log(`\n── Pool final: ${pool.length} títulos ──`);

  console.log("\n── Por proveedor ──");
  for (const [n, c] of [...porProveedor].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`  ${String(c).padStart(4)}  ${n}`);
  }

  const decadas = new Map();
  for (const t of pool) {
    if (!t.year) continue;
    const d = `${Math.floor(t.year / 10) * 10}s`;
    decadas.set(d, (decadas.get(d) ?? 0) + 1);
  }
  console.log("\n── Décadas ──");
  for (const [d, c] of [...decadas].sort()) console.log(`  ${d}  ${c}`);

  const edades = new Map();
  for (const t of pool) edades.set(t.edad, (edades.get(t.edad) ?? 0) + 1);
  console.log("\n── Edad (normalizada) ──");
  for (const [e, n] of [...edades].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${e}`);
  }

  console.log(`\n── Cobertura por escenario ──`);
  console.log(`  con chicos : ${pool.filter((t) => t.apto_chicos).length}`);
  console.log(`  solo/a     : ${pool.filter((t) => ["adolescentes", "adultos"].includes(t.edad)).length}`);
  console.log(`  en pareja  : ${pool.filter((t) => (t.runtime ?? 999) <= 130).length}`);
  console.log(`  (de fondo depende de "atencion", que se genera después)`);

  const enEspanol = pool.filter((t) => t.en_espanol).length;
  console.log(`\n  en español original: ${enEspanol}  ·  resto: ${pool.length - enEspanol}`);

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(
    OUTPUT_PATH,
    JSON.stringify(
      {
        region: REGION,
        generated_at: new Date().toISOString(),
        pisos: { min_votos: MIN_VOTOS, min_nota: MIN_NOTA },
        total: pool.length,
        titles: pool,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`\n✔ ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error("Falló:", err);
  process.exit(1);
});
