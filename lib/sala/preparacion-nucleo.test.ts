// Selección pura de las cards de una tanda (plan de salas, Tarea 2.1).
//
// Lo que fija: se recorren las candidatas EN SU ORDEN (ya vienen ordenadas por
// la semilla de la sala), entra la que tiene card y sigue en al menos una
// plataforma de la unión, se corta en `size`, la posición es 0..size-1, y una
// candidata sin "pero" conserva `advertencia: null` (no se inventa texto).
import { test } from "node:test";
import assert from "node:assert/strict";
import { elegirCards, tamaniosAlcanzables, enPlataformasDeLaSala } from "./preparacion-nucleo.ts";
import { LIMITE_SEG, SIZES, DURACIONES, CONFIG_DEFAULT } from "./tipos.ts";
import type { Candidata } from "./tipos.ts";
import type { UITitle } from "../types.ts";

const card = (id: number, platforms: string[], extra: Partial<UITitle> = {}): UITitle => ({
  id, type: "movie", title: "T" + id, year: 2001, runtime: null, poster: "https://img/p" + id, country: null,
  genres: ["drama"], platforms: platforms as UITitle["platforms"], tmdb: null, hasEditorial: false, ...extra,
});
const cand = (id: number, extra: Partial<Candidata> = {}): Candidata => ({ tmdb_id: id, runtime: 100, razon: "r" + id, advertencia: "a" + id, year: 2001, genres: ["Drama"], ...extra });

test("toma en orden las que siguen en la unión y corta en size", () => {
  const cards = new Map([[1, card(1, ["n"])], [2, card(2, ["mb"])], [3, card(3, ["d"])], [4, card(4, ["n"])]]);
  const r = elegirCards([cand(1), cand(2), cand(3), cand(4)], cards, ["n", "d"], 5);
  assert.deepEqual(r.cards.map((c) => c.tmdb_id), [1, 3, 4]);
  assert.deepEqual(r.cards.map((c) => c.pos), [0, 1, 2]);
  assert.equal(r.faltan, 2);
  assert.equal(r.validas, 3);
});

test("con más válidas que size, se queda con las primeras size (el orden es el de la semilla)", () => {
  const cs = [1, 2, 3, 4, 5, 6, 7].map((i) => cand(i));
  const mapa = new Map(cs.map((c) => [c.tmdb_id, card(c.tmdb_id, ["n"])]));
  const r = elegirCards(cs, mapa, ["n"], 5);
  assert.deepEqual(r.cards.map((c) => c.tmdb_id), [1, 2, 3, 4, 5]);
  assert.equal(r.faltan, 0); assert.equal(r.validas, 7);
});

test("una candidata sin card (TMDB no la enriqueció) se descarta", () => {
  const r = elegirCards([cand(1), cand(2)], new Map([[2, card(2, ["n"])]]), ["n"], 5);
  assert.deepEqual(r.cards.map((c) => c.tmdb_id), [2]);
});

test("una candidata sin pero conserva advertencia null en la card (no se inventa texto); la vacía o de espacios también queda null", () => {
  const cs = [cand(7, { advertencia: null }), cand(8, { advertencia: "   " }), cand(9, { advertencia: "" })];
  const mapa = new Map(cs.map((c) => [c.tmdb_id, card(c.tmdb_id, ["n"])]));
  const r = elegirCards(cs, mapa, ["n"], 5);
  assert.deepEqual(r.cards.map((c) => c.advertencia), [null, null, null]);
  assert.equal(r.cards[0].razon, "r7");
});

test("la card toma título, año, póster y géneros de la UITitle, y la duración de la candidata", () => {
  const r = elegirCards([cand(5, { runtime: 95 })], new Map([[5, card(5, ["n", "d"], { title: "Cinco", year: 1999, genres: ["accion", "drama"] })]]), ["d"], 5);
  assert.deepEqual(r.cards[0], {
    pos: 0, tmdb_id: 5, titulo: "Cinco", anio: 1999, runtime: 95, poster: "https://img/p5",
    generos: ["accion", "drama"], platforms: ["n", "d"], razon: "r5", advertencia: "a5",
  });
});

test("una candidata sin duración comprobable no entra aunque tenga card", () => {
  const r = elegirCards([cand(1, { runtime: 0 }), cand(2)], new Map([[1, card(1, ["n"])], [2, card(2, ["n"])]]), ["n"], 5);
  assert.deepEqual(r.cards.map((c) => c.tmdb_id), [2]);
});

test("enPlataformasDeLaSala: basta UNA plataforma en común; la unión vacía no acepta nada", () => {
  assert.equal(enPlataformasDeLaSala(["n", "mb"], ["d", "n"]), true);
  assert.equal(enPlataformasDeLaSala(["mb"], ["d", "n"]), false);
  assert.equal(enPlataformasDeLaSala([], ["n"]), false);
  assert.equal(enPlataformasDeLaSala(["n"], []), false);
});

test("tamaños alcanzables", () => {
  assert.deepEqual(tamaniosAlcanzables(4), []);
  assert.deepEqual(tamaniosAlcanzables(5), [5]);
  assert.deepEqual(tamaniosAlcanzables(12), [5, 10]);
  assert.deepEqual(tamaniosAlcanzables(20), [5, 10, 20]);
  assert.deepEqual(tamaniosAlcanzables(80), [5, 10, 20]);
});

test("constantes: límites, tamaños, duraciones y default coherentes con la base", () => {
  assert.deepEqual(LIMITE_SEG, { 5: 120, 10: 180, 20: 300 });
  assert.deepEqual([...SIZES], [5, 10, 20]);
  assert.deepEqual([...DURACIONES], ["cualquiera", "corta", "larga"]);
  assert.deepEqual(CONFIG_DEFAULT, { size: 10, duracion: "cualquiera" });
  // 10 s por card nunca supera el límite global.
  for (const s of SIZES) assert.ok(s * 10 < LIMITE_SEG[s]);
});
