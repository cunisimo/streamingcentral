#!/usr/bin/env node
// Corre UNA VEZ el reservado 2 de E1.1 (scripts/comunidad/banco-reservado-2/,
// SELLO.md) y escribe el informe por caso y por categoría.
//
// Uso: node scripts/comunidad/correr-reservado-2.mjs [ruta-del-informe]
//
// - Verifica los dos SHA-256 sellados; si no coinciden, no corre.
// - Valida forma y tamaños de la especificación con el validador de E1.1: un
//   banco inválido es NO EVALUABLE y no se informa como aprobado.
// - Se niega a correr si el informe ya existe.
// - Sale con 1 si algún criterio no se cumple o no es evaluable; el informe
//   se escribe igual. Sin red ni base.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { evaluarBanco } from "../../lib/comunidad/reglas/banco/evaluar.ts";
import { VERSION_REGLAS } from "../../lib/comunidad/reglas/version.ts";

const DIR = join(process.cwd(), "scripts/comunidad/banco-reservado-2");
const SELLOS = {
  "reservado.json": "eb26ad248ac99681ae6956defd2ad8e3135435f2953252f35f534f89bbbe9128",
  "reservado-sensible.json": "7af65177cb827cb1aab5544c5a9cb6cbad78a262f4b1b960f20cadf8889cecfa",
};
const INFORME = process.argv[2] ?? join(process.cwd(), "docs/medidas/2026-10-22-e11-banco-reservado-2.md");

const origen = new Map();
const casos = [];
for (const [archivo, sello] of Object.entries(SELLOS)) {
  const contenido = readFileSync(join(DIR, archivo), "utf8").replace(/\r\n/g, "\n");
  const hash = createHash("sha256").update(contenido, "utf8").digest("hex");
  if (hash !== sello) {
    console.error(`${archivo} no coincide con el sello.\n  esperado ${sello}\n  obtenido ${hash}`);
    process.exit(2);
  }
  for (const c of JSON.parse(contenido).casos) { casos.push(c); origen.set(c.id, archivo); }
}
if (existsSync(INFORME)) {
  console.error(`El informe ya existe (${INFORME}): el reservado se corre una sola vez.`);
  process.exit(2);
}

// Tamaños de ESPECIFICACION.md.
const informe = evaluarBanco(casos, { legitimasResena: 150, abusoResena: 150, ofuscadas: 1, claros: 1, nombresLegitimos: 30 });
const celda = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
const sensible = (id) => origen.get(id) === "reservado-sensible.json";

const lineas = [
  "# E1.1 — Resultado del reservado 2",
  "",
  `Generado por \`scripts/comunidad/correr-reservado-2.mjs\` el ${new Date().toISOString()}.`,
  `Reglas \`${VERSION_REGLAS}\`. Archivos verificados contra \`SELLO.md\`.`,
  "",
  "**Qué mide:** reglas contra casos sintéticos. **No** mide eficacia contra",
  "abuso real. Las categorías `odio`, `amenaza` y `datos_personales` (marcadas",
  "*sensible*) las escribió quien ajusta las reglas, sobre reglas que E1.1 no",
  "modificó: **no son independientes**.",
  "",
  `**Evaluable:** ${informe.evaluable ? "sí" : "**NO**"}`,
  ...(informe.problemas.length ? ["", "Problemas:", ...informe.problemas.map((p) => `- ${p}`)] : []),
  "",
  "## Criterios (revisión §3.6, sin rebajar)",
  "",
  "| Criterio | Descripción | Valor | Estado |",
  "|---|---|---|---|",
  ...informe.criterios.map((c) => `| ${c.id} | ${c.descripcion} | ${c.valor} | ${c.estado === "cumple" ? "cumple" : `**${c.estado}**`} |`),
  "",
  "## Por categoría",
  "",
  "| Tipo / grupo / categoría | Casos | Resultado esperado | Detectados | Errores |",
  "|---|---|---|---|---|",
  ...informe.porCategoria.map((c) => `| ${c.clave} | ${c.total} | ${c.coinciden} | ${c.detectados} | ${c.errores} |`),
  "",
  "## Por caso",
  "",
  "| Id | Origen | Esperado | Obtenido | Reglas disparadas | Coincide |",
  "|---|---|---|---|---|---|",
  ...informe.resultados.map((r) =>
    `| ${r.caso.id} | ${sensible(r.caso.id) ? "sensible" : "agente"} | ${r.caso.esperado} | ${r.decision.resultado} | ${celda(r.decision.disparadas.map((d) => `${d.regla}@${d.version}`).join(", ") || "—")} | ${r.coincide ? "sí" : "**no**"} |`),
  "",
];
writeFileSync(INFORME, lineas.join("\n"), "utf8");

console.log(`Evaluable: ${informe.evaluable}`);
for (const p of informe.problemas) console.log(`  problema: ${p}`);
for (const c of informe.criterios) console.log(`${c.id} ${c.estado.padEnd(12)} ${c.descripcion}: ${c.valor}`);
const distintos = informe.resultados.filter((r) => !r.coincide);
console.log(`\nCasos con resultado distinto del esperado: ${distintos.length}`);
for (const r of distintos) console.log(`  ${r.caso.id} [${sensible(r.caso.id) ? "sensible" : "agente"}] ${r.caso.categoria}: esperado ${r.caso.esperado}, obtenido ${r.decision.resultado}`);
console.log(`\nInforme: ${INFORME}`);
process.exit(informe.evaluable && informe.criterios.every((c) => c.cumple) ? 0 : 1);
