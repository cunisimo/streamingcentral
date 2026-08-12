#!/usr/bin/env node
/**
 * Lectura de resultados de clasificación — insumo de la revisión humana.
 *
 * Uso:
 *   node scripts/review.mjs --chip magica-navidad              # todo
 *   node scripts/review.mjs --chip magica-navidad --solo si
 *   node scripts/review.mjs --chip magica-navidad --solo no
 *   node scripts/review.mjs --chip magica-navidad --solo revisar
 *   node scripts/review.mjs --chip magica-navidad --n 20
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const arg = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 ? (args[i + 1] ?? null) : null;
};

const slug = arg("--chip");
if (!slug) {
  console.error("Uso: node scripts/review.mjs --chip <slug> [--solo si|no|revisar] [--n N]");
  process.exit(1);
}

const solo = arg("--solo");
const n = arg("--n") ? Number(arg("--n")) : Infinity;

const PATH = resolve(`data/clasificado-${slug}.json`);

/** @param {object} t */
function linea(t) {
  const marca = t.califica === true ? "SÍ" : t.califica === false ? "no" : "??";
  const conf = { alta: "  ", media: " ~", baja: " ?" }[t.confianza] ?? " !";
  return (
    `  ${marca}${conf} ${String(t.year ?? "????")} · ${String(t.vote_count).padStart(6)}v · ` +
    `${t.title}\n         ${t.motivo || "(sin motivo)"}`
  );
}

async function main() {
  let data;
  try {
    data = JSON.parse(await readFile(PATH, "utf8"));
  } catch (err) {
    console.error(`No pude leer ${PATH}: ${err.message}`);
    process.exit(1);
  }

  const todos = data.titles ?? [];
  const conVeredicto = todos.filter((t) => t.califica !== null);

  let vista = todos;
  let etiqueta = "TODOS";
  if (solo === "si") {
    vista = todos.filter((t) => t.califica === true);
    etiqueta = "APROBADOS";
  } else if (solo === "no") {
    vista = todos.filter((t) => t.califica === false);
    etiqueta = "RECHAZADOS";
  } else if (solo === "revisar") {
    vista = todos.filter((t) => t.califica === null || t.confianza !== "alta");
    etiqueta = "A REVISAR (confianza no-alta o sin veredicto)";
  }

  console.log(`\n═══ ${etiqueta} · ${slug} ═══`);
  console.log(`  ${vista.length} de ${todos.length} clasificados`);
  console.log(`  leyenda: SÍ/no/?? · sin marca = confianza alta, ~ = media, ? = baja\n`);

  for (const t of vista.slice(0, n)) console.log(linea(t));

  if (vista.length > n) console.log(`\n  … y ${vista.length - n} más (subí --n)`);

  if (!solo) {
    const aprob = conVeredicto.filter((t) => t.califica).length;
    console.log(`\n── Resumen ──`);
    console.log(`  aprobados : ${aprob}`);
    console.log(`  rechazados: ${conVeredicto.length - aprob}`);
    console.log(`  a revisar : ${todos.filter((t) => t.confianza !== "alta").length}`);
  }
}

main().catch((err) => {
  console.error("Falló la lectura:", err);
  process.exit(1);
});
