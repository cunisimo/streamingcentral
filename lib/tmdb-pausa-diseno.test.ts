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
const CFG = { K: 24 /* sólo el control ingenuo */, deltaMs: 1000, timeoutMs: 1000, fallosMax: 3, enfriamientoMs: 30_000 };
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

test("🟢 Redis LENTO (RTT 3 s > timeout 1 s): nunca más de una en curso; el intervalo cuenta desde el inicio; cada lectura vence al timeout y cuenta como fallida; tras 3 seguidas, enfriamiento de 30 s", () => {
  const L = crearLector({ tipo: "lento", rttMs: 3000 });
  correr(L, 60);
  assert.equal(L.maxEnCurso, 1);
  // t=0..1 falla 1, t=1..2 falla 2, t=2..3 falla 3 → enfriado hasta 33; 33..36 otras 3 → enfriado hasta 66.
  assert.equal(L.fallidas, 6, `fallidas ${L.fallidas}`);
  assert.equal(L.iniciadas, 6);
});

test("🟢 Redis COLGADO (nunca responde): exactamente fallosMax lecturas por ventana de enfriamiento; con timeout 1 s y enfriamiento 30 s son 6 en 60 s, no 2.100", () => {
  const L = crearLector({ tipo: "colgado", rttMs: 0 });
  correr(L, 60);
  assert.equal(L.maxEnCurso, 1);
  assert.equal(L.iniciadas, 6);
  assert.equal(L.fallidas, 6);
});

test("🟢 Redis CAÍDO (error inmediato): tampoco una lectura por permiso — el máximo exacto es fallosMax por ventana", () => {
  const L = crearLector({ tipo: "caido", rttMs: 0 });
  correr(L, 60);
  assert.equal(L.iniciadas, 6, `iniciadas ${L.iniciadas}`);
  assert.equal(L.maxEnCurso, 1);
});

test("🟢 Redis se recupera: al terminar el enfriamiento vuelve a leer y, con respuesta, el contador de fallos se reinicia", () => {
  const redis: Redis = { tipo: "colgado", rttMs: 0 };
  const L = crearLector(redis);
  correr(L, 33);                     // 3 fallidas + enfriamiento de 30 s
  redis.tipo = "normal"; redis.rttMs = 40;
  correr(L, 10);
  assert.ok(L.resultados >= 9, `resultados ${L.resultados}`);
  assert.equal(L.fallidas, 3);
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
// §42 (decisión del dueño): sin UB y con pausa NO se responde 503 en el acto —
// se espera un período BREVE y ACOTADO a que la pausa termine. Modelo con reloj
// virtual de la decisión que irá en `servirConTurno`.
// =============================================================================
//
// Regla (§42.2): la espera NO es un sondeo: la adquisición del turno (script
// atómico) ya devuelve `pausado` con el PTTL restante. Si `restante` cabe en
// lo que queda de ESPERA_MAX y el presupuesto de la solicitud deja lugar para
// esperar Y componer, se duerme exactamente `restante + jitter` (cancelable
// por la señal) y se vuelve a ADQUIRIR (que re-comprueba la pausa en el mismo
// script). Redis: 1 EVAL por intento de adquisición, ninguno durante el sueño.
const ESPERA_MAX_MS = 5_000;          // = REINTENTAR_POR_DEFECTO_MS de lib/tmdb-http.ts (§42.3)
const COMPOSICION_MAX_MS = 16_000;    // CONSTANTES.COMPOSICION_MAX_MS
const PRESUPUESTO_MS = 50_000;        // CONSTANTES.PRESUPUESTO_REQUEST_MS
type Adq = { estado: "adquirido" } | { estado: "ocupado" } | { estado: "sin-redis" } | { estado: "pausado"; restanteMs: number };
interface Mundo {
  ahora: number;                                  // reloj virtual (ms)
  pausaHasta: number | null;                      // instante en que la pausa vence (reloj de "Redis" del modelo)
  turnoLibre: boolean;
  redis: "ok" | "caido" | "lento";               // lento: la adquisición tarda 3 s
  composiciones: number;
  abortarEn: number | null;                       // instante en que el cliente abandona
  evalCount: number;
  jitterMs: number;
}
const SALIDA_503 = (retryAfterS: number, motivo: string) => ({ status: 503, retryAfter: retryAfterS, motivo });
async function servirSinUB(m: Mundo, presupuestoYaGastadoMs = 0) {
  const t0 = m.ahora - presupuestoYaGastadoMs;
  const senalAbortada = () => m.abortarEn !== null && m.ahora >= m.abortarEn;
  const adquirir = (): Adq => {
    m.evalCount += 1;
    if (m.redis === "caido") return { estado: "sin-redis" };
    if (m.redis === "lento") m.ahora += 3000;
    if (m.pausaHasta !== null && m.pausaHasta > m.ahora) return { estado: "pausado", restanteMs: m.pausaHasta - m.ahora };
    if (!m.turnoLibre) return { estado: "ocupado" };
    m.turnoLibre = false; return { estado: "adquirido" };
  };
  let esperadoMs = 0;
  let r = adquirir();
  for (;;) {
    if (r.estado === "adquirido") {
      if (PRESUPUESTO_MS - (m.ahora - t0) < COMPOSICION_MAX_MS) { m.turnoLibre = true; return SALIDA_503(1, "espera-agotada"); }
      m.composiciones += 1; m.turnoLibre = true; return { status: 200, motivo: "compuesta", esperadoMs };
    }
    if (r.estado === "ocupado") return { status: 200, motivo: "compartida", esperadoMs };       // el bucle de espera compartida de hoy (esperada/UB)
    if (r.estado === "sin-redis") return { status: 200, motivo: "sin-redis", esperadoMs };      // hoy: compone sin turno, no publica
    // pausado
    const restante = r.restanteMs;
    const cabeEnEspera = esperadoMs + restante <= ESPERA_MAX_MS;
    const cabeEnPresupuesto = PRESUPUESTO_MS - (m.ahora - t0) - restante >= COMPOSICION_MAX_MS;
    if (!cabeEnEspera || !cabeEnPresupuesto) return SALIDA_503(Math.max(1, Math.ceil(restante / 1000)), !cabeEnEspera ? "pausa-continua" : "presupuesto-insuficiente");
    // dormir(restante + jitter, señal): cancelable
    const dormirMs = restante + m.jitterMs;
    if (m.abortarEn !== null && m.abortarEn < m.ahora + dormirMs) { m.ahora = m.abortarEn; return SALIDA_503(Math.max(1, Math.ceil((m.pausaHasta! - m.ahora) / 1000)), "cancelada"); }   // el cliente ya no está: el Retry-After es sólo por contrato
    m.ahora += dormirMs; esperadoMs += dormirMs;
    if (senalAbortada()) return SALIDA_503(1, "cancelada");
    r = adquirir();   // re-comprueba la pausa en el MISMO script; el Retry-After que siga sale de este PTTL fresco
  }
}
const mundo = (o: Partial<Mundo> = {}): Mundo => ({ ahora: 100_000, pausaHasta: null, turnoLibre: true, redis: "ok", composiciones: 0, abortarEn: null, evalCount: 0, jitterMs: 100, ...o });

test("🟢 (1) la pausa termina durante la espera: se duerme exactamente lo que faltaba (+jitter), se readquiere y se compone; 2 EVAL, ninguna lectura durante el sueño", async () => {
  const m = mundo({ pausaHasta: 100_000 + 2300 });
  const r = await servirSinUB(m);
  assert.deepEqual(r, { status: 200, motivo: "compuesta", esperadoMs: 2400 });
  assert.equal(m.composiciones, 1);
  assert.equal(m.evalCount, 2);
});

test("🟢 (2) la pausa continúa (restante > ESPERA_MAX): 503 en el acto con Retry-After = ⌈restante⌉, sin dormir, 1 EVAL", async () => {
  const m = mundo({ pausaHasta: 100_000 + 8000 });
  assert.deepEqual(await servirSinUB(m), SALIDA_503(8, "pausa-continua"));
  assert.equal(m.evalCount, 1);
  assert.equal(m.composiciones, 0);
});

test("🟢 (2b) la pausa se EXTIENDE durante la espera (otro 429): tras dormir, la readquisición la ve con más restante; si ya no cabe en lo que queda de ESPERA_MAX → 503 con el Retry-After NUEVO", async () => {
  const m = mundo({ pausaHasta: 100_000 + 2000 });
  // Simular la extensión: al despertar (t=102.100), la pausa vence a 102.100 + 4.000.
  const original = m.pausaHasta!;
  const adquirirExtendida = { hecho: false };
  const mm: Mundo = new Proxy(m, { get(t, k) { if (k === "pausaHasta" && t.ahora > original && !adquirirExtendida.hecho) { adquirirExtendida.hecho = true; t.pausaHasta = t.ahora + 4000; } return (t as any)[k]; } });
  const r = await servirSinUB(mm);
  assert.deepEqual(r, SALIDA_503(4, "pausa-continua"));   // esperó 2,1 s; 2,1 + 4 > 5
  assert.equal(m.composiciones, 0);
});

test("🟢 (3) el cliente abandona mientras espera: la espera se corta en el acto (dormir con señal), sin componer y sin 200 vacío", async () => {
  const m = mundo({ pausaHasta: 100_000 + 4000, abortarEn: 100_000 + 1500 });
  const r = await servirSinUB(m);
  assert.equal(r.status, 503);
  assert.equal(r.motivo, "cancelada");
  assert.equal(m.ahora, 101_500, "no siguió durmiendo después del abort");
  assert.equal(m.composiciones, 0);
});

test("🟢 (4a) Redis CAÍDO: la adquisición devuelve sin-redis y se sigue el camino de hoy (componer sin turno, no publicar); no hay espera", async () => {
  const m = mundo({ redis: "caido", pausaHasta: 100_000 + 2000 });
  assert.deepEqual(await servirSinUB(m), { status: 200, motivo: "sin-redis", esperadoMs: 0 });
});

test("🟢 (4b) Redis LENTO (3 s por EVAL): la espera cuenta contra el presupuesto; la regla sigue siendo 2 EVAL como máximo por pausa", async () => {
  const m = mundo({ redis: "lento", pausaHasta: 100_000 + 5000 });
  const r = await servirSinUB(m);
  // t=103.000 tras el 1er EVAL: restante 2.000 → cabe; duerme 2.100 → 105.100; 2º EVAL tarda 3 s → 108.100; pausa vencida → adquiere y compone.
  assert.equal(r.status, 200); assert.equal(r.motivo, "compuesta");
  assert.equal(m.evalCount, 2);
});

test("🟢 (4c) indeterminado: un `restante` que no es un entero (SDK con señal abortada devuelve 'Aborted') se trata como sin-redis, nunca como 'sin pausa'", () => {
  const interpretar = (v: unknown): Adq => Number.isInteger(v) ? (v as number) > 0 ? { estado: "pausado", restanteMs: v as number } : { estado: "adquirido" } : { estado: "sin-redis" };
  assert.deepEqual(interpretar("Aborted"), { estado: "sin-redis" });
  assert.deepEqual(interpretar(null), { estado: "sin-redis" });
  assert.deepEqual(interpretar(-2), { estado: "adquirido" });
  assert.deepEqual(interpretar(1500), { estado: "pausado", restanteMs: 1500 });
});

test("🟢 (5) varias solicitudes sin UB esperando a la vez: todas duermen lo mismo (+jitter propio), una adquiere y compone, las demás caen en la espera compartida — UNA composición", async () => {
  const comp = { total: 0 };
  const base: Mundo = mundo({ pausaHasta: 100_000 + 1500 });
  const resultados = [];
  for (const jitter of [0, 50, 100, 150]) {
    const m: Mundo = { ...base, jitterMs: jitter, composiciones: 0 };
    // Comparten el turno y la pausa: se emula con el mismo objeto de turno.
    Object.defineProperty(m, "turnoLibre", { get: () => base.turnoLibre, set: (v) => { base.turnoLibre = v; } });
    const r = await servirSinUB(m);
    // El primero que despierta adquiere (turno libre → false) y compone; en este modelo secuencial libera al terminar,
    // así que para reproducir la concurrencia real se cuenta la composición sólo si el turno estaba libre al despertar.
    resultados.push(r.motivo);
    if (r.motivo === "compuesta") { comp.total += 1; base.turnoLibre = false; }   // el ganador retiene el turno hasta publicar
  }
  assert.deepEqual(resultados, ["compuesta", "compartida", "compartida", "compartida"]);
  assert.equal(comp.total, 1);
});

test("🟢 (6) presupuesto insuficiente para esperar y componer: 503 en el acto con Retry-After = ⌈restante⌉ aunque la pausa sea corta", async () => {
  const m = mundo({ pausaHasta: 100_000 + 2000 });
  const r = await servirSinUB(m, 33_000);   // ya gastó 33 s: 50 − 33 − 2 = 15 < 16
  assert.deepEqual(r, SALIDA_503(2, "presupuesto-insuficiente"));
  assert.equal(m.composiciones, 0);
});

test("🟢 (7) Retry-After descuenta lo esperado: es el PTTL FRESCO de la readquisición, no el inicial", async () => {
  // Pausa de 4 s; ESPERA_MAX 5 s ⇒ se espera; al despertar apareció otra pausa de 6 s (extensión) ⇒ 503 con Retry-After 6, no 4 ni 10.
  const m = mundo({ pausaHasta: 100_000 + 4000 });
  let readquisiciones = 0;
  const mm = new Proxy(m, { get(t, k) { if (k === "pausaHasta" && t.ahora >= 104_000 && readquisiciones === 0) { readquisiciones += 1; t.pausaHasta = t.ahora + 6000; } return (t as any)[k]; } });
  const r = await servirSinUB(mm);
  assert.deepEqual(r, SALIDA_503(6, "pausa-continua"));
});

test("🟢 (8) ninguna composición duplicada cuando termina la pausa: la readquisición es el mismo SET NX de siempre", async () => {
  const base = mundo({ pausaHasta: 100_000 + 1000 });
  const a: Mundo = { ...base }, b: Mundo = { ...base };
  Object.defineProperty(b, "turnoLibre", { get: () => a.turnoLibre, set: (v) => { a.turnoLibre = v; } });
  const ra = await servirSinUB(a); a.turnoLibre = false;   // A retiene el turno mientras compone
  const rb = await servirSinUB(b);
  assert.equal(ra.motivo, "compuesta"); assert.equal(rb.motivo, "compartida");
  assert.equal(a.composiciones + b.composiciones, 1);
});

test("🟢 nunca 50 s ni un Home vacío con 200: la espera máxima es ESPERA_MAX + jitter, y todo lo que no compone es 503", async () => {
  for (const restante of [500, 2000, 4999, 5000, 5001, 8000, 30_000]) {
    const m = mundo({ pausaHasta: 100_000 + restante, jitterMs: 250 });
    const t0 = m.ahora; const r = await servirSinUB(m);
    assert.ok(m.ahora - t0 <= ESPERA_MAX_MS + 250, `esperó ${m.ahora - t0} ms con restante ${restante}`);
    assert.ok(r.status === 503 || r.motivo === "compuesta", JSON.stringify(r));
  }
});
