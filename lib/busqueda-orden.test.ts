import { test } from "node:test";
import assert from "node:assert/strict";
import { ordenarPorRelevancia, relevancia, sinAcentos } from "./busqueda-orden.ts";

const t = (id: number, title: string, popularity = 1) => ({ id, title, popularity });
const OPTS = {
  nombreDe: (x: { title: string }) => x.title,
  popDe: (x: { popularity: number }) => x.popularity,
};

// --- relevancia (sin cambios de lógica, se fija el comportamiento) -----------

test("los tres niveles", () => {
  assert.equal(relevancia("Matrix", "matrix", true), 3, "exacto");
  assert.equal(relevancia("Matrix Reloaded", "matrix", true), 2, "empieza con");
  assert.equal(relevancia("Duro de matar", "matar", true), 2, "una palabra empieza con");
  assert.equal(relevancia("Escuadrón suicida", "cuadr", true), 1, "contiene");
  assert.equal(relevancia("Solo en casa", "duro de matar", true), 0, "no calza");
});

test("ignora acentos y mayúsculas", () => {
  assert.equal(sinAcentos("Mi pobre angelito"), "mi pobre angelito");
  assert.equal(relevancia("Mi pobre ANGELITO", "angélito", true), 2);
});

test("sin nivel exacto, el nombre completo no gana nada extra", () => {
  // La asimetría de personas: se busca tecleando de a poco.
  assert.equal(relevancia("Ste", "ste", false), 2);
  assert.equal(relevancia("Ste", "ste", true), 3);
});

// --- alias: lo que arregla los títulos latinoamericanos ---------------------

test("sin conservarAlias, lo que no calza se descarta (personas)", () => {
  const r = ordenarPorRelevancia([t(1, "Matrix"), t(2, "Solo en casa")], "matrix", OPTS);
  assert.deepEqual(r.map((x) => x.id), [1]);
});

test("con conservarAlias, lo que TMDB encontró por otro nombre NO se tira", () => {
  // El caso real: buscás "La jungla de cristal" en es-MX y TMDB devuelve la 562
  // titulada "Duro de matar". El título visible no contiene la consulta, pero
  // TMDB la encontró por el título alternativo: descartarla es tirar un acierto.
  const r = ordenarPorRelevancia(
    [t(562, "Duro de matar"), t(1572, "Duro de matar 3: La venganza")],
    "la jungla de cristal",
    { ...OPTS, exacto: true, conservarAlias: true },
  );
  assert.deepEqual(r.map((x) => x.id), [562, 1572], "las dos sobreviven");
});

test("los directos van PRIMERO y los alias después", () => {
  const r = ordenarPorRelevancia(
    [t(1, "Alias A"), t(2, "Matrix Reloaded"), t(3, "Alias B"), t(4, "Matrix", 5)],
    "matrix",
    { ...OPTS, exacto: true, conservarAlias: true },
  );
  assert.deepEqual(r.map((x) => x.id), [4, 2, 1, 3]);
});

test("los alias conservan el ORDEN DE TMDB, no se reordenan por popularidad", () => {
  // No hay con qué medir su relevancia de nuestro lado: el único criterio
  // honesto es el ranking de quien los encontró.
  const r = ordenarPorRelevancia(
    [t(1, "Primero de TMDB", 1), t(2, "Segundo de TMDB", 999)],
    "nada que calce",
    { ...OPTS, exacto: true, conservarAlias: true },
  );
  assert.deepEqual(r.map((x) => x.id), [1, 2], "el popular NO se adelanta");
});

test("entre los directos sí manda la popularidad dentro de cada nivel", () => {
  const r = ordenarPorRelevancia(
    [t(1, "Matrix Reloaded", 1), t(2, "Matrix Revolutions", 9)],
    "matrix",
    { ...OPTS, exacto: true, conservarAlias: true },
  );
  assert.deepEqual(r.map((x) => x.id), [2, 1]);
});

test("el nombre completo le gana a un prefijo más popular", () => {
  const r = ordenarPorRelevancia(
    [t(1, "Matrix Resurrections", 999), t(2, "Matrix", 1)],
    "matrix",
    { ...OPTS, exacto: true, conservarAlias: true },
  );
  assert.deepEqual(r.map((x) => x.id), [2, 1]);
});

test("no pierde ni duplica nada cuando se conservan los alias", () => {
  const items = [t(1, "Matrix"), t(2, "Otra"), t(3, "Matrix 2"), t(4, "Distinta")];
  const r = ordenarPorRelevancia(items, "matrix", { ...OPTS, exacto: true, conservarAlias: true });
  assert.equal(r.length, 4);
  assert.deepEqual(new Set(r.map((x) => x.id)), new Set([1, 2, 3, 4]));
});

test("con la lista vacía no rompe", () => {
  const vacio: { id: number; title: string; popularity: number }[] = [];
  assert.deepEqual(ordenarPorRelevancia(vacio, "matrix", { ...OPTS, conservarAlias: true }), []);
});
