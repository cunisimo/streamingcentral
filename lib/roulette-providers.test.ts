// Mapa de nombres de plataforma de la ruleta: los excluidos deliberados no se
// interpretan como plataformas y el conjunto soportado no cambia sin querer.
// (Se lee el fuente: el módulo importa sin extensión y no carga en node --test.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const src = readFileSync(resolve(import.meta.dirname, "roulette-providers.ts"), "utf8");
const bloque = (desde: string, hasta: string) => {
  const i = src.indexOf(desde);
  return [...src.slice(i, src.indexOf(hasta, i)).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
};
const soportados = new Set(bloque("const NOMBRES: Record", "};"));
const excluidos = bloque("export const NOMBRES_EXCLUIDOS", "];");

test("ningún nombre excluido se interpreta como plataforma válida", () => {
  assert.ok(excluidos.length >= 26);
  for (const n of excluidos) assert.ok(!soportados.has(n), n);
});

test("los cuatro channels de Amazon del 2026-10-08 están excluidos explícitamente", () => {
  for (const n of ["Looke Amazon Channel", "Lionsgate+ Amazon Channel", "Filmelier Plus Amazon Channel", "Cindie Amazon Channel"]) {
    assert.ok(excluidos.includes(n), n);
  }
});

test("sin ambigüedad: ningún nombre está a la vez soportado y excluido, ni repetido", () => {
  assert.equal(new Set(excluidos).size, excluidos.length);
  assert.deepEqual(excluidos.filter((n) => soportados.has(n)), []);
});

test("las plataformas soportadas no cambian", () => {
  assert.deepEqual([...soportados].sort(), [
    "Amazon Prime Video", "Apple TV", "Apple TV Amazon Channel", "Claro video", "Crunchyroll",
    "Crunchyroll Amazon Channel", "DIRECTV GO", "Disney Plus", "HBO Max", "MUBI", "MUBI Amazon Channel",
    "MovistarTV", "Netflix", "OnDemandKorea", "Paramount Plus", "Paramount+ Amazon Channel",
    "Universal+ Amazon Channel", "VIX ", "ViX Premium Amazon Channel",
  ].sort());
});
