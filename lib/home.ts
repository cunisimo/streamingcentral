// Home Composer — pipeline que arma TODO el Home en un solo lugar.
//
//   TMDB → Audience Filter (lib/audience.ts, ya existente)
//        → Compose (orden + prioridad)
//        → Dedup (tmdb_id + media_type)
//        → [rotate: reservado, hoy identidad]
//        → [personalize: reservado, hoy identidad]
//        → HomePayload
//
// Reglas (ver docs/superpowers/plans/2026-08-06-home-composer.md):
//  - Un título aparece UNA sola vez en todo el Home.
//  - La prioridad es el orden visual: lo que toma un riel se lo quita a los de abajo.
//  - "Para vos hoy" (hero) tiene la prioridad más alta y reserva sus títulos.
//  - "Próximamente" y "Desempatá" NO participan (no reservan ni se filtran):
//    no se construyen acá, siguen siendo sus propios componentes.
//  - Si un riel pierde ítems por dedup, se rellena con más candidatos hasta
//    completar VISIBLE_CARDS. Página extra de TMDB solo como fallback.
import {
  categoryCandidates, enrichRaw, latestReleases, mostVoted, mostPanned,
  audienceTitles, recommendations, type RawTitle,
} from "./enrich";
// HOME_GENRES / defaultTypeFor viven en components/data.ts (módulo client-safe):
// el cliente los necesita para el estado de los toggles, y si los importara de
// acá arrastraría lib/enrich → lib/cache → Upstash Redis al bundle del navegador.
import { HOME_GENRES, defaultTypeFor } from "@/components/data";
import type { MediaType, PlatformCode, UITitle } from "./types";

export const VISIBLE_CARDS = 20;
// Los rieles de audiencia (family / adult-anime) mergean movie+tv (~40 títulos) y
// siempre se mostraron completos. Cortarlos a VISIBLE_CARDS reduciría tarjetas
// visibles, así que el composer los recorta con su propio límite.
export const AUDIENCE_CARDS = 40;
// Páginas de discover que se piden de entrada (20 por página). Con 2 (=40
// candidatos) se cubre el peor solapamiento medido (7 de 20). La 3ª página solo
// se pide si tras dedup + filtro de plataformas el riel quedó corto.
export const FETCH_BUFFER = 2;

export interface HomeRail {
  key: string;
  title?: string;
  genre?: string;
  items: UITitle[];
  seeAllHref?: string;
  typeToggle?: "refetch" | "filter";
  shelfKey?: string;
  activeType?: MediaType;
}

export interface HomePayload {
  hero: UITitle[];
  rails: HomeRail[];
}

const keyOf = (t: { id: number; type: MediaType }) => `${t.type}:${t.id}`;
const rawKey = (t: RawTitle, tipo: MediaType) => `${tipo}:${t.id}`;

// --- Etapa: Dedup -----------------------------------------------------------
// Reserva las claves de `items` en `used` y devuelve solo las no vistas.
function take(items: UITitle[], used: Set<string>, limit = VISIBLE_CARDS): UITitle[] {
  const out: UITitle[] = [];
  for (const t of items) {
    const k = keyOf(t);
    if (used.has(k)) continue;
    used.add(k);
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

// --- Etapa: Source (con buffer y relleno) ------------------------------------
// Trae candidatos crudos, descarta los ya usados ANTES de enriquecer (que es lo
// caro: 1 request de providers por título), enriquece con margen, filtra a las
// plataformas y completa VISIBLE_CARDS. Si no alcanza, pide una página más.
async function genreRail(
  genre: string, tipo: MediaType, providers: PlatformCode[], used: Set<string>,
): Promise<UITitle[]> {
  const out: UITitle[] = [];
  // Vuelta 0: el buffer inicial (páginas 1..FETCH_BUFFER).
  // Vuelta 1 (fallback, solo si quedó corto): SOLO la página siguiente al
  // buffer (FETCH_BUFFER + 1), no se vuelve a pedir 1..FETCH_BUFFER.
  for (let vuelta = 0; vuelta < 2 && out.length < VISIBLE_CARDS; vuelta++) {
    const startPage = vuelta === 0 ? 1 : FETCH_BUFFER + 1;
    const pages = vuelta === 0 ? FETCH_BUFFER : 1;
    const raws = await categoryCandidates({ tipo, genre, providers, startPage, pages });
    // Dedup sobre raw: contra lo ya usado por rieles anteriores y contra lo que
    // este mismo riel ya tomó en la vuelta previa.
    const frescos = raws.filter((r) => !used.has(rawKey(r, tipo)));
    if (!frescos.length) break;
    // Margen del 40% para absorber lo que se caiga por el filtro de plataformas.
    const faltan = VISIBLE_CARDS - out.length;
    const tanda = frescos.slice(0, Math.ceil(faltan * 1.4));
    const enriquecidos = await enrichRaw(tanda, tipo, providers);
    out.push(...take(enriquecidos, used, faltan));
  }
  return out;
}

// --- Etapa: relleno genérico por vueltas ------------------------------------
// Patrón compartido con genreRail: pide una página ya enriquecida/filtrada,
// toma lo que no esté usado, y si quedó corto pide UNA página más (fallback),
// nunca más que eso. Para fuentes que devuelven UITitle[] listos por página
// (ej. latestReleases), a diferencia de genreRail que trabaja con raw + buffer
// de varias páginas por vuelta.
async function fillByPage(
  fetchPage: (page: number) => Promise<UITitle[]>, used: Set<string>,
): Promise<UITitle[]> {
  const out: UITitle[] = [];
  for (let vuelta = 0; vuelta < 2 && out.length < VISIBLE_CARDS; vuelta++) {
    const items = await fetchPage(vuelta + 1);
    if (!items.length) break;
    out.push(...take(items, used, VISIBLE_CARDS - out.length));
  }
  return out;
}

// --- Etapas reservadas (hoy identidad) --------------------------------------
// Puntos de extensión ya cableados en el pipeline para no tener que volver a
// tocar la estructura cuando se implementen. NO implementar todavía.
function rotate(rails: HomeRail[]): HomeRail[] { return rails; }
function personalize(rails: HomeRail[]): HomeRail[] { return rails; }

// --- Pipeline ---------------------------------------------------------------
export async function composeHome(opts: {
  providers: PlatformCode[];
  types?: Record<string, MediaType>;
}): Promise<HomePayload> {
  const { providers } = opts;
  const types = opts.types ?? {};
  const used = new Set<string>();

  if (!providers.length) return { hero: [], rails: [] };

  // 1. Hero "Para vos hoy" — prioridad más alta, reserva sus títulos.
  //    Solo el estado base (genre=todos, offset=0): los chips y "Mostrame otras"
  //    son exploración puntual y no rearman el Home.
  const heroRaw = await recommendations({ tipo: "all", providers, n: 6, offset: 0 });
  const hero = take(heroRaw, used, 6);

  // 2. Últimos lanzamientos. Sin toggle (hoy es solo movie, por fecha de estreno).
  //    Si el hero ya reservó títulos de esta página, se rellena con la página
  //    siguiente (mismo criterio que genreRail: como mucho una vuelta de fallback).
  const latest = await fillByPage((page) => latestReleases(providers, "movie", page), used);

  // 3. Votos. Vienen de la DB (hasta 60 filas), ya hay margen para deduplicar.
  //    Modo "filter": la lista es mixta movie+tv y el cliente acota por tipo, así
  //    que acá NO se corta a VISIBLE_CARDS por tipo.
  const votados = take(await mostVoted(providers), used, VISIBLE_CARDS * 2);
  const cargo = take(await mostPanned(providers), used, VISIBLE_CARDS * 2);

  // 4. Rieles de género, en orden. Cada uno deduplica contra todo lo anterior.
  const generos: HomeRail[] = [];
  for (const g of HOME_GENRES) {
    const tipo = types[g] ?? defaultTypeFor(g);
    generos.push({
      key: `genre:${g}`,
      genre: g,
      items: await genreRail(g, tipo, providers, used),
      typeToggle: "refetch",
      shelfKey: g,
      activeType: tipo,
      seeAllHref: `/categoria/${g}?tipo=${tipo}`,
    });
  }

  // 5. Audiencia. NO se toca su lógica (lib/audience.ts): se consume su salida
  //    y solo se deduplica. Devuelve movie+tv mergeados (~40), hay margen.
  const family = take(await audienceTitles("family", providers), used, AUDIENCE_CARDS);
  const anime = take(await audienceTitles("adult-anime", providers), used, AUDIENCE_CARDS);

  const rails: HomeRail[] = [
    { key: "ultimos", title: "Últimos lanzamientos", items: latest, seeAllHref: "/lista/ultimos" },
    { key: "mas-votados", title: "Lo más votados", items: votados, seeAllHref: "/lista/mas-votados", typeToggle: "filter", shelfKey: "mas-votados", activeType: types["mas-votados"] ?? "movie" },
    { key: "hacete-cargo", title: "Hacete cargo", items: cargo, seeAllHref: "/lista/hacete-cargo", typeToggle: "filter", shelfKey: "hacete-cargo", activeType: types["hacete-cargo"] ?? "movie" },
    ...generos,
    { key: "family", title: "🍿 Para toda la familia", items: family, seeAllHref: "/lista/familia" },
    { key: "adult-anime", title: "🎬 Animación para adultos", items: anime, seeAllHref: "/lista/anime-adulto" },
  ];

  return { hero, rails: personalize(rotate(rails)) };
}
