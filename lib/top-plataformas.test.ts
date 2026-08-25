import { test } from "node:test";
import assert from "node:assert/strict";
import { conPlataformaDeLaFuente } from "./top-plataformas.ts";
import type { MediaType, PlatformCode, UITitle } from "./types.ts";

const card = (platforms: PlatformCode[], type: MediaType = "tv"): UITitle => ({
  id: 322428, type, title: "Moria", year: 2026, runtime: null, poster: null,
  country: "AR", genres: [], platforms, tmdb: 7.5, hasEditorial: false,
});

test("sin proveedores en TMDB, la fuente pone la plataforma", () => {
  // El caso real: `tv/322428` ("Moria") entró #1 del top oficial de Netflix AR
  // de la semana 2026-08-16 y TMDB no tiene `watch/providers` en NINGUNA región
  // —estrenó el 14/08, dos días antes del cierre de esa semana—. La card la
  // pintaba en gris con "No está en tus plataformas" adentro del bloque de
  // Netflix, que es justamente donde no puede pasar.
  const r = conPlataformaDeLaFuente(card([]), "n");
  assert.deepEqual(r.platforms, ["n"]);
});

test("no muta el objeto de entrada: `platforms` es el array CACHEADO", () => {
  // `cardsByIds` devuelve `{ ...c }`, pero el array `platforms` sigue siendo la
  // MISMA referencia que guardó el cache (Redis en producción, memoria en un
  // cold start sin credenciales). Un `push` acá le agrega Netflix a la ficha
  // que ve el resto de la app.
  const original = card([]);
  const antes = original.platforms;
  const r = conPlataformaDeLaFuente(original, "n");
  assert.deepEqual(antes, [], "el array de entrada quedó tocado");
  assert.notEqual(r.platforms, antes, "devolvió el mismo array, no una copia");
});

test("si TMDB ya la trae, se devuelve el MISMO objeto", () => {
  // Sin copia inútil: 9 de cada 10 slots pasan por acá.
  const original = card(["n"]);
  assert.equal(conPlataformaDeLaFuente(original, "n"), original);
});

test("si TMDB dice que está en OTRA plataforma, no se toca", () => {
  // Éste es el límite de la regla y el motivo de que no sea un simple "agregá
  // la plataforma si falta". Que TMDB conozca el título y lo ubique en Prime
  // NO es un lag: es la señal de que la resolución del TSV agarró el título
  // equivocado (un homónimo). Netflix no puede haber reportado como visto en
  // Netflix algo que no está en Netflix, así que acá el dato en conflicto es
  // NUESTRO. Pintarla en gris es lo correcto: es la única pista visible de que
  // ese slot hay que revisarlo.
  const original = card(["p", "m"]);
  assert.equal(conPlataformaDeLaFuente(original, "n"), original);
  assert.deepEqual(original.platforms, ["p", "m"]);
});
