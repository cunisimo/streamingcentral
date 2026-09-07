// UpcomingService: lectura de la Agenda de Estrenos desde Supabase.
// La escribe SOLO la Edge Function tmdb-sync; acá solo leemos (RLS select
// público, cliente anon). Mapea filas DB -> UIUpcoming reusando los helpers
// de la app (TMDB_IMG, genreIdsToSlugs, codeForTmdbId).
import { hoyAR } from "./fecha";
import { supabaseServer } from "./supabase";
import { TMDB_IMG } from "./tmdb";
import { genreIdsToSlugs } from "./categories";
import { codeForTmdbId, codesToTmdbIds } from "./providers-ar";
import { paginarProximamente, seleccionarProximamente } from "./proximamente";
import type { MediaType, PlatformCode, UIUpcoming } from "./types";

const img = (p: string | null, size = "w500") => (p ? `${TMDB_IMG}/${size}${p}` : null);

// Columnas + join anidado a providers en una sola query (sin N+1).
// `original_language` lo consume SOLO la clasificación de anime de
// `lib/proximamente.ts`. Es nullable y puede venir vacío en filas escritas antes
// de la migración 008; `esAnime` está escrito para tolerarlo.
const SELECT = `
  tmdb_id, media_type, title, poster_path, backdrop_path, overview, release_date,
  season_number, episode_number, episode_name, is_season_premiere,
  genre_ids, popularity, vote_average, original_language,
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
  original_language: string | null;
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
    originalLanguage: row.original_language ?? null,
  };
}

// Próximamente muestra lo que se viene en las plataformas que la app soporta.
// Un estreno cuyo único provider no está mapeado (Running Man solo en
// OnDemandKorea, antes de agregarla) llegaba con `platforms` vacío y su ficha
// decía "No está en streaming": un estreno al que el usuario no puede llegar.
// NO se filtra por las plataformas DEL USUARIO a propósito — la sección es la
// agenda completa de estrenos y la card indica en cuál sale cada uno.
const enPlataformasSoportadas = (items: UIUpcoming[]) =>
  items.filter((i) => i.platforms.length > 0);

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
  // Lo vencido no se muestra, y se decide AL LEER en vez de confiar en que el
  // sync esté fresco. No es lo mismo que el `from` explícito de abajo: ese lo
  // manda el llamador (la vista por mes lo usa para acotar un rango); este es el
  // piso que siempre corre.
  //
  // Hace falta porque una fila puede quedar huérfana, y NO por la ventana de
  // fechas —que está bien— sino por cobertura: el descubrimiento de series del
  // sync mira `discover/tv` ordenado por popularidad con `MAX_PAGES = 3`, o sea
  // las 60 primeras de 1696 elegibles (medido el 2026-08-15). Una serie que cae
  // fuera de ese top deja de refrescarse aunque su próximo episodio esté dentro
  // de la ventana, y la limpieza recién la borra a los GRACE_DAYS (2).
  //
  // Mientras tanto la fila no está solo vencida: está EQUIVOCADA. La tabla decía
  // que Star Trek daba T4 E4 el 13; TMDB ya daba T4 E5 el 20, y la fila tenía
  // updated_at del 8 aunque el sync había corrido ese mismo día.
  //
  // Y como el orden es ascendente, esas filas eran justo las PRIMERAS del riel.
  q = q.gte("release_date", hoyAR());
  if (filters.from) q = q.gte("release_date", filters.from);
  if (filters.to) q = q.lte("release_date", filters.to);
  if (idFilter) q = q.in("id", idFilter);
  q = q.limit(filters.limit ?? 100);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return enPlataformasSoportadas(((data ?? []) as unknown as Row[]).map(toUIUpcoming));
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
  // A diferencia de upcomingList, acá NO se filtra por plataformas soportadas:
  // son títulos que el usuario puso a propósito en su lista y quiere que le
  // avisemos cuando salgan, esté donde esté.
  return ((data ?? []) as unknown as Row[])
    .filter((r) => wanted.has(`${r.tmdb_id}:${r.media_type}`))
    .map(toUIUpcoming);
}

/**
 * Tope de la lectura que alimenta la selección.
 *
 * Es un techo de seguridad, no una ventana: la agenda vigente son ~250 filas
 * (246 el 2026-09-04) porque el sync mira 90 días. Y traerla entera es gratis
 * comparado con traer 100: medido, 246 filas con el join de proveedores tardan
 * ~490 ms y 100 filas tardan ~485 ms, porque lo que se paga es el round-trip.
 */
const TOPE_LECTURA = 1000;

/**
 * La agenda seleccionada: una sola consulta y el criterio editorial aplicado.
 *
 * 🔴 EL FILTRO DE TIPO VA ANTES DE SELECCIONAR. Al revés, "Películas" mostraría
 * sólo las películas que hubieran sobrevivido a una selección donde compiten con
 * series, y "Series" cambiaría según cuántas películas hubiera ese día. Filtrando
 * primero, cada solapa tiene su propia selección coherente y su propia
 * paginación.
 *
 * Para `tv` el resultado es casi idéntico a filtrar después, porque las
 * películas no consumen el cupo de series; lo único que se mueve es el cupo de
 * anime, que se calcula sobre los no-anime elegidos y baja en uno al sacar la
 * película.
 */
export async function upcomingSeleccion(mediaType?: MediaType): Promise<UIUpcoming[]> {
  const crudos = await upcomingList({ mediaType, limit: TOPE_LECTURA });
  return seleccionarProximamente(crudos);
}

/** Una página de la selección. `porPagina` lo fija el llamador. */
export async function upcomingPagina(opts: {
  mediaType?: MediaType;
  pagina: number;
  porPagina: number;
}): Promise<{ items: UIUpcoming[]; hayMas: boolean; total: number }> {
  const seleccion = await upcomingSeleccion(opts.mediaType);
  return paginarProximamente(seleccion, opts.pagina, opts.porPagina);
}

/**
 * El riel del Home: los primeros `limit` de la selección, sin filtro de tipo.
 *
 * ⚠️ Reemplaza al viejo `upcomingMix`, que intercalaba películas y series y
 * estaba roto de dos formas a la vez. Pedía `per = ceil(limit/2) + 3` de cada
 * tipo asumiendo que los dos tenían oferta: con UNA película en toda la agenda,
 * el riel devolvía 12 tarjetas de las 15 pedidas y no había forma de que llegara
 * a 15. Y el intercalado ponía esa única película —del 30/09— en la SEGUNDA
 * posición, entre dos títulos del 04/09, así que un riel que se presenta como
 * cronológico no lo era.
 *
 * Acá los primeros `limit` de una lista ya ordenada por fecha son, por
 * construcción, los `limit` estrenos más próximos. El equilibrio no lo pone un
 * intercalado: ya lo puso el cupo por fecha.
 *
 * Que el Home no muestre ninguna película es el dato, no una falla: hoy la única
 * de la agenda es del 30/09 y hay 50 días con contenido antes.
 */
export async function upcomingHome(limit = 15): Promise<UIUpcoming[]> {
  return (await upcomingSeleccion()).slice(0, limit);
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
