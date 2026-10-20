// Las reglas del Top manual que se pueden decidir sin base ni red.
//
// ============================================================================
// LAS DOS QUE IMPORTAN
// ============================================================================
//  1. **Los doce bloques.** Desde el 2026-10-20 ya no hay "cutover atómico":
//     cada bloque publicado se muestra solo, y el que falta se ve como
//     "todavía no disponible" (`lib/top-solo-manual.test.ts`). El panel cuenta
//     cuántos de LOS doce tienen publicación.
//  2. **La evidencia de disponibilidad sale sólo de lo PUBLICADO y vence a los
//     14 días.** Un borrador no dice nada del mundo, y una captura vieja tampoco.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BLOQUES, evidenciaDeRankings, posicionesDeReordenar, preparacion, validarBloque,
} from "./top-manual-nucleo.ts";

const diez = (n = 10) => Array.from({ length: n }, (_, i) => ({
  posicion: i + 1, tipo: "tv" as const, tmdb_id: 100 + i, titulo: `T${i + 1}`,
}));

// --- los 12 bloques ----------------------------------------------------------

test("son doce bloques: seis plataformas por dos tipos", () => {
  assert.equal(BLOQUES.length, 12);
  assert.deepEqual(
    [...new Set(BLOQUES.map((b) => b.plataforma))].sort(),
    ["at", "cr", "d", "m", "n", "p"],
  );
  assert.equal(BLOQUES.filter((b) => b.tipo === "movie").length, 6);
});

// --- los doce, completos -----------------------------------------------------

test("`listo` exige LOS doce bloques publicados", () => {
  const todos = BLOQUES.map((b) => `${b.plataforma}:${b.tipo}`);
  assert.equal(preparacion(todos).listo, true);
  for (const falta of ["n:movie", "cr:tv", "at:movie"]) {
    assert.equal(preparacion(todos.filter((k) => k !== falta)).listo, false, `faltando ${falta} dio listo`);
  }
});

// --- validación de un bloque -------------------------------------------------

test("un bloque válido son diez posiciones sin huecos ni repetidos", () => {
  assert.deepEqual(validarBloque(diez()), []);
});

test("rechaza bloques incompletos, con huecos y con repetidos", () => {
  assert.match(validarBloque(diez(9))[0], /faltan|10/);

  const conHueco = diez(); conHueco[4].posicion = 11;
  assert.ok(validarBloque(conHueco).length, "aceptó una posición fuera de 1..10");

  const repetido = diez(); repetido[3].tmdb_id = repetido[0].tmdb_id;
  assert.match(validarBloque(repetido).join(" "), /repet/i);

  const dosVeces = diez(); dosVeces[3].posicion = 1;
  assert.ok(validarBloque(dosVeces).length, "aceptó dos títulos en la misma posición");
});

// --- reordenamiento ----------------------------------------------------------

test("reordenar renumera 1..10 sin huecos", () => {
  const r = posicionesDeReordenar(diez(), 1, 5);
  assert.deepEqual(r.map((x) => x.posicion), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  // El que estaba primero quedó quinto y los del medio subieron uno.
  assert.equal(r[4].tmdb_id, 100);
  assert.equal(r[0].tmdb_id, 101);
});

test("reordenar hacia arriba también conserva el conjunto", () => {
  const antes = diez();
  const r = posicionesDeReordenar(antes, 8, 2);
  assert.equal(r[1].tmdb_id, 107);
  assert.deepEqual(
    r.map((x) => x.tmdb_id).sort((a, b) => a - b),
    antes.map((x) => x.tmdb_id).sort((a, b) => a - b),
  );
});

test("un movimiento inválido no cambia nada", () => {
  const antes = diez();
  for (const [de, a] of [[0, 3], [1, 99], [11, 2], [3, 3]] as [number, number][]) {
    assert.deepEqual(posicionesDeReordenar(antes, de, a).map((x) => x.tmdb_id),
      antes.map((x) => x.tmdb_id), `${de}->${a} movió algo`);
  }
});

// --- evidencia de disponibilidad ---------------------------------------------

const fila = (over: Partial<{ plataforma: string; tipo: string; tmdb_id: number; captured_at: string }> = {}) => ({
  plataforma: "n", tipo: "tv", tmdb_id: 322428, captured_at: "2026-09-01", ...over,
});

test("la evidencia sale de lo publicado y dice la plataforma", () => {
  const e = evidenciaDeRankings([fila(), fila({ plataforma: "d", tmdb_id: 275224 })], "2026-09-05");
  assert.deepEqual(e.get("tv:322428"), ["n"]);
  assert.deepEqual(e.get("tv:275224"), ["d"]);
});

test("🔴 la evidencia vence a los 14 días", () => {
  // Es la misma ventana que el top oficial de Netflix, y por el mismo motivo:
  // una captura vieja no dice dónde está hoy un título.
  const e14 = evidenciaDeRankings([fila({ captured_at: "2026-09-01" })], "2026-09-15");
  assert.deepEqual(e14.get("tv:322428"), ["n"], "vencía justo en el día 14");
  const e15 = evidenciaDeRankings([fila({ captured_at: "2026-09-01" })], "2026-09-16");
  assert.equal(e15.has("tv:322428"), false, "no venció a los 15 días");
});

test("un título en dos plataformas acumula las dos", () => {
  const e = evidenciaDeRankings(
    [fila({ plataforma: "n" }), fila({ plataforma: "m" })], "2026-09-02");
  assert.deepEqual(e.get("tv:322428")?.sort(), ["m", "n"]);
});

test("no confunde la película 700 con la serie 700", () => {
  const e = evidenciaDeRankings(
    [fila({ tipo: "movie", tmdb_id: 700, plataforma: "n" }),
     fila({ tipo: "tv", tmdb_id: 700, plataforma: "d" })], "2026-09-02");
  assert.deepEqual(e.get("movie:700"), ["n"]);
  assert.deepEqual(e.get("tv:700"), ["d"]);
});

test("una plataforma que no es de las seis se ignora", () => {
  const e = evidenciaDeRankings([fila({ plataforma: "zz" })], "2026-09-02");
  assert.equal(e.size, 0);
});

// --- reordenar sobre un bloque INCOMPLETO ------------------------------------
//
// 🔴 EL BUG DE LA SEGUNDA AUDITORÍA. Los botones mandan la posición VISUAL
// (1..10) y la función trabajaba sobre los índices del arreglo presente. Con
// cuatro títulos en las posiciones 1, 2, 5 y 7, una flecha sobre la 5 mandaba
// `desde: 5`, que en un arreglo de cuatro es inválido — y el camino de "inválido"
// devolvía la lista RENUMERADA 1..4. O sea que un gesto que no hacía nada
// compactaba el bloque y movía tres títulos que nadie tocó.

test("un movimiento inválido devuelve las posiciones INTACTAS", () => {
  const parcial = [
    { posicion: 1, tipo: "tv" as const, tmdb_id: 10, titulo: "A" },
    { posicion: 2, tipo: "tv" as const, tmdb_id: 20, titulo: "B" },
    { posicion: 5, tipo: "tv" as const, tmdb_id: 50, titulo: "C" },
    { posicion: 7, tipo: "tv" as const, tmdb_id: 70, titulo: "D" },
  ];
  const r = posicionesDeReordenar(parcial, 5, 6);
  assert.deepEqual(r.map((x) => x.posicion), [1, 2, 5, 7],
    "renumeró un bloque incompleto por un movimiento que no era válido");
  assert.deepEqual(r.map((x) => x.tmdb_id), [10, 20, 50, 70]);
});

test("un bloque incompleto no se compacta por un movimiento válido tampoco", () => {
  // Con cuatro títulos, `desde: 1 → hasta: 2` SÍ es un movimiento posible sobre
  // el arreglo. Aun así las posiciones reales no se pueden inventar: la función
  // sólo renumera cuando el bloque está completo.
  const parcial = [
    { posicion: 1, tipo: "tv" as const, tmdb_id: 10, titulo: "A" },
    { posicion: 9, tipo: "tv" as const, tmdb_id: 90, titulo: "B" },
  ];
  const r = posicionesDeReordenar(parcial, 1, 2);
  assert.deepEqual(r.map((x) => x.posicion), [1, 9],
    "compactó un bloque incompleto");
});

// --- el contador de preparación ---------------------------------------------
//
// 🔴 EL BUG. El contador leía `/api/top` y contaba bloques con
// `source: "manual"`. Como el cutover es ATÓMICO, esa fuente sólo cambia cuando
// están los doce: con cuatro publicados el contador decía **0 de 12**, y saltaba
// de 0 a 12 de golpe. Como indicador de progreso no servía para nada, que es
// justamente para lo que está.
//
// Ahora cuenta las publicaciones que existen de verdad. Desde el 2026-10-20 el
// mensaje informa qué ve el público: los que faltan, "todavía no disponible".

test("con cuatro publicaciones el contador dice 4, no 0", () => {
  const p = preparacion(["n:movie", "n:tv", "d:movie", "d:tv"]);
  assert.equal(p.hechos, 4);
  assert.equal(p.total, 12);
  assert.equal(p.listo, false, "dio listo con cuatro bloques");
  assert.equal(p.mensaje,
    "Los bloques sin publicar se ven en el Top público como «todavía no disponible».");
  assert.doesNotMatch(p.mensaje, /fuente anterior/);
});

test("con los doce cambia el mensaje y recién ahí está listo", () => {
  const todos = BLOQUES.map((b) => `${b.plataforma}:${b.tipo}`);
  const p = preparacion(todos);
  assert.equal(p.hechos, 12);
  assert.equal(p.listo, true);
  assert.equal(p.mensaje, "Los doce bloques están publicados.");
});

test("sin publicaciones arranca en cero", () => {
  const p = preparacion([]);
  assert.equal(p.hechos, 0);
  assert.equal(p.listo, false);
});

test("una clave repetida o inventada no infla el contador", () => {
  // Repetida: un bloque con DOS publicaciones (una corrección) cuenta UNA vez.
  assert.equal(preparacion(["n:movie", "n:movie", "n:tv"]).hechos, 2);
  // Inventada: doce claves no alcanzan, tienen que ser LAS doce.
  const raras = BLOQUES.slice(0, 11).map((b) => `${b.plataforma}:${b.tipo}`).concat("zz:movie");
  const p = preparacion(raras);
  assert.equal(p.hechos, 11, "contó una clave que no es un bloque");
  assert.equal(p.listo, false);
});
