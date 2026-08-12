#!/usr/bin/env node
/**
 * Extracción suplementaria: películas CORTAS.
 *
 * El pool principal usa piso de 300 votos y quedó corrido hacia lo largo —
 * los tanques modernos son largos y muy votados a la vez, mientras que el
 * cine corto vive en lo viejo, lo indie y lo chico, que ese piso borra.
 * Resultado: nada por debajo de 1h33 y el escenario "poco tiempo" incumple
 * su promesa.
 *
 * Este script ataca sólo ese hueco: duración acotada y piso de votos bajo.
 * SUMA al pool existente, no lo pisa.
 *
 * Uso:
 *   node --env-file=.env.local scripts/build-shorts-pool.mjs
 *   node --env-file=.env.local scripts/build-shorts-pool.mjs --max-runtime 95 --min-votos 100
 *
 * Entrada/salida: data/pool-ruleta.json (lo reescribe con los nuevos sumados)
 */

import { readFile, writeFile, copyFile } from "node:fs/promises";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const arg = (f) => {
  const i = args.indexOf(f);
  return i !== -1 ? (args[i + 1] ?? null) : null;
};

const REGION = "AR";
const MAX_RUNTIME = arg("--max-runtime") ? Number(arg("--max-runtime")) : 100;
const MIN_RUNTIME = 60; // menos que esto es mediometraje, no película
const MIN_VOTOS = arg("--min-votos") ? Number(arg("--min-votos")) : 50;
const MIN_NOTA = arg("--min-nota") ? Number(arg("--min-nota")) : 6.0;
const PAGES_PER_SORT = arg("--pages") ? Number(arg("--pages")) : 8;
const CONCURRENCY = 8;
const LANGUAGE = "es-ES";

const SORTS = ["popularity.desc", "vote_count.desc", "vote_average.desc"];

// Mismas ventanas que el pool principal: sin esto, un solo sort trunca
// sesgado hacia lo reciente.
const VENTANAS = [
  { desde: "1920-01-01", hasta: "1969-12-31", nombre: "hasta 1969" },
  { desde: "1970-01-01", hasta: "1989-12-31", nombre: "1970-80s" },
  { desde: "1990-01-01", hasta: "2004-12-31", nombre: "1990-2004" },
  { desde: "2005-01-01", hasta: "2014-12-31", nombre: "2005-2014" },
  { desde: "2015-01-01", hasta: "2029-12-31", nombre: "2015+" },
];

const BASE = "https://api.themoviedb.org/3";
const ACCESS_TOKEN = process.env.TMDB_ACCESS_TOKEN ?? process.env.TMDB_READ_TOKEN ?? null;
const API_KEY = process.env.TMDB_API_KEY ?? null;
const POOL_PATH = resolve("data/pool-ruleta.json");

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

function normalizarCert(raw) {
  if (!raw) return "desconocido";
  const c = raw.trim().toUpperCase();
  if (["ATP", "G", "AA"].includes(c)) return "todos";
  if (["PG", "+7", "7"].includes(c)) return "guia";
  if (["PG-13", "+13", "13", "12", "+12"].includes(c)) return "adolescentes";
  if (["R", "NC-17", "+16", "16", "+18", "18", "X"].includes(c)) return "adultos";
  return "desconocido";
}

function certificacion(detail) {
  const listas = detail.release_dates?.results ?? [];
  for (const pais of [REGION, "US"]) {
    const entrada = listas.find((r) => r.iso_3166_1 === pais);
    const cert = entrada?.release_dates?.find((d) => d.certification)?.certification;
    if (cert) return { cert, cert_pais: pais, edad: normalizarCert(cert) };
  }
  return { cert: null, cert_pais: null, edad: "desconocido" };
}

const sinAcentos = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

async function main() {
  const pool = JSON.parse(await readFile(POOL_PATH, "utf8"));
  const existentes = new Set((pool.titles ?? []).map((t) => t.tmdb_id));

  console.log(`\nPool actual: ${existentes.size} títulos`);
  console.log(`Buscando cortas: ${MIN_RUNTIME}-${MAX_RUNTIME} min · ${MIN_VOTOS}+ votos · nota ${MIN_NOTA}+\n`);

  const encontrados = new Map();

  for (const v of VENTANAS) {
    let nuevos = 0;
    for (const sortBy of SORTS) {
      for (let page = 1; page <= PAGES_PER_SORT; page++) {
        const data = await tmdb("/discover/movie", {
          watch_region: REGION,
          with_watch_monetization_types: "flatrate",
          "vote_count.gte": MIN_VOTOS,
          "vote_average.gte": MIN_NOTA,
          "with_runtime.gte": MIN_RUNTIME,
          "with_runtime.lte": MAX_RUNTIME,
          "primary_release_date.gte": v.desde,
          "primary_release_date.lte": v.hasta,
          sort_by: sortBy,
          include_adult: false,
          language: LANGUAGE,
          page,
        });
        if (!data?.results?.length) break;
        for (const item of data.results) {
          if (existentes.has(item.id)) continue; // ya está en el pool
          if (!encontrados.has(item.id)) nuevos++;
          encontrados.set(item.id, item);
        }
        if (page >= (data.total_pages ?? 1)) break;
      }
    }
    console.log(`  ${v.nombre}: +${nuevos}  (acumulado ${encontrados.size})`);
  }

  const crudos = [...encontrados.values()];
  if (crudos.length === 0) {
    console.log("\nNo se encontró nada nuevo. Probá bajando --min-votos o subiendo --max-runtime.");
    return;
  }

  console.log(`\n${crudos.length} candidatos nuevos. Enriqueciendo…`);

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
    if (providers.length === 0) return null;

    // TMDB a veces devuelve runtime distinto al del filtro de discover.
    if (!detail.runtime || detail.runtime > MAX_RUNTIME || detail.runtime < MIN_RUNTIME) return null;

    const { cert, cert_pais, edad } = certificacion(detail);
    const generos = (detail.genres ?? []).map((g) => g.name);
    const generoInfantil = generos.some((g) => ["animacion", "familia"].includes(sinAcentos(g)));

    return {
      tmdb_id: detail.id,
      media_type: "movie",
      title: detail.title,
      original_title: detail.original_title,
      year: detail.release_date ? Number(detail.release_date.slice(0, 4)) : null,
      overview: (detail.overview ?? "").trim(),
      genres: generos,
      runtime: detail.runtime,
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

  const nuevos = enriquecidos.filter((t) => t && t.overview.length > 0);

  // ── Informe ───────────────────────────────────────────────────────────────
  console.log(`\n── ${nuevos.length} títulos nuevos ──`);

  const tramos = new Map();
  for (const t of nuevos) {
    const k = `${Math.floor(t.runtime / 10) * 10}-${Math.floor(t.runtime / 10) * 10 + 9} min`;
    tramos.set(k, (tramos.get(k) ?? 0) + 1);
  }
  console.log("\n── Duración ──");
  for (const [k, n] of [...tramos].sort()) console.log(`  ${k}  ${n}`);

  const decadas = new Map();
  for (const t of nuevos) {
    if (!t.year) continue;
    const d = `${Math.floor(t.year / 10) * 10}s`;
    decadas.set(d, (decadas.get(d) ?? 0) + 1);
  }
  console.log("\n── Décadas ──");
  for (const [d, n] of [...decadas].sort()) console.log(`  ${d}  ${n}`);

  const votos = nuevos.map((t) => t.vote_count).sort((a, b) => a - b);
  console.log(`\n  votos: mín ${votos[0]} · mediana ${votos[Math.floor(votos.length / 2)]} · máx ${votos.at(-1)}`);
  console.log(`  no infantiles: ${nuevos.filter((t) => !t.apto_chicos).length}`);

  console.log("\n── Los 10 con menos votos ──");
  for (const t of [...nuevos].sort((a, b) => a.vote_count - b.vote_count).slice(0, 10)) {
    console.log(`  ${String(t.vote_count).padStart(5)}v · ${t.runtime}min · ${t.year} · ${t.title}`);
  }

  // ── Merge ─────────────────────────────────────────────────────────────────
  await copyFile(POOL_PATH, resolve("data/pool-ruleta.backup.json"));

  const merged = [...(pool.titles ?? []), ...nuevos].sort(
    (a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0),
  );

  await writeFile(
    POOL_PATH,
    JSON.stringify(
      {
        ...pool,
        generated_at: new Date().toISOString(),
        suplemento_cortas: {
          fecha: new Date().toISOString(),
          max_runtime: MAX_RUNTIME,
          min_votos: MIN_VOTOS,
          agregados: nuevos.length,
        },
        total: merged.length,
        titles: merged,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`\n✔ pool: ${existentes.size} → ${merged.length}`);
  console.log(`  backup en data/pool-ruleta.backup.json`);
  console.log(`\n  Siguiente: node scripts/generate-copy.mjs --todos`);
}

main().catch((err) => {
  console.error("Falló:", err);
  process.exit(1);
});
