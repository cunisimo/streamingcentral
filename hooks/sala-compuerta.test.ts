// La compuerta de `useSala`: respuestas fuera de orden no retroceden el estado,
// y una lectura de la generación anterior (otra sala, otra credencial) no
// escribe sobre la nueva. Con promesas DIFERIDAS: se resuelven a mano, en el
// orden que se quiere probar.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearCompuerta, type Compuerta } from "./sala-compuerta.ts";

function diferida<T>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/** El esqueleto de `leer` en useSala: ticket al salir, compuerta al volver, en éxito Y en error. */
function lector(c: Compuerta) {
  const aplicados: string[] = [];
  let estado: string | null = null;
  let error: string | null = null;
  async function leer(p: Promise<string>) {
    const t = c.emitir();
    try {
      const v = await p;
      if (!c.aplicar(t)) return;
      estado = v; error = null; aplicados.push(v);
    } catch (e) {
      if (!c.aplicar(t)) return;
      error = String(e); aplicados.push("ERR:" + String(e));
    }
  }
  return { leer, get estado() { return estado; }, get error() { return error; }, aplicados };
}

test("responde primero la lectura NUEVA y después la VIEJA: el estado final sigue siendo el nuevo", async () => {
  const c = crearCompuerta();
  const l = lector(c);
  const vieja = diferida<string>(), nueva = diferida<string>();
  const pv = l.leer(vieja.promise);   // salió primero
  const pn = l.leer(nueva.promise);   // salió después
  nueva.resolve("v2"); await pn;
  assert.equal(l.estado, "v2");
  vieja.resolve("v1"); await pv;
  assert.equal(l.estado, "v2", "la respuesta vieja no retrocede");
  assert.deepEqual(l.aplicados, ["v2"]);
});

test("en orden normal las dos se aplican, la última gana", async () => {
  const c = crearCompuerta();
  const l = lector(c);
  const a = diferida<string>(), b = diferida<string>();
  const pa = l.leer(a.promise), pb = l.leer(b.promise);
  a.resolve("v1"); await pa;
  b.resolve("v2"); await pb;
  assert.deepEqual(l.aplicados, ["v1", "v2"]);
  assert.equal(l.estado, "v2");
});

test("un ERROR viejo que llega después de un estado nuevo tampoco se aplica", async () => {
  const c = crearCompuerta();
  const l = lector(c);
  const vieja = diferida<string>(), nueva = diferida<string>();
  const pv = l.leer(vieja.promise), pn = l.leer(nueva.promise);
  nueva.resolve("v2"); await pn;
  vieja.reject(new Error("timeout")); await pv;
  assert.equal(l.estado, "v2");
  assert.equal(l.error, null, "el error viejo no tapa el estado nuevo");
});

test("cambio de roomId/token (reiniciar): una solicitud de la generación anterior no puede actualizar la nueva", async () => {
  const c = crearCompuerta();
  const l = lector(c);
  const anterior = diferida<string>();
  const pa = l.leer(anterior.promise);        // sala A, en vuelo
  c.reiniciar();                              // el hook cambió a la sala B
  const nueva = diferida<string>();
  const pn = l.leer(nueva.promise);           // sala B
  anterior.resolve("estado de A"); await pa;
  assert.equal(l.estado, null, "lo de A no se aplica en B");
  nueva.resolve("estado de B"); await pn;
  assert.equal(l.estado, "estado de B");
  // Y si la de A llegara DESPUÉS de la de B, tampoco.
  const otraA = diferida<string>();
  const t = c.estado();
  const pOtra = l.leer(otraA.promise);
  c.reiniciar();
  otraA.resolve("A tardía"); await pOtra;
  assert.equal(l.estado, "estado de B");
  assert.equal(c.estado().gen, t.gen + 1);
});

test("aplicar es monotónico: un ticket ya aplicado o menor no vuelve a pasar", () => {
  const c = crearCompuerta();
  const t1 = c.emitir(), t2 = c.emitir(), t3 = c.emitir();
  assert.equal(c.aplicar(t2), true);
  assert.equal(c.aplicar(t1), false);
  assert.equal(c.aplicar(t2), false);
  assert.equal(c.aplicar(t3), true);
  assert.deepEqual(c.estado(), { gen: 0, emitidas: 3, aplicada: 3 });
});
