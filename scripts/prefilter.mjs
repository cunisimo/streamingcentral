#!/usr/bin/env node
/**
 * Prefiltro — descartes que NO requieren criterio, sólo reglas.
 *
 * Se aplica antes de clasificar para no gastar cuota en candidatos que
 * igual se caerían en la Fase 4. Imprime el embudo completo para que
 * puedas calibrar min_vote_count y max_candidatos.
 *
 * Uso:
 *   node scripts/prefilter.mjs --chip magica-navidad
 *   node scripts/prefilter.mjs --chip magica-navidad --min-votes 100
 *
 * Entrada: chips/<slug>.json  +  data/pool-<slug>.json
 * Salida:  data/candidatos-<slug>.json
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);

/** @param {string} flag @returns {string|null} */
const arg = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 ? (args[i + 1] ?? null) : null;
};

const slug = arg("--chip");
if (!slug) {
  console.error("Uso: node scripts/prefilter.mjs --chip <slug>");
  process.exit(1);
}

const overrideVotes = arg("--min-votes") ? Number(arg("--min-votes")) : null;
const overrideMax = arg("--max") ? Number(arg("--max")) : null;

const CONFIG_PATH = resolve(`chips/${slug}.json`);
const POOL_PATH = resolve(`data/pool-${slug}.json`);
const OUTPUT_PATH = resolve(`data/candidatos-${slug}.json`);

/** @param {string} label @param {number} n @param {number} prev */
function paso(label, n, prev) {
  const perdidos = prev - n;
  const nota = perdidos > 0 ? `  (−${perdidos})` : "";
  console.log(`  ${String(n).padStart(4)}  ${label}${nota}`);
  return n;
}

async function main() {
  let config;
  try {
    config = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
  } catch (err) {
    console.error(`No pude leer ${CONFIG_PATH}: ${err.message}`);
    process.exit(1);
  }

  let pool;
  try {
    pool = JSON.parse(await readFile(POOL_PATH, "utf8"));
  } catch (err) {
    console.error(`No pude leer ${POOL_PATH}: ${err.message}`);
    console.error("  ¿Renombraste data/pool-navidad.json a data/pool-magica-navidad.json?");
    process.exit(1);
  }

  const pf = config.prefiltro ?? {};
  const mediaTypes = pf.media_types ?? ["movie"];
  const excluidos = (pf.generos_excluidos ?? []).map((g) => g.toLowerCase());
  const minVotes = overrideVotes ?? pf.min_vote_count ?? 0;
  const maxCand = overrideMax ?? pf.max_candidatos ?? Infinity;

  const todos = pool.titles ?? [];

  console.log(`\n═══ PREFILTRO · ${config.nombre ?? slug} ═══\n`);
  console.log("── Embudo ──");

  let n = paso("en el pool", todos.length, todos.length);

  let actual = todos.filter((t) => mediaTypes.includes(t.media_type));
  n = paso(`media_type ∈ [${mediaTypes.join(", ")}]`, actual.length, n);

  actual = actual.filter(
    (t) => !t.genres.some((g) => excluidos.includes(g.toLowerCase())),
  );
  n = paso(`sin géneros [${pf.generos_excluidos?.join(", ") || "—"}]`, actual.length, n);

  actual = actual.filter((t) => (t.vote_count ?? 0) >= minVotes);
  n = paso(`vote_count ≥ ${minVotes}`, actual.length, n);

  // El orden decide qué entra cuando hay más candidatos que cupo.
  // vote_count como proxy de "lo suficientemente conocida para importar".
  actual.sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0));

  const candidatos = actual.slice(0, maxCand);
  paso(`tope de ${maxCand === Infinity ? "—" : maxCand}`, candidatos.length, n);

  // ── Diagnóstico para calibrar ──────────────────────────────────────────────
  console.log("\n── Cuántos quedarían con otros pisos de votos ──");
  for (const piso of [0, 25, 50, 100, 250, 500, 1000]) {
    const cuantos = todos
      .filter((t) => mediaTypes.includes(t.media_type))
      .filter((t) => !t.genres.some((g) => excluidos.includes(g.toLowerCase())))
      .filter((t) => (t.vote_count ?? 0) >= piso).length;
    const marca = piso === minVotes ? "  ← actual" : "";
    console.log(`  ≥ ${String(piso).padStart(4)} votos : ${String(cuantos).padStart(4)}${marca}`);
  }

  if (candidatos.length > 0) {
    const decadas = new Map();
    for (const t of candidatos) {
      if (!t.year) continue;
      const d = `${Math.floor(t.year / 10) * 10}s`;
      decadas.set(d, (decadas.get(d) ?? 0) + 1);
    }
    console.log("\n── Décadas de los candidatos ──");
    for (const [d, c] of [...decadas].sort()) console.log(`  ${d}  ${c}`);

    console.log("\n── Los 10 con menos votos que igual entran ──");
    for (const t of candidatos.slice(-10)) {
      console.log(`  ${String(t.vote_count).padStart(5)} votos · ${t.year} · ${t.title}`);
    }
  }

  const objetivo = config.objetivo_aprobados ?? 100;
  const tasaEstimada = 0.5; // supuesto conservador hasta tener datos reales
  const esperados = Math.round(candidatos.length * tasaEstimada);
  console.log(`\n── Proyección ──`);
  console.log(`  objetivo del chip     : ${objetivo} aprobados`);
  console.log(`  candidatos a clasificar: ${candidatos.length}`);
  console.log(`  aprobados si pasa ~50%: ~${esperados}`);
  if (esperados < objetivo) {
    console.log(`  ! quedarías corto. Bajá --min-votes o subí --max.`);
  }

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(
    OUTPUT_PATH,
    JSON.stringify(
      {
        chip_slug: slug,
        filtered_at: new Date().toISOString(),
        prefiltro_aplicado: { mediaTypes, generos_excluidos: pf.generos_excluidos, minVotes, maxCand },
        total: candidatos.length,
        titles: candidatos,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`\n✔ ${candidatos.length} candidatos → ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error("Falló el prefiltro:", err);
  process.exit(1);
});
