import { test } from "node:test";
import assert from "node:assert/strict";
import {
  armarSenales, clavesExcluidas, MARCADOS_PARA_SENALES, VOTOS_PARA_SENALES,
} from "./reco-entrada.ts";

const voto = (id: number, rating: number) => ({ tmdb_id: id, tipo: "movie" as const, rating });
// 45 votos, del más nuevo al más viejo, como los devuelve la query.
const MUCHOS = Array.from({ length: 45 }, (_, i) => voto(i + 1, i % 2 === 0 ? 3 : 2));

test("las señales se acotan a los 40 más recientes", () => {
  // El recorte tiene sentido acá: el riel tiene que moverse cuando la persona se
  // mueve, no quedar anclado a lo que votó hace ocho meses.
  const s = armarSenales(MUCHOS, []);
  assert.equal(s.length, VOTOS_PARA_SENALES);
  assert.ok(!s.some((x) => x.id > 40), "el voto 41 no es señal");
});

test("TODOS los votos se excluyen, también los viejos", () => {
  // El bug que esto arregla: con el tope de 40 compartido, el voto número 41 se
  // caía de las dos listas y el título volvía a aparecer RECOMENDADO. Un título
  // ya calificado no puede reaparecer por ser antiguo, y le pasaba justo a quien
  // más usa la app.
  const ex = clavesExcluidas(MUCHOS, [], []);
  assert.equal(ex.length, 45);
  for (const n of [41, 42, 43, 44, 45]) {
    assert.ok(ex.includes(`movie:${n}`), `el voto ${n} tiene que estar excluido`);
  }
});

test("con 45 votos, el 45 está excluido y NO es señal", () => {
  // Los dos conceptos separados, en un solo caso.
  const s = armarSenales(MUCHOS, []);
  const ex = clavesExcluidas(MUCHOS, [], []);
  assert.ok(!s.some((x) => x.id === 45));
  assert.ok(ex.includes("movie:45"));
});

test("con menos de 40 votos no cambia nada", () => {
  const pocos = MUCHOS.slice(0, 12);
  assert.equal(armarSenales(pocos, []).length, 12);
  assert.equal(clavesExcluidas(pocos, [], []).length, 12);
});

test("Malaso excluye pero no origina", () => {
  const votos = [voto(1, 1), voto(2, 3)];
  const s = armarSenales(votos, []);
  assert.deepEqual(s.map((x) => x.id), [2], "un título que no te gustó no origina nada");
  assert.ok(clavesExcluidas(votos, [], []).includes("movie:1"), "pero no puede aparecer recomendado");
});

test("la jerarquía es Petacular > Ta buena > Mi lista", () => {
  const votos = [voto(1, 2), voto(2, 3)];
  const marcados = [{ tmdb_id: 3, tipo: "movie" as const, kind: "list" }];
  assert.deepEqual(armarSenales(votos, marcados).map((x) => x.peso), [3, 2, 1]);
});

test("Ya la vi excluye pero no es señal", () => {
  const marcados = [{ tmdb_id: 9, tipo: "tv" as const, kind: "watched" }];
  assert.deepEqual(armarSenales([], marcados), []);
  assert.ok(clavesExcluidas([], marcados, []).includes("tv:9"));
});

test("lo que ya está en el Home también se excluye", () => {
  assert.ok(clavesExcluidas([], [], ["movie:500"]).includes("movie:500"));
});

// --- lo mismo, del lado de user_items ---------------------------------------

const marcado = (id: number, kind: "list" | "watched") => ({ tmdb_id: id, tipo: "movie" as const, kind });
// 250 marcados, del más nuevo al más viejo, alternando list y watched.
const MUCHOS_ITEMS = Array.from({ length: 250 }, (_, i) => marcado(i + 1, i % 2 === 0 ? "list" : "watched"));

test("las señales de Mi lista se acotan a los 200 registros más recientes", () => {
  const s = armarSenales([], MUCHOS_ITEMS);
  // De los 200 primeros, la mitad son `list`: 100 señales.
  assert.equal(s.length, 100);
  assert.ok(!s.some((x) => x.id > MARCADOS_PARA_SENALES), "el marcado 201 no es señal");
});

test("el presupuesto de 200 se mide sobre list Y watched juntos", () => {
  // Es el comportamiento exacto del `limit(200)` que hacía la query: cortaba
  // sobre los dos kinds mezclados y recién después se filtraba `list`. Cortar
  // después del filtro daría 200 señales en vez de 100, que es otra cosa.
  const s = armarSenales([], MUCHOS_ITEMS);
  const soloList = MUCHOS_ITEMS.filter((x) => x.kind === "list").length;
  assert.equal(soloList, 125, "hay 125 en Mi lista en total");
  assert.equal(s.length, 100, "pero solo 100 caen dentro de los 200 más nuevos");
});

test("TODOS los marcados se excluyen, también los que pasan de 200", () => {
  // El bug: a partir del registro 201 el título se caía de `excluir` y volvía a
  // aparecer RECOMENDADO, aunque estuviera en Mi lista o marcado como visto.
  const ex = clavesExcluidas([], MUCHOS_ITEMS, []);
  assert.equal(ex.length, 250);
  for (const n of [201, 225, 250]) {
    assert.ok(ex.includes(`movie:${n}`), `el marcado ${n} tiene que estar excluido`);
  }
});

test("un marcado viejo queda excluido y NO amplía las señales", () => {
  // Los dos conceptos separados, en un solo caso.
  const viejo = "movie:249";   // `list`, posición 249 → fuera de los 200
  const s = armarSenales([], MUCHOS_ITEMS);
  const ex = clavesExcluidas([], MUCHOS_ITEMS, []);
  assert.ok(!s.some((x) => `movie:${x.id}` === viejo), "no es señal");
  assert.ok(ex.includes(viejo), "pero sigue excluido");
});

test("con menos de 200 marcados no cambia nada", () => {
  const pocos = MUCHOS_ITEMS.slice(0, 30);
  assert.equal(armarSenales([], pocos).length, 15);
  assert.equal(clavesExcluidas([], pocos, []).length, 30);
});

test("los dos presupuestos son independientes", () => {
  // Tener 250 marcados no le come lugar a los votos, ni al revés.
  const s = armarSenales(MUCHOS, MUCHOS_ITEMS);
  assert.equal(s.filter((x) => x.peso >= 2).length, VOTOS_PARA_SENALES);
  assert.equal(s.filter((x) => x.peso === 1).length, 100);
});
