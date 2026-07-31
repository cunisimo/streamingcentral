import { SupabaseClient } from "@supabase/supabase-js";
import { discover, MediaType, RawTitle, tvDetails } from "../lib/tmdb.ts";
import { arFlatrateProviders, ProviderRow } from "../lib/providers.ts";

// Parámetros (env de la función, con defaults).
const WINDOW_DAYS = Number(Deno.env.get("SYNC_WINDOW_DAYS") ?? "90");
const MAX_PAGES = Number(Deno.env.get("SYNC_MAX_PAGES") ?? "5");
const GRACE_DAYS = Number(Deno.env.get("SYNC_GRACE_DAYS") ?? "2");
const BATCH = 10; // concurrencia de llamadas a TMDB por lote

const iso = (d: Date) => d.toISOString().slice(0, 10);
const DAY = 86_400_000;

interface Candidate {
  tmdb_id: number;
  media_type: MediaType;
  title: string;
  original_title: string | null;
  overview: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  season_number: number | null;
  episode_number: number | null;
  episode_name: string | null;
  is_season_premiere: boolean | null;
  tv_status: string | null;
  genre_ids: number[];
  popularity: number | null;
  vote_average: number | null;
  status: string | null;
}

// Películas con estreno futuro dentro de la ventana. Se descubre por FECHA
// (sin filtrar por provider en discover) y el filtro de plataforma AR se aplica
// después con watch/providers, para no perder originales pre-listados.
async function collectMovies(from: string, to: string): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await discover("movie", {
      "primary_release_date.gte": from,
      "primary_release_date.lte": to,
      sort_by: "primary_release_date.asc",
      page: String(page),
    });
    for (const t of res.results) {
      if (!t.release_date) continue;
      out.push({
        tmdb_id: t.id,
        media_type: "movie",
        title: t.title ?? t.name ?? "",
        original_title: t.original_title ?? null,
        overview: t.overview ?? null,
        poster_path: t.poster_path,
        backdrop_path: t.backdrop_path,
        release_date: t.release_date,
        season_number: null,
        episode_number: null,
        episode_name: null,
        is_season_premiere: null,
        tv_status: null,
        genre_ids: t.genre_ids ?? [],
        popularity: t.popularity ?? null,
        vote_average: t.vote_average ?? null,
        status: null,
      });
    }
    if (page >= res.total_pages) break;
  }
  return out;
}

// Series con episodios próximos (nuevas temporadas / vuelven al aire). Se
// descubren por air_date y para cada una se pide el next_episode_to_air exacto.
async function collectSeries(from: string, to: string): Promise<Candidate[]> {
  const seen = new Set<number>();
  const shows: RawTitle[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await discover("tv", {
      "air_date.gte": from,
      "air_date.lte": to,
      sort_by: "popularity.desc",
      page: String(page),
    });
    for (const t of res.results) {
      if (!seen.has(t.id)) { seen.add(t.id); shows.push(t); }
    }
    if (page >= res.total_pages) break;
  }

  const out: Candidate[] = [];
  for (let i = 0; i < shows.length; i += BATCH) {
    const slice = shows.slice(i, i + BATCH);
    const details = await Promise.all(slice.map((t) => tvDetails(t.id).catch(() => null)));
    for (let j = 0; j < slice.length; j++) {
      const t = slice[j];
      const nx = details[j]?.next_episode_to_air;
      if (!nx?.air_date || nx.air_date < from || nx.air_date > to) continue;
      out.push({
        tmdb_id: t.id,
        media_type: "tv",
        title: t.name ?? t.title ?? "",
        original_title: t.original_name ?? null,
        overview: t.overview ?? null,
        poster_path: t.poster_path,
        backdrop_path: t.backdrop_path,
        release_date: nx.air_date,
        season_number: nx.season_number ?? null,
        episode_number: nx.episode_number ?? null,
        episode_name: nx.name ?? null,
        is_season_premiere: (nx.episode_number ?? 0) === 1,
        tv_status: details[j]?.status ?? null,
        genre_ids: t.genre_ids ?? [],
        popularity: t.popularity ?? null,
        vote_average: t.vote_average ?? null,
        status: details[j]?.status ?? null,
      });
    }
  }
  return out;
}

export async function syncUpcoming(sb: SupabaseClient) {
  const now = new Date();
  const from = iso(now);
  const to = iso(new Date(now.getTime() + WINDOW_DAYS * DAY));

  const [movies, series] = await Promise.all([collectMovies(from, to), collectSeries(from, to)]);
  const all = [...movies, ...series];

  // Resolver providers AR por título (en lotes) y conservar solo los que tienen >=1.
  const kept: { cand: Candidate; providers: ProviderRow[] }[] = [];
  const providerCatalog = new Map<number, ProviderRow>();
  for (let i = 0; i < all.length; i += BATCH) {
    const slice = all.slice(i, i + BATCH);
    const provs = await Promise.all(
      slice.map((c) => arFlatrateProviders(c.media_type, c.tmdb_id).catch(() => [])),
    );
    for (let j = 0; j < slice.length; j++) {
      if (!provs[j].length) continue; // regla: solo títulos con >=1 provider AR
      kept.push({ cand: slice[j], providers: provs[j] });
      for (const p of provs[j]) providerCatalog.set(p.id, p);
    }
  }

  const stamp = new Date().toISOString();

  // 1) Catálogo de providers (upsert por id de TMDB).
  if (providerCatalog.size) {
    const rows = [...providerCatalog.values()].map((p) => ({ ...p, updated_at: stamp }));
    const { error } = await sb.from("providers").upsert(rows, { onConflict: "id" });
    if (error) throw new Error(`providers upsert: ${error.message}`);
  }

  // 2) Títulos (bulk upsert idempotente por tmdb_id+media_type).
  let upserted = 0;
  const idByKey = new Map<string, string>();
  if (kept.length) {
    const payload = kept.map(({ cand }) => ({ ...cand, updated_at: stamp }));
    const { data, error } = await sb
      .from("upcoming_content")
      .upsert(payload, { onConflict: "tmdb_id,media_type" })
      .select("id, tmdb_id, media_type");
    if (error) throw new Error(`upcoming_content upsert: ${error.message}`);
    for (const r of data ?? []) idByKey.set(`${r.tmdb_id}:${r.media_type}`, r.id as string);
    upserted = data?.length ?? 0;
  }

  // 3) Join título↔plataforma: se reemplaza en bloque (refleja cambios de
  //    plataforma sin duplicar links).
  const uids = [...idByKey.values()];
  if (uids.length) {
    await sb.from("upcoming_content_providers").delete().in("upcoming_id", uids);
    const links: { upcoming_id: string; provider_id: number }[] = [];
    for (const { cand, providers } of kept) {
      const uid = idByKey.get(`${cand.tmdb_id}:${cand.media_type}`);
      if (!uid) continue;
      for (const p of providers) links.push({ upcoming_id: uid, provider_id: p.id });
    }
    if (links.length) {
      const { error } = await sb.from("upcoming_content_providers").insert(links);
      if (error) throw new Error(`links insert: ${error.message}`);
    }
  }

  // 4) Expirar estrenos pasados (cascade limpia el join).
  const cutoff = iso(new Date(now.getTime() - GRACE_DAYS * DAY));
  const { count: deleted } = await sb
    .from("upcoming_content")
    .delete({ count: "exact" })
    .lt("release_date", cutoff);

  return {
    candidates: all.length,
    kept: kept.length,
    upserted,
    providers: providerCatalog.size,
    deleted: deleted ?? 0,
    window: { from, to },
  };
}
