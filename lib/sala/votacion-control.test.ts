// El bucle de la votación con reloj controlado (Tarea 3.4). Lo que fija, sobre
// todo: después de `ronda_cerrada` / `inexistente` NO sale ni un `sala_votar`
// más, aunque el contador siga vencido y la relectura del estado falle.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearControlVotacion, REINTENTO_MS, type DepsControl } from "./votacion-control.ts";

function arnes(respuestas: Array<unknown | Error>, o: { releerFalla?: boolean } = {}) {
  let t = 100_000;
  const log: string[] = [];
  const deps: DepsControl = {
    size: 5,
    ahora: () => t,
    enviar: async (pos, voto) => {
      log.push(`enviar ${pos} ${voto}`);
      const r = respuestas.shift();
      if (r instanceof Error) throw r;
      return { data: r, error: null };
    },
    releer: async () => { log.push("releer"); if (o.releerFalla) throw new Error("red"); },
    alConfirmar: (p) => log.push(`confirmar ${p}`),
    alAvanzar: (s) => log.push(`avanzar ${s}`),
    alError: (m) => log.push(`error ${m}`),
    alVuelo: () => {},
  };
  const c = crearControlVotacion(deps);
  const avanzar = (ms: number) => { t += ms; };
  // Un tick cada 250 ms durante `ms`, con la card vencida, esperando los microtasks entre medio.
  const ticksVencidos = async (pos: number, ms: number) => {
    for (let i = 0; i < ms / 250; i++) { c.tick(pos, true); await Promise.resolve(); await Promise.resolve(); avanzar(250); }
  };
  return { c, deps, log, avanzar, ticksVencidos };
}

test("después de ronda_cerrada NO sale un segundo voto aunque la relectura falle y el intervalo siga vencido", async () => {
  const { c, log, ticksVencidos } = arnes([{ ok: false, motivo: "ronda_cerrada", estado: "resultado" }], { releerFalla: true });
  c.tick(2, true);                       // el contador venció: pass automático
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(c.enviados(), 1);
  assert.equal(c.cerrada(), true);
  await ticksVencidos(2, 5000);          // 20 ticks más, 5 s, con releer fallando
  assert.equal(c.enviados(), 1, "ni un sala_votar más");
  await c.votar("yes", 2);               // ni siquiera un toque manual
  assert.equal(c.enviados(), 1);
  assert.deepEqual(log.filter((l) => l.startsWith("enviar")), ["enviar 2 pass"]);
  assert.ok(log.includes("releer"), "se pidió releer una vez");
});

test("inexistente también cierra la compuerta", async () => {
  const { c, ticksVencidos } = arnes([{ ok: false, motivo: "inexistente" }], { releerFalla: true });
  await c.votar("no", 0);
  assert.equal(c.cerrada(), true);
  await ticksVencidos(0, 2000);
  assert.equal(c.enviados(), 1);
});

test("un fallo de red con la card vencida reintenta el pass, pero no más de una vez cada REINTENTO_MS", async () => {
  const { c, log, ticksVencidos, avanzar } = arnes([new Error("Failed to fetch"), new Error("Failed to fetch"), { ok: true, termine: false, estado: "votando" }]);
  await ticksVencidos(1, 1000);          // 4 ticks en el primer segundo → 1 envío (falló) y espera
  assert.equal(c.enviados(), 1);
  assert.ok(log.some((l) => l.startsWith("error ")));
  avanzar(REINTENTO_MS);                 // pasaron los 3 s
  await ticksVencidos(1, 500);           // reintento (falla otra vez)
  assert.equal(c.enviados(), 2);
  c.permitirReintento();                 // volvió la red: no espera los 3 s
  await ticksVencidos(1, 250);
  assert.equal(c.enviados(), 3);
  assert.ok(log.includes("confirmar 1") && log.includes("avanzar 2"), log.join(" | "));
});

test("un solo voto en vuelo: el segundo toque mientras responde el primero no manda nada", async () => {
  let resolver!: (v: { data: unknown; error: null }) => void;
  const deps: DepsControl = {
    size: 5, ahora: () => 0,
    enviar: () => new Promise((res) => { resolver = res; }),
    releer: async () => {}, alConfirmar: () => {}, alAvanzar: () => {}, alError: () => {}, alVuelo: () => {},
  };
  const c = crearControlVotacion(deps);
  const p = c.votar("yes", 0);
  assert.equal(c.enVuelo(), true);
  await c.votar("no", 0);
  c.tick(0, true);
  assert.equal(c.enviados(), 1);
  resolver({ data: { ok: true, termine: false, estado: "votando" }, error: null });
  await p;
  assert.equal(c.enVuelo(), false);
});

test("con la card sin vencer, el tick no manda nada; ok avanza y confirma; la última pide releer", async () => {
  const { c, log } = arnes([{ ok: true, termine: false, estado: "votando" }, { ok: true, termine: true, estado: "votando" }]);
  c.tick(0, false);
  assert.equal(c.enviados(), 0);
  await c.votar("yes", 3);
  assert.deepEqual(log, ["enviar 3 yes", "confirmar 3", "avanzar 4"]);
  await c.votar("no", 4);
  assert.deepEqual(log.slice(3), ["enviar 4 no", "confirmar 4", "avanzar null", "releer"]);
  assert.equal(c.cerrada(), false, "terminar de votar no es cerrar la ronda");
});
