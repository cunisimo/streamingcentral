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
// UN solo sueño acotado, UNA sola readquisición, ≤ 2 EVAL por solicitud; la
// cancelación se propaga (no es un 503); la pausa LOCAL manda si Redis no
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
  abortarEn: number | null;
  evalCount: number;
  jitterMs: number;
}
type Salida = { status: 200; motivo: string; esperadoMs: number } | { status: 503; retryAfter: number; motivo: string } | { cancelada: true; esperadoMs: number };
const s503 = (retryAfter: number, motivo: string): Salida => ({ status: 503, retryAfter: Math.max(1, retryAfter), motivo });
async function servirSinUB(m: Mundo, presupuestoYaGastadoMs = 0): Promise<Salida> {
  const t0 = m.ahora - presupuestoYaGastadoMs;
  const presupuestoRestante = () => PRESUPUESTO_MS - (m.ahora - t0);
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
  const cabeEnPresupuesto = presupuestoRestante() - (restante + JITTER_MAX_MS + T_ADQ_MAX_MS) >= COMPOSICION_MAX_MS;   // §43.4
  if (!cabeEnEspera) return s503(Math.ceil(restante / 1000), "pausa-continua");
  if (!cabeEnPresupuesto) return s503(Math.ceil(restante / 1000), "presupuesto-insuficiente");
  // UN solo sueño, cancelable: el abort del cliente lo corta y se PROPAGA (no es una respuesta).
  const dormirMs = restante + m.jitterMs;
  if (m.abortarEn !== null && m.abortarEn < m.ahora + dormirMs) { const esperado = m.abortarEn - m.ahora; m.ahora = m.abortarEn; return { cancelada: true, esperadoMs: esperado }; }
  m.ahora += dormirMs;
  const r2 = conPausaLocal(adquirir(true));                                     // EVAL 2 — el último de la solicitud
  if (r2.estado === "indeterminado") {
    // §43.5: la pausa pudo extenderse mientras dormíamos; fallback CONSERVADOR: nunca menor que el default de la app.
    return s503(Math.max(RETRY_AFTER_FALLBACK_S, Math.ceil(Math.max(0, restante - dormirMs) / 1000)), "pausa-indeterminada");
  }
  return terminar(r2, dormirMs);
}
const mundo = (o: Partial<Mundo> = {}): Mundo => ({ ahora: 100_000, pausaHasta: null, pausaLocalHasta: null, hayUB: false, turnoLibre: true, redis: "ok", composiciones: 0, abortarEn: null, evalCount: 0, jitterMs: 100, ...o });

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

test("🟢 (3) el cliente abandona durante el sueño: se corta el sueño, no adquiere, no compone, y la cancelación se PROPAGA (no hay 503 ni error registrado)", async () => {
  const m = mundo({ pausaHasta: 100_000 + 4000, abortarEn: 100_000 + 1500 });
  const r = await servirSinUB(m);
  assert.deepEqual(r, { cancelada: true, esperadoMs: 1500 });
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

test("🟢 (6) presupuesto: incluye restante + jitter máximo + timeout de la readquisición + composición; con 30 s gastados y 2 s de pausa: 50 − 30 − (2 + 0,25 + 2) = 15,75 < 16 → 503 sin dormir", async () => {
  const m = mundo({ pausaHasta: 100_000 + 2000 });
  assert.deepEqual(await servirSinUB(m, 30_000), s503(2, "presupuesto-insuficiente"));
  assert.equal(m.evalCount, 1);
  // Con 29 s gastados sí cabe (16,75 ≥ 16): duerme y compone.
  const m2 = mundo({ pausaHasta: 100_000 + 2000 });
  assert.equal((await servirSinUB(m2, 29_000) as any).motivo, "compuesta");
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
    assert.ok(("status" in r && (r.status === 503 || r.motivo === "compuesta")) || "cancelada" in r, JSON.stringify(r));
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
