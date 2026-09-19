// La relectura acotada de `useSala` (plan de salas, Tarea 3.2). Máquina PURA:
// cada señal del canal pide releer, pero nunca más de una relectura por
// ventana de 1500 ms, con el pedido al FINAL de la ventana (trailing) para
// que una ráfaga de señales termine en UNA lectura que ya ve todos los cambios.
import { test } from "node:test";
import assert from "node:assert/strict";
import { inicial, alSenal, alReleer, VENTANA_MS } from "./sala-relectura-nucleo.ts";

test("dos señales a 100 ms de la última lectura → UNA relectura, programada para los 1500 ms", () => {
  let s = alReleer(inicial(), 0);              // se leyó al montar, t=0
  const a = alSenal(s, 100);
  assert.equal(a.programarEnMs, 1400);         // trailing: al cumplirse la ventana desde la última lectura
  s = a.estado;
  const b = alSenal(s, 120);
  assert.equal(b.programarEnMs, null);         // ya hay una pendiente: no se programa otra
  s = alReleer(b.estado, 1500);
  assert.equal(s.pendiente, false);
  assert.equal(s.ultimaMs, 1500);
});

test("una señal aislada 3 s después de la última lectura → inmediata", () => {
  const s = alReleer(inicial(), 1500);
  const r = alSenal(s, 4500);
  assert.equal(r.programarEnMs, 0);
  assert.equal(r.estado.pendiente, true);
});

test("sin lectura previa, la primera señal es inmediata", () => {
  const r = alSenal(inicial(), 700);
  assert.equal(r.programarEnMs, 0);
});

test("la ventana es de 1500 ms exactos: a los 1499 se espera 1, a los 1500 es inmediata", () => {
  const s = alReleer(inicial(), 0);
  assert.equal(alSenal(s, 1499).programarEnMs, 1);
  assert.equal(alSenal(s, 1500).programarEnMs, 0);
  assert.equal(VENTANA_MS, 1500);
});

test("una relectura que arranca (pendiente) y termina limpia el pendiente aunque llegue otra señal en el medio", () => {
  let s = alReleer(inicial(), 0);
  const a = alSenal(s, 100);
  s = a.estado;
  // Llega la respuesta de la relectura programada.
  s = alReleer(s, 1500);
  // Una señal nueva después de eso vuelve a programar (ventana desde 1500).
  const b = alSenal(s, 1600);
  assert.equal(b.programarEnMs, 1400);
});
