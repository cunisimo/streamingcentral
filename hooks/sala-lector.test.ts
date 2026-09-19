// El lector de useSala: una respuesta descartada por la compuerta no tiene
// NINGÚN efecto — ni estado, ni error, ni "cargando", ni la máquina de
// relectura. Con promesas diferidas, resueltas a mano.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearLector, type DepsLector } from "./sala-lector.ts";

type Resp = { data: unknown; error: { message: string } | null };
function diferida() {
  let resolve!: (v: Resp) => void, reject!: (e: unknown) => void;
  const promise = new Promise<Resp>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const estado = (v: number, estado = "lobby") => ({ data: { estado, version: v, ahora: "2026-09-19T20:00:00Z" }, error: null });

function arnes() {
  const pendientes: ReturnType<typeof diferida>[] = [];
  const log: string[] = [];
  let t = 1000;
  const deps: DepsLector = {
    pedir: () => { const d = diferida(); pendientes.push(d); return d.promise; },
    ahora: () => t,
    alEstado: (e) => log.push(`estado v${(e as { version?: number }).version}`),
    alError: (m) => log.push(`error ${m}`),
    alTokenInvalido: () => log.push("token-invalido"),
    alTerminarLectura: () => log.push("cargado"),
    alTerminal: () => log.push("terminal"),
  };
  const l = crearLector(deps);
  return { l, log, pendientes, avanzar: (ms: number) => { t += ms; } };
}

test("lectura VIEJA pendiente, cambio de generación, lectura NUEVA sin resolver: la vieja no toca estado, cargando ni relectura", async () => {
  const { l, log, pendientes } = arnes();
  const pVieja = l.leer();                 // sala A, en vuelo
  l.reiniciar();                           // el hook cambió a la sala B
  assert.equal(l.senal(), 0, "primera señal en B: releer ya");
  assert.deepEqual(l.relectura(), { ultimaMs: null, pendiente: true });
  const pNueva = l.leer();                 // sala B, en vuelo
  pendientes[0].resolve(estado(7));        // responde A
  await pVieja;
  assert.deepEqual(log, [], "nada: ni estado, ni cargado");
  assert.deepEqual(l.relectura(), { ultimaMs: null, pendiente: true }, "la relectura de B sigue pendiente");
  pendientes[1].resolve(estado(1));        // responde B
  await pNueva;
  assert.deepEqual(log, ["estado v1", "cargado"]);
  assert.deepEqual(l.relectura(), { ultimaMs: 1000, pendiente: false });
});

test("respuesta vieja de la MISMA generación que llega después de la nueva: descartada entera, cargado se avisa una sola vez", async () => {
  const { l, log, pendientes } = arnes();
  const p1 = l.leer(), p2 = l.leer();
  pendientes[1].resolve(estado(2)); await p2;
  pendientes[0].resolve(estado(1)); await p1;
  assert.deepEqual(log, ["estado v2", "cargado"]);
});

test("un ERROR de la generación anterior tampoco se aplica ni apaga el cargando de la nueva", async () => {
  const { l, log, pendientes } = arnes();
  const pVieja = l.leer();
  l.reiniciar();
  const pNueva = l.leer();
  pendientes[0].reject(new Error("timeout")); await pVieja;
  assert.deepEqual(log, []);
  pendientes[1].resolve({ data: null, error: { message: "otra cosa" } }); await pNueva;
  assert.deepEqual(log, ["error otra cosa", "cargado"]);
});

test("token inválido y estado terminal: se avisa y el lector no vuelve a pedir; reiniciar lo reabre", async () => {
  const { l, log, pendientes } = arnes();
  const p = l.leer();
  pendientes[0].resolve({ data: null, error: { message: "sala_token_invalido" } }); await p;
  assert.deepEqual(log, ["token-invalido", "cargado"]);
  assert.equal(l.terminal(), true);
  await l.leer();
  assert.equal(pendientes.length, 1, "no pidió de nuevo");
  assert.equal(l.senal(), null);
  l.reiniciar();
  const p2 = l.leer();
  pendientes[1].resolve(estado(3, "vencida")); await p2;
  assert.deepEqual(log.slice(2), ["estado v3", "terminal", "cargado"]);
  assert.equal(l.terminal(), true);
});

test("la señal respeta la ventana de 1500 ms desde la última lectura ADMITIDA", async () => {
  const { l, pendientes, avanzar } = arnes();
  const p = l.leer();
  pendientes[0].resolve(estado(1)); await p;       // última lectura a t=1000
  avanzar(100);
  assert.equal(l.senal(), 1400);
  assert.equal(l.senal(), null, "ya hay una pendiente");
});
