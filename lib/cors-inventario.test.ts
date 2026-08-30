// El inventario de rutas: quién integra CORS, quién está excluida a propósito y
// quién todavía no está clasificada.
//
// ⚠️ Comprobación sobre el TEXTO de los archivos, no sobre la app montada: este
// proyecto no tiene arnés de DOM (misma nota que `lib/legal.test.ts`). Fija la
// regresión real: que aparezca una ruta nueva y nadie decida a qué grupo va.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();
const API = path.join(RAIZ, "app", "api");

/** Todas las `route.ts` bajo `app/api`, con ruta relativa y barras normales. */
export function rutasDeApi(dir = API): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { out.push(...rutasDeApi(full)); continue; }
    if (e.name === "route.ts") out.push(path.relative(RAIZ, full).split(path.sep).join("/"));
  }
  return out.sort();
}

/** ¿El archivo integra el contrato de CORS? */
export function integraCors(src: string): boolean {
  return /export const (GET|POST) = conCors\(/.test(src)
      && /export const OPTIONS = opcionesCors\(/.test(src);
}

/**
 * ¿El `OPTIONS` de esta ruta ejecutaría el handler real?
 *
 * El contrato es que `OPTIONS` salga de `opcionesCors`, que NO recibe el
 * handler. Cualquier otra forma —un `export async function OPTIONS` propio, o
 * un `conCors` en el OPTIONS— podría llegar a la lógica de la ruta, y en
 * `/api/home` eso son hasta 60 s y cientos de comandos de Upstash por preflight.
 */
export function optionsPodriaEjecutarElHandler(src: string): boolean {
  if (/export async function OPTIONS\s*\(/.test(src)) return true;
  if (/export const OPTIONS = conCors\(/.test(src)) return true;
  return false;
}

// ============================================================================
// La clasificación. Toda ruta tiene que estar en exactamente UNO de los tres.
// ============================================================================

/** Excluidas a propósito: nunca las llama un navegador. */
const EXCLUIDAS = new Map([
  ["app/api/cron/netflix-top10/route.ts",
   "server-to-server: la dispara Vercel Cron con el CRON_SECRET, ningún navegador la pide"],
]);

/**
 * 🔵 PENDIENTES DE DECISIÓN DEL DUEÑO. No es olvido: son las dos rutas donde el
 * plan y la instrucción de CP4 se contradicen, y adaptarlas sin resolver eso
 * sería elegir por él.
 *
 *   recordatorio  → la instrucción de CP4 la excluye ("se consume por
 *                   navegación/descarga del .ics"). Pero CP3 verificó que
 *                   `RecordarButton` hace además un `fetch(ics)` de validación,
 *                   con `ics` ya absoluta: en el contenedor esa llamada es
 *                   cross-origin y SIN CORS quedaría bloqueada, rompiendo el
 *                   botón "Recordarme".
 *   admin-search  → la instrucción de CP4 la incluye; el plan la excluía porque
 *                   `app/admin` no viaja en el artefacto nativo. Incluirla es
 *                   inofensivo pero inútil; excluirla es coherente con el
 *                   staging.
 */
const PENDIENTES = new Map([
  ["app/api/recordatorio/route.ts",
   "conflicto: la instrucción de CP4 la excluye, pero RecordarButton le hace un fetch de validación"],
  ["app/api/admin-search/route.ts",
   "conflicto: la instrucción de CP4 la incluye, el plan la excluía porque app/admin no viaja"],
]);

// ============================================================================
// Canarios: el guard tiene que detectar los tres fallos que importan
// ============================================================================

test("CANARIO: detecta una ruta que NO integra el contrato", () => {
  assert.equal(integraCors('export async function GET() { return Response.json({}); }'), false);
  assert.equal(integraCors('export const GET = conCors(manejar, "GET");'), false,
    "sin OPTIONS no alcanza");
  assert.equal(integraCors('export const OPTIONS = opcionesCors("GET");'), false,
    "sin el método envuelto tampoco");
});

test("CANARIO: reconoce una ruta bien integrada", () => {
  const bien = 'export const GET = conCors(manejar, "GET");\nexport const OPTIONS = opcionesCors("GET");';
  assert.equal(integraCors(bien), true);
});

test("CANARIO: detecta un OPTIONS que ejecutaría el handler real", () => {
  assert.equal(optionsPodriaEjecutarElHandler(
    'export async function OPTIONS(req) { return manejar(req); }'), true);
  assert.equal(optionsPodriaEjecutarElHandler(
    'export const OPTIONS = conCors(manejar, "GET");'), true);
  assert.equal(optionsPodriaEjecutarElHandler(
    'export const OPTIONS = opcionesCors("GET");'), false);
});

test("CANARIO: una exclusión huérfana se detecta", () => {
  // Si una excluida dejara de existir, el mapa apuntaría a la nada. Se prueba
  // con un mapa de mentira para no depender de romper el repo.
  const falsa = new Map([["app/api/no-existe/route.ts", "motivo"]]);
  const huerfanas = [...falsa.keys()].filter((r) => !fs.existsSync(path.join(RAIZ, r)));
  assert.deepEqual(huerfanas, ["app/api/no-existe/route.ts"]);
});

// ============================================================================
// El barrido real
// ============================================================================

test("toda ruta está clasificada: integrada, excluida o pendiente", () => {
  const sinClasificar = rutasDeApi().filter((r) => {
    if (EXCLUIDAS.has(r) || PENDIENTES.has(r)) return false;
    return !integraCors(fs.readFileSync(path.join(RAIZ, r), "utf8"));
  });
  assert.deepEqual(sinClasificar, [],
    `rutas sin CORS y sin clasificar:\n${sinClasificar.join("\n")}`);
});

test("las excluidas y las pendientes NO integran CORS", () => {
  for (const [r, motivo] of [...EXCLUIDAS, ...PENDIENTES]) {
    const src = fs.readFileSync(path.join(RAIZ, r), "utf8");
    assert.equal(integraCors(src), false, `${r} integró CORS pese a estar fuera (${motivo})`);
  }
});

test("ninguna exclusión ni pendiente quedó huérfana", () => {
  for (const r of [...EXCLUIDAS.keys(), ...PENDIENTES.keys()]) {
    assert.ok(fs.existsSync(path.join(RAIZ, r)),
      `la clasificación apunta a un archivo que ya no está: ${r}`);
  }
});

test("ningún OPTIONS puede ejecutar el handler real", () => {
  const malas = rutasDeApi().filter((r) =>
    optionsPodriaEjecutarElHandler(fs.readFileSync(path.join(RAIZ, r), "utf8")));
  assert.deepEqual(malas, [], `OPTIONS que llegarían al handler:\n${malas.join("\n")}`);
});

test("el recuento cierra: 25 rutas = 22 integradas + 1 excluida + 2 pendientes", () => {
  const todas = rutasDeApi();
  const integradas = todas.filter((r) => integraCors(fs.readFileSync(path.join(RAIZ, r), "utf8")));
  assert.equal(todas.length, 25, "cambió la cantidad de rutas: hay que reclasificar");
  assert.equal(integradas.length, 22);
  assert.equal(EXCLUIDAS.size, 1);
  assert.equal(PENDIENTES.size, 2);
  assert.equal(integradas.length + EXCLUIDAS.size + PENDIENTES.size, todas.length);
});

test("ninguna ruta declara métodos que no existen", () => {
  for (const r of rutasDeApi()) {
    const src = fs.readFileSync(path.join(RAIZ, r), "utf8");
    for (const inexistente of ["PUT", "PATCH", "DELETE", "HEAD"]) {
      assert.doesNotMatch(src, new RegExp(`opcionesCors\\("${inexistente}"`), `${r} declara ${inexistente}`);
    }
  }
});

test("no existe middleware.ts: el CORS no pasa por ahí", () => {
  assert.equal(fs.existsSync(path.join(RAIZ, "middleware.ts")), false);
  assert.equal(fs.existsSync(path.join(RAIZ, "src", "middleware.ts")), false);
});
