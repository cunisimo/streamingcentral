// El inventario de rutas: quién integra CORS y quién queda afuera a propósito.
//
// ⚠️ Comprobación sobre el TEXTO de los archivos, no sobre la app montada: este
// proyecto no tiene arnés de DOM (misma nota que `lib/legal.test.ts`). Fija dos
// regresiones reales: que aparezca una ruta nueva y nadie decida a qué grupo va,
// y que el método declarado en una ruta deje de coincidir consigo mismo.
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

const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

// ============================================================================
// Coherencia del método: los TRES lugares donde se escribe
// ============================================================================
//
// Cada ruta integrada nombra su método tres veces:
//
//   export const GET = conCors(manejar, "GET");   ← el export, y el argumento
//   export const OPTIONS = opcionesCors("GET");   ← y otra vez acá
//
// No hay "un único lugar". Lo que impide que diverjan es esto: si el export se
// llama GET pero se envuelve como POST, el preflight anunciaría un método que la
// ruta no tiene, y el navegador dejaría pasar un request que después falla.

export interface Integracion {
  /** Nombre del export envuelto: "GET" o "POST". */
  export: string | null;
  /** Método pasado a `conCors`. */
  conCors: string | null;
  /** Método pasado a `opcionesCors`. */
  opciones: string | null;
}

export function leerIntegracion(src: string): Integracion {
  const env = src.match(/export const (GET|POST) = conCors\([^,]+,\s*"(GET|POST)"\s*\)/);
  const opt = src.match(/export const OPTIONS = opcionesCors\("(GET|POST)"\s*\)/);
  return {
    export: env?.[1] ?? null,
    conCors: env?.[2] ?? null,
    opciones: opt?.[1] ?? null,
  };
}

/**
 * ¿El `OPTIONS` podría ejecutar el handler real?
 *
 * El contrato es que salga de `opcionesCors`, que NO recibe el handler.
 * Cualquier otra forma —un `export async function OPTIONS` propio, o un
 * `conCors` en el OPTIONS— podría llegar a la lógica de la ruta, y en
 * `/api/home` eso son hasta 60 s y cientos de comandos de Upstash por preflight.
 */
export function optionsPodriaEjecutarElHandler(src: string): boolean {
  if (/export async function OPTIONS\s*\(/.test(src)) return true;
  if (/export const OPTIONS = conCors\(/.test(src)) return true;
  return false;
}

/** Integra el contrato Y los tres métodos coinciden. */
export function integraCors(src: string): boolean {
  const i = leerIntegracion(src);
  if (!i.export || !i.conCors || !i.opciones) return false;
  if (optionsPodriaEjecutarElHandler(src)) return false;
  return i.export === i.conCors && i.conCors === i.opciones;
}

// ============================================================================
// La clasificación. Toda ruta está en exactamente UNO de los dos grupos.
// ============================================================================

/**
 * Fuera del contrato a propósito.
 *
 * ⚠️ El motivo NO es "ningún navegador las llama" — `admin-search` sí se llama
 * desde un navegador, en la web. Lo que ninguna necesita es **lectura
 * cross-origin desde el contenedor**, que es lo único que CORS habilita.
 */
const EXCLUIDAS = new Map([
  ["app/api/cron/netflix-top10/route.ts",
   "server-to-server: la ejecuta Vercel Cron con el CRON_SECRET; el contenedor no la consume"],
  ["app/api/admin-search/route.ts",
   "sólo la consume app/admin, que NO viaja en el artefacto nativo: habilitarla sería innecesario"],
  // Llegó con el Top manual, después de CP4. Mismo motivo que la de arriba, no
  // un criterio nuevo: la consume `app/admin/top`, que no viaja en el APK. Y
  // además escribe: darle CORS sería abrirla al contenedor sin necesidad.
  ["app/api/admin/top/route.ts",
   "sólo la consume app/admin, que NO viaja en el artefacto nativo: habilitarla sería innecesario"],
]);

// ============================================================================
// Canarios del contrato
// ============================================================================

const bien = (m: string) =>
  `export const ${m} = conCors(manejar, "${m}");\nexport const OPTIONS = opcionesCors("${m}");`;

test("CANARIO 1: GET + conCors GET + opcionesCors GET es válido", () => {
  assert.equal(integraCors(bien("GET")), true);
  assert.deepEqual(leerIntegracion(bien("GET")), { export: "GET", conCors: "GET", opciones: "GET" });
});

test("CANARIO 2: POST + conCors POST + opcionesCors POST es válido", () => {
  assert.equal(integraCors(bien("POST")), true);
});

test("CANARIO 3: export GET con conCors POST FALLA", () => {
  const mal = 'export const GET = conCors(manejar, "POST");\nexport const OPTIONS = opcionesCors("GET");';
  assert.equal(integraCors(mal), false, "no detectó que el export y conCors divergen");
});

test("CANARIO 4: conCors GET con opcionesCors POST FALLA", () => {
  const mal = 'export const GET = conCors(manejar, "GET");\nexport const OPTIONS = opcionesCors("POST");';
  assert.equal(integraCors(mal), false, "no detectó que conCors y el preflight divergen");
});

test("CANARIO 5: sin OPTIONS FALLA", () => {
  assert.equal(integraCors('export const GET = conCors(manejar, "GET");'), false);
});

test("CANARIO 6: un OPTIONS que llama o envuelve el handler real FALLA", () => {
  const propio = 'export const GET = conCors(manejar, "GET");\n'
    + "export async function OPTIONS(req) { return manejar(req); }";
  const envuelto = 'export const GET = conCors(manejar, "GET");\n'
    + 'export const OPTIONS = conCors(manejar, "GET");';
  assert.equal(optionsPodriaEjecutarElHandler(propio), true);
  assert.equal(optionsPodriaEjecutarElHandler(envuelto), true);
  assert.equal(integraCors(propio), false);
  assert.equal(integraCors(envuelto), false);
  assert.equal(optionsPodriaEjecutarElHandler(bien("GET")), false);
});

test("CANARIO 7: una exclusión huérfana se detecta", () => {
  const falsa = new Map([["app/api/no-existe/route.ts", "motivo"]]);
  const huerfanas = [...falsa.keys()].filter((r) => !fs.existsSync(path.join(RAIZ, r)));
  assert.deepEqual(huerfanas, ["app/api/no-existe/route.ts"]);
});

// ============================================================================
// El barrido real
// ============================================================================

test("toda ruta está clasificada: integrada o excluida, sin pendientes", () => {
  const sinClasificar = rutasDeApi()
    .filter((r) => !EXCLUIDAS.has(r))
    .filter((r) => !integraCors(leer(r)));
  assert.deepEqual(sinClasificar, [],
    `rutas sin CORS y sin clasificar:\n${sinClasificar.join("\n")}`);
});

test("las 23 integradas coinciden en sus TRES declaraciones de método", () => {
  const divergentes: string[] = [];
  for (const r of rutasDeApi()) {
    if (EXCLUIDAS.has(r)) continue;
    const i = leerIntegracion(leer(r));
    if (!(i.export && i.export === i.conCors && i.conCors === i.opciones)) {
      divergentes.push(`${r}: export=${i.export} conCors=${i.conCors} opciones=${i.opciones}`);
    }
  }
  assert.deepEqual(divergentes, [], `métodos divergentes:\n${divergentes.join("\n")}`);
});

test("las excluidas NO integran CORS ni exportan OPTIONS", () => {
  for (const [r, motivo] of EXCLUIDAS) {
    const src = leer(r);
    assert.equal(integraCors(src), false, `${r} integró CORS pese a estar fuera (${motivo})`);
    assert.doesNotMatch(src, /export (const|async function) OPTIONS/,
      `${r} exporta OPTIONS y no debería`);
  }
});

test("ninguna exclusión quedó huérfana", () => {
  for (const r of EXCLUIDAS.keys()) {
    assert.ok(fs.existsSync(path.join(RAIZ, r)),
      `la clasificación apunta a un archivo que ya no está: ${r}`);
  }
});

test("ningún OPTIONS puede ejecutar el handler real", () => {
  const malas = rutasDeApi().filter((r) => optionsPodriaEjecutarElHandler(leer(r)));
  assert.deepEqual(malas, [], `OPTIONS que llegarían al handler:\n${malas.join("\n")}`);
});

test("el recuento cierra: 26 rutas = 23 integradas + 3 excluidas", () => {
  // 25 -> 26 al integrar `main`: el Top manual sumó `app/api/admin/top`, que se
  // clasificó como excluida. Las 23 integradas de CP4 no se movieron.
  const todas = rutasDeApi();
  const integradas = todas.filter((r) => integraCors(leer(r)));
  assert.equal(todas.length, 26, "cambió la cantidad de rutas: hay que reclasificar");
  assert.equal(integradas.length, 23);
  assert.equal(EXCLUIDAS.size, 3);
  assert.equal(integradas.length + EXCLUIDAS.size, todas.length);
});

test("recordatorio integra CORS: su fetch de validación es cross-origin", () => {
  const r = "app/api/recordatorio/route.ts";
  assert.equal(integraCors(leer(r)), true);
  // Y las cabeceras del .ics siguen ahí: `conCors` copia las de la ruta.
  const src = leer(r);
  assert.match(src, /text\/calendar/);
  assert.match(src, /Content-Disposition/);
  assert.match(src, /private, max-age=300/);
});

test("ninguna ruta declara métodos que no existen", () => {
  for (const r of rutasDeApi()) {
    for (const inexistente of ["PUT", "PATCH", "DELETE", "HEAD"]) {
      assert.doesNotMatch(leer(r), new RegExp(`opcionesCors\\("${inexistente}"`),
        `${r} declara ${inexistente}`);
    }
  }
});

test("no existe middleware.ts: el CORS no pasa por ahí", () => {
  assert.equal(fs.existsSync(path.join(RAIZ, "middleware.ts")), false);
  assert.equal(fs.existsSync(path.join(RAIZ, "src", "middleware.ts")), false);
});
