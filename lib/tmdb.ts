// Cliente TMDB. Usa el v4 Read Access Token (Bearer).
import type { MediaType } from "./types";

const BASE = "https://api.themoviedb.org/3";
export const TMDB_IMG = "https://image.tmdb.org/t/p";

const HEADERS = {
  Authorization: `Bearer ${process.env.TMDB_READ_TOKEN ?? ""}`,
  accept: "application/json",
};
const DEFAULTS = { language: "es-ES", watch_region: "AR" };

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
  vote_average: number;
  vote_count: number;
  release_date?: string;
  first_air_date?: string;
  genre_ids?: number[];
  origin_country?: string[];
}

export interface RawPerson {
  id: number;
  media_type: "person";
  name: string;
  profile_path: string | null;
  known_for?: RawTitle[];
  known_for_department?: string;
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
}

export function discover(type: MediaType, o: DiscoverOpts = {}) {
  const p: Record<string, string> = {
    with_watch_monetization_types: "flatrate",
    sort_by: o.sortBy ?? "popularity.desc",
    "vote_count.gte": String(o.minVotes ?? 60),
    page: String(o.page ?? 1),
  };
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

export interface CreditEntry extends RawTitle {
  media_type: MediaType;
  character?: string;
  job?: string;
}
export function personCombinedCredits(id: number) {
  return tmdb<{ cast: CreditEntry[]; crew: CreditEntry[] }>(`/person/${id}/combined_credits`);
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
  origin_country?: string[];
  // Coproducciones: origin_country y production_countries traen los mismos
  // países en ORDEN DISTINTO (ver lib/countries.ts → primaryCountry).
  production_countries?: { iso_3166_1: string }[];
  original_language?: string; // idioma original del título (para elegir el trailer sin doblar)
  genres: { id: number; name: string }[];
  credits: { cast: { id: number; name: string; character?: string; profile_path: string | null }[]; crew: { job: string; name: string }[] };
  external_ids: { imdb_id: string | null };
  content_ratings?: { results: { iso_3166_1: string; rating: string }[] };
  release_dates?: { results: { iso_3166_1: string; release_dates: { certification: string }[] }[] };
  recommendations?: Paged<RawTitle>;
}
export function titleDetails(type: MediaType, id: number) {
  const append = type === "movie"
    ? "credits,external_ids,release_dates,recommendations"
    : "credits,external_ids,content_ratings,recommendations";
  return tmdb<RawDetail>(`/${type}/${id}`, { append_to_response: append });
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

export function personPopular(page = 1) {
  return tmdb<Paged<RawPerson & { known_for_department?: string }>>("/person/popular", { page: String(page) });
}
