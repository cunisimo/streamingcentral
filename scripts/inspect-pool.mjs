#!/usr/bin/env node
/**
 * Inspección del pool crudo — revisión humana previa a la Fase 3.
 *
 * No modifica nada. Sólo imprime el pool en formato legible para decidir
 * si vale la pena gastar tokens clasificándolo.
 *
 * Uso:
 *   node scripts/inspect-pool.mjs              # resumen + top 40 de cada tipo
 *   node scripts/inspect-pool.mjs --movie -n 80
 *   node scripts/inspect-pool.mjs --tv
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const POOL_PATH = resolve("data/pool-navidad.json");

/** Títulos canónicos por original_title — si faltan, las keywords no cubrieron bien. */
const CANONICOS = [
  "Home Alone",
  "Elf",
  "The Polar Express",
  "Love Actually",
  "It's a Wonderful Life",
  "The Nightmare Before Christmas",
  "Klaus",
  "The Santa Clause",
  "Miracle on 34th Street",
  "A Christmas Story",
  "The Muppet Christmas Carol",
  "Die Hard",
];

const args = process.argv.slice(2);
const limit = Number(args[args.indexOf("-n") + 1]) || 40;
const onlyMovie = args.includes("--movie");
const onlyTv = args.includes("--tv");

/**
 * @param {object[]} titles
 * @param {(t: object) => string|number|null} keyFn
 * @returns {Array<[string, number]>} pares ordenados por frecuencia desc
 */
function tally(titles, keyFn) {
  const counts = new Map();
  for (const title of titles) {
    const raw = keyFn(title);
    if (raw === null || raw === undefined) continue;
    const keys = Array.isArray(raw) ? raw : [raw];
    for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]);
}

/** @param {object} t */
const line = (t) =>
  `  ${String(t.year ?? "????").padEnd(5)} ${t.title}` +
  (t.original_title && t.original_title !== t.title ? `  [${t.original_title}]` : "") +
  `\n        ${t.genres.join(", ") || "sin género"}`;

async function main() {
  let pool;
  try {
    pool = JSON.parse(await readFile(POOL_PATH, "utf8"));
  } catch (err) {
    console.error(`No pude leer ${POOL_PATH}: ${err.message}`);
    process.exit(1);
  }

  const all = pool.titles ?? [];
  const movies = all.filter((t) => t.media_type === "movie");
  const shows = all.filter((t) => t.media_type === "tv");

  console.log(`\n═══ POOL "${pool.chip_slug}" — ${all.length} títulos ═══`);
  console.log(`  películas ${movies.length}  ·  series ${shows.length}\n`);

  // ── Chequeo de cobertura ──────────────────────────────────────────────────
  const originales = new Set(all.map((t) => t.original_title));
  const faltantes = CANONICOS.filter((c) => !originales.has(c));
  console.log("── Cobertura de canónicos ──");
  console.log(`  presentes: ${CANONICOS.length - faltantes.length}/${CANONICOS.length}`);
  if (faltantes.length) console.log(`  FALTAN: ${faltantes.join(" · ")}`);

  // ── Distribución por década ───────────────────────────────────────────────
  console.log("\n── Décadas ──");
  for (const [dec, n] of tally(all, (t) => (t.year ? `${Math.floor(t.year / 10) * 10}s` : null)).sort())
    console.log(`  ${dec}  ${"█".repeat(Math.ceil(n / 4))} ${n}`);

  // ── Géneros dominantes ────────────────────────────────────────────────────
  console.log("\n── Géneros (top 12) ──");
  for (const [genre, n] of tally(all, (t) => t.genres).slice(0, 12))
    console.log(`  ${String(n).padStart(4)}  ${genre}`);

  // ── Señal de ruido: qué keyword los trajo ─────────────────────────────────
  console.log("\n── Keywords navideñas presentes ──");
  const navidenas = new Set(pool.keywords_used.map((k) => k.name));
  for (const [kw, n] of tally(all, (t) => t.keywords.filter((k) => navidenas.has(k))))
    console.log(`  ${String(n).padStart(4)}  ${kw}`);

  const soloUna = all.filter(
    (t) => t.keywords.filter((k) => navidenas.has(k)).length === 1,
  ).length;
  console.log(`\n  ${soloUna} títulos (${Math.round((soloUna / all.length) * 100)}%) tienen UNA sola keyword navideña`);
  console.log("  → señal débil: es donde se concentran los falsos positivos");

  // ── Listados ──────────────────────────────────────────────────────────────
  if (!onlyTv) {
    console.log(`\n\n═══ PELÍCULAS — top ${limit} por popularidad ═══\n`);
    movies.slice(0, limit).forEach((t) => console.log(line(t)));
  }
  if (!onlyMovie) {
    console.log(`\n\n═══ SERIES — top ${limit} por popularidad ═══\n`);
    shows.slice(0, limit).forEach((t) => console.log(line(t)));
  }
}

main().catch((err) => {
  console.error("Falló la inspección:", err);
  process.exit(1);
});
