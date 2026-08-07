import { Redis } from "@upstash/redis";

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
    await redis.set(k, "1", { ex: 60 });
    const v = await redis.get<string>(k);
    if (v !== "1") return { ok: false, detalle: `escribió pero leyó ${JSON.stringify(v)}` };
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
} as const;

export async function cached<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {
  if (redis) {
    const hit = await redis.get<T>(key);
    if (hit !== null && hit !== undefined) return hit;
    const data = await fetcher();
    await redis.set(key, data, { ex: ttl });
    return data;
  }
  const now = Date.now();
  const hit = mem.get(key);
  if (hit && hit.exp > now) return hit.v as T;
  const data = await fetcher();
  mem.set(key, { v: data, exp: now + ttl * 1000 });
  return data;
}

// --- Motor "del día": determinístico por fecha ---
export function dailySeed(date = new Date()): number {
  const s = date.toISOString().slice(0, 10);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function pickDaily<T>(pool: T[], n: number, seed: number, offset = 0): T[] {
  const rng = mulberry32(seed + offset);
  const c = [...pool];
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c.slice(0, n);
}
