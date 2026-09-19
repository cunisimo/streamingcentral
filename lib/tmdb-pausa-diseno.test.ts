// Etapa 3.c — DISEÑO de la pausa compartida ante 429 (informe §40), probado
// sobre un MODELO de Redis, no sobre código productivo: no hay `lib/tmdb-pausa.ts`
// todavía (3.c.1 no está aprobada). Lo que fija este archivo es la semántica
// que el Lua tendrá que cumplir, con el mismo método que
// `hooks/arranque-restauracion.test.ts`: el modelo ejecuta la versión INGENUA
// (§39.6) y la versión CON IDENTIDAD (§40.1) y comprueba que la primera FALLA
// justo donde la auditoría lo señaló y la segunda no (MANTENIMIENTO 8.b).
//
// El modelo: claves con vencimiento en milisegundos, reloj VIRTUAL propio de
// Redis (`TIME`), `SET k v PX ms`, `PTTL` (-2 sin clave, -1 sin vencimiento),
// `EXISTS`, `GET`, `DEL`, y "scripts" atómicos (funciones que corren sin que el
// reloj avance en el medio). Ningún cliente compara relojes: sólo manda
// DURACIONES y una IDENTIDAD de evento.
import { test } from "node:test";
import assert from "node:assert/strict";
import { motivoDeRespuesta } from "../components/api-motivo.ts";
import { dormirCancelable } from "./home-servir.ts";

// ----------------------------------------------------------------- modelo de Redis
class RedisModelo {
  ahora = 1_000_000;                       // reloj de Redis, ms, virtual
  private base = new Map<string, { v: string; vence: number | null }>();
  private viva(k: string) {
    const e = this.base.get(k);
    if (!e) return undefined;
    if (e.vence !== null && e.vence <= this.ahora) { this.base.delete(k); return undefined; }
    return e;
  }
  avanzar(ms: number) { this.ahora += ms; }
  set(k: string, v: string, px?: number) { this.base.set(k, { v, vence: px === undefined ? null : this.ahora + px }); }
  get(k: string) { return this.viva(k)?.v ?? null; }
  exists(k: string) { return this.viva(k) ? 1 : 0; }
  pttl(k: string) { const e = this.viva(k); if (!e) return -2; if (e.vence === null) return -1; return e.vence - this.ahora; }
  del(k: string) { this.base.delete(k); }
}

const PAUSA = "tmdb:pausa";
type Resultado = { estado: "escrito" | "ya-mayor" | "ya-aplicada"; restanteMs: number };

// §39.6 — la versión INGENUA (control): sólo compara el PTTL con la duración.
function pausarIngenuo(r: RedisModelo, ms: number): Resultado {
  const restante = r.pttl(PAUSA);
  if (restante >= ms) return { estado: "ya-mayor", restanteMs: restante };
  r.set(PAUSA, "1", ms);
  return { estado: "escrito", restanteMs: ms };
}

// §40.1 — CON IDENTIDAD DE EVENTO: un marcador por evento, en el mismo script.
//   KEYS[1] = tmdb:pausa   KEYS[2] = tmdb:pausa:ev:<id>   ARGV[1] = id   ARGV[2] = ms
//   if EXISTS KEYS[2] → {'ya-aplicada', PTTL KEYS[1]}
//   SET KEYS[2] 1 PX max(ms, MARCADOR_MIN_MS)
//   restante = PTTL KEYS[1]; if restante >= ms → {'ya-mayor', restante}
//   SET KEYS[1] id PX ms → {'escrito', ms}
const MARCADOR_MIN_MS = 60_000;   // cubre cualquier ventana de reintento del SDK (segundos), no días
function pausarConIdentidad(r: RedisModelo, id: string, ms: number): Resultado {
  const marcador = `${PAUSA}:ev:${id}`;
  if (r.exists(marcador)) return { estado: "ya-aplicada", restanteMs: r.pttl(PAUSA) };
  r.set(marcador, "1", Math.max(ms, MARCADOR_MIN_MS));
  const restante = r.pttl(PAUSA);
  if (restante >= ms) return { estado: "ya-mayor", restanteMs: restante };
  r.set(PAUSA, id, ms);
  return { estado: "escrito", restanteMs: ms };
}

/** Un cliente con respuesta PERDIDA: el script corre (Redis lo ejecutó) pero el cliente no ve el resultado y reintenta. */
function conRespuestaPerdida<T>(ejecutar: () => T): { resultado: null; ejecutado: true } { ejecutar(); return { resultado: null, ejecutado: true }; }

// ----------------------------------------------------------------- 1. el RED de la auditoría, exacto
test("🔴 RED (control, §39.6): PAUSAR(8000) ejecutado, respuesta perdida, reintento 100 ms después → la versión ingenua EXTIENDE la pausa a 8000", () => {
  const r = new RedisModelo();
  conRespuestaPerdida(() => pausarIngenuo(r, 8000));   // Redis la ejecutó; el cliente no lo supo
  r.avanzar(100);
  assert.equal(r.pttl(PAUSA), 7900);
  const reintento = pausarIngenuo(r, 8000);
  // Lo que la auditoría señaló: 7900 < 8000 ⇒ vuelve a escribir 8000.
  assert.equal(reintento.estado, "escrito");
  assert.equal(r.pttl(PAUSA), 8000, "la versión ingenua alargó la pausa 100 ms con un reintento del MISMO evento");
});

test("🟢 con identidad: la misma secuencia devuelve `ya-aplicada` y el PTTL sigue en 7900", () => {
  const r = new RedisModelo();
  const id = "p1:7";   // <uuid del proceso>:<contador del evento>, estable entre reintentos
  conRespuestaPerdida(() => pausarConIdentidad(r, id, 8000));
  r.avanzar(100);
  const reintento = pausarConIdentidad(r, id, 8000);
  assert.deepEqual(reintento, { estado: "ya-aplicada", restanteMs: 7900 });
  assert.equal(r.pttl(PAUSA), 7900);
});

test("🟢 reintentos MÚLTIPLES del mismo evento (perdida, perdida, perdida, vista): una sola escritura, cero extensión", () => {
  const r = new RedisModelo();
  const id = "p1:8";
  conRespuestaPerdida(() => pausarConIdentidad(r, id, 8000));
  r.avanzar(150); conRespuestaPerdida(() => pausarConIdentidad(r, id, 8000));
  r.avanzar(150); conRespuestaPerdida(() => pausarConIdentidad(r, id, 8000));
  r.avanzar(150);
  const vista = pausarConIdentidad(r, id, 8000);
  assert.equal(vista.estado, "ya-aplicada");
  assert.equal(r.pttl(PAUSA), 8000 - 450);
});

test("🟢 el reintento de un evento viejo NO pisa a un evento nuevo de otra instancia", () => {
  const r = new RedisModelo();
  conRespuestaPerdida(() => pausarConIdentidad(r, "p1:1", 8000));   // A escribió 8000
  r.avanzar(100);
  assert.equal(pausarConIdentidad(r, "p2:1", 8000).estado, "escrito");   // B, evento NUEVO: 7900 < 8000 ⇒ extiende legítimamente (Retry-After cuenta desde el 429 de B)
  assert.equal(r.pttl(PAUSA), 8000);
  r.avanzar(100);
  assert.equal(pausarConIdentidad(r, "p1:1", 8000).estado, "ya-aplicada");   // el reintento de A no toca lo de B
  assert.equal(r.pttl(PAUSA), 7900);
  assert.equal(r.get(PAUSA), "p2:1");
});

// ----------------------------------------------------------------- 2. extender, nunca acortar
test("🟢 1 → 8: una pausa de 1 s y después `Retry-After: 8` de otro evento → extiende a 8000", () => {
  const r = new RedisModelo();
  assert.equal(pausarConIdentidad(r, "p1:1", 1000).estado, "escrito");
  r.avanzar(200);
  assert.deepEqual(pausarConIdentidad(r, "p2:1", 8000), { estado: "escrito", restanteMs: 8000 });
  assert.equal(r.pttl(PAUSA), 8000);
});

test("🟢 8 → 1: con 8 s vigentes, un `Retry-After: 1` devuelve `ya-mayor` con el restante y no acorta", () => {
  const r = new RedisModelo();
  pausarConIdentidad(r, "p1:1", 8000);
  r.avanzar(300);
  assert.deepEqual(pausarConIdentidad(r, "p2:1", 1000), { estado: "ya-mayor", restanteMs: 7700 });
  assert.equal(r.pttl(PAUSA), 7700);
  // Y el marcador de p2:1 quedó escrito igual: su reintento tampoco escribe.
  assert.equal(pausarConIdentidad(r, "p2:1", 1000).estado, "ya-aplicada");
});

test("🟢 concurrencia: 50 eventos distintos con duraciones distintas, en cualquier orden, terminan en el MÁXIMO", () => {
  for (const semilla of [1, 2, 3]) {
    const r = new RedisModelo();
    // Orden pseudoaleatorio determinista (LCG) de 50 duraciones 100..5000.
    let x = semilla;
    const duraciones = Array.from({ length: 50 }, (_, i) => 100 + ((i * 97) % 50) * 100);
    const orden = duraciones.map((d, i) => ({ d, i, k: (x = (x * 1103515245 + 12345) % 2147483648) })).sort((a, b) => a.k - b.k);
    for (const { d, i } of orden) pausarConIdentidad(r, `p${i % 3}:${i}`, d);   // los scripts son atómicos: uno tras otro
    assert.equal(r.pttl(PAUSA), Math.max(...duraciones), `semilla ${semilla}`);
  }
});

// ----------------------------------------------------------------- 3. expiración y lectura
test("🟢 expiración: vencida la pausa, PTTL = -2 y un evento nuevo la escribe desde cero", () => {
  const r = new RedisModelo();
  pausarConIdentidad(r, "p1:1", 1000);
  r.avanzar(1000);
  assert.equal(r.pttl(PAUSA), -2);
  assert.deepEqual(pausarConIdentidad(r, "p1:2", 500), { estado: "escrito", restanteMs: 500 });
});

test("🟢 el marcador vive al menos MARCADOR_MIN_MS: un reintento tardío (después de que la pausa venció) sigue siendo `ya-aplicada`", () => {
  const r = new RedisModelo();
  conRespuestaPerdida(() => pausarConIdentidad(r, "p1:1", 1000));
  r.avanzar(5000);   // la pausa de 1 s venció hace 4 s; el SDK reintenta tarde
  assert.equal(r.pttl(PAUSA), -2);
  assert.deepEqual(pausarConIdentidad(r, "p1:1", 1000), { estado: "ya-aplicada", restanteMs: -2 });
  assert.equal(r.pttl(PAUSA), -2, "un reintento tardío no reabre una pausa vencida");
});

test("🟢 lectura: `PTTL tmdb:pausa` > 0 es 'vigente por esos ms'; -2 es 'sin pausa'; ningún cliente compara instantes", () => {
  const r = new RedisModelo();
  assert.equal(r.pttl(PAUSA), -2);
  pausarConIdentidad(r, "p1:1", 3000);
  r.avanzar(1234);
  assert.equal(r.pttl(PAUSA), 1766);
});

// ----------------------------------------------------------------- 4. el estado `pausado` del Home (modelo de §40.5)
// Modelo de la decisión de `servirConTurno` con la pausa integrada en el
// script de ADQUISICIÓN del turno (una sola operación atómica: si hay pausa,
// no se adquiere) y re-comprobada en la cola del semáforo y por lote.
type Momento = "antes-del-turno" | "tras-adquirir" | "durante-la-cola" | "nunca";
function decidir(pausaAparece: Momento, hayUB: boolean) {
  const eventos: string[] = [];
  let componer = 0, fondo = 0, turno: "libre" | "adquirido" = "libre";
  const pausaVigente = (m: Momento) => pausaAparece !== "nunca" && ordenMomento(pausaAparece) <= ordenMomento(m);
  // (1) ADQUIRIR con pausa integrada: el mismo script mira PTTL tmdb:pausa.
  if (pausaVigente("antes-del-turno")) { eventos.push("adquirir:pausado"); return terminar(); }
  turno = "adquirido"; eventos.push("adquirir:ok");
  // (2) Tras adquirir, antes de la primera llamada: re-lectura (una operación) — la pausa pudo aparecer entre la lectura previa y la adquisición.
  if (pausaVigente("tras-adquirir")) { eventos.push("tras-adquirir:pausado"); turno = "libre"; eventos.push("liberar"); return terminar(); }
  // (3) Composición: cada K permisos o Δt se relee; si aparece, se cancela (clase `pausa`), no se publica, se libera.
  if (hayUB) fondo += 1; else componer += 1;
  if (pausaVigente("durante-la-cola")) { eventos.push("cola:pausado→cancelada"); turno = "libre"; eventos.push("liberar"); return { ...terminar(), cancelada: true, publicada: false }; }
  turno = "libre"; eventos.push("publicar+liberar");
  return { ...terminar(), cancelada: false, publicada: true };
  function terminar() { return { eventos, componer, fondo, turno, respuesta: hayUB ? "ultimo-bueno" : (turno === "libre" && eventos.some((e) => e.includes("pausado")) ? "503-pausa" : "propia"), cancelada: false, publicada: false }; }
}
function ordenMomento(m: Momento) { return { "antes-del-turno": 0, "tras-adquirir": 1, "durante-la-cola": 2, "nunca": 9 }[m]; }

test("🟢 pausado ANTES del turno: 0 componer, 0 fondo, turno libre; con UB → UB, sin UB → 503 con pausa", () => {
  for (const hayUB of [true, false]) {
    const d = decidir("antes-del-turno", hayUB);
    assert.equal(d.componer + d.fondo, 0, JSON.stringify(d));
    assert.equal(d.turno, "libre");
    assert.equal(d.respuesta, hayUB ? "ultimo-bueno" : "503-pausa");
    assert.deepEqual(d.eventos, ["adquirir:pausado"]);
  }
});

test("🟢 pausa aparecida ENTRE la lectura previa y la adquisición: la re-lectura tras adquirir la ve; libera el turno; 0 componer, 0 fondo", () => {
  for (const hayUB of [true, false]) {
    const d = decidir("tras-adquirir", hayUB);
    assert.equal(d.componer + d.fondo, 0);
    assert.equal(d.turno, "libre");
    assert.deepEqual(d.eventos, ["adquirir:ok", "tras-adquirir:pausado", "liberar"]);
  }
});

test("🟢 pausa aparecida DURANTE la cola: la composición se cancela (clase pausa), no se publica, el turno se libera en el acto", () => {
  for (const hayUB of [true, false]) {
    const d = decidir("durante-la-cola", hayUB);
    assert.equal(d.cancelada, true);
    assert.equal(d.publicada, false);
    assert.equal(d.turno, "libre");
    assert.ok(d.eventos.includes("liberar"));
  }
});

test("🟢 sin pausa: exactamente el comportamiento de hoy (UB → fondo; sin UB → componer en línea), publicada", () => {
  assert.deepEqual([decidir("nunca", true).fondo, decidir("nunca", true).componer, decidir("nunca", true).publicada], [1, 0, true]);
  assert.deepEqual([decidir("nunca", false).fondo, decidir("nunca", false).componer, decidir("nunca", false).publicada], [0, 1, true]);
});

test("🔴 CONTROL (contrato actual, §39.7): si `pausado` se mapeara al `false` de hoy, `componer` correría en línea — el modelo del contrato viejo lo muestra", () => {
  // Contrato de `37d4707`: programarEnFondo → boolean; `false` ⇒ componer() en línea.
  const contratoViejo = (resultado: boolean) => (resultado ? { fondo: 1, componer: 0 } : { fondo: 0, componer: 1 });
  const conPausaMapeadaAFalse = contratoViejo(false);
  assert.equal(conPausaMapeadaAFalse.componer, 1, "el contrato booleano no puede expresar 'pausado': cae en composición bloqueante");
});

// =============================================================================
// §41 (auditoría sobre 21cbf18) — segunda tanda de propiedades, sobre modelo.
// =============================================================================

// ----------------------------------------------------------------- 5. PAUSAR v2: marcador 120 s + marca de agua por proceso + observabilidad en el mismo script
// KEYS[1]=tmdb:pausa  KEYS[2]=tmdb:pausa:ev:<id>  KEYS[3]=tmdb:pausa:proc (hash uuid→contador)
// KEYS[4]=tmdb:eventos (lista)  KEYS[5]=tmdb:cubos (hash "<minuto>:<campo>" → n)
// ARGV: id, ms, uuid, contador, familia, retryAfterMs
const MARCADOR_MS = 120_000;   // 2 × maxDuration: ningún reintento del SDK sobrevive a la invocación (≤ 60 s)
class RedisModelo2 extends RedisModelo {
  hashes = new Map<string, Map<string, string>>();
  listas = new Map<string, string[]>();
  ops: string[] = [];
  hget(k: string, f: string) { return this.hashes.get(k)?.get(f) ?? null; }
  hset(k: string, f: string, v: string) { if (!this.hashes.has(k)) this.hashes.set(k, new Map()); this.hashes.get(k)!.set(f, v); }
  hincrby(k: string, f: string, n: number) { const v = Number(this.hget(k, f) ?? 0) + n; this.hset(k, f, String(v)); return v; }
  lpush(k: string, v: string) { if (!this.listas.has(k)) this.listas.set(k, []); this.listas.get(k)!.unshift(v); }
  ltrim(k: string, n: number) { const l = this.listas.get(k); if (l) l.length = Math.min(l.length, n + 1); }
}
type Res2 = { estado: "escrito" | "ya-mayor" | "ya-aplicada"; restanteMs: number };
function pausarV2(r: RedisModelo2, a: { id: string; ms: number; uuid: string; contador: number; familia: string; retryAfterMs: number | null }): Res2 {
  const [K1, K2, K3, K4, K5] = [PAUSA, `${PAUSA}:ev:${a.id}`, `${PAUSA}:proc`, "tmdb:eventos", "tmdb:cubos"];
  const op = (s: string) => r.ops.push(s);
  const minuto = Math.floor(r.ahora / 60_000);                       // TIME de Redis, dentro del script
  const cubo = (campo: string) => { op(`HINCRBY tmdb:cubos ${minuto}:${campo}`); r.hincrby(K5, `${minuto}:${campo}`, 1); };
  op("EXISTS ev"); if (r.exists(K2)) { cubo("ya-aplicada"); return { estado: "ya-aplicada", restanteMs: r.pttl(K1) }; }
  op("HGET proc"); const hw = Number(r.hget(K3, a.uuid) ?? -1);
  if (a.contador <= hw) { cubo("ya-aplicada"); return { estado: "ya-aplicada", restanteMs: r.pttl(K1) }; }
  op("SET ev PX 120000"); r.set(K2, "1", MARCADOR_MS);
  op("HSET proc"); r.hset(K3, a.uuid, String(a.contador));
  cubo("429");
  op("PTTL pausa"); let restante = r.pttl(K1); let estado: Res2["estado"];
  if (restante >= a.ms) { estado = "ya-mayor"; cubo("ya-mayor"); }
  else { op("SET pausa PX"); r.set(K1, a.id, a.ms); estado = "escrito"; restante = a.ms; cubo("pausas"); }
  op("LPUSH eventos"); r.lpush(K4, JSON.stringify({ id: a.id, t: r.ahora, familia: a.familia, retryAfterMs: a.retryAfterMs, estado, restante }));
  op("LTRIM eventos 0 199"); r.ltrim(K4, 199);
  return { estado, restanteMs: restante };
}
const ev = (uuid: string, contador: number, ms: number) => ({ id: `${uuid}:${contador}`, ms, uuid, contador, familia: "/watch/providers", retryAfterMs: ms });

test("🟢 horizonte de reintento: SDK de Upstash = 6 intentos con backoff Σ e^i·50 ms = 4,29 s de espera, acotado por la invocación (≤ 60 s); marcador 120 s; reintento a los 61 s → ya-aplicada", () => {
  const backoff = (i: number) => Math.exp(i) * 50;                     // lib/metricas.ts backoffRedisInstrumentado; nodejs.js: i < attempts (5)
  const esperaTotal = [0, 1, 2, 3, 4].reduce((a, i) => a + backoff(i), 0);
  assert.ok(esperaTotal > 4200 && esperaTotal < 4300, `Σ backoff = ${esperaTotal}`);
  const r = new RedisModelo2();
  conRespuestaPerdida(() => pausarV2(r, ev("p1", 1, 8000)));
  r.avanzar(61_000);   // el peor reintento posible: al borde de maxDuration
  assert.equal(pausarV2(r, ev("p1", 1, 8000)).estado, "ya-aplicada");
  assert.equal(r.pttl(PAUSA), -2, "la pausa de 8 s ya venció y el reintento tardío no la reabrió");
});

test("🟢 un evento VIEJO nunca reabre una pausa, ni después de que venza el marcador: la marca de agua por proceso lo rechaza (reintento a los 130 s)", () => {
  const r = new RedisModelo2();
  conRespuestaPerdida(() => pausarV2(r, ev("p1", 7, 8000)));
  r.avanzar(130_000);
  assert.equal(r.exists(`${PAUSA}:ev:p1:7`), 0, "el marcador de 120 s venció");
  assert.deepEqual(pausarV2(r, ev("p1", 7, 8000)), { estado: "ya-aplicada", restanteMs: -2 });
  assert.equal(r.pttl(PAUSA), -2);
  // El evento SIGUIENTE del mismo proceso sí escribe; uno anterior (contador 6, en vuelo y demorado) no.
  assert.equal(pausarV2(r, ev("p1", 8, 3000)).estado, "escrito");
  assert.equal(pausarV2(r, ev("p1", 6, 9000)).estado, "ya-aplicada");
  assert.equal(r.pttl(PAUSA), 3000, "el evento 6, más viejo, no alargó la pausa del 8");
  // Un proceso nuevo (otro uuid) arranca su propia serie.
  assert.equal(pausarV2(r, ev("p2", 1, 5000)).estado, "escrito");
});

test("🟢 orden exacto del script y qué escribe cada resultado: `ya-aplicada` no toca pausa, marcador, marca de agua ni eventos; `escrito`/`ya-mayor` registran UN evento y UN 429", () => {
  const r = new RedisModelo2();
  pausarV2(r, ev("p1", 1, 8000));
  assert.deepEqual(r.ops, ["EXISTS ev", "HGET proc", "SET ev PX 120000", "HSET proc", "HINCRBY tmdb:cubos 16:429", "PTTL pausa", "SET pausa PX", "HINCRBY tmdb:cubos 16:pausas", "LPUSH eventos", "LTRIM eventos 0 199"]);
  r.ops = []; r.avanzar(100);
  assert.equal(pausarV2(r, ev("p1", 1, 8000)).estado, "ya-aplicada");
  assert.deepEqual(r.ops, ["EXISTS ev", "HINCRBY tmdb:cubos 16:ya-aplicada"]);
  assert.equal(r.listas.get("tmdb:eventos")!.length, 1);
  assert.equal(r.hget("tmdb:cubos", "16:429"), "1");
  r.ops = []; r.avanzar(100);
  assert.equal(pausarV2(r, ev("p2", 1, 1000)).estado, "ya-mayor");
  assert.ok(r.ops.includes("HINCRBY tmdb:cubos 16:ya-mayor") && !r.ops.includes("SET pausa PX"));
  assert.equal(r.listas.get("tmdb:eventos")!.length, 2);
  assert.equal(r.hget("tmdb:cubos", "16:429"), "2");
});

test("🟢 el cubo se sella con el reloj de REDIS (TIME dentro del script), no con el del cliente: dos instancias con relojes distintos caen en el mismo minuto", () => {
  const r = new RedisModelo2();
  pausarV2(r, ev("p1", 1, 1000));                  // "instancia A"
  pausarV2(r, ev("p2", 1, 1000));                  // "instancia B", su reloj local no participa
  const minuto = Math.floor(r.ahora / 60_000);
  assert.equal(r.hget("tmdb:cubos", `${minuto}:429`), "2");
  assert.equal([...r.hashes.get("tmdb:cubos")!.keys()].filter((k) => k.endsWith(":429")).length, 1);
});

// ----------------------------------------------------------------- 6. /api/health: sólo agregados
function agregadosSalud(r: RedisModelo2) {
  const minuto = Math.floor(r.ahora / 60_000);
  const cubos = r.hashes.get("tmdb:cubos") ?? new Map<string, string>();
  const suma = (campo: string) => { let s = 0; for (let m = minuto - 59; m <= minuto; m++) s += Number(cubos.get(`${m}:${campo}`) ?? 0); return s; };
  return { pausaVigenteMs: Math.max(0, r.pttl(PAUSA)), ultimos60min: { "429": suma("429"), pausas: suma("pausas"), yaMayor: suma("ya-mayor"), yaAplicada: suma("ya-aplicada"), pausaNoLeida: suma("pausaNoLeida"), pausadosUB: suma("pausadosUB"), pausados503: suma("pausados503") } };
}
test("🟢 /api/health expone agregados de 60 minutos y la pausa vigente; ningún uuid, id de evento, ruta ni evento crudo", () => {
  const r = new RedisModelo2();
  pausarV2(r, { ...ev("proc-uuid-secreto", 1, 5000), familia: "/search/movie?query=privado" });
  r.avanzar(1000);
  const salida = JSON.stringify(agregadosSalud(r));
  assert.doesNotMatch(salida, /proc-uuid-secreto|privado|tmdb:eventos|familia|"id"/);
  assert.deepEqual(JSON.parse(salida), { pausaVigenteMs: 4000, ultimos60min: { "429": 1, pausas: 1, yaMayor: 0, yaAplicada: 0, pausaNoLeida: 0, pausadosUB: 0, pausados503: 0 } });
  // Pausa espuria = pausas > 0 con 429 = 0 en la ventana: por construcción, imposible (el mismo script suma ambos).
  const a = agregadosSalud(r).ultimos60min; assert.ok(!(a.pausas > 0 && a["429"] === 0));
});

// ----------------------------------------------------------------- 7. el LECTOR no bloqueante sin tormenta (punto 2)
// Modelo con reloj virtual: `permiso()` se llama cada vez que el semáforo concede uno; el
// lector decide si inicia una lectura. Redis: normal (RTT), lento, colgado (nunca responde) o caído (error inmediato).
type Redis = { tipo: "normal" | "lento" | "colgado" | "caido"; rttMs: number };
interface Lector { permiso(): void; avanzar(ms: number): void; iniciadas: number; enCurso: number; maxEnCurso: number; fallidas: number; resultados: number; }
const CFG = { K: 24 /* sólo el control ingenuo */, deltaMs: 1000, timeoutMs: 1000, fallosMax: 1 /* §43.8: alineado con el umbral '≤ 1 intento fallido' */, enfriamientoMs: 30_000 };
function crearLector(redis: Redis, cfg = CFG, ingenuo = false): Lector {
  let ahora = 0, permisos = 0, inicioUltima = -Infinity, fallosSeguidos = 0, enfriadoHasta = -Infinity;
  const vuelo: { inicio: number; vence: number; falla: boolean }[] = [];
  const L: Lector = {
    iniciadas: 0, enCurso: 0, maxEnCurso: 0, fallidas: 0, resultados: 0,
    permiso() {
      permisos += 1;
      if (ingenuo) { if (permisos % cfg.K === 0) iniciar(); return; }                 // CONTROL: sin guardia de vuelo ni enfriamiento
      if (vuelo.length > 0) return;                                                   // ≤ 1 lectura en curso: los permisos concurrentes la COMPARTEN
      if (ahora < enfriadoHasta) return;                                              // Redis caído/colgado: no se intenta en cada permiso
      if (ahora - inicioUltima < cfg.deltaMs) return;                                // una lectura por Δt, contado desde el INICIO de la anterior (K no hace falta: Δt domina)
      iniciar();
    },
    avanzar(ms) {
      ahora += ms;
      for (const v of vuelo.splice(0)) {
        if (ahora < v.vence) { vuelo.push(v); continue; }
        L.enCurso -= 1;
        if (v.falla) { L.fallidas += 1; fallosSeguidos += 1; if (fallosSeguidos >= cfg.fallosMax) { enfriadoHasta = ahora + cfg.enfriamientoMs; fallosSeguidos = 0; } }
        else { L.resultados += 1; fallosSeguidos = 0; }
      }
    },
  };
  function iniciar() {
    inicioUltima = ahora; L.iniciadas += 1; L.enCurso += 1; L.maxEnCurso = Math.max(L.maxEnCurso, L.enCurso);
    const dur = redis.tipo === "normal" || redis.tipo === "lento" ? redis.rttMs : redis.tipo === "caido" ? 0 : Infinity;
    // El ingenuo no tiene timeout propio: una lectura colgada queda colgada (como un fetch sin señal).
    vuelo.push({ inicio: ahora, vence: ingenuo ? ahora + dur : ahora + Math.min(dur, cfg.timeoutMs), falla: redis.tipo === "caido" || redis.tipo === "colgado" || dur > cfg.timeoutMs });
  }
  return L;
}
/** Simula `segundos` de composición a ~35 permisos/s (la cadencia medida), en pasos de 100 ms. */
function correr(L: Lector, segundos: number, permisosPorS = 35) {
  for (let t = 0; t < segundos * 10; t++) { for (let i = 0; i < permisosPorS / 10; i++) L.permiso(); L.avanzar(100); }
}

test("🔴 RED (control): un lector ingenuo con Redis COLGADO acumula lecturas en vuelo — tormenta", () => {
  const L = crearLector({ tipo: "colgado", rttMs: 0 }, CFG, true);
  correr(L, 30);
  assert.ok(L.maxEnCurso > 1, `ingenuo: ${L.maxEnCurso} lecturas en vuelo a la vez`);
  assert.equal(L.iniciadas, 50, `ingenuo: ${L.iniciadas} lecturas iniciadas en 30 s`);
  assert.equal(L.maxEnCurso, 50, "todas colgadas a la vez: ninguna termina");
});

test("🟢 Redis normal (40 ms): ≤ 1 lectura en curso, una por Δt aunque haya 35 permisos/s (los permisos comparten la lectura)", () => {
  const L = crearLector({ tipo: "normal", rttMs: 40 });
  correr(L, 30);
  assert.equal(L.maxEnCurso, 1);
  assert.ok(L.iniciadas >= 29 && L.iniciadas <= 31, `iniciadas ${L.iniciadas} (≈ 30 s / Δt)`);
  assert.equal(L.fallidas, 0);
});

test("🟢 Redis LENTO (RTT 3 s > timeout 1 s): nunca más de una en curso; el intervalo cuenta desde el inicio; la lectura vence al timeout y cuenta como fallida; con F_max = 1, enfriamiento de 30 s tras cada fallo → 2 en 60 s", () => {
  const L = crearLector({ tipo: "lento", rttMs: 3000 });
  correr(L, 60);
  assert.equal(L.maxEnCurso, 1);
  // t=0..1 falla 1 → enfriado hasta 31; t=31..32 falla 2 → enfriado hasta 62.
  assert.equal(L.fallidas, 2, `fallidas ${L.fallidas}`);
  assert.equal(L.iniciadas, 2);
});

test("🟢 Redis COLGADO (nunca responde): exactamente F_max = 1 lectura por ventana de enfriamiento; con timeout 1 s y enfriamiento 30 s son 2 en 60 s, no 2.100 — y ≤ 1 fallida por composición de ≤ 30 s (umbral de §40.4)", () => {
  const L = crearLector({ tipo: "colgado", rttMs: 0 });
  correr(L, 60);
  assert.equal(L.maxEnCurso, 1);
  assert.equal(L.iniciadas, 2);
  assert.equal(L.fallidas, 2);
  const L27 = crearLector({ tipo: "colgado", rttMs: 0 }); correr(L27, 27);
  assert.equal(L27.fallidas, 1, "una composición de 27 s: exactamente 1 intento fallido");
});

test("🟢 Redis CAÍDO (error inmediato): tampoco una lectura por permiso — el máximo exacto es F_max = 1 por ventana: 2 en 60 s", () => {
  const L = crearLector({ tipo: "caido", rttMs: 0 });
  correr(L, 60);
  assert.equal(L.iniciadas, 2, `iniciadas ${L.iniciadas}`);
  assert.equal(L.maxEnCurso, 1);
});

test("🟢 Redis se recupera: al terminar el enfriamiento vuelve a leer y, con respuesta, el contador de fallos se reinicia", () => {
  const redis: Redis = { tipo: "colgado", rttMs: 0 };
  const L = crearLector(redis);
  correr(L, 31);                     // 1 fallida (t=0..1) + enfriamiento de 30 s (hasta t=31)
  redis.tipo = "normal"; redis.rttMs = 40;
  correr(L, 10);
  assert.ok(L.resultados >= 9, `resultados ${L.resultados}`);
  assert.equal(L.fallidas, 1);
});

// ----------------------------------------------------------------- 8. sobrepaso EXPLÍCITO cuando la pausa aparece después de adquirir (punto 1)
test("🟢 contrato: pausa preexistente → 0 llamadas (adquisición atómica); pausa posterior → sobrepaso ≤ enVuelo + admitidas durante Δt + RTT", () => {
  const enVuelo = 24, cadencia = 35, deltaMs = 1000, rttMs = 40;
  const cota = enVuelo + Math.ceil(cadencia * (deltaMs + rttMs) / 1000);   // 24 + 37 = 61 por proceso
  assert.equal(cota, 61);
  // Modelo: la pausa aparece en t=0 justo después de una lectura; la próxima lectura sale a Δt y responde a Δt+RTT;
  // mientras tanto el proceso admite `cadencia` permisos/s y tiene `enVuelo` en el aire.
  const admitidasHastaVer = Math.ceil(cadencia * (deltaMs + rttMs) / 1000);
  assert.ok(enVuelo + admitidasHastaVer <= cota);
  // Con 3 procesos: ≤ 183 llamadas globales después de una pausa aparecida tras las adquisiciones. No es cero y no se promete cero.
  assert.equal(3 * cota, 183);
});

// ----------------------------------------------------------------- 9. Home sin UB durante la pausa: 503 y el cliente (punto 5, modelo del contrato existente)
test("🟢 sin UB y pausado: la ruta responde 503 + Retry-After con el motivo que el cliente YA reconoce; useApi lo toma como error (data null) y CatalogView muestra 'No pudimos cargar el inicio' con Reintentar, nunca un Home vacío válido", () => {
  const restanteMs = 4200;
  const respuesta = { status: 503, headers: { "Retry-After": String(Math.ceil(restanteMs / 1000)) }, body: { error: "tmdb-no-disponible", motivo: "pausa", reintentarEnMs: restanteMs } };
  assert.equal(respuesta.headers["Retry-After"], "5");
  // useApi (components/useApi.ts): `!r.ok` ⇒ error=true, data=null (sin keepPrevious), motivo leído del cuerpo.
  const ok = respuesta.status >= 200 && respuesta.status < 300;
  const estadoCliente = { error: !ok, data: ok ? respuesta.body : null, motivo: motivoDeRespuesta(ok, respuesta.body) };
  assert.deepEqual(estadoCliente, { error: true, data: null, motivo: "tmdb-no-disponible" });
  // CatalogView: hayContenido=false, cargando=false, online ⇒ rama "No pudimos cargar el inicio." + botón Reintentar; un payload vacío 200 NO se produce.
  const hayContenido = !!(estadoCliente.data as { rails?: unknown[] } | null)?.rails?.length;
  assert.equal(hayContenido, false);
  assert.notEqual(respuesta.status, 200, "un Home vacío con 200 se leería como 'nada en tus plataformas'; por eso es 503");
});


// =============================================================================
// §42/§43 (decisión del dueño + auditoría sobre 5405cbd): sin UB y con pausa,
// UN solo sueño acotado, UNA sola readquisición, ≤ 2 EVAL por solicitud; el
// vencimiento del presupuesto interno sale por el centinela 4d (§44.1/§45: la
// ruta no usa `req.signal`; no es un 503 ni un error); la pausa LOCAL manda si Redis no
// responde; el presupuesto incluye jitter y el timeout de la readquisición;
// Retry-After con fallback conservador si la readquisición queda indeterminada.
// =============================================================================
const ESPERA_MAX_MS = 5_000;            // PROPUESTA sin datos reales (= REINTENTAR_POR_DEFECTO_MS)
const JITTER_MAX_MS = 250;
const T_ADQ_MAX_MS = 2_000;             // timeout propio de la readquisición [propuesto]
const RETRY_AFTER_FALLBACK_S = 5;       // = REINTENTAR_POR_DEFECTO_MS / 1000
const COMPOSICION_MAX_MS = 16_000;      // CONSTANTES.COMPOSICION_MAX_MS
const PRESUPUESTO_MS = 50_000;          // CONSTANTES.PRESUPUESTO_REQUEST_MS
type Adq = { estado: "adquirido" } | { estado: "ocupado" } | { estado: "sin-redis" } | { estado: "indeterminado" } | { estado: "pausado"; restanteMs: number };
interface Mundo {
  ahora: number;                    // reloj virtual local (ms); sólo se usan DIFERENCIAS
  pausaHasta: number | null;        // pausa compartida (vence en este instante del modelo)
  pausaLocalHasta: number | null;   // nivel 1: la pausa que ESTE proceso vio (duración local)
  hayUB: boolean;
  turnoLibre: boolean;
  redis: "ok" | "caido" | "lento" | "indeterminado-en-2a";   // lento: cada EVAL tarda 1,5 s; indeterminado-en-2a: la segunda adquisición no responde
  composiciones: number;
  plazo: number;                        // §46: deadline absoluto creado junto con la señal (`inicio + PRESUPUESTO_REQUEST_MS`), antes de la lectura previa
  venceEn: number | null;               // instante en que VENCE la señal de presupuesto interno (= plazo, salvo en el RED de §46 que los separa); la ruta NO usa `req.signal`
  evalCount: number;
  jitterMs: number;
}
type Salida = { status: 200; motivo: string; esperadoMs: number } | { status: 503; retryAfter: number; motivo: string };
const s503 = (retryAfter: number, motivo: string): Salida => ({ status: 503, retryAfter: Math.max(1, retryAfter), motivo });
async function servirSinUB(m: Mundo): Promise<Salida> {
  // §46: UN plazo absoluto creado con la señal (m.plazo); todo es `plazo − ahora`. El cálculo con
  // reloj local (`PRESUPUESTO − (ahora − t0)`) sobrevive sólo como RED/antecedente en la sección §46.
  const presupuestoRestante = () => m.plazo - m.ahora;
  const pausaLocalRestante = () => m.pausaLocalHasta !== null && m.pausaLocalHasta > m.ahora ? m.pausaLocalHasta - m.ahora : 0;
  const adquirir = (segunda = false): Adq => {
    m.evalCount += 1;
    if (m.redis === "caido") return { estado: "sin-redis" };
    if (m.redis === "indeterminado-en-2a" && segunda) { m.ahora += T_ADQ_MAX_MS; return { estado: "indeterminado" }; }
    if (m.redis === "lento") m.ahora += 1500;
    if (m.pausaHasta !== null && m.pausaHasta > m.ahora) return { estado: "pausado", restanteMs: m.pausaHasta - m.ahora };
    if (!m.turnoLibre) return { estado: "ocupado" };
    m.turnoLibre = false; return { estado: "adquirido" };
  };
  // Precedencia (§43.3): la pausa LOCAL vigente manda aunque Redis no responda.
  const conPausaLocal = (adq: Adq): Adq => (adq.estado === "sin-redis" || adq.estado === "indeterminado") && pausaLocalRestante() > 0 ? { estado: "pausado", restanteMs: pausaLocalRestante() } : adq;
  const terminar = (adq: Adq, esperadoMs: number): Salida => {
    if (adq.estado === "adquirido") {
      if (presupuestoRestante() < COMPOSICION_MAX_MS) { m.turnoLibre = true; return s503(1, "espera-agotada"); }
      m.composiciones += 1; m.turnoLibre = true; return { status: 200, motivo: "compuesta", esperadoMs };
    }
    if (adq.estado === "ocupado") return { status: 200, motivo: "compartida", esperadoMs };
    if (adq.estado === "sin-redis" || adq.estado === "indeterminado") return { status: 200, motivo: "sin-redis", esperadoMs };  // degradado de hoy (sólo SIN pausa local)
    return s503(Math.ceil(adq.restanteMs / 1000), "pausa-continua");
  };
  const r1 = conPausaLocal(adquirir());                                         // EVAL 1
  if (r1.estado !== "pausado") return terminar(r1, 0);
  const restante = r1.restanteMs;
  const cabeEnEspera = restante <= ESPERA_MAX_MS;
  const cabeEnPresupuesto = presupuestoRestante() - (restante + JITTER_MAX_MS + T_ADQ_MAX_MS) >= COMPOSICION_MAX_MS;   // §43.4 — OJO: acá `t0` es local al modelo; §46 exige `plazo − ahora` con el plazo creado junto con la señal (la lectura previa no entra en este t0)
  if (!cabeEnEspera) return s503(Math.ceil(restante / 1000), "pausa-continua");
  if (!cabeEnPresupuesto) return s503(Math.ceil(restante / 1000), "presupuesto-insuficiente");
  // UN solo sueño. La señal es la de PRESUPUESTO INTERNO (`AbortSignal.timeout`), no el abandono del
  // cliente (la ruta no usa `req.signal`; incorporarlo sería otra decisión). `dormir` RESUELVE al
  // vencer (dormirCancelable real); después se mira la señal y, si venció, se devuelve el centinela
  // 4d `vacio("cancelada")` (§44.1): sin readquirir, sin componer, sin lanzar (la ruta convertiría
  // una excepción en 500 + console.error). Con el plazo absoluto de §46 el vencimiento durante el
  // sueño es improbable pero NO imposible (reloj, señal y plazo son cosas distintas): la rama es
  // una defensa REAL, no decorativa (§45 decía "inalcanzable": falso, §46).
  const dormirMs = restante + m.jitterMs;
  if (m.venceEn !== null && m.venceEn < m.ahora + dormirMs) { const esperado = m.venceEn - m.ahora; m.ahora = m.venceEn; return { status: 200, motivo: "vacio-cancelada", esperadoMs: esperado }; }
  m.ahora += dormirMs;
  const r2 = conPausaLocal(adquirir(true));                                     // EVAL 2 — el último de la solicitud
  if (r2.estado === "indeterminado") {
    // §43.5: la pausa pudo extenderse mientras dormíamos; fallback CONSERVADOR: nunca menor que el default de la app.
    return s503(Math.max(RETRY_AFTER_FALLBACK_S, Math.ceil(Math.max(0, restante - dormirMs) / 1000)), "pausa-indeterminada");
  }
  return terminar(r2, dormirMs);
}
const mundo = (o: Partial<Mundo> = {}): Mundo => ({ ahora: 100_000, plazo: 100_000 + PRESUPUESTO_MS, pausaHasta: null, pausaLocalHasta: null, hayUB: false, turnoLibre: true, redis: "ok", composiciones: 0, venceEn: null, evalCount: 0, jitterMs: 100, ...o });

test("🟢 (1) la pausa termina durante el único sueño: duerme restante + jitter, readquiere UNA vez y compone; exactamente 2 EVAL", async () => {
  const m = mundo({ pausaHasta: 100_000 + 2300 });
  assert.deepEqual(await servirSinUB(m), { status: 200, motivo: "compuesta", esperadoMs: 2400 });
  assert.equal(m.composiciones, 1); assert.equal(m.evalCount, 2);
});

test("🟢 (2) la pausa continúa (restante > ESPERA_MAX): 503 con Retry-After = ⌈restante⌉, sin dormir, 1 EVAL", async () => {
  const m = mundo({ pausaHasta: 100_000 + 8000 });
  assert.deepEqual(await servirSinUB(m), s503(8, "pausa-continua"));
  assert.equal(m.evalCount, 1); assert.equal(m.composiciones, 0);
});

test("🔴 CONTROL (§42, superado): un bucle que volviera a dormir mientras 'quepa' podía encadenar sueños; 🟢 ahora: extensión CORTA que cabría (1 s + 1 s) → igual 503, nunca un segundo sueño, 2 EVAL", async () => {
  const m = mundo({ pausaHasta: 100_000 + 1000 });
  const mm = new Proxy(m, { get(t, k) { if (k === "pausaHasta" && t.ahora >= 101_000 && t.evalCount === 2 && !(t as any)._ext) { (t as any)._ext = true; t.pausaHasta = t.ahora + 1000; } return (t as any)[k]; } });
  const r = await servirSinUB(mm);
  assert.deepEqual(r, s503(1, "pausa-continua"));
  assert.equal(m.evalCount, 2); assert.equal(m.ahora, 101_100, "no durmió por segunda vez");
});

test("🟢 (3) VENCIMIENTO por presupuesto interno durante el sueño (defensa real, §46): se corta el sueño, no readquiere, no compone, y sale por el centinela 4d de hoy (`vacio-cancelada`): ni 503 ni error registrado", async () => {
  const m = mundo({ pausaHasta: 100_000 + 4000, venceEn: 100_000 + 1500 });
  const r = await servirSinUB(m);
  assert.deepEqual(r, { status: 200, motivo: "vacio-cancelada", esperadoMs: 1500 });
  assert.equal(m.evalCount, 1, "no hubo readquisición"); assert.equal(m.composiciones, 0); assert.equal(m.turnoLibre, true);
});

test("🟢 (4a) precedencia: pausa LOCAL vigente + Redis caído, SIN UB → no se compone contra TMDB: se aplica la espera con el restante local y, si sigue, 503", async () => {
  const m = mundo({ redis: "caido", pausaLocalHasta: 100_000 + 8000 });
  assert.deepEqual(await servirSinUB(m), s503(8, "pausa-continua"));
  assert.equal(m.composiciones, 0);
  const m2 = mundo({ redis: "caido", pausaLocalHasta: 100_000 + 1200 });
  const r2 = await servirSinUB(m2);   // el restante local cabe: duerme 1,3 s; al despertar la pausa local venció; Redis sigue caído → degradado de hoy
  assert.deepEqual(r2, { status: 200, motivo: "sin-redis", esperadoMs: 1300 });
});

test("🟢 (4b) precedencia: pausa LOCAL vigente + Redis caído, CON UB → el UB en el acto, sin componer", () => {
  // Con UB la decisión es previa a todo esto (§41.1): pausado ⇒ UB. Con Redis caído no se lee el UB de Redis…
  // el UB EN MEMORIA del proceso (si lo hay) o, sin él, el camino sin UB. Se fija la regla: nunca componer con pausa local vigente.
  const decidirConUB = (pausaLocal: boolean, redis: "ok" | "caido") => pausaLocal ? "ub-sin-componer" : redis === "caido" ? "degradado-de-hoy" : "normal";
  assert.equal(decidirConUB(true, "caido"), "ub-sin-componer");
  assert.equal(decidirConUB(true, "ok"), "ub-sin-componer");
  assert.equal(decidirConUB(false, "caido"), "degradado-de-hoy");
});

test("🟢 (4c) sin pausa local + Redis caído → comportamiento degradado de hoy (compone sin turno, no publica), con o sin UB", async () => {
  assert.deepEqual(await servirSinUB(mundo({ redis: "caido" })), { status: 200, motivo: "sin-redis", esperadoMs: 0 });
  assert.deepEqual(await servirSinUB(mundo({ redis: "caido", hayUB: true })), { status: 200, motivo: "sin-redis", esperadoMs: 0 });
});

test("🟢 (4d) indeterminado (resultado no entero) se trata como sin-redis: con pausa local manda la pausa; sin ella, degradado de hoy", () => {
  const interpretar = (v: unknown): Adq => Number.isInteger(v) ? (v as number) > 0 ? { estado: "pausado", restanteMs: v as number } : { estado: "adquirido" } : { estado: "indeterminado" };
  assert.deepEqual(interpretar("Aborted"), { estado: "indeterminado" });
  assert.deepEqual(interpretar(-2), { estado: "adquirido" });
  assert.deepEqual(interpretar(1500), { estado: "pausado", restanteMs: 1500 });
});

test("🟢 (5) varias solicitudes sin UB esperando a la vez: una compone, las demás caen en la espera compartida — UNA composición, ≤ 2 EVAL cada una", async () => {
  const base = mundo({ pausaHasta: 100_000 + 1500 });
  const motivos: string[] = []; let total = 0;
  for (const jitter of [0, 50, 100, 150]) {
    const m: Mundo = { ...base, jitterMs: jitter, composiciones: 0, evalCount: 0 };
    Object.defineProperty(m, "turnoLibre", { get: () => base.turnoLibre, set: (v) => { base.turnoLibre = v; } });
    const r = await servirSinUB(m); motivos.push((r as any).motivo);
    if ((r as any).motivo === "compuesta") { total += 1; base.turnoLibre = false; }
    assert.ok(m.evalCount <= 2);
  }
  assert.deepEqual(motivos, ["compuesta", "compartida", "compartida", "compartida"]); assert.equal(total, 1);
});

test("🟢 (6) presupuesto contra el PLAZO ABSOLUTO: restante + jitter máximo + timeout de la readquisición + composición; con el plazo a 20 s (30 s ya consumidos, lectura previa incluida) y 2 s de pausa: 20 − (2 + 0,25 + 2) = 15,75 < 16 → 503 sin dormir", async () => {
  const m = mundo({ pausaHasta: 100_000 + 2000, plazo: 100_000 + 20_000 });
  assert.deepEqual(await servirSinUB(m), s503(2, "presupuesto-insuficiente"));
  assert.equal(m.evalCount, 1);
  // Con el plazo a 21 s sí cabe (16,75 ≥ 16): duerme y compone.
  const m2 = mundo({ pausaHasta: 100_000 + 2000, plazo: 100_000 + 21_000 });
  assert.equal((await servirSinUB(m2) as any).motivo, "compuesta");
});

test("🟢 (7) Retry-After tras esperar: el PTTL FRESCO de la readquisición (pausa nueva de 6 s) → 6, no 4 ni 10", async () => {
  const m = mundo({ pausaHasta: 100_000 + 4000 });
  const mm = new Proxy(m, { get(t, k) { if (k === "pausaHasta" && t.ahora >= 104_000 && t.evalCount === 2 && !(t as any)._ext) { (t as any)._ext = true; t.pausaHasta = t.ahora + 6000; } return (t as any)[k]; } });
  assert.deepEqual(await servirSinUB(mm), s503(6, "pausa-continua"));
});

test("🟢 (7b) readquisición INDETERMINADA: fallback conservador = max(5 s, restanteInicial − esperado), nunca 0 ni 1 por descuento", async () => {
  const m = mundo({ redis: "indeterminado-en-2a", pausaHasta: 100_000 + 3000 });
  const r = await servirSinUB(m);
  assert.deepEqual(r, s503(5, "pausa-indeterminada"));   // 3 − 3,1 < 0 → 0 → fallback 5
  assert.equal(m.evalCount, 2);
});

test("🟢 (8) dos solicitudes al terminar la pausa: una composición (SET NX); ninguna vuelve a dormir", async () => {
  const a = mundo({ pausaHasta: 100_000 + 1000 }); const b: Mundo = { ...a };
  Object.defineProperty(b, "turnoLibre", { get: () => a.turnoLibre, set: (v) => { a.turnoLibre = v; } });
  const ra = await servirSinUB(a); a.turnoLibre = false; const rb = await servirSinUB(b);
  assert.equal((ra as any).motivo, "compuesta"); assert.equal((rb as any).motivo, "compartida");
  assert.equal(a.composiciones + b.composiciones, 1); assert.ok(a.evalCount <= 2 && b.evalCount <= 2);
});

test("🟢 cota dura: ≤ 2 EVAL y ≤ ESPERA_MAX + JITTER_MAX de sueño por solicitud, para cualquier restante; lo que no compone es 503 o cancelación", async () => {
  for (const restante of [1, 500, 2000, 4999, 5000, 5001, 8000, 30_000]) {
    const m = mundo({ pausaHasta: 100_000 + restante, jitterMs: JITTER_MAX_MS });
    const t0 = m.ahora; const r = await servirSinUB(m);
    assert.ok(m.evalCount <= 2, `EVAL ${m.evalCount}`);
    assert.ok(m.ahora - t0 <= ESPERA_MAX_MS + JITTER_MAX_MS, `esperó ${m.ahora - t0} ms con restante ${restante}`);
    assert.ok(r.status === 503 || r.motivo === "compuesta" || r.motivo === "vacio-cancelada", JSON.stringify(r));   // vacio-cancelada sólo por vencimiento interno (defensa real, §46); no ocurre con estos mundos porque venceEn es null
  }
});

// ----------------------------------------------------------------- §43.6/§43.7: K vs Δt, y la cota con timeout de lectura
test("🟢 K = 24 a 35 permisos/s se alcanza a los 686 ms (< Δt = 1 s): 'K o Δt' daría ~1,46 lecturas/s; 'sólo Δt' da 1/s — se elige sólo Δt", () => {
  const cadencia = 35, K = 24, deltaMs = 1000;
  const msHastaK = Math.round(K / cadencia * 1000);
  assert.equal(msHastaK, 686);
  const lecturasPorS_KoDt = 1000 / Math.min(msHastaK, deltaMs), lecturasPorS_Dt = 1000 / deltaMs;
  assert.ok(lecturasPorS_KoDt > 1.4 && lecturasPorS_KoDt < 1.5); assert.equal(lecturasPorS_Dt, 1);
  // Con 926 llamadas en ~27 s: ~40 lecturas (K o Δt) vs ~27 (Δt): la primera roza el umbral fijado (41), la segunda deja margen.
  assert.ok(27 * lecturasPorS_KoDt <= 41 && 27 * lecturasPorS_KoDt > 38);
  assert.ok(27 * lecturasPorS_Dt <= 29);
});

test("🟢 cota de sobrepaso con timeout de lectura de 1 s: ≤ enVuelo + cadencia × (Δt + T_lectura) = 24 + 35 × 2 = 94 por proceso, 282 con tres; si la lectura FALLA no hay cota compartida: sólo la local (hasta el propio 429)", () => {
  const enVuelo = 24, cadencia = 35, deltaMs = 1000, tLecturaMs = 1000;
  const cota = enVuelo + cadencia * ((deltaMs + tLecturaMs) / 1000);
  assert.equal(cota, 94); assert.equal(3 * cota, 282);
  const cotaConLecturaFallida = null;   // declarado: sin cota compartida
  assert.equal(cotaConLecturaFallida, null);
});

// ----------------------------------------------------------------- §43.9/§43.10: PAUSAR v3 — clave por proceso con TTL propio y orden que falla seguro
// KEYS[1] tmdb:pausa · KEYS[2] tmdb:pausa:ev:<id> · KEYS[3] tmdb:pausa:proc:<uuid> (string con PX propio) · KEYS[4] tmdb:eventos · KEYS[5] tmdb:cubos
// Orden: validar → LEER todo (EXISTS marcador, GET proc, PTTL) → decidir → ESCRIBIR protección (pausa) → proc → marcador → telemetría en pcall.
type FalloEn = null | "tras-pausa" | "tras-proc" | "telemetria";
function pausarV3(r: RedisModelo2, a: { id: string; ms: number; uuid: string; contador: number }, falloEn: FalloEn = null): Res2 | "error" {
  const [K1, K2, K3] = [PAUSA, `${PAUSA}:ev:${a.id}`, `${PAUSA}:proc:${a.uuid}`];
  const op = (s: string) => r.ops.push(s);
  if (!Number.isInteger(a.ms) || a.ms <= 0 || !Number.isInteger(a.contador)) { op("validar:error"); return "error"; }   // valida ANTES de mutar
  op("EXISTS ev"); if (r.exists(K2)) { telemetria(r, "ya-aplicada"); return { estado: "ya-aplicada", restanteMs: r.pttl(K1) }; }
  op("GET proc"); const marca = Number(r.get(K3) ?? -1);
  if (a.contador <= marca) { telemetria(r, "ya-aplicada"); return { estado: "ya-aplicada", restanteMs: r.pttl(K1) }; }
  op("PTTL pausa"); let restante = r.pttl(K1); let estado: Res2["estado"];
  if (restante >= a.ms) estado = "ya-mayor"; else { op("SET pausa PX"); r.set(K1, a.id, a.ms); estado = "escrito"; restante = a.ms; }
  if (falloEn === "tras-pausa") { op("ERROR"); return "error"; }
  op("SET proc PX 86400000"); r.set(K3, String(a.contador), 86_400_000);
  if (falloEn === "tras-proc") { op("ERROR"); return "error"; }
  op("SET ev PX 120000"); r.set(K2, "1", MARCADOR_MS);
  telemetria(r, estado === "escrito" ? "pausas" : "ya-mayor", falloEn === "telemetria");
  return { estado, restanteMs: restante };
}
function telemetria(r: RedisModelo2, campo: string, falla = false) {
  // pcall: si TIME/cjson/HINCRBY fallan, la protección ya está escrita; sólo se pierde telemetría.
  r.ops.push(`pcall(telemetria ${campo})${falla ? ":fallo" : ""}`);
  if (falla) return;
  const minuto = Math.floor(r.ahora / 60_000);
  if (campo !== "ya-aplicada") r.hincrby("tmdb:cubos", `${minuto}:429`, 1);
  r.hincrby("tmdb:cubos", `${minuto}:${campo}`, 1);
  if (campo !== "ya-aplicada") r.lpush("tmdb:eventos", JSON.stringify({ campo, t: r.ahora }));
}

test("🟢 marca de agua por proceso: clave propia `tmdb:pausa:proc:<uuid>` con PX 24 h — vence sola por proceso; sin hash global que crezca", () => {
  const r = new RedisModelo2();
  pausarV3(r, { id: "p1:3", ms: 2000, uuid: "p1", contador: 3 });
  assert.equal(r.get(`${PAUSA}:proc:p1`), "3"); assert.equal(r.pttl(`${PAUSA}:proc:p1`), 86_400_000);
  r.avanzar(86_400_000);
  assert.equal(r.get(`${PAUSA}:proc:p1`), null, "venció sola");
  assert.equal(r.hashes.has(`${PAUSA}:proc`), false, "no existe hash global");
});

test("🟢 orden que falla seguro: validar antes de mutar; un error DESPUÉS de escribir la pausa deja la protección puesta y el reintento sólo puede sobre-proteger (extender ≤ la brecha del reintento), nunca dejar sin pausa", () => {
  const r = new RedisModelo2();
  assert.equal(pausarV3(r, { id: "p1:1", ms: 0, uuid: "p1", contador: 1 }), "error");
  assert.deepEqual(r.ops, ["validar:error"]); assert.equal(r.pttl(PAUSA), -2, "nada mutado");
  r.ops = [];
  assert.equal(pausarV3(r, { id: "p1:1", ms: 8000, uuid: "p1", contador: 1 }, "tras-pausa"), "error");
  assert.equal(r.pttl(PAUSA), 8000, "la pausa quedó escrita aunque el script falló después");
  assert.equal(r.exists(`${PAUSA}:ev:p1:1`), 0, "el marcador NO se escribió: el reintento no será 'ya-aplicada'");
  r.avanzar(100);
  const reintento = pausarV3(r, { id: "p1:1", ms: 8000, uuid: "p1", contador: 1 });
  assert.equal((reintento as Res2).estado, "escrito", "re-escribe: sobre-protección acotada");
  assert.equal(r.pttl(PAUSA), 8000, "extendió exactamente la brecha del reintento (100 ms), no más");
});

test("🔴 CONTROL (orden inverso, inseguro): marcador ANTES que la pausa + error entre medio ⇒ el reintento dice 'ya-aplicada' y la pausa NUNCA se escribe", () => {
  const r = new RedisModelo2();
  // Simulación del orden malo: SET marcador, luego error antes del SET pausa.
  r.set(`${PAUSA}:ev:p1:1`, "1", MARCADOR_MS);
  const reintento = pausarV3(r, { id: "p1:1", ms: 8000, uuid: "p1", contador: 1 });
  assert.equal((reintento as Res2).estado, "ya-aplicada");
  assert.equal(r.pttl(PAUSA), -2, "sin pausa: por eso el marcador va DESPUÉS de la pausa");
});

test("🟢 la telemetría va en pcall al final: si TIME/cjson/HINCRBY fallan, la pausa, la marca y el marcador ya están escritos y el resultado se devuelve igual", () => {
  const r = new RedisModelo2();
  const res = pausarV3(r, { id: "p1:1", ms: 3000, uuid: "p1", contador: 1 }, "telemetria");
  assert.deepEqual(res, { estado: "escrito", restanteMs: 3000 });
  assert.equal(r.pttl(PAUSA), 3000); assert.equal(r.exists(`${PAUSA}:ev:p1:1`), 1); assert.equal(r.get(`${PAUSA}:proc:p1`), "1");
  assert.ok(r.ops.at(-1)!.endsWith(":fallo")); assert.equal(r.hashes.get("tmdb:cubos"), undefined, "sin cubos: telemetría perdida, protección intacta");
});

test("🟢 el orden completo de v3 en `escrito`: validar → EXISTS ev → GET proc → PTTL → SET pausa → SET proc → SET ev → pcall(telemetría)", () => {
  const r = new RedisModelo2();
  pausarV3(r, { id: "p2:9", ms: 4000, uuid: "p2", contador: 9 });
  assert.deepEqual(r.ops, ["EXISTS ev", "GET proc", "PTTL pausa", "SET pausa PX", "SET proc PX 86400000", "SET ev PX 120000", "pcall(telemetria pausas)"]);
});

// =============================================================================
// §44 (auditoría sobre 122f1a6): cancelación con el `dormir` y el handler REALES,
// matriz del UB sin caché en memoria, y sobrepaso parametrizado.
// =============================================================================

// ----------------------------------------------------------------- 1. vencimiento por presupuesto interno: RED con las primitivas reales
// Qué señal existe HOY [medido en código]: `app/api/home/route.ts` NO usa `req.signal`; `homePayload`
// crea `AbortSignal.timeout(CONSTANTES.PRESUPUESTO_REQUEST_MS)`. O sea que "la señal abortó" significa
// "venció el presupuesto interno de 50 s", NUNCA "el cliente abandonó" (eso queda fuera de alcance).
// `modeloDelCatchDeLaRuta` es un MODELO FIEL del `catch` de la ruta (excepción → 500 + console.error),
// NO el handler importado: la implementación deberá traer un guard estructural contra la ruta real
// (abajo hay uno para los hechos de hoy).
async function modeloDelCatchDeLaRuta<T>(cuerpo: () => Promise<T>, registrar: (l: string) => void) {
  try { return { status: 200, body: await cuerpo() }; }
  catch (e) { registrar(`[api/home] composeHome rechazó — ${String(e)}`); return { status: 500, body: { error: String(e), hero: [], rails: [], fallos: 1, degradado: true } }; }
}

test("🔴 RED (control): el `dormirCancelable` real RESUELVE al vencer la señal, no rechaza — un diseño que espere un `AbortError` nunca se entera del vencimiento", async () => {
  const ac = new AbortController();
  const p = dormirCancelable(10_000, ac.signal);
  ac.abort();
  const resultado = await p.then(() => "resolvió", () => "rechazó");
  assert.equal(resultado, "resolvió", "§43.2 decía que dormir rechaza: falso");
});

test("🔴 RED (control): con el `dormir` real, la versión de §43 (que confiaba en el rechazo) readquiere y compone después del vencimiento", async () => {
  const ac = new AbortController();
  let adquisiciones = 0, composiciones = 0;
  const modelo43 = async () => {
    adquisiciones += 1;                                   // EVAL 1 → pausado(500)
    try { await dormirCancelable(500, ac.signal); } catch { return "cancelada"; }   // esperaba AbortError
    adquisiciones += 1; composiciones += 1; return "compuesta";                  // EVAL 2 + composición
  };
  setTimeout(() => ac.abort(), 5);
  const r = await modelo43();
  assert.equal(r, "compuesta", "el vencimiento no se detectó");
  assert.equal(adquisiciones, 2); assert.equal(composiciones, 1);
});

test("🔴 RED (control): 'propagar' un AbortError hasta el `catch` de la ruta (modelo fiel) produce un 500 y un console.error falso", async () => {
  const registro: string[] = [];
  const r = await modeloDelCatchDeLaRuta(async () => { throw new DOMException("solicitud cancelada", "AbortError"); }, (l) => registro.push(l));
  assert.equal(r.status, 500);
  assert.equal(registro.length, 1, "queda registrado como si composeHome hubiera fallado");
});

// GREEN — la única semántica: después de `dormir`, mirar `senal.aborted` (presupuesto interno vencido);
// si venció, devolver el centinela `vacio("cancelada")` que servirConTurno YA usa en 4d (línea
// `[home] … CANCELADA`, `origen vacio-cancelada`), sin readquirir, sin componer, sin lanzar.
type Adq4 = { estado: "adquirido" } | { estado: "pausado"; restanteMs: number } | { estado: "sin-redis" };
async function esperarPausaSinUB(o: { adquirir: () => Adq4; senal: AbortSignal; dormir?: typeof dormirCancelable; jitterMs?: number; vacio: (m: "cancelada") => { motivo: "cancelada" } }) {
  const dormir = o.dormir ?? dormirCancelable;
  const cuenta = { adquisiciones: 0, composiciones: 0 };
  const adq = () => { cuenta.adquisiciones += 1; return o.adquirir(); };
  const terminar = (r: Adq4) => { if (r.estado === "adquirido") cuenta.composiciones += 1; return { ...cuenta, salida: r.estado === "adquirido" ? "compuesta" : "sin-redis" }; };
  const r1 = adq();
  if (r1.estado !== "pausado") return terminar(r1);
  await dormir(r1.restanteMs + (o.jitterMs ?? 0), o.senal);
  if (o.senal.aborted) return { ...cuenta, salida: o.vacio("cancelada").motivo };   // 4d: centinela, no excepción, no 503
  const r2 = adq();
  if (r2.estado === "pausado") return { ...cuenta, salida: "503" };
  return terminar(r2);
}

test("🟢 con el `dormir` real: el vencimiento del presupuesto interno corta el sueño, NO readquiere, NO compone, y devuelve el centinela `cancelada` (4d) — el `catch` de la ruta (modelo fiel) no interviene: sin 503 ni error registrado", async () => {
  const ac = new AbortController();
  const registro: string[] = [];
  let pausaHasta = Date.now() + 5000;
  const adquirir = (): Adq4 => pausaHasta > Date.now() ? { estado: "pausado", restanteMs: pausaHasta - Date.now() } : { estado: "adquirido" };
  setTimeout(() => ac.abort(), 20);
  const t0 = Date.now();
  const r = await modeloDelCatchDeLaRuta(() => esperarPausaSinUB({ adquirir, senal: ac.signal, vacio: (m) => ({ motivo: m }) }), (l) => registro.push(l));
  assert.equal(r.status, 200, "el camino de hoy para un presupuesto vencido (4d), no un 500");
  assert.deepEqual(r.body, { adquisiciones: 1, composiciones: 0, salida: "cancelada" });
  assert.ok(Date.now() - t0 < 1000, "el sueño de 5 s se cortó en el acto");
  assert.deepEqual(registro, [], "ningún error falso");
});

test("🟢 sin vencimiento, el mismo camino compone tras el único sueño (2 adquisiciones)", async () => {
  const ac = new AbortController();
  let pausaHasta = Date.now() + 30;
  const adquirir = (): Adq4 => pausaHasta > Date.now() ? { estado: "pausado", restanteMs: pausaHasta - Date.now() } : { estado: "adquirido" };
  const r = await esperarPausaSinUB({ adquirir, senal: ac.signal, jitterMs: 25, vacio: (m) => ({ motivo: m }) });   // jitter > granularidad del timer
  assert.deepEqual(r, { adquisiciones: 2, composiciones: 1, salida: "compuesta" });
});

// ----------------------------------------------------------------- 2. UB y Redis caído: sin caché en memoria
// servirConTurno lee la fresca (paso 1) y, en el MISS, `[ub, degradado]` (paso 2) UNA vez por solicitud;
// `ub` es una variable de ESA solicitud. Si Redis falla antes del paso 2, `ub` es null; si falla después,
// `ub` conserva lo leído y se sirve (como ya hace 4c ante un productor que rechaza).
type CuandoFalla = "antes-del-paso-2" | "despues-del-paso-2" | "nunca";
function matrizUB(o: { fallaRedis: CuandoFalla; ubEnRedis: boolean; pausaLocal: boolean }) {
  const ub = o.fallaRedis === "antes-del-paso-2" ? null : (o.ubEnRedis ? "UB" : null);   // paso 2: una lectura, sin memoria entre solicitudes
  const adquisicion = o.fallaRedis === "nunca" ? "script" : "sin-redis";
  if (o.pausaLocal) return ub ? "ub-sin-componer" : "espera-local-luego-503";           // nunca componer con pausa local
  if (adquisicion === "sin-redis") return "degradado-de-hoy";                             // compone sin turno, no publica
  return "normal";
}
test("🟢 matriz UB × Redis: 'UB ya cargado en esta solicitud y Redis falla después' sirve el UB; 'Redis falla antes de leer el UB' no tiene UB (es null) — sin ninguna caché en memoria", () => {
  assert.equal(matrizUB({ fallaRedis: "despues-del-paso-2", ubEnRedis: true, pausaLocal: true }), "ub-sin-componer");
  assert.equal(matrizUB({ fallaRedis: "antes-del-paso-2", ubEnRedis: true, pausaLocal: true }), "espera-local-luego-503", "el UB existía en Redis pero esta solicitud no llegó a leerlo");
  assert.equal(matrizUB({ fallaRedis: "antes-del-paso-2", ubEnRedis: true, pausaLocal: false }), "degradado-de-hoy");
  assert.equal(matrizUB({ fallaRedis: "despues-del-paso-2", ubEnRedis: false, pausaLocal: true }), "espera-local-luego-503");
  assert.equal(matrizUB({ fallaRedis: "nunca", ubEnRedis: true, pausaLocal: false }), "normal");
});

// ----------------------------------------------------------------- 3. sobrepaso parametrizado, y la línea base medida
const sobrepaso = (enVuelo: number, cadenciaPorS: number, deltaMs: number, tLecturaMs: number) => enVuelo + Math.ceil(cadenciaPorS * (deltaMs + tLecturaMs) / 1000);
test("🟢 la fórmula queda parametrizada; los números son ESTIMACIONES del escenario que las produce, no cotas duras", () => {
  assert.equal(sobrepaso(24, 35, 1000, 1000), 94, "cadencia media del banco (35/s)");
  assert.equal(sobrepaso(24, 80, 1000, 1000), 184, "pico por segundo medido en un proceso (80/s)");
  assert.equal(sobrepaso(24, 252, 1000, 1000), 528, "cadencia con 429 RÁPIDAS medida hoy (252/s): la cola local drena en el acto");
  // Lo único fijado por diseño es enVuelo = 24 por proceso; la cadencia no está acotada por ningún mecanismo actual.
  assert.equal(sobrepaso(24, 0, 1000, 1000), 24);
});

test("🟢 línea base medida HOY (sin pausa; docs/medidas/2026-09-16-etapa3c0-sobrepaso-hoy.json): tras el primer 429 rápido, un proceso emite 750-778 llamadas más en 3,4-4,4 s, pico 224-252 por segundo", () => {
  const medido = [{ tras: 778, span: 4203, pico: 252 }, { tras: 776, span: 4396, pico: 224 }, { tras: 750, span: 3419, pico: 252 }];
  for (const m of medido) { assert.ok(m.tras >= 750 && m.tras <= 778); assert.ok(m.pico >= 224 && m.pico <= 252); }
  // Con el nivel 1 (429 propio) el sobrepaso por proceso deja de ser 'todo lo que queda' y pasa a ≈ enVuelo + admitidas hasta ver el primer 429:
  // con 429 rápidas (latencia ≈ 0) eso es ≈ 24 + pico × latencia_429 ≈ 24-50. El banco de 3.c.1 lo mide contra esta línea base.
});

// ----------------------------------------------------------------- 4. guard estructural contra la ruta REAL (hechos de hoy)
// Lo que §44 afirma sobre `app/api/home/route.ts` y `lib/home.ts` se comprueba sobre el fuente, no
// se recuerda: si alguien incorpora `req.signal` o cambia el `catch`, este test lo delata y §44
// deja de ser cierto. La implementación de 3.c.1 tendrá que sumar el cableado real (ver §45).
import fs from "node:fs";
import path from "node:path";
const fuente = (rel: string) => fs.readFileSync(path.resolve(import.meta.dirname, "..", rel), "utf8").replace(/\r/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
test("🟢 guard: la ruta del Home NO usa `req.signal`, la señal es `AbortSignal.timeout(CONSTANTES.PRESUPUESTO_REQUEST_MS)`, y el `catch` de la ruta responde 500 y registra", () => {
  const ruta = fuente("app/api/home/route.ts");
  assert.doesNotMatch(ruta, /req\.signal|request\.signal/, "la cancelación real del cliente NO está cableada: incorporarla es otra decisión");
  assert.match(ruta, /console\.error\("\[api\/home\] composeHome rechazó/);
  assert.match(ruta, /\{ status: 500 \}/);
  const home = fuente("lib/home.ts");
  // Implementación de la 3.c.1 (§47.4): la señal de la solicitud sigue siendo de 50 s fijos; la del FONDO dura
  // `plazoEfectivo − inicioFondo` (min(interno, externo)), ya no 50 s fijos. Las dos siguen siendo de presupuesto interno.
  assert.equal((home.match(/AbortSignal\.timeout\(CONSTANTES\.PRESUPUESTO_REQUEST_MS\)/g) ?? []).length, 1, "la señal de la solicitud es de presupuesto interno (50 s fijos)");
  assert.match(home, /AbortSignal\.timeout\(Math\.max\(0, plazoEfectivo - inicioFondo\)\)/, "la del fondo, del plazo efectivo");
  // Y el centinela 4d existe tal como §44 lo describe.
  const servir = fuente("lib/home-servir.ts");
  assert.match(servir, /servirVacio\("cancelada"\)/);
  assert.match(servir, /export function dormirCancelable/);
});

// =============================================================================
// §46 (auditoría sobre 7b410ee): DOS RELOJES. La señal nace en `homePayload`
// (`AbortSignal.timeout(PRESUPUESTO_REQUEST_MS)`, lib/home.ts:840); después
// `crearVueloHome.servir` hace la LECTURA PREVIA (lib/home-vuelo.ts:70); y recién
// `servirConTurno` fija `t0 = ahora()` (lib/home-servir.ts:143). Todo lo que se
// calcula como `PRESUPUESTO − (ahora − t0)` ignora lo consumido antes de t0.
// Contrato nuevo: UN deadline absoluto `plazo`, creado junto con la señal, y
// siempre `plazo − ahora()`. El fondo tiene su propio `plazoFondo` creado
// cuando el fondo empieza (junto con su señal, lib/home.ts:743).
// =============================================================================
const RELOJ = { PRESUPUESTO_MS: 50_000, COMPOSICION_MAX_MS: 16_000, JITTER_MAX_MS: 250, T_ADQ_MAX_MS: 2_000 };

/** El cálculo VIEJO (§43.4 y también el rescate de hoy en home-servir.ts:315): con el reloj local de servirConTurno. */
function cabeConRelojLocal(o: { ahora: number; t0Local: number; restantePausaMs: number }) {
  const presupuestoRestante = RELOJ.PRESUPUESTO_MS - (o.ahora - o.t0Local);
  return presupuestoRestante - (o.restantePausaMs + RELOJ.JITTER_MAX_MS + RELOJ.T_ADQ_MAX_MS) >= RELOJ.COMPOSICION_MAX_MS;
}
/** El cálculo NUEVO: contra el deadline absoluto creado con la señal. */
function cabeConPlazo(o: { ahora: number; plazo: number; restantePausaMs: number }) {
  const presupuestoRestante = o.plazo - o.ahora;
  return presupuestoRestante - (o.restantePausaMs + RELOJ.JITTER_MAX_MS + RELOJ.T_ADQ_MAX_MS) >= RELOJ.COMPOSICION_MAX_MS;
}

test("🔴 RED (control): la señal nace en t=0; la lectura previa consume 35 s; servirConTurno arranca su reloj a los 35 s; pausa de 2 s → el cálculo viejo dice 'cabe' aunque quedan 15 s", () => {
  const inicioSenal = 100_000;
  const plazo = inicioSenal + RELOJ.PRESUPUESTO_MS;      // deadline real: t = 50 s
  const trasLecturaPrevia = inicioSenal + 35_000;        // 35 s de lectura previa (Redis lento, reintentos del SDK…)
  const t0Local = trasLecturaPrevia;                     // servirConTurno: t0 = ahora()
  const ahora = trasLecturaPrevia;                       // aparece pausado(2000)
  assert.equal(cabeConRelojLocal({ ahora, t0Local, restantePausaMs: 2000 }), true, "viejo: cree que tiene 50 s");
  assert.equal(plazo - ahora, 15_000, "real: quedan 15 s");
  assert.equal(cabeConPlazo({ ahora, plazo, restantePausaMs: 2000 }), false, "nuevo: 15 − 4,25 < 16 → no cabe");
  // Lo que pasaría con el cálculo viejo: dormir 2,1 s, readquirir, componer 16 s → la señal vence a los 50 s en plena composición → cancelada (vacío).
  const finComposicionVieja = ahora + 2100 + RELOJ.T_ADQ_MAX_MS + RELOJ.COMPOSICION_MAX_MS;
  assert.ok(finComposicionVieja > plazo, "la composición muere en la señal: 'inalcanzable' (§45) era falso");
});

test("🔴 RED (control): el mismo defecto está HOY en el rescate de la espera compartida (home-servir.ts:315): `PRESUPUESTO − (ahora − t0)` con t0 local", () => {
  const rescateViejo = (ahora: number, t0Local: number) => RELOJ.PRESUPUESTO_MS - (ahora - t0Local) >= RELOJ.COMPOSICION_MAX_MS;
  const rescateNuevo = (ahora: number, plazo: number) => plazo - ahora >= RELOJ.COMPOSICION_MAX_MS;
  const inicio = 0, plazo = 50_000, t0Local = 35_000, ahora = 40_000;   // 35 s de lectura previa + 5 s de espera compartida
  assert.equal(rescateViejo(ahora, t0Local), true, "viejo: 45 s 'restantes'");
  assert.equal(rescateNuevo(ahora, plazo), false, "real: 10 s");
  void inicio;
});

// ----------------------------------------------------------------- el contrato: un plazo, un recorrido
// homePayload: inicio = ahora(); plazo = inicio + PRESUPUESTO; senal = AbortSignal.timeout(PRESUPUESTO)
//   → servirHome(clave, producir, { ...claves, plazo })          (crearVueloHome pasa el contexto sin tocarlo)
//   → resolver(clave, producir, contexto) → servirConTurno({ …, plazo: contexto.plazo })
//   → dentro: restante() = plazo − ahora(); se usa en la espera compartida (rescate), en la espera por pausa
//     (43.1/43.4), y antes de componer. El fondo: plazoFondo = ahoraAlIniciarElFondo + PRESUPUESTO, junto
//     con su señal (lib/home.ts:743), y componer(senalFondo, plazoFondo).
interface Recorrido { ahora: number; plazo: number; eventos: string[]; composiciones: number; }
function servirConPlazo(r: Recorrido, o: { lecturaPreviaMs: number; pausaRestanteMs: number | null; esperaCompartidaMs?: number }) {
  r.ahora += o.lecturaPreviaMs; r.eventos.push(`lectura-previa:${o.lecturaPreviaMs}`);
  const restante = () => r.plazo - r.ahora;
  if (o.esperaCompartidaMs) { r.ahora += o.esperaCompartidaMs; r.eventos.push(`espera-compartida:${o.esperaCompartidaMs}`); if (restante() < RELOJ.COMPOSICION_MAX_MS) { r.eventos.push("rescate:503-espera-agotada"); return "espera-agotada"; } }
  if (o.pausaRestanteMs !== null) {
    if (o.pausaRestanteMs > 5000) { r.eventos.push("503:pausa-continua"); return "503"; }
    if (restante() - (o.pausaRestanteMs + RELOJ.JITTER_MAX_MS + RELOJ.T_ADQ_MAX_MS) < RELOJ.COMPOSICION_MAX_MS) { r.eventos.push("503:presupuesto-insuficiente"); return "503"; }
    r.ahora += o.pausaRestanteMs + 100; r.eventos.push("sueño"); r.ahora += 50; r.eventos.push("readquisición");
  }
  if (restante() < RELOJ.COMPOSICION_MAX_MS) { r.eventos.push("rescate:503-espera-agotada"); return "espera-agotada"; }
  r.ahora += RELOJ.COMPOSICION_MAX_MS; r.composiciones += 1; r.eventos.push("compuesta");
  assert.ok(r.ahora <= r.plazo, `la composición terminó después del plazo: ${r.ahora - r.plazo} ms tarde`);
  return "compuesta";
}
const recorrido = (): Recorrido => ({ ahora: 100_000, plazo: 100_000 + RELOJ.PRESUPUESTO_MS, eventos: [], composiciones: 0 });

test("🟢 con el plazo único, la lectura previa de 35 s + pausa de 2 s → 503 presupuesto-insuficiente, sin dormir; nada se compone después del plazo", () => {
  const r = recorrido();
  assert.equal(servirConPlazo(r, { lecturaPreviaMs: 35_000, pausaRestanteMs: 2000 }), "503");
  assert.deepEqual(r.eventos, ["lectura-previa:35000", "503:presupuesto-insuficiente"]);
});

test("🟢 con lectura previa corta (0,3 s) la misma pausa cabe: sueño, readquisición, composición dentro del plazo", () => {
  const r = recorrido();
  assert.equal(servirConPlazo(r, { lecturaPreviaMs: 300, pausaRestanteMs: 2000 }), "compuesta");
  assert.ok(r.ahora <= r.plazo);
});

test("🟢 el rescate de la espera compartida también usa el plazo: lectura previa 30 s + espera compartida 5 s → 503 espera-agotada (hoy diría que quedan 45 s)", () => {
  const r = recorrido();
  assert.equal(servirConPlazo(r, { lecturaPreviaMs: 30_000, pausaRestanteMs: null, esperaCompartidaMs: 5000 }), "espera-agotada");
  assert.ok(r.eventos.includes("rescate:503-espera-agotada"));
});

test("🟢 el fondo tiene su PROPIO plazo, creado al iniciar el fondo: 50 s desde ese instante, no desde la solicitud", () => {
  const inicioSolicitud = 100_000;
  const inicioFondo = inicioSolicitud + 400;                                   // t_inicio_fondo ≈ 0,3-0,4 s (§40.3)
  const plazoFondo = inicioFondo + RELOJ.PRESUPUESTO_MS;
  assert.equal(plazoFondo - inicioSolicitud, 50_400);
  // El techo externo sigue siendo maxDuration desde la solicitud: min(plazoFondo, inicioSolicitud + 60 s) = plazoFondo (50,4 < 60).
  assert.equal(Math.min(plazoFondo, inicioSolicitud + 60_000), plazoFondo);
  // Y NO hereda el plazo de la solicitud: si el fondo usara `plazo` de la solicitud, con lectura previa de 35 s tendría 15 s.
  const plazoSolicitud = inicioSolicitud + RELOJ.PRESUPUESTO_MS;
  assert.ok(plazoFondo > plazoSolicitud);
});

test("🟢 el recorrido del plazo entre módulos: nace con la señal, viaja en el contexto y todos los cálculos son `plazo − ahora`", () => {
  const modulos = [
    { modulo: "lib/home.ts homePayload", hace: "inicio = ahora(); plazo = inicio + PRESUPUESTO_REQUEST_MS; senal = AbortSignal.timeout(PRESUPUESTO_REQUEST_MS)" },
    { modulo: "lib/home-vuelo.ts servir", hace: "lectura previa; pasa el contexto (con plazo) a resolver sin tocarlo" },
    { modulo: "lib/home-servir.ts servirConTurno", hace: "restante() = plazo − ahora(); rescate de la espera compartida, espera por pausa (43.1/43.4) y arranque de la composición usan restante()" },
    { modulo: "lib/home.ts programarComposicionEnFondo", hace: "plazoFondo = ahora() + PRESUPUESTO_REQUEST_MS junto con senalFondo; componer(senalFondo, plazoFondo)" },
  ];
  assert.equal(modulos.length, 4);
  assert.ok(modulos.every((m) => /plazo/.test(m.hace)));
  assert.ok(!modulos.some((m) => /t0 = ahora/.test(m.hace)), "ningún módulo vuelve a arrancar un reloj propio para el presupuesto");
});

// =============================================================================
// §47/§48 (auditorías sobre c5a2619 y 4724111): el FONDO con DOS límites absolutos.
//   plazoInterno  = inicioFondo + PRESUPUESTO_REQUEST_MS                 (50 s desde que el fondo empieza)
//   plazoExterno  = inicioRuta  + MAX_DURATION_MS − MARGEN_CIERRE_MS     (Vercel cuenta los 60 s desde la solicitud)
//   plazoEfectivo = min(plazoInterno, plazoExterno)   ← límite para INICIAR trabajo nuevo, no una garantía
//                                                        de que ninguna promesa de Redis sobreviva (§48)
// Al iniciar el fondo: si plazoEfectivo − ahora < COMPOSICION_MAX_MS + RESERVA_PUBLICACION_MS, NO se
// compone: el UB ya fue servido; LIBERAR best effort y `fondo: "no-iniciado-presupuesto"`.
// =============================================================================
const FONDO = {
  PRESUPUESTO_MS: 50_000, MAX_DURATION_MS: 60_000,
  MARGEN_CIERRE_MS: 5_000,         // RESERVA propuesta (publicación 0,13-0,15 s medida + línea + asentar waitUntil + precisión del corte, desconocida); NO es un máximo garantizado
  COMPOSICION_MAX_MS: 16_000,
  RESERVA_PUBLICACION_MS: 1_000,   // antes "PUBLICACION_MAX_MS": es lo que se RESERVA antes de iniciar PUBLICAR, no una cota de cuánto tarda
};
function plazosDelFondo(inicioRuta: number, inicioFondo: number) {
  const plazoInterno = inicioFondo + FONDO.PRESUPUESTO_MS;
  const plazoExterno = inicioRuta + FONDO.MAX_DURATION_MS - FONDO.MARGEN_CIERRE_MS;
  return { plazoInterno, plazoExterno, plazoEfectivo: Math.min(plazoInterno, plazoExterno), limitadoPor: plazoInterno <= plazoExterno ? "interno" : "externo" as "interno" | "externo" };
}
// §48: qué controla la señal y qué no. Una operación de Redis ya ENVIADA (RENOVAR, PUBLICAR,
// ENFRIAR, LIBERAR) no se cancela: completa cuando Redis la atienda (o su respuesta se pierde);
// la señal sólo impide INICIAR trabajo nuevo (llamadas a TMDB/Supabase, un PUBLICAR nuevo).
// §52: TRES instantes por operación. `enviadaEn` (el cliente la envía), `aplicadaEn` (Redis la ejecuta:
// el PEXPIRE del script corre AHÍ, no al enviar) y `completaEn` (el cliente recibe la respuesta, o se
// rinde). El cliente sólo observa el primero y el tercero; el segundo está en algún punto entre ambos.
type OpRedis = { op: "RENOVAR" | "PUBLICAR" | "LIBERAR"; enviadaEn: number; aplicadaEn: number | null; completaEn: number; respuestaPerdida: boolean; aplicada: boolean };
interface FondoMundo {
  ahora: number; inicioRuta: number; composicionMs: number; eventos: string[];
  turnoRedis: { propietario: string | null; venceEn: number | null; generacion: number };   // el estado EN REDIS (fencing por propietario + generación)
  fresca: string | null; ub: string;                                                          // contenido publicado; el UB sano NUNCA se pisa con algo parcial
  fondo: string | null; ops: OpRedis[]; rttRedisMs: number; liberarFalla: boolean; liberarPerdida: null | "aplicada" | "no-aplicada"; liberarIntentos: number; publicarRespuestaPerdida: boolean; corteDuroEn: number | null; llamadasTmdbTrasPlazo: number;
  deteccionMs: number;   // §49: en ejecución real la composición devuelve/detecta la señal unos ms DESPUÉS del plazo
  ultimaRenovacionEn: number | null;   // §51: SALIDA del modelo: instante de ENVÍO del último RENOVAR que el bucle 4b envió
  aplicacionRedisMs: number;           // §52: dónde dentro del RTT ejecuta Redis (0 = al recibir el comando; = rtt = justo antes de responder). Desconocido en la realidad: los tests barren los extremos
  renovacionesPerdidas: Record<number, "aplicada" | "no-aplicada">;   // §52: ticks (1 = el primero) cuya respuesta se pierde → `indeterminado` para el cliente; Redis pudo haberla ejecutado o no
  demoraFalloMs: number;               // §52: cuánto tarda el cliente en rendirse con una respuesta perdida (el SDK reintenta; no se modela su backoff exacto)
  cliente: { venceEnMin: number; venceEnMax: number | null };   // §52: lo que el PROCESO puede afirmar del vencimiento con lo que recibió; `venceEnMax: null` = no acotado desde el cliente
}
const TURNO_MS = 15_000, RENOVACION_MS = 5_000;   // CONSTANTES de lib/home-servir.ts
// §51/§52: el bucle de renovación REAL (home-servir.ts 4b, el mismo que corre el fondo vía `componer`):
//   while (!fin) { await dormir(RENOVACION_MS); if (fin || abortada(señal)) return; await renovar(px: TURNO_MS) }
// → la vuelta siguiente se programa cuando la anterior TERMINÓ (respuesta recibida o dada por perdida):
//   próximo envío = completaEn + RENOVACION_MS;
// → un tick en el que la señal YA venció no envía nada: la señal vence en plazoEfectivo, así que sólo
//   se envía con `t < plazoEfectivo` (ESTRICTO, como el borde de §50.4); `renovarEnElPlazo` es el RED;
// → cada RENOVAR que Redis aplica extiende el turno a `aplicadaEn + TURNO_MS` (PEXPIRE corre en Redis,
//   cuando Redis lo atiende — no cuando el cliente lo envió);
// → con respuesta recibida el cliente sabe que se aplicó en [enviadaEn, completaEn] y acota el
//   vencimiento a [enviadaEn + 15 s, completaEn + 15 s]; con respuesta perdida (`indeterminado` en
//   lib/turno.ts) no sabe si se aplicó: conserva el mínimo anterior y pierde la cota superior.
// El bucle termina con la composición (`cortarRenovacion`) o con el proceso (corte duro). No modela el
// `perdido` del script (GET ≠ propietario → 0), que es otra rama.
function renovarMientrasCompone(f: FondoMundo, plazoEfectivo: number, finComposicion: number, o: { renovarEnElPlazo?: boolean }) {
  const t0 = f.ahora;
  let proximoEnvio = t0 + RENOVACION_MS, tick = 0;
  while (proximoEnvio < finComposicion) {
    const t = proximoEnvio; tick += 1;
    if (f.corteDuroEn !== null && t >= f.corteDuroEn) break;                                   // el proceso ya no existe
    const senalVencida = o.renovarEnElPlazo ? t > plazoEfectivo : !(t < plazoEfectivo);
    if (senalVencida) { f.eventos.push(`RENOVAR:no-enviado@${t - f.inicioRuta}:señal-vencida`); break; }
    f.ahora = t;
    const perdida = f.renovacionesPerdidas[tick];
    const op = enviar(f, "RENOVAR", perdida !== undefined, (op) => { if (f.turnoRedis.propietario === "yo") f.turnoRedis.venceEn = op.aplicadaEn! + TURNO_MS; }, perdida === "no-aplicada", perdida !== undefined ? t + f.demoraFalloMs : undefined);
    if (!op.respuestaPerdida) f.cliente = { venceEnMin: t + TURNO_MS, venceEnMax: op.completaEn + TURNO_MS };
    else { f.cliente = { venceEnMin: f.cliente.venceEnMin, venceEnMax: null }; f.eventos.push(`RENOVAR:indeterminado@${t - f.inicioRuta}`); }
    f.ultimaRenovacionEn = t;
    proximoEnvio = op.completaEn + RENOVACION_MS;                                             // (5) la vuelta siguiente, al terminar la anterior
  }
  f.ahora = t0;
}
// §50: la limpieza REAL, una sola función (la misma que usa iniciarFondo). Guardia por intentos,
// comparación ESTRICTA contra el corte externo duro (inicioRuta + MAX_DURATION_MS), best effort.
function limpiarTurno(f: FondoMundo, o: { sinGuardia?: boolean } = {}) {
  if (!o.sinGuardia && f.liberarIntentos >= 1) { f.eventos.push("LIBERAR:omitido-ya-intentado"); return "omitido"; }
  f.liberarIntentos += 1;
  const limiteExternoDuro = f.inicioRuta + FONDO.MAX_DURATION_MS;
  if (!(f.ahora < limiteExternoDuro)) { f.eventos.push("LIBERAR:omitido-sin-margen->TTL"); return "omitido"; }
  if (f.liberarFalla) { f.eventos.push("LIBERAR:fallo->TTL"); return "fallo"; }
  const aplicar = () => { if (f.turnoRedis.propietario === "yo") { f.turnoRedis.propietario = null; f.turnoRedis.venceEn = null; } };
  const o2 = enviar(f, "LIBERAR", f.liberarPerdida !== null, aplicar, f.liberarPerdida === "no-aplicada");
  return o2.respuestaPerdida ? "indeterminado" : "liberado";
}
const enviar = (f: FondoMundo, op: OpRedis["op"], perdida = false, aplicar: (o: OpRedis) => void = () => {}, noLlego = false, completaEn?: number) => {
  const o: OpRedis = { op, enviadaEn: f.ahora, aplicadaEn: null, completaEn: completaEn ?? f.ahora + f.rttRedisMs, respuestaPerdida: perdida, aplicada: false };
  f.ops.push(o); f.eventos.push(`${op}:enviado@${f.ahora - f.inicioRuta}`);
  // Redis la ejecuta (atómica) cuando la ATIENDE — en algún punto del RTT (`aplicacionRedisMs`) —, aunque
  // el proceso muera o pierda la respuesta; salvo que la petición NUNCA llegue (`noLlego`): entonces no
  // se aplica y nadie lo sabe.
  if (!noLlego && (f.corteDuroEn === null || o.enviadaEn < f.corteDuroEn)) { o.aplicada = true; o.aplicadaEn = o.enviadaEn + Math.min(f.aplicacionRedisMs, f.rttRedisMs); aplicar(o); }
  return o;
};
function iniciarFondo(f: FondoMundo, o: { renovarEnElPlazo?: boolean } = {}) {
  const { plazoEfectivo, limitadoPor } = plazosDelFondo(f.inicioRuta, f.ahora);
  const restante = plazoEfectivo - f.ahora;
  f.eventos.push(`plazo-efectivo:${limitadoPor}:${restante}`);
  // §49/§50: LIBERAR es la ÚNICA excepción de cierre: un solo intento, best effort, permitido incluso
  // después del plazo efectivo pero sólo ESTRICTAMENTE antes del corte externo duro; nunca publica,
  // enfría, renueva ni toca el UB; si no hay margen, falla o se pierde la respuesta, no se insiste.
  const liberar = () => limpiarTurno(f);
  if (restante < FONDO.COMPOSICION_MAX_MS + FONDO.RESERVA_PUBLICACION_MS) { f.fondo = "no-iniciado-presupuesto"; liberar(); return "ub-servido-sin-fondo"; }
  f.fondo = "programado";
  // La composición: sólo INICIA llamadas nuevas mientras ahora < plazoEfectivo (la señal las corta al vencer).
  const finComposicion = f.ahora + f.composicionMs;
  // §51: 4b corre AL LADO de la composición y se corta con ella o con la señal (renovaciones reales).
  renovarMientrasCompone(f, plazoEfectivo, finComposicion, o);
  if (f.corteDuroEn !== null && finComposicion >= f.corteDuroEn) { f.ahora = f.corteDuroEn; f.eventos.push("CORTE-DURO"); return "no-observable"; }
  if (finComposicion > plazoEfectivo) {
    // La señal vence en plazoEfectivo; la composición DEVUELVE (o detecta) unos ms después: ahí ya no
    // se inicia nada productivo; sólo la limpieza LIBERAR (excepción de §49).
    f.ahora = plazoEfectivo + f.deteccionMs; f.eventos.push(`señal:vencida->detectada+${f.deteccionMs}ms; sin llamadas, RENOVAR, ENFRIAR ni PUBLICAR`);
    liberar(); return "cancelada";
  }
  f.ahora = finComposicion;
  if (f.ahora + FONDO.RESERVA_PUBLICACION_MS > plazoEfectivo) { f.eventos.push("sin-reserva-para-PUBLICAR"); liberar(); return "cancelada"; }
  // PUBLICAR se INICIA antes del plazo; puede COMPLETAR después (Redis la ejecuta entera o no la ejecuta).
  const pub = enviar(f, "PUBLICAR", f.publicarRespuestaPerdida, () => {
    if (f.turnoRedis.propietario === "yo") { f.fresca = "payload-completo-sano"; f.ub = "payload-completo-sano"; f.turnoRedis.propietario = null; f.turnoRedis.generacion += 1; }   // fencing: sólo si sigo siendo el dueño; todo o nada
  });
  if (pub.respuestaPerdida) { f.eventos.push("PUBLICAR:respuesta-perdida"); f.ahora = pub.completaEn; return "publicacion-indeterminada"; }
  f.ahora = pub.completaEn; f.eventos.push("PUBLICAR:ok");
  return "publicada";
}
// §51/§52: el turno se TOMA (SET NX, PX TURNO_MS) al adquirir, instantes antes de que el fondo arranque
// detrás de la compuerta. Redis aplica ese SET en `toma + aplicacionRedisMs` (el PX corre ahí); el cliente,
// que vio la respuesta, sólo puede acotar el vencimiento a [toma + 15 s, toma + rtt + 15 s]. De ahí en más
// lo mueven sólo los RENOVAR.
const fondoMundo = (o: Partial<FondoMundo> = {}): FondoMundo => {
  const ahora = o.ahora ?? 100_000, rtt = o.rttRedisMs ?? 140, aplicacion = Math.min(o.aplicacionRedisMs ?? 0, rtt);
  return { ahora, inicioRuta: 100_000, composicionMs: 27_000, eventos: [], turnoRedis: { propietario: "yo", venceEn: ahora + aplicacion + TURNO_MS, generacion: 1 }, fresca: null, ub: "ub-sano", fondo: null, ops: [], rttRedisMs: rtt, liberarFalla: false, liberarPerdida: null, liberarIntentos: 0, publicarRespuestaPerdida: false, corteDuroEn: null, llamadasTmdbTrasPlazo: 0, deteccionMs: 0, ultimaRenovacionEn: null, aplicacionRedisMs: aplicacion, renovacionesPerdidas: {}, demoraFalloMs: 1_000, cliente: { venceEnMin: ahora + TURNO_MS, venceEnMax: ahora + rtt + TURNO_MS }, ...o };
};

test("🔴 RED (control): con plazoFondo = inicioFondo + 50 s a secas, un fondo iniciado a los 15 s cree tener hasta t = 65 s — Vercel mata la invocación a los 60 s", () => {
  const inicioRuta = 100_000, inicioFondo = inicioRuta + 15_000;
  const plazoSoloInterno = inicioFondo + FONDO.PRESUPUESTO_MS;
  assert.equal(plazoSoloInterno - inicioRuta, 65_000, "65 s > maxDuration");
  assert.ok(plazoSoloInterno > inicioRuta + FONDO.MAX_DURATION_MS, "§46 sólo cubría inicioFondo = 0,4 s");
});

test("🟢 (1) fondo iniciado a 0,4 s: limitado por el interno; conserva 50 s; PUBLICAR se inicia dentro del plazo y el turno se libera dentro del propio PUBLICAR", () => {
  const f = fondoMundo({ ahora: 100_400 });
  assert.equal(plazosDelFondo(f.inicioRuta, f.ahora).limitadoPor, "interno"); assert.equal(plazosDelFondo(f.inicioRuta, f.ahora).plazoEfectivo - f.ahora, 50_000);
  assert.equal(iniciarFondo(f), "publicada"); assert.equal(f.fresca, "payload-completo-sano"); assert.equal(f.turnoRedis.propietario, null);
});

test("🟢 (2) fondo iniciado a 15 s: limitado por el techo externo (55 s desde la ruta): le quedan 40 s, no 50", () => {
  const f = fondoMundo({ ahora: 115_000 });
  const p = plazosDelFondo(f.inicioRuta, f.ahora);
  assert.equal(p.limitadoPor, "externo"); assert.equal(p.plazoEfectivo - f.ahora, 40_000);
  assert.equal(iniciarFondo(f), "publicada");
});

test("🟢 (3) presupuesto efectivo insuficiente (fondo a los 40 s: quedan 15 s < 16 + 1 de reserva): UB ya servido, CERO composición, LIBERAR enviado (best effort), `fondo: no-iniciado-presupuesto`; el Home no cambia", () => {
  const f = fondoMundo({ ahora: 140_000 });
  assert.equal(iniciarFondo(f), "ub-servido-sin-fondo");
  assert.equal(f.fresca, null); assert.equal(f.ub, "ub-sano"); assert.equal(f.fondo, "no-iniciado-presupuesto");
  assert.deepEqual(f.ops.map((o) => o.op), ["LIBERAR"]); assert.equal(f.turnoRedis.propietario, null);
});

test("🟢 (4) composición que cruza el plazo efectivo: al vencer la señal NO se inician llamadas nuevas ni PUBLICAR; LIBERAR best effort; nada publicado — sin afirmar que 'todo se detuvo exactamente'", () => {
  const f = fondoMundo({ ahora: 120_000, composicionMs: 40_000 });   // efectivo: externo 155 s → 35 s; la composición pediría 40
  assert.equal(iniciarFondo(f), "cancelada");
  assert.equal(f.fresca, null); assert.equal(f.ub, "ub-sano");
  assert.ok(!f.ops.some((o) => o.op === "PUBLICAR"), "ningún PUBLICAR iniciado después del plazo");
  assert.ok(f.ops.filter((o) => o.op !== "LIBERAR").every((o) => o.enviadaEn < 155_000), "ninguna operación PRODUCTIVA o de publicación en el plazo efectivo ni después (§49; §51: estricto, como el borde de §50.4 — la limpieza LIBERAR es la única excepción)");
  assert.ok(f.ops.some((o) => o.op === "RENOVAR"), "y las renovaciones ANTERIORES al plazo sí existen (§51: el modelo las produce)");
  const g = fondoMundo({ ahora: 120_000, composicionMs: 34_500 });
  assert.equal(iniciarFondo(g), "cancelada"); assert.ok(g.eventos.includes("sin-reserva-para-PUBLICAR")); assert.equal(g.fresca, null);
});

test("🟢 (5) el plazo externo nace al COMIENZO REAL de la ruta: lectura previa 35 s + fondo a 35,4 s → externo desde la ruta (quedan 19,6 s)", () => {
  const inicioRuta = 100_000, inicioFondo = inicioRuta + 35_400;
  const p = plazosDelFondo(inicioRuta, inicioFondo);
  assert.equal(p.limitadoPor, "externo"); assert.equal(p.plazoEfectivo - inicioFondo, 19_600);
  assert.equal(iniciarFondo(fondoMundo({ ahora: inicioFondo, inicioRuta, composicionMs: 18_000 })), "publicada");
  const pMal = plazosDelFondo(inicioRuta + 35_000, inicioFondo);
  assert.equal(pMal.plazoEfectivo - inicioFondo, 50_000, "control: con el inicio mal tomado, 50 s ficticios"); assert.ok(pMal.plazoEfectivo > inicioRuta + FONDO.MAX_DURATION_MS);
});

// ----------------------------------------------------------------- §48: lo que la señal NO controla
test("🟢 (6) PUBLICAR iniciado ANTES del plazo y completado DESPUÉS: la señal no lo cancela; Redis lo ejecuta entero (fresca + UB + generación + DEL) — atómico y con fencing; el resultado es un Home completo y sano", () => {
  const f = fondoMundo({ ahora: 120_000, composicionMs: 33_900, rttRedisMs: 1_500 });   // termina a 153,9 s; la reserva de 1 s cabe (154,9 ≤ 155) → PUBLICAR se envía a 153,9; Redis tarda 1,5 s → completa a 155,4 > plazo 155
  assert.equal(iniciarFondo(f), "publicada");
  const pub = f.ops.find((o) => o.op === "PUBLICAR")!;
  assert.ok(pub.enviadaEn < 155_000 && pub.completaEn > 155_000, "iniciada antes, completada después del plazo efectivo");
  assert.equal(f.fresca, "payload-completo-sano"); assert.equal(f.ub, "payload-completo-sano"); assert.equal(f.turnoRedis.generacion, 2);
});

test("🟢 (7) respuesta de PUBLICAR perdida: Redis la aplicó entera (o no la aplicó): nunca hay escritura parcial ni degradada; el proceso informa `publicacion indeterminada`", () => {
  const f = fondoMundo({ ahora: 100_400, publicarRespuestaPerdida: true });
  assert.equal(iniciarFondo(f), "publicacion-indeterminada");
  const pub = f.ops.find((o) => o.op === "PUBLICAR")!;
  assert.equal(pub.aplicada, true); assert.equal(f.fresca, "payload-completo-sano"); assert.equal(f.ub, "payload-completo-sano");
  // El caso "no aplicada" (la petición nunca llegó): el UB sano queda intacto y el turno vence por TTL.
  const g = fondoMundo({ ahora: 100_400, publicarRespuestaPerdida: true, corteDuroEn: 100_400 + 27_000 });   // muere justo al enviar
  assert.equal(iniciarFondo(g), "no-observable"); assert.equal(g.fresca, null); assert.equal(g.ub, "ub-sano");
});

test("🟢 (8) LIBERAR falla (Redis caído al liberar): el UB queda intacto, nada publicado, y el turno se recupera por TTL (vence solo); el siguiente pedido lo adquiere", () => {
  const f = fondoMundo({ ahora: 140_000, liberarFalla: true });
  assert.equal(iniciarFondo(f), "ub-servido-sin-fondo");
  assert.equal(f.ub, "ub-sano"); assert.equal(f.fresca, null);
  assert.equal(f.turnoRedis.propietario, "yo", "no se pudo liberar");
  f.ahora = f.turnoRedis.venceEn! + 1;                                              // TTL del turno (15 s sin renovar)
  const vencido = f.turnoRedis.venceEn! < f.ahora; assert.equal(vencido, true, "el turno venció por TTL: otro puede adquirirlo");
});

test("🟢 (9) corte duro de Vercel a los 60 s: el resultado NO es observable — no se afirma liberación; el turno vence por TTL; un PUBLICAR ya aceptado por Redis puede haberse aplicado entero", () => {
  const f = fondoMundo({ ahora: 120_000, composicionMs: 45_000, corteDuroEn: 160_000 });
  // La señal vencería a 155 s (externo); pero modelamos que el margen falló y el proceso murió a 160 s con trabajo en vuelo.
  const r = iniciarFondo(f);
  assert.ok(r === "cancelada" || r === "no-observable");
  if (r === "no-observable") { assert.ok(!f.eventos.some((e) => e.startsWith("LIBERAR:enviado")), "sin afirmar liberación"); assert.equal(f.ub, "ub-sano"); }
});

// ----------------------------------------------------------------- §49: la limpieza LIBERAR después del plazo
test("🔴 RED (control, §48 superado): 'ninguna operación de Redis nueva después del plazo' es FALSO en ejecución real — la composición detecta la señal a plazo + 100 ms y la limpieza LIBERAR sale después del plazo", () => {
  const f = fondoMundo({ ahora: 120_000, composicionMs: 40_000, deteccionMs: 100 });   // plazo efectivo 155 s; detecta a 155,1
  const plazo = plazosDelFondo(f.inicioRuta, f.ahora).plazoEfectivo;
  assert.equal(iniciarFondo(f), "cancelada");
  const lib = f.ops.find((o) => o.op === "LIBERAR")!;
  assert.ok(lib.enviadaEn > plazo, `LIBERAR enviado a plazo + ${lib.enviadaEn - plazo} ms: el criterio universal de §48 no se cumple`);
  assert.equal(f.ops.every((o) => o.enviadaEn <= plazo), false, "§48 (control) queda refutado: hace falta la excepción de cierre");
});

test("🟢 (10) criterio de §49: después del plazo efectivo CERO PUBLICAR, ENFRIAR, RENOVAR, TMDB o Supabase; como única excepción, a lo sumo UN LIBERAR dentro del margen externo (<= inicioRuta + 60 s)", () => {
  for (const m of [fondoMundo({ ahora: 100_400 }), fondoMundo({ ahora: 115_000 }), fondoMundo({ ahora: 140_000 }), fondoMundo({ ahora: 120_000, composicionMs: 40_000, deteccionMs: 100 }), fondoMundo({ ahora: 120_000, composicionMs: 33_900, rttRedisMs: 1_500 })]) {
    const plazo = plazosDelFondo(m.inicioRuta, m.ahora).plazoEfectivo;
    iniciarFondo(m);
    const productivas = m.ops.filter((o) => o.op !== "LIBERAR");
    assert.ok(productivas.every((o) => o.enviadaEn < plazo), `productiva/publicación en el plazo o después: ${JSON.stringify(m.ops)}`);
    assert.equal(m.llamadasTmdbTrasPlazo, 0);
    const liberaciones = m.ops.filter((o) => o.op === "LIBERAR");
    assert.ok(liberaciones.length <= 1, "no más de un intento de LIBERAR");
    assert.ok(liberaciones.every((o) => o.enviadaEn <= m.inicioRuta + FONDO.MAX_DURATION_MS), "LIBERAR sólo dentro del margen externo de cierre");
  }
});

test("🟢 (11) exactamente UN LIBERAR si todavía queda margen (detección a plazo + 100 ms, margen hasta +5 s): el turno queda liberado; nada publicado, nada enfriado, UB intacto", () => {
  const f = fondoMundo({ ahora: 120_000, composicionMs: 40_000, deteccionMs: 100 });
  assert.equal(iniciarFondo(f), "cancelada");
  assert.deepEqual(f.ops.filter((o) => o.op !== "RENOVAR").map((o) => o.op), ["LIBERAR"]); assert.equal(f.liberarIntentos, 1);
  assert.equal(f.turnoRedis.propietario, null); assert.equal(f.fresca, null); assert.equal(f.ub, "ub-sano"); assert.equal(f.turnoRedis.generacion, 1);
});

// §51/§52: helper de lectura — el TTL RESTANTE del turno lo DERIVA el modelo de sus propias renovaciones.
// `venceEn` es la VERDAD en Redis (= última APLICACIÓN + 15 s); `cliente` es lo que el proceso puede afirmar.
const ttlRestante = (f: FondoMundo) => {
  const aplicadas = f.ops.filter((o) => o.op === "RENOVAR" && o.aplicada);
  const ultimaAplicacion = aplicadas.length ? aplicadas[aplicadas.length - 1].aplicadaEn! : null;
  return { ultimoEnvio: f.ultimaRenovacionEn!, ultimaAplicacion, venceEn: f.turnoRedis.venceEn!, restante: f.turnoRedis.venceEn! - f.ahora, cliente: f.cliente };
};
// §52: el mismo escenario con Redis aplicando al COMIENZO del RTT y JUSTO ANTES de responder: devuelve el
// intervalo de `restante` que el modelo produce entre los dos extremos (y comprueba que sea monótono).
const intervaloRestante = (base: Partial<FondoMundo>) => {
  const rtt = base.rttRedisMs ?? 140;
  const corridas = [0, Math.floor(rtt / 2), rtt].map((aplicacionRedisMs) => { const f = fondoMundo({ ...base, aplicacionRedisMs }); iniciarFondo(f); return ttlRestante(f); });
  const restantes = corridas.map((c) => c.restante);
  assert.ok(restantes[0] <= restantes[1] && restantes[1] <= restantes[2], "cuanto más tarde aplica Redis, más tarde vence");
  return { min: restantes[0], max: restantes[2], corridas };
};

test("🟢 (12) CERO LIBERAR si ya se alcanzó el corte externo duro (detección a plazo + 5,1 s = inicioRuta + 60,1 s): no se insiste; el turno se recupera EVENTUALMENTE por TTL — el TTL restante sale de las renovaciones que el modelo envió y depende de cuándo las aplicó Redis", () => {
  const f = fondoMundo({ ahora: 120_000, composicionMs: 40_000, deteccionMs: 5_100 });
  assert.equal(iniciarFondo(f), "cancelada");
  assert.deepEqual(f.ops.filter((o) => o.op !== "RENOVAR"), [], "ninguna operación de Redis además de las renovaciones ANTERIORES al plazo");
  assert.ok(f.eventos.includes("LIBERAR:omitido-sin-margen->TTL"));
  assert.equal(f.turnoRedis.propietario, "yo"); assert.equal(f.ub, "ub-sano");
  const { ultimoEnvio, ultimaAplicacion, venceEn, restante } = ttlRestante(f);
  assert.equal(ultimoEnvio, 150_700, "última renovación enviada por el bucle (primer tick a 125 s; después 5 s + RTT 140 ms): 150,7 s < plazo 155 s");
  assert.equal(venceEn, ultimaAplicacion! + TURNO_MS, "GARANTIZADO: el turno vence 15 s después de la APLICACIÓN de esa renovación, no de la toma inicial ni del envío");
  assert.ok(restante > 0, "NO está vencido en el acto: sigue del proceso");
  // Cifra: ESTIMACIÓN para el RTT modelado (140 ms), según dónde dentro del RTT ejecute Redis — no una cota.
  const { min, max } = intervaloRestante({ ahora: 120_000, composicionMs: 40_000, deteccionMs: 5_100 });
  assert.equal(min, 5_600); assert.equal(max, 5_740, "160,1 s → vence entre 165,7 s (aplicó al recibir) y 165,84 s (aplicó al responder)");
});

test("🔴 RED (control): sin guardia, un segundo pedido de limpieza envía un SEGUNDO LIBERAR (misma función que usa iniciarFondo)", () => {
  const f = fondoMundo({ ahora: 140_000 });
  assert.equal(limpiarTurno(f, { sinGuardia: true }), "liberado");
  assert.equal(limpiarTurno(f, { sinGuardia: true }), "liberado");
  assert.equal(f.ops.filter((o) => o.op === "LIBERAR").length, 2, "dos envíos: eso es lo que la guardia impide");
});

test("🟢 (14) con la guardia, dos pedidos de limpieza (dos `finally`) producen UN solo envío — probado llamando dos veces a la misma `limpiarTurno` que usa iniciarFondo", () => {
  const f = fondoMundo({ ahora: 140_000 });
  assert.equal(iniciarFondo(f), "ub-servido-sin-fondo");                       // primer pedido: adentro de iniciarFondo
  assert.equal(limpiarTurno(f), "omitido");                                     // segundo pedido: la misma función, omitido
  assert.equal(f.ops.filter((o) => o.op === "LIBERAR").length, 1); assert.equal(f.liberarIntentos, 1);
  assert.ok(f.eventos.includes("LIBERAR:omitido-ya-intentado"));
});

const soloLiberar = (f: FondoMundo) => f.ops.filter((o) => o.op === "LIBERAR");

test("🟢 (13a) LIBERAR falla (Redis caído): UB, fresca y generación intactos; un solo intento; el turno sigue del proceso y se recupera al vencer el TTL restante que dejaron las renovaciones", () => {
  const a = fondoMundo({ ahora: 120_000, composicionMs: 40_000, deteccionMs: 100, liberarFalla: true });
  assert.equal(iniciarFondo(a), "cancelada"); assert.deepEqual(soloLiberar(a), []); assert.equal(a.liberarIntentos, 1);
  assert.equal(a.ub, "ub-sano"); assert.equal(a.fresca, null); assert.equal(a.turnoRedis.generacion, 1); assert.equal(a.turnoRedis.propietario, "yo");
  const { ultimaAplicacion, venceEn, restante, cliente } = ttlRestante(a);
  assert.equal(venceEn, ultimaAplicacion! + TURNO_MS); assert.equal(restante, TURNO_MS - (a.ahora - ultimaAplicacion!));
  assert.ok(cliente.venceEnMin <= venceEn && venceEn <= cliente.venceEnMax!, "la verdad de Redis cae dentro de lo que el cliente acotó con la última respuesta recibida");
  const { min, max } = intervaloRestante({ ahora: 120_000, composicionMs: 40_000, deteccionMs: 100, liberarFalla: true });
  assert.equal(min, 10_600); assert.equal(max, 10_740, "ESTIMACIÓN (RTT 140 ms): recuperación eventual entre 10,6 y 10,74 s después de la detección, según cuándo aplicó Redis");
});

test("🟢 (13b) respuesta de LIBERAR perdida, variante APLICADA: Redis la ejecutó → el turno ya quedó liberado; sin reintento; fresca, UB y generación intactos", () => {
  const b = fondoMundo({ ahora: 120_000, composicionMs: 40_000, deteccionMs: 100, liberarPerdida: "aplicada" });
  assert.equal(iniciarFondo(b), "cancelada");
  const [lib] = soloLiberar(b); assert.equal(soloLiberar(b).length, 1); assert.equal(lib.respuestaPerdida, true); assert.equal(lib.aplicada, true);
  assert.equal(b.turnoRedis.propietario, null, "liberado aunque el proceso no lo sepa");
  assert.equal(b.liberarIntentos, 1); assert.equal(b.ub, "ub-sano"); assert.equal(b.fresca, null); assert.equal(b.turnoRedis.generacion, 1);
});

test("🟢 (13c) respuesta de LIBERAR perdida, variante NO APLICADA (la petición no llegó): el turno permanece hasta vencer por TTL; sin reintento; fresca, UB y generación intactos — no toda respuesta perdida termina en TTL, pero ésta sí", () => {
  const c = fondoMundo({ ahora: 120_000, composicionMs: 40_000, deteccionMs: 100, liberarPerdida: "no-aplicada" });
  assert.equal(iniciarFondo(c), "cancelada");
  const [lib] = soloLiberar(c); assert.equal(soloLiberar(c).length, 1); assert.equal(lib.respuestaPerdida, true); assert.equal(lib.aplicada, false);
  assert.equal(c.turnoRedis.propietario, "yo", "no liberado: nadie lo sabe");
  assert.equal(c.liberarIntentos, 1); assert.equal(c.ub, "ub-sano"); assert.equal(c.fresca, null); assert.equal(c.turnoRedis.generacion, 1);
  const { ultimaAplicacion, venceEn, restante } = ttlRestante(c);
  assert.ok(restante > 0); assert.equal(venceEn, ultimaAplicacion! + TURNO_MS);
  const { min, max } = intervaloRestante({ ahora: 120_000, composicionMs: 40_000, deteccionMs: 100, liberarPerdida: "no-aplicada" });
  assert.equal(min, 10_600); assert.equal(max, 10_740, "ESTIMACIÓN (RTT 140 ms), no cota");
});

// ----------------------------------------------------------------- §51: las renovaciones las produce el MODELO
test("🔴 RED (control, §50 superado): un bucle que renueva mientras `t <= plazo` envía un RENOVAR EXACTAMENTE en el plazo — con la señal ya vencida", () => {
  const f = fondoMundo({ ahora: 120_000, composicionMs: 40_000, deteccionMs: 100, liberarFalla: true, rttRedisMs: 0 });   // RTT 0 para que un tick caiga justo en 155 s
  const plazo = plazosDelFondo(f.inicioRuta, f.ahora).plazoEfectivo;
  assert.equal(iniciarFondo(f, { renovarEnElPlazo: true }), "cancelada");
  const renovaciones = f.ops.filter((o) => o.op === "RENOVAR").map((o) => o.enviadaEn);
  assert.deepEqual(renovaciones, [125_000, 130_000, 135_000, 140_000, 145_000, 150_000, 155_000]);
  assert.ok(renovaciones.some((t) => !(t < plazo)), "hay un RENOVAR iniciado sin `t < plazo`: viola el contrato de §49 (ningún RENOVAR después del plazo)");
});

test("🟢 (16) renovaciones REALES producidas por el modelo: RENOVAR cada 5 s (+ RTT) mientras se compone, sólo con `t < plazo` (estricto); cada una extiende el turno 15 s desde ESA renovación; la última cae ≤ 5 s + RTT antes del plazo → recuperación eventual ≤ TURNO_MS desde ella", () => {
  const f = fondoMundo({ ahora: 120_000, composicionMs: 40_000, deteccionMs: 100, liberarFalla: true, rttRedisMs: 0 });
  const plazo = plazosDelFondo(f.inicioRuta, f.ahora).plazoEfectivo;                                       // 155 s
  assert.equal(iniciarFondo(f), "cancelada");
  const renovaciones = f.ops.filter((o) => o.op === "RENOVAR");
  assert.deepEqual(renovaciones.map((o) => o.enviadaEn), [125_000, 130_000, 135_000, 140_000, 145_000, 150_000], "seis renovaciones; la de 155 s NO sale: la señal vence en 155 s");
  assert.ok(renovaciones.every((o) => o.enviadaEn < plazo), "ninguna renovación iniciada en el plazo ni después (estricto)");
  assert.ok(f.eventos.includes("RENOVAR:no-enviado@55000:señal-vencida"), "el tick de 155 s se despierta y NO envía");
  assert.ok(renovaciones.every((o) => o.aplicada), "cada una extendió el turno en Redis");
  assert.equal(f.turnoRedis.propietario, "yo");
  const { ultimoEnvio, ultimaAplicacion, venceEn, restante } = ttlRestante(f);
  assert.equal(ultimoEnvio, 150_000); assert.equal(ultimaAplicacion, 150_000, "con RTT 0 envío y aplicación coinciden");
  assert.equal(venceEn, 165_000, "vence 15 s después de la ÚLTIMA aplicación, no 170 s (que suponía una renovación en el plazo)");
  assert.equal(restante, 9_900, "TTL restante desde la detección (155,1 s) — exacto SÓLO porque el RTT modelado es 0");
  assert.ok(plazo - ultimoEnvio <= RENOVACION_MS + f.rttRedisMs, "con este RTT, la última renovación se envía a lo sumo 5 s + RTT antes del plazo");
  assert.equal(venceEn - ultimaAplicacion!, TURNO_MS, "GARANTIZADO: a lo sumo TURNO_MS (15 s) desde la ÚLTIMA renovación APLICADA");
  // Con el RTT modelado (140 ms) los ticks se corren: 125,00 / 130,14 … 150,70; el siguiente (155,84) ya no sale. La garantía no cambia; la cifra pasa a ser un intervalo.
  const g = fondoMundo({ ahora: 120_000, composicionMs: 40_000, deteccionMs: 100, liberarFalla: true });
  assert.equal(iniciarFondo(g), "cancelada");
  assert.deepEqual(g.ops.filter((o) => o.op === "RENOVAR").map((o) => o.enviadaEn), [125_000, 130_140, 135_280, 140_420, 145_560, 150_700]);
  assert.equal(ttlRestante(g).venceEn, ttlRestante(g).ultimaAplicacion! + TURNO_MS);
  const { min, max } = intervaloRestante({ ahora: 120_000, composicionMs: 40_000, deteccionMs: 100, liberarFalla: true });
  assert.equal(min, 10_600); assert.equal(max, 10_740, "ESTIMACIÓN para RTT 140 ms: [10,60; 10,74] s, según dónde dentro del RTT ejecute Redis");
});

// ----------------------------------------------------------------- §52: envío ≠ aplicación en Redis ≠ recepción
test("🔴 RED (control, §51 superado): `venceEn = envío + 15 s` supone que PEXPIRE corre al enviar; el script corre cuando Redis lo ATIENDE — con Redis aplicando al final del RTT, el turno vence más tarde", () => {
  const alComienzo = fondoMundo({ ahora: 120_000, composicionMs: 40_000, deteccionMs: 100, liberarFalla: true, aplicacionRedisMs: 0 });
  const alFinal = fondoMundo({ ahora: 120_000, composicionMs: 40_000, deteccionMs: 100, liberarFalla: true, aplicacionRedisMs: 140 });
  iniciarFondo(alComienzo); iniciarFondo(alFinal);
  const r = alComienzo.ops.find((o) => o.op === "RENOVAR")!;
  assert.equal(typeof r.aplicadaEn, "number", "la operación registra CUÁNDO Redis la aplicó, además de cuándo se envió y cuándo volvió");
  assert.ok(r.enviadaEn <= r.aplicadaEn! && r.aplicadaEn! <= r.completaEn, "aplicación dentro de [envío, recepción]");
  assert.equal(alFinal.turnoRedis.venceEn! - alComienzo.turnoRedis.venceEn!, 140, "mismo envío, 140 ms más tarde de vencimiento: `envío + 15 s` no lo modelaba (RED)");
});

test("🟢 (18a) Redis aplica al COMIENZO del RTT: el turno vence en envío + 15 s; el cliente, que sólo ve envío y recepción, acota [envío + 15 s, recepción + 15 s] y la verdad cae en el extremo inferior", () => {
  const f = fondoMundo({ ahora: 120_000, composicionMs: 40_000, deteccionMs: 100, liberarFalla: true, aplicacionRedisMs: 0 });
  iniciarFondo(f);
  const { ultimoEnvio, ultimaAplicacion, venceEn, cliente } = ttlRestante(f);
  assert.equal(ultimaAplicacion, ultimoEnvio); assert.equal(venceEn, ultimoEnvio + TURNO_MS);
  assert.deepEqual(cliente, { venceEnMin: 150_700 + TURNO_MS, venceEnMax: 150_840 + TURNO_MS }); assert.equal(venceEn, cliente.venceEnMin);
});

test("🟢 (18b) Redis aplica JUSTO ANTES de responder: el turno vence en recepción + 15 s; misma cota del cliente, y la verdad cae en el extremo superior", () => {
  const f = fondoMundo({ ahora: 120_000, composicionMs: 40_000, deteccionMs: 100, liberarFalla: true, aplicacionRedisMs: 140 });
  iniciarFondo(f);
  const { ultimoEnvio, ultimaAplicacion, venceEn, cliente } = ttlRestante(f);
  assert.equal(ultimaAplicacion, ultimoEnvio + 140); assert.equal(venceEn, ultimoEnvio + 140 + TURNO_MS);
  assert.deepEqual(cliente, { venceEnMin: 150_700 + TURNO_MS, venceEnMax: 150_840 + TURNO_MS }); assert.equal(venceEn, cliente.venceEnMax);
  assert.deepEqual(f.ops.filter((o) => o.op === "RENOVAR").map((o) => o.enviadaEn), [125_000, 130_140, 135_280, 140_420, 145_560, 150_700], "el calendario de envíos no depende de dónde aplique Redis: depende de cuándo VUELVE la respuesta");
});

test("🟢 (18c) respuesta exitosa: para CUALQUIER instante de aplicación dentro del RTT, la verdad de Redis cae en [envío + 15 s, recepción + 15 s]; ese intervalo es lo único que el cliente puede afirmar", () => {
  for (const aplicacionRedisMs of [0, 1, 35, 70, 105, 139, 140]) {
    const f = fondoMundo({ ahora: 120_000, composicionMs: 40_000, deteccionMs: 100, liberarFalla: true, aplicacionRedisMs });
    iniciarFondo(f);
    const { venceEn, cliente, ultimoEnvio } = ttlRestante(f);
    assert.ok(cliente.venceEnMin <= venceEn && venceEn <= cliente.venceEnMax!, `aplicación a +${aplicacionRedisMs} ms: ${venceEn} ∉ [${cliente.venceEnMin}, ${cliente.venceEnMax}]`);
    assert.equal(cliente.venceEnMax! - cliente.venceEnMin, f.rttRedisMs, "el ancho del intervalo es exactamente el RTT de ESA renovación");
    assert.equal(cliente.venceEnMin, ultimoEnvio + TURNO_MS);
  }
  // Y el intervalo del TTL restante para el RTT modelado (140 ms), detección a 155,1 s: [10,60; 10,74] s — estimación, no cota.
  const { min, max } = intervaloRestante({ ahora: 120_000, composicionMs: 40_000, deteccionMs: 100, liberarFalla: true });
  assert.equal(min, 10_600); assert.equal(max, 10_740);
  // Con otro RTT el intervalo es OTRO: el RTT modelado no es una cota de nada.
  const lento = intervaloRestante({ ahora: 120_000, composicionMs: 40_000, deteccionMs: 100, liberarFalla: true, rttRedisMs: 1_000 });
  assert.notEqual(lento.min, min); assert.equal(lento.max - lento.min, 1_000);
});

test("🟢 (18d) respuesta de RENOVAR perdida (`indeterminado`): el cliente NO puede afirmar un TTL exacto — conserva el mínimo de la última respuesta recibida y pierde la cota superior; en Redis la renovación se aplicó o no, y el modelo distingue las dos", () => {
  for (const variante of ["aplicada", "no-aplicada"] as const) {
    for (const aplicacionRedisMs of [0, 140]) {
      const f = fondoMundo({ ahora: 120_000, composicionMs: 40_000, deteccionMs: 100, liberarFalla: true, aplicacionRedisMs, renovacionesPerdidas: { 6: variante } });
      assert.equal(iniciarFondo(f), "cancelada");
      const rs = f.ops.filter((o) => o.op === "RENOVAR");
      assert.equal(rs.length, 6); assert.equal(rs[5].respuestaPerdida, true); assert.equal(rs[5].aplicada, variante === "aplicada");
      assert.ok(f.eventos.includes("RENOVAR:indeterminado@50700"));
      const { venceEn, cliente } = ttlRestante(f);
      assert.equal(cliente.venceEnMax, null, "sin cota superior desde el cliente: no sabe si el sexto RENOVAR se aplicó ni cuándo");
      assert.equal(cliente.venceEnMin, rs[4].enviadaEn + TURNO_MS, "el mínimo es el de la ÚLTIMA respuesta recibida (el quinto RENOVAR)");
      assert.ok(cliente.venceEnMin <= venceEn, "la verdad nunca está por debajo de lo que el cliente afirma");
      if (variante === "aplicada") assert.equal(venceEn, rs[5].aplicadaEn! + TURNO_MS, "aplicada: vence 15 s después de ESA aplicación, que el cliente no conoce");
      else assert.equal(venceEn, rs[4].aplicadaEn! + TURNO_MS, "no aplicada: vence 15 s después de la aplicación ANTERIOR");
      assert.equal(f.turnoRedis.propietario, "yo"); assert.ok(venceEn > f.ahora, "recuperación eventual por TTL en los dos casos");
    }
  }
});

test("🟢 (18e) la vuelta siguiente se programa al TERMINAR la anterior (respuesta recibida o dada por perdida), como en el bucle real: con una respuesta perdida que tarda 1 s en rendirse, el tick siguiente se corre 1 s", () => {
  const normal = fondoMundo({ ahora: 120_000, composicionMs: 40_000, deteccionMs: 100, liberarFalla: true });
  const conPerdida = fondoMundo({ ahora: 120_000, composicionMs: 40_000, deteccionMs: 100, liberarFalla: true, renovacionesPerdidas: { 2: "aplicada" }, demoraFalloMs: 1_000 });
  iniciarFondo(normal); iniciarFondo(conPerdida);
  const envios = (f: FondoMundo) => f.ops.filter((o) => o.op === "RENOVAR").map((o) => o.enviadaEn);
  assert.deepEqual(envios(normal), [125_000, 130_140, 135_280, 140_420, 145_560, 150_700]);
  assert.deepEqual(envios(conPerdida), [125_000, 130_140, 136_140, 141_280, 146_420, 151_560], "desde el tercero, +860 ms (1 s de espera en vez de 140 ms de RTT); todos siguen antes del plazo");
  const lento = fondoMundo({ ahora: 120_000, composicionMs: 40_000, deteccionMs: 100, liberarFalla: true, rttRedisMs: 1_500 });
  iniciarFondo(lento);
  assert.deepEqual(envios(lento), [125_000, 131_500, 138_000, 144_500, 151_000], "RTT 1,5 s: cinco renovaciones, cada una 6,5 s después del envío anterior");
});

test("🟢 (18f) ningún RENOVAR se inicia en el plazo efectivo ni después, con cualquier RTT, demora de fallo o instante de aplicación", () => {
  for (const rttRedisMs of [0, 140, 1_000, 4_290]) for (const aplicacionRedisMs of [0, rttRedisMs]) for (const perdidas of [{}, { 3: "no-aplicada" }] as Record<number, "aplicada" | "no-aplicada">[]) {
    const f = fondoMundo({ ahora: 120_000, composicionMs: 40_000, deteccionMs: 100, liberarFalla: true, rttRedisMs, aplicacionRedisMs, renovacionesPerdidas: perdidas, demoraFalloMs: 4_290 });
    const plazo = plazosDelFondo(f.inicioRuta, f.ahora).plazoEfectivo;
    iniciarFondo(f);
    assert.ok(f.ops.filter((o) => o.op === "RENOVAR").every((o) => o.enviadaEn < plazo), `rtt ${rttRedisMs}: ${JSON.stringify(f.ops.map((o) => o.enviadaEn))}`);
  }
});

test("🟢 (16b) sin composición (presupuesto insuficiente) o con una composición más corta que 5 s no hay ninguna renovación, y el turno vence 15 s después de tomarlo", () => {
  const sinFondo = fondoMundo({ ahora: 140_000 });
  assert.equal(iniciarFondo(sinFondo), "ub-servido-sin-fondo"); assert.equal(sinFondo.ops.filter((o) => o.op === "RENOVAR").length, 0); assert.equal(sinFondo.ultimaRenovacionEn, null);
  const corta = fondoMundo({ ahora: 100_400, composicionMs: 4_000 });
  assert.equal(iniciarFondo(corta), "publicada"); assert.equal(corta.ops.filter((o) => o.op === "RENOVAR").length, 0);
});

test("🟢 (17) borde de maxDuration, comparación ESTRICTA: a límite − 1 ms se envía LIBERAR; exactamente en el límite y a +1 ms no", () => {
  const limite = 100_000 + FONDO.MAX_DURATION_MS;                              // 160 s
  for (const [ahora, esperado] of [[limite - 1, 1], [limite, 0], [limite + 1, 0]] as const) {
    const f = fondoMundo({ ahora: 120_000, composicionMs: 40_000, deteccionMs: ahora - 155_000 });   // plazo efectivo 155 s; detección en `ahora`
    assert.equal(iniciarFondo(f), "cancelada");
    assert.equal(f.ahora, ahora);
    assert.equal(f.ops.filter((o) => o.op === "LIBERAR").length, esperado, `ahora = límite ${ahora - limite >= 0 ? "+" : ""}${ahora - limite} ms`);
    if (esperado === 0) assert.ok(f.eventos.includes("LIBERAR:omitido-sin-margen->TTL"));
  }
});

test("🟢 (15) PUBLICAR aceptado antes del plazo conserva la semántica atómica ya definida (§48): fresca + UB + generación + DEL, entero o nada; y tras un PUBLICAR no hay LIBERAR aparte", () => {
  const f = fondoMundo({ ahora: 120_000, composicionMs: 33_900, rttRedisMs: 1_500 });
  assert.equal(iniciarFondo(f), "publicada");
  assert.deepEqual(f.ops.filter((o) => o.op !== "RENOVAR").map((o) => o.op), ["PUBLICAR"]); assert.equal(f.turnoRedis.propietario, null); assert.equal(f.turnoRedis.generacion, 2);
  assert.deepEqual(f.ops.filter((o) => o.op === "RENOVAR").map((o) => o.enviadaEn), [125_000, 131_500, 138_000, 144_500, 151_000], "las renovaciones de la composición (5 s + RTT 1,5 s), todas antes del PUBLICAR y del plazo");
});

test("🟢 el mismo `inicio` alimenta los tres plazos: plazo de la solicitud (§46), plazo externo del fondo y señal — un solo instante, tomado antes de la lectura previa", () => {
  const inicio = 100_000;
  const plazoSolicitud = inicio + FONDO.PRESUPUESTO_MS, plazoExterno = inicio + FONDO.MAX_DURATION_MS - FONDO.MARGEN_CIERRE_MS;
  assert.equal(plazoSolicitud, 150_000); assert.equal(plazoExterno, 155_000);
  assert.ok(plazoExterno > plazoSolicitud, "el fondo puede vivir hasta 5 s más que la solicitud, nunca más allá de la reserva de cierre");
});
