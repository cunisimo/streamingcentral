// Las decisiones puras de la votación (Tarea 3.4): cuándo se avanza y cuándo se
// puede borrar el comienzo persistido de una card. Regla: sólo con avance
// confirmado por el servidor.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decidirTrasVotar, sincronizarPos, formatoDuracion, hayAdvertencia, VOTO_AL_VENCER } from "./votacion-nucleo.ts";

test("ok → cierra y pasa a la siguiente; en la última, termine y sin siguiente", () => {
  assert.deepEqual(decidirTrasVotar({ ok: true, termine: false, estado: "votando" }, 2, 10), { siguiente: 3, cerrar: true, termine: false, rondaCerrada: false });
  assert.deepEqual(decidirTrasVotar({ ok: true, termine: true, estado: "votando" }, 9, 10), { siguiente: null, cerrar: true, termine: true, rondaCerrada: false });
  // idempotente (reintento de una respuesta perdida) cuenta como confirmado.
  assert.deepEqual(decidirTrasVotar({ ok: true, termine: false, estado: "votando", idempotente: true }, 0, 5), { siguiente: 1, cerrar: true, termine: false, rondaCerrada: false });
});

test("MATCH TEMPRANO: ok con estado ≠ votando en la posición 1 de 10 → confirma la card, sin siguiente, ronda cerrada", () => {
  assert.deepEqual(decidirTrasVotar({ ok: true, termine: true, estado: "resultado" }, 1, 10), { siguiente: null, cerrar: true, termine: true, rondaCerrada: true });
  // Da igual qué estado sea, mientras no sea votando (empate no puede venir de un ok, pero la regla es la misma).
  assert.deepEqual(decidirTrasVotar({ ok: true, termine: false, estado: "resultado" }, 4, 20), { siguiente: null, cerrar: true, termine: true, rondaCerrada: true });
});

test("comportamiento normal preservado: el participante termina la tanda pero la sala sigue votando → termine sin cerrar la ronda", () => {
  assert.deepEqual(decidirTrasVotar({ ok: true, termine: true, estado: "votando" }, 9, 10), { siguiente: null, cerrar: true, termine: true, rondaCerrada: false });
  assert.deepEqual(decidirTrasVotar({ ok: true, termine: false, estado: "votando" }, 1, 10), { siguiente: 2, cerrar: true, termine: false, rondaCerrada: false });
});

test("ya_votado / fuera_de_orden con siguiente > pos → cierra y salta a siguiente", () => {
  assert.deepEqual(decidirTrasVotar({ ok: false, motivo: "ya_votado", siguiente: 4 }, 2, 10), { siguiente: 4, cerrar: true, termine: false, rondaCerrada: false });
  assert.deepEqual(decidirTrasVotar({ ok: false, motivo: "fuera_de_orden", siguiente: 10 }, 7, 10), { siguiente: null, cerrar: true, termine: true, rondaCerrada: false });
});

test("fuera_de_orden con siguiente ≤ pos (estoy adelantado) → vuelvo a la del servidor SIN cerrar", () => {
  assert.deepEqual(decidirTrasVotar({ ok: false, motivo: "fuera_de_orden", siguiente: 1 }, 3, 10), { siguiente: 1, cerrar: false, termine: false, rondaCerrada: false });
});

test("ronda_cerrada / inexistente → la vista pasa a lo que diga el estado; no se cierra la card", () => {
  assert.deepEqual(decidirTrasVotar({ ok: false, motivo: "ronda_cerrada", estado: "resultado" }, 3, 10), { siguiente: null, cerrar: false, termine: false, rondaCerrada: true });
  assert.deepEqual(decidirTrasVotar({ ok: false, motivo: "inexistente" }, 3, 10), { siguiente: null, cerrar: false, termine: false, rondaCerrada: true });
});

test("sincronizarPos: el servidor más adelante gana; nunca retrocede la vista; termine al llegar a size", () => {
  assert.deepEqual(sincronizarPos(2, 5, 10), { pos: 5, confirmadasHasta: 5, termine: false });
  assert.deepEqual(sincronizarPos(6, 3, 10), { pos: 6, confirmadasHasta: 3, termine: false });
  assert.deepEqual(sincronizarPos(0, 10, 10), { pos: 10, confirmadasHasta: 10, termine: true });
});

test("al vencer se manda pass; duración en h y min; el Pero sólo con contenido", () => {
  assert.equal(VOTO_AL_VENCER, "pass");
  assert.equal(formatoDuracion(90), "1 h 30 min");
  assert.equal(formatoDuracion(120), "2 h");
  assert.equal(formatoDuracion(45), "45 min");
  assert.equal(formatoDuracion(0), "");
  assert.equal(hayAdvertencia(null), false);
  assert.equal(hayAdvertencia("   "), false);
  assert.equal(hayAdvertencia(""), false);
  assert.equal(hayAdvertencia("Es lenta al principio."), true);
});
