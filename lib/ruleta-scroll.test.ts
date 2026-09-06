// El anclaje de la sección al volver de una ficha.
import { test } from "node:test";
import assert from "node:assert/strict";
import { objetivoDeScroll, llego, TOLERANCIA_PX, VENTANA_REACOMODO_MS } from "./ruleta-scroll.ts";

test("🔴 el objetivo deja la sección en el MISMO lugar de la pantalla", () => {
  // Se guardó con la sección a 36 px del borde de arriba, estando el scroll en
  // 880. Al volver, la sección arranca en 916 del documento (top 916 con scroll
  // 0): el objetivo tiene que ser 880 otra vez.
  const pos = { y: 880, ancla: 36 };
  assert.equal(objetivoDeScroll(pos, { top: 916, scrollY: 0 }), 880);
});

test("🔴 si la sección se movió, el número cambia y el resultado visual NO", () => {
  // Es todo el punto: "Elegidas para vos" aparece arriba y empuja 300 px. Un
  // scroll absoluto dejaría al usuario 300 px más arriba de la ruleta.
  const pos = { y: 880, ancla: 36 };
  assert.equal(objetivoDeScroll(pos, { top: 1216, scrollY: 0 }), 1180,
    "no siguió a la sección");
});

test("da el mismo objetivo se mida desde donde se mida", () => {
  const pos = { y: 880, ancla: 36 };
  // El mismo documento, leído con la página ya en 500: top pasa a 416.
  assert.equal(objetivoDeScroll(pos, { top: 416, scrollY: 500 }), 880);
  // Y leído desde abajo.
  assert.equal(objetivoDeScroll(pos, { top: -1084, scrollY: 2000 }), 880);
});

test("nunca pide un desplazamiento negativo", () => {
  // Sección arriba de todo y ancla grande (estaba a media pantalla).
  assert.equal(objetivoDeScroll({ y: 0, ancla: 400 }, { top: 100, scrollY: 0 }), 0);
});

test("🔴 un snapshot viejo, sin ancla, sigue restaurando el desplazamiento guardado", () => {
  // Los snapshots escritos antes de esta corrección no tienen `ancla`. Que la
  // vuelta siguiente no restaure NADA sería peor que restaurar lo de antes.
  assert.equal(objetivoDeScroll({ y: 880, ancla: null }, { top: 916, scrollY: 0 }), 880);
});

test("sin la sección montada cae al desplazamiento guardado", () => {
  assert.equal(objetivoDeScroll({ y: 880, ancla: 36 }, null), 880);
});

test("la tolerancia absorbe el redondeo del navegador, no un desvío real", () => {
  assert.equal(llego(880, 880), true);
  assert.equal(llego(881.6, 880), true, "1,6 px es redondeo: medido 1020.8 con scroll 1020");
  assert.equal(llego(0, 880), false, "arriba de todo NO es haber llegado");
  assert.equal(llego(890, 880), false);
  assert.ok(TOLERANCIA_PX < 4, "una tolerancia grande esconde justamente el bug que se arregla");
});

test("la ventana de reacomodo es corta y existe", () => {
  // Corta porque mientras dura se le gana al usuario si scrollea con el teclado
  // (el gesto la corta, pero conviene que igual no sea eterna), y suficiente
  // para cubrir la restauración nativa del navegador, que llega en cientos de ms.
  assert.ok(VENTANA_REACOMODO_MS >= 600 && VENTANA_REACOMODO_MS <= 2000);
});
