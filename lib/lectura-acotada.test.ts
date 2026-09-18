// Una lectura con TOPE: lo que no llega en `ms` se da por ausente (`null`), sin
// esperar los reintentos del SDK de Redis (Etapa 3.c.1, auditoría sobre
// 6fc63b5, punto 1: con la pausa local vigente no hay nada que componer, así
// que una lectura previa que tarde 20 s sólo demora un 503). Puro, con el
// `dormir` inyectable (reloj virtual en los tests). Escrito ANTES del módulo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { conTope } from "./lectura-acotada.ts";

function reloj() {
  let t = 0; const durmiendo: { en: number; r: () => void }[] = [];
  const dormir = (ms: number, senal?: AbortSignal) => new Promise<void>((r) => { if (senal?.aborted) { r(); return; } const d = { en: t + ms, r }; durmiendo.push(d); senal?.addEventListener("abort", () => { const i = durmiendo.indexOf(d); if (i >= 0) { durmiendo.splice(i, 1); r(); } }, { once: true }); });
  const avanzar = async (ms: number) => { t += ms; const todos = durmiendo.splice(0); for (const d of todos) { if (d.en <= t) d.r(); else durmiendo.push(d); } await new Promise((r) => setImmediate(r)); };
  return { dormir, avanzar, get pendientes() { return durmiendo.length; } };
}

test("🔴 una lectura que responde antes del tope devuelve su valor y no deja temporizador vivo", async () => {
  const r = reloj();
  const p = conTope(Promise.resolve({ v: 1 }), 1000, r.dormir);
  await new Promise((x) => setImmediate(x));
  assert.deepEqual(await p, { v: 1 });
  assert.equal(r.pendientes, 0, "el tope quedó durmiendo");
});

test("🔴 una lectura que NO responde dentro del tope devuelve null en el tope, sin esperarla", async () => {
  const r = reloj();
  const p = conTope(new Promise(() => {}), 1000, r.dormir);
  let resuelto: unknown = "pendiente";
  void p.then((v) => { resuelto = v; });
  await r.avanzar(999); assert.equal(resuelto, "pendiente");
  await r.avanzar(1); assert.equal(resuelto, null);
});

test("una lectura que RECHAZA (Redis caído) también es null, nunca una excepción; y una que responde después del tope se ignora", async () => {
  const r = reloj();
  assert.equal(await conTope(Promise.reject(new Error("red")), 1000, r.dormir), null);
  let tarde!: (v: string) => void;
  const p = conTope(new Promise<string>((res) => { tarde = res; }), 1000, r.dormir);
  await r.avanzar(1000);
  assert.equal(await p, null);
  tarde("llegó tarde");
  await new Promise((x) => setImmediate(x));
  assert.equal(await p, null, "el resultado no cambia después del tope");
});
