#!/usr/bin/env node
// Medición de la filmografía de personas (issue #25), el MISMO instrumento para
// el código viejo (2af1a37), el rechazado (706fb7a) y el actual.
//
//   node --env-file=.env.local --import ./scripts/cargar-lib.mjs \
//        scripts/medir-filmografia.mjs <etiqueta> <personId> <providers> [--ver-mas] [--contrato=v1|v2]
//
// Una corrida = UN proceso. Para medir "caché vacía" y "Redis caliente" se
// corre dos veces contra el mismo Redis: la primera después de vaciarlo, la
// segunda en un proceso nuevo (sin nada en memoria) con el Redis ya lleno.
// El Redis es el DOBLE del banco (`scripts/banco/dobles.mjs`, REST de Upstash
// en local) vía `UPSTASH_REDIS_REST_URL`: nunca el de Producción.
//
// Qué separa, porque son costos distintos y no se suman:
//   base      peticiones HTTP reales a TMDB de la persona y sus créditos
//             (`/person/{id}`, `/person/{id}/combined_credits`, respaldo de idioma)
//   proveedores / detalle / otras   peticiones HTTP reales a TMDB del resto
//   enriquecedor  invocaciones LÓGICAS al enriquecido por obra (toUITitle en el
//             código viejo; la resolución de disponibilidad en el nuevo),
//             salgan o no a la red
//   redis     hits y misses por clave, y comandos (lo que factura Upstash)
// Una lectura servida por Redis NO es una petición a TMDB: las peticiones se
// cuentan interceptando `fetch` hacia api.themoviedb.org, que es el cable.
import { withMetricas } from "../lib/metricas.ts";

const [etiqueta, idArg, provArg = "", ...resto] = process.argv.slice(2);
if (!etiqueta || !idArg) throw new Error("uso: medir-filmografia.mjs <etiqueta> <personId> <providers> [--ver-mas]");
const providers = provArg.split(",").filter(Boolean);
const conVerMas = resto.includes("--ver-mas");

// --- El cable: cada fetch a TMDB, por familia ---------------------------------
const cable = { base: 0, proveedores: 0, detalle: 0, otras: 0 };
const fetchOriginal = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url instanceof Request ? url.url : url);
  if (u.includes("api.themoviedb.org")) {
    const ruta = new URL(u).pathname.replace(/^\/3/, "");
    if (/^\/person\/\d+(\/combined_credits)?$/.test(ruta)) cable.base++;
    else if (/\/watch\/providers$/.test(ruta)) cable.proveedores++;
    else if (/^\/(movie|tv)\/\d+$/.test(ruta)) cable.detalle++;
    else cable.otras++;
  }
  return fetchOriginal(url, init);
};
const tomarCable = () => { const c = { ...cable }; for (const k of Object.keys(cable)) cable[k] = 0; return c; };

const enrich = await import("../lib/enrich.ts");

async function medir(fn) {
  tomarCable();
  const t0 = Date.now();
  const { res, metricas } = await withMetricas(fn);
  const ms = Date.now() - t0;
  const c = tomarCable();
  return {
    res, ms,
    tmdbReales: c.base + c.proveedores + c.detalle + c.otras, cable: c,
    redis: { modo: metricas.redis.modo, hits: metricas.redis.hits, misses: metricas.redis.misses, comandos: metricas.redis.comandos },
    errores: metricas.tmdb.errores,
  };
}

// Contrato (desde b169d8c la ruta está versionada): `--contrato=v1` mide lo que
// recibe un cliente Android viejo (sin `filmografia=v2`) y `--contrato=v2` lo
// que recibe la web. En los árboles anteriores no hay versiones: la función de
// siempre, y el parámetro se ignora (2af1a37 es "el v1 de antes").
const contrato = (resto.find((a) => a.startsWith("--contrato=")) ?? "--contrato=v2").slice(11);
const abrir = contrato === "v1" && typeof enrich.personFilmographyLegado === "function"
  ? () => enrich.personFilmographyLegado(Number(idArg), providers)
  : () => enrich.personFilmography(Number(idArg), providers);
const apertura = await medir(abrir);
const r = apertura.res;
// Tres formas de respuesta. Se distinguen por lo que traen, no por una sola
// señal: 706fb7a ya tenía secciones pero enriquecía todo (sin `disponibilidad`).
//   2af1a37   { titles, hidden }                    → enriquecía titles + hidden
//   706fb7a   { direccion, actuacion, titles, hidden } → enriquecía TODAS las obras distintas
//   actual    { …, disponibilidad, sinDisponibilidad } → enriquece sólo el bloque
const nuevo = r.disponibilidad !== undefined;
const conSecciones = Array.isArray(r.direccion);
const distintas = conSecciones ? new Set([...r.direccion, ...r.actuacion].map((t) => `${t.type}:${t.id}`)).size : null;
const enriquecidas = nuevo
  ? Object.keys(r.disponibilidad).length + r.sinDisponibilidad.length
  : conSecciones ? distintas : r.titles.length + r.hidden;
const salida = {
  etiqueta, contrato, persona: r.person?.name, providers: providers.join(","),
  apertura: {
    ms: apertura.ms, tmdbReales: apertura.tmdbReales, cable: apertura.cable, enriquecedor: enriquecidas,
    redis: apertura.redis, bytes: Buffer.byteLength(JSON.stringify(r)), errores429: apertura.errores.http429,
  },
  obras: conSecciones
    ? { direccion: r.direccion.length, actuacion: r.actuacion.length, inicial: r.inicial ?? null }
    : { evaluadas: enriquecidas, mostradas: r.titles.length },
};
// Contrato v1: las claves visibles EN ORDEN, para comparar ganados/perdidos
// entre árboles sobre la misma respuesta de TMDB (no sólo la cantidad).
if (!conSecciones) salida.visibles = r.titles.map((t) => `${t.type}:${t.id}`);

// "Ver más": el bloque siguiente de la primera sección (sólo código nuevo).
if (conVerMas && nuevo && r.secciones.length) {
  const { siguienteBloque, claveDe } = await import("../lib/filmografia-bloques.ts");
  const s = r.secciones[0];
  const resueltas = new Set([...Object.keys(r.disponibilidad), ...r.sinDisponibilidad]);
  const { pedir } = siguienteBloque(r[s].map(claveDe), r.inicial[s], (k) => resueltas.has(k));
  if (pedir.length) {
    const vm = await medir(() => enrich.disponibilidadFilmografia(pedir));
    salida.verMas = { seccion: s, enriquecedor: pedir.length, ms: vm.ms, tmdbReales: vm.tmdbReales, cable: vm.cable, redis: vm.redis, bytes: Buffer.byteLength(JSON.stringify(vm.res)) };
  }
}
console.log(JSON.stringify(salida));
