// Cómo una ruta traduce un fallo del DATO PRINCIPAL de TMDB a HTTP (informe de
// la Etapa 3 §12, H8). Hoy `detail()` y `search()` propagan y la ruta devuelve
// `500 { error: "Error: TMDB 429 en …" }`, que la UI muestra como "Sin
// conexión". Con esto: TMDB caído → `503` + `Retry-After` + un motivo que el
// cliente puede distinguir; 404 → `404`; un bug propio sigue siendo `500`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { respuestaDeErrorTmdb } from "./tmdb-http.ts";
import { ErrorTmdb } from "./tmdb-error.ts";
import { motivoDeRespuesta } from "../components/api-motivo.ts";

const e = (o: Partial<ConstructorParameters<typeof ErrorTmdb>[0]>) =>
  new ErrorTmdb({ estado: null, clase: "red", path: "/x", ...o });

test("429 con Retry-After → 503 con Retry-After en segundos (redondeado hacia arriba) y motivo", () => {
  const r = respuestaDeErrorTmdb(e({ estado: 429, clase: "http429", retryAfterMs: 2500 }));
  assert.equal(r?.status, 503);
  assert.equal(r?.headers["Retry-After"], "3");
  assert.deepEqual(r?.body, { error: "tmdb-no-disponible", reintentarEnMs: 2500 });
});

test("5xx, red, timeout, cuerpo o rechazada sin Retry-After → 503 con una espera por defecto", () => {
  for (const clase of ["http5xx", "red", "timeout", "cuerpo", "rechazada"] as const) {
    const r = respuestaDeErrorTmdb(e({ estado: clase === "http5xx" ? 502 : null, clase }));
    assert.equal(r?.status, 503, clase);
    assert.equal(r?.headers["Retry-After"], "5", clase);
    assert.equal((r?.body as { reintentarEnMs: number }).reintentarEnMs, 5000, clase);
  }
});

test("404 de TMDB → 404 con motivo `no-encontrado`, sin Retry-After", () => {
  const r = respuestaDeErrorTmdb(e({ estado: 404, clase: "http4xx" }));
  assert.equal(r?.status, 404);
  assert.equal(r?.headers["Retry-After"], undefined);
  assert.deepEqual(r?.body, { error: "no-encontrado" });
});

test("otros 4xx (401, 400) → 503: es nuestro problema o el de TMDB, no del usuario", () => {
  assert.equal(respuestaDeErrorTmdb(e({ estado: 401, clase: "http4xx" }))?.status, 503);
});

test("un error que NO es de TMDB → null (la ruta sigue respondiendo 500 como hoy)", () => {
  assert.equal(respuestaDeErrorTmdb(new TypeError("propio")), null);
  assert.equal(respuestaDeErrorTmdb(new Error("TMDB 429 en /x")), null);
});

test("cliente: motivoDeRespuesta lee el motivo sólo de una respuesta no-ok con cuerpo conocido", () => {
  assert.equal(motivoDeRespuesta(false, { error: "tmdb-no-disponible", reintentarEnMs: 5000 }), "tmdb-no-disponible");
  assert.equal(motivoDeRespuesta(false, { error: "no-encontrado" }), "no-encontrado");
  assert.equal(motivoDeRespuesta(false, { error: "Error: algo" }), null);
  assert.equal(motivoDeRespuesta(true, { error: "tmdb-no-disponible" }), null);
  assert.equal(motivoDeRespuesta(false, null), null);
});
