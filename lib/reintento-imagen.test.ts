// El reintento acotado de una imagen que no cargó, y su agotamiento.
//
// Es la DEFENSA, no la corrección: la causa del bug de los círculos vacíos era
// `loading="lazy"` (ver `docs/ISSUES.md` → #15), y esas imágenes ni siquiera
// llegaban a pedirse. Esto cubre el otro camino, el que sí es un fallo de red:
// hasta ahora `AvatarCard` no manejaba `onError`, así que una petición fallida
// también dejaba el círculo vacío y ahí se quedaba.
import { test } from "node:test";
import assert from "node:assert/strict";
import { INTENTO_MAXIMO, puedeElegirse, trasError, urlDeIntento } from "./reintento-imagen.ts";

const SRC = "/avatars/avatar-moon.webp";

// ============================================================================
// La URL de cada intento
// ============================================================================

test("el primer intento usa la URL tal cual", () => {
  assert.equal(urlDeIntento(SRC, 0), SRC);
});

test("el reintento lleva una marca FIJA, no un timestamp", () => {
  assert.equal(urlDeIntento(SRC, 1), `${SRC}?reintento=1`);
});

test("la URL del reintento es ESTABLE: mil llamadas, la misma cadena", () => {
  // Un timestamp daría una URL distinta cada vez y con eso una entrada nueva en
  // el cache del service worker en cada fallo. La marca fija agrega, como mucho,
  // UNA entrada por avatar.
  const primera = urlDeIntento(SRC, 1);
  for (let i = 0; i < 1000; i++) assert.equal(urlDeIntento(SRC, 1), primera);
});

test("no se inventa una tercera URL: más allá del reintento, la misma", () => {
  for (const intento of [1, 2, 5, 99]) {
    assert.equal(urlDeIntento(SRC, intento), `${SRC}?reintento=1`);
  }
});

test("si la ruta ya trajera query, se agrega con &", () => {
  assert.equal(urlDeIntento("/avatars/x.webp?v=2", 1), "/avatars/x.webp?v=2&reintento=1");
});

test("la URL del reintento sigue siendo local y del mismo archivo", () => {
  // El reintento no puede convertirse en una ruta a otro lado.
  for (const intento of [0, 1]) {
    const u = urlDeIntento(SRC, intento);
    assert.ok(u.startsWith("/avatars/avatar-moon.webp"), u);
    assert.doesNotMatch(u, /^https?:|^\/\/|\.\./);
  }
});

// ============================================================================
// El agotamiento: UN reintento, y se acabó
// ============================================================================

test("el primer error dispara el reintento y NO agota", () => {
  assert.deepEqual(trasError(0), { intento: 1, agotado: false });
});

test("el segundo error agota", () => {
  assert.deepEqual(trasError(1), { intento: 1, agotado: true });
});

test("CIEN errores seguidos no pasan de un reintento", () => {
  // El guard contra el bucle: `onError` puede dispararse muchas veces, y cada
  // cambio de `src` puede provocar otro. El contador no crece.
  let estado = { intento: 0, agotado: false };
  for (let i = 0; i < 100; i++) estado = trasError(estado.intento);
  assert.equal(estado.intento, INTENTO_MAXIMO);
  assert.equal(estado.intento, 1);
  assert.equal(estado.agotado, true);
});

test("agotado NO vuelve atrás solo", () => {
  const a = trasError(1);
  const b = trasError(a.intento);
  assert.equal(b.agotado, true);
});

test("INTENTO_MAXIMO es 1: el original más UN reintento", () => {
  // Si alguien lo sube, que sea una decisión visible en el diff.
  assert.equal(INTENTO_MAXIMO, 1);
});

// ============================================================================
// Qué pasa con el botón cuando se agotó
// ============================================================================

test("mientras no se agote, la opción se puede elegir", () => {
  assert.equal(puedeElegirse(false), true);
});

test("agotada, la opción NO se puede elegir", () => {
  // Guardar un avatar cuya imagen no está disponible dejaría a la persona con un
  // avatar roto en toda la app. Es preferible no dejar elegirlo.
  assert.equal(puedeElegirse(true), false);
});
