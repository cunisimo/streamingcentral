// La clasificación de lo que devuelve TMDB, en un solo lugar y por CAUSA, no
// por mensaje. Etapa 3.a (#19, H6/H7): antes `lib/tmdb.ts` tiraba un `Error`
// con texto, contaba el timeout de 8 s como "red" y un 200 con JSON roto como
// "ok". Nadie más podía distinguir un 429 de un `TypeError` propio.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ErrorTmdb, clasificarError, esErrorTmdb } from "./tmdb-error.ts";

test("un ErrorTmdb sabe su estado, su clase y su Retry-After", () => {
  const e = new ErrorTmdb({ estado: 429, clase: "http429", path: "/discover/movie", retryAfterMs: 2000 });
  assert.ok(e instanceof Error);
  assert.equal(e.estado, 429);
  assert.equal(e.clase, "http429");
  assert.equal(e.retryAfterMs, 2000);
  assert.match(e.message, /TMDB 429 en \/discover\/movie/);
  assert.equal(esErrorTmdb(e), true);
});

test("un error propio (TypeError, Error a secas) NO es un ErrorTmdb", () => {
  assert.equal(esErrorTmdb(new TypeError("x")), false);
  assert.equal(esErrorTmdb(new Error("TMDB 429 en /x")), false);
  assert.equal(esErrorTmdb(null), false);
  assert.equal(esErrorTmdb("429"), false);
});

test("clasificarError: el timeout propio de 8 s es `timeout`, no `red`", () => {
  const e = new DOMException("The operation was aborted due to timeout", "TimeoutError");
  assert.equal(clasificarError(e, { senalCancelada: false }), "timeout");
});

test("clasificarError: un AbortError con la señal de la solicitud abortada es `cancelada`", () => {
  const e = new DOMException("solicitud cancelada", "AbortError");
  assert.equal(clasificarError(e, { senalCancelada: true }), "cancelada");
});

test("clasificarError: un AbortError SIN señal abortada es `timeout` (AbortSignal.timeout en runtimes viejos)", () => {
  const e = new DOMException("aborted", "AbortError");
  assert.equal(clasificarError(e, { senalCancelada: false }), "timeout");
});

test("clasificarError: fallo del fetch (TypeError: fetch failed) es `red`", () => {
  assert.equal(clasificarError(new TypeError("fetch failed"), { senalCancelada: false }), "red");
});

test("clasificarError: JSON inválido (SyntaxError) es `cuerpo`", () => {
  assert.equal(clasificarError(new SyntaxError("Unexpected token <"), { senalCancelada: false }), "cuerpo");
});

test("clasificarError: cualquier otra cosa es `desconocido` (un bug propio no se disfraza de TMDB)", () => {
  assert.equal(clasificarError(new RangeError("x"), { senalCancelada: false }), "desconocido");
});

test("las clases por estado HTTP: 429, 5xx, 4xx", () => {
  assert.equal(ErrorTmdb.clasePorEstado(429), "http429");
  assert.equal(ErrorTmdb.clasePorEstado(500), "http5xx");
  assert.equal(ErrorTmdb.clasePorEstado(503), "http5xx");
  assert.equal(ErrorTmdb.clasePorEstado(404), "http4xx");
  assert.equal(ErrorTmdb.clasePorEstado(401), "http4xx");
});
