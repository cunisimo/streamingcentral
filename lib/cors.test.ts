// El contrato de CORS para las rutas que consume el contenedor.
//
// Lo que CORS es y lo que no: decide qué respuestas puede LEER un navegador
// desde otro origen. No es autenticación —eso lo sigue haciendo el Bearer— y no
// impide que nadie llame a la API desde un servidor.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ORIGENES_PERMITIDOS, origenPermitido, anexarVary, cabecerasCors,
  opcionesCors, conCors,
} from "./cors.ts";

const ANDROID = "https://localhost";
const IOS = "capacitor://localhost";

// ============================================================================
// 1-2. Los dos orígenes permitidos
// ============================================================================

test("https://localhost está permitido", () => {
  assert.equal(origenPermitido(ANDROID), ANDROID);
  assert.equal(cabecerasCors(ANDROID)["Access-Control-Allow-Origin"], ANDROID);
});

test("capacitor://localhost está permitido", () => {
  assert.equal(origenPermitido(IOS), IOS);
  assert.equal(cabecerasCors(IOS)["Access-Control-Allow-Origin"], IOS);
});

test("la allowlist son exactamente esos dos", () => {
  assert.deepEqual([...ORIGENES_PERMITIDOS], [ANDROID, IOS]);
});

// ============================================================================
// 3-4. Rechazos: coincidencia de cadena COMPLETA, nada de startsWith
// ============================================================================

test("un origen malicioso se rechaza", () => {
  assert.equal(origenPermitido("https://malicioso.com"), null);
  assert.equal(cabecerasCors("https://malicioso.com")["Access-Control-Allow-Origin"], undefined);
});

test("las variantes PARECIDAS se rechazan", () => {
  // Cada una rompe un atajo distinto: startsWith, sufijo, protocolo, puerto.
  for (const casi of [
    "https://localhost.evil.com",     // startsWith("https://localhost") daría true
    "https://localhost:3000",         // puerto no declarado
    "http://localhost",               // protocolo distinto
    "capacitor://localhost.evil",     // sufijo
    "https://localhost/",             // barra final: no es la misma cadena
    "HTTPS://LOCALHOST",              // mayúsculas
    " https://localhost",             // espacio
    "https://sub.localhost",          // subdominio
  ]) {
    assert.equal(origenPermitido(casi), null, `aceptó ${casi}`);
    assert.equal(cabecerasCors(casi)["Access-Control-Allow-Origin"], undefined, `aceptó ${casi}`);
  }
});

// ============================================================================
// 5-7. Sin Origin, nunca comodín, nunca credentials
// ============================================================================

test("sin Origin: no hay Allow-Origin", () => {
  assert.equal(origenPermitido(null), null);
  assert.equal(cabecerasCors(null)["Access-Control-Allow-Origin"], undefined);
});

test("NUNCA el comodín, ni con un origen permitido", () => {
  for (const o of [ANDROID, IOS, "https://malicioso.com", null]) {
    assert.notEqual(cabecerasCors(o)["Access-Control-Allow-Origin"], "*");
  }
});

test("NUNCA Allow-Credentials", () => {
  for (const o of [ANDROID, IOS, "https://malicioso.com", null]) {
    assert.equal(cabecerasCors(o)["Access-Control-Allow-Credentials"], undefined);
  }
});

test("como máximo UN origen en el encabezado: nunca una lista", () => {
  const v = cabecerasCors(ANDROID)["Access-Control-Allow-Origin"];
  assert.doesNotMatch(v, /[,\s]/, "el valor no puede tener coma ni espacio");
});

// ============================================================================
// 8. Vary: Origin
// ============================================================================

test("Vary se agrega si no existía", () => {
  assert.equal(anexarVary(null), "Origin");
  assert.equal(anexarVary(""), "Origin");
});

test("Vary conserva los valores previos", () => {
  assert.equal(anexarVary("Accept-Encoding"), "Accept-Encoding, Origin");
  assert.equal(anexarVary("Accept-Encoding, Accept"), "Accept-Encoding, Accept, Origin");
});

test("Vary no duplica Origin, ni con otra capitalización", () => {
  assert.equal(anexarVary("Origin"), "Origin");
  assert.equal(anexarVary("origin"), "origin");
  assert.equal(anexarVary("Accept-Encoding, Origin"), "Accept-Encoding, Origin");
});

test("Vary existe TAMBIÉN ante un origen rechazado y sin Origin", () => {
  assert.equal(cabecerasCors("https://malicioso.com")["Vary"], "Origin");
  assert.equal(cabecerasCors(null)["Vary"], "Origin");
});

// ============================================================================
// 9-11. Preflight
// ============================================================================

function pedir(origin: string | null, metodo = "OPTIONS"): Request {
  return new Request("https://app.yump.ar/api/x", {
    method: metodo,
    headers: origin ? { Origin: origin } : {},
  });
}

test("preflight permitido: 204, métodos, headers y Max-Age 600", async () => {
  const res = opcionesCors("POST")(pedir(ANDROID));
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), ANDROID);
  assert.equal(res.headers.get("Access-Control-Allow-Methods"), "POST, OPTIONS");
  assert.equal(res.headers.get("Access-Control-Allow-Headers"), "Authorization, Content-Type");
  assert.equal(res.headers.get("Access-Control-Max-Age"), "600");
  assert.equal(res.headers.get("Vary"), "Origin");
});

test("preflight de una ruta GET declara GET, OPTIONS: nada que no exista", () => {
  const res = opcionesCors("GET")(pedir(IOS));
  assert.equal(res.headers.get("Access-Control-Allow-Methods"), "GET, OPTIONS");
  const metodos = res.headers.get("Access-Control-Allow-Methods") ?? "";
  for (const inexistente of ["PUT", "PATCH", "DELETE", "HEAD"]) {
    assert.doesNotMatch(metodos, new RegExp(inexistente));
  }
});

test("preflight rechazado: 204 pero SIN Allow-Origin", () => {
  const res = opcionesCors("GET")(pedir("https://malicioso.com"));
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), null);
  assert.equal(res.headers.get("Vary"), "Origin");
});

test("el preflight NO ejecuta el handler real", async () => {
  let ejecutado = false;
  const manejar = async () => { ejecutado = true; return Response.json({ ok: true }); };
  // `opcionesCors` ni siquiera recibe el handler: es una función aparte. Esto
  // fija que el diseño lo hace IMPOSIBLE, no que "no suele pasar".
  const res = opcionesCors("POST")(pedir(ANDROID));
  assert.equal(res.status, 204);
  assert.equal(ejecutado, false, "el preflight ejecutó la lógica de la ruta");
  assert.equal(await res.text(), "", "un 204 no lleva cuerpo");
  // Y el handler envuelto sí se ejecuta cuando corresponde.
  await conCors(manejar, "POST")(pedir(ANDROID, "POST"));
  assert.equal(ejecutado, true);
});

/** Captura las llamadas a console.error y SIEMPRE lo restaura. */
async function espiandoConsola<T>(fn: () => Promise<T>): Promise<{ r: T; llamadas: unknown[][] }> {
  const original = console.error;
  const llamadas: unknown[][] = [];
  console.error = (...args: unknown[]) => { llamadas.push(args); };
  try {
    const r = await fn();
    return { r, llamadas };
  } finally {
    console.error = original;   // también si la prueba falla
  }
}

const PEDIDO_CON_SECRETOS = () => new Request(
  "https://app.yump.ar/api/ruleta?escenario=corta&token=secreto-en-query",
  { method: "GET", headers: { Origin: ANDROID, Authorization: "Bearer secreto-en-header" } },
);

// ============================================================================
// 12-14. Respuestas reales
// ============================================================================

test("GET público: la respuesta lleva CORS y conserva su payload", async () => {
  const manejar = async () => Response.json({ items: [1, 2] }, { status: 200 });
  const res = await conCors(manejar, "GET")(pedir(ANDROID, "GET"));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { items: [1, 2] });
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), ANDROID);
  assert.equal(res.headers.get("Vary"), "Origin");
});

test("POST JSON con Bearer: idem, y CORS no valida el token", async () => {
  const manejar = async (req: Request) => Response.json(
    { visto: req.headers.get("authorization") }, { status: 200 });
  const req = new Request("https://app.yump.ar/api/x", {
    method: "POST",
    headers: { Origin: IOS, Authorization: "Bearer abc", "Content-Type": "application/json" },
    body: "{}",
  });
  const res = await conCors(manejar, "POST")(req);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), IOS);
  assert.deepEqual(await res.json(), { visto: "Bearer abc" });
});

test("un 4xx controlado también lleva CORS", async () => {
  const manejar = async () => Response.json({ error: "falta q" }, { status: 400 });
  const res = await conCors(manejar, "GET")(pedir(ANDROID, "GET"));
  assert.equal(res.status, 400);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), ANDROID);
  assert.deepEqual(await res.json(), { error: "falta q" });
});

test("un 401 controlado también lleva CORS", async () => {
  const manejar = async () => Response.json({ error: "sin sesión" }, { status: 401 });
  const res = await conCors(manejar, "POST")(pedir(ANDROID, "POST"));
  assert.equal(res.status, 401);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), ANDROID);
});

test("una EXCEPCIÓN no capturada sale como 500 CON CORS", async () => {
  // Sin esto, Next devolvería su propio 500 sin encabezados y el navegador
  // mostraría un error de red genérico en vez del status real.
  //
  // Va con `espiandoConsola` porque `conCors` ahora REGISTRA la excepción: sin
  // el espía, este test escupiría un `[api] … error no controlado` en la salida
  // de la suite y ensuciaría el output de todos los días.
  const manejar = async () => { throw new Error("boom"); };
  const { r: res } = await espiandoConsola(() => conCors(manejar, "GET")(pedir(ANDROID, "GET")));
  assert.equal(res.status, 500);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), ANDROID);
  assert.equal(res.headers.get("Vary"), "Origin");
});

test("el 500 de la integración no filtra el mensaje de la excepción", async () => {
  const manejar = async () => { throw new Error("detalle-interno-que-no-debe-salir"); };
  const { r: res } = await espiandoConsola(() => conCors(manejar, "GET")(pedir(ANDROID, "GET")));
  assert.doesNotMatch(await res.text(), /detalle-interno-que-no-debe-salir/);
});

// ============================================================================
// 15. La web, sin Origin, no cambia
// ============================================================================

test("sin Origin: status, body y headers propios intactos, y sin Allow-Origin", async () => {
  const manejar = async () => new Response(JSON.stringify({ a: 1 }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Propio": "1" },
  });
  const res = await conCors(manejar, "GET")(pedir(null, "GET"));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { a: 1 });
  assert.equal(res.headers.get("Cache-Control"), "no-store", "pisó un header de la ruta");
  assert.equal(res.headers.get("X-Propio"), "1");
  assert.equal(res.headers.get("Content-Type"), "application/json");
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), null);
  assert.equal(res.headers.get("Vary"), "Origin");
});

test("con origen permitido tampoco pisa los headers de la ruta", async () => {
  const manejar = async () => new Response("x", {
    headers: { "Cache-Control": "no-store", Vary: "Accept-Encoding" },
  });
  const res = await conCors(manejar, "GET")(pedir(ANDROID, "GET"));
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.equal(res.headers.get("Vary"), "Accept-Encoding, Origin", "pisó el Vary previo");
});

// ============================================================================
// Observabilidad: una excepción no puede desaparecer de los logs
// ============================================================================
//
// `conCors` captura para poder devolver un 500 CON CORS. Si además se tragara el
// error, los fallos no controlados de 23 rutas se volverían invisibles: la
// respuesta diría "error interno" y en los logs no habría nada. Se registra el
// contexto MÍNIMO y el objeto de error (que conserva el stack).

test("una excepción registra UNA sola vez en console.error", async () => {
  const manejar = async () => { throw new Error("boom"); };
  const { llamadas } = await espiandoConsola(() =>
    conCors(manejar, "GET")(PEDIDO_CON_SECRETOS()));
  assert.equal(llamadas.length, 1, "tiene que registrar exactamente una vez");
});

test("el contexto registrado trae método y pathname", async () => {
  const manejar = async () => { throw new Error("boom"); };
  const { llamadas } = await espiandoConsola(() =>
    conCors(manejar, "GET")(PEDIDO_CON_SECRETOS()));
  const contexto = String(llamadas[0][0]);
  assert.match(contexto, /GET/);
  assert.match(contexto, /\/api\/ruleta/);
});

test("el contexto NO trae query, Authorization, cookies ni headers", async () => {
  const manejar = async () => { throw new Error("boom"); };
  const { llamadas } = await espiandoConsola(() =>
    conCors(manejar, "GET")(PEDIDO_CON_SECRETOS()));
  const todo = llamadas[0].map((a) => (a instanceof Error ? a.message : String(a))).join(" | ");
  assert.doesNotMatch(todo, /secreto-en-query/, "se filtró la query");
  assert.doesNotMatch(todo, /secreto-en-header/, "se filtró el Authorization");
  assert.doesNotMatch(todo, /escenario=corta/, "se filtró la query string");
  assert.doesNotMatch(todo, /Bearer/i);
});

test("se registra el OBJETO de error, para conservar el stack", async () => {
  const boom = new Error("boom");
  const { llamadas } = await espiandoConsola(() =>
    conCors(async () => { throw boom; }, "GET")(PEDIDO_CON_SECRETOS()));
  assert.ok(llamadas[0].includes(boom), "hay que pasar el error, no sólo su texto");
});

test("pese al log, la respuesta sigue siendo 500 con CORS y sin el mensaje interno", async () => {
  const manejar = async () => { throw new Error("detalle-interno-que-no-debe-salir"); };
  const { r: res } = await espiandoConsola(() =>
    conCors(manejar, "GET")(PEDIDO_CON_SECRETOS()));
  assert.equal(res.status, 500);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), ANDROID);
  assert.equal(res.headers.get("Vary"), "Origin");
  assert.doesNotMatch(await res.text(), /detalle-interno-que-no-debe-salir/);
});

test("una respuesta normal NO registra nada: cero ruido en la suite", async () => {
  const { llamadas } = await espiandoConsola(() =>
    conCors(async () => Response.json({ ok: true }), "GET")(pedir(ANDROID, "GET")));
  assert.deepEqual(llamadas, []);
});
