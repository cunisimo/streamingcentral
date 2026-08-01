// UpcomingService: lectura de la Agenda de Estrenos desde Supabase.
// La escribe SOLO la Edge Function tmdb-sync; acá solo leemos (RLS select
// público, cliente anon). Mapea filas DB -> UIUpcoming reusando los helpers
// de la app (TMDB_IMG, genreIdsToSlugs, codeForTmdbId).
import { supabaseServer } from "./supabase";
import { TMDB_IMG } from "./tmdb";
import { genreIdsToSlugs } from "./categories";
import { codeForTmdbId, codesToTmdbIds } from "./providers-ar";
import type { MediaType, PlatformCode, UIUpcoming } from "./types";

const img = (p: string | null, size = "w500") => (p ? `${TMDB_IMG}/${size}${p}` : null);

// Columnas + join anidado a providers en una sola query (sin N+1).
const SELECT = `
  tmdb_id, media_type, title, poster_path, backdrop_path, overview, release_date,
  season_number, episode_number, episode_name, is_season_premiere,
  genre_ids, popularity, vote_average,
  upcoming_content_providers ( provider_id )
`;

interface Row {
  tmdb_id: number;
  media_type: MediaType;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string | null;
  release_date: string;
  season_number: number | null;
  episode_number: number | null;
  episode_name: string | null;
  is_season_premiere: boolean | null;
  genre_ids: number[] | null;
  popularity: number | null;
  vote_average: number | null;
  upcoming_content_providers: { provider_id: number }[] | null;
}

function toUIUpcoming(row: Row): UIUpcoming {
  const platforms: PlatformCode[] = [];
  for (const link of row.upcoming_content_providers ?? []) {
    const code = codeForTmdbId(link.provider_id);
    if (code && !platforms.includes(code)) platforms.push(code);
  }
  return {
    id: row.tmdb_id,
    type: row.media_type,
    title: row.title,
    poster: img(row.poster_path),
    backdrop: img(row.backdrop_path, "w780"),
    overview: row.overview ?? "",
    releaseDate: row.release_date,
    genres: genreIdsToSlugs(row.genre_ids ?? []),
    platforms,
    popularity: row.popularity != null ? Number(row.popularity) : null,
    voteAverage: row.vote_average != null ? Number(row.vote_average) : null,
    seasonNumber: row.season_number,
    episodeNumber: row.episode_number,
    episodeName: row.episode_name,
    isSeasonPremiere: row.is_season_premiere,
  };
}

export interface UpcomingFilters {
  mediaType?: MediaType;
  platform?: PlatformCode; // código interno (n/d/m/...)
  from?: string; // ISO YYYY-MM-DD (release_date >=)
  to?: string; // ISO YYYY-MM-DD (release_date <=)
  limit?: number;
}

// Listado general de estrenos, ordenado por fecha ascendente.
export async function upcomingList(filters: UpcomingFilters = {}): Promise<UIUpcoming[]> {
  const sb = supabaseServer();
  if (!sb) return [];

  // Filtro por plataforma: primero resolvemos qué upcoming_ids tienen ese
  // provider (2 queries solo cuando se filtra), así el resultado conserva
  // la lista completa de plataformas de cada título.
  let idFilter: string[] | null = null;
  if (filters.platform) {
    const providerIds = codesToTmdbIds([filters.platform]);
    if (!providerIds.length) return [];
    const { data: links, error: linkErr } = await sb
      .from("upcoming_content_providers")
      .select("upcoming_id")
      .in("provider_id", providerIds);
    if (linkErr) throw new Error(linkErr.message);
    idFilter = [...new Set((links ?? []).map((l: { upcoming_id: string }) => l.upcoming_id))];
    if (!idFilter.length) return [];
  }

  let q = sb.from("upcoming_content").select(SELECT).order("release_date", { ascending: true });
  if (filters.mediaType) q = q.eq("media_type", filters.mediaType);
  if (filters.from) q = q.gte("release_date", filters.from);
  if (filters.to) q = q.lte("release_date", filters.to);
  if (idFilter) q = q.in("id", idFilter);
  q = q.limit(filters.limit ?? 100);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Row[]).map(toUIUpcoming);
}

// Cruce con la Watchlist: dado el set de refs {tmdb_id, tipo} del usuario
// (que el browser resuelve por RLS y manda al server), devuelve los estrenos
// que matchean. Se sobre-consulta por tmdb_id y se filtra el par exacto en JS
// (Supabase no soporta IN por tupla).
export async function upcomingForRefs(
  refs: { tmdb_id: number; tipo: MediaType }[],
): Promise<UIUpcoming[]> {
  const sb = supabaseServer();
  if (!sb || !refs.length) return [];
  const ids = [...new Set(refs.map((r) => r.tmdb_id))];
  const wanted = new Set(refs.map((r) => `${r.tmdb_id}:${r.tipo}`));

  const { data, error } = await sb
    .from("upcoming_content")
    .select(SELECT)
    .in("tmdb_id", ids)
    .order("release_date", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Row[])
    .filter((r) => wanted.has(`${r.tmdb_id}:${r.media_type}`))
    .map(toUIUpcoming);
}

// Wrappers finos sobre upcomingList.
export const upcomingMovies = (limit?: number) => upcomingList({ mediaType: "movie", limit });
export const upcomingSeries = (limit?: number) => upcomingList({ mediaType: "tv", limit });
export const upcomingByPlatform = (platform: PlatformCode, limit?: number) =>
  upcomingList({ platform, limit });

// Estrenos de un mes (YYYY-MM). Si no se pasa, el mes actual.
export function upcomingThisMonth(month?: string, mediaType?: MediaType): Promise<UIUpcoming[]> {
  const base = month ? new Date(`${month}-01T00:00:00Z`) : new Date();
  const y = base.getUTCFullYear();
  const m = base.getUTCMonth(); // 0-based
  const pad = (n: number) => String(n).padStart(2, "0");
  const from = `${y}-${pad(m + 1)}-01`;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const to = `${y}-${pad(m + 1)}-${pad(last)}`;
  return upcomingList({ from, to, mediaType, limit: 500 });
}
