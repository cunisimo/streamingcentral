import { SupabaseClient } from "@supabase/supabase-js";
import {
  discover, episodeDetails, FALLBACK_ACTIVO, IDIOMA_BASE, IDIOMA_FALLBACK, MediaType,
  RawTitle, tvDetails,
} from "../lib/tmdb.ts";
import {
  type MetricasIdioma, nuevasMetricas, repararLista, repararNombreEpisodio,
  sumarEpisodio, sumarLote,
} from "../lib/reparar.ts";
import { aBorrar } from "../lib/reconciliar.ts";
import { arFlatrateProviders, ProviderRow } from "../lib/providers.ts";

// Parámetros (env de la función, con defaults).
const WINDOW_DAYS = Number(Deno.env.get("SYNC_WINDOW_DAYS") ?? "90");
const MAX_PAGES = Number(Deno.env.get("SYNC_MAX_PAGES") ?? "3");
const GRACE_DAYS = Number(Deno.env.get("SYNC_GRACE_DAYS") ?? "2");
const BATCH = 10; // concurrencia de llamadas a TMDB por lote

// Las metricas de idioma se crean POR INVOCACION y se pasan por parametro (ver
// `MetricasIdioma` en lib/reparar.ts). Antes vivian en un `const` de modulo, y
// dos corridas solapadas de `syncUpcoming` —dos POST al endpoint, o un reintento
// del cron encima de la corrida anterior— habrian mezclado sus numeros.
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
async function collectMovies(
  from: string, to: string, metricas: MetricasIdioma,
): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    let res;
    try {
      res = await discover("movie", {
        "primary_release_date.gte": from,
        "primary_release_date.lte": to,
        sort_by: "primary_release_date.asc",
        page: String(page),
      });
    } catch {
      break; // fallo transitorio: seguimos con lo ya recolectado
    }
    // Reparación de idioma ANTES de construir el candidato: lo que se escribe
    // en la base es lo reparado, no lo que vino en el idioma base. Cuesta UNA
    // llamada por página, y solo si la página trae algún roto.
    const params = {
      "primary_release_date.gte": from,
      "primary_release_date.lte": to,
      sort_by: "primary_release_date.asc",
      page: String(page),
    };
    const rep = await repararLista(
      res.results,
      async () => (await discover("movie", { ...params, language: IDIOMA_FALLBACK })).results,
      `peliculas p${page}`,
      FALLBACK_ACTIVO,
    );

    sumarLote(metricas, rep);
    for (const t of rep.items) {
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
async function collectSeries(
  from: string, to: string, metricas: MetricasIdioma,
): Promise<Candidate[]> {
  const seen = new Set<number>();
  const shows: RawTitle[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    let res;
    try {
      res = await discover("tv", {
        "air_date.gte": from,
        "air_date.lte": to,
        sort_by: "popularity.desc",
        page: String(page),
      });
    } catch {
      break; // fallo transitorio: seguimos con lo ya recolectado
    }
    const rep = await repararLista(
      res.results,
      async () => (await discover("tv", {
        "air_date.gte": from, "air_date.lte": to,
        sort_by: "popularity.desc", page: String(page),
        language: IDIOMA_FALLBACK,
      })).results,
      `series p${page}`,
      FALLBACK_ACTIVO,
    );
    sumarLote(metricas, rep);
    for (const t of rep.items) {
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

      // `episode_name` sale del DETALLE, así que su reparación es aparte de la
      // de la página. Si no se puede reparar, la serie se cae de la corrida: su
      // fila anterior queda intacta y se reintenta mañana.
      // Si NECESITABA reparacion y no se pudo reparar, la serie se cae de la
      // corrida (da igual si el valor roto era vacio o no latino): su fila
      // anterior queda intacta y se reintenta manana. Escribir `null` seria peor
      // que no escribir.
      //
      // El respaldo se pide por las MISMAS coordenadas del episodio base, no
      // releyendo `next_episode_to_air` en el otro idioma: entre las dos
      // llamadas "el proximo" puede haber avanzado y se mezclaria otro episodio.
      const sn = nx.season_number, en = nx.episode_number;
      const repEp = await repararNombreEpisodio(
        nx.name,
        async () => (sn == null || en == null)
          ? null
          : (await episodeDetails(t.id, sn, en, IDIOMA_FALLBACK)).name ?? null,
        `episodio tv:${t.id} T${sn}E${en}`,
        FALLBACK_ACTIVO,
      );
      sumarEpisodio(metricas, repEp);
      if (repEp.descartar) continue;
      const nombreEp = repEp.nombre;

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
        episode_name: nombreEp ?? nx.name ?? null,
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
  // Acumulador PROPIO de esta invocacion. Dos corridas concurrentes tienen cada
  // una el suyo y no se pisan.
  const metricas = nuevasMetricas();
  const now = new Date();
  const from = iso(now);
  const to = iso(new Date(now.getTime() + WINDOW_DAYS * DAY));

  const [movies, series] = await Promise.all([
    collectMovies(from, to, metricas), collectSeries(from, to, metricas),
  ]);
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

  // 4) Reconciliar. Ver `aBorrar`, que es la parte con la regla y está aparte
  //    para poder probarla sin una base de datos.
  const droppedMovies = aBorrar(all, kept.map((k) => k.cand), "movie");
  const droppedTv = aBorrar(all, kept.map((k) => k.cand), "tv");
  let dropped = 0;
  if (droppedMovies.length) {
    const { count } = await sb.from("upcoming_content")
      .delete({ count: "exact" }).eq("media_type", "movie").in("tmdb_id", droppedMovies);
    dropped += count ?? 0;
  }
  if (droppedTv.length) {
    const { count } = await sb.from("upcoming_content")
      .delete({ count: "exact" }).eq("media_type", "tv").in("tmdb_id", droppedTv);
    dropped += count ?? 0;
  }

  // 5) Expirar estrenos pasados (cascade limpia el join).
  const cutoff = iso(new Date(now.getTime() - GRACE_DAYS * DAY));
  const { count: expired } = await sb
    .from("upcoming_content")
    .delete({ count: "exact" })
    .lt("release_date", cutoff);

  return {
    candidates: all.length,
    kept: kept.length,
    upserted,
    providers: providerCatalog.size,
    dropped,
    deleted: expired ?? 0,
    window: { from, to },
    idioma: {
      base: IDIOMA_BASE,
      fallback_activo: FALLBACK_ACTIVO,
      llamadas_respaldo: metricas.llamadas,
      reparados: metricas.reparados,
      // Separados POR CONSECUENCIA. Los dos primeros SE ESCRIBEN igual; los dos
      // del medio dejan el candidato afuera y su fila anterior intacta; `fallos`
      // es transporte y es el unico que justifica reintentar.
      sinopsis_sin_mejora: metricas.sinopsisSinMejora,
      titulos_originales_legibles: metricas.titulosOriginalesLegibles,
      episodio_sin_nombre: metricas.episodioSinNombre,
      titulos_ilegibles_descartados: metricas.titulosIlegiblesDescartados,
      episodio_no_reparado: metricas.episodioNoReparado,
      fallos: metricas.fallos,
    },
  };
}
