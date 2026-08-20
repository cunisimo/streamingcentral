#!/usr/bin/env node
// Orden actual contra orden por afinidad, sobre el MISMO pool de candidatos.
//
//   node --env-file=.env.local --import ./scripts/cargar-lib.mjs \
//        scripts/medir-puntaje-reco.mjs
//
// Rearma el pool igual que `armar()` en lib/reco.ts —mismos orígenes, mismos dos
// caminos, mismas exclusiones— y ahí se bifurca en las tres estrategias. Como el
// pool es uno solo, la comparación es limpia: lo único que cambia es el orden.
//
// PRIVACIDAD: las señales son títulos del catálogo escritos acá abajo. No lee
// `votes` ni `user_items` de nadie.
import { titleDetails, tmdbKeywords, discover } from "../lib/tmdb.ts";
import { codesToTmdbIds } from "../lib/providers-ar.ts";
import { resolveCategory, genreIdsToSlugs } from "../lib/categories.ts";
import { intercalarPorOrigen, mezclarTipos } from "../lib/reco-mezcla.ts";
import {
  coincidencia, componentes, esAnime, mejorRespaldo, ordenarGlobalConTope,
  ordenarTurnosPonderados, permiteAnime, PESOS,
} from "../lib/reco-puntaje.ts";

const P = ["n", "d", "m"];
const IDS = codesToTmdbIds(P);
const otro = (t) => (t === "movie" ? "tv" : "movie");
const clave = (t, id) => `${t}:${id}`;

// Perfil de usuario SIN nada de anime. Es el caso reportado.
const SIN_ANIME = [
  { tipo: "movie", id: 603, peso: 3 },      // Matrix — el que trajo Bleach
  { tipo: "movie", id: 27205, peso: 3 },    // El origen
  { tipo: "tv", id: 1396, peso: 2 },        // Breaking Bad
  { tipo: "movie", id: 496243, peso: 2 },   // Parásitos
  { tipo: "tv", id: 66732, peso: 1 },       // Stranger Things
  { tipo: "movie", id: 155, peso: 1 },      // Batman TDK
];
// El mismo perfil, con UNA señal positiva de anime.
const CON_ANIME = [...SIN_ANIME.slice(0, 5), { tipo: "tv", id: 1429, peso: 2 }]; // Attack on Titan

let llamadas = 0;
async function perfilDe(tipo, id) {
  llamadas++;
  const d = await titleDetails(tipo, id);
  llamadas++;
  const propias = (await tmdbKeywords(tipo, id)).map((k) => k.id);
  const slugs = genreIdsToSlugs((d.genres ?? []).map((g) => g.id));
  const delMapeo = [...new Set(slugs.flatMap((s) => resolveCategory(s, otro(tipo)).keywords ?? []))];
  const generosOpuesto = [...new Set(slugs.flatMap((s) => resolveCategory(s, otro(tipo)).genres ?? []))];
  return {
    titulo: d.title || d.name || "",
    keywords: [...new Set([...propias, ...delMapeo])].slice(0, 4),
    generosOpuesto,
    generosPropios: (d.genres ?? []).map((g) => g.id),
    idioma: d.original_language ?? "",
    recomendados: d.recommendations?.results ?? [],
  };
}

async function poolDe(senales) {
  const porOrigen = [];
  for (const o of senales) {
    const perfil = await perfilDe(o.tipo, o.id);
    let cruzados = [];
    if (perfil.keywords.length) {
      llamadas++;
      const r = await discover(otro(o.tipo), {
        keywords: perfil.keywords,
        genres: perfil.generosOpuesto.length ? perfil.generosOpuesto : undefined,
        providers: IDS, minVotes: 0,
      });
      cruzados = r.results;
    }
    porOrigen.push({ origen: o, perfil, mismos: perfil.recomendados, cruzados });
  }

  const porClaveMap = new Map();
  const sumar = (tipo, raw, camino, o, pos) => {
    const k = clave(tipo, raw.id);
    const esperados = camino === "mismo" ? o.perfil.generosPropios : o.perfil.generosOpuesto;
    const respaldo = {
      origenId: o.origen.id, origenTipo: o.origen.tipo, origenTitulo: o.perfil.titulo,
      fuerza: o.origen.peso, camino, pos,
      tema: coincidencia(raw.genre_ids ?? [], esperados),
    };
    const ya = porClaveMap.get(k);
    if (ya) { ya.apoyos++; ya.respaldo = mejorRespaldo(ya.respaldo, respaldo); return; }
    porClaveMap.set(k, { tipo, type: tipo, raw, apoyos: 1, respaldo });
  };
  for (const o of porOrigen) {
    o.mismos.forEach((r, i) => sumar(o.origen.tipo, r, "mismo", o, i + 1));
    o.cruzados.forEach((r, i) => sumar(otro(o.origen.tipo), r, "cruce", o, i + 1));
  }
  const excl = new Set(senales.map((s) => clave(s.tipo, s.id)));
  return {
    cands: [...porClaveMap.values()].filter((c) => !excl.has(clave(c.tipo, c.raw.id))),
    porOrigen,
  };
}

const comoCandidato = (c) => ({
  tipo: c.tipo, id: c.raw.id, apoyos: c.apoyos, respaldo: c.respaldo,
  generos: c.raw.genre_ids ?? [], idioma: c.raw.original_language ?? "",
});
const nombre = (c) => c.raw.title || c.raw.name || `#${c.raw.id}`;

function resumen(etiqueta, lista) {
  // `mezclarTipos` es lo último del pipeline real, así que se aplica igual para
  // que los 20 finales sean comparables con lo que ve el usuario.
  const veinte = mezclarTipos(lista, 20, 10);
  const animes = veinte.filter((c) => esAnime(comoCandidato(c)));
  const origenes = new Set(veinte.map((c) => clave(c.respaldo.origenTipo, c.respaldo.origenId)));
  const pelis = veinte.filter((c) => c.tipo === "movie").length;
  const fuerzaProm = veinte.reduce((a, c) => a + c.respaldo.fuerza, 0) / (veinte.length || 1);
  const temaProm = veinte.reduce((a, c) => a + c.respaldo.tema, 0) / (veinte.length || 1);
  console.log(
    `  ${etiqueta.padEnd(26)} ${String(veinte.length).padStart(2)} títulos · ` +
    `${pelis}p/${veinte.length - pelis}s · ${origenes.size} orígenes · ` +
    `fuerza ${fuerzaProm.toFixed(2)} · tema ${temaProm.toFixed(2)} · ` +
    `${animes.length} anime`,
  );
  return { veinte, animes, origenes: origenes.size, pelis, fuerzaProm, temaProm };
}

// ============================================================================
console.log("\n=== PERFIL SIN NINGUNA SEÑAL DE ANIME ===\n");
const { cands, porOrigen } = await poolDe(SIN_ANIME);
const llamadasPool = llamadas;
console.log(`Pool: ${cands.length} candidatos · ${llamadasPool} llamadas a TMDB para armarlo\n`);

const permite = permiteAnime(porOrigen.map((o) => ({ generos: o.perfil.generosPropios, idioma: o.perfil.idioma })));
console.log(`¿Algún origen es anime? ${permite ? "SÍ" : "NO"} → el guard ${permite ? "no filtra" : "FILTRA"}\n`);
const sinAnime = permite ? cands : cands.filter((c) => !esAnime(comoCandidato(c)));
console.log(`Anime en el pool: ${cands.filter((c) => esAnime(comoCandidato(c))).length} · tras el guard: ` +
            `${sinAnime.filter((c) => esAnime(comoCandidato(c))).length}\n`);

console.log("Órdenes, sobre el MISMO pool ya filtrado:");
const actual = resumen("actual (intercalado)", intercalarPorOrigen(sinAnime.map((c) => ({ ...c, porque: { id: c.respaldo.origenId, tipo: c.respaldo.origenTipo } }))));
for (const tope of [3, 4, 5, 6, 8]) {
  resumen(`global, tope ${tope}`, ordenarGlobalConTope(sinAnime, comoCandidato, tope));
}
resumen("turnos ponderados", ordenarTurnosPonderados(sinAnime, comoCandidato));

// --- El caso de regresión ---------------------------------------------------
console.log("\n=== CASO DE REGRESIÓN: Bleach desde Matrix ===");
const bleachEnPool = cands.find((c) => c.raw.id === 30984 && c.tipo === "tv");
if (!bleachEnPool) {
  console.log("  Bleach NO está en el pool de hoy (TMDB reordena a diario).");
} else {
  const k = componentes(comoCandidato(bleachEnPool));
  console.log(`  En el pool: SÍ · origen=${bleachEnPool.respaldo.origenTitulo} · camino=${bleachEnPool.respaldo.camino}`);
  console.log(`  posTMDB=${bleachEnPool.respaldo.pos} · fuerza=${bleachEnPool.respaldo.fuerza} · tema=${k.tema.toFixed(2)} · total=${k.total.toFixed(3)}`);
  console.log(`  tema ${k.tema.toFixed(2)} → el puntaje temático NO lo baja; lo que lo saca es el guard.`);
  const idxActual = intercalarPorOrigen(cands.map((c) => ({ ...c, porque: { id: c.respaldo.origenId, tipo: c.respaldo.origenTipo } }))).findIndex((c) => c.raw.id === 30984);
  console.log(`  posición con el orden ACTUAL y sin guard: ${idxActual + 1}`);
  console.log(`  ¿sobrevive al guard?  ${sinAnime.some((c) => c.raw.id === 30984) ? "SÍ ✘" : "NO ✔"}`);
}

// --- ¿De qué depende que Bleach llegue a mostrarse? -------------------------
// La posición 127 con seis señales quedaría FUERA de VENTANA (80) y ni siquiera
// se enriquecería. Con MENOS señales hay menos grupos en el round-robin y los
// candidatos del cruce suben. Esto mide cuántas señales hacen falta para que
// llegue a la pantalla — o sea a quién le pasa el bug.
console.log("\nCon cuantas senales llega Bleach a mostrarse?");
for (const n of [1, 2, 3, 4, 6]) {
  const { cands: cs } = await poolDe(SIN_ANIME.slice(0, n));
  const orden = intercalarPorOrigen(cs.map((c) => ({ ...c, porque: { id: c.respaldo.origenId, tipo: c.respaldo.origenTipo } })));
  const i2 = orden.findIndex((c) => c.raw.id === 30984);
  console.log(`  ${n} senales -> posicion ${i2 + 1} de ${orden.length} · ` +
              `${i2 >= 0 && i2 < 80 ? "DENTRO de la ventana de 80" : "fuera de la ventana"}`);
}

// ============================================================================
console.log("\n=== EL MISMO PERFIL, CON UNA SEÑAL POSITIVA DE ANIME ===\n");
llamadas = 0;
const conA = await poolDe(CON_ANIME);
const permite2 = permiteAnime(conA.porOrigen.map((o) => ({ generos: o.perfil.generosPropios, idioma: o.perfil.idioma })));
console.log(`¿Algún origen es anime? ${permite2 ? "SÍ" : "NO"} → el guard ${permite2 ? "NO filtra" : "filtra"}`);
const pool2 = permite2 ? conA.cands : conA.cands.filter((c) => !esAnime(comoCandidato(c)));
console.log(`Anime en el pool: ${conA.cands.filter((c) => esAnime(comoCandidato(c))).length} · tras el guard: ${pool2.filter((c) => esAnime(comoCandidato(c))).length}\n`);
resumen("global, tope 5", ordenarGlobalConTope(pool2, comoCandidato, 5));

console.log(`\nLlamadas a TMDB: ${llamadasPool} antes del cambio, ${llamadasPool} después.`);
console.log("El puntaje usa solo datos que ya venían en esas respuestas.\n");
console.log(`Pesos: ${JSON.stringify(PESOS)}\n`);
