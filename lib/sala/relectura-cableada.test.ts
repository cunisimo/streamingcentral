// EL RECORRIDO COMPLETO de la relectura, con las piezas REALES cableadas como
// en la app (corrección del dueño, 22/09):
//
//   pedirTanda / desempatar  →  releer  =  releerDe(crearLector(...))  →  RPC
//
// El bug que fija: `crearLector.leer()` atrapaba el error de la RPC, avisaba por
// `alError` y no devolvía nada, así que `asegurarRelectura` veía una promesa
// resuelta, daba la lectura por buena y LA CADENA DE REINTENTOS NUNCA ARRANCABA.
// Acá no se simula `releer`: se arma con el lector de verdad y una RPC que
// devuelve error, que es exactamente lo que pasa con la red caída.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { crearLector, releerDe } from "../../hooks/sala-lector.ts";
import { desempatar, pedirTanda, ESPERAS_RELECTURA, type DepsPedirTanda } from "./acciones-host.ts";

type Resp = { data: unknown; error: { message: string } | null };
const ESTADO_OK: Resp = { data: { estado: "preparando", version: 3, ahora: "2026-09-22T12:00:00Z" }, error: null };
const ERROR_RPC: Resp = { data: null, error: { message: "TypeError: Failed to fetch" } };

/** El lector real de useSala, con la RPC bajo control del test. */
function cableado(respuestas: Resp[]) {
  const log: string[] = [];
  let i = 0;
  const lector = crearLector({
    pedir: async () => { log.push("rpc sala_estado"); return respuestas[Math.min(i++, respuestas.length - 1)]; },
    ahora: () => 1000 + i,
    alEstado: () => log.push("estado aplicado"),
    alError: (m) => log.push(`error ${m}`),
    alTokenInvalido: () => log.push("token-invalido"),
    alTerminarLectura: () => log.push("cargado"),
    alTerminal: () => log.push("terminal"),
  });
  const esperas: number[] = [];
  return {
    log, esperas,
    releer: releerDe(lector),
    relectura: { dormir: async (ms: number) => { esperas.push(ms); } },
    lecturas: () => log.filter((l) => l === "rpc sala_estado").length,
  };
}

test("Empezar con la RPC de estado fallando: la cadena ARRANCA y reintenta acotado", async () => {
  const c = cableado([ERROR_RPC]);   // siempre falla
  const deps: DepsPedirTanda = {
    jwt: async () => "JWT",
    post: async () => ({ status: 200, body: { ok: true, round_id: "R" } }),
    releer: c.releer,
    relectura: c.relectura,
  };
  const r = await pedirTanda(deps, "R1", 10, "cualquiera");
  assert.equal(r.ok, true, "preparar salió bien aunque la relectura falle");
  assert.ok(r.ok && r.relectura, "🔴 la cadena de reintentos existe (antes era undefined y ahí estaba el bug)");
  assert.deepEqual(await (r.ok ? r.relectura! : Promise.reject()), { intentos: 1 + ESPERAS_RELECTURA.length, ok: false });
  assert.equal(c.lecturas(), 4, "una inmediata + 3 reintentos, y ninguna más");
  assert.deepEqual(c.esperas, [...ESPERAS_RELECTURA]);
});

test("Empezar con la RPC fallando y recuperándose: el reintento aplica el estado nuevo", async () => {
  const c = cableado([ERROR_RPC, ERROR_RPC, ESTADO_OK]);
  const r = await pedirTanda({
    jwt: async () => "JWT",
    post: async () => ({ status: 200, body: { ok: true } }),
    releer: c.releer,
    relectura: c.relectura,
  }, "R1", 5, "corta");
  assert.equal(r.ok, true);
  assert.deepEqual(await (r.ok ? r.relectura! : Promise.reject()), { intentos: 3, ok: true });
  assert.equal(c.lecturas(), 3);
  assert.ok(c.log.includes("estado aplicado"), "el estado nuevo llegó por el reintento, no por el canal");
  assert.deepEqual(c.esperas, [...ESPERAS_RELECTURA].slice(0, 2));
});

test("Desempatar con la RPC de estado fallando: mismo recorrido", async () => {
  const c = cableado([ERROR_RPC, ESTADO_OK]);
  const r = await desempatar({
    rpc: async () => ({ data: { ganador_pos: 1 }, error: null }),
    releer: c.releer,
    relectura: c.relectura,
  });
  assert.equal(r.ok, true);
  assert.deepEqual(await (r.ok ? r.relectura! : Promise.reject()), { intentos: 2, ok: true });
  assert.equal(c.lecturas(), 2);
});

test("con la RPC sana no hay cadena ni esperas: una sola lectura", async () => {
  const c = cableado([ESTADO_OK]);
  const r = await desempatar({ rpc: async () => ({ data: {}, error: null }), releer: c.releer, relectura: c.relectura });
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.relectura, undefined);
  assert.equal(c.lecturas(), 1);
  assert.deepEqual(c.esperas, []);
});

test("EN ROJO: con el contrato viejo (leer() que se traga el error) la cadena no arrancaba", async () => {
  // Reproduce la versión anterior de `releer`: llamaba a `leer()` y descartaba
  // su resultado, así que nunca rechazaba.
  const c = cableado([ERROR_RPC]);
  const releerViejo = async () => { await c.releer().catch(() => {}); };
  const r = await pedirTanda({
    jwt: async () => "JWT",
    post: async () => ({ status: 200, body: { ok: true } }),
    releer: releerViejo,
    relectura: c.relectura,
  }, "R1", 10, "cualquiera");
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.relectura, undefined, "así se veía el bug: sin cadena");
  assert.equal(c.lecturas(), 1, "una sola lectura fallida y nada más");
});

test("GUARD del cableado: useSala.releer se construye con releerDe (si alguien vuelve a tragarse el error, falla acá)", () => {
  const src = readFileSync(join(process.cwd(), "hooks/useSala.ts"), "utf8");
  assert.match(src, /import \{ crearLector, releerDe/, "useSala importa releerDe");
  assert.match(src, /const releer = useCallback\(async \(\) => \{[^}]*releerDe\(l\)\(\)/s, "releer usa releerDe");
  assert.ok(!/await lectorRef\.current\?\.leer\(\);\s*\}, \[\]\)/.test(src), "no vuelve al contrato viejo (leer() y descartar el resultado)");
});
