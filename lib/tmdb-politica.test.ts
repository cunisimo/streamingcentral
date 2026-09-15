// La política por clase de respuesta de TMDB (informe de la Etapa 3, §6) y el
// bucle de reintentos, PUROS. Etapa 3.a: el código existe pero está APAGADO
// (`TMDB_REINTENTOS` ausente o "0"): con la política apagada, cada llamada es
// exactamente un intento, sin ninguna espera. Encenderlo es de la 3.c'.
import { test } from "node:test";
import assert from "node:assert/strict";
import { conReintentos, decidir, reintentosActivos } from "./tmdb-politica.ts";
import { ErrorTmdb } from "./tmdb-error.ts";

const e429 = (ra: number | null = null) => new ErrorTmdb({ estado: 429, clase: "http429", path: "/x", retryAfterMs: ra });
const e5xx = (estado = 503) => new ErrorTmdb({ estado, clase: "http5xx", path: "/x" });
const e4xx = (estado = 404) => new ErrorTmdb({ estado, clase: "http4xx", path: "/x" });
const eRed = () => new ErrorTmdb({ estado: null, clase: "red", path: "/x" });
const eTimeout = () => new ErrorTmdb({ estado: null, clase: "timeout", path: "/x" });
const eCuerpo = () => new ErrorTmdb({ estado: null, clase: "cuerpo", path: "/x" });
const eCancelada = () => new ErrorTmdb({ estado: null, clase: "cancelada", path: "/x" });

// Sin jitter en los tests: el azar se inyecta como 0 para que las esperas sean
// exactas.
const SIN_JITTER = () => 0;

// ============================================================================
// El interruptor: apagado por defecto, y "0" también es apagado
// ============================================================================

test("reintentosActivos: ausente → false; '0' → false; '1' → true; cualquier otra cosa → false", () => {
  assert.equal(reintentosActivos(undefined), false);
  assert.equal(reintentosActivos(""), false);
  assert.equal(reintentosActivos("0"), false);
  assert.equal(reintentosActivos("1"), true);
  assert.equal(reintentosActivos("true"), false);
  assert.equal(reintentosActivos("si"), false);
});

// ============================================================================
// CONTROL (MANTENIMIENTO 8.b): con la política apagada, NADA se reintenta
// ============================================================================

test("apagada: toda clase, todo estado, todo Retry-After → fallar sin espera", () => {
  const casos = [e429(2000), e429(null), e5xx(500), e5xx(503), e4xx(404), e4xx(401), eRed(), eTimeout(), eCuerpo(), eCancelada()];
  for (const e of casos) {
    const d = decidir(e, { intento: 1, restanteMs: 60_000, activa: false, azar: SIN_JITTER });
    assert.equal(d.accion, "fallar", e.clase);
    assert.equal(d.esperaMs, 0, e.clase);
  }
});

// ============================================================================
// Encendida: la tabla de §6
// ============================================================================

test("encendida: 429 con Retry-After → reintentar esperando ese tiempo (+ jitter), tope 30 s", () => {
  const d = decidir(e429(2000), { intento: 1, restanteMs: 60_000, activa: true, azar: SIN_JITTER });
  assert.deepEqual([d.accion, d.esperaMs], ["reintentar", 2000]);
  const tope = decidir(e429(90_000), { intento: 1, restanteMs: 120_000, activa: true, azar: SIN_JITTER });
  assert.equal(tope.esperaMs, 30_000);
});

test("encendida: 429 sin Retry-After → backoff con jitter completo acotado (300·2^(i−1), tope 2 s)", () => {
  // azar = 1 devuelve el máximo de la ventana: 300, 600, 1200, 2000.
  const max = () => 1;
  assert.equal(decidir(e429(null), { intento: 1, restanteMs: 60_000, activa: true, azar: max }).esperaMs, 300);
  assert.equal(decidir(e429(null), { intento: 2, restanteMs: 60_000, activa: true, azar: max }).esperaMs, 600);
  assert.equal(decidir(e5xx(500), { intento: 1, restanteMs: 60_000, activa: true, azar: max }).esperaMs, 300);
});

test("encendida: hasta 3 intentos para 429 y 5xx; el 4.º no existe", () => {
  assert.equal(decidir(e429(1000), { intento: 3, restanteMs: 60_000, activa: true, azar: SIN_JITTER }).accion, "fallar");
  assert.equal(decidir(e5xx(502), { intento: 2, restanteMs: 60_000, activa: true, azar: SIN_JITTER }).accion, "reintentar");
  assert.equal(decidir(e5xx(502), { intento: 3, restanteMs: 60_000, activa: true, azar: SIN_JITTER }).accion, "fallar");
});

test("encendida: 503 con Retry-After válido lo respeta", () => {
  const e = new ErrorTmdb({ estado: 503, clase: "http5xx", path: "/x", retryAfterMs: 4000 });
  assert.equal(decidir(e, { intento: 1, restanteMs: 60_000, activa: true, azar: SIN_JITTER }).esperaMs, 4000);
});

test("encendida: 4xx (404, 401, 400) nunca se reintenta", () => {
  for (const estado of [404, 401, 400, 422]) {
    assert.equal(decidir(e4xx(estado), { intento: 1, restanteMs: 60_000, activa: true, azar: SIN_JITTER }).accion, "fallar", String(estado));
  }
});

test("encendida: red y timeout → UN solo reintento", () => {
  assert.equal(decidir(eRed(), { intento: 1, restanteMs: 60_000, activa: true, azar: SIN_JITTER }).accion, "reintentar");
  assert.equal(decidir(eRed(), { intento: 2, restanteMs: 60_000, activa: true, azar: SIN_JITTER }).accion, "fallar");
  assert.equal(decidir(eTimeout(), { intento: 1, restanteMs: 60_000, activa: true, azar: SIN_JITTER }).accion, "reintentar");
  assert.equal(decidir(eTimeout(), { intento: 2, restanteMs: 60_000, activa: true, azar: SIN_JITTER }).accion, "fallar");
});

test("encendida: cuerpo inválido y cancelada nunca se reintentan", () => {
  assert.equal(decidir(eCuerpo(), { intento: 1, restanteMs: 60_000, activa: true, azar: SIN_JITTER }).accion, "fallar");
  assert.equal(decidir(eCancelada(), { intento: 1, restanteMs: 60_000, activa: true, azar: SIN_JITTER }).accion, "fallar");
});

test("encendida: un error que NO es de TMDB (bug propio) nunca se reintenta", () => {
  assert.equal(decidir(new TypeError("x"), { intento: 1, restanteMs: 60_000, activa: true, azar: SIN_JITTER }).accion, "fallar");
});

test("encendida, regla de 'cabe': no se inicia un reintento que no entra en el presupuesto", () => {
  // espera 5000 + timeout mínimo 1500 > restante 3000 → no cabe
  const d = decidir(e429(5000), { intento: 1, restanteMs: 3000, activa: true, azar: SIN_JITTER });
  assert.equal(d.accion, "fallar");
  assert.equal(d.motivo, "no-cabe");
  // 5000 + 1500 ≤ 10000 → cabe, y el timeout del reintento es lo que sobra, acotado a 8 s
  const c = decidir(e429(5000), { intento: 1, restanteMs: 10_000, activa: true, azar: SIN_JITTER });
  assert.equal(c.accion, "reintentar");
  assert.equal(c.timeoutMs, 5000);
  const d2 = decidir(e429(1000), { intento: 1, restanteMs: 60_000, activa: true, azar: SIN_JITTER });
  assert.equal(d2.timeoutMs, 8000);
});

// ============================================================================
// El bucle: un intento con la política apagada; con la encendida, espera SIN
// nada retenido y respeta la señal
// ============================================================================

function arnes(fallosAntesDeOk: number, error: () => unknown) {
  let intentos = 0;
  const intentar = async () => {
    intentos++;
    if (intentos <= fallosAntesDeOk) throw error();
    return "ok";
  };
  const esperas: number[] = [];
  const dormir = async (ms: number) => { esperas.push(ms); };
  return { intentar, esperas, dormir, intentos: () => intentos };
}

test("bucle apagado: exactamente un intento y el error sale tal cual, sin dormir", async () => {
  const a = arnes(5, () => e429(1000));
  await assert.rejects(
    conReintentos(a.intentar, { activa: false, restante: () => 60_000, dormir: a.dormir, azar: SIN_JITTER }),
    (e: unknown) => e instanceof ErrorTmdb && e.estado === 429,
  );
  assert.equal(a.intentos(), 1);
  assert.deepEqual(a.esperas, []);
});

test("bucle encendido: reintenta hasta el tope y anota cada reintento", async () => {
  const a = arnes(2, () => e5xx(500));
  let reintentos = 0;
  const r = await conReintentos(a.intentar, {
    activa: true, restante: () => 60_000, dormir: a.dormir, azar: SIN_JITTER, alReintentar: () => { reintentos++; },
  });
  assert.equal(r, "ok");
  assert.equal(a.intentos(), 3);
  assert.equal(reintentos, 2);
  assert.equal(a.esperas.length, 2);
});

test("bucle encendido: cuando no cabe, falla con el último error y avisa `noCupo`", async () => {
  const a = arnes(5, () => e429(5000));
  let noCupo = 0;
  await assert.rejects(conReintentos(a.intentar, {
    activa: true, restante: () => 3000, dormir: a.dormir, azar: SIN_JITTER, alNoCaber: () => { noCupo++; },
  }));
  assert.equal(a.intentos(), 1);
  assert.equal(noCupo, 1);
});

test("bucle encendido: la señal abortada durante la espera corta con AbortError y no hay más intentos", async () => {
  const a = arnes(5, () => e429(1000));
  const ctl = new AbortController();
  const dormir = async (_ms: number, senal?: AbortSignal) => {
    ctl.abort();
    if (senal?.aborted) throw new DOMException("cancelada", "AbortError");
  };
  await assert.rejects(
    conReintentos(a.intentar, { activa: true, restante: () => 60_000, dormir, azar: SIN_JITTER, senal: ctl.signal }),
    (e: unknown) => (e as { name?: string }).name === "AbortError",
  );
  assert.equal(a.intentos(), 1);
});
