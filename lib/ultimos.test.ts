// El orden de "Últimos lanzamientos · Series".
//
// ⚠️ ESTE ARCHIVO SE REDUJO A PROPÓSITO. Antes probaba `combinarUltimos`, que
// mezclaba y paginaba recibiendo la colección completa. Esa función **se
// eliminó**: producción dejó de usarla cuando la orquestación pasó a
// `paginarUltimos`, y quedó como un segundo camino para la misma decisión —
// exportado, con sus tests en verde, y sin que nada lo llamara. Es la misma
// forma del problema que tuvo `plataformasDeFicha`.
//
// Todo lo que aquellos tests fijaban —orden, dedup, filtros, paginación sin
// repetidos ni salteos, extras que entran una sola vez, página posterior al
// final vacía— lo fija ahora `lib/ultimos-paginacion.test.ts`, y lo hace mejor:
// ejercitando el bucle que pide páginas en vez de recibir la lista ya armada.
//
// Acá queda lo que es de este módulo y no de la orquestación: el comparador.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ordenUltimos, type CandidatoUltimos } from "./ultimos.ts";
import type { UITitle } from "./types";

const t = (id: number, fecha: string, platforms = ["d"]): CandidatoUltimos => ({
  id, type: "tv", title: `T${id}`, year: 2026, runtime: null, poster: "/p.jpg",
  country: "AR", genres: [], platforms: platforms as UITitle["platforms"],
  tmdb: 7, hasEditorial: false, fecha,
});

test("ordena por fecha descendente", () => {
  const l = [t(1, "2026-08-01"), t(2, "2026-08-20"), t(3, "2026-08-10")].sort(ordenUltimos);
  assert.deepEqual(l.map((x) => x.id), [2, 3, 1]);
});

test("empate de fecha: desempata por id, y es ESTABLE", () => {
  // Sin desempate, dos títulos del mismo día pueden salir en distinto orden en
  // dos requests —el orden de llegada de las fuentes no es estable— y eso solo
  // basta para que una página repita o saltee.
  const a = [t(7, "2026-08-26"), t(3, "2026-08-26"), t(9, "2026-08-26")];
  const uno = [...a].sort(ordenUltimos).map((x) => x.id);
  const dos = [...a].reverse().sort(ordenUltimos).map((x) => x.id);
  assert.deepEqual(uno, dos, "el orden depende del orden de llegada");
  assert.deepEqual(uno, [9, 7, 3]);
});

test("el comparador es TOTAL: nunca empata dos títulos distintos", () => {
  // Un comparador que devuelve 0 deja el resultado a merced del orden de
  // entrada, que es exactamente lo que acá no puede pasar.
  const a = t(1, "2026-08-26");
  const b = t(2, "2026-08-26");
  assert.notEqual(ordenUltimos(a, b), 0);
  assert.equal(Math.sign(ordenUltimos(a, b)), -Math.sign(ordenUltimos(b, a)));
});

test("una fecha vacía queda al final, no al principio", () => {
  // `paginarUltimos` descarta los sin fecha antes de ordenar, pero si alguna vez
  // llegara uno, el comparador no puede ponerlo arriba de todo.
  const l = [t(1, ""), t(2, "2026-08-01")].sort(ordenUltimos);
  assert.deepEqual(l.map((x) => x.id), [2, 1]);
});
