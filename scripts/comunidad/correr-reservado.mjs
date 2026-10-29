#!/usr/bin/env node
// Corre UNA VEZ el conjunto reservado de E1 contra las reglas y escribe el
// informe por caso y por categoría (plan de reseñas, E1; SELLO.md).
//
// Uso: node scripts/comunidad/correr-reservado.mjs [ruta-del-informe]
//
// - Verifica el SHA-256 sellado antes de evaluar y se niega a correr si no
//   coincide: el conjunto no se toca para hacerlo pasar.
// - Se niega a correr si el informe ya existe: es la evaluación de cierre, no
//   una herramienta para iterar. Las reglas se ajustan con el banco de
//   desarrollo (`npm test`).
// - Sale con código 1 si algún criterio no se cumple; el informe se escribe
//   igual.
// Sin red ni base: sólo lee el archivo y llama al módulo puro.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { evaluarBanco } from "../../lib/comunidad/reglas/banco/evaluar.ts";
import { VERSION_REGLAS } from "../../lib/comunidad/reglas/version.ts";

const SELLO = "9975c60c3c0109790cb3e019d13fb85e1852ef31d3996211cfeb2d2c62c4ec79";
const ARCHIVO = join(process.cwd(), "scripts/comunidad/banco-reservado/reservado.json");
const INFORME = process.argv[2] ?? join(process.cwd(), "docs/medidas/2026-10-22-e1-banco-reservado.md");

const contenido = readFileSync(ARCHIVO, "utf8").replace(/\r\n/g, "\n");
const hash = createHash("sha256").update(contenido, "utf8").digest("hex");
if (hash !== SELLO) {
  console.error(`El reservado no coincide con el sello.\n  esperado ${SELLO}\n  obtenido ${hash}`);
  process.exit(2);
}
if (existsSync(INFORME)) {
  console.error(`El informe ya existe (${INFORME}): el reservado se corre una sola vez.`);
  process.exit(2);
}

const { casos } = JSON.parse(contenido);
const informe = evaluarBanco(casos);
const celda = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");

const lineas = [
  "# E1 — Resultado del conjunto reservado",
  "",
  `Generado por \`scripts/comunidad/correr-reservado.mjs\` el ${new Date().toISOString()}.`,
  `Reglas \`${VERSION_REGLAS}\`. Reservado con SHA-256 (LF) \`${hash}\`, verificado contra el sello.`,
  "",
  "**Qué mide:** reglas contra casos sintéticos conocidos. **No** mide eficacia",
  "contra abuso real ni contra variantes que el conjunto no tiene.",
  "",
  "## Criterios (revisión §3.6)",
  "",
  "| Criterio | Descripción | Valor | Cumple |",
  "|---|---|---|---|",
  ...informe.criterios.map((c) => `| ${c.id} | ${c.descripcion} | ${c.valor} | ${c.cumple ? "sí" : "**NO**"} |`),
  "",
  "## Por categoría",
  "",
  "| Tipo / grupo / categoría | Casos | Resultado esperado | Frenados |",
  "|---|---|---|---|",
  ...informe.porCategoria.map((c) => `| ${c.clave} | ${c.total} | ${c.coinciden} | ${c.frenados} |`),
  "",
  "## Por caso",
  "",
  "| Id | Esperado | Obtenido | Reglas disparadas | Coincide |",
  "|---|---|---|---|---|",
  ...informe.resultados.map((r) =>
    `| ${r.caso.id} | ${r.caso.esperado} | ${r.decision.resultado} | ${celda(r.decision.disparadas.map((d) => `${d.regla}@${d.version}`).join(", ") || "—")} | ${r.coincide ? "sí" : "**no**"} |`),
  "",
];
writeFileSync(INFORME, lineas.join("\n"), "utf8");

for (const c of informe.criterios) console.log(`${c.id} ${c.cumple ? "cumple   " : "NO cumple"} ${c.descripcion}: ${c.valor}`);
const distintos = informe.resultados.filter((r) => !r.coincide);
console.log(`\nCasos con resultado distinto del esperado: ${distintos.length}`);
for (const r of distintos) console.log(`  ${r.caso.id}: esperado ${r.caso.esperado}, obtenido ${r.decision.resultado}`);
console.log(`\nInforme: ${INFORME}`);
process.exit(informe.criterios.every((c) => c.cumple) ? 0 : 1);
