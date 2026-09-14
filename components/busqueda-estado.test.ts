// El aviso "la fuente (TMDB) no responde" de la búsqueda tiene que
// corresponder ÚNICAMENTE a la respuesta vigente (auditoría de Codex sobre
// e930a1d, hallazgo 4): en e930a1d, `SearchView` ponía `fuenteCaida = true`
// ante un 503 y sólo lo pisaba con la siguiente respuesta que LLEGABA; si la
// búsqueda siguiente fallaba por red (catch), se cancelaba (respuesta
// descartada) o cambiaba el término (sin respuesta todavía), el aviso viejo
// quedaba en pantalla.
//
// La decisión vive en un reductor PURO (components/busqueda-estado.ts), sin
// DOM, como el resto de la lógica de hooks de este proyecto.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ESTADO_INICIAL, reducirBusqueda } from "./busqueda-estado.ts";

const vacio = { titles: [], people: [] };

test("un 503 con motivo de TMDB enciende el aviso; una respuesta ok lo apaga", () => {
  const con503 = reducirBusqueda(ESTADO_INICIAL, { tipo: "respuesta", ok: false, body: { error: "tmdb-no-disponible", ...vacio } });
  assert.equal(con503.fuenteCaida, true);
  assert.deepEqual(con503.res, vacio);
  const ok = reducirBusqueda(con503, { tipo: "respuesta", ok: true, body: { titles: [{ id: 1 }], people: [] } });
  assert.equal(ok.fuenteCaida, false);
  assert.equal(ok.res.titles.length, 1);
});

test("🔴 tras un 503 de TMDB, un fallo de RED de la búsqueda siguiente NO conserva el aviso viejo", () => {
  const con503 = reducirBusqueda(ESTADO_INICIAL, { tipo: "respuesta", ok: false, body: { error: "tmdb-no-disponible", ...vacio } });
  const red = reducirBusqueda(con503, { tipo: "fallo-red" });
  assert.equal(red.fuenteCaida, false);
  assert.equal(red.cargando, false);
});

test("🔴 tras un 503 de TMDB, una búsqueda CANCELADA (respuesta descartada por vieja) no conserva el aviso", () => {
  const con503 = reducirBusqueda(ESTADO_INICIAL, { tipo: "respuesta", ok: false, body: { error: "tmdb-no-disponible", ...vacio } });
  const nueva = reducirBusqueda(con503, { tipo: "nuevo-termino" });
  assert.equal(nueva.fuenteCaida, false, "al empezar otra búsqueda el aviso se limpia");
  // Una respuesta que llega para un pedido ya superado no toca nada.
  const tardia = reducirBusqueda(nueva, { tipo: "respuesta", ok: false, body: { error: "tmdb-no-disponible", ...vacio }, vigente: false });
  assert.equal(tardia.fuenteCaida, false);
  assert.deepEqual(tardia, nueva);
});

test("🔴 tras un 503 de TMDB, cambiar de término (menos de 2 letras: sin pedido) tampoco conserva el aviso", () => {
  const con503 = reducirBusqueda(ESTADO_INICIAL, { tipo: "respuesta", ok: false, body: { error: "tmdb-no-disponible", ...vacio } });
  const corto = reducirBusqueda(con503, { tipo: "termino-corto" });
  assert.equal(corto.fuenteCaida, false);
  assert.deepEqual(corto.res, vacio);
});

test("un error que no es de TMDB (500 propio, cuerpo sin motivo) no enciende el aviso de TMDB", () => {
  const r = reducirBusqueda(ESTADO_INICIAL, { tipo: "respuesta", ok: false, body: { error: "Error: algo", ...vacio } });
  assert.equal(r.fuenteCaida, false);
});
