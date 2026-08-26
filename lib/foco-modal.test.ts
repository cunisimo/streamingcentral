import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SELECTOR_ENFOCABLE, atributosBloqueo, cierraElDialogo, focoInicial, nuevaSeleccion,
  puedeElegir, siguienteFoco,
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

// ============================================================================
// Bloqueo de la selección mientras se guarda
// ============================================================================

test("con la petición en vuelo NO se puede cambiar la selección", () => {
  assert.equal(puedeElegir(true), false);
  assert.equal(puedeElegir(false), true);
});

test("tocar otra card mientras guarda deja la selección COMO ESTABA", () => {
  // El caso concreto: está guardando "pocho" y alguien toca "lola". La pantalla
  // tiene que seguir mostrando "pocho", que es lo que la base va a recibir.
  assert.equal(nuevaSeleccion("pocho", "lola", true), "pocho");
});

test("sin guardar, tocar una card sí cambia la selección", () => {
  assert.equal(nuevaSeleccion("pocho", "lola", false), "lola");
});

test("después de un error se puede volver a elegir y reintentar", () => {
  // `guardando` vuelve a false cuando la petición falla, así que la misma
  // función habilita todo de nuevo. Es el camino del reintento.
  assert.equal(puedeElegir(false), true);
  assert.equal(nuevaSeleccion("pocho", "lola", false), "lola");
});

test("el bloqueo usa aria-disabled y NO el atributo disabled", () => {
  // `disabled` saca al elemento del orden de tabulación: si el foco está encima
  // —y lo está, porque acabás de tocar Guardar— se cae al body y el ciclo de
  // foco se rompe justo cuando no se puede hacer nada más que esperar.
  assert.deepEqual(atributosBloqueo(true), { "aria-disabled": true });
  // Sin guardar, el atributo directamente no se emite.
  assert.deepEqual(atributosBloqueo(false), { "aria-disabled": undefined });
});

test("el selector de enfocables NO excluye [aria-disabled]", () => {
  // ALCANCE, dicho con precisión: esto verifica una cadena de texto, nada más.
  // Comprueba que el selector no filtra por `[aria-disabled]`, que es la
  // CONDICIÓN para que un control bloqueado siga en el ciclo de foco.
  //
  // Lo que NO prueba: que el foco del DOM se comporte así de verdad, ni que un
  // lector de pantalla anuncie el control como no disponible. Las dos cosas
  // están en la lista de verificación manual de `docs/AVATARES.md`.
  assert.match(SELECTOR_ENFOCABLE, /button:not\(\[disabled\]\)/);
  assert.doesNotMatch(SELECTOR_ENFOCABLE, /aria-disabled/);
});
