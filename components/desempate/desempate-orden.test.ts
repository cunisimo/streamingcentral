import { test } from "node:test";
import assert from "node:assert/strict";
import { estaEnTusPlataformas, ordenarPorDisponibilidad } from "./desempate-orden.ts";
import type { UITitle } from "@/lib/types";

const t = (id: number, platforms: string[]): UITitle =>
  ({ id, type: "movie", title: `T${id}`, platforms } as unknown as UITitle);

// El caso que se verifica a mano: "matrix" trae disponibles y no disponibles
// mezclados, en el orden de relevancia de /api/search.
const RESULTADOS = [
  t(1, ["cr"]),        // no disponible
  t(2, ["n"]),         // disponible
  t(3, []),            // no disponible
  t(4, ["d", "m"]),    // disponible
  t(5, ["cr"]),        // no disponible
  t(6, ["m"]),         // disponible
];
const MIS = ["n", "d", "m"];
const disp = (x: UITitle) => estaEnTusPlataformas(x, MIS);

test("primero los disponibles, después los no disponibles", () => {
  const r = ordenarPorDisponibilidad(RESULTADOS, disp);
  assert.deepEqual(r.map((x) => x.id), [2, 4, 6, 1, 3, 5]);
});

test("dentro de cada grupo se conserva el orden de relevancia", () => {
  // Es el requisito que hace que la partición tenga que ser ESTABLE: adentro de
  // cada mitad manda el orden que ya trajo /api/search, no el id ni el título.
  const r = ordenarPorDisponibilidad(RESULTADOS, disp);
  assert.deepEqual(r.slice(0, 3).map((x) => x.id), [2, 4, 6], "los disponibles, en su orden");
  assert.deepEqual(r.slice(3).map((x) => x.id), [1, 3, 5], "los no disponibles, en el suyo");
});

test("no pierde ni duplica ninguno: se muestran TODOS", () => {
  // No se oculta nada. El requisito es reordenar, no filtrar.
  const r = ordenarPorDisponibilidad(RESULTADOS, disp);
  assert.equal(r.length, RESULTADOS.length);
  assert.deepEqual(new Set(r.map((x) => x.id)), new Set(RESULTADOS.map((x) => x.id)));
});

test("con todos disponibles, el orden queda igual que como vino", () => {
  const todos = [t(1, ["n"]), t(2, ["n"]), t(3, ["d"])];
  assert.deepEqual(
    ordenarPorDisponibilidad(todos, disp).map((x) => x.id),
    [1, 2, 3],
  );
});

test("con ninguno disponible, el orden queda igual que como vino", () => {
  const ninguno = [t(1, ["cr"]), t(2, []), t(3, ["cr"])];
  assert.deepEqual(
    ordenarPorDisponibilidad(ninguno, disp).map((x) => x.id),
    [1, 2, 3],
  );
});

test("con la lista vacía no rompe", () => {
  assert.deepEqual(ordenarPorDisponibilidad([], disp), []);
});

// --- cambiar de plataformas reordena la MISMA lista --------------------------

test("cambiar de plataformas cambia el orden sin volver a buscar", () => {
  // Es el punto: la disponibilidad sale de `t.platforms`, que ya viajó en el
  // payload. Con otra selección, la misma lista se reparte distinto.
  const soloCrunchy = (x: UITitle) => estaEnTusPlataformas(x, ["cr"]);
  const r = ordenarPorDisponibilidad(RESULTADOS, soloCrunchy);
  assert.deepEqual(r.map((x) => x.id), [1, 5, 2, 3, 4, 6]);
});

test("sin ninguna plataforma elegida, nada es disponible y el orden no cambia", () => {
  const sinNada = (x: UITitle) => estaEnTusPlataformas(x, []);
  assert.deepEqual(
    ordenarPorDisponibilidad(RESULTADOS, sinNada).map((x) => x.id),
    [1, 2, 3, 4, 5, 6],
  );
});

// --- disponibilidad ----------------------------------------------------------

test("está disponible si comparte al menos UNA plataforma", () => {
  assert.equal(estaEnTusPlataformas(t(1, ["cr", "n"]), MIS), true);
  assert.equal(estaEnTusPlataformas(t(2, ["cr"]), MIS), false);
  assert.equal(estaEnTusPlataformas(t(3, []), MIS), false, "sin plataformas no está en ninguna");
});
