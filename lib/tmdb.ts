// Cliente TMDB. Usa el v4 Read Access Token (Bearer).
import type { MediaType } from "./types";

const BASE = "https://api.themoviedb.org/3";
export const TMDB_IMG = "https://image.tmdb.org/t/p";

const HEADERS = {
  Authorization: `Bearer ${process.env.TMDB_READ_TOKEN ?? ""}`,
  accept: "application/json",
};
const DEFAULTS = { language: "es-ES", watch_region: "AR" };

async function tmdb<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const q = new URLSearchParams({ ...DEFAULTS, ...params });
  const res = await fetch(`${BASE}${path}?${q}`, {
    headers: HEADERS, cache: "no-store", signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`TMDB ${res.status} en ${path}`);
  return res.json() as Promise<T>;
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
  genres: { id: number; name: string }[];
  credits: { cast: { name: string }[]; crew: { job: string; name: string }[] };
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

export function trending(type: MediaType | "all", window: "day" | "week") {
  return tmdb<Paged<RawTitle>>(`/trending/${type}/${window}`);
}

export function personPopular(page = 1) {
  return tmdb<Paged<RawPerson & { known_for_department?: string }>>("/person/popular", { page: String(page) });
}
