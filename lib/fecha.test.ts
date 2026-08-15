import { test } from "node:test";
import assert from "node:assert/strict";
import { dailySeed, hoyAR } from "./fecha.ts";

// Implementación ANTERIOR, la que calculaba en UTC. Está acá a propósito: sin
// ella el test no demuestra nada. Un test que pasa con las dos versiones no
// distingue el bug que se arregló, y con el tiempo nadie se entera de que dejó
// de proteger algo.
function seedUTC(date: Date): number {
  const s = date.toISOString().slice(0, 10);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Argentina es UTC-3 todo el año (no tiene horario de verano desde 2009), así
// que el día argentino arranca a las 03:00 UTC.
const ar20hDel18 = new Date("2026-08-18T23:00:00Z"); // 18/8 20:00 AR
const ar22hDel18 = new Date("2026-08-19T01:00:00Z"); // 18/8 22:00 AR
const ar23hDel18 = new Date("2026-08-19T02:00:00Z"); // 18/8 23:00 AR
const ar01hDel19 = new Date("2026-08-19T04:00:00Z"); // 19/8 01:00 AR

test("dos instantes del mismo día argentino dan la misma semilla, aunque el día UTC cambie", () => {
  assert.equal(hoyAR(ar20hDel18), "2026-08-18");
  assert.equal(hoyAR(ar22hDel18), "2026-08-18");
  assert.equal(dailySeed(ar20hDel18), dailySeed(ar22hDel18));
});

test("el caso de arriba FALLABA con la implementación vieja en UTC", () => {
  // 23:00 UTC del 18 y 01:00 UTC del 19 son días UTC distintos: la semilla vieja
  // cambiaba a las 21:00 hora argentina, en pleno horario de uso.
  assert.notEqual(seedUTC(ar20hDel18), seedUTC(ar22hDel18));
});

test("dos días argentinos distintos dan semillas distintas", () => {
  assert.equal(hoyAR(ar23hDel18), "2026-08-18");
  assert.equal(hoyAR(ar01hDel19), "2026-08-19");
  assert.notEqual(dailySeed(ar23hDel18), dailySeed(ar01hDel19));
});

test("la semilla cambia a la medianoche argentina, no a las 21", () => {
  // 02:59:59 UTC = 23:59:59 AR del 18. 03:00:00 UTC = 00:00:00 AR del 19.
  const justoAntes = new Date("2026-08-19T02:59:59Z");
  const justoDespues = new Date("2026-08-19T03:00:00Z");
  assert.equal(dailySeed(justoAntes), dailySeed(ar20hDel18), "sigue siendo el día 18");
  assert.notEqual(dailySeed(justoDespues), dailySeed(justoAntes), "cruzó al día 19");
});
