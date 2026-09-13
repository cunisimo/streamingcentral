// La señal de la solicitud viaja por AsyncLocalStorage (Etapa 2, #17, §3.8).
import { test } from "node:test";
import assert from "node:assert/strict";
import { combinarSenales, conSenal, senalActual } from "./senal-solicitud.ts";

test("fuera de un scope no hay señal; adentro se propaga por await y por promesas", async () => {
  assert.equal(senalActual(), null);
  const c = new AbortController();
  await conSenal(c.signal, async () => {
    assert.equal(senalActual(), c.signal);
    await new Promise((r) => setTimeout(r, 1));
    assert.equal(senalActual(), c.signal);
    await Promise.all([1, 2].map(async () => { await Promise.resolve(); assert.equal(senalActual(), c.signal); }));
  });
  assert.equal(senalActual(), null);
});

test("combinarSenales: sin señales → undefined; una → la misma; dos → aborta cuando aborta cualquiera", () => {
  assert.equal(combinarSenales(null, undefined), undefined);
  const a = new AbortController(), b = new AbortController();
  assert.equal(combinarSenales(null, a.signal), a.signal);
  const ambas = combinarSenales(a.signal, b.signal)!;
  assert.equal(ambas.aborted, false);
  b.abort(new Error("presupuesto"));
  assert.equal(ambas.aborted, true);
  // Y una ya abortada aborta la combinada de entrada.
  assert.equal(combinarSenales(a.signal, b.signal)!.aborted, true);
});
