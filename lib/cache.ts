// `server-only` es un guard de BUILD: acá viven las credenciales de Upstash, y
// este módulo ya se coló una vez en el bundle del navegador (70 KB del cliente
// de Redis). tsc no caza esa regresión; esto la convierte en error de
// compilación si algún "use client" importa un valor de acá.
import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { Redis } from "@upstash/redis";
import type { ClaveLocalizada } from "./claves";
import { resolverConCache, type BackendCache } from "./reparar-y-cachear";

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
  if (redisUrl && redisToken) redis = new Redis({ url: redisUrl, token: redisToken });
} catch { redis = null; }

const mem = new Map<string, { v: unknown; exp: number }>();

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
} as const;

// --- Métricas por operación --------------------------------------------------
// Para poder comparar antes/después de un cambio en la estrategia de lectura
// hace falta saber cuántos COMANDOS se mandaron (que es lo que cobra Upstash) y
// cuántos VIAJES HTTP (que es lo que se paga en latencia). No son lo mismo: un
// MGET de 100 claves es 1 comando y 1 viaje; 100 GET son 100 y 100.
//
// AsyncLocalStorage y no un contador global: en Vercel conviven varios requests
// en la misma instancia y un contador de módulo mezclaría los números de todos.
export interface CacheMetrics {
  comandos: number;   // unidades que factura Upstash
  requests: number;   // viajes HTTP (round-trips)
  claves: number;     // claves pedidas (después de deduplicar)
  hits: number;
  misses: number;
  lotes: number[];    // tamaño de cada MGET
  msCache: number;    // tiempo dentro del cache
}
const alsMetrics = new AsyncLocalStorage<CacheMetrics>();
const nuevasMetricas = (): CacheMetrics => ({
  comandos: 0, requests: 0, claves: 0, hits: 0, misses: 0, lotes: [], msCache: 0,
});

// Corre `fn` con un contador propio y devuelve el resultado junto a las métricas.
export async function withCacheMetrics<T>(fn: () => Promise<T>): Promise<{ res: T; metricas: CacheMetrics }> {
  const metricas = nuevasMetricas();
  const res = await alsMetrics.run(metricas, fn);
  return { res, metricas };
}

// El batcher es de módulo (las claves son globales), así que un lote puede
// mezclar claves de dos requests concurrentes y las métricas se le anotan a
// quien programó el flush. Para diagnóstico está bien; no lo uses para facturar.
function anotar(fn: (m: CacheMetrics) => void) {
  const m = alsMetrics.getStore();
  if (m) fn(m);
}

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
type Espera = { resolve: (v: unknown) => void; reject: (e: unknown) => void };
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
    anotar((m) => { m.comandos += 1; m.claves += 1; if (vivo) m.hits++; else m.misses++; });
    return vivo ? (hit!.v as T) : null;
  }
  const t0 = Date.now();
  try {
    const v = await redis.get<T>(key);
    anotar((m) => {
      m.comandos += 1; m.requests += 1; m.claves += 1;
      if (v === null || v === undefined) m.misses++; else m.hits++;
    });
    return v ?? null;
  } catch (err) {
    anotar((m) => { m.requests += 1; });
    console.error("[cache] get falló, sigue sin cache:", err);
    return null;
  } finally {
    anotar((m) => { m.msCache += Date.now() - t0; });
  }
}

function batchGet<T>(key: string): Promise<T | null> {
  if (!batchOn) return getSuelto<T>(key);
  return new Promise<T | null>((resolve, reject) => {
    const previos = cola.get(key);
    if (previos) previos.push({ resolve: resolve as (v: unknown) => void, reject });
    else cola.set(key, [{ resolve: resolve as (v: unknown) => void, reject }]);
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
  anotar((m) => { m.claves += claves.length; });

  // Sin Redis (desarrollo) se resuelve contra el Map de memoria, pero se cuenta
  // igual: la cantidad de comandos depende del PATRÓN de acceso —cuántas claves
  // distintas y en cuántos lotes— y no del backend. Así se puede comparar
  // estrategias en local; lo que no se mide sin Redis es la latencia.
  if (!redis) {
    const ahora = Date.now();
    for (let i = 0; i < claves.length; i += LOTE) {
      const lote = claves.slice(i, i + LOTE);
      anotar((m) => { m.comandos += 1; m.lotes.push(lote.length); });
      for (const k of lote) {
        const hit = mem.get(k);
        const vivo = hit && hit.exp > ahora;
        anotar((m) => { if (vivo) m.hits++; else m.misses++; });
        for (const e of actual.get(k) ?? []) e.resolve(vivo ? hit!.v : null);
      }
    }
    return;
  }
  for (let i = 0; i < claves.length; i += LOTE) {
    const lote = claves.slice(i, i + LOTE);
    try {
      const vals = await redis.mget<unknown[]>(...lote);
      anotar((m) => {
        m.comandos += 1; m.requests += 1; m.lotes.push(lote.length);
        for (const v of vals) { if (v === null || v === undefined) m.misses++; else m.hits++; }
      });
      lote.forEach((k, j) => { for (const e of actual.get(k) ?? []) e.resolve(vals[j] ?? null); });
    } catch (err) {
      // Un lote que falla NO puede tumbar el request: el contrato de `cached`
      // ante un Redis caído siempre fue "seguí sin cache", no "explotá".
      anotar((m) => { m.requests += 1; });
      console.error("[cache] mget falló, sigue sin cache:", err);
      for (const k of lote) for (const e of actual.get(k) ?? []) e.resolve(null);
    }
  }
  anotar((m) => { m.msCache += Date.now() - t0; });
}

async function guardar(key: string, data: unknown, ttl: number) {
  if (!redis) {
    mem.set(key, { v: data, exp: Date.now() + ttl * 1000 });
    anotar((m) => { m.comandos += 1; });
    return;
  }
  const t0 = Date.now();
  try {
    await redis.set(key, data, { ex: ttl });
    anotar((m) => { m.comandos += 1; m.requests += 1; });
  } finally {
    anotar((m) => { m.msCache += Date.now() - t0; });
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
