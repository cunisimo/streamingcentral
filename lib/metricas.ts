// Métricas POR SOLICITUD, sin mezclar unidades. Etapa 0 de capacidad (#20).
//
// ============================================================================
// POR QUÉ EXISTE, Y POR QUÉ ES UN MÓDULO APARTE
// ============================================================================
// Hasta la Etapa 0, `CacheMetrics` vivía en lib/cache.ts y contaba SÓLO Redis;
// además llamaba `requests` a tres cosas distintas: la llamada lógica que hizo
// el código, los intentos HTTP que salieron al cable (el SDK de Upstash
// reintenta hasta 6 veces) y los comandos que factura Upstash. No había
// contador de llamadas a TMDB, de consultas a Supabase ni de composiciones del
// Home. Con eso, las etapas siguientes del plan de capacidad se evaluarían a
// ciegas: "una sola composición por clave" no se puede comprobar contando
// HIT/MISS, porque en cuanto entre el single-flight un lector que ESPERA a otro
// va a parecer un HIT.
//
// Es un módulo sin `server-only` y sin imports de runtime salvo
// `node:async_hooks` (igual que lib/idioma.ts): para poder EJECUTARLO desde
// `node --test`. lib/cache.ts, lib/tmdb.ts y lib/home.ts sólo anotan acá.
//
// ============================================================================
// EL MECANISMO: AsyncLocalStorage, Y SUS LÍMITES
// ============================================================================
// Un contador de módulo mezclaría los números de los requests que conviven en
// la misma instancia. `AsyncLocalStorage` da un contador por scope y lo propaga
// por `await`, promesas y `queueMicrotask`. Dos límites, medidos en
// lib/metricas.test.ts:
//
//   1. Un callback hereda el contexto de QUIEN LO PROGRAMÓ, no de quien lo
//      necesitaba. Es el caso del batcher de lib/cache.ts: el flush corre en el
//      contexto de la solicitud que lo programó. Por eso existen `capturar` y
//      `anotarEn`: quien pide una clave captura su contador al encolar, y el
//      flush le anota a ÉL sus hits/misses. Lo que queda a nombre de quien
//      programó es sólo el viaje HTTP del MGET, que es uno para todos.
//   2. Lo que corre fuera de un scope no se anota (y no rompe). Las rutas que no
//      abren un scope no miden nada.
//
// Lo que NO se cambia acá: la decisión de `cachedIf` (un Home degradado sigue
// sin guardarse), las claves, el contenido del Home ni el contrato HTTP.
import { AsyncLocalStorage } from "node:async_hooks";

export type ClaseHttp = "ok" | "http429" | "http5xx" | "http4xx";

export interface MetricasRequest {
  home: {
    /**
     * Qué pasó con la clave del Home: `"hit"` (estaba en caché), `"miss"` (esta
     * solicitud la produjo), `"compartida"` (esperó la composición de OTRA
     * solicitud del mismo proceso: single-flight, Etapa 1) o `null` si no llegó
     * a decidir. Son estados distintos y ninguno se deduce de otro.
     */
    cache: "hit" | "miss" | "compartida" | "ultimo-bueno" | "esperada" | "vacio" | "degradado-compartida" | null;
    /** Composiciones del Home EJECUTADAS por esta solicitud. Se cuenta donde corre `composeHome`, no se deduce del MISS. */
    composiciones: number;
    /**
     * Veces que esta solicitud ESPERÓ una composición ajena: 0 si no esperó
     * (HIT, o compuso ella misma); 1 en los seguidores del single-flight del
     * Home (Etapa 1, lib/home-vuelo.ts), que reciben la promesa del líder sin
     * producir ni escribir. Se anota explícitamente; no se deduce de HIT/MISS.
     */
    esperasCompartidas: number;
    /** El payload salió degradado (alguna fuente cayó). */
    degradado: boolean;
    /** Fuentes del composer que fallaron (lo que ya viaja como `fallos` en el payload). */
    fuentesCaidas: number;
    // --- Etapa 2 (#17): turno distribuido y último bueno (lib/home-servir.ts) ---
    /** Qué pasó con el turno de composición de la clave. `reconciliado` = adquirido tras una respuesta perdida. */
    turno: "adquirido" | "reconciliado" | "ocupado" | "sin-redis" | null;
    /** De dónde salió lo que se sirvió. */
    origen: "fresca" | "fresca-tras-turno" | "ultimo-bueno" | "ultimo-bueno-fondo" | "esperada" | "propia" | "propia-sin-publicar"
      | "degradado-propio" | "degradado-compartido" | "sin-redis" | "vacio-espera-agotada" | "vacio-cancelada" | "compartida" | null;
    /** Etapa 3.b: la solicitud respondió el UB y dejó la composición registrada en fondo. */
    fondo: "programado" | null;
    /** Resultado de PUBLICAR, si se intentó. */
    publicacion: "publicado" | "publicada-solo-fresca" | "rechazado" | "indeterminado" | null;
    renovaciones: number;
    /** RENOVAR devolvió 0 durante la composición: se siguió componiendo sin publicar. */
    turnoPerdido: boolean;
    /** Cuánto esperó una solicitud sin turno y sin último bueno. */
    esperaMs: number;
    /** Compuso un degradado pero había último bueno: se sirvió el último bueno. */
    degradadoDescartado: boolean;
    /** El turno pasó a `enfriando:` (ENFRIAR) tras un degradado. */
    enfriado: boolean;
    /** La señal de la solicitud abortó la composición. */
    cancelada: boolean;
    /** El productor RECHAZÓ (no degradó): se liberó el turno y se sirvió UB si había. */
    errorProductor: boolean;
    propietario: string | null;
    // --- Etapa 3.a (#19, H2) ---
    /** Títulos, pools, bloques o cards descartados por un error de TMDB (lib/fallos-tmdb.ts). Marcan el payload como degradado. */
    descartesTmdb: number;
  };
  tmdb: {
    /** Llamadas LÓGICAS a TMDB pedidas por el código. */
    llamadas: number;
    /**
     * Intentos HTTP: cada `fetch` que salió al cable. Con los reintentos
     * apagados (`TMDB_REINTENTOS` ausente, Etapa 3.a) vale lo mismo que
     * `llamadas` menos las que no salieron (canceladas en cola, rechazadas);
     * la igualdad se verifica, no se supone.
     */
    intentos: number;
    /** Intentos posteriores al primero de una llamada. Se anota explícitamente; no se deduce. */
    reintentos: number;
    /** Reintentos que la política habría hecho pero no cabían en el presupuesto. */
    reintentoNoCupo: number;
    /** Llamadas que no salieron por circuito abierto o pausa (Etapa 3.b; en 3.a siempre 0). */
    rechazadas: number;
    /** Llamadas que la señal de la solicitud abortó: esperando el semáforo, durmiendo un reintento, o con el `fetch` en vuelo. */
    canceladas: { enCola: number; enEspera: number; enVuelo: number };
    ok: number;
    errores: {
      http429: number; http5xx: number; http4xx: number;
      /** fallo de red o DNS: el `fetch` rechazó sin respuesta */ red: number;
      /** el timeout propio de 8 s abortó el `fetch` (antes contaba como `red`) */ timeout: number;
      /** 200 con un cuerpo que no parsea (antes contaba como `ok`) */ cuerpo: number;
    };
    /** Tiempo acumulado dentro de los intentos (suma, no pared: van en paralelo). */
    ms: number;
    /** Acumulado dormido entre intentos (0 con los reintentos apagados). */
    esperaReintentosMs: number;
  };
  supabase: {
    /** Consultas del cliente de servidor (cada `fetch` de supabase-js). Sin reintentos propios: también son intentos HTTP. */
    consultas: number;
    ok: number;
    errores: { http: number; red: number };
    ms: number;
  };
  redis: {
    modo: "redis" | "memoria" | null;
    /** Lo que el código pidió: cada GET, MGET o SET. */
    llamadasLogicas: number;
    /** Lo que salió al cable: 1 por llamada lógica contra Redis + 1 por cada reintento del SDK. 0 en memoria. */
    intentosHttp: number;
    /** Lo que Upstash confirmó (y factura): sólo respuestas correctas. */
    comandos: number;
    /** Claves pedidas, deduplicadas por lote. */
    claves: number;
    hits: number;
    misses: number;
    /** Tamaño de cada MGET. */
    lotes: number[];
    fallos: { lectura: number; escritura: number };
    /** Tiempo acumulado dentro del caché. */
    ms: number;
  };
}

export const nuevasMetricas = (): MetricasRequest => ({
  home: {
    cache: null, composiciones: 0, esperasCompartidas: 0, degradado: false, fuentesCaidas: 0,
    turno: null, origen: null, publicacion: null, renovaciones: 0, turnoPerdido: false, esperaMs: 0, fondo: null,
    degradadoDescartado: false, enfriado: false, cancelada: false, errorProductor: false, propietario: null,
    descartesTmdb: 0,
  },
  tmdb: {
    llamadas: 0, intentos: 0, reintentos: 0, reintentoNoCupo: 0, rechazadas: 0,
    canceladas: { enCola: 0, enEspera: 0, enVuelo: 0 },
    ok: 0, errores: { http429: 0, http5xx: 0, http4xx: 0, red: 0, timeout: 0, cuerpo: 0 }, ms: 0, esperaReintentosMs: 0,
  },
  supabase: { consultas: 0, ok: 0, errores: { http: 0, red: 0 }, ms: 0 },
  redis: {
    modo: null, llamadasLogicas: 0, intentosHttp: 0, comandos: 0,
    claves: 0, hits: 0, misses: 0, lotes: [], fallos: { lectura: 0, escritura: 0 }, ms: 0,
  },
});

const als = new AsyncLocalStorage<MetricasRequest>();

/** Corre `fn` con un contador propio y devuelve el resultado junto a las métricas. */
export async function withMetricas<T>(fn: () => Promise<T>): Promise<{ res: T; metricas: MetricasRequest }> {
  const metricas = nuevasMetricas();
  const res = await als.run(metricas, fn);
  return { res, metricas };
}

/** Anota en el contador de la solicitud actual. Fuera de un scope no hace nada. */
export function anotar(fn: (m: MetricasRequest) => void): void {
  const m = als.getStore();
  if (m) fn(m);
}

export function metricasActuales(): MetricasRequest | null {
  return als.getStore() ?? null;
}

/**
 * El contador de la solicitud actual, para anotarle DESPUÉS desde otro contexto.
 * Es lo que usa el batcher: se captura al encolar la clave y se anota al
 * resolverla, aunque el flush corra en el contexto de otra solicitud.
 */
export function capturar(): MetricasRequest | null {
  return als.getStore() ?? null;
}

export function anotarEn(m: MetricasRequest | null, fn: (m: MetricasRequest) => void): void {
  if (m) fn(m);
}

/**
 * El `backoff` que se le pasa al cliente de Upstash. `@upstash/redis` 1.38.0 lo
 * llama exactamente UNA vez antes de cada reintento (pkg/http.ts, `request`:
 * `if (i < this.retry.attempts) await backoff(i)`), dentro del mismo contexto
 * async del comando. Así cada llamada es un intento HTTP más, atribuido a la
 * solicitud correcta, sin envolver el transporte. Devuelve la MISMA espera que
 * el SDK usa por defecto (`Math.exp(i) * 50` ms): esto mide, no cambia.
 *
 * ⚠️ Lo que este punto NO ve: un intento que el SDK no reintenta (una respuesta
 * HTTP de error sale del bucle sin backoff) cuenta como el único intento de su
 * llamada lógica, que es correcto. Y si alguna versión futura del SDK dejara de
 * llamar a `backoff` por reintento, los intentos volverían a subestimarse: el
 * test de fuente en lib/metricas.test.ts ata la versión instalada.
 */
export function backoffRedisInstrumentado(): (reintento: number) => number {
  return (reintento: number) => {
    anotar((m) => { m.redis.intentosHttp += 1; });
    return Math.exp(reintento) * 50;
  };
}

export function clasificarEstadoHttp(estado: number): ClaseHttp {
  if (estado >= 200 && estado < 300) return "ok";
  if (estado === 429) return "http429";
  if (estado >= 500) return "http5xx";
  return "http4xx";
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * La línea `[home]` de los logs. Cada unidad con su nombre, nunca sumadas.
 * No lleva tokens ni parámetros: sólo cuentas y tiempos, y al final la clave
 * del Home si se la pasa —la misma que ya viaja en `[home] MISS/HIT <clave>`—,
 * para que cada línea se pueda atribuir a UNA solicitud aunque haya varias
 * concurrentes (el banco aislado las reparte por clave).
 */
export function lineaHome(m: MetricasRequest, msTotal: number, clave?: string): string {
  const t = m.tmdb;
  const errTmdb = [
    t.errores.http429 ? `${t.errores.http429} x429` : "",
    t.errores.http5xx ? `${t.errores.http5xx} x5xx` : "",
    t.errores.http4xx ? `${t.errores.http4xx} x4xx` : "",
    t.errores.red ? `${t.errores.red} red` : "",
    t.errores.timeout ? `${t.errores.timeout} timeout` : "",
    t.errores.cuerpo ? `${t.errores.cuerpo} cuerpo` : "",
  ].filter(Boolean);
  // Etapa 3.a: intentos y reintentos sólo se muestran cuando difieren de las
  // llamadas (o sea, cuando hubo reintentos, canceladas o rechazadas); si no,
  // la línea es la de siempre y lo que ya se lee no cambia.
  const c = t.canceladas;
  const totalCanceladas = c.enCola + c.enEspera + c.enVuelo;
  const detalleCanceladas = [
    c.enCola ? `${c.enCola} en cola` : "", c.enEspera ? `${c.enEspera} en espera` : "", c.enVuelo ? `${c.enVuelo} en vuelo` : "",
  ].filter(Boolean).join(", ");
  const intentos = t.reintentos || t.reintentoNoCupo
    ? ` / ${t.intentos} intentos (${t.reintentos} reintentos${t.reintentoNoCupo ? `, ${t.reintentoNoCupo} no cupieron` : ""})`
    : "";
  const canceladas = totalCanceladas ? ` | ${totalCanceladas} canceladas (${detalleCanceladas})` : "";
  const rechazadas = t.rechazadas ? ` | ${t.rechazadas} rechazadas` : "";
  const esperaReintentos = t.esperaReintentosMs ? ` | espera reintentos ${t.esperaReintentosMs}ms` : "";
  const descartes = m.home.descartesTmdb ? `, ${m.home.descartesTmdb} descarte(s) tmdb` : "";
  const s = m.supabase;
  const errSb = [
    s.errores.http ? `${s.errores.http} http` : "",
    s.errores.red ? `${s.errores.red} red` : "",
  ].filter(Boolean);
  const r = m.redis;
  const fallosRedis = [
    r.fallos.lectura ? `${r.fallos.lectura} fallo(s) lectura` : "",
    r.fallos.escritura ? `${r.fallos.escritura} fallo(s) escritura` : "",
  ].filter(Boolean);
  const lotes = r.lotes.length ? `${r.lotes.length} de [${r.lotes.join(",")}]` : "ninguno";
  const cache = m.home.cache ? m.home.cache.toUpperCase() : "?";
  // Etapa 2: el turno y el origen sólo aparecen cuando la secuencia los anotó
  // (un HIT no pasa por el turno); los indicadores booleanos, sólo cuando valen.
  const h = m.home;
  const turno = h.turno || h.origen || h.publicacion
    ? ` | turno ${h.turno ?? "?"} | origen ${h.origen ?? "?"} | publicacion ${h.publicacion ?? "no"} | renovaciones ${h.renovaciones} | propietario ${h.propietario ?? "?"} |`
      + `${h.fondo ? ` fondo ${h.fondo} |` : ""}${h.turnoPerdido ? " TURNO PERDIDO |" : ""}${h.enfriado ? " ENFRIADO |" : ""}${h.cancelada ? " CANCELADA |" : ""}${h.errorProductor ? " ERROR PRODUCTOR |" : ""}${h.degradadoDescartado ? " DEGRADADO DESCARTADO |" : ""}${h.esperaMs ? ` espera ${h.esperaMs}ms |` : ""}`
    : "";
  return (
    `[home] ${msTotal}ms total | cache ${cache} | ` +
    `${plural(m.home.composiciones, "composición", "composiciones")} | ` +
    `${plural(m.home.esperasCompartidas, "espera compartida", "esperas compartidas")}` +
    `${m.home.degradado ? ` | DEGRADADO (${m.home.fuentesCaidas} fuente(s)${descartes})` : ""}${turno.replace(/ \|$/, "")} | ` +
    `tmdb ${t.llamadas} llamadas${intentos} (${[`${t.ok} ok`, ...errTmdb].join(", ")}) ${t.ms}ms${canceladas}${rechazadas}${esperaReintentos} | ` +
    `supabase ${s.consultas} consultas (${[`${s.ok} ok`, ...errSb].join(", ")}) ${s.ms}ms | ` +
    `redis${r.modo === "memoria" ? "(memoria)" : ""} ${r.llamadasLogicas} llamadas / ${r.intentosHttp} intentos http / ${r.comandos} comandos` +
    ` | ${r.claves} claves (${r.hits} hit / ${r.misses} miss)` +
    `${fallosRedis.length ? ` | ${fallosRedis.join(", ")}` : ""} | ${r.ms}ms | lotes: ${lotes}` +
    `${clave ? ` | clave ${clave}` : ""}`
  );
}
