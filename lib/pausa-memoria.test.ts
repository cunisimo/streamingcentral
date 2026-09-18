// Etapa 3.c.1 (#19): los CUATRO scripts de la pausa compartida ante 429
// (informe docs/medidas/2026-09-14-etapa3-diseno-resistencia-tmdb.md §40.1,
// §41.4, §43.10, §45-§52), emulados en memoria con la semántica exacta del Lua
// de lib/pausa-lua.ts. Lo que se fija acá es el CONTRATO de cada script
// (estados, orden que falla seguro, idempotencia por evento, marca de agua,
// telemetría por reloj de Redis); el Lua real se verifica contra Upstash en el
// Preview de precondición, y el doble del banco corre ESTA emulación por texto.
//
// Escrito ANTES del módulo: fallaba al importar.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearOpsEnMemoria, type Entrada } from "./turno-memoria.ts";
import { LUA_PAUSA, CLAVES_PAUSA, MARCADOR_MS, PROC_MS, CUBOS_EXPIRE_S, EVENTOS_EXPIRE_S, EVENTOS_MAX } from "./pausa-lua.ts";

function mundo(inicio = 1_000_000) {
  let t = inicio;
  const store = new Map<string, Entrada>();
  const ops = crearOpsEnMemoria(store, () => t);
  const avanzar = (ms: number) => { t += ms; };
  const pttl = (k: string) => { const e = store.get(k); if (!e) return -2; if (!e.exp) return -1; return e.exp <= t ? -2 : e.exp - t; };
  const K = CLAVES_PAUSA;
  const pausar = (o: { id: string; ms: number; uuid: string; contador: number; familia?: string; retryAfterMs?: number }) =>
    ops.evalPausar([K.pausa, K.ev(o.id), K.proc(o.uuid), K.eventos, K.cubos], [o.id, String(o.ms), String(o.contador), o.familia ?? "/x", String(o.retryAfterMs ?? o.ms)]);
  const cubos = () => (store.get(K.cubos)?.v ?? new Map()) as Map<string, string>;
  const minuto = () => Math.floor(t / 60_000);
  return { store, ops, avanzar, pttl, pausar, cubos, minuto, K, get t() { return t; } };
}

// ----------------------------------------------------------------- TOMAR: la pausa DENTRO de la adquisición
test("TOMAR sin pausa adquiere el turno (SET NX PX) y devuelve ['adquirido']", async () => {
  const w = mundo();
  assert.deepEqual(await w.ops.evalTomar(["home:turno:x", w.K.pausa], ["A", "15000"]), ["adquirido"]);
  assert.equal(w.store.get("home:turno:x")?.v, "A");
  assert.equal(w.pttl("home:turno:x"), 15_000);
});

test("TOMAR con el turno ajeno devuelve ['ocupado', <propietario>] y no toca nada", async () => {
  const w = mundo();
  await w.ops.evalTomar(["home:turno:x", w.K.pausa], ["A", "15000"]);
  assert.deepEqual(await w.ops.evalTomar(["home:turno:x", w.K.pausa], ["B", "15000"]), ["ocupado", "A"]);
  assert.equal(w.store.get("home:turno:x")?.v, "A");
});

test("🔴 TOMAR con pausa vigente devuelve ['pausado', <PTTL>] SIN adquirir: no existe instante entre comprobar y adquirir (§40.5)", async () => {
  const w = mundo();
  await w.pausar({ id: "p:1", ms: 4000, uuid: "p", contador: 1 });
  w.avanzar(300);
  assert.deepEqual(await w.ops.evalTomar(["home:turno:x", w.K.pausa], ["A", "15000"]), ["pausado", 3700]);
  assert.equal(w.store.has("home:turno:x"), false, "no se adquirió");
  w.avanzar(3700);
  assert.deepEqual(await w.ops.evalTomar(["home:turno:x", w.K.pausa], ["A", "15000"]), ["adquirido"], "vencida la pausa, adquiere");
});

// ----------------------------------------------------------------- PAUSAR: v3 (§43.10)
test("PAUSAR escribe la pausa con PX = ms y devuelve ['escrito', ms]; marcador PX 120 s; marca de agua PX 24 h", async () => {
  const w = mundo();
  assert.deepEqual(await w.pausar({ id: "p:1", ms: 8000, uuid: "p", contador: 1 }), ["escrito", 8000]);
  assert.equal(w.store.get(w.K.pausa)?.v, "p:1"); assert.equal(w.pttl(w.K.pausa), 8000);
  assert.equal(w.pttl(w.K.ev("p:1")), MARCADOR_MS); assert.equal(MARCADOR_MS, 120_000);
  assert.equal(w.store.get(w.K.proc("p"))?.v, "1"); assert.equal(w.pttl(w.K.proc("p")), PROC_MS); assert.equal(PROC_MS, 86_400_000);
});

test("🔴 idempotencia por evento (§40.1): el reintento del MISMO id 100 ms después es 'ya-aplicada' con el PTTL restante y NO extiende", async () => {
  const w = mundo();
  await w.pausar({ id: "p:1", ms: 8000, uuid: "p", contador: 1 });
  w.avanzar(100);
  assert.deepEqual(await w.pausar({ id: "p:1", ms: 8000, uuid: "p", contador: 1 }), ["ya-aplicada", 7900]);
  assert.equal(w.pttl(w.K.pausa), 7900, "sin extender");
});

test("un evento NUEVO que termina más tarde extiende (1 → 8); uno que termina antes devuelve 'ya-mayor' con el restante y no acorta (8 → 1)", async () => {
  const w = mundo();
  await w.pausar({ id: "p:1", ms: 1000, uuid: "p", contador: 1 });
  assert.deepEqual(await w.pausar({ id: "q:1", ms: 8000, uuid: "q", contador: 1 }), ["escrito", 8000]);
  w.avanzar(500);
  assert.deepEqual(await w.pausar({ id: "p:2", ms: 1000, uuid: "p", contador: 2 }), ["ya-mayor", 7500]);
  assert.equal(w.pttl(w.K.pausa), 7500);
});

test("marca de agua por proceso (§43.9): un contador viejo del mismo uuid es 'ya-aplicada' aunque no exista su marcador; otro uuid arranca su serie", async () => {
  const w = mundo();
  await w.pausar({ id: "p:8", ms: 3000, uuid: "p", contador: 8 });
  w.avanzar(MARCADOR_MS + 1);                                                   // marcador vencido, pausa vencida
  assert.equal(w.pttl(w.K.pausa), -2);
  assert.deepEqual(await w.pausar({ id: "p:6", ms: 8000, uuid: "p", contador: 6 }), ["ya-aplicada", -2], "un evento viejo NUNCA reabre una pausa");
  assert.deepEqual(await w.pausar({ id: "q:1", ms: 5000, uuid: "q", contador: 1 }), ["escrito", 5000]);
});

test("PAUSAR valida ANTES de mutar: ms no entero o ≤ 0, o contador no entero → error y nada escrito", async () => {
  const w = mundo();
  for (const [ms, contador] of [["0", "1"], ["-5", "1"], ["abc", "1"], ["1.5", "1"], ["1000", "x"], ["1000", "1.5"]]) {
    await assert.rejects(w.ops.evalPausar([w.K.pausa, w.K.ev("p:1"), w.K.proc("p"), w.K.eventos, w.K.cubos], ["p:1", ms, contador, "/x", "1000"]), /ERR/);
  }
  assert.equal(w.store.size, 0, "nada mutado");
});

test("telemetría con el reloj de Redis: 'escrito' suma 429 y pausas en el cubo del minuto; 'ya-mayor' suma 429 y ya-mayor; 'ya-aplicada' SÓLO ya-aplicada; un evento por resultado no idempotente", async () => {
  const w = mundo();
  const m = w.minuto();
  await w.pausar({ id: "p:1", ms: 8000, uuid: "p", contador: 1, familia: "/discover/movie" });
  assert.equal(w.cubos().get(`${m}:429`), "1"); assert.equal(w.cubos().get(`${m}:pausas`), "1");
  await w.pausar({ id: "p:1", ms: 8000, uuid: "p", contador: 1 });
  assert.equal(w.cubos().get(`${m}:429`), "1", "el reintento no cuenta como 429"); assert.equal(w.cubos().get(`${m}:ya-aplicada`), "1");
  await w.pausar({ id: "q:1", ms: 1000, uuid: "q", contador: 1 });
  assert.equal(w.cubos().get(`${m}:429`), "2"); assert.equal(w.cubos().get(`${m}:ya-mayor`), "1");
  const eventos = w.store.get(w.K.eventos)?.v as string[];
  assert.equal(eventos.length, 2, "un evento por 'escrito' y por 'ya-mayor'; ninguno por 'ya-aplicada'");
  const ev = JSON.parse(eventos[1]);                                            // LPUSH: el más nuevo primero
  assert.deepEqual(Object.keys(ev).sort(), ["estado", "familia", "id", "restante", "retryAfterMs", "t"]);
  assert.equal(ev.familia, "/discover/movie"); assert.equal(ev.estado, "escrito");
  assert.equal(w.pttl(w.K.cubos), CUBOS_EXPIRE_S * 1000); assert.equal(w.pttl(w.K.eventos), EVENTOS_EXPIRE_S * 1000);
});

test("la lista de eventos se recorta a los últimos EVENTOS_MAX (200)", async () => {
  const w = mundo();
  for (let i = 1; i <= 205; i++) { await w.pausar({ id: `p:${i}`, ms: 1000 + i, uuid: "p", contador: i }); }
  assert.equal((w.store.get(w.K.eventos)?.v as string[]).length, EVENTOS_MAX); assert.equal(EVENTOS_MAX, 200);
});

// ----------------------------------------------------------------- CUBO y SALUD
test("CUBO suma un campo en el cubo del minuto de Redis y devuelve ese minuto; SALUD agrega los últimos 60 minutos más el PTTL de la pausa, y nada más", async () => {
  const w = mundo(60 * 60_000 * 100);                                            // minuto 6000
  await w.pausar({ id: "p:1", ms: 5000, uuid: "proc-uuid-secreto", contador: 1, familia: "/search/movie?query=privado" });
  assert.equal(await w.ops.evalCubo([w.K.cubos], ["pausadosUB"]), w.minuto());
  await w.ops.evalCubo([w.K.cubos], ["pausaNoLeida"]);
  w.avanzar(1000);
  const salud = await w.ops.evalSalud([w.K.pausa, w.K.cubos], []);
  assert.deepEqual(salud, [4000, 1, 1, 0, 0, 1, 1, 0], "[pttl, 429, pausas, ya-mayor, ya-aplicada, pausaNoLeida, pausadosUB, pausados503]");
  assert.doesNotMatch(JSON.stringify(salud), /secreto|privado/);
  // Un cubo de hace 61 minutos ya no entra; uno de hace 59 sí.
  w.avanzar(59 * 60_000);
  assert.equal((await w.ops.evalSalud([w.K.pausa, w.K.cubos], []) as number[])[1], 1);
  w.avanzar(60_000);
  assert.equal((await w.ops.evalSalud([w.K.pausa, w.K.cubos], []) as number[])[1], 0);
  assert.equal((await w.ops.evalSalud([w.K.pausa, w.K.cubos], []) as number[])[0], -2, "sin pausa: PTTL -2");
});

// ----------------------------------------------------------------- el texto del Lua: lo que el doble y Redis ejecutan
test("LUA_PAUSA tiene los cuatro scripts, con las claves y argumentos del diseño (§41.4/§43.10): TOMAR mira PTTL de la pausa ANTES del SET NX; PAUSAR valida, lee, escribe la pausa ANTES del marcador y hace la telemetría en pcall al final", () => {
  assert.deepEqual(Object.keys(LUA_PAUSA).sort(), ["CUBO", "PAUSAR", "SALUD", "TOMAR"]);
  const t = LUA_PAUSA.TOMAR;
  assert.ok(t.indexOf("PTTL") < t.indexOf("'NX'"), "TOMAR: la pausa se comprueba antes del SET NX");
  const p = LUA_PAUSA.PAUSAR;
  const pos = (s: string) => { const i = p.indexOf(s); assert.ok(i >= 0, `PAUSAR sin ${s}`); return i; };
  assert.ok(pos("tonumber(ARGV[2])") < pos("'EXISTS'"), "valida antes de leer");
  assert.ok(pos("'EXISTS'") < pos("'GET'") && pos("'GET'") < pos("local restante = redis.call('PTTL'"), "EXISTS ev → GET proc → PTTL pausa (el PTTL de la rama ya-aplicada no decide nada)");
  const setPausa = pos("'SET', KEYS[1]"), setProc = pos("'SET', KEYS[3]"), setEv = pos("'SET', KEYS[2]");
  assert.ok(setPausa < setProc && setProc < setEv, "la PROTECCIÓN se escribe antes que la marca y que el marcador");
  assert.ok(setEv < pos("pcall(function()"), "la telemetría del camino que escribe va después, en pcall");
  assert.ok(p.includes("'TIME'") && p.includes("cjson.encode") && p.includes("'HINCRBY'") && p.includes("'LPUSH'") && p.includes("'LTRIM'"));
  assert.match(p, /'PX', 120000/); assert.match(p, /'PX', 86400000/);
  for (const s of Object.values(LUA_PAUSA)) assert.doesNotMatch(s, /KEYS\[[6-9]\]/, "ninguna clave fuera de las declaradas");
});
