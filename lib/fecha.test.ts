import { test } from "node:test";
import assert from "node:assert/strict";
import { dailySeed, diaYump, hoyAR } from "./fecha.ts";

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

test("dos días CALENDARIO distintos: hoyAR los distingue", () => {
  // La parte factual, que no se movió: a las 23 es 18 y a la 01 es 19.
  assert.equal(hoyAR(ar23hDel18), "2026-08-18");
  assert.equal(hoyAR(ar01hDel19), "2026-08-19");
});

test("la semilla YA NO cambia a la medianoche argentina", () => {
  // Este test afirmaba lo contrario, y se actualizó a propósito al mover la
  // rotación al borde de las 04:00: a medianoche el Home se rearmaba encima de
  // alguien que estaba usando la app. 02:59:59 UTC = 23:59:59 AR del 18;
  // 03:00:00 UTC = 00:00:00 AR del 19.
  const justoAntes = new Date("2026-08-19T02:59:59Z");
  const justoDespues = new Date("2026-08-19T03:00:00Z");
  assert.equal(dailySeed(justoAntes), dailySeed(ar20hDel18), "sigue siendo el día 18");
  assert.equal(dailySeed(justoDespues), dailySeed(justoAntes), "cruzar medianoche NO rota");
  // Pero la fecha calendario sí cruzó, que es lo que separa las dos nociones.
  assert.notEqual(hoyAR(justoDespues), hoyAR(justoAntes));
});

// --- El día de ROTACIÓN, con borde a las 04:00 -------------------------------
// Son dos nociones distintas y el test tiene que probar que NO se pisan: si
// `diaYump` gobernara también lo factual, entre las 00 y las 04 la app creería
// que es ayer y mostraría como próximos estrenos que ya salieron.
const ar0100Del19 = new Date("2026-08-19T04:00:00Z"); // 19/8 01:00 AR
const ar0359Del19 = new Date("2026-08-19T06:59:00Z"); // 19/8 03:59 AR
const ar0400Del19 = new Date("2026-08-19T07:00:00Z"); // 19/8 04:00 AR

test("el día de rotación NO cambia a la medianoche: a la 01:00 sigue siendo el día anterior", () => {
  assert.equal(diaYump(ar0100Del19), "2026-08-18");
  // Y la fecha calendario sí cambió: es lo que separa las dos funciones.
  assert.equal(hoyAR(ar0100Del19), "2026-08-19");
});

test("el día de rotación cambia a las 04:00, no antes", () => {
  assert.equal(diaYump(ar0359Del19), "2026-08-18", "03:59 todavía es el día anterior");
  assert.equal(diaYump(ar0400Del19), "2026-08-19", "04:00 ya es el día nuevo");
  assert.notEqual(dailySeed(ar0359Del19), dailySeed(ar0400Del19));
});

test("la semilla sigue el día de rotación y no la fecha calendario", () => {
  // 23:00 del 18 y 01:00 del 19 son días calendario DISTINTOS y sin embargo
  // tienen que compartir semilla: es la misma noche para el usuario.
  assert.notEqual(hoyAR(ar23hDel18), hoyAR(ar0100Del19));
  assert.equal(dailySeed(ar23hDel18), dailySeed(ar0100Del19));
});

test("lo factual NO se movió: hoyAR sigue siendo la fecha calendario argentina", () => {
  // Este es el test que impide "arreglar" el borde moviendo hoyAR(): si alguien
  // lo hace, esto falla. Lo consumen los estrenos vencidos, "Recordarme" y el
  // tope de fecha que se le pide a TMDB.
  assert.equal(hoyAR(ar0100Del19), "2026-08-19");
  assert.equal(hoyAR(ar0359Del19), "2026-08-19");
  assert.equal(hoyAR(ar0400Del19), "2026-08-19");
});
