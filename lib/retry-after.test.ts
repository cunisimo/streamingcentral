// `Retry-After` de TMDB: TMDB no lo documenta (developer.themoviedb.org/docs/
// rate-limiting, leído el 14/09/2026), así que el parser tiene que aguantar las
// cuatro formas que la RFC 9110 permite o que un proxy puede mandar: segundos,
// fecha HTTP, ausente e inválido. Etapa 3.a: sólo se PARSEA y se anota; con
// `TMDB_REINTENTOS=0` (el default) nadie espera ese tiempo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parsearRetryAfter } from "./retry-after.ts";

const AHORA = Date.parse("2026-09-14T15:00:00.000Z");

test("segundos enteros → milisegundos", () => {
  assert.equal(parsearRetryAfter("5", AHORA), 5000);
  assert.equal(parsearRetryAfter("0", AHORA), 0);
  assert.equal(parsearRetryAfter(" 12 ", AHORA), 12000);
});

test("fecha HTTP futura → diferencia contra `ahora`", () => {
  assert.equal(parsearRetryAfter("Mon, 14 Sep 2026 15:00:30 GMT", AHORA), 30000);
});

test("fecha HTTP pasada → null (no hay nada que esperar)", () => {
  assert.equal(parsearRetryAfter("Mon, 14 Sep 2026 14:59:30 GMT", AHORA), null);
});

test("ausente, vacío, negativo, decimal raro o texto → null", () => {
  assert.equal(parsearRetryAfter(null, AHORA), null);
  assert.equal(parsearRetryAfter(undefined, AHORA), null);
  assert.equal(parsearRetryAfter("", AHORA), null);
  assert.equal(parsearRetryAfter("-3", AHORA), null);
  assert.equal(parsearRetryAfter("abc", AHORA), null);
  assert.equal(parsearRetryAfter("5s", AHORA), null);
  assert.equal(parsearRetryAfter("1e3", AHORA), null);
});

test("un valor absurdo (más de un día) se devuelve tal cual: acotarlo es política, no parseo", () => {
  assert.equal(parsearRetryAfter("100000", AHORA), 100_000_000);
});
