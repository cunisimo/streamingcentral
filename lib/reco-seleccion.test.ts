// Casos límite del plan de diversidad (rev. 2, §3 y §6), sobre datos
// sintéticos: ninguna llamada a TMDB.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  candidatasOrigen, elegirOrigenesMMR, esInfantil, exclusionesCruce, seleccionarTarjetas,
  type SenalConRango, type Tarjeta,
} from "./reco-seleccion.ts";
import type { MediaType } from "./types.ts";

let sec = 0;
function cands(origen: string, n: number, o: { anim?: boolean; inf?: boolean; base?: number } = {}): Tarjeta[] {
  return Array.from({ length: n }, (_, i) => ({
    type: (i % 2 ? "tv" : "movie") as MediaType, id: ++sec, origen,
    animacion: !!o.anim, infantil: !!o.inf, puntaje: (o.base ?? 1) - i * 0.01,
  }));
}
const cuantos = (xs: Tarjeta[], p: (t: Tarjeta) => boolean) => xs.filter(p).length;

// --- Categorías ---

test("infantil: Kids en series; Animación + Family en películas; Family solo no alcanza", () => {
  assert.equal(esInfantil("tv", [16, 35, 10751, 10762]), true);   // Bluey
  assert.equal(esInfantil("tv", [16, 35, 10751]), false);         // El rey de la colina
  assert.equal(esInfantil("tv", [35, 10751]), false);             // sitcom familiar
  assert.equal(esInfantil("movie", [16, 10751, 12]), true);       // Frozen
  assert.equal(esInfantil("movie", [35, 10751]), false);          // familiar sin animación
  assert.equal(esInfantil("tv", [16, 35]), false);                // Los Simpson
});

test("cruce: sin Kids hacia series; sin Family hacia películas sólo desde origen animado (D2a)", () => {
  assert.deepEqual(exclusionesCruce({ tipo: "movie", generos: [80, 18] }, true), [10762]);
  assert.deepEqual(exclusionesCruce({ tipo: "tv", generos: [16, 35] }, true), [10751]);   // Simpsons
  assert.deepEqual(exclusionesCruce({ tipo: "tv", generos: [16, 35] }, false), []);      // D2a apagada
  assert.deepEqual(exclusionesCruce({ tipo: "tv", generos: [18, 80] }, true), []);       // origen no animado
  assert.deepEqual(exclusionesCruce({ tipo: "tv", generos: [16, 10762] }, true), []);    // origen infantil
});

// --- Selección final ---

test("caso Codex: 3 orígenes animados, 12 elegibles todos animados → 12 (gana la cantidad)", () => {
  const r = seleccionarTarjetas(
    [...cands("A", 4, { anim: true }), ...cands("B", 4, { anim: true }), ...cands("C", 4, { anim: true })],
    { origenesAnimados: 3, origenesInfantiles: 0 },
  );
  assert.equal(r.items.length, 12);
  assert.ok(r.completados > 0);
});

test("1 origen con 23 elegibles → 20 de ese origen, sin pasada 2", () => {
  const r = seleccionarTarjetas(cands("A", 23, { anim: true }), { origenesAnimados: 1, origenesInfantiles: 0 });
  assert.equal(r.items.length, 20);
  assert.equal(r.completados, 0);
});

test("2 orígenes, uno con 3 → el otro completa hasta 20", () => {
  const b = cands("B", 3, { base: 2 });
  const r = seleccionarTarjetas([...cands("A", 30), ...b], { origenesAnimados: 0, origenesInfantiles: 0 });
  assert.equal(r.items.length, 20);
  assert.equal(cuantos(r.items, (c) => c.origen === "B"), 3);
});

test("6 orígenes, 1 animado con puntaje alto → animación en su cupo y 20 tarjetas", () => {
  const r = seleccionarTarjetas(
    [...cands("S", 25, { anim: true, base: 3 }), ...["B", "C", "D", "E", "F"].flatMap((o) => cands(o, 5))],
    { origenesAnimados: 1, origenesInfantiles: 0 },
  );
  assert.equal(r.items.length, 20);
  assert.equal(r.cupos.animacion, 4);
  assert.equal(cuantos(r.items, (c) => c.animacion), 4);
  assert.ok(cuantos(r.items.slice(0, 6), (c) => c.animacion) <= 2);
  assert.ok(cuantos(r.items.slice(0, 6), (c) => c.origen === "S") <= 2);
  assert.equal(r.completados, 0);
});

test("14 diversos + 10 animados → 20 (no 10), lo completado va al final", () => {
  const r = seleccionarTarjetas(
    [...["B", "C", "D", "E", "F", "G", "H"].flatMap((o) => cands(o, 2)), ...cands("S", 10, { anim: true, base: 3 })],
    { origenesAnimados: 1, origenesInfantiles: 0 },
  );
  assert.equal(r.items.length, 20);
  assert.ok(r.items.slice(r.conCupos).every((c) => c.animacion));
});

test("1 origen infantil entre 6, con oferta adulta suficiente → infantiles en su cupo", () => {
  const r = seleccionarTarjetas(
    [...cands("K", 20, { anim: true, inf: true, base: 3 }), ...["B", "C", "D", "E", "F"].flatMap((o) => cands(o, 6))],
    { origenesAnimados: 1, origenesInfantiles: 1 },
  );
  assert.equal(r.items.length, 20);
  assert.ok(cuantos(r.items, (c) => c.infantil) <= r.cupos.infantil);
});

test("ningún elegible repetido y orden estable", () => {
  const xs = [...cands("A", 15), ...cands("B", 15)];
  const a = seleccionarTarjetas(xs, { origenesAnimados: 0, origenesInfantiles: 0 });
  const b = seleccionarTarjetas([...xs].reverse(), { origenesAnimados: 0, origenesInfantiles: 0 });
  assert.equal(new Set(a.items).size, a.items.length);
  assert.deepEqual(a.items.map((c) => c.id), b.items.map((c) => c.id));
});

// --- Orígenes ---

const S = (id: number, peso: 1 | 2 | 3, rango: number): SenalConRango => ({ tipo: "movie", id, peso, rango });

test("recencia K=6: Ta buena nuevo le gana a Petacular 7 puestos más viejo, no a uno 5 más viejo", () => {
  assert.equal(candidatasOrigen([S(1, 3, 7), S(2, 2, 0)])[0].id, 2);
  assert.equal(candidatasOrigen([S(1, 3, 5), S(2, 2, 0)])[0].id, 1);
});

test("duplicada (votada y en Mi lista) cuenta una vez, con el peso mayor", () => {
  const r = candidatasOrigen([S(1, 1, 0), S(1, 3, 4)]);
  assert.equal(r.length, 1);
  assert.equal(r[0].peso, 3);
});

test("MMR: un voto nuevo desplaza al origen más redundante en estos casos (observado)", () => {
  const g: Record<number, number[]> = {
    1: [80, 18], 2: [80, 53], 3: [80, 18], 4: [16, 35], 5: [35], 6: [878], 7: [80, 18], 8: [10749, 18],
  };
  const perfil = (s: SenalConRango) => ({ tipo: s.tipo, generos: g[s.id] });
  const base = [S(1, 2, 1), S(2, 2, 2), S(3, 2, 3), S(4, 2, 4), S(5, 2, 5), S(6, 2, 6)];
  const antes = elegirOrigenesMMR(candidatasOrigen(base), perfil).map((s) => s.id);
  for (const nuevo of [S(7, 3, 0), S(8, 2, 0)]) {
    const despues = elegirOrigenesMMR(candidatasOrigen([nuevo, ...base]), perfil).map((s) => s.id);
    const fuera = antes.filter((id) => !despues.includes(id));
    assert.deepEqual(fuera, [3], `con el voto ${nuevo.id}`);
  }
});
