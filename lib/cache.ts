// `server-only` es un guard de BUILD: acá viven las credenciales de Upstash, y
// este módulo ya se coló una vez en el bundle del navegador (70 KB del cliente
// de Redis). tsc no caza esa regresión; esto la convierte en error de
// compilación si algún "use client" importa un valor de acá.
import "server-only";
import { Redis } from "@upstash/redis";
import type { ClaveLocalizada } from "./claves";
import { resolverConCache, type BackendCache } from "./reparar-y-cachear";
import { guardarSinRomper } from "./escritura-cache";
import {
  anotar, anotarEn, backoffRedisInstrumentado, capturar, withMetricas,
  type MetricasRequest,
} from "./metricas";
import { observarSupabase, proveerSenalSupabase } from "./supabase";
import { LUA } from "./turno-lua";
import { LUA_PAUSA } from "./pausa-lua";
import type { OpsTurno, OpsPausa } from "./turno";
import { crearOpsEnMemoria, type Entrada } from "./turno-memoria";
import { CONSTANTES_PAUSA, crearPausa, pausaActiva } from "./tmdb-pausa";
import { randomUUID } from "node:crypto";
import { combinarSenales, senalActual } from "./senal-solicitud";
import { createHash } from "node:crypto";

// Credenciales REST de Upstash. Se aceptan DOS juegos de nombres porque
// dependen de cómo se haya conectado la base:
//   UPSTASH_REDIS_REST_URL / _TOKEN  → al copiarlas a mano desde Upstash
//   KV_REST_API_URL / KV_REST_API_TOKEN → las que crea la integración de Vercel
//     (mantiene el prefijo KV_ del viejo Vercel KV)
// Antes solo se miraba el primer juego y se usaba Redis.fromEnv(), que exige
// esos nombres exactos: con la integración de Vercel el cache quedaba apagado
// EN SILENCIO y cada request rehacía ~300 llamadas a TMDB.
// OJO: KV_URL y REDIS_URL son connection strings TCP (redis://) y NO sirven
// para este cliente, que habla REST sobre HTTPS.
const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

// Si no hay credenciales, cae a un cache en memoria (dev sin Redis).
let redis: Redis | null = null;
try {
  // `retry.backoff` es el ÚNICO punto donde el SDK anuncia un reintento sin
  // que haya que envolver su transporte (llama al `fetch` global y no acepta
  // uno propio). El instrumentado devuelve la misma espera por defecto y
  // NO toca `retries`: la Etapa 0 mide, no cambia. Ver lib/metricas.ts.
  if (redisUrl && redisToken) redis = new Redis({ url: redisUrl, token: redisToken, retry: { backoff: backoffRedisInstrumentado() } });
} catch { redis = null; }
// El LECTOR de la pausa (3.c.1, §41.2/§43.8) va por un cliente APARTE: timeout
// propio por petición (`signal` como función: una señal nueva por comando) y
// SIN reintentos del SDK. Con el cliente principal, una lectura colgada
// arrastraría 6 intentos y 4,29 s de backoff; acá vence al segundo y
// lib/tmdb-pausa.ts decide (F_max = 1 → 30 s sin leer). Con una señal abortada
// el SDK devuelve un 200 sintético `{ result: "Aborted" }`: no es un entero, y
// el lector lo trata como indeterminado, nunca como "sin pausa".
let redisLector: Redis | null = null;
try {
  if (redisUrl && redisToken) redisLector = new Redis({ url: redisUrl, token: redisToken, retry: { retries: 0 }, signal: () => AbortSignal.timeout(CONSTANTES_PAUSA.TIMEOUT_LECTURA_MS) });
} catch { redisLector = null; }

// Las consultas a Supabase del cliente de servidor se cuentan desde acá:
// lib/supabase.ts llega al bundle del navegador y no puede importar el módulo
// de métricas, así que expone un observador y este módulo —que ya es
// server-only y lo importa todo el lado del servidor— lo registra al cargar.
observarSupabase((r) => {
  anotar((m) => {
    m.supabase.consultas += 1;
    m.supabase.ms += r.ms;
    if (r.estado === null) m.supabase.errores.red += 1;
    else if (r.estado >= 200 && r.estado < 300) m.supabase.ok += 1;
    else m.supabase.errores.http += 1;
  });
});

const mem = new Map<string, Entrada>();

// La señal de la solicitud (Etapa 2, §3.8) llega al `fetch` del cliente de
// servidor de Supabase por el mismo camino que el observador: lib/supabase.ts
// no puede importar node:async_hooks, así que pide la señal a un proveedor y
// este módulo —server-only— se la da combinada con la propia que traiga.
proveerSenalSupabase((propia) => combinarSenales(senalActual(), propia));

// --- Diagnóstico (lo consume GET /api/health) --------------------------------
// Este cache falla EN SILENCIO: si las credenciales no llegan, todo sigue
// andando con el cache en memoria y lo único que se nota es la lentitud. Pasó
// en producción y costó descubrirlo. Esto lo hace visible en un request.
// NUNCA devuelve la URL ni el token: solo QUÉ variable se encontró.
export function cacheStatus() {
  const fuente = process.env.UPSTASH_REDIS_REST_URL
    ? "UPSTASH_REDIS_REST_URL"
    : process.env.KV_REST_API_URL
      ? "KV_REST_API_URL"
      : null;
  return {
    modo: redis ? ("redis" as const) : ("memoria" as const),
    fuente,
    // Que la variable exista no garantiza que el token sirva: eso lo dice el ping.
    tieneUrl: !!redisUrl,
    tieneToken: !!redisToken,
  };
}

// Escribe y lee una clave propia: confirma que las credenciales FUNCIONAN, no
// solo que están seteadas (un token vencido pasa el chequeo de arriba).
export async function cachePing(): Promise<{ ok: boolean; detalle: string; claves?: number }> {
  if (!redis) return { ok: false, detalle: "sin cliente redis (cache en memoria)" };
  try {
    const k = "health:ping";
    // El valor NO puede ser numérico: el cliente de Upstash hace JSON.parse de
    // lo que lee, así que un "1" vuelve como number 1 y una comparación estricta
    // contra "1" daba un falso negativo (el cache andaba y el ping decía que no).
    const esperado = "pong";
    await redis.set(k, esperado, { ex: 60 });
    const v = await redis.get<string>(k);
    if (String(v) !== esperado) return { ok: false, detalle: `escribió "${esperado}" pero leyó ${JSON.stringify(v)}` };
    const claves = await redis.dbsize();
    return { ok: true, detalle: "lectura y escritura OK", claves };
  } catch (e) {
    return { ok: false, detalle: e instanceof Error ? e.message : String(e) };
  }
}

export const TTL = {
  catalog: 60 * 60 * 24,
  providers: 60 * 60 * 8,
  ratings: 60 * 60 * 24,
  daily: 60 * 60 * 24,
  // Payload compuesto del Home.
  //
  // El número lo manda la cuota de Upstash, no el producto. Rearmar el Home
  // cuesta 400-700 comandos de Redis (un `card:` y un `pv3:` por cada uno de los
  // ~230 títulos); la visita que pega en cache cuesta 1. Con TTL de 1 hora eso
  // daba 24 rearmados por día ≈ 360.000 comandos al mes POR COMBINACIÓN de
  // plataformas: el 72% del plan gratuito (500.000/mes) consumido por una sola
  // combinación, con 10 usuarios o con 10.000. Con 6 horas son 4 rearmados
  // diarios ≈ 60.000, y entran varias combinaciones cómodas.
  //
  // Lo que se paga: los rieles de votos ("Lo más votados", "No gustaron")
  // pueden tardar hasta 6 h en reflejar un voto nuevo. Con el volumen actual de
  // votos nadie lo nota. Si eso cambia, la salida NO es bajar el TTL de vuelta
  // —volvés al problema de cuota— sino invalidar las claves `home:` al votar.
  home: 60 * 60 * 6,
  // Pools de discover (lib/pools.ts). El día va en la clave, así que el TTL no
  // es lo que define cuándo rota: 30 h es el colchón para que un pool escrito a
  // las 23:50 no se muera antes de que su clave deje de usarse.
  pool: 60 * 60 * 30,
  // Ids con reseña editorial publicada. Corto porque es el único dato del Home
  // que se edita a mano desde /admin: si se publica una reseña, el badge tiene
  // que aparecer en minutos y no al otro día.
  editorial: 60 * 5,
  // Resultado ya armado de una búsqueda. El buscador corre mientras se tipea,
  // así que "matrix" se pide de nuevo cada vez que alguien lo escribe — y cada
  // vez cuesta 7 llamadas de búsqueda a TMDB más un providersOf por título.
  // Una hora alcanza para que la sesión entera de un usuario y las de los que
  // buscan lo mismo salgan de acá; el catálogo no cambia tan rápido como para
  // que valga la pena menos.
  search: 60 * 60,
  // El riel "Elegidas para vos", ya armado. La clave lleva un hash de las señales,
  // así que votar o tocar Mi lista lo invalida solo: no hace falta que el TTL
  // sea corto para que el riel se sienta vivo. 6 h es el colchón para que una
  // sesión larga no lo rearme, y de paso acota cuánto vive una entrada que quedó
  // huérfana porque el usuario cambió sus señales.
  reco: 60 * 60 * 6,
  // Último Home bueno (Etapa 2, #17, informe §4.2): 6 h de la fresca + 24 h de
  // un día entero + 6 h de margen. Garantiza que haya UB durante 36 h desde la
  // última publicación válida de esa combinación, y nada más.
  homeUltimoBueno: 60 * 60 * 36,
} as const;

// --- Métricas por operación --------------------------------------------------
// El contador vive en lib/metricas.ts (Etapa 0 de capacidad, #20): un scope por
// solicitud con AsyncLocalStorage, y las TRES unidades de Redis separadas:
//
//   llamadasLogicas  lo que este código pidió (cada GET, MGET o SET);
//   intentosHttp     lo que salió al cable: 1 por llamada contra Redis más 1
//                    por cada reintento del SDK (contado en su `backoff`);
//   comandos         lo que Upstash confirmó, que es lo que factura. Un MGET de
//                    100 claves es 1 comando y 1 intento; 100 GET son 100 y 100.
//
// El batcher es de módulo (las claves son globales), así que un lote puede
// mezclar claves de dos requests concurrentes. Los hits/misses/claves se le
// anotan a QUIEN PIDIÓ cada clave (se captura su contador al encolar); lo único
// que queda a nombre de quien programó el flush es el viaje HTTP del MGET, que
// es uno solo para todas.
export { withMetricas };
export type { MetricasRequest };

// --- Lectura agrupada --------------------------------------------------------
// Rearmar el Home hacía ~230 GET individuales, uno por título, porque cada
// `cached()` iba solo a Redis. Todas esas llamadas nacen en el mismo tick (los
// Promise.all de enrich.ts), así que se pueden juntar: se acumulan en una cola,
// se descarga en el siguiente microtask y sale un MGET por lote.
//
// Deduplicar la cola es parte del ahorro y no un extra: `titleCard` pide el
// mismo `pv3:` que después vuelve a pedir `toUITitle`.
//
// 100 por lote: Upstash cobra el MGET como UN comando sin importar cuántas
// claves lleve, así que el único límite real es el tamaño de la respuesta
// (una card ronda el KB; 100 son ~100 KB, cómodo).
const LOTE = 100;
// `m` es el contador de la solicitud que PIDIÓ la clave, capturado al encolar:
// el flush corre en el contexto de otra y le anota a ésta lo suyo.
type Espera = { resolve: (v: unknown) => void; reject: (e: unknown) => void; m: MetricasRequest | null };
let cola = new Map<string, Espera[]>();
let programado = false;

// Interruptor de emergencia y, de paso, la forma de medir las dos estrategias
// con el MISMO build: CACHE_BATCH=0 vuelve al GET por clave de antes. No lo
// pongas en Vercel salvo que el batching cause un problema.
const batchOn = process.env.CACHE_BATCH !== "0";

async function getSuelto<T>(key: string): Promise<T | null> {
  if (!redis) {
    const hit = mem.get(key);
    const vivo = hit && hit.exp > Date.now();
    anotar((m) => {
      m.redis.modo = "memoria"; m.redis.llamadasLogicas += 1; m.redis.comandos += 1; m.redis.claves += 1;
      if (vivo) m.redis.hits++; else m.redis.misses++;
    });
    return vivo ? (hit!.v as T) : null;
  }
  const t0 = Date.now();
  // La llamada lógica y su primer intento HTTP se anotan ANTES de salir: si el
  // SDK reintenta, cada reintento suma uno más desde su `backoff`.
  anotar((m) => { m.redis.modo = "redis"; m.redis.llamadasLogicas += 1; m.redis.intentosHttp += 1; });
  try {
    const v = await redis.get<T>(key);
    anotar((m) => {
      m.redis.comandos += 1; m.redis.claves += 1;
      if (v === null || v === undefined) m.redis.misses++; else m.redis.hits++;
    });
    return v ?? null;
  } catch (err) {
    anotar((m) => { m.redis.fallos.lectura += 1; m.redis.claves += 1; m.redis.misses++; });
    console.error("[cache] get falló, sigue sin cache:", err);
    return null;
  } finally {
    anotar((m) => { m.redis.ms += Date.now() - t0; });
  }
}

function batchGet<T>(key: string): Promise<T | null> {
  if (!batchOn) return getSuelto<T>(key);
  return new Promise<T | null>((resolve, reject) => {
    const m = capturar();
    const previos = cola.get(key);
    if (previos) previos.push({ resolve: resolve as (v: unknown) => void, reject, m });
    else cola.set(key, [{ resolve: resolve as (v: unknown) => void, reject, m }]);
    if (!programado) {
      programado = true;
      queueMicrotask(() => { void flush(); });
    }
  });
}

async function flush() {
  programado = false;
  const actual = cola;
  cola = new Map();
  if (!actual.size) return;
  const claves = [...actual.keys()];
  const t0 = Date.now();
  // Cada clave se le anota a quien la pidió (la primera espera de cada clave:
  // las demás son la misma clave deduplicada, y una clave se cuenta una vez).
  const dueño = (k: string) => actual.get(k)?.[0]?.m ?? null;
  const anotarClave = (k: string, vivo: boolean) =>
    anotarEn(dueño(k), (m) => { m.redis.claves += 1; if (vivo) m.redis.hits++; else m.redis.misses++; });

  // Sin Redis (desarrollo) se resuelve contra el Map de memoria, pero se cuenta
  // igual: la cantidad de comandos depende del PATRÓN de acceso —cuántas claves
  // distintas y en cuántos lotes— y no del backend. Así se puede comparar
  // estrategias en local; lo que no se mide sin Redis es la latencia.
  if (!redis) {
    const ahora = Date.now();
    for (let i = 0; i < claves.length; i += LOTE) {
      const lote = claves.slice(i, i + LOTE);
      anotar((m) => { m.redis.modo = "memoria"; m.redis.llamadasLogicas += 1; m.redis.comandos += 1; m.redis.lotes.push(lote.length); });
      for (const k of lote) {
        const hit = mem.get(k);
        const vivo = !!(hit && hit.exp > ahora);
        anotarClave(k, vivo);
        for (const e of actual.get(k) ?? []) e.resolve(vivo ? hit!.v : null);
      }
    }
    return;
  }
  for (let i = 0; i < claves.length; i += LOTE) {
    const lote = claves.slice(i, i + LOTE);
    // El viaje del MGET es uno para todas las claves del lote y lo hizo quien
    // programó el flush: se le anota a él. Los reintentos, desde el `backoff`.
    anotar((m) => { m.redis.modo = "redis"; m.redis.llamadasLogicas += 1; m.redis.intentosHttp += 1; });
    try {
      const vals = await redis.mget<unknown[]>(...lote);
      anotar((m) => { m.redis.comandos += 1; m.redis.lotes.push(lote.length); });
      lote.forEach((k, j) => {
        const v = vals[j];
        anotarClave(k, !(v === null || v === undefined));
        for (const e of actual.get(k) ?? []) e.resolve(v ?? null);
      });
    } catch (err) {
      // Un lote que falla NO puede tumbar el request: el contrato de `cached`
      // ante un Redis caído siempre fue "seguí sin cache", no "explotá".
      anotar((m) => { m.redis.fallos.lectura += 1; });
      console.error("[cache] mget falló, sigue sin cache:", err);
      for (const k of lote) { anotarClave(k, false); for (const e of actual.get(k) ?? []) e.resolve(null); }
    }
  }
  anotar((m) => { m.redis.ms += Date.now() - t0; });
}

// 🔴 UNA ESCRITURA QUE FALLA NO PUEDE TUMBAR EL REQUEST.
//
// Esto era `try { await redis.set(...) } finally {…}` —sin `catch`— y
// `resolverConCache` espera la escritura antes de devolver, así que un rechazo
// de `redis.set` subía hasta el `catch` del handler y salía como 500 con el Home
// vacío. Un payload DEGRADADO se servía sin problema (nunca intenta escribir) y
// uno COMPLETO Y CORRECTO se perdía: el sistema se portaba peor cuanto mejor le
// había salido el trabajo.
//
// La política vive en `lib/escritura-cache.ts`, que es puro y por lo tanto se
// puede EJECUTAR desde `node --test`; acá sólo se enchufa. Mismo criterio que
// `cachedIf` con `resolverConCache` (ver lib/cache-delega.test.ts).
//
// El contrato ahora es simétrico con el de la LECTURA, que hace esto desde
// siempre: capturar, registrar, seguir.
async function guardar(key: string, data: unknown, ttl: number) {
  if (!redis) {
    mem.set(key, { v: data, exp: Date.now() + ttl * 1000 });
    anotar((m) => { m.redis.modo = "memoria"; m.redis.llamadasLogicas += 1; m.redis.comandos += 1; });
    return;
  }
  const t0 = Date.now();
  // La llamada lógica y su primer intento salen ANTES de escribir; el comando
  // sólo se cuenta si Upstash lo confirmó, para no inflar lo facturado con lo
  // que nunca ejecutó. Los reintentos se cuentan desde el `backoff` del SDK.
  anotar((m) => { m.redis.modo = "redis"; m.redis.llamadasLogicas += 1; m.redis.intentosHttp += 1; });
  try {
    await guardarSinRomper({
      clave: key,
      escribir: async () => {
        await redis!.set(key, data, { ex: ttl });
        anotar((m) => { m.redis.comandos += 1; });
      },
      // El aviso dice ESCRITURA, no "cache falló": son dos cosas distintas y la
      // diferencia importa para leer un incidente. Una lectura caída es un MISS
      // y ya; una escritura caída significa además que **el próximo request va a
      // rearmar**, y si eso pasa seguido el costo se multiplica en silencio.
      avisar: ({ clave, error }) => {
        anotar((m) => { m.redis.fallos.escritura += 1; });
        console.error(`[cache] set falló, la respuesta se entrega igual: ${clave} —`, error);
      },
    });
  } finally {
    anotar((m) => { m.redis.ms += Date.now() - t0; });
  }
}

// Un solo camino de lectura para los dos backends: `batchGet` agrupa contra
// Redis y resuelve contra el Map en desarrollo. Antes había dos ramas y la de
// memoria no pasaba por ningún contador.
// --- Cache de contenido LOCALIZADO -------------------------------------------
// Exige `ClaveLocalizada`, que solo devuelven los constructores de lib/claves.ts.
// Una clave escrita a mano NO COMPILA acá, ni siquiera guardada antes en una
// variable — que era el agujero de la primera versión: `cached()` acepta
// `string`, así que `const k = \`card:${id}\`; cached(k, …)` pasaba el tipo y
// pasaba el barrido.
//
// Por qué no se le puso el tipo a `cached` a secas: hay siete familias que NO
// son localizadas (`pv3:`, `videos:`, `genre:covers:`…) y obligarlas a fabricar
// una marca que no les corresponde solo confundiría.
export function cachedLoc<T>(
  key: ClaveLocalizada, ttl: number, fetcher: () => Promise<T>,
): Promise<T> {
  return cached(key, ttl, fetcher);
}

export function cachedLocIf<T>(
  key: ClaveLocalizada, ttl: number, fetcher: () => Promise<T>, vale: (v: T) => boolean,
): Promise<T> {
  return cachedIf(key, ttl, fetcher, vale);
}

export async function cached<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {
  const hit = await batchGet<T>(key);
  if (hit !== null && hit !== undefined) return hit;
  const data = await fetcher();
  await guardar(key, data, ttl);
  return data;
}

// Igual que `cached`, pero decide DESPUÉS de calcular si el resultado merece
// guardarse. `cached` a secas no sirve para el Home: ahí un payload degradado
// (TMDB caído, rieles vacíos) es un resultado válido que hay que devolver, pero
// guardarlo congelaría la caída durante toda la vida del TTL para todos los que
// pidan lo mismo.
// El backend REAL. `resolverConCache` (lib/reparar-y-cachear.ts) es la función
// pura que decide qué se guarda y qué no; los tests la llaman con un backend en
// memoria, así que producción y tests comparten la MISMA implementación de esa
// decisión en vez de que el test la reimplemente.
export const backendCache: BackendCache = {
  leer: <T>(clave: string) => batchGet<T>(clave),
  escribir: <T>(clave: string, valor: T, ttl: number) => guardar(clave, valor, ttl),
};

export async function cachedIf<T>(
  // `vale` se llamaba `guardar`; se renombró para no chocar con la función de
  // escritura del batcher, que ahora es la única que habla con redis.set.
  key: string, ttl: number, fetcher: () => Promise<T>, vale: (v: T) => boolean,
): Promise<T> {
  // DELEGA en `resolverConCache`, que es la única implementación de "leer →
  // producir → decidir si guardar → guardar". No la reimplementa: si lo
  // hiciera, los tests que llaman a `resolverConCache` con un backend en
  // memoria dejarían de probar lo que corre en producción, que es exactamente
  // lo que pasaba antes. `lib/cache-delega.test.ts` falla si se vuelve atrás.
  //
  // El adaptador entre los dos contratos es solo dar vuelta el predicado:
  // `vale(v) === true` significa "guardalo", y `resolverConCache` guarda cuando
  // NO hubo `fallo`.
  return resolverConCache<T>({
    clave: key,
    ttl,
    backend: backendCache,
    producir: async () => {
      const valor = await fetcher();
      return { valor, fallo: !vale(valor) };
    },
  });
}

// --- El turno del Home (Etapa 2, #17) ----------------------------------------
// Las SEIS primitivas de lib/turno.ts sobre el cliente real: `SET NX PX`, `GET`
// y los cuatro scripts Lua de lib/turno-lua.ts (los verificados contra la base,
// §14). Cada script va por EVALSHA; ante NOSCRIPT se manda por EVAL (que además
// lo deja cacheado en el servidor). Se cuentan las tres unidades igual que las
// lecturas: la llamada lógica y su primer intento antes de salir, el comando
// sólo si Redis lo confirmó; los reintentos del SDK, desde su `backoff`. Un
// EVALSHA rechazado con NOSCRIPT es un intento HTTP más de la misma llamada
// lógica y NO un comando confirmado.
//
// Sin credenciales, las mismas primitivas se emulan sobre `mem` con la misma
// semántica (lib/turno-memoria.ts): sólo prueba la secuencia, no coordina
// entre procesos.
//
// 🔴 Acá NO hay `DEL` ni `SET … XX`: liberar y publicar son compare-and-delete
// dentro de los scripts, y este módulo no conoce otra forma de soltar un turno.
const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");
const TODOS_LOS_SCRIPTS = { ...LUA, ...LUA_PAUSA } as const;
const SHA = Object.fromEntries(Object.entries(TODOS_LOS_SCRIPTS).map(([n, t]) => [n, sha1(t)])) as Record<keyof typeof TODOS_LOS_SCRIPTS, string>;

async function comandoTurno<T>(fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  anotar((m) => { m.redis.modo = "redis"; m.redis.llamadasLogicas += 1; m.redis.intentosHttp += 1; });
  try {
    const v = await fn();
    anotar((m) => { m.redis.comandos += 1; });
    return v;
  } finally {
    anotar((m) => { m.redis.ms += Date.now() - t0; });
  }
}
// Un script por EVALSHA; ante NOSCRIPT, el mismo pedido por EVAL. `crudo` devuelve
// lo que vino del transporte SIN convertir: los scripts de la pausa responden
// tuplas que lib/turno.ts y lib/tmdb-pausa.ts validan; los del turno, un número.
async function scriptCrudo(r: Redis, nombre: keyof typeof TODOS_LOS_SCRIPTS, claves: string[], args: string[]): Promise<unknown> {
  try {
    return await comandoTurno(() => r.evalsha<string[], unknown>(SHA[nombre], claves, args));
  } catch (e) {
    if (!/NOSCRIPT/i.test(String(e))) throw e;
    // El mismo pedido lógico, un intento HTTP más; el EVAL confirma el comando.
    anotar((m) => { m.redis.intentosHttp += 1; });
    return r.eval<string[], unknown>(TODOS_LOS_SCRIPTS[nombre], claves, args).then((v) => { anotar((m) => { m.redis.comandos += 1; }); return v; });
  }
}
async function script(r: Redis, nombre: keyof typeof LUA, claves: string[], args: string[]): Promise<number> {
  return Number(await scriptCrudo(r, nombre, claves, args));
}
function opsTurnoRedis(r: Redis): OpsTurno {
  return {
    setNx: (clave, valor, px) => comandoTurno(async () => ((await r.set(clave, valor, { nx: true, px })) === "OK" ? "OK" : null)),
    get: (clave) => comandoTurno(async () => { const v = await r.get<string>(clave); return v === null || v === undefined ? null : String(v); }),
    evalTomar: (claves, args) => scriptCrudo(r, "TOMAR", claves, args),
    evalRenovar: (clave, propietario, px) => script(r, "RENOVAR", [clave], [propietario, String(px)]),
    evalPublicar: (claves, args) => script(r, "PUBLICAR", claves, args),
    evalEnfriar: (claves, args) => script(r, "ENFRIAR", claves, args),
    evalLiberar: (clave, propietario) => script(r, "LIBERAR", [clave], [propietario]),
  };
}
function opsTurnoMemoria(): OpsTurno {
  const base = crearOpsEnMemoria(mem);
  const contar = <A extends unknown[], R>(fn: (...a: A) => Promise<R>) => async (...a: A) => {
    anotar((m) => { m.redis.modo = "memoria"; m.redis.llamadasLogicas += 1; m.redis.comandos += 1; });
    return fn(...a);
  };
  return {
    setNx: contar(base.setNx), get: contar(base.get), evalTomar: contar(base.evalTomar), evalRenovar: contar(base.evalRenovar),
    evalPublicar: contar(base.evalPublicar), evalEnfriar: contar(base.evalEnfriar), evalLiberar: contar(base.evalLiberar),
  };
}
/** Las primitivas del turno del Home, reales o emuladas. Las consume lib/home.ts por `crearTurno`. */
export const opsTurnoHome: OpsTurno = redis ? opsTurnoRedis(redis) : opsTurnoMemoria();

// --- La pausa compartida ante 429 (Etapa 3.c.1, #19) ------------------------
// PAUSAR, CUBO y SALUD van por el cliente principal (reintentos del SDK: el
// script es idempotente por evento). La LECTURA del lector va por
// `redisLector` (timeout propio, sin reintentos) y devuelve lo crudo: la
// validación es del lector.
function opsPausaRedis(r: Redis, lector: Redis): OpsPausa {
  return {
    evalPausar: (claves, args) => scriptCrudo(r, "PAUSAR", claves, args),
    pttl: (clave) => comandoTurno(() => lector.pttl(clave)),
    evalCubo: (claves, args) => scriptCrudo(r, "CUBO", claves, args),
    evalSalud: (claves, args) => scriptCrudo(r, "SALUD", claves, args),
  };
}
function opsPausaMemoria(): OpsPausa {
  const base = crearOpsEnMemoria(mem);
  const contar = <A extends unknown[], R>(fn: (...a: A) => Promise<R>) => async (...a: A) => {
    anotar((m) => { m.redis.modo = "memoria"; m.redis.llamadasLogicas += 1; m.redis.comandos += 1; });
    return fn(...a);
  };
  return { evalPausar: contar(base.evalPausar), pttl: contar(base.pttl), evalCubo: contar(base.evalCubo), evalSalud: contar(base.evalSalud) };
}
/** Las primitivas de la pausa, reales o emuladas. Las consumen `pausaTmdb` y /api/health. */
export const opsPausaHome: OpsPausa = redis && redisLector ? opsPausaRedis(redis, redisLector) : opsPausaMemoria();
/**
 * LA pausa de este proceso (un uuid por proceso: parte del id de evento y de
 * la marca de agua). lib/tmdb.ts la alimenta (429, permisos del semáforo) y
 * lib/home-servir.ts la consulta. Kill switch: `TMDB_PAUSA_429=0`.
 */
export const pausaTmdb = crearPausa({ ops: opsPausaHome, uuid: randomUUID(), activa: pausaActiva(process.env) });

/** Varias claves en UN comando: N `batchGet` en el mismo tick son un MGET. */
export function leerVarias<T>(claves: string[]): Promise<(T | null)[]> {
  return Promise.all(claves.map((k) => batchGet<T>(k)));
}

// --- Motor "del día": determinístico por fecha ---
// `dailySeed` se mudó a `lib/fecha.ts` (función pura, sin `server-only`) para
// poder testearla y para que el día argentino sea uno solo en toda la app. Se
// re-exporta desde acá porque medio proyecto la importa de `./cache`.
export { dailySeed } from "./fecha";
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Elige `n` títulos del pool, determinístico por día. `offset` AVANZA por el
// pool (0 = los primeros n, 1 = los n siguientes...), y da la vuelta al final.
//
// Antes el offset se sumaba a la semilla y se rebarajaba todo: cada "Mostrame
// otras" era una tirada nueva sobre el mismo pool, así que por azar la mayoría
// de los títulos se repetía (el dueño reportó "solo trae 2 nuevas"). El shuffle
// ahora depende SOLO de la fecha, y el offset pagina sobre ese orden fijo.
export function pickDaily<T>(pool: T[], n: number, seed: number, offset = 0): T[] {
  if (!pool.length || n <= 0) return [];
  const rng = mulberry32(seed);
  const c = [...pool];
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  if (n >= c.length) return c;
  const start = ((offset * n) % c.length + c.length) % c.length;
  const out = c.slice(start, start + n);
  // Si la tanda cae al final del pool, se completa desde el principio.
  if (out.length < n) out.push(...c.slice(0, n - out.length));
  return out;
}
