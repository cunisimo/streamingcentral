#!/usr/bin/env node
/**
 * Marca qué títulos de la ruleta son la PRIMERA de su saga y cuáles no.
 *
 * belongs_to_collection sólo dice a qué colección pertenece un título, no en
 * qué orden. Hay que traer la colección completa y ordenar por fecha de
 * estreno — la primera por estreno es la puerta de entrada, incluso cuando
 * cronológicamente sea posterior (Star Wars, por ejemplo).
 *
 * Uso:
 *   node --env-file=.env.local scripts/enrich-roulette-collections.mjs
 *
 * Entrada: data/pool-ruleta.json + data/copy-ruleta.json
 * Salida:  data/colecciones-ruleta.json + data/carga-secuelas.sql
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const BASE = "https://api.themoviedb.org/3";
const ACCESS_TOKEN = process.env.TMDB_ACCESS_TOKEN ?? process.env.TMDB_READ_TOKEN ?? null;
const API_KEY = process.env.TMDB_API_KEY ?? null;
const CONCURRENCY = 8;

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

const q = (v) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);

async function main() {
  const pool = JSON.parse(await readFile(resolve("data/pool-ruleta.json"), "utf8"));
  const copy = JSON.parse(await readFile(resolve("data/copy-ruleta.json"), "utf8"));

  const conTexto = new Set((copy.rows ?? []).filter((r) => r.conoce).map((r) => r.tmdb_id));
  const titulos = (pool.titles ?? []).filter((t) => conTexto.has(t.tmdb_id));

  console.log(`\n1. Consultando colección de ${titulos.length} títulos…`);

  const conColeccion = await mapLimit(titulos, CONCURRENCY, async (t) => {
    const detail = await tmdb(`/movie/${t.tmdb_id}`, { language: "es-ES" });
    const col = detail?.belongs_to_collection ?? null;
    return {
      tmdb_id: t.tmdb_id,
      title: t.title,
      year: t.year,
      collection_id: col?.id ?? null,
      collection_name: col?.name ?? null,
    };
  });

  const idsColeccion = [...new Set(conColeccion.map((r) => r.collection_id).filter(Boolean))];
  console.log(`   ${idsColeccion.length} colecciones distintas`);

  console.log(`\n2. Resolviendo el orden de estreno de cada colección…`);

  // La primera por fecha de estreno es la puerta de entrada a la saga.
  const primeraDe = new Map();
  await mapLimit(idsColeccion, CONCURRENCY, async (colId) => {
    const col = await tmdb(`/collection/${colId}`, { language: "es-ES" });
    const partes = (col?.parts ?? [])
      .filter((p) => p.release_date)
      .sort((a, b) => a.release_date.localeCompare(b.release_date));
    if (partes.length) primeraDe.set(colId, partes[0].id);
  });

  const filas = conColeccion.map((r) => ({
    ...r,
    // Sin colección: es autoconclusiva, no es secuela.
    es_secuela: r.collection_id ? primeraDe.get(r.collection_id) !== r.tmdb_id : false,
  }));

  const secuelas = filas.filter((f) => f.es_secuela);

  console.log(`\n── Resultado ──`);
  console.log(`  sin colección     : ${filas.filter((f) => !f.collection_id).length}`);
  console.log(`  primera de su saga: ${filas.filter((f) => f.collection_id && !f.es_secuela).length}`);
  console.log(`  secuelas          : ${secuelas.length}`);

  console.log(`\n── Algunas secuelas detectadas ──`);
  for (const f of secuelas.slice(0, 15)) {
    console.log(`  ${f.year} · ${f.title}  [${f.collection_name}]`);
  }

  await mkdir(resolve("data"), { recursive: true });
  await writeFile(
    resolve("data/colecciones-ruleta.json"),
    JSON.stringify({ fetched_at: new Date().toISOString(), total: filas.length, rows: filas }, null, 2),
    "utf8",
  );

  // ── SQL ───────────────────────────────────────────────────────────────────
  const sql = [];
  sql.push("-- Marca de secuelas para la ruleta");
  sql.push(`-- ${secuelas.length} de ${filas.length} títulos`);
  sql.push("");
  sql.push("alter table roulette_titles add column if not exists es_secuela boolean not null default false;");
  sql.push("alter table roulette_titles add column if not exists collection_name text;");
  sql.push("");
  sql.push("begin;");
  sql.push("");
  sql.push("update roulette_titles set es_secuela = false;");
  sql.push("");

  if (secuelas.length) {
    sql.push("update roulette_titles set es_secuela = true where tmdb_id in (");
    sql.push("  " + secuelas.map((f) => f.tmdb_id).join(", "));
    sql.push(");");
    sql.push("");
  }

  const conNombre = filas.filter((f) => f.collection_name);
  if (conNombre.length) {
    sql.push("update roulette_titles rt set collection_name = v.nombre");
    sql.push("from (values");
    sql.push(conNombre.map((f) => `  (${f.tmdb_id}, ${q(f.collection_name)})`).join(",\n"));
    sql.push(") as v(id, nombre) where rt.tmdb_id = v.id;");
    sql.push("");
  }

  sql.push("commit;");
  sql.push("");
  sql.push("-- Verificación:");
  sql.push("--   select count(*) from roulette_titles where es_secuela;");
  sql.push("");

  await writeFile(resolve("data/carga-secuelas.sql"), sql.join("\n"), "utf8");
  console.log(`\n✔ data/colecciones-ruleta.json`);
  console.log(`✔ data/carga-secuelas.sql`);
}

main().catch((err) => {
  console.error("Falló:", err);
  process.exit(1);
});
