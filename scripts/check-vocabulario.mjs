#!/usr/bin/env node
/**
 * Busca vocabulario de España en los textos generados.
 *
 * El pool se extrajo con language=es-ES, así que el prompt recibe títulos
 * traducidos en España y el modelo a veces arrastra ese vocabulario.
 *
 * Uso:
 *   node scripts/check-vocabulario.mjs
 *   node scripts/check-vocabulario.mjs --archivo data/copy-ruleta.json
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const i = args.indexOf("--archivo");
const PATH = resolve(i !== -1 ? args[i + 1] : "data/copy-ruleta.json");

// Palabras claramente peninsulares. Se buscan como palabra entera para no
// pescar falsos positivos (ej. "vale" dentro de "valentía").
const PENINSULARES = [
  "gamberro", "gamberra", "gamberros",
  "chaval", "chavala", "chavales",
  "guay", "molar", "mola", "molaba",
  "currar", "curro", "flipar", "flipante", "flipa",
  "cutre", "majo", "maja", "follón", "chulo",
  "gilipollas", "capullo", "tontería",
  "coche", "coches", "ordenador", "móvil",
  "zumo", "patata", "patatas",
  "vosotros", "vuestro", "vuestra",
  "aparcar", "conducir", "cotilleo", "pijo", "pija",
  "espabilar", "cabrear", "mosquear", "petardo",
];

// Límites de palabra que entienden acentos: \b de JavaScript no los entiende
// ("móvil" o "ñ" rompían el corte).
const L = String.raw`(?<![\p{L}])`;
const R = String.raw`(?![\p{L}])`;
const rxLista = new RegExp(`${L}(${PENINSULARES.join("|")})${R}`, "giu");
// "vale" sólo como interjección (por "dale"): seguido de puntuación o al final.
// "vale la pena", "vale como", "vale para" son rioplatenses.
const rxVale = new RegExp(`${L}vale(?=\\s*[,.;:!?]|\\s*$)`, "giu");
// Pronombre "os" suelto (vosotros).
const rxOs = new RegExp(`${L}os${R}`, "giu");
// Conjugaciones en -áis / -éis, salvo los números terminados en "seis"
// (dieciséis, veintiséis), que llevan tilde y no son verbos.
const rxAis = new RegExp(`${L}\\p{L}+(?:áis|éis)${R}`, "giu");

// Plurales de sustantivos en -ái que no son conjugaciones.
const NO_VERBOS = new Set(["samuráis", "bonsáis", "paipáis"]);

/** Palabras peninsulares encontradas en un texto, en minúscula y sin repetir. */
export function buscarVocabulario(texto) {
  const t = texto ?? "";
  const encontrados = [
    ...[...t.matchAll(rxLista)].map((m) => m[0]),
    ...[...t.matchAll(rxVale)].map((m) => m[0]),
    ...[...t.matchAll(rxOs)].map((m) => m[0]),
    ...[...t.matchAll(rxAis)].map((m) => m[0]).filter((w) => !/s[eé]is$/iu.test(w) && !NO_VERBOS.has(w.toLowerCase())),
  ];
  return [...new Set(encontrados.map((w) => w.toLowerCase()))];
}

async function main() {
  const data = JSON.parse(await readFile(PATH, "utf8"));
  const rows = data.rows ?? [];

  const hallazgos = [];
  const conteo = new Map();

  for (const r of rows) {
    for (const campo of ["razon", "advertencia"]) {
      const texto = r[campo];
      if (!texto) continue;
      const m = buscarVocabulario(texto);
      if (!m.length) continue;
      for (const palabra of m) {
        const k = palabra.toLowerCase();
        conteo.set(k, (conteo.get(k) ?? 0) + 1);
      }
      hallazgos.push({ tmdb_id: r.tmdb_id, title: r.title, campo, palabras: [...new Set(m)], texto });
    }
  }

  console.log(`\n── ${PATH} ──`);
  console.log(`  textos revisados: ${rows.length}`);
  console.log(`  con vocabulario de España: ${hallazgos.length}`);

  if (conteo.size) {
    console.log(`\n── Palabras encontradas ──`);
    for (const [p, n] of [...conteo].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(3)}  ${p}`);
    }

    console.log(`\n── Casos ──`);
    for (const h of hallazgos.slice(0, 25)) {
      console.log(`\n  ${h.title}  [${h.campo}: ${h.palabras.join(", ")}]`);
      console.log(`    ${h.texto}`);
    }
    if (hallazgos.length > 25) console.log(`\n  … y ${hallazgos.length - 25} más`);

    console.log(`\n── Para regenerar sólo estos ──`);
    console.log(`  ids: ${[...new Set(hallazgos.map((h) => h.tmdb_id))].join(",")}`);
  } else {
    console.log("\n  Nada que corregir.");
  }
}

// Sólo corre como programa: el test importa buscarVocabulario.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error("Falló:", err);
    process.exit(1);
  });
}
