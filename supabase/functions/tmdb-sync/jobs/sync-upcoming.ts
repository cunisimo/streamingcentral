import { SupabaseClient } from "@supabase/supabase-js";
import {
  discover, episodeDetails, FALLBACK_ACTIVO, IDIOMA_BASE, IDIOMA_FALLBACK, MediaType,
  providerList, RawTitle, tvDetailsConProveedores,
} from "../lib/tmdb.ts";
import {
  descubrirTodo, filtrarPorProveedorAR, ordenarPorFecha,
} from "../lib/descubrir.ts";
import {
  type MetricasIdioma, nuevasMetricas, repararLista, repararNombreEpisodio,
  sumarEpisodio, sumarLote,
} from "../lib/reparar.ts";
import { aBorrar } from "../lib/reconciliar.ts";
import { arFlatrateDe, arFlatrateProviders, ProviderRow } from "../lib/providers.ts";

// Parámetros (env de la función, con defaults).
const WINDOW_DAYS = Number(Deno.env.get("SYNC_WINDOW_DAYS") ?? "90");
const GRACE_DAYS = Number(Deno.env.get("SYNC_GRACE_DAYS") ?? "2");

// ⚠️ `SYNC_MAX_PAGES` SE ELIMINÓ. Era el corte que definía el bug: con 3
// páginas ordenadas por popularidad, el sync miraba 60 de 1900 series de la
// ventana y un título de popularidad baja no entraba nunca. Ahora se recorre
// hasta `total_pages`; el único tope es el de TMDB (`TOPE_PAGINAS_TMDB`), que
// es de la fuente y no una decisión nuestra. Si la variable sigue puesta en el
// entorno de la función, no hace nada.
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
  original_language: string | null;
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

/**
 * Los ids de TODOS los proveedores `flatrate` que TMDB publica para Argentina.
 *
 * Se piden en cada corrida (2 llamadas) en vez de tomarse de
 * `lib/providers-ar.ts`, y es a propósito: el filtro final acepta CUALQUIER
 * `flatrate` argentino, y usar los 20 ids que Yump mapea dejaría afuera 7
 * series y 1 película de la ventana medida. Se conserva la semántica que ya
 * había.
 */
async function idsProveedoresAR(): Promise<string> {
  const [m, t] = await Promise.all([providerList("movie"), providerList("tv")]);
  const ids = new Set<number>();
  for (const p of [...m.results, ...t.results]) ids.add(p.provider_id);
  return [...ids].sort((a, b) => a - b).join("|");
}

/**
 * Recorre una consulta de `discover` ENTERA, reparando el idioma página por
 * página.
 *
 * Le pasa a `descubrirTodo` los `crudos` —cuántos resultados trajo TMDB antes
 * de reparar— porque `repararLista` descarta títulos ilegibles: si el corte por
 * página vacía mirara lo reparado, una página así truncaría el recorrido en
 * silencio, que es el mismo bug por otro camino.
 *
 * **Un fallo de TMDB sube.** El código viejo hacía `catch { break }` y seguía
 * con lo recolectado: eso escribe una agenda incompleta como si estuviera
 * completa, y el paso de reconciliación decide borrados con ella.
 */
async function recorrer(
  tipo: MediaType, base: Record<string, string>, etiqueta: string,
  metricas: MetricasIdioma,
): Promise<RawTitle[]> {
  return await descubrirTodo<RawTitle>({
    clave: (t) => `${tipo}:${t.id}`,
    pedir: async (page) => {
      const params = { ...base, page: String(page) };
      const res = await discover(tipo, params);
      const rep = await repararLista(
        res.results,
        async () => (await discover(tipo, { ...params, language: IDIOMA_FALLBACK })).results,
        `${etiqueta} p${page}`,
        FALLBACK_ACTIVO,
      );
      sumarLote(metricas, rep);
      return { results: rep.items, crudos: res.results.length, total_pages: res.total_pages };
    },
  });
}

// Películas con estreno futuro dentro de la ventana, ordenadas por FECHA y
// filtradas por proveedor argentino en el propio `discover`.
//
// ⚠️ El filtro temprano se midió antes de tomarlo: de 120 películas muestreadas
// a lo largo de las 130 páginas de la ventana sin filtrar, **0** tenían
// proveedor `flatrate` argentino. Ese lado de la agenda está vacío por el
// catálogo de TMDB, no por el corte de páginas — y el filtro final se conserva
// igual, así que lo que entre acá todavía tiene que probarlo con
// `watch/providers`.
async function collectMovies(
  from: string, to: string, metricas: MetricasIdioma, provAR: string,
): Promise<Candidate[]> {
  const out: Candidate[] = [];
  const crudos = await recorrer("movie", {
    "primary_release_date.gte": from,
    "primary_release_date.lte": to,
    with_watch_monetization_types: "flatrate",
    with_watch_providers: provAR,
    sort_by: "primary_release_date.asc",
  }, "peliculas", metricas);
  for (const t of crudos) {
    if (!t.release_date) continue;
    out.push({
      tmdb_id: t.id,
      media_type: "movie",
      title: t.title ?? t.name ?? "",
      original_title: t.original_title ?? null,
      original_language: t.original_language ?? null,
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
  return out;
}

// Series con episodios próximos (nuevas temporadas / vuelven al aire). Se
// descubren por air_date y para cada una se pide el next_episode_to_air exacto.
//
// 🔴 ACÁ ESTABA EL BUG: `sort_by=popularity.desc` con 3 páginas miraba 60 de
// 1900 series. Ahora ordena por FECHA y recorre la ventana entera; el filtro de
// proveedor argentino va en el propio `discover`, lo que la deja en 13 páginas y
// 259 títulos. Medido contra el camino viejo, el filtro temprano pierde **0** —
// ni de las 36 que el código viejo conservaba, ni de las 20 con proveedor AR de
// un muestreo de la cola (páginas 20, 40, 60, 80 y 95), que es justamente lo que
// antes era invisible.
async function collectSeries(
  from: string, to: string, metricas: MetricasIdioma, provAR: string,
  // Los proveedores que el detalle ya trajo, para que el filtro final no vuelva
  // a pedirlos. Sin esto, traerlos con `append_to_response` no ahorraría nada.
  proveedores: Map<string, ProviderRow[]>,
): Promise<Candidate[]> {
  const shows = await recorrer("tv", {
    "air_date.gte": from,
    "air_date.lte": to,
    with_watch_monetization_types: "flatrate",
    with_watch_providers: provAR,
    sort_by: "first_air_date.asc",
  }, "series", metricas);

  const out: Candidate[] = [];
  for (let i = 0; i < shows.length; i += BATCH) {
    const slice = shows.slice(i, i + BATCH);
    // UNA llamada por serie: el detalle trae sus proveedores adentro.
    const details = await Promise.all(
      slice.map((t) => tvDetailsConProveedores(t.id).catch(() => null)),
    );
    for (let j = 0; j < slice.length; j++) {
      const t = slice[j];
      const nx = details[j]?.next_episode_to_air;
      if (!nx?.air_date || nx.air_date < from || nx.air_date > to) continue;
      const wp = details[j]?.["watch/providers"];
      if (wp) proveedores.set(`tv:${t.id}`, arFlatrateDe(wp));

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
        original_language: t.original_language ?? null,
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

  const provAR = await idsProveedoresAR();
  const proveedoresPrevios = new Map<string, ProviderRow[]>();
  const [movies, series] = await Promise.all([
    collectMovies(from, to, metricas, provAR),
    collectSeries(from, to, metricas, provAR, proveedoresPrevios),
  ]);
  // Orden TOTAL antes de escribir: fecha ascendente, `tmdb_id` como desempate.
  // El orden de llegada no sirve — TMDB reordena sus resultados y las páginas se
  // mueven entre pedidos, así que dos corridas del mismo día producirían agendas
  // distintas.
  const all = ordenarPorFecha(
    [...movies, ...series], (c) => c.release_date, (c) => c.tmdb_id,
  );

  // Resolver providers AR por título (en lotes) y conservar solo los que tienen
  // >=1. **Este filtro no cambió**: la corrección es sobre QUÉ SE MIRA, no sobre
  // qué califica. Un título que TMDB todavía no asocia a ninguna plataforma
  // argentina sigue afuera, tenga la popularidad que tenga.
  const providerCatalog = new Map<number, ProviderRow>();
  // Las series ya traen sus proveedores del detalle; las películas se piden acá.
  // El resultado es el mismo: la misma función extrae las filas en los dos
  // caminos, y las respuestas tienen la misma forma.
  const kept = (await filtrarPorProveedorAR(all, (c) => {
    const pre = proveedoresPrevios.get(`${c.media_type}:${c.tmdb_id}`);
    if (pre) return Promise.resolve(pre);
    return arFlatrateProviders(c.media_type, c.tmdb_id).catch(() => []);
  }, BATCH)).map(({ item, providers }) => {
    for (const p of providers) providerCatalog.set(p.id, p);
    return { cand: item, providers };
  });

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
