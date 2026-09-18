// Etapa 3.c.1 (#19): la PAUSA ante 429 vista desde UN proceso (lib/tmdb-pausa.ts):
// nivel 1 (reacción local inmediata), la escritura serializada e idempotente de
// la pausa compartida (PAUSAR), y el LECTOR no bloqueante del nivel 2 — una
// lectura en vuelo, sólo por Δt, F_max = 1 con enfriamiento (§39.5, §41.2,
// §43.6-§43.9). Todo con deps inyectadas y reloj virtual; el backend es la
// emulación en memoria de los scripts. Escrito ANTES del módulo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearPausa, CONSTANTES_PAUSA } from "./tmdb-pausa.ts";
import { crearOpsEnMemoria, type Entrada } from "./turno-memoria.ts";
import { CLAVES_PAUSA } from "./pausa-lua.ts";
import type { OpsPausa } from "./turno.ts";

const tick = () => new Promise<void>((r) => setImmediate(r));
const ticks = async (n = 5) => { for (let i = 0; i < n; i++) await tick(); };

function mundo(o: { activa?: boolean; uuid?: string; ops?: Partial<OpsPausa> } = {}) {
  let t = 1_000_000;
  const store = new Map<string, Entrada>();
  const base = crearOpsEnMemoria(store, () => t);
  const llamadas: string[] = [];
  const log: string[] = [];
  const ops: OpsPausa = {
    evalPausar: (k, a) => { llamadas.push(`PAUSAR ${a[0]} ${a[1]}`); return base.evalPausar(k, a); },
    pttl: (k) => { llamadas.push("PTTL"); return base.pttl(k); },
    evalCubo: (k, a) => { llamadas.push(`CUBO ${a[0]}`); return base.evalCubo(k, a); },
    evalSalud: (k, a) => base.evalSalud(k, a),
    ...o.ops,
  };
  const pausa = crearPausa({ ops, uuid: o.uuid ?? "p", ahora: () => t, activa: o.activa ?? true, log: (l) => log.push(l) });
  const pttlCompartida = () => { const e = store.get(CLAVES_PAUSA.pausa); return !e ? -2 : e.exp <= t ? -2 : e.exp - t; };
  return { pausa, store, llamadas, log, avanzar: (ms: number) => { t += ms; }, pttlCompartida, get t() { return t; } };
}

// ----------------------------------------------------------------- nivel 1
test("sin 429 no hay pausa: vigente() = 0", async () => {
  const w = mundo();
  assert.equal(w.pausa.vigente(), 0);
});

test("🔴 nivel 1: el primer 429 fija la pausa LOCAL en el acto (antes de que Redis responda) con el Retry-After; sin cabecera, con el default de 5 s", async () => {
  const w = mundo();
  const p = w.pausa.registrar429({ retryAfterMs: 3000, familia: "/discover/movie" });
  assert.equal(w.pausa.vigente(), 3000, "local, sincrónico, sin esperar a Redis");
  await p;
  const w2 = mundo();
  void w2.pausa.registrar429({ retryAfterMs: null, familia: "/x" });
  assert.equal(w2.pausa.vigente(), CONSTANTES_PAUSA.PAUSA_DEFECTO_MS); assert.equal(CONSTANTES_PAUSA.PAUSA_DEFECTO_MS, 5000);
  await ticks();
});

test("vigente() descuenta el tiempo y vuelve a 0 al vencer; un 429 posterior más corto no acorta la pausa local", async () => {
  const w = mundo();
  await w.pausa.registrar429({ retryAfterMs: 4000, familia: "/x" });
  w.avanzar(1500);
  assert.equal(w.pausa.vigente(), 2500);
  await w.pausa.registrar429({ retryAfterMs: 1000, familia: "/x" });
  assert.equal(w.pausa.vigente(), 2500, "no acorta");
  w.avanzar(2500);
  assert.equal(w.pausa.vigente(), 0);
});

test("un Retry-After desmedido se acota a PAUSA_MAX_MS (propuesto: 60 s) en lo local y en lo compartido", async () => {
  const w = mundo();
  await w.pausa.registrar429({ retryAfterMs: 3_600_000, familia: "/x" });
  assert.equal(w.pausa.vigente(), CONSTANTES_PAUSA.PAUSA_MAX_MS); assert.equal(CONSTANTES_PAUSA.PAUSA_MAX_MS, 60_000);
  assert.equal(w.pttlCompartida(), 60_000);
});

// ----------------------------------------------------------------- nivel 2: escritura serializada e idempotente
test("🔴 PAUSAR: un evento por 429 con id `<uuid>:<contador>`; la pausa compartida queda escrita con su PX y la local se alinea con lo que devolvió Redis", async () => {
  const w = mundo({ uuid: "abc" });
  await w.pausa.registrar429({ retryAfterMs: 2000, familia: "/discover/movie" });
  assert.deepEqual(w.llamadas, ["PAUSAR abc:1 2000"]);
  assert.equal(w.pttlCompartida(), 2000);
  assert.equal(w.store.get(CLAVES_PAUSA.ev("abc:1"))?.v, "1", "marcador de idempotencia del evento");
  // Otro proceso ya había escrito 8 s: Redis devuelve ya-mayor con 8 s y la LOCAL sube a 8 s (la compartida manda si es mayor).
  const w2 = mundo({ uuid: "def" });
  await w2.store.set(CLAVES_PAUSA.pausa, { v: "otro:1", exp: w2.t + 8000 });
  await w2.pausa.registrar429({ retryAfterMs: 2000, familia: "/x" });
  assert.equal(w2.pausa.vigente(), 8000, "la pausa compartida, más larga, manda sobre la local");
});

test("🔴 serialización: un 429 que llega con un PAUSAR en vuelo NO crea otro evento: se funde con el siguiente, con el Retry-After MAYOR (§41.3)", async () => {
  let resolverPrimero!: () => void;
  const w = mundo({ ops: { evalPausar: (() => { let n = 0; return (k: [string, string, string, string, string], a: [string, string, string, string, string]) => { n += 1; if (n === 1) return new Promise((r) => { resolverPrimero = () => r(["escrito", Number(a[1])]); }); return Promise.resolve(["escrito", Number(a[1])]); }; })() } });
  const p1 = w.pausa.registrar429({ retryAfterMs: 2000, familia: "/a" });
  const p2 = w.pausa.registrar429({ retryAfterMs: 5000, familia: "/b" });
  const p3 = w.pausa.registrar429({ retryAfterMs: 3000, familia: "/c" });
  await ticks();
  assert.equal(w.pausa.eventosEnviados(), 1, "con uno en vuelo no sale otro");
  resolverPrimero();
  await Promise.all([p1, p2, p3]);
  await ticks();
  assert.equal(w.pausa.eventosEnviados(), 2, "los dos 429 que llegaron durante el vuelo se fundieron en UN evento");
  assert.deepEqual(w.pausa.ultimoEvento(), { id: "p:2", ms: 5000 }, "con el Retry-After mayor de los fundidos");
});

test("PAUSAR que lanza o devuelve una forma rara: la pausa local sigue; el resultado es indeterminado y NO se reintenta a mano (el SDK ya reintentó)", async () => {
  const w = mundo({ ops: { evalPausar: async () => { throw new Error("red"); } } });
  await w.pausa.registrar429({ retryAfterMs: 2000, familia: "/x" });
  assert.equal(w.pausa.vigente(), 2000);
  assert.equal(w.pausa.eventosEnviados(), 1);
  const w2 = mundo({ ops: { evalPausar: async () => "Aborted" } });
  await w2.pausa.registrar429({ retryAfterMs: 2000, familia: "/x" });
  assert.equal(w2.pausa.vigente(), 2000);
  assert.ok(w2.log.some((l) => /indeterminad/.test(l)), w2.log.join("\n"));
});

// ----------------------------------------------------------------- nivel 2: el lector
test("🔴 lector: permiso() lee PTTL a lo sumo una vez por Δt = 1 s contado desde el INICIO de la anterior, y nunca con una en vuelo (35 permisos/s → ~30 lecturas en 30 s)", async () => {
  const w = mundo();
  // Cada lectura resuelve en el acto (Redis en memoria): sin Δt saldrían ~1.050 lecturas, una por permiso.
  for (let s = 0; s < 30; s++) { for (let i = 0; i < 35; i++) { w.pausa.permiso(); await ticks(2); w.avanzar(1000 / 35); } }
  const lecturas = w.llamadas.filter((l) => l === "PTTL").length;
  assert.ok(lecturas >= 29 && lecturas <= 31, `lecturas ${lecturas}`);
  assert.equal(CONSTANTES_PAUSA.DELTA_LECTURA_MS, 1000);
});

test("🔴 lector: una lectura que ve PTTL > 0 fija la pausa LOCAL (propagación desde otra instancia); PTTL -2 no la toca", async () => {
  const w = mundo();
  w.store.set(CLAVES_PAUSA.pausa, { v: "otro:1", exp: w.t + 6000 });
  w.pausa.permiso(); await ticks();
  assert.equal(w.pausa.vigente(), 6000);
  w.avanzar(6000);
  assert.equal(w.pausa.vigente(), 0);
  w.pausa.permiso(); await ticks();
  assert.equal(w.pausa.vigente(), 0, "-2: sin pausa");
});

test("🔴 lector con Redis COLGADO (la promesa nunca resuelve): una sola en vuelo, ninguna más aunque lleguen 1.000 permisos", async () => {
  const w = mundo({ ops: { pttl: () => new Promise(() => {}) } });
  for (let i = 0; i < 1000; i++) { w.pausa.permiso(); w.avanzar(10); }
  await ticks();
  assert.equal(w.pausa.lecturasEnVuelo(), 1);
  assert.equal(w.pausa.lecturasIniciadas(), 1);
});

test("🔴 lector: F_max = 1 — un fallo (excepción, timeout, forma no entera) enfría 30 s sin leer; cuenta pausaNoLeida en el cubo; una respuesta válida reinicia", async () => {
  let modo: "falla" | "raro" | "ok" = "falla";
  const w = mundo({ ops: { pttl: async () => { if (modo === "falla") throw new Error("timeout"); if (modo === "raro") return "Aborted"; return -2; } } });
  w.pausa.permiso(); await ticks();
  assert.equal(w.pausa.lecturasFallidas(), 1);
  assert.deepEqual(w.llamadas.filter((l) => l.startsWith("CUBO")), ["CUBO pausaNoLeida"]);
  for (let i = 0; i < 29; i++) { w.avanzar(1000); w.pausa.permiso(); await ticks(); }
  assert.equal(w.pausa.lecturasIniciadas(), 1, "enfriado: 29 s sin leer");
  w.avanzar(1001); w.pausa.permiso(); await ticks();
  assert.equal(w.pausa.lecturasIniciadas(), 2, "tras el enfriamiento, una más");
  assert.equal(CONSTANTES_PAUSA.ENFRIAMIENTO_LECTOR_MS, 30_000); assert.equal(CONSTANTES_PAUSA.F_MAX, 1);
  modo = "raro"; w.avanzar(30_001); w.pausa.permiso(); await ticks();
  assert.equal(w.pausa.lecturasFallidas(), 3, "una forma no entera también es fallo");
  modo = "ok"; w.avanzar(30_001); w.pausa.permiso(); await ticks();
  w.avanzar(1000); w.pausa.permiso(); await ticks();
  assert.equal(w.pausa.lecturasIniciadas(), 5, "con respuesta válida no hay enfriamiento: lee de nuevo al Δt siguiente");
});

test("Redis lento/colgado/caído: ≤ 2 lecturas por minuto (F_max = 1, enfriamiento 30 s)", async () => {
  const w = mundo({ ops: { pttl: async () => { throw new Error("caido"); } } });
  for (let s = 0; s < 60; s++) { for (let i = 0; i < 35; i++) { w.pausa.permiso(); w.avanzar(1000 / 35); } await ticks(2); }
  assert.ok(w.pausa.lecturasIniciadas() <= 2, `iniciadas ${w.pausa.lecturasIniciadas()}`);
});

// ----------------------------------------------------------------- kill switch y cubos
test("kill switch (activa = false): registrar429 no escribe, permiso no lee, vigente es 0 siempre, anotarCubo no envía", async () => {
  const w = mundo({ activa: false });
  await w.pausa.registrar429({ retryAfterMs: 5000, familia: "/x" });
  w.pausa.permiso(); w.pausa.anotarCubo("pausadosUB"); await ticks();
  assert.equal(w.pausa.vigente(), 0);
  assert.deepEqual(w.llamadas, []);
});

test("anotarCubo es fire-and-forget: un CUBO que lanza no rompe ni espera nada", async () => {
  const w = mundo({ ops: { evalCubo: async () => { throw new Error("red"); } } });
  assert.doesNotThrow(() => w.pausa.anotarCubo("pausados503"));
  await ticks();
});
