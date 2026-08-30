// Cliente TMDB. Usa el v4 Read Access Token (Bearer).
//
// `server-only` es un guard de BUILD, no de tipos: acá vive TMDB_READ_TOKEN y
// no tiene que poder llegar nunca al bundle del navegador. Hoy ningún cliente
// lo importa, pero tsc no vería la regresión — esto la convierte en error de
// compilación. Los `import type` se borran y siguen siendo legales.
import "server-only";
import { IDIOMA_BASE } from "./idioma";
import type { MediaType } from "./types";

const BASE = "https://api.themoviedb.org/3";
export const TMDB_IMG = "https://image.tmdb.org/t/p";

const HEADERS = {
  Authorization: `Bearer ${process.env.TMDB_READ_TOKEN ?? ""}`,
  accept: "application/json",
};
// El idioma sale de `IDIOMA_BASE` (lib/idioma.ts), que hoy tiene default es-ES:
// cableado y probado, pero SIN cambiar el comportamiento. El cambio a es-MX se
// hace con la variable `IDIOMA_TITULOS`, en la tanda 2 del plan.
const DEFAULTS = { language: IDIOMA_BASE, watch_region: "AR" };

// --- Techo de concurrencia contra TMDB --------------------------------------
// El Home Composer pide todas sus fuentes en paralelo: con cache fría eso son
// ~350-400 requests arrancando en la misma vuelta del event loop (1 providersOf
// por título). TMDB throttlea alrededor de 50 req/s y acá cada request tiene un
// AbortSignal.timeout(8000), así que una ráfaga así se cobra 429s y timeouts en
// masa. En producción es peor: cada `cached()` es además un round-trip HTTPS a
// Upstash, con lo cual la misma ráfaga lo golpea igual.
//
// El semáforo va acá y no en los call sites a propósito: es UN solo lugar y
// cubre toda la app (fichas, buscador, categorías, sync). Las pantallas que
// piden pocos requests nunca llegan al techo, así que no las afecta.
//
// El permiso se libera en `finally`: si el request falla o hace timeout, el
// permiso vuelve igual. Sin eso, un pico de errores drena el semáforo y la app
// queda trabada para siempre (el bug clásico de esta implementación).
const MAX_EN_VUELO = Math.max(1, Number(process.env.TMDB_MAX_CONCURRENT) || 24);
let enVuelo = 0;
const espera: (() => void)[] = [];

function adquirir(): Promise<void> {
  if (enVuelo < MAX_EN_VUELO) { enVuelo++; return Promise.resolve(); }
  return new Promise<void>((resolve) => { espera.push(resolve); });
}
function liberar(): void {
  // El permiso se TRANSFIERE al primero en la cola (enVuelo no baja): así el
  // techo se respeta sin ventanas donde entren dos de golpe.
  const siguiente = espera.shift();
  if (siguiente) siguiente();
  else enVuelo--;
}

async function tmdb<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const q = new URLSearchParams({ ...DEFAULTS, ...params });
  await adquirir();
  try {
    const res = await fetch(`${BASE}${path}?${q}`, {
      headers: HEADERS, cache: "no-store", signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`TMDB ${res.status} en ${path}`);
    // El parseo del body va DENTRO del permiso: sigue siendo parte del request.
    return (await res.json()) as T;
  } finally {
    liberar();
  }
}

export interface Paged<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

export interface RawTitle {
  id: number;
  media_type?: MediaType;
  title?: string;
  name?: string;
  poster_path: string | null;
  // Los listados de discover/search sí lo traen; se usa para descartar fichas
  // incompletas en "Últimos lanzamientos" (ver `soloCompletos` en enrich).
  overview?: string;
  vote_average: number;
  vote_count: number;
  release_date?: string;
  first_air_date?: string;
  genre_ids?: number[];
  // Lo devuelven discover, /recommendations y /similar. Hace falta para el guard
  // de anime del recomendador (animación 16 + idioma "ja"), que no puede pedir
  // el detalle de cada candidato.
  original_language?: string;
  // Los devuelve discover. Hacen falta para la señal 3 de `queReparar` (el
  // título cayó al original porque no hay traducción): sin ellos esa señal solo
  // se puede evaluar en la ficha, y no en los rieles, que es donde está el 95%
  // de los títulos que ve el usuario.
  original_title?: string;
  original_name?: string;
  origin_country?: string[];
  // Lo devuelve discover y no se usaba, así que no estaba declarado. Hace falta
  // para reordenar al unir pools de plataformas distintas (ver lib/pools.ts):
  // cada pool viene ordenado por popularidad, pero la unión de dos no lo está.
  popularity?: number;
}

export interface RawPerson {
  id: number;
  // Opcional porque solo lo trae `/search/multi`. Ni `/search/person` ni
  // `/person/popular` lo devuelven: cuando el endpoint ya es de personas, TMDB
  // no repite el tipo. Estaba declarado como obligatorio y era mentira en dos
  // de los tres usos.
  media_type?: "person";
  name: string;
  profile_path: string | null;
  known_for?: RawTitle[];
  known_for_department?: string;
  // Lo usa el buscador para ordenar: TMDB rankea por match exacto y hay que
  // reordenar por popularidad. Ver `search()` en lib/enrich.ts.
  popularity?: number;
}

export type RawMulti = RawTitle | RawPerson;

export interface RawProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
  display_priority: number;
}

export interface DiscoverOpts {
  providers?: number[];
  genres?: number[];
  withoutGenres?: number[];
  keywords?: number[];
  originCountry?: string;
  sortBy?: string;
  minVotes?: number;
  page?: number;
  extra?: Record<string, string>;
  /**
   * No mandar `with_watch_monetization_types`.
   *
   * 🔴 HACE FALTA PARA LA CONSULTA POR RED, y está medido. Con
   * `watch_region=AR` puesto, ese parámetro filtra a lo que TMDB sabe que está
   * en flatrate EN ARGENTINA — que es exactamente el dato que falta. Medido el
   * 2026-08-30 sobre `with_networks=2739`: **304 resultados con el parámetro y
   * 440 sin él**, y el caso testigo `tv:275224` sólo aparece sin él. El que
   * estorba es éste, no `watch_region`: sacar la región no cambia nada (440 en
   * los dos casos).
   */
  sinMonetizacion?: boolean;
}

export function discover(type: MediaType, o: DiscoverOpts = {}) {
  const p: Record<string, string> = {
    with_watch_monetization_types: "flatrate",
    // Los dos defaults de abajo son FILTROS REALES que nadie decidió por
    // superficie, y los dos tienen issue abierto: `sort_by` es el #9 y el piso
    // de 60 votos es el #12. El de votos es el que va en contra del producto:
    // saca cine argentino y latinoamericano de toda superficie que no lo pise.
    // No cambiarlo acá sin leer el #12 — la decisión es del dueño y quiere verla
    // medida.
    //
    // Lo que NO se puede agregar acá ni en ningún otro lado: un piso de NOTA.
    // El puntaje de TMDB no se usa nunca para excluir títulos en esta app, solo
    // para medir (ver el principio en CLAUDE.md). Si hay que ajustar la mezcla
    // del Home, se ajusta QUÉ ejes rotan y con qué frecuencia, no la nota.
    sort_by: o.sortBy ?? "popularity.desc",
    "vote_count.gte": String(o.minVotes ?? 60),
    page: String(o.page ?? 1),
  };
  if (o.sinMonetizacion) delete p.with_watch_monetization_types;
  if (o.providers?.length) p.with_watch_providers = o.providers.join("|");
  if (o.genres?.length) p.with_genres = o.genres.join("|");
  if (o.withoutGenres?.length) p.without_genres = o.withoutGenres.join(",");
  if (o.keywords?.length) p.with_keywords = o.keywords.join("|");
  if (o.originCountry) p.with_origin_country = o.originCountry;
  if (o.extra) Object.assign(p, o.extra);
  return tmdb<Paged<RawTitle>>(`/discover/${type}`, p);
}

export function searchMulti(query: string, page = 1) {
  return tmdb<Paged<RawMulti>>("/search/multi", {
    query, page: String(page), include_adult: "false",
  });
}

// Búsqueda acotada a un tipo. La usa la ingesta del top 10 de Netflix, que
// recibe títulos EN INGLÉS: por eso fuerza `language`, pisando el es-ES de
// DEFAULTS. Sin eso, "The Running Man" no matchea contra el título en español.
export function searchTitles(type: MediaType, query: string) {
  return tmdb<Paged<RawTitle>>(`/search/${type}`, {
    query, include_adult: "false", language: "en-US", page: "1",
  });
}

// Las dos de abajo son para el buscador de la app y NO son intercambiables con
// `searchTitles`: aceptan página, que es lo que permite mirar más allá de los 20
// primeros para poder reordenar. Ver `search()` en lib/enrich.ts.

// ES-MX ACÁ Y EN NINGÚN OTRO LADO. El resto de la app sigue en el `es-ES` de
// DEFAULTS; esto pisa el idioma SOLO para la búsqueda de títulos.
//
// El motivo es que con `es-ES` la app no encuentra las películas por el nombre
// con el que se las conoce en Argentina. Medido contra TMDB el 20/08:
//
//   consulta               es-ES                       es-MX
//   "Duro de matar"        33542, otra película        562 "Duro de matar" ✔
//   "Mi pobre angelito"    771 como "Solo en casa"     771 "Mi pobre angelito" ✔
//
// En es-ES la 771 llega igual desde TMDB, pero con el título español: el
// buscador la descartaba después, al calcular relevancia contra un nombre que
// no contiene lo tecleado.
//
// `es-AR` NO sirve —devuelve prácticamente los mismos nombres españoles—; es
// `es-MX` el que trae los títulos latinoamericanos.
//
// LO QUE ESTO NO ARREGLA, y conviene tenerlo escrito antes de que aparezca como
// bug: la FICHA sigue en es-ES. Una tarjeta del buscador puede decir "Duro de
// matar" y, al entrar, la ficha mostrar "Jungla de cristal". Es un límite
// conocido y aceptado; el idioma de las fichas es una decisión aparte.
export function searchDeTipo(type: MediaType, query: string, page = 1) {
  return tmdb<Paged<RawTitle>>(`/search/${type}`, {
    query, include_adult: "false", page: String(page), language: "es-MX",
  });
}

// `language` solo lo usa la reparación de idioma: `known_for` trae títulos
// localizados y hay que poder pedir la misma página en es-ES.
export function searchPersonas(query: string, page = 1, language?: string) {
  return tmdb<Paged<RawPerson>>("/search/person", {
    query, include_adult: "false", page: String(page),
    ...(language ? { language } : {}),
  });
}

// Keywords de un título. OJO con la forma de la respuesta: TMDB las devuelve
// bajo `keywords` en movie y bajo `results` en tv. No es un detalle: leer solo
// una de las dos deja el cruce de tipo sin keywords para la mitad del catálogo,
// y sin keywords el cruce no se intenta (ver lib/reco.ts).
export async function tmdbKeywords(type: MediaType, id: number): Promise<{ id: number; name: string }[]> {
  const r = await tmdb<{ keywords?: { id: number; name: string }[]; results?: { id: number; name: string }[] }>(
    `/${type}/${id}/keywords`,
  );
  return r.keywords ?? r.results ?? [];
}

export interface CreditEntry extends RawTitle {
  media_type: MediaType;
  character?: string;
  job?: string;
}
export function personCombinedCredits(id: number, language?: string) {
  return tmdb<{ cast: CreditEntry[]; crew: CreditEntry[] }>(
    `/person/${id}/combined_credits`, language ? { language } : {},
  );
}
export function personDetails(id: number) {
  return tmdb<{ id: number; name: string; profile_path: string | null }>(`/person/${id}`);
}

export function watchProviders(type: MediaType, id: number) {
  return tmdb<{ results: Record<string, { link: string; flatrate?: RawProvider[] }> }>(
    `/${type}/${id}/watch/providers`,
  );
}

export interface RawVideo {
  key: string;
  site: string;
  type: string;
  official: boolean;
  name: string;
  published_at: string;
  iso_639_1: string; // idioma del video (para preferir el original, no el doblaje)
}

export interface RawDetail {
  id: number;
  title?: string;
  name?: string;
  // El título en su idioma original. Lo devuelve TMDB en la misma respuesta,
  // así que exponerlo no cuesta ninguna llamada — solo unos bytes en el payload
  // de /api/title (+32 B de promedio, medido). Es la mitad de la unión que
  // encuentra 29/29: ver docs/medidas/2026-08-23-idioma-informe.md.
  original_title?: string;
  original_name?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  vote_average: number;
  vote_count: number;
  runtime?: number;
  number_of_seasons?: number;
  number_of_episodes?: number;
  release_date?: string;
  first_air_date?: string;
  // Solo en series. OJO: `first_air_date` es el estreno ORIGINAL de la serie
  // (Reacher, 2022), no lo que viene. Para saber si una serie tiene algo por
  // salir hay que mirar acá — si no, ninguna serie en emisión califica nunca
  // como "por estrenar".
  next_episode_to_air?: { air_date?: string; season_number?: number; episode_number?: number } | null;
  origin_country?: string[];
  // Sólo en series. `networks` es la cadena/plataforma que la emite y `homepage`
  // su sitio oficial. NO son disponibilidad por sí solos — ver lib/enlace-oficial.ts:
  // la regla es que `networks` nunca se usa SOLA.
  networks?: { id: number; name: string }[];
  homepage?: string;
  // Coproducciones: origin_country y production_countries traen los mismos
  // países en ORDEN DISTINTO (ver lib/countries.ts → primaryCountry).
  production_countries?: { iso_3166_1: string }[];
  original_language?: string; // idioma original del título (para elegir el trailer sin doblar)
  genres: { id: number; name: string }[];
  credits: { cast: { id: number; name: string; character?: string; profile_path: string | null }[]; crew: { job: string; name: string }[] };
  external_ids: { imdb_id: string | null };
  content_ratings?: { results: { iso_3166_1: string; rating: string }[] };
  // `type` es el tipo de estreno de TMDB: 1 premiere, 2 limitado, 3 cine,
  // 4 digital, 5 físico, 6 TV. El 4 es el único que le importa a una app de
  // streaming — ver issue #5 en docs/ISSUES.md.
  release_dates?: {
    results: { iso_3166_1: string; release_dates: { certification: string; type: number; release_date: string }[] }[];
  };
  recommendations?: Paged<RawTitle>;
}
// `language` se pasa SOLO para el fallback de la ficha (lib/enrich.ts →
// `detalleReparado`), que pide el mismo detalle en es-ES cuando el es-MX vino
// roto. Sin argumento usa el idioma base, como todo el resto.
export function titleDetails(type: MediaType, id: number, language?: string) {
  const append = type === "movie"
    ? "credits,external_ids,release_dates,recommendations"
    : "credits,external_ids,content_ratings,recommendations";
  return tmdb<RawDetail>(`/${type}/${id}`, {
    append_to_response: append,
    ...(language ? { language } : {}),
  });
}

// Videos del título en el idioma ORIGINAL (no el doblaje es-ES que fuerza el
// language global). include_video_language trae original + inglés + sin-idioma;
// se excluye "es" a propósito para no caer en el trailer doblado.
export function titleVideos(type: MediaType, id: number, lang: string) {
  const l = lang || "en";
  const include = [...new Set([l, "en", "null"])].join(",");
  return tmdb<{ results: RawVideo[] }>(`/${type}/${id}/videos`, {
    language: l,
    include_video_language: include,
  });
}

export function trending(type: MediaType | "all", window: "day" | "week") {
  return tmdb<Paged<RawTitle>>(`/trending/${type}/${window}`);
}

// `language` solo lo usa la reparación de idioma (lib/enrich.ts): `known_for`
// trae títulos localizados y hay que poder pedir la misma página en es-ES.
export function personPopular(page = 1, language?: string) {
  return tmdb<Paged<RawPerson & { known_for_department?: string }>>("/person/popular", {
    page: String(page), ...(language ? { language } : {}),
  });
}
