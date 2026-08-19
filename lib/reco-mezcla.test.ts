import { test } from "node:test";
import assert from "node:assert/strict";
import { elegirOrigenes, intercalarPorOrigen, mezclarTipos, type Senal } from "./reco-mezcla.ts";
import type { MediaType } from "./types.ts";

const s = (tipo: MediaType, id: number, peso: 3 | 2 | 1): Senal => ({ tipo, id, peso });
const cand = (tipo: MediaType, id: number, oTipo: MediaType, oId: number, apoyos = 1) =>
  ({ type: tipo, id, porque: { tipo: oTipo, id: oId }, apoyos });

// --- elegirOrigenes ----------------------------------------------------------

test("un título en Mi lista Y votado ocupa UN solo lugar, con su señal más fuerte", () => {
  // Es el bug: con 6 lugares y este título duplicado, el riel se armaba sobre 5
  // orígenes y ese título pesaba doble en el intercalado.
  const r = elegirOrigenes([
    s("movie", 100, 1),   // Mi lista
    s("movie", 100, 3),   // y además Petacular
    s("tv", 200, 2),
  ], 6);
  assert.equal(r.length, 2);
  assert.equal(r.filter((x) => x.id === 100).length, 1);
  assert.equal(r.find((x) => x.id === 100)!.peso, 3, "se conserva la más fuerte");
});

test("la jerarquía funciona por disponibilidad, sin cupo por nivel", () => {
  // Si solo hay Mi lista, Mi lista ocupa todos los lugares.
  const soloLista = elegirOrigenes([s("movie", 1, 1), s("movie", 2, 1), s("tv", 3, 1)], 6);
  assert.equal(soloLista.length, 3);
  assert.ok(soloLista.every((x) => x.peso === 1));
});

test("con más señales que lugares, ganan las más fuertes", () => {
  const r = elegirOrigenes([
    s("movie", 1, 1), s("movie", 2, 1), s("movie", 3, 3), s("tv", 4, 2),
  ], 2);
  assert.deepEqual(r.map((x) => x.id), [3, 4]);
});

test("una película y una serie con el MISMO id son dos orígenes distintos", () => {
  // TMDB numera los dos tipos por separado: existe la película 1399 y la serie
  // 1399. Deduplicar por id pelado las fusionaba.
  const r = elegirOrigenes([s("movie", 1399, 3), s("tv", 1399, 3)], 6);
  assert.equal(r.length, 2);
});

// --- intercalarPorOrigen -----------------------------------------------------

test("el primer origen no se lleva el riel", () => {
  // Cinco candidatos de un origen y uno de otro: el segundo origen tiene que
  // aparecer en el puesto 2, no al final.
  const r = intercalarPorOrigen([
    cand("movie", 1, "movie", 10), cand("movie", 2, "movie", 10),
    cand("movie", 3, "movie", 10), cand("movie", 4, "movie", 10),
    cand("movie", 5, "movie", 10), cand("tv", 6, "tv", 20),
  ]);
  assert.equal(r[0].porque.id, 10);
  assert.equal(r[1].porque.id, 20, "el segundo origen entra segundo, no sexto");
});

test("dos orígenes con el mismo id y distinto tipo NO se fusionan", () => {
  const r = intercalarPorOrigen([
    cand("movie", 1, "movie", 1399), cand("movie", 2, "movie", 1399),
    cand("tv", 3, "tv", 1399),
  ]);
  // Si se fusionaran, los tres saldrían del mismo grupo y el orden sería 1,2,3.
  assert.equal(r[1].porque.tipo, "tv", "el origen serie 1399 va segundo");
});

test("dentro de un origen, primero los que tienen más apoyos", () => {
  const r = intercalarPorOrigen([
    cand("movie", 1, "movie", 10, 1), cand("movie", 2, "movie", 10, 3),
  ]);
  assert.equal(r[0].id, 2);
});

test("no pierde ni duplica candidatos", () => {
  const entrada = [
    cand("movie", 1, "movie", 10), cand("movie", 2, "movie", 10),
    cand("tv", 3, "tv", 20), cand("tv", 4, "tv", 30),
  ];
  const r = intercalarPorOrigen(entrada);
  assert.equal(r.length, entrada.length);
  assert.equal(new Set(r.map((x) => `${x.type}:${x.id}`)).size, entrada.length);
});

// --- mezclarTipos ------------------------------------------------------------

test("la fila se ve MIXTA: alterna, no pone un bloque y después el otro", () => {
  // El bug: 10 películas seguidas y después 10 series. En mobile entran 2,5
  // tarjetas, así que la primera serie quedaba a cinco pantallas de scroll.
  const items = [
    ...Array.from({ length: 10 }, (_, i) => ({ type: "movie" as MediaType, id: i })),
    ...Array.from({ length: 10 }, (_, i) => ({ type: "tv" as MediaType, id: 100 + i })),
  ];
  const r = mezclarTipos(items, 20, 10);
  assert.equal(r.length, 20);
  assert.equal(r.filter((x) => x.type === "movie").length, 10);
  assert.equal(r.filter((x) => x.type === "tv").length, 10);
  // Lo que realmente se pide: que entre los primeros cuatro haya de los dos.
  const primeros = r.slice(0, 4).map((x) => x.type);
  assert.ok(primeros.includes("movie") && primeros.includes("tv"),
    `los primeros cuatro tienen que ser mixtos, salieron: ${primeros.join(",")}`);
  // Y que ninguna corrida del mismo tipo sea larga.
  let corrida = 1, peor = 1;
  for (let i = 1; i < r.length; i++) {
    corrida = r[i].type === r[i - 1].type ? corrida + 1 : 1;
    peor = Math.max(peor, corrida);
  }
  assert.ok(peor <= 2, `la corrida más larga del mismo tipo fue ${peor}`);
});

test("si un lado escasea, el otro completa hasta el objetivo", () => {
  const items = [
    ...Array.from({ length: 18 }, (_, i) => ({ type: "movie" as MediaType, id: i })),
    { type: "tv" as MediaType, id: 100 },
    { type: "tv" as MediaType, id: 101 },
  ];
  const r = mezclarTipos(items, 20, 10);
  assert.equal(r.length, 20, "se llega al objetivo total aunque el tope por tipo se pase");
  assert.equal(r.filter((x) => x.type === "tv").length, 2);
});

test("el lado que escasea queda repartido, no amontonado al final", () => {
  const items = [
    ...Array.from({ length: 18 }, (_, i) => ({ type: "movie" as MediaType, id: i })),
    { type: "tv" as MediaType, id: 100 },
    { type: "tv" as MediaType, id: 101 },
  ];
  const r = mezclarTipos(items, 20, 10);
  const posiciones = r.map((x, i) => (x.type === "tv" ? i : -1)).filter((i) => i >= 0);
  assert.ok(posiciones[0] < 4, `la primera serie apareció en la posición ${posiciones[0]}`);
});

test("con un solo tipo devuelve ese tipo y no rompe", () => {
  const items = Array.from({ length: 12 }, (_, i) => ({ type: "movie" as MediaType, id: i }));
  const r = mezclarTipos(items, 20, 10);
  assert.equal(r.length, 12);
});
