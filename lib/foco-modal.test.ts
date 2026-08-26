import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SELECTOR_ENFOCABLE, cierraElDialogo, focoInicial, siguienteFoco,
} from "./foco-modal.ts";

// ============================================================================
// El foco no se escapa del diálogo
// ============================================================================

// Simula una sesión de teclado: arranca en `desde` y aprieta Tab (o Shift+Tab)
// `pasos` veces, devolviendo por dónde pasó. Cuando `siguienteFoco` devuelve
// null, el navegador movería al vecino, y eso es lo que hace `+1` / `-1`.
function recorrer(cantidad: number, desde: number, pasos: number, shift = false): number[] {
  const camino: number[] = [];
  let i = desde;
  for (let p = 0; p < pasos; p++) {
    const salto = siguienteFoco(cantidad, i, shift);
    i = salto !== null ? salto : (shift ? i - 1 : i + 1);
    camino.push(i);
  }
  return camino;
}

test("Tab en el ÚLTIMO control vuelve al primero, no se va a la página", () => {
  assert.equal(siguienteFoco(5, 4, false), 0);
});

test("Shift+Tab en el PRIMERO va al último, no se va a la página", () => {
  assert.equal(siguienteFoco(5, 0, true), 4);
});

test("en el medio no se intercepta: el navegador hace su trabajo", () => {
  for (let i = 1; i <= 3; i++) {
    assert.equal(siguienteFoco(5, i, false), null, `Tab en ${i} no debería interceptarse`);
    assert.equal(siguienteFoco(5, i, true), null, `Shift+Tab en ${i} no debería interceptarse`);
  }
});

test("una vuelta COMPLETA con Tab termina donde empezó", () => {
  // La prueba de que el ciclo cierra: cinco controles, cinco Tabs, vuelve al 0.
  assert.deepEqual(recorrer(5, 0, 5), [1, 2, 3, 4, 0]);
});

test("una vuelta completa con Shift+Tab también cierra", () => {
  assert.deepEqual(recorrer(5, 4, 5, true), [3, 2, 1, 0, 4]);
});

test("NINGÚN índice del recorrido se sale del rango, en 200 pasos", () => {
  // El test que de verdad prueba "atrapado": si en algún momento el índice
  // cayera fuera de [0, n), el foco estaría en la página de atrás.
  for (const shift of [false, true]) {
    for (const camino of [recorrer(31, 0, 200, shift), recorrer(31, 30, 200, shift)]) {
      for (const i of camino) {
        assert.ok(i >= 0 && i < 31, `el foco se escapó al índice ${i}`);
      }
    }
  }
});

test("con un solo control enfocable, Tab se queda ahí", () => {
  assert.equal(siguienteFoco(1, 0, false), 0);
  assert.equal(siguienteFoco(1, 0, true), 0);
});

test("sin controles enfocables no se intercepta nada", () => {
  assert.equal(siguienteFoco(0, -1, false), null);
});

test("con el foco afuera, Tab entra por el primero y Shift+Tab por el último", () => {
  assert.equal(siguienteFoco(5, -1, false), 0);
  assert.equal(siguienteFoco(5, -1, true), 4);
});

// ============================================================================
// Foco inicial
// ============================================================================

test("el foco inicial va a la opción SELECCIONADA, no al contenedor", () => {
  // Abrir el selector con el avatar propio ya enfocado es lo que hace que quien
  // navega con teclado sepa dónde está parado.
  assert.equal(focoInicial(31, 8), 8);
});

test("sin selección, el foco inicial va al primer control", () => {
  assert.equal(focoInicial(31, -1), 0);
});

test("una selección fuera de rango no rompe: cae al primero", () => {
  assert.equal(focoInicial(31, 99), 0);
  assert.equal(focoInicial(31, -5), 0);
});

test("sin controles, no hay foco inicial", () => {
  assert.equal(focoInicial(0, 3), null);
});

// ============================================================================
// Cerrar
// ============================================================================

test("Escape, el fondo y Cancelar cierran cuando no se está guardando", () => {
  for (const g of ["escape", "fondo", "cancelar"] as const) {
    assert.equal(cierraElDialogo(g, false), true, `${g} debería cerrar`);
  }
});

test("MIENTRAS SE GUARDA no cierra nada", () => {
  // Cerrar con la petición en vuelo deja a la persona sin saber si su avatar
  // quedó guardado. Los tres gestos quedan bloqueados.
  for (const g of ["escape", "fondo", "cancelar"] as const) {
    assert.equal(cierraElDialogo(g, true), false, `${g} cerró estando guardando`);
  }
});

// ============================================================================
// El selector
// ============================================================================

test("el selector de enfocables excluye lo deshabilitado y lo sacado del orden", () => {
  assert.match(SELECTOR_ENFOCABLE, /button:not\(\[disabled\]\)/);
  assert.match(SELECTOR_ENFOCABLE, /tabindex.*-1/);
});
