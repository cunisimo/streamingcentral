#!/usr/bin/env node
// Medición de la filmografía de personas (`personFilmography`), antes y después
// del arreglo de roles y del recorte a 40.
//
//   node --env-file=.env.local --import ./scripts/cargar-lib.mjs \
//        scripts/medir-filmografia.mjs <personId> <providers> [--ids=movie:1,movie:2]
//
// Una persona por PROCESO: el cache en memoria arranca vacío, así que la
// primera llamada es la fría y la segunda (en el mismo proceso) la caliente.
// Sin credenciales `KV_*` el cache es en memoria: NO escribe en el Redis de
// producción. Sólo lee TMDB y Supabase (publishedIds).
//
// Imprime conteos, llamadas a TMDB, tiempo de pared y bytes del JSON. Acepta
// las dos formas de respuesta (la vieja `{ titles, hidden }` y la nueva por
// secciones) para poder comparar con el mismo instrumento.
import { withMetricas } from "../lib/metricas.ts";

const [idArg, provArg = "", ...resto] = process.argv.slice(2);
if (!idArg) throw new Error("uso: medir-filmografia.mjs <personId> <providers> [--ids=movie:1,...]");
const providers = provArg.split(",").filter(Boolean);
const buscar = (resto.find((a) => a.startsWith("--ids=")) ?? "--ids=").slice(6).split(",").filter(Boolean);

const { personFilmography } = await import("../lib/enrich.ts");

async function corrida(etiqueta) {
  const t0 = Date.now();
  const { res, metricas } = await withMetricas(() => personFilmography(Number(idArg), providers));
  const ms = Date.now() - t0;
  const bytes = Buffer.byteLength(JSON.stringify(res));
  const secciones = {};
  for (const k of ["direccion", "actuacion"]) {
    if (Array.isArray(res[k])) {
      secciones[k] = {
        total: res[k].length,
        enTusPlataformas: res[k].filter((t) => t.platforms.some((p) => providers.includes(p))).length,
      };
    }
  }
  const todos = [...(res.titles ?? []), ...(res.direccion ?? []), ...(res.actuacion ?? [])];
  const presentes = Object.fromEntries(buscar.map((k) => {
    const [tipo, id] = k.split(":");
    const donde = [];
    if ((res.direccion ?? []).some((t) => t.type === tipo && t.id === Number(id))) donde.push("direccion");
    if ((res.actuacion ?? []).some((t) => t.type === tipo && t.id === Number(id))) donde.push("actuacion");
    if ((res.titles ?? []).some((t) => t.type === tipo && t.id === Number(id))) donde.push("titles");
    return [k, donde.length ? donde.join("+") : "AUSENTE"];
  }));
  console.log(JSON.stringify({
    etiqueta, persona: res.person?.name, providers: providers.join(","), ms, bytes,
    legacy: res.titles ? { titles: res.titles.length, hidden: res.hidden } : null,
    secciones,
    distintos: new Set(todos.map((t) => `${t.type}:${t.id}`)).size,
    tmdb: {
      intentos: metricas.tmdb.intentos, ok: metricas.tmdb.ok,
      http429: metricas.tmdb.errores.http429, http5xx: metricas.tmdb.errores.http5xx,
      timeout: metricas.tmdb.errores.timeout, red: metricas.tmdb.errores.red,
    },
    degradacion: res.degradacion ?? null,
    presentes,
  }));
}

await corrida("fria");
await corrida("caliente");
