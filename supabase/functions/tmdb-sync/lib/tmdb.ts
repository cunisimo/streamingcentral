// Mini-cliente TMDB para Deno (Edge Function). Espeja el patrón de la app
// (lib/tmdb.ts): Bearer v4 token + defaults AR. No reusa el de la app porque
// aquel es Node/Next; acá corre en Deno.
const BASE = "https://api.themoviedb.org/3";
const TOKEN = Deno.env.get("TMDB_READ_TOKEN") ?? "";
const DEFAULTS: Record<string, string> = { language: "es-ES", watch_region: "AR" };

export type MediaType = "movie" | "tv";

export interface Paged<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

export interface RawTitle {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  first_air_date?: string;
  genre_ids?: number[];
  popularity?: number;
  vote_average?: number;
}

export interface RawProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
  display_priority: number;
}

export interface TvDetail {
  id: number;
  name?: string;
  status?: string;
  next_episode_to_air?: {
    air_date: string;
    season_number: number;
    episode_number: number;
    name: string;
  } | null;
}

async function tmdb<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const q = new URLSearchParams({ ...DEFAULTS, ...params });
  const res = await fetch(`${BASE}${path}?${q}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`TMDB ${res.status} en ${path}`);
  return await res.json() as T;
}

export function discover(type: MediaType, params: Record<string, string>) {
  return tmdb<Paged<RawTitle>>(`/discover/${type}`, params);
}

export function watchProviders(type: MediaType, id: number) {
  return tmdb<{ results: Record<string, { link: string; flatrate?: RawProvider[] }> }>(
    `/${type}/${id}/watch/providers`,
  );
}

export function tvDetails(id: number) {
  return tmdb<TvDetail>(`/tv/${id}`);
}
