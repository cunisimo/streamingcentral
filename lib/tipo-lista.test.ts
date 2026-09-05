// El `?tipo=` de `/lista/ultimos`, resuelto donde el export estático lo permite.
//
// ============================================================================
// EL BUG QUE ESTE TEST EXISTE PARA IMPEDIR
// ============================================================================
// El Server Component leía `searchParams.tipo`. Con `output: export` eso aborta
// el export ENTERO:
//
//     Route /lista/ultimos/ with `dynamic = "error"` couldn't be rendered
//     statically because it used `searchParams.tipo`
//
// El primer parche lo puso detrás de `ES_NATIVO` para salvar el export, y el
// precio fue que dentro del contenedor el parámetro se ignoraba: un enlace con
// `?tipo=tv` abría en Películas. Verificado en un Android físico en CP7.
//
// 🔴 LA LECTURA SE MUEVE AL CLIENTE, NO SE DUPLICA. Un camino por plataforma
// habría dejado dos formas de resolver lo mismo y una sola probada. Con
// `useSearchParams` dentro de un `<Suspense>` el tipo se conoce en el PRIMER
// render del cliente, así que no hay un pedido inicial de películas cuando la
// URL pide series — que es la diferencia con leerlo en un `useEffect`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tipoDeParametro } from "./tipo-lista.ts";

test("sólo el valor exacto tv abre en Series", () => {
  assert.equal(tipoDeParametro("tv"), "tv");
});

test("cualquier otra cosa cae en movie, que es el default del riel", () => {
  for (const v of ["movie", "", "series", "TV", "Tv", "tv ", " tv", "1", "null"]) {
    assert.equal(tipoDeParametro(v), "movie", `"${v}" no debería abrir en Series`);
  }
});

test("ausente o nulo cae en movie", () => {
  assert.equal(tipoDeParametro(null), "movie");
  assert.equal(tipoDeParametro(undefined), "movie");
});

test("el Server Component NO lee searchParams: eso aborta el export", () => {
  const src = readFileSync(new URL("../app/lista/[key]/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /searchParams/,
    "volvió `searchParams` al Server Component: el export nativo se rompe entero");
  assert.doesNotMatch(src, /ES_NATIVO/,
    "el parche por plataforma ya no hace falta: la lectura es del cliente en las dos");
});

test("el tipo se resuelve en el cliente, bajo un Suspense con fallback VISIBLE", () => {
  // 🔴 El fallback no puede ser `null`. Con `output: export` esta rama se
  // prerenderiza con el fallback puesto: un `null` deja la página en blanco
  // hasta que hidrata, que es peor que el bug que se está arreglando.
  const page = readFileSync(new URL("../app/lista/[key]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /<Suspense/, "no hay Suspense: useSearchParams no puede prerenderizarse");
  const fallback = /fallback=\{([\s\S]*?)\}/.exec(page);
  assert.ok(fallback, "el Suspense no declara fallback");
  assert.notEqual(fallback![1].trim(), "null", "el fallback es null: deja la pantalla en blanco");

  const cliente = readFileSync(new URL("../components/UltimosDesdeQuery.tsx", import.meta.url), "utf8");
  assert.match(cliente, /^"use client"/, "el lector del query tiene que ser de cliente");
  assert.match(cliente, /useSearchParams/, "no lee el query");
  assert.match(cliente, /tipoDeParametro/, "no usa la resolución compartida");
  // Sin comentarios: el archivo EXPLICA por qué no usa un efecto, y esa
  // explicación no puede hacer fallar al guard que vigila que no lo use.
  const codigo = cliente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.doesNotMatch(codigo, /useEffect/,
    "leer el tipo en un efecto dispara primero el pedido de películas");
});
