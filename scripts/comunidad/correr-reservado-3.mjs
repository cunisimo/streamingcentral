#!/usr/bin/env node
// Reservado 3 de E1: medición final (scripts/comunidad/banco-reservado-3/
// PROTOCOLO.md), HÍBRIDA según ENMIENDA-1.md: parte general independiente y
// parte complementaria escrita por quien conoce las reglas.
//
// Uso:
//   node scripts/comunidad/correr-reservado-3.mjs --solo-forma [dir]
//       Valida forma, ids, largos y conteos por categoría. Imprime conteos y
//       problemas, NUNCA textos. No evalúa reglas ni necesita sello.
//   node scripts/comunidad/correr-reservado-3.mjs
//       La ejecución única. Verifica la huella del código congelado y el
//       sello (SELLO.json), se niega a correr si el informe ya existe y
//       escribe el informe (.md) y el resultado por caso (.json).
//   node scripts/comunidad/correr-reservado-3.mjs --prueba <dir> <informe.md>
//       Lo mismo que la ejecución única, sobre datos sintéticos AJENOS al
//       reservado, para probar el ejecutor. Se niega a usar el directorio
//       del reservado.
//
// Sale con 1 si algún criterio no se cumple o el banco no es evaluable, y con
// 2 si no corre (sello, huella o informe existente). Sin red ni base.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { evaluarBanco } from "../../lib/comunidad/reglas/banco/evaluar.ts";
import { VERSION_REGLAS } from "../../lib/comunidad/reglas/version.ts";

const RAIZ = process.cwd();
const DIR_OFICIAL = join(RAIZ, "scripts/comunidad/banco-reservado-3");
const INFORME_OFICIAL = join(RAIZ, "docs/medidas/2026-10-23-e1-reservado-3-resultado.md");
const ARCHIVOS = ["reservado.json", "reservado-sensible.json"];

// docs/medidas/2026-10-23-e1-reservado-3-congelamiento.md
const VERSION_CONGELADA = "2026-10-22.5";
const HUELLAS = {
  "lib/comunidad/reglas/decision.ts": "bf4373093afef7a5f659cb1cb8dc9779540af00d129d5f8fd23eb33ceea622f7",
  "lib/comunidad/reglas/listas.ts": "0748767affb4918ea713bcf8fe8b281d98715520586978f7e41eba048a53a276",
  "lib/comunidad/reglas/plegado.ts": "cc018cb412469f95ba529ca5119da18d027b6937a6c8d04fab408808b8afc47c",
  "lib/comunidad/reglas/reglas.ts": "096af5898c9c19b410a6db82fd66ef6c7791d38629038986b69910bf1c409018",
  "lib/comunidad/reglas/tipos.ts": "27c1fe8fcd99d61d95ee2e43a6133102a9a736829ccc476825b1aeedc6c91ce8",
  "lib/comunidad/reglas/version.ts": "a5e8bc56423e6975a93f634bcd8b325f4a611125d597dbd1442de9a6295acb33",
  "lib/comunidad/reglas/banco/evaluar.ts": "b8fa96977231c47a999b0d24f79a9e3c96c9ec4c0e5c23b69113cf015e70c01d",
};

// PROTOCOLO.md §3: conteo exacto por archivo / tipo / grupo / categoría /
// variante / claro / esperado.
const S = "reservado-sensible.json";
const R = "reservado.json";
const fila = (archivo, tipo, grupo, categoria, variante, claro, esperado, n) =>
  [[archivo, tipo, grupo, categoria, variante ?? "-", claro ?? "-", esperado].join("|"), n];
const LEGITIMAS = {
  "numeros.anios": 8, "numeros.duraciones": 6, "numeros.temporadas": 6, "numeros.montos": 6,
  "numeros.fechas": 6, "numeros.puntajes": 6, titulos_alfanumericos: 12, puntuacion_barras: 8,
  lunfardo: 12, insulto_personaje: 10, trama: 14, plataformas_redes: 12, correo_tecnologia: 10,
  dialogo_ficcion: 12, inversion_cripto: 8, citas: 6, negativa: 8, general: 10,
};
const ESPERADO = new Map([
  ...Object.entries(LEGITIMAS).map(([c, n]) => fila(R, "resena", "legitima", c, null, null, "publicar", n)),
  fila(R, "resena", "abuso", "contacto.telefono", "directa", true, "rechazar", 6),
  fila(R, "resena", "abuso", "contacto.telefono", "ofuscada", true, "rechazar", 22),
  fila(R, "resena", "abuso", "contacto.email", "directa", true, "rechazar", 4),
  fila(R, "resena", "abuso", "contacto.email", "ofuscada", true, "rechazar", 18),
  fila(R, "resena", "abuso", "enlace", "directa", true, "rechazar", 4),
  fila(R, "resena", "abuso", "enlace", "ofuscada", true, "rechazar", 18),
  fila(R, "resena", "abuso", "contacto.red", "directa", true, "rechazar", 4),
  fila(R, "resena", "abuso", "contacto.red", "ofuscada", true, "rechazar", 14),
  fila(R, "resena", "abuso", "contacto.indirecto", "ofuscada", false, "frenar", 8),
  fila(R, "resena", "abuso", "contacto.partido", "ofuscada", false, "frenar", 6),
  fila(R, "resena", "abuso", "perfil", "directa", false, "retener", 4),
  fila(R, "resena", "abuso", "spam", "directa", false, "retener", 12),
  fila(R, "resena", "abuso", "anomalo", "directa", false, "retener", 4),
  fila(S, "resena", "abuso", "odio", "directa", false, "retener", 8),
  fila(S, "resena", "abuso", "amenaza", "directa", false, "retener", 8),
  fila(S, "resena", "abuso", "datos_personales", "directa", false, "retener", 8),
  fila(S, "resena", "abuso", "fuera_capacidad", "directa", false, "retener", 8),
  fila(R, "nombre", "legitima", "nombre", null, null, "publicar", 30),
  fila(R, "nombre", "abuso", "contacto.telefono", "directa", true, "rechazar", 4),
  fila(R, "nombre", "abuso", "contacto.telefono", "ofuscada", true, "rechazar", 4),
  fila(R, "nombre", "abuso", "contacto.email", "directa", true, "rechazar", 3),
  fila(R, "nombre", "abuso", "contacto.email", "ofuscada", true, "rechazar", 3),
  fila(R, "nombre", "abuso", "enlace", "directa", true, "rechazar", 3),
  fila(R, "nombre", "abuso", "enlace", "ofuscada", true, "rechazar", 3),
  fila(R, "nombre", "abuso", "contacto.red", "directa", true, "rechazar", 3),
  fila(R, "nombre", "abuso", "contacto.red", "ofuscada", true, "rechazar", 3),
  fila(S, "nombre", "abuso", "odio", "directa", false, "retener", 4),
]);
// PROTOCOLO.md §6: denominadores fijados de antemano.
const REQUISITOS = { legitimasResena: 160, abusoResena: 156, ofuscadas: 99, claros: 116, nombresLegitimos: 30 };
const PREFIJOS = { [R]: /^R3-(L-\d{3}|A-\d{3}|NL-\d{2}|NA-\d{2})$/, [S]: /^R3-S-\d{3}$/ };
const CAMPOS = new Set(["id", "tipo", "grupo", "categoria", "variante", "claro", "esperado", "texto", "contexto", "alcance"]);

const sha = (t) => createHash("sha256").update(t, "utf8").digest("hex");
const lf = (t) => t.replace(/\r\n/g, "\n");
const largo = (t) => [...t.normalize("NFC")].length;

/** Lee los dos archivos; devuelve casos con su archivo de origen, o problemas. */
function leer(dir) {
  const casos = [];
  const problemas = [];
  const contenidos = {};
  for (const archivo of ARCHIVOS) {
    const ruta = join(dir, archivo);
    if (!existsSync(ruta)) { problemas.push(`falta ${archivo}`); continue; }
    contenidos[archivo] = lf(readFileSync(ruta, "utf8"));
    let json;
    try { json = JSON.parse(contenidos[archivo]); } catch (e) { problemas.push(`${archivo}: JSON inválido (${e.message})`); continue; }
    if (!Array.isArray(json?.casos)) { problemas.push(`${archivo}: sin lista "casos"`); continue; }
    for (const c of json.casos) casos.push({ archivo, c });
  }
  return { casos, problemas, contenidos };
}

/** Forma del PROTOCOLO (§3–§4), más estricta que el validador del evaluador. */
function problemasDeForma(casos) {
  const p = [];
  const conteo = new Map();
  for (const { archivo, c } of casos) {
    const id = typeof c?.id === "string" ? c.id : "(sin id)";
    if (!PREFIJOS[archivo].test(id)) p.push(`${id}: id fuera del formato de ${archivo}`);
    for (const k of Object.keys(c ?? {})) if (!CAMPOS.has(k)) p.push(`${id}: campo desconocido "${k}"`);
    if (typeof c?.texto === "string") {
      const n = largo(c.texto);
      const [min, max] = c.tipo === "nombre" ? [2, 24] : [80, 600];
      if (n < min || n > max) p.push(`${id}: largo ${n} fuera de ${min}–${max}`);
    }
    const partido = c?.categoria === "contacto.partido";
    if (partido !== (c?.contexto !== undefined)) p.push(`${id}: contexto sólo y siempre en contacto.partido`);
    if (c?.contexto?.textosRecientes) {
      const t = c.contexto.textosRecientes;
      if (!Array.isArray(t) || t.length < 1 || t.length > 3) p.push(`${id}: contexto con 1 a 3 textos`);
      else t.forEach((x, i) => { const n = typeof x === "string" ? largo(x) : -1; if (n < 80 || n > 600) p.push(`${id}: contexto ${i} largo ${n} fuera de 80–600`); });
    }
    const fuera = c?.categoria === "fuera_capacidad";
    if (fuera !== (c?.alcance === "fuera_de_capacidad")) p.push(`${id}: alcance sólo y siempre en fuera_capacidad`);
    const clave = [archivo, c?.tipo, c?.grupo, c?.categoria, c?.variante ?? "-", c?.claro ?? "-", c?.esperado].join("|");
    conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
  }
  for (const [clave, n] of ESPERADO) {
    const hay = conteo.get(clave) ?? 0;
    if (hay !== n) p.push(`conteo ${clave}: hay ${hay}, se esperan ${n}`);
  }
  for (const [clave, n] of conteo) if (!ESPERADO.has(clave)) p.push(`conteo ${clave}: ${n} casos en una combinación que el protocolo no prevé`);
  return { problemas: p, conteo };
}

function huellaDelCodigo() {
  const p = [];
  for (const [archivo, h] of Object.entries(HUELLAS)) {
    const obtenido = sha(lf(readFileSync(join(RAIZ, archivo), "utf8")));
    if (obtenido !== h) p.push(`${archivo}: huella ${obtenido}, congelada ${h}`);
  }
  if (VERSION_REGLAS !== VERSION_CONGELADA) p.push(`VERSION_REGLAS ${VERSION_REGLAS}, congelada ${VERSION_CONGELADA}`);
  return p;
}

// ---------------------------------------------------------------- modos

const args = process.argv.slice(2);

if (args[0] === "--solo-forma") {
  const dir = resolve(args[1] ?? DIR_OFICIAL);
  const { casos, problemas, contenidos } = leer(dir);
  const forma = problemasDeForma(casos);
  console.log(`Directorio: ${dir}`);
  for (const a of ARCHIVOS) if (contenidos[a]) console.log(`${a}: SHA-256 (LF) ${sha(contenidos[a])}`);
  console.log(`Casos: ${casos.length}`);
  for (const [clave, n] of [...forma.conteo].sort()) console.log(`  ${String(n).padStart(3)}  ${clave}`);
  const todos = [...problemas, ...forma.problemas];
  console.log(`Problemas: ${todos.length}`);
  for (const x of todos) console.log(`  ${x}`);
  process.exit(todos.length === 0 ? 0 : 1);
}

const prueba = args[0] === "--prueba";
const DIR = prueba ? resolve(args[1]) : DIR_OFICIAL;
const INFORME = prueba ? resolve(args[2]) : INFORME_OFICIAL;
if (prueba && (!args[1] || !args[2])) { console.error("Uso: --prueba <dir> <informe.md>"); process.exit(2); }
if (prueba && resolve(DIR) === resolve(DIR_OFICIAL)) { console.error("--prueba no puede usar el directorio del reservado."); process.exit(2); }
const RESULTADOS_JSON = INFORME.replace(/\.md$/, ".json");

const codigo = huellaDelCodigo();
if (codigo.length) { console.error("El código no es el congelado:"); for (const x of codigo) console.error(`  ${x}`); process.exit(2); }
if (existsSync(INFORME) || existsSync(RESULTADOS_JSON)) {
  console.error(`El informe ya existe (${INFORME}): el reservado se corre una sola vez.`);
  process.exit(2);
}
const selloRuta = join(DIR, "SELLO.json");
if (!existsSync(selloRuta)) { console.error(`Falta ${selloRuta}.`); process.exit(2); }
const sello = JSON.parse(readFileSync(selloRuta, "utf8"));
const { casos: conOrigen, problemas: lectura, contenidos } = leer(DIR);
for (const a of ARCHIVOS) {
  const h = contenidos[a] === undefined ? "(falta)" : sha(contenidos[a]);
  if (h !== sello[a]) { console.error(`${a} no coincide con el sello.\n  sellado  ${sello[a]}\n  obtenido ${h}`); process.exit(2); }
}

// Forma del protocolo: si falla, el banco es NO EVALUABLE y no se evalúa.
const forma = problemasDeForma(conOrigen);
const problemasForma = [...lectura, ...forma.problemas];
const casos = conOrigen.map(({ c }) => c);
const origen = new Map(conOrigen.map(({ archivo, c }) => [c.id, archivo]));
const informe = problemasForma.length
  ? { ...evaluarBanco([]), problemas: problemasForma }
  : evaluarBanco(casos, REQUISITOS);

const celda = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
const reglasDe = (r) => r.decision.disparadas.map((d) => `${d.regla}@${d.version}`).join(", ") || "—";
const fuente = (id) => (origen.get(id) === S ? "sensible" : "general");
const res = informe.resultados;
const fuera = res.filter((r) => r.caso.alcance === "fuera_de_capacidad");
const legitimasFrenadas = res.filter((r) => r.caso.grupo === "legitima" && r.detectado);
const abusoSinDetectar = res.filter((r) => r.caso.grupo === "abuso" && !r.detectado && r.caso.alcance !== "fuera_de_capacidad");
const distintos = res.filter((r) => !r.coincide);
// ENMIENDA-1.md: resultados por parte (general / complementaria) y cobertura
// de las categorías sensibles. Una parte sin casos para un criterio dice
// "sin casos", nunca 0 %.
const PARTES = [["general", R], ["complementaria", S]];
const fraccion = (n, d) => (d === 0 ? "sin casos" : `${n}/${d} (${((100 * n) / d).toFixed(1)} %)`);
const rechazada = (r) => r.decision.resultado === "rechazo_contenido" || r.decision.resultado === "rechazo_formato";
function cuentasDeParte(rs) {
  const claros = rs.filter((r) => r.caso.grupo === "abuso" && r.caso.claro);
  const ofuscadas = rs.filter((r) => r.caso.grupo === "abuso" && r.caso.variante === "ofuscada");
  const legitimas = rs.filter((r) => r.caso.grupo === "legitima" && r.caso.tipo === "resena");
  const abusoResena = rs.filter((r) => r.caso.grupo === "abuso" && r.caso.tipo === "resena");
  return [
    ["Casos", String(rs.length)],
    ["Reseñas de abuso", String(abusoResena.length)],
    ["C0 errores", fraccion(rs.filter((r) => r.error).length, rs.length)],
    ["C1 claros sin detectar", fraccion(claros.filter((r) => !r.detectado).length, claros.length)],
    ["C2 ofuscadas detectadas", fraccion(ofuscadas.filter((r) => r.detectado).length, ofuscadas.length)],
    ["C3 legítimas rechazadas", fraccion(legitimas.filter(rechazada).length, legitimas.length)],
    ["C4 legítimas retenidas", fraccion(legitimas.filter((r) => r.decision.resultado === "retener").length, legitimas.length)],
    ["Abuso detectado (todas las categorías)", fraccion(rs.filter((r) => r.caso.grupo === "abuso" && r.detectado).length, rs.filter((r) => r.caso.grupo === "abuso").length)],
    ["Distintos de la etiqueta", fraccion(rs.filter((r) => !r.coincide).length, rs.length)],
  ];
}
const porParte = PARTES.map(([nombre, archivo]) => [nombre, cuentasDeParte(res.filter((r) => origen.get(r.caso.id) === archivo))]);
const SENSIBLES = ["odio", "amenaza", "datos_personales"];
const cobertura = SENSIBLES.flatMap((cat) => ["resena", "nombre"].map((tipo) => {
  const rs = res.filter((r) => r.caso.categoria === cat && r.caso.tipo === tipo && r.caso.grupo === "abuso");
  return { cat, tipo, total: rs.length, frenados: rs.filter((r) => r.detectado).length, rechazos: rs.filter(rechazada).length, retenidos: rs.filter((r) => r.decision.resultado === "retener").length, errores: rs.filter((r) => r.error).length };
}).filter((x) => x.total > 0));

const tablaCasos = (rs) => [
  "| Id | Archivo | Tipo | Categoría | Variante | Claro | Esperado | Obtenido | Reglas | Coincide |",
  "|---|---|---|---|---|---|---|---|---|---|",
  ...rs.map((r) => `| ${r.caso.id} | ${fuente(r.caso.id)} | ${r.caso.tipo} | ${r.caso.categoria} | ${r.caso.variante ?? "—"} | ${r.caso.claro ?? "—"} | ${r.caso.esperado} | ${r.decision.resultado} | ${celda(reglasDe(r))} | ${r.coincide ? "sí" : "**no**"} |`),
];

const lineas = [
  `# E1: resultado del reservado 3${prueba ? " (PRUEBA DEL EJECUTOR, datos ajenos)" : ""}`,
  "",
  `Generado por \`scripts/comunidad/correr-reservado-3.mjs\` el ${new Date().toISOString()}.`,
  `Reglas \`${VERSION_REGLAS}\`; huella del código verificada contra el congelamiento; archivos verificados contra \`SELLO.json\`.`,
  "",
  "**Qué mide:** reglas contra casos sintéticos escritos según el protocolo. **No** mide",
  "eficacia contra abuso real ni garantiza seguridad.",
  "",
  `**Evaluable:** ${informe.evaluable ? "sí" : "**NO**"}`,
  ...(informe.problemas.length ? ["", "Problemas:", ...informe.problemas.map((p) => `- ${p}`)] : []),
  "",
  "## Criterios (vigentes, sin cambios)",
  "",
  "| Criterio | Descripción | Valor | Estado |",
  "|---|---|---|---|",
  ...informe.criterios.map((c) => `| ${c.id} | ${c.descripcion} | ${c.valor} | ${c.estado === "cumple" ? "cumple" : `**${c.estado}**`} |`),
  "",
  "> **Advertencia (ENMIENDA-1.md):** C0–C4 no exigen un mínimo de detección para odio,",
  "> amenazas ni datos personales. Cumplirlos no certifica por sí solo esa detección. La",
  "> parte complementaria la escribió un autor que conoce las reglas: **no es independiente**",
  "> y no es evidencia de generalización.",
  "",
  "## Resultados por parte",
  "",
  "| Cuenta | General (`reservado.json`, independiente) | Complementaria (`reservado-sensible.json`, no independiente) |",
  "|---|---|---|",
  ...porParte[0][1].map(([k, v], i) => `| ${k} | ${v} | ${porParte[1][1][i][1]} |`),
  "",
  "## Cobertura de las categorías sensibles (sin umbral)",
  "",
  "| Categoría | Tipo | Casos | Frenados | Rechazados | Retenidos | Errores |",
  "|---|---|---|---|---|---|---|",
  ...cobertura.map((x) => `| ${x.cat} | ${x.tipo} | ${x.total} | ${x.frenados} | ${x.rechazos} | ${x.retenidos} | ${x.errores} |`),
  "",
  `## Errores (${res.filter((r) => r.error).length})`,
  "",
  ...tablaCasos(res.filter((r) => r.error)),
  "",
  `## Fuera de la capacidad declarada (informativo, fuera de C1 y C2)`,
  "",
  `${fuera.filter((r) => r.detectado).length} de ${fuera.length} frenados.`,
  "",
  ...tablaCasos(fuera),
  "",
  `## Legítimas frenadas (${legitimasFrenadas.length})`,
  "",
  ...tablaCasos(legitimasFrenadas),
  "",
  `## Abuso sin detectar, dentro de la capacidad (${abusoSinDetectar.length})`,
  "",
  ...tablaCasos(abusoSinDetectar),
  "",
  `## Resultado distinto de la etiqueta (${distintos.length})`,
  "",
  ...tablaCasos(distintos),
  "",
  "## Por categoría",
  "",
  "| Tipo / grupo / categoría | Casos | Coinciden | Detectados | Errores |",
  "|---|---|---|---|---|",
  ...informe.porCategoria.map((c) => `| ${c.clave} | ${c.total} | ${c.coinciden} | ${c.detectados} | ${c.errores} |`),
  "",
  "## Por caso",
  "",
  ...tablaCasos(res),
  "",
];
writeFileSync(INFORME, lineas.join("\n"), "utf8");
writeFileSync(RESULTADOS_JSON, JSON.stringify({
  versionReglas: VERSION_REGLAS, sello, evaluable: informe.evaluable, problemas: informe.problemas,
  criterios: informe.criterios, porCategoria: informe.porCategoria,
  porParte: Object.fromEntries(porParte.map(([n, c]) => [n, Object.fromEntries(c)])), coberturaSensible: cobertura,
  resultados: res.map((r) => ({ id: r.caso.id, archivo: origen.get(r.caso.id), esperado: r.caso.esperado, decision: r.decision, detectado: r.detectado, error: r.error, coincide: r.coincide })),
}, null, 2) + "\n", "utf8");

console.log(`Evaluable: ${informe.evaluable}`);
for (const p of informe.problemas) console.log(`  problema: ${p}`);
for (const c of informe.criterios) console.log(`${c.id} ${c.estado.padEnd(12)} ${c.descripcion}: ${c.valor}`);
for (const [n, c] of porParte) console.log(`Parte ${n}: ${c.map(([k, v]) => `${k} ${v}`).join("; ")}`);
for (const x of cobertura) console.log(`Sensible ${x.cat}/${x.tipo}: ${x.frenados}/${x.total} frenados (${x.rechazos} rechazados, ${x.retenidos} retenidos, ${x.errores} errores)`);
console.log(`Fuera de capacidad frenados: ${fuera.filter((r) => r.detectado).length}/${fuera.length}`);
console.log(`Legítimas frenadas: ${legitimasFrenadas.length}; abuso sin detectar (en capacidad): ${abusoSinDetectar.length}; distintos de la etiqueta: ${distintos.length}`);
console.log(`Informe: ${INFORME}\nPor caso: ${RESULTADOS_JSON}`);
process.exit(informe.evaluable && informe.criterios.every((c) => c.cumple) ? 0 : 1);
