#!/usr/bin/env node
/**
 * Proyección de los tres escenarios nuevos (corta / larga / chicos),
 * calculada sobre los JSON locales antes de cargar a Supabase.
 *
 * Uso:
 *   node scripts/preview-escenarios.mjs
 *   node scripts/preview-escenarios.mjs --corte 100
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const i = args.indexOf("--corte");
const CORTE = i !== -1 ? Number(args[i + 1]) : 110;

async function leer(p, fallback = null) {
  try {
    return JSON.parse(await readFile(resolve(p), "utf8"));
  } catch {
    return fallback;
  }
}

async function main() {
  const pool = await leer("data/pool-ruleta.json");
  const copy = await leer("data/copy-ruleta.json");
  const ctx = await leer("data/contexto-ruleta.json", { rows: [] });

  const textos = new Map((copy.rows ?? []).filter((r) => r.conoce).map((r) => [r.tmdb_id, r]));
  const requiereCtx = new Set(
    (ctx.rows ?? []).filter((r) => r.requiere_contexto).map((r) => r.tmdb_id),
  );

  const titulos = pool.titles ?? [];

  // Servible = tiene razón, tiene advertencia, y no pide haber visto otra antes.
  const servibles = titulos.filter((t) => {
    const c = textos.get(t.tmdb_id);
    return c?.razon && c?.advertencia && !requiereCtx.has(t.tmdb_id);
  });

  const corta = servibles.filter((t) => !t.apto_chicos && (t.runtime ?? 999) < CORTE);
  const larga = servibles.filter((t) => !t.apto_chicos && (t.runtime ?? 0) >= CORTE);
  const chicos = servibles.filter((t) => t.apto_chicos);

  console.log(`\n═══ Proyección · corte en ${CORTE} min ═══\n`);
  console.log(`  pool completo        : ${titulos.length}`);
  console.log(`  con razón            : ${textos.size}`);
  console.log(`  con razón + PERO     : ${[...textos.values()].filter((c) => c.advertencia).length}`);
  console.log(`  servibles            : ${servibles.length}  (menos los que piden contexto)`);

  const cubre = (lista, plats) => {
    const s = new Set(plats);
    return lista.filter((t) => t.providers.some((p) => s.has(p))).length;
  };
  const dos = ["Netflix", "Disney Plus"];
  const cuatro = [...dos, "MovistarTV", "Amazon Prime Video"];

  console.log(`\n── Por escenario ──`);
  console.log(`                        total   Netflix+Disney   +Movistar+Prime`);
  for (const [nombre, lista] of [
    ["Tengo poco tiempo", corta],
    ["Tengo toda la noche", larga],
    ["Con chicos", chicos],
  ]) {
    console.log(
      `  ${nombre.padEnd(20)} ${String(lista.length).padStart(5)}` +
        `${String(cubre(lista, dos)).padStart(16)}` +
        `${String(cubre(lista, cuatro)).padStart(18)}`,
    );
  }

  if (requiereCtx.size === 0) {
    console.log(`\n  ! Sin data/contexto-ruleta.json: no se descuentan las secuelas`);
    console.log(`    que piden haber visto otras. Los números están inflados.`);
  } else {
    const sinClasificar = servibles.filter(
      (t) => !(ctx.rows ?? []).some((r) => r.tmdb_id === t.tmdb_id),
    ).length;
    console.log(`\n  Nota: ${requiereCtx.size} títulos excluidos por requerir contexto previo.`);
    console.log(`  Los títulos generados después de la última corrida de`);
    console.log(`  classify-context todavía no fueron evaluados.`);
  }

  console.log("");
}

main().catch((err) => {
  console.error("Falló:", err);
  process.exit(1);
});
