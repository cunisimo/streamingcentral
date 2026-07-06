import { Redis } from "@upstash/redis";

// Si no hay credenciales, cae a un cache en memoria (dev sin Redis).
let redis: Redis | null = null;
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = Redis.fromEnv();
  }
} catch { redis = null; }

const mem = new Map<string, { v: unknown; exp: number }>();

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
