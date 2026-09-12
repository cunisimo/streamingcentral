// Topes de entrada para `q` (/api/search) e `items` (/api/upcoming). Etapa 1 (#18).
//
// Los números no son inventados y acá queda escrito de dónde salen:
//
//   MAX_Q = 120 caracteres. El título más largo del pool curado de la app mide
//   91 ("Dragon Ball Z: ¡La explosión del puño del dragón! Si Goku no puede
//   hacerlo, ¿quién lo hará?", data/contexto-ruleta.json) y el caso famoso de
//   TMDB, "Borat: Cultural Learnings of America for Make Benefit Glorious
//   Nation of Kazakhstan", mide 83. 120 cubre los dos con margen. Lo que se
//   corta NO es un título: es una cadena que cada variante convertía en una
//   entrada de caché y hasta 7 llamadas a TMDB. Se TRUNCA, no se rechaza: el
//   buscador sigue respondiendo.
//
//   MAX_ITEMS_UPCOMING = 100 refs. Es el mismo tope que ya aplica el propio
//   handler a `limit` (`Math.min(limitRaw, 100)`), y hoy NINGUNA vista manda
//   `items=` a /api/upcoming (sólo `mix`): el cruce con la watchlist es un eje
//   previsto, no en uso. 100 refs son ~1,3 KB de query y un `.in()` de 100 ids
//   en PostgREST, lejos de cualquier límite de URL. Se conservan los primeros
//   100, en orden: determinista.
//
// Escrito ANTES del módulo: fallaba al importar.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { acotarQ, acotarRefs, MAX_Q, MAX_ITEMS_UPCOMING } from "./limites-entrada.ts";

test("🔴 q: se trunca a MAX_Q, no se rechaza; lo corto pasa intacto", () => {
  assert.equal(MAX_Q, 120);
  const largo = "x".repeat(500);
  assert.equal(acotarQ(largo).length, 120);
  assert.equal(acotarQ("matrix"), "matrix");
  assert.equal(acotarQ("  matrix  "), "matrix", "se recorta el espacio de los bordes, como hacía el buscador");
});

test("q: el título más largo del pool curado y el de Borat pasan enteros", () => {
  const dbz = "Dragon Ball Z: ¡La explosión del puño del dragón! Si Goku no puede hacerlo, ¿quién lo hará?";
  const borat = "Borat: Cultural Learnings of America for Make Benefit Glorious Nation of Kazakhstan";
  assert.equal(dbz.length, 91);
  assert.equal(borat.length, 83);
  assert.equal(acotarQ(dbz), dbz);
  assert.equal(acotarQ(borat), borat);
});

test("q: un tope en caracteres, no en bytes: los acentos no cuentan doble", () => {
  const acentos = "á".repeat(120);
  assert.equal(acotarQ(acentos), acentos);
});

test("🔴 items: se conservan los primeros MAX_ITEMS_UPCOMING en orden", () => {
  assert.equal(MAX_ITEMS_UPCOMING, 100);
  const refs = Array.from({ length: 250 }, (_, i) => ({ tipo: "movie" as const, tmdb_id: i }));
  const out = acotarRefs(refs);
  assert.equal(out.length, 100);
  assert.equal(out[0].tmdb_id, 0);
  assert.equal(out[99].tmdb_id, 99);
  assert.deepEqual(acotarRefs(refs.slice(0, 3)), refs.slice(0, 3));
});

const sinComentarios = (rel: string) => readFileSync(rel, "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

test("🔴 /api/search acota q ANTES de buscar (y por lo tanto antes de la clave de caché)", () => {
  const ruta = sinComentarios("app/api/search/route.ts");
  assert.match(ruta, /acotarQ\(/, "la ruta no acota q");
  assert.match(ruta, /const q = acotarQ\(/, "q no sale acotada de la lectura del parámetro");
});

test("🔴 /api/upcoming acota items antes de consultar", () => {
  const ruta = sinComentarios("app/api/upcoming/route.ts");
  assert.match(ruta, /acotarRefs\(/, "la ruta no acota items");
  assert.match(ruta, /upcomingForRefs\(acotarRefs\(refs\)\)/, "los refs llegan sin tope a la consulta");
});
