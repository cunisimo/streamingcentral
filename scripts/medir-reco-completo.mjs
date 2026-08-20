#!/usr/bin/env node
// El pipeline ENTERO: candidatos → orden → enriquecido → plataformas → 20.
//
//   VARIANTE=baseline node --env-file=.env.local --import ./scripts/cargar-lib.mjs \
//        scripts/medir-reco-completo.mjs
//   VARIANTE=nuevo    node --env-file=.env.local --import ./scripts/cargar-lib.mjs \
//        scripts/medir-reco-completo.mjs
//
// POR QUÉ NO ALCANZABA LA MEDICIÓN ANTERIOR. Cortaba antes de `enrichRaw`, así
// que sus "20 títulos · 10p/10s" eran los 20 mejores de los CANDIDATOS, no los
// que sobreviven. Y ahí se cae la mayoría: los del camino "mismo" vienen de
// `/recommendations`, que no filtra por plataforma. Esa pérdida es justamente la
// razón de que VENTANA sea 80 y no 25.
//
// SE CORRE UNA VEZ POR VARIANTE, en procesos separados, porque el cache en
// memoria se comparte dentro del proceso: si las dos corrieran juntas, la
// segunda mediría con todo caliente y el conteo de llamadas no sería comparable.
//
// PRIVACIDAD: las señales son títulos del catálogo escritos acá abajo.
import { titleDetails, tmdbKeywords, discover } from "../lib/tmdb.ts";
import { enrichRaw } from "../lib/enrich.ts";
import { codesToTmdbIds } from "../lib/providers-ar.ts";
import { resolveCategory, genreIdsToSlugs } from "../lib/categories.ts";
import { intercalarPorOrigen, mezclarTipos } from "../lib/reco-mezcla.ts";
import {
  coincidencia, esAnime, mejorRespaldo, ordenarTurnosPonderados, permiteAnime,
} from "../lib/reco-puntaje.ts";

const VARIANTE = process.env.VARIANTE === "nuevo" ? "nuevo" : "baseline";
const VENTANA = 80, OBJETIVO = 20, POR_TIPO = 10;
const otro = (t) => (t === "movie" ? "tv" : "movie");
const clave = (t, id) => `${t}:${id}`;

// --- contador de llamadas REALES a TMDB -------------------------------------
// Envuelve fetch: es el único punto por el que pasa todo, incluido `providersOf`
// dentro de `enrichRaw`, que es lo que la medición anterior no contaba.
let llamadas = 0;
const fetchOriginal = globalThis.fetch;
globalThis.fetch = (...args) => {
  const url = typeof args[0] === "string" ? args[0] : args[0]?.url ?? "";
  if (url.includes("api.themoviedb.org")) llamadas++;
  return fetchOriginal(...args);
};

const SENALES = [
  { tipo: "movie", id: 603, peso: 3 },      // Matrix — el que trajo Bleach
  { tipo: "movie", id: 27205, peso: 3 },    // El origen
  { tipo: "tv", id: 1396, peso: 2 },        // Breaking Bad
  { tipo: "movie", id: 496243, peso: 2 },   // Parásitos
  { tipo: "tv", id: 66732, peso: 1 },       // Stranger Things
  { tipo: "movie", id: 155, peso: 1 },      // Batman TDK
];

async function perfilDe(tipo, id) {
  const d = await titleDetails(tipo, id);
  const propias = (await tmdbKeywords(tipo, id)).map((k) => k.id);
  const slugs = genreIdsToSlugs((d.genres ?? []).map((g) => g.id));
  return {
    titulo: d.title || d.name || "",
    keywords: [...new Set([...propias, ...slugs.flatMap((s) => resolveCategory(s, otro(tipo)).keywords ?? [])])].slice(0, 4),
    generosOpuesto: [...new Set(slugs.flatMap((s) => resolveCategory(s, otro(tipo)).genres ?? []))],
    generosPropios: (d.genres ?? []).map((g) => g.id),
    idioma: d.original_language ?? "",
    recomendados: d.recommendations?.results ?? [],
  };
}

async function correr(senales, providers) {
  const ids = codesToTmdbIds(providers);
  const porOrigen = [];
  for (const o of senales) {
    const perfil = await perfilDe(o.tipo, o.id);
    let cruzados = [];
    if (perfil.keywords.length && ids.length) {
      const r = await discover(otro(o.tipo), {
        keywords: perfil.keywords,
        genres: perfil.generosOpuesto.length ? perfil.generosOpuesto : undefined,
        providers: ids, minVotes: 0,
      });
      cruzados = r.results;
    }
    porOrigen.push({ origen: o, perfil, mismos: perfil.recomendados, cruzados });
  }

  const mapa = new Map();
  const sumar = (tipo, raw, camino, o, pos) => {
    const k = clave(tipo, raw.id);
    const esperados = camino === "mismo" ? o.perfil.generosPropios : o.perfil.generosOpuesto;
    const respaldo = {
      origenId: o.origen.id, origenTipo: o.origen.tipo, origenTitulo: o.perfil.titulo,
      fuerza: o.origen.peso, camino, pos,
      tema: coincidencia(raw.genre_ids ?? [], esperados),
    };
    const ya = mapa.get(k);
    if (ya) { ya.apoyos++; ya.respaldo = mejorRespaldo(ya.respaldo, respaldo); return; }
    mapa.set(k, { tipo, raw, apoyos: 1, respaldo });
  };
  for (const o of porOrigen) {
    o.mismos.forEach((r, i) => sumar(o.origen.tipo, r, "mismo", o, i + 1));
    o.cruzados.forEach((r, i) => sumar(otro(o.origen.tipo), r, "cruce", o, i + 1));
  }

  const excl = new Set(senales.map((s) => clave(s.tipo, s.id)));
  let vivos = [...mapa.values()].filter((c) => !excl.has(clave(c.tipo, c.raw.id)));
  const comoCand = (c) => ({
    tipo: c.tipo, id: c.raw.id, apoyos: c.apoyos, respaldo: c.respaldo,
    generos: c.raw.genre_ids ?? [], idioma: c.raw.original_language ?? "",
  });

  // La ÚNICA diferencia entre variantes: el guard y el orden.
  if (VARIANTE === "nuevo") {
    const permite = permiteAnime(porOrigen.map((o) => ({ generos: o.perfil.generosPropios, idioma: o.perfil.idioma })));
    if (!permite) vivos = vivos.filter((c) => !esAnime(comoCand(c)));
  }
  const ordenados = VARIANTE === "nuevo"
    ? ordenarTurnosPonderados(vivos, comoCand).slice(0, VENTANA)
    : intercalarPorOrigen(
        vivos.map((c) => ({ ...c, porque: { id: c.respaldo.origenId, tipo: c.respaldo.origenTipo } })),
      ).slice(0, VENTANA);

  // --- EL PASO QUE FALTABA: enriquecido + filtro de plataformas -------------
  const enriquecidos = [];
  await Promise.all(["movie", "tv"].map(async (tipo) => {
    const delTipo = ordenados.filter((c) => c.tipo === tipo);
    if (!delTipo.length) return;
    const ok = await enrichRaw(delTipo.map((c) => c.raw), tipo, providers);
    const meta = new Map(delTipo.map((c) => [clave(c.tipo, c.raw.id), c]));
    for (const t of ok) {
      const m = meta.get(clave(t.type, t.id));
      if (m) enriquecidos.push({ ...t, _c: m });
    }
  }));

  const reord = VARIANTE === "nuevo"
    ? ordenarTurnosPonderados(enriquecidos, (t) => comoCand(t._c))
    : intercalarPorOrigen(enriquecidos.map((t) => ({
        ...t, porque: { id: t._c.respaldo.origenId, tipo: t._c.respaldo.origenTipo }, apoyos: t._c.apoyos,
      })));
  const items = mezclarTipos(reord, OBJETIVO, POR_TIPO);

  const cs = items.map((t) => t._c);
  const n = cs.length || 1;
  return {
    candidatos: vivos.length,
    aLaVentana: ordenados.length,
    sobrevivieron: enriquecidos.length,
    final: items.length,
    pelis: items.filter((t) => t.type === "movie").length,
    origenes: new Set(cs.map((c) => clave(c.respaldo.origenTipo, c.respaldo.origenId))).size,
    fuerza: cs.reduce((a, c) => a + c.respaldo.fuerza, 0) / n,
    tema: cs.reduce((a, c) => a + c.respaldo.tema, 0) / n,
    anime: cs.filter((c) => esAnime(comoCand(c))).length,
  };
}

console.log(`\n=== VARIANTE: ${VARIANTE} ===`);
console.log("(baseline = intercalado por origen, sin guard · nuevo = turnos ponderados + guard)\n");
console.log("plataformas  señales  cands  ventana  sobrev  FINAL  p/s    orígenes  fuerza  tema  anime");
console.log("-".repeat(92));

for (const provs of [["n", "d", "m"], ["n"]]) {
  for (const nSen of [1, 2, 3, 6]) {
    const r = await correr(SENALES.slice(0, nSen), provs);
    console.log(
      `${provs.join(",").padEnd(12)} ${String(nSen).padStart(7)} ` +
      `${String(r.candidatos).padStart(6)} ${String(r.aLaVentana).padStart(8)} ` +
      `${String(r.sobrevivieron).padStart(7)} ${String(r.final).padStart(6)} ` +
      `${`${r.pelis}/${r.final - r.pelis}`.padStart(6)} ${String(r.origenes).padStart(9)} ` +
      `${r.fuerza.toFixed(2).padStart(7)} ${r.tema.toFixed(2).padStart(5)} ${String(r.anime).padStart(6)}`,
    );
  }
}
console.log("-".repeat(92));
console.log(`\nLlamadas REALES a TMDB en toda la matriz (incluye providersOf del enriquecido): ${llamadas}`);
console.log("Este es el punto de medición que faltaba: las 18 de antes eran solo el armado del pool.\n");
