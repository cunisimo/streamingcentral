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

// --- La carrera que encontró el dueño (22/09) --------------------------------
// 1. La acción arranca su lectura de `sala_estado` y queda pendiente.
// 2. Entra una segunda lectura (aviso de Realtime) y FALLA.
// 3. Vuelve la primera con un estado válido, pero la compuerta la descarta por
//    ser anterior.
// Nadie aplicó el estado nuevo. Con el contrato anterior, `descartada` contaba
// como éxito y la acción no reintentaba.

/** Igual que `cableado`, pero con las respuestas resueltas a mano. */
function cableadoManual() {
  const pendientes: Array<(v: Resp) => void> = [];
  const log: string[] = [];
  const esperas: number[] = [];
  const lector = crearLector({
    pedir: () => new Promise<Resp>((res) => pendientes.push(res)),
    ahora: () => 1000,
    alEstado: () => log.push("estado aplicado"),
    alError: (m) => log.push(`error ${m}`),
    alTokenInvalido: () => log.push("token-invalido"),
    alTerminarLectura: () => log.push("cargado"),
    alTerminal: () => log.push("terminal"),
  });
  return { lector, pendientes, log, esperas, releer: releerDe(lector), relectura: { dormir: async (ms: number) => { esperas.push(ms); } } };
}

test("CARRERA: la lectura de la acción se descarta y la que ganó FALLÓ → la cadena de reintentos arranca igual", async () => {
  const c = cableadoManual();
  const accion = pedirTanda({
    jwt: async () => "JWT",
    post: async () => ({ status: 200, body: { ok: true } }),
    releer: c.releer,
    relectura: c.relectura,
  }, "R1", 10, "cualquiera");

  // La lectura de la acción ya salió (1) y entra la del aviso (2), que falla.
  while (c.pendientes.length < 1) await new Promise((r) => setImmediate(r));
  const senal = c.lector.leer();
  while (c.pendientes.length < 2) await new Promise((r) => setImmediate(r));
  c.pendientes[1]({ data: null, error: { message: "Failed to fetch" } });
  assert.equal(await senal, "fallo");

  // Ahora vuelve la de la acción, con un estado VÁLIDO pero vieja.
  c.pendientes[0]({ data: { estado: "preparando", version: 9, ahora: "2026-09-22T12:00:00Z" }, error: null });
  const r = await accion;
  assert.equal(r.ok, true);
  assert.ok(!c.log.includes("estado aplicado"), "ninguna lectura aplicó el estado nuevo");
  assert.ok(r.ok && r.relectura, "🔴 la acción reintenta: antes daba la relectura por buena y se quedaba quieta");

  // Los reintentos salen y terminan acotados (todos fallan en este caso).
  const cadena = r.ok ? r.relectura! : Promise.reject();
  for (let i = 0; i < ESPERAS_RELECTURA.length; i++) {
    while (c.pendientes.length < 3 + i) await new Promise((res) => setImmediate(res));
    c.pendientes[2 + i]({ data: null, error: { message: "sigue caída" } });
    await new Promise((res) => setImmediate(res));
  }
  assert.deepEqual(await cadena, { intentos: 1 + ESPERAS_RELECTURA.length, ok: false });
  assert.deepEqual(c.esperas, [...ESPERAS_RELECTURA]);
});

test("una lectura descartada porque OTRA aplicó el estado NO genera solicitudes extra", async () => {
  const c = cableadoManual();
  const accion = pedirTanda({
    jwt: async () => "JWT",
    post: async () => ({ status: 200, body: { ok: true } }),
    releer: c.releer,
    relectura: c.relectura,
  }, "R1", 10, "cualquiera");

  while (c.pendientes.length < 1) await new Promise((r) => setImmediate(r));
  const senal = c.lector.leer();
  while (c.pendientes.length < 2) await new Promise((r) => setImmediate(r));
  // La segunda gana y SÍ aplica estado.
  c.pendientes[1]({ data: { estado: "preparando", version: 10, ahora: "2026-09-22T12:00:00Z" }, error: null });
  assert.equal(await senal, "aplicada");
  // La primera vuelve tarde: se descarta, pero el estado ya está puesto.
  c.pendientes[0]({ data: { estado: "lobby", version: 9, ahora: "2026-09-22T12:00:00Z" }, error: null });
  const r = await accion;
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.relectura, undefined, "sin cadena: no hace falta reintentar");
  assert.equal(c.pendientes.length, 2, "ni una solicitud extra");
  assert.equal(c.log.filter((l) => l === "estado aplicado").length, 1, "y el estado viejo NO se aplicó encima");
  assert.deepEqual(c.esperas, []);
});

test("descartada con la sala ya terminal tampoco reintenta", async () => {
  const c = cableadoManual();
  const accion = pedirTanda({
    jwt: async () => "JWT", post: async () => ({ status: 200, body: { ok: true } }),
    releer: c.releer, relectura: c.relectura,
  }, "R1", 10, "cualquiera");
  while (c.pendientes.length < 1) await new Promise((r) => setImmediate(r));
  const senal = c.lector.leer();
  while (c.pendientes.length < 2) await new Promise((r) => setImmediate(r));
  c.pendientes[1]({ data: null, error: { message: "sala_token_invalido" } });
  assert.equal(await senal, "invalida");
  c.pendientes[0]({ data: { estado: "lobby", version: 9, ahora: "x" }, error: null });
  const r = await accion;
  assert.equal(r.ok && r.relectura, undefined, "la sala ya no sirve: no hay nada que reintentar");
  assert.equal(c.pendientes.length, 2);
});
