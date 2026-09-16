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
