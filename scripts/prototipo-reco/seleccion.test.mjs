// Pruebas SINTÉTICAS del prototipo. Sin red, sin TMDB, sin Upstash.
//   node --test scripts/prototipo-reco/
// No las corre `npm test` (su patrón mira lib/, components/ y hooks/).
import { test } from "node:test";
import assert from "node:assert/strict";
import { seleccionarTarjetas, elegirOrigenesMMR } from "./seleccion.mjs";

// Fábrica de candidatos: n por origen, alternando tipo, puntaje decreciente.
function cands(origen, n, { anim = false, infantil = false, base = 1 } = {}) {
  return Array.from({ length: n }, (_, i) => ({
    k: `${origen}:${i}`, origen, tipo: i % 2 ? "tv" : "movie",
    anim, infantil, score: base - i * 0.01,
  }));
}
const cuantos = (items, pred) => items.filter(pred).length;

test("caso Codex: 3 orígenes animados, 12 elegibles todos animados → se muestran los 12", () => {
  const r = seleccionarTarjetas(
    [...cands("A", 4, { anim: true }), ...cands("B", 4, { anim: true }), ...cands("C", 4, { anim: true })],
    { origenesAnimados: 3 },
  );
  assert.equal(r.visible, true);
  assert.equal(r.items.length, 12);
  assert.ok(r.completados > 0, "los cupos no alcanzan solos: completa la pasada 2");
});

test("menos de 10 elegibles → oculto (piso sobre elegibles, no sobre los cupos)", () => {
  const r = seleccionarTarjetas(cands("A", 9));
  assert.equal(r.visible, false);
  assert.equal(r.items.length, 0);
});

test("1 origen con 23 elegibles → 20, todos de ese origen", () => {
  const r = seleccionarTarjetas(cands("A", 23, { anim: true }), { origenesAnimados: 1 });
  assert.equal(r.items.length, 20);
  assert.equal(r.completados, 0);
});

test("2 orígenes, uno con 3 candidatos → el otro completa hasta 20", () => {
  const r = seleccionarTarjetas([...cands("A", 30), ...cands("B", 3, { base: 2 })]);
  assert.equal(r.items.length, 20);
  assert.equal(cuantos(r.items, (c) => c.origen === "B"), 3);
  assert.equal(cuantos(r.items, (c) => c.origen === "A"), 17);
});

test("6 orígenes, 1 animado con oferta grande → animación acotada y el riel llega a 20", () => {
  const todos = [
    ...cands("S", 25, { anim: true, base: 3 }), // puntaje alto a propósito
    ...["B", "C", "D", "E", "F"].flatMap((o) => cands(o, 5)),
  ];
  const r = seleccionarTarjetas(todos, { origenesAnimados: 1 });
  assert.equal(r.items.length, 20);
  assert.equal(r.caps.capAnim, 4);
  assert.equal(cuantos(r.items, (c) => c.anim), 4);
  assert.ok(cuantos(r.items.slice(0, 6), (c) => c.anim) <= 2);
  assert.equal(r.completados, 0);
});

test("objetivo 20, oferta diversa de 14 + 10 animados → llega a 20, los extra al final", () => {
  const todos = [
    ...["B", "C", "D", "E", "F", "G", "H"].flatMap((o) => cands(o, 2)),
    ...cands("S", 10, { anim: true, base: 3 }),
  ];
  const r = seleccionarTarjetas(todos, { origenesAnimados: 1 });
  assert.equal(r.items.length, 20, "no se detiene en 10");
  const posAnim = r.items.map((c, i) => (c.anim ? i : -1)).filter((i) => i >= 0);
  const extra = posAnim.slice(r.caps.capAnim);
  assert.ok(extra.every((i) => i >= r.conCupos), "lo que entra sin cupo va después");
});

test("cupo infantil blando: con oferta adulta suficiente queda en su cupo", () => {
  const todos = [
    ...cands("K", 20, { anim: true, infantil: true, base: 3 }),
    ...["B", "C", "D", "E", "F"].flatMap((o) => cands(o, 6)),
  ];
  const r = seleccionarTarjetas(todos, { origenesAnimados: 1, origenesInfantiles: 1 });
  assert.equal(r.items.length, 20);
  assert.ok(cuantos(r.items, (c) => c.infantil) <= r.caps.capInf);
});

test("primeras 6: no más de 2 del mismo origen si hay alternativas", () => {
  const todos = [...cands("A", 20, { base: 5 }), ...["B", "C", "D"].flatMap((o) => cands(o, 4))];
  const r = seleccionarTarjetas(todos);
  assert.ok(cuantos(r.items.slice(0, 6), (c) => c.origen === "A") <= 2);
});

// --- Orígenes ----------------------------------------------------------------

const S = (k, peso, rango, generos, anim = false) => ({ k, peso, rango, generos, anim });

test("recencia: con K = 6, un Ta buena nuevo le gana a un Petacular 7 puestos más viejo", () => {
  const r = elegirOrigenesMMR([S("viejo", 3, 7, [80]), S("nuevo", 2, 0, [35])], { max: 1 });
  assert.equal(r[0].k, "nuevo");
});

test("recencia: con K = 6, un Petacular 5 puestos más viejo sigue ganando", () => {
  const r = elegirOrigenesMMR([S("viejo", 3, 5, [80]), S("nuevo", 2, 0, [35])], { max: 1 });
  assert.equal(r[0].k, "viejo");
});

test("MMR: un voto nuevo de crimen — qué desplaza (comportamiento observado, no garantía)", () => {
  const antes = [
    S("crimen1", 2, 1, [80, 18]), S("crimen2", 2, 2, [80, 53]), S("crimen3", 2, 3, [80, 18]),
    S("simpsons", 2, 4, [16, 35], true), S("comedia", 2, 5, [35]), S("scifi", 2, 6, [878]),
  ];
  const sinNuevo = elegirOrigenesMMR(antes).map((s) => s.k);
  const conNuevo = elegirOrigenesMMR([S("crimen4", 3, 0, [80, 18]), ...antes]).map((s) => s.k);
  const desplazado = sinNuevo.filter((k) => !conNuevo.includes(k));
  console.log("  antes:", sinNuevo.join(", "));
  console.log("  después:", conNuevo.join(", "), "→ desplazado:", desplazado.join(", "));
  assert.equal(desplazado.length, 1);
  // Lo que se comprueba es que NO sale ninguno de los gustos únicos de su tema.
  assert.ok(!["simpsons", "comedia", "scifi"].includes(desplazado[0]));
});

test("MMR: un voto nuevo de OTRO tema (romance) — qué desplaza (observado)", () => {
  const antes = [
    S("crimen1", 2, 1, [80, 18]), S("crimen2", 2, 2, [80, 53]), S("crimen3", 2, 3, [80, 18]),
    S("simpsons", 2, 4, [16, 35], true), S("comedia", 2, 5, [35]), S("scifi", 2, 6, [878]),
  ];
  const sinNuevo = elegirOrigenesMMR(antes).map((s) => s.k);
  const conNuevo = elegirOrigenesMMR([S("romance", 2, 0, [10749, 18]), ...antes]).map((s) => s.k);
  const desplazado = sinNuevo.filter((k) => !conNuevo.includes(k));
  console.log("  después (romance):", conNuevo.join(", "), "→ desplazado:", desplazado.join(", "));
  assert.equal(desplazado.length, 1);
});
