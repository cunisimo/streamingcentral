// Cómo abre la entrada a Pelimatch (decisión del dueño, 22/09): pestaña nueva
// en el navegador, conservando el Home; misma vista en la PWA instalada y en el
// contenedor, donde no hay pestañas y `_blank` expulsaría a otro contexto de
// almacenamiento.
import { test } from "node:test";
import assert from "node:assert/strict";
import { abreEnPestanaNueva, atributosEnlace, contextoDelNavegador } from "./apertura.ts";

test("navegador común → pestaña nueva, con rel de seguridad", () => {
  assert.equal(abreEnPestanaNueva({ standalone: false, nativo: false }), true);
  assert.deepEqual(atributosEnlace({ standalone: false, nativo: false }), { target: "_blank", rel: "noopener noreferrer" });
});

test("PWA instalada o contenedor nativo → misma vista, sin target", () => {
  for (const c of [{ standalone: true, nativo: false }, { standalone: false, nativo: true }, { standalone: true, nativo: true }]) {
    assert.equal(abreEnPestanaNueva(c), false, JSON.stringify(c));
    assert.deepEqual(atributosEnlace(c), {});
  }
});

test("sin `window` (render del servidor) no se pone target: el HTML inicial abre en la misma vista", () => {
  const w = globalThis.window;
  // @ts-expect-error se saca a propósito para simular el server
  delete globalThis.window;
  try {
    assert.deepEqual(contextoDelNavegador(false), { standalone: true, nativo: false });
    assert.deepEqual(atributosEnlace(contextoDelNavegador(false)), {});
  } finally {
    if (w) globalThis.window = w;
  }
});

test("lee display-mode: standalone y el navigator.standalone de iOS; si matchMedia lanza, no rompe", () => {
  const w = globalThis.window;
  const poner = (mm: unknown, nav: unknown) => {
    // @ts-expect-error doble mínimo de window (con su propio navigator)
    globalThis.window = { matchMedia: mm, navigator: nav };
  };
  try {
    poner(() => ({ matches: true }), {});
    assert.equal(contextoDelNavegador(false).standalone, true);
    poner(() => ({ matches: false }), {});
    assert.equal(contextoDelNavegador(false).standalone, false);
    poner(() => ({ matches: false }), { standalone: true });   // iOS
    assert.equal(contextoDelNavegador(false).standalone, true);
    poner(() => { throw new Error("SecurityError"); }, {});
    assert.equal(contextoDelNavegador(false).standalone, false);
  } finally {
    // @ts-expect-error se restaura el original (o se saca, si no había)
    if (w) globalThis.window = w; else delete globalThis.window;
  }
});
