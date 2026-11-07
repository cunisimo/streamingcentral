// SÓLO EXPERIMENTO, en una copia descartable: variantes activables por entorno.
import { readFileSync, writeFileSync } from "node:fs";
const editar = (f, pares) => {
  const c = readFileSync(f, "utf8"); const crlf = c.includes("\r\n"); let s = c.replace(/\r\n/g, "\n");
  for (const [a, b] of pares) { if (s.split(a).length !== 2) throw new Error(f + ": " + a); s = s.replace(a, () => b); }
  writeFileSync(f, crlf ? s.replace(/\n/g, "\r\n") : s);
};
// 1. Sin la copia `disp:` por título: se resuelve de `pv3:`, `oficial:` y `disp:top-manual`.
editar("lib/enrich.ts", [
  ["  const res = await cachedIf(`disp:${type}:${id}`, TTL.editorial, async () => {", "  const sinCopia = process.env.EXP_SIN_DISP === \"1\";\n  const resolver = async () => {"],
  ["    return r.plataformas;\n  }, () => !fallo);\n  return res;", "    return r.plataformas;\n  };\n  if (sinCopia) return resolver();\n  const res = await cachedIf(`disp:${type}:${id}`, TTL.editorial, resolver, () => !fallo);\n  return res;"],
  // 3. Tráiler: guardar también "no tiene", para no reescribir en cada visita.
  ["  const trailer = await cached(`videos:${type}:${id}`, TTL.providers, async () =>\n    pickTrailer((await titleVideos(type, id, lang)).results, lang)).catch(",
   "  const trailer = await cached(`videos:${type}:${id}`, TTL.providers, async () => {\n    const t = pickTrailer((await titleVideos(type, id, lang)).results, lang);\n    return process.env.EXP_VIDEOS === \"1\" ? (t ?? (\"-\" as never)) : t;\n  }).then((t) => ((t as unknown) === \"-\" ? null : t)).catch("],
]);
// 2. Una sola lectura en vuelo de `disp:top-manual` por proceso.
editar("lib/top-manual.ts", [
  ["export async function evidenciaTopManual(): Promise<Map<string, PlatformCode[]>> {\n  const filas = await resolverConCache<FilaEvidencia[]>({",
   "let enVueloEvidencia: Promise<Map<string, PlatformCode[]>> | null = null;\nexport function evidenciaTopManual(): Promise<Map<string, PlatformCode[]>> {\n  if (process.env.EXP_SF_TM !== \"1\") return evidenciaTopManualSinMemo();\n  enVueloEvidencia ??= evidenciaTopManualSinMemo().finally(() => { enVueloEvidencia = null; });\n  return enVueloEvidencia;\n}\nasync function evidenciaTopManualSinMemo(): Promise<Map<string, PlatformCode[]>> {\n  const filas = await resolverConCache<FilaEvidencia[]>({"],
]);
// 4. Una sola producción en vuelo por clave en `cached()`, por proceso.
editar("lib/cache.ts", [
  ["export async function cached<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {\n  const hit = await batchGet<T>(key);",
   "const enVueloCached = new Map<string, Promise<unknown>>();\nexport function cached<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {\n  if (process.env.EXP_SF_CACHED !== \"1\") return cachedSinMemo(key, ttl, fetcher);\n  const ya = enVueloCached.get(key) as Promise<T> | undefined;\n  if (ya) return ya;\n  const p = cachedSinMemo(key, ttl, fetcher).finally(() => { enVueloCached.delete(key); });\n  enVueloCached.set(key, p);\n  return p;\n}\nasync function cachedSinMemo<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {\n  const hit = await batchGet<T>(key);"],
]);
console.log("exp ok");
