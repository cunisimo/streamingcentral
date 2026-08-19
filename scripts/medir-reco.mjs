#!/usr/bin/env node
// Arnés del riel "Elegidas para vos": los CUATRO caminos, con el embudo completo.
//
//   node --env-file=.env.local --import ./scripts/cargar-lib.mjs \
//        scripts/medir-reco.mjs [movie:157336,tv:1399,...]
//
// Mide lo que sobrevive a cada filtro, no lo que TMDB devuelve en bruto. El
// número que importa es el ÚLTIMO: si después de todo quedan menos de 10, el
// riel no se muestra.
//
// PRIVACIDAD: la muestra por defecto son títulos del catálogo, NO señales de un
// usuario real. Este script no lee `votes` ni `user_items` de nadie: recibe los
// orígenes por parámetro. Nada de lo que imprime identifica a una persona.
//
// SOBRE `vote_count`: se registra como CONTEXTO y nada más. No se usa para
// excluir, ni para bajarle peso a nada, ni para afirmar que una recomendación es
// fuerte o débil. Un título con pocos votos no es peor: es menos votado, y en
// esta app eso suele significar cine regional (ver el principio sobre el puntaje
// de TMDB en CLAUDE.md y el issue #12 sobre el piso de 60 votos).
import { codesToTmdbIds } from "../lib/providers-ar.ts";
import { discover, titleDetails } from "../lib/tmdb.ts";
import { enrichRaw } from "../lib/enrich.ts";
import { genreIdsToSlugs, resolveCategory } from "../lib/categories.ts";
import { composeHome } from "../lib/home.ts";

const P = ["n", "d", "m"];
const IDS = codesToTmdbIds(P);
const T = process.env.TMDB_READ_TOKEN;
const otro = (t) => (t === "movie" ? "tv" : "movie");
const clave = (t, id) => `${t}:${id}`;

// Control de respuestas HTTP: sin esto un 429 llega disfrazado de "riel corto".
const http = new Map();
const orig = globalThis.fetch;
globalThis.fetch = async (...a) => {
  const r = await orig(...a);
  if (String(a[0]).includes("themoviedb.org")) http.set(r.status, (http.get(r.status) ?? 0) + 1);
  return r;
};
const resumenHttp = () => [...http].sort((a, b) => a[0] - b[0]).map(([s, n]) => `${s}x${n}`).join(" ");

const api = async (p, q = {}) => {
  const u = new URL("https://api.themoviedb.org/3" + p);
  u.searchParams.set("language", "es-ES");
  for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
  const r = await fetch(u, { headers: { Authorization: `Bearer ${T}`, accept: "application/json" } });
  return r.json();
};

// Muestra por defecto: películas y series del catálogo AR, mezclando tramos de
// votos a propósito para que el informe cubra los dos extremos. Los ids van
// explícitos para que la corrida sea reproducible.
const MUESTRA = [
  "movie:157336",   // Interstellar
  "movie:496243",   // Parásitos
  "movie:475557",   // Joker
  "tv:100088",      // The Last of Us
  "tv:1399",        // Juego de tronos
  "tv:60625",       // Rick y Morty
];
const senales = (process.argv[2]?.split(",").filter(Boolean) ?? MUESTRA)
  .map((s) => { const [tipo, id] = s.split(":"); return { tipo, id: Number(id) }; });

async function candidatosDe(origen) {
  const det = await titleDetails(origen.tipo, origen.id);
  const nombre = det.title || det.name || `(${origen.tipo}:${origen.id})`;
  const out = [];

  // MISMO TIPO: /recommendations ya viene dentro de titleDetails.
  for (const x of det.recommendations?.results ?? []) {
    out.push({ tipo: origen.tipo, raw: x, camino: "mismo", origen: nombre });
  }

  // CRUZADO: keywords propias + las del mapeo de categorías, más los géneros
  // mapeados. Las keywords cruzan tipos de forma nativa en TMDB (mismo espacio
  // de ids); los géneros NO —Acción es 28 en película y 10759 en serie— y el
  // puente es el mismo que ya usan los rieles de género.
  const kwRes = await api(`/${origen.tipo}/${origen.id}/keywords`);
  const propias = (kwRes.keywords ?? kwRes.results ?? []).map((k) => k.id);
  const slugs = genreIdsToSlugs((det.genres ?? []).map((g) => g.id));
  const delMapeo = [...new Set(slugs.flatMap((s) => resolveCategory(s, otro(origen.tipo)).keywords ?? []))];
  const generos = [...new Set(slugs.flatMap((s) => resolveCategory(s, otro(origen.tipo)).genres ?? []))];
  const keywords = [...new Set([...propias, ...delMapeo])].slice(0, 4);

  // SIN NINGUNA KEYWORD NO SE CRUZA. Medido el 2026-08-17: cruzar solo por
  // género da un universo de 2918 títulos contra 29 con keyword — o sea
  // "cualquier drama", no una recomendación.
  let cruce = "no se intenta (sin keywords)";
  if (keywords.length) {
    const d = await discover(otro(origen.tipo), {
      keywords, genres: generos.length ? generos : undefined, providers: IDS, minVotes: 0,
    });
    cruce = `${d.results.length} de ${d.total_results}`;
    for (const x of d.results) {
      out.push({ tipo: otro(origen.tipo), raw: x, camino: "cruce", origen: nombre });
    }
  }
  return { nombre, votos: det.vote_count, keywords: keywords.length, cruce, candidatos: out };
}

const yaCalificado = new Set(senales.map((s) => clave(s.tipo, s.id)));

console.log(`Origenes (${senales.length}) — vote_count va como contexto, no se usa para nada:`);
const porOrigen = [];
for (const s of senales) porOrigen.push(await candidatosDe(s));
for (const o of porOrigen) {
  console.log(`   ${o.nombre.slice(0, 30).padEnd(31)} ${String(o.votos).padStart(6)} votos . ${o.keywords} kw . cruce: ${o.cruce}`);
}

const todos = porOrigen.flatMap((o) => o.candidatos);
const porClave = new Map();
for (const c of todos) {
  const k = clave(c.tipo, c.raw.id);
  const e = porClave.get(k) ?? { ...c, apoyos: 0, origenes: new Set() };
  e.apoyos++; e.origenes.add(c.origen);
  porClave.set(k, e);
}
const unicos = [...porClave.values()];
const sinCalificados = unicos.filter((c) => !yaCalificado.has(clave(c.tipo, c.raw.id)));

const enriquecidos = [];
for (const tipo of ["movie", "tv"]) {
  const delTipo = sinCalificados.filter((c) => c.tipo === tipo);
  if (!delTipo.length) continue;
  const ok = await enrichRaw(delTipo.map((c) => c.raw), tipo, P);
  const vivos = new Set(ok.map((t) => clave(t.type, t.id)));
  enriquecidos.push(...delTipo.filter((c) => vivos.has(clave(c.tipo, c.raw.id))));
}

const home = await composeHome({ providers: P });
const enHome = new Set([...home.hero, ...home.rails.flatMap((r) => r.items)].map((t) => clave(t.type, t.id)));
const finales = enriquecidos.filter((c) => !enHome.has(clave(c.tipo, c.raw.id)));

const pel = finales.filter((c) => c.tipo === "movie").length;
const ser = finales.filter((c) => c.tipo === "tv").length;
console.log(`
EMBUDO
  crudos de los ${senales.length} origenes        ${String(todos.length).padStart(5)}
  unicos (dedup entre origenes)     ${String(unicos.length).padStart(5)}
  sin lo ya calificado              ${String(sinCalificados.length).padStart(5)}
  en las plataformas del usuario    ${String(enriquecidos.length).padStart(5)}
  sin lo que ya esta en el Home     ${String(finales.length).padStart(5)}   <- el que decide
                                          ${pel} peliculas / ${ser} series
  respaldados por 2+ senales        ${String(finales.filter((c) => c.apoyos > 1).length).padStart(5)}

TMDB: ${resumenHttp()}${[...http].some(([s]) => s !== 200) ? "  OJO: hubo respuestas != 200" : ""}`);

console.log("\nLos primeros 12, como los mostraria el riel (mas senales primero):");
for (const c of finales.sort((a, b) => b.apoyos - a.apoyos).slice(0, 12)) {
  console.log(`   [${c.camino === "mismo" ? "=" : "x"}] ${(c.raw.title || c.raw.name || "").slice(0, 34).padEnd(35)} ` +
    `${c.apoyos} senal(es) . porque te gusto: ${[...c.origenes].join(", ").slice(0, 38)}`);
}
