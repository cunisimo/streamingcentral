// El texto que ve una persona cuando un guardado falla.
//
// Reportado en la verificación manual del 27/08, punto 10 de la lista: cortar la
// red y tocar Guardar mostraba en pantalla, tal cual:
//
//     TypeError: Failed to fetch
//
// Es el error crudo del navegador. La recuperación funcionaba —las 31 opciones y
// los dos botones se reactivaban y se podía reintentar—, así que lo único roto
// era el texto.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CONEXION, GENERICO, mensajeDeGuardado } from "./mensaje-guardado.ts";

test("el error de red del navegador se traduce", () => {
  assert.equal(mensajeDeGuardado("TypeError: Failed to fetch"), CONEXION);
});

test("las otras formas del mismo fallo también", () => {
  // Cada navegador lo escribe distinto, y todos significan lo mismo: no salió.
  for (const crudo of [
    "Failed to fetch",
    "TypeError: Failed to fetch",
    "NetworkError when attempting to fetch resource.",
    "Load failed",
    "Network request failed",
    "The Internet connection appears to be offline.",
    "fetch failed",
  ]) {
    assert.equal(mensajeDeGuardado(crudo), CONEXION, `no se tradujo: ${crudo}`);
  }
});

test("NINGÚN mensaje que se muestre contiene jerga de navegador", () => {
  // La regla, y no una lista de casos: lo que ve la persona nunca dice
  // `TypeError`, `fetch` ni `undefined`.
  for (const crudo of [
    "TypeError: Failed to fetch",
    "new row violates row-level security policy for table \"profiles\"",
    "JWT expired",
    "unknown",
  ]) {
    const m = mensajeDeGuardado(crudo);
    assert.doesNotMatch(m, /TypeError|fetch|undefined|\[object/i, `se filtró jerga: ${m}`);
  }
});

test("un error que NO es de red da el mensaje genérico", () => {
  // El detalle técnico no se pierde: se registra en la consola, no en pantalla.
  assert.equal(mensajeDeGuardado("JWT expired"), GENERICO);
  assert.equal(mensajeDeGuardado("new row violates row-level security policy"), GENERICO);
});

test("sin error NO hay mensaje", () => {
  // El hueco del error se renderiza siempre; si devolviera un texto por defecto,
  // el diálogo abriría mostrando un error que no pasó.
  assert.equal(mensajeDeGuardado(undefined), "");
  assert.equal(mensajeDeGuardado(""), "");
  assert.equal(mensajeDeGuardado("   "), "");
  assert.equal(mensajeDeGuardado(null as unknown as string), "");
});

test("los dos mensajes están en español rioplatense y dicen qué hacer", () => {
  for (const m of [CONEXION, GENERICO]) {
    assert.ok(m.length > 20, `demasiado corto: ${m}`);
    assert.match(m, /probá|revisá/i, `no dice qué hacer: ${m}`);
    assert.doesNotMatch(m, /\bintenta\b|\brevisa\b(?!\wá)/i, "no es rioplatense");
  }
  // El de conexión tiene que nombrar la causa; el genérico no puede inventarla.
  assert.match(CONEXION, /conexión/i);
  assert.doesNotMatch(GENERICO, /conexión/i);
});

test("es una función PURA: no mira el estado de la red", () => {
  // `navigator.onLine` miente —da true con un portal cautivo o con la red caída
  // del otro lado—, así que la decisión sale del error que YA ocurrió.
  const src = String(mensajeDeGuardado);
  assert.doesNotMatch(src, /navigator|window|onLine/);
});
