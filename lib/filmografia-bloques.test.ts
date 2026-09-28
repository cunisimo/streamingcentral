// Carga progresiva de la filmografía (lib/filmografia-bloques.ts): qué se
// consulta al abrir y con cada "Ver más", en qué orden se muestra, y que una
// respuesta vieja no se aplique sobre otra persona.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BLOQUE, BLOQUE_INICIAL, bloqueInicial, clavesVisibles, ordenVisible, siguienteBloque,
} from "./filmografia-bloques.ts";
import type { PlatformCode } from "./types.ts";

const claves = (n: number, desde = 1) => Array.from({ length: n }, (_, i) => `movie:${desde + i}`);

test("bloque inicial: UN presupuesto de 12 para la página, repartido entre las secciones", () => {
  assert.equal(BLOQUE_INICIAL, 12);
  assert.ok(BLOQUE_INICIAL <= BLOQUE, "la apertura nunca supera un bloque");
  assert.deepEqual(bloqueInicial(["actuacion"], { direccion: 0, actuacion: 229 }), { direccion: 0, actuacion: 12 });
  assert.deepEqual(bloqueInicial(["direccion", "actuacion"], { direccion: 52, actuacion: 18 }), { direccion: 8, actuacion: 4 });
  // Villeneuve: 24 dirigidas y 5 actuadas → 8 + 4.
  assert.deepEqual(bloqueInicial(["direccion", "actuacion"], { direccion: 24, actuacion: 5 }), { direccion: 8, actuacion: 4 });
  // La primera corta: lo que no usa lo toma la segunda.
  assert.deepEqual(bloqueInicial(["direccion", "actuacion"], { direccion: 3, actuacion: 100 }), { direccion: 3, actuacion: 9 });
  assert.deepEqual(bloqueInicial(["direccion"], { direccion: 7, actuacion: 0 }), { direccion: 7, actuacion: 0 });
  assert.deepEqual(bloqueInicial([], { direccion: 0, actuacion: 0 }), { direccion: 0, actuacion: 0 });
  for (const [a, b] of [[1, 1], [30, 30], [0, 50], [50, 0], [24, 24]]) {
    const r = bloqueInicial(["direccion", "actuacion"], { direccion: a, actuacion: b });
    assert.ok(r.direccion + r.actuacion <= BLOQUE_INICIAL, `${a}/${b}`);
  }
});

test("claves visibles: una obra en las dos secciones cuenta una vez", () => {
  const k = clavesVisibles({ direccion: ["movie:1", "movie:2"], actuacion: ["movie:1", "tv:1"] }, { direccion: 2, actuacion: 2 });
  assert.deepEqual(k, ["movie:1", "movie:2", "tv:1"]);
});

test("'Ver más' pide sólo el bloque siguiente, sin lo ya resuelto (tampoco desde la otra sección)", () => {
  const ks = claves(60);
  const resueltas = new Set([...ks.slice(0, 24), "movie:30"]);
  const sig = siguienteBloque(ks, 24, (k) => resueltas.has(k));
  assert.equal(sig.hasta, 48);
  assert.deepEqual(sig.pedir, ks.slice(24, 48).filter((k) => k !== "movie:30"));
  // Bloque final menor: sólo lo que resta.
  assert.deepEqual(siguienteBloque(ks, 48, () => false), { hasta: 60, pedir: ks.slice(48, 60) });
  assert.deepEqual(siguienteBloque(ks, 60, () => false), { hasta: 60, pedir: [] });
});

test("orden visible: tus plataformas primero DENTRO de cada bloque; los bloques no se mezclan", () => {
  const ks = claves(30);
  const plat: Record<string, PlatformCode[]> = { "movie:3": ["n"], "movie:20": ["n"], "movie:26": ["n"], "movie:27": ["d"] };
  const o = ordenVisible(ks, 24, 30, (k) => plat[k] ?? [], ["n"]);
  assert.deepEqual(o.slice(0, 2), ["movie:3", "movie:20"], "bloque 1: las de Netflix arriba");
  assert.equal(o[2], "movie:1");
  assert.deepEqual(o.slice(24), ["movie:26", "movie:25", "movie:27", "movie:28", "movie:29", "movie:30"], "bloque 2, aparte");
  assert.equal(o.length, 30);
});

test("orden visible: una obra sin disponibilidad resuelta no se trata como disponible ni se pierde", () => {
  const ks = claves(4);
  const o = ordenVisible(ks, 4, 4, (k) => (k === "movie:4" ? ["n"] : k === "movie:2" ? undefined : []), ["n"]);
  assert.deepEqual(o, ["movie:4", "movie:1", "movie:2", "movie:3"]);
});

test("orden visible respeta un bloque inicial menor a 24 (secciones que comparten el presupuesto)", () => {
  const ks = claves(40);
  const o = ordenVisible(ks, 8, 32, (k) => (k === "movie:9" ? ["n"] : []), ["n"]);
  assert.equal(o[0], "movie:1", "movie:9 no salta al primer bloque (1–8)");
  assert.equal(o[8], "movie:9", "encabeza el segundo bloque (9–32)");
});
