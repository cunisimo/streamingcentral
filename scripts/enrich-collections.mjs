#!/usr/bin/env node
/**
 * Trae belongs_to_collection de TMDB para los títulos aprobados.
 *
 * Necesario para aplicar el tope por saga en la selección final.
 * Se guarda en archivo aparte para que sobreviva a una reclasificación.
 *
 * Uso:
 *   node --env-file=.env.local scripts/enrich-collections.mjs --chip magica-navidad
 *
 * Entrada: data/clasificado-<slug>.json
 * Salida:  data/colecciones-<slug>.json
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const arg = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 ? (args[i + 1] ?? null) : null;
};

const slug = arg("--chip");
if (!slug) {
  console.error("Uso: node scripts/enrich-collections.mjs --chip <slug>");
  process.exit(1);
}

const BASE = "https://api.themoviedb.org/3";
const ACCESS_TOKEN = process.env.TMDB_ACCESS_TOKEN ?? process.env.TMDB_READ_TOKEN ?? null;
const API_KEY = process.env.TMDB_API_KEY ?? null;

if (!ACCESS_TOKEN && !API_KEY) {
  console.error("Falta TMDB_ACCESS_TOKEN / TMDB_READ_TOKEN / TMDB_API_KEY.");
  process.exit(1);
}

const INPUT_PATH = resolve(`data/clasificado-${slug}.json`);
const OUTPUT_PATH = resolve(`data/colecciones-${slug}.json`);
const CONCURRENCY = 8;

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

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
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await worker(items[index], index);
      }
    }),
  );
  return results;
}

async function main() {
  const data = JSON.parse(await readFile(INPUT_PATH, "utf8"));
  const aprobados = (data.titles ?? []).filter((t) => t.califica === true);

  console.log(`\nConsultando colecciones de ${aprobados.length} aprobados…`);

  const filas = await mapLimit(aprobados, CONCURRENCY, async (t) => {
    const detail = await tmdb(`/movie/${t.tmdb_id}`, { language: "es-ES" });
    const col = detail?.belongs_to_collection ?? null;
    return {
      tmdb_id: t.tmdb_id,
      title: t.title,
      year: t.year,
      vote_count: t.vote_count,
      vote_average: t.vote_average,
      collection_id: col?.id ?? null,
      collection_name: col?.name ?? null,
    };
  });

  // ── Sagas detectadas ──────────────────────────────────────────────────────
  const porColeccion = new Map();
  for (const f of filas) {
    if (!f.collection_id) continue;
    if (!porColeccion.has(f.collection_id)) porColeccion.set(f.collection_id, []);
    porColeccion.get(f.collection_id).push(f);
  }

  const sagas = [...porColeccion.values()]
    .filter((g) => g.length > 1)
    .sort((a, b) => b.length - a.length);

  console.log(`\n── Sagas con más de un título aprobado ──`);
  for (const grupo of sagas) {
    console.log(`\n  ${grupo[0].collection_name}  (${grupo.length})`);
    for (const f of grupo.sort((a, b) => b.vote_count - a.vote_count)) {
      console.log(`    ${String(f.vote_count).padStart(6)}v · ${f.vote_average} · ${f.year} · ${f.title}`);
    }
  }

  const sueltos = filas.filter((f) => !f.collection_id);
  console.log(`\n── Sin colección en TMDB: ${sueltos.length} títulos ──`);
  console.log("  (las adaptaciones de una misma obra caen acá: hay que agruparlas a mano)");

  // ── Candidatos a descarte por puntaje ─────────────────────────────────────
  const flojos = filas
    .filter((f) => f.vote_count >= 50 && f.vote_average < 5.5)
    .sort((a, b) => a.vote_average - b.vote_average);

  console.log(`\n── Puntaje bajo (≥50 votos y nota <5.5): ${flojos.length} ──`);
  for (const f of flojos) {
    console.log(`  ${f.vote_average} · ${String(f.vote_count).padStart(5)}v · ${f.year} · ${f.title}`);
  }

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(
    OUTPUT_PATH,
    JSON.stringify(
      { chip_slug: slug, fetched_at: new Date().toISOString(), total: filas.length, rows: filas },
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
