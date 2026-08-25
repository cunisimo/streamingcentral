import { test } from "node:test";
import assert from "node:assert/strict";
import {
  conPlataformaDeLaFuente, evidenciaOficial, plataformasDeFicha, type FilaOficial,
} from "./top-plataformas.ts";
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

// ============================================================================
// La misma evidencia, ahora para la FICHA
// ============================================================================

// Las filas reales de la semana 2026-08-16 que importan para estos tests.
const MORIA = 322428;      // tv #1, resuelta, needs_review = false
const OPERATION = 284753;  // tv #7, resuelta por la consulta reducida -> needs_review = true

const FILAS: FilaOficial[] = [
  { category: "tv", tmdb_id: MORIA, needs_review: false },
  { category: "tv", tmdb_id: OPERATION, needs_review: true },
  { category: "tv", tmdb_id: null, needs_review: true },
  { category: "movie", tmdb_id: 1284041, needs_review: false },
];

// Puerto que además cuenta las veces que lo llamaron: dos de los tests de abajo
// son sobre la llamada que NO se hace.
function puerto(ids: string[] | "falla") {
  const estado = { llamadas: 0 };
  const leer = async () => {
    estado.llamadas++;
    if (ids === "falla") throw new Error("supabase 503");
    return new Set(ids);
  };
  return { leer, estado };
}

test("evidencia: sólo las filas resueltas y sin revisión pendiente", () => {
  assert.deepEqual(evidenciaOficial(FILAS), [`tv:${MORIA}`, "movie:1284041"]);
});

test("Moria: providers vacío + evidencia oficial confiable -> [n]", async () => {
  // El caso reportado. TMDB tiene la ficha de `tv/322428` pero
  // `/tv/322428/watch/providers` devuelve `results: {}` — ni AR ni ninguna otra
  // región—, así que la ficha decía "No está en streaming" para el #1 del top
  // oficial de Netflix.
  const p = puerto(evidenciaOficial(FILAS));
  assert.deepEqual(await plataformasDeFicha("tv", MORIA, [], p.leer), ["n"]);
  assert.equal(p.estado.llamadas, 1);
});

test("sin evidencia: sigue vacío", async () => {
  const p = puerto([]);
  assert.deepEqual(await plataformasDeFicha("tv", MORIA, [], p.leer), []);
});

test("un título que no está en el top no hereda nada", async () => {
  const p = puerto(evidenciaOficial(FILAS));
  assert.deepEqual(await plataformasDeFicha("tv", 999999, [], p.leer), []);
});

test("needs_review = true: NO se infiere disponibilidad", async () => {
  // `needs_review` marca las filas donde el título de TMDB no es el que publicó
  // Netflix. En el top se muestran igual (el peor caso es una card de más),
  // pero la ficha dice "Disponible en Netflix", y eso no se afirma sobre una
  // fila que nosotros mismos marcamos como dudosa.
  const p = puerto(evidenciaOficial(FILAS));
  assert.deepEqual(await plataformasDeFicha("tv", OPERATION, [], p.leer), []);
});

test("el tipo forma parte de la clave: la película 1284041 no presta su id a la serie", async () => {
  // TMDB reutiliza los números entre tipos.
  const p = puerto(evidenciaOficial(FILAS));
  assert.deepEqual(await plataformasDeFicha("movie", 1284041, [], p.leer), ["n"]);
  assert.deepEqual(await plataformasDeFicha("tv", 1284041, [], p.leer), []);
});

test("si Supabase se cae, NO se inventa disponibilidad", async () => {
  // Una caída de nuestra base no puede producir una afirmación sobre dónde ver
  // algo. Nunca al revés: la ficha se queda como estaba.
  const p = puerto("falla");
  assert.deepEqual(await plataformasDeFicha("tv", MORIA, [], p.leer), []);
  assert.equal(p.estado.llamadas, 1);
});

test("Operation conserva Netflix desde TMDB, y no se consulta la evidencia", async () => {
  // `tv/284753` sí tiene proveedores en TMDB (Netflix AR). Como TMDB ya sabe,
  // la evidencia ni se lee: cero lecturas a Supabase en el camino normal, que
  // es el de casi todas las fichas.
  const p = puerto(evidenciaOficial(FILAS));
  const deTmdb: PlatformCode[] = ["n"];
  assert.equal(await plataformasDeFicha("tv", OPERATION, deTmdb, p.leer), deTmdb);
  assert.equal(p.estado.llamadas, 0, "consultó la evidencia teniendo datos de TMDB");
});

test("con otra plataforma en TMDB tampoco se consulta ni se agrega Netflix", async () => {
  const p = puerto(evidenciaOficial(FILAS));
  const deTmdb: PlatformCode[] = ["p"];
  assert.equal(await plataformasDeFicha("tv", MORIA, deTmdb, p.leer), deTmdb);
  assert.equal(p.estado.llamadas, 0);
});

test("no muta el array CACHEADO de providersOf", async () => {
  // `providersOf` cachea `{ codes, links, watchLink }` y `codes` es el array
  // guardado. Un `push` acá le mete Netflix a todas las superficies que
  // compartan esa entrada de cache.
  const cacheado: PlatformCode[] = [];
  const p = puerto(evidenciaOficial(FILAS));
  const r = await plataformasDeFicha("tv", MORIA, cacheado, p.leer);
  assert.deepEqual(cacheado, [], "el array cacheado quedó tocado");
  assert.notEqual(r, cacheado, "devolvió el mismo array en vez de uno nuevo");
});
