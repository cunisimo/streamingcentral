// Etapa 0 de capacidad: PODER MEDIR, por solicitud y sin mezclar unidades.
//
// ============================================================================
// QUÉ SE ARREGLA (issue #20, informe de capacidad §7 y §9)
// ============================================================================
// Hasta acá `CacheMetrics` (lib/cache.ts) contaba SÓLO Redis, y a tres cosas
// distintas las llamaba `requests`: la llamada lógica que hizo el código, los
// intentos HTTP que salieron al cable (el SDK reintenta hasta 6 veces) y los
// comandos que factura Upstash. No había contador de llamadas a TMDB ni de
// consultas a Supabase, ni de composiciones del Home: sólo HIT/MISS, que en
// cuanto entre el single-flight no distingue "esperé a otro" de "acerté".
//
// Este archivo fija el modelo. Se escribió ANTES del módulo: fallaba al
// importar.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  withMetricas, anotar, metricasActuales, capturar, anotarEn, nuevasMetricas,
  backoffRedisInstrumentado, clasificarEstadoHttp, lineaHome,
  type MetricasRequest,
} from "./metricas.ts";

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ===========================================================================
// EL MODELO: UNIDADES SEPARADAS, NOMBRES QUE NO SE PUEDEN CONFUNDIR
// ===========================================================================

test("🔴 el modelo separa Home, TMDB, Supabase y las TRES unidades de Redis", () => {
  const m = nuevasMetricas();
  // Home: HIT/MISS es una cosa; composición propia es OTRA y se cuenta aparte;
  // la espera compartida existe desde ya aunque siempre dé 0.
  assert.equal(m.home.cache, null);
  assert.equal(m.home.composiciones, 0);
  assert.equal(m.home.esperasCompartidas, 0);
  // Dependencias externas, cada una con su cuenta y su latencia.
  assert.equal(m.tmdb.llamadas, 0);
  assert.equal(m.supabase.consultas, 0);
  // Redis: lo que el código pidió, lo que salió al cable, lo que se facturó.
  assert.equal(m.redis.llamadasLogicas, 0);
  assert.equal(m.redis.intentosHttp, 0);
  assert.equal(m.redis.comandos, 0);
  // La palabra "requests" no existe más en el modelo: era tres cosas.
  assert.equal("requests" in m.redis, false);
  assert.equal("requests" in m, false);
});

test("🔴 una composición se CUENTA, no se deduce del MISS", async () => {
  const { metricas } = await withMetricas(async () => {
    anotar((m) => { m.home.cache = "miss"; });
    // Un MISS que (en el futuro) espera a otra composición no compone nada.
    anotar((m) => { m.home.esperasCompartidas += 1; });
  });
  assert.equal(metricas.home.cache, "miss");
  assert.equal(metricas.home.composiciones, 0, "un MISS no implica una composición propia");
  assert.equal(metricas.home.esperasCompartidas, 1);
});

// ===========================================================================
// AISLAMIENTO ENTRE SOLICITUDES: LOS LÍMITES DE AsyncLocalStorage
// ===========================================================================

test("🔴 dos solicitudes CONCURRENTES no mezclan sus métricas", async () => {
  // Dos "requests" que se entrelazan con awaits: cada una anota en su propio
  // contador aunque compartan el mismo proceso y el mismo tick.
  const [a, b] = await Promise.all([
    withMetricas(async () => {
      anotar((m) => { m.tmdb.llamadas += 1; });
      await dormir(5);
      anotar((m) => { m.tmdb.llamadas += 1; m.redis.llamadasLogicas += 1; });
      await dormir(5);
      return "a";
    }),
    withMetricas(async () => {
      await dormir(2);
      anotar((m) => { m.supabase.consultas += 1; });
      await dormir(5);
      anotar((m) => { m.home.composiciones += 1; });
      return "b";
    }),
  ]);
  assert.equal(a.res, "a");
  assert.deepEqual([a.metricas.tmdb.llamadas, a.metricas.redis.llamadasLogicas, a.metricas.supabase.consultas, a.metricas.home.composiciones], [2, 1, 0, 0]);
  assert.deepEqual([b.metricas.tmdb.llamadas, b.metricas.redis.llamadasLogicas, b.metricas.supabase.consultas, b.metricas.home.composiciones], [0, 0, 1, 1]);
});

test("fuera de un scope, anotar no hace nada y no rompe", () => {
  assert.equal(metricasActuales(), null);
  assert.doesNotThrow(() => anotar((m) => { m.tmdb.llamadas += 1; }));
});

test("🔴 LÍMITE conocido: un callback programado con queueMicrotask hereda el contexto de QUIEN LO PROGRAMÓ", async () => {
  // Es la trampa del batcher de lib/cache.ts: el flush corre en el contexto de
  // la solicitud que lo programó, así que lo que se anote AHÍ se le anota a
  // ella. Por eso hits/misses/claves se atribuyen con la captura de abajo, y
  // sólo el viaje HTTP del MGET queda a nombre de quien programó.
  const { metricas } = await withMetricas(async () => {
    await new Promise<void>((resolve) => {
      queueMicrotask(() => { anotar((m) => { m.redis.comandos += 1; }); resolve(); });
    });
  });
  assert.equal(metricas.redis.comandos, 1, "el microtask no heredó el contexto del que lo programó");
});

test("🔴 capturar + anotarEn: lo que se pidió desde una solicitud se le anota A ELLA aunque lo resuelva otra", async () => {
  // Modelo del batcher: A encola una clave y captura su contador; B programa el
  // flush y resuelve la clave de A. El hit de A tiene que ir a A.
  let capturaDeA: MetricasRequest | null = null;
  const a = withMetricas(async () => {
    capturaDeA = capturar();
    await dormir(20);
  });
  const b = withMetricas(async () => {
    await dormir(5);
    // B resuelve el lote: la clave de A se anota en el contador de A.
    anotarEn(capturaDeA, (m) => { m.redis.hits += 1; m.redis.claves += 1; });
    // El viaje HTTP lo hizo B: se anota en B.
    anotar((m) => { m.redis.intentosHttp += 1; m.redis.comandos += 1; m.redis.llamadasLogicas += 1; });
  });
  const [ra, rb] = await Promise.all([a, b]);
  assert.deepEqual([ra.metricas.redis.hits, ra.metricas.redis.claves, ra.metricas.redis.comandos], [1, 1, 0]);
  assert.deepEqual([rb.metricas.redis.hits, rb.metricas.redis.claves, rb.metricas.redis.comandos], [0, 0, 1]);
  assert.doesNotThrow(() => anotarEn(null, (m) => { m.redis.hits += 1; }), "sin captura no rompe");
});

// ===========================================================================
// REDIS: INTENTOS HTTP = 1 + REINTENTOS, CONTADOS DONDE EL SDK LOS ANUNCIA
// ===========================================================================

test("🔴 el backoff instrumentado cuenta UN intento HTTP extra por cada reintento y conserva la espera del SDK", async () => {
  // `@upstash/redis` 1.38.0 llama a `retry.backoff(i)` exactamente una vez
  // antes de cada reintento (pkg/http.ts: `if (i < attempts) await backoff(i)`),
  // dentro del mismo contexto async del comando. Así que intentos = 1 (que se
  // anota en la llamada lógica) + una por cada backoff. La espera devuelta es
  // la del SDK por defecto, para no cambiar su comportamiento.
  const esperas: number[] = [];
  const { metricas } = await withMetricas(async () => {
    const backoff = backoffRedisInstrumentado();
    for (let i = 0; i < 3; i++) esperas.push(backoff(i));
  });
  assert.equal(metricas.redis.intentosHttp, 3, "cada backoff es un intento HTTP más");
  assert.deepEqual(esperas.map(Math.round), [50, 136, 369], "cambió la espera por defecto del SDK (Math.exp(i) * 50)");
});

test("el backoff instrumentado fuera de scope sigue devolviendo la espera", () => {
  assert.equal(Math.round(backoffRedisInstrumentado()(0)), 50);
});

// ===========================================================================
// ERRORES CLASIFICADOS POR ORIGEN
// ===========================================================================

test("🔴 un estado HTTP se clasifica en 429 / 5xx / otros 4xx / ok", () => {
  assert.equal(clasificarEstadoHttp(200), "ok");
  assert.equal(clasificarEstadoHttp(429), "http429");
  assert.equal(clasificarEstadoHttp(500), "http5xx");
  assert.equal(clasificarEstadoHttp(503), "http5xx");
  assert.equal(clasificarEstadoHttp(404), "http4xx");
  assert.equal(clasificarEstadoHttp(401), "http4xx");
});

// ===========================================================================
// LA LÍNEA [home]: UNIDADES SEPARADAS, LEGIBLE, SIN NADA SENSIBLE
// ===========================================================================

test("🔴 la línea [home] muestra cada unidad con su nombre y nunca las suma", () => {
  const m = nuevasMetricas();
  m.home.cache = "miss"; m.home.composiciones = 1;
  m.tmdb.llamadas = 312; m.tmdb.ok = 310; m.tmdb.errores.http429 = 2; m.tmdb.ms = 4100;
  m.supabase.consultas = 3; m.supabase.ok = 3; m.supabase.ms = 120;
  m.redis.modo = "redis";
  m.redis.llamadasLogicas = 19; m.redis.intentosHttp = 21; m.redis.comandos = 19;
  m.redis.claves = 391; m.redis.hits = 350; m.redis.misses = 41; m.redis.lotes = [100, 100, 100, 91];
  m.redis.fallos.lectura = 0; m.redis.fallos.escritura = 1; m.redis.ms = 800;
  const linea = lineaHome(m, 5200);
  assert.match(linea, /^\[home\] 5200ms total/);
  assert.match(linea, /cache MISS/);
  assert.match(linea, /1 composici/);
  assert.match(linea, /0 esperas? compartida/);
  assert.match(linea, /tmdb 312 llamadas \(310 ok, 2 x429\) 4100ms/);
  assert.match(linea, /supabase 3 consultas \(3 ok\) 120ms/);
  // Las tres unidades de Redis, juntas y con nombre, para que no se confundan.
  assert.match(linea, /redis 19 llamadas \/ 21 intentos http \/ 19 comandos/);
  assert.match(linea, /391 claves \(350 hit \/ 41 miss\)/);
  assert.match(linea, /1 fallo\(s\) escritura/);
  assert.match(linea, /lotes: 4 de \[100,100,100,91\]/);
  assert.doesNotMatch(linea, /\brequests\b/, "volvió la palabra que mezclaba tres unidades");
});

test("la línea [home] con un HIT es corta y dice que no hubo composición", () => {
  const m = nuevasMetricas();
  m.home.cache = "hit"; m.redis.modo = "redis";
  m.redis.llamadasLogicas = 1; m.redis.intentosHttp = 1; m.redis.comandos = 1;
  m.redis.claves = 1; m.redis.hits = 1; m.redis.lotes = [1]; m.redis.ms = 30;
  const linea = lineaHome(m, 40);
  assert.match(linea, /cache HIT/);
  assert.match(linea, /0 composiciones/);
  assert.match(linea, /tmdb 0 llamadas/);
});

test("🔴 la línea [home] termina con su CLAVE cuando se la pasa, para poder atribuirla a una solicitud", () => {
  // El banco lee las líneas del log y las atribuye por clave a cada escenario;
  // con solicitudes concurrentes, sin clave las líneas no se pueden repartir.
  const m = nuevasMetricas();
  m.home.cache = "hit"; m.redis.modo = "redis";
  const con = lineaHome(m, 5, "home:es-ES.r1:v6:123:d,m,n:");
  assert.match(con, /\| clave home:es-ES\.r1:v6:123:d,m,n:$/);
  const sin = lineaHome(m, 5);
  assert.doesNotMatch(sin, /\| clave /);  // ("claves (0 hit …)" sí está: es otra palabra)
});

test("🔴 el Home anuncia cada solicitud al ENTRAR (`[home] pedido <clave>`): pedidos sin terminal = solicitudes activas", () => {
  assert.match(home, /console\.log\(`\[home\] pedido \$\{key\}`\)/, "no hay línea de entrada: un timeout del cliente sería invisible en el servidor");
  assert.match(home, /lineaHome\(metricas, [^,]+, key\)/, "la línea terminal no lleva la clave");
});

test("en memoria (sin Redis) los intentos HTTP son 0 y la línea lo dice", () => {
  const m = nuevasMetricas();
  m.home.cache = "miss"; m.home.composiciones = 1; m.redis.modo = "memoria";
  m.redis.llamadasLogicas = 5; m.redis.comandos = 5;
  const linea = lineaHome(m, 10);
  assert.match(linea, /redis\(memoria\) 5 llamadas \/ 0 intentos http \/ 5 comandos/);
});

// ===========================================================================
// QUE PRODUCCIÓN ENTRE POR ACÁ
// ===========================================================================
// lib/cache.ts, lib/tmdb.ts y lib/home.ts llevan `server-only` y no se pueden
// importar desde node --test: se inspecciona el fuente, sin comentarios. Mismo
// recurso que lib/cache-delega.test.ts.

const sinComentarios = (rel: string) => readFileSync(rel, "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const cache = sinComentarios("lib/cache.ts");
const tmdb = sinComentarios("lib/tmdb.ts");
const home = sinComentarios("lib/home.ts");
const supabase = sinComentarios("lib/supabase.ts");

test("🔴 lib/cache.ts usa el modelo nuevo y ya no tiene `requests`", () => {
  assert.match(cache, /from "\.\/metricas"/, "cache.ts no importa el módulo de métricas");
  assert.doesNotMatch(cache, /m\.requests/, "sigue anotando `requests`: tres unidades en una");
  assert.doesNotMatch(cache, /interface CacheMetrics/, "sigue el modelo viejo, sólo de Redis");
  assert.match(cache, /m\.redis\.llamadasLogicas \+= 1/);
  assert.match(cache, /m\.redis\.intentosHttp \+= 1/);
  assert.match(cache, /m\.redis\.comandos \+= 1/);
});

test("🔴 el cliente de Redis se crea con el backoff instrumentado y SIN cambiar sus reintentos", () => {
  const i = cache.indexOf("new Redis(");
  assert.notEqual(i, -1);
  const ctor = cache.slice(i, cache.indexOf("});", i) + 3);
  assert.match(ctor, /retry:\s*\{\s*backoff:\s*backoffRedisInstrumentado\(\)\s*\}/,
    "los reintentos del SDK no se observan: los intentos HTTP serían un invento");
  assert.doesNotMatch(ctor, /retries:/, "cambió la cantidad de reintentos del SDK; la Etapa 0 sólo mide");
});

test("🔴 el batcher atribuye hits/misses a quien PIDIÓ la clave (captura), no a quien programó el flush", () => {
  const i = cache.indexOf("function batchGet");
  const cuerpo = cache.slice(i, cache.indexOf("async function flush", i));
  assert.match(cuerpo, /capturar\(\)/, "batchGet no captura el contador del que pide");
  const j = cache.indexOf("async function flush");
  const flush = cache.slice(j, cache.indexOf("async function guardar", j));
  assert.match(flush, /anotarEn\(/, "flush no anota en el contador capturado");
});

test("🔴 lib/tmdb.ts cuenta cada llamada y clasifica su resultado", () => {
  assert.match(tmdb, /m\.tmdb\.llamadas \+= 1/);
  assert.match(tmdb, /clasificarEstadoHttp\(res\.status\)/);
  assert.match(tmdb, /m\.tmdb\.errores\.red \+= 1/, "un fallo de red o timeout no se clasifica");
});

test("🔴 lib/supabase.ts cuenta cada consulta del cliente de servidor sin importar node:async_hooks", () => {
  // lib/supabase.ts llega al bundle del navegador (supabaseBrowser): no puede
  // importar el módulo de métricas. Expone un observador que el servidor registra.
  assert.doesNotMatch(supabase, /async_hooks|from "\.\/metricas"/, "lib/supabase.ts arrastraría AsyncLocalStorage al navegador");
  assert.match(supabase, /export function observarSupabase\(/);
  assert.match(supabase, /observador\?\.\(/, "el fetch del cliente de servidor no avisa al observador");
});

test("🔴 el Home cuenta la composición EXPLÍCITAMENTE y registra la línea nueva", () => {
  assert.match(home, /m\.home\.composiciones \+= 1/, "la composición no se cuenta: se deduciría del MISS");
  assert.match(home, /m\.home\.cache = "miss"/);
  assert.match(home, /lineaHome\(/, "la línea [home] no sale del formateador probado");
  assert.doesNotMatch(home, /withCacheMetrics/, "sigue el scope viejo, sólo de Redis");
});

// ============================================================================
// Etapa 2 (#17): el turno distribuido y el último bueno, en el contador y en la línea
// ============================================================================
test("🔴 Etapa 2: el contador del Home tiene turno, origen, publicación y los indicadores de la secuencia", () => {
  const m = nuevasMetricas();
  assert.equal(m.home.turno, null);
  assert.equal(m.home.origen, null);
  assert.equal(m.home.publicacion, null);
  assert.equal(m.home.renovaciones, 0);
  assert.equal(m.home.turnoPerdido, false);
  assert.equal(m.home.esperaMs, 0);
  assert.equal(m.home.degradadoDescartado, false);
  assert.equal(m.home.enfriado, false);
  assert.equal(m.home.cancelada, false);
  assert.equal(m.home.propietario, null);
});

test("🔴 Etapa 2: la línea [home] imprime el turno, el origen y la publicación con nombre; y un HIT sigue diciendo cache HIT", () => {
  const m = nuevasMetricas();
  m.home.cache = "miss"; m.home.composiciones = 1;
  m.home.turno = "adquirido"; m.home.origen = "propia"; m.home.publicacion = "publicado";
  m.home.renovaciones = 2; m.home.propietario = "i1:7:3";
  const linea = lineaHome(m, 5200, "home:v6:1:n:");
  assert.match(linea, /\| turno adquirido \| origen propia \| publicacion publicado \| renovaciones 2 \| propietario i1:7:3 \|/);
  // Los indicadores booleanos sólo aparecen cuando valen, para que la línea del
  // caso normal no crezca.
  assert.doesNotMatch(linea, /perdido|enfriado|cancelada|descartado/);
  m.home.turnoPerdido = true; m.home.enfriado = true; m.home.cancelada = true; m.home.degradadoDescartado = true; m.home.esperaMs = 1500;
  const conTodo = lineaHome(m, 5200, "home:v6:1:n:");
  assert.match(conTodo, /TURNO PERDIDO/);
  assert.match(conTodo, /ENFRIADO/);
  assert.match(conTodo, /CANCELADA/);
  assert.match(conTodo, /DEGRADADO DESCARTADO/);
  assert.match(conTodo, /espera 1500ms/);
  assert.match(conTodo, /\| clave home:v6:1:n:$/, "la clave sigue al final");
  // Los valores nuevos de `cache` salen en mayúsculas como los de siempre.
  for (const c of ["ultimo-bueno", "esperada", "vacio", "degradado-compartida"] as const) {
    const h = nuevasMetricas(); h.home.cache = c;
    assert.match(lineaHome(h, 1), new RegExp(`cache ${c.toUpperCase()}`));
  }
});
