// Mini-cliente TMDB para Deno (Edge Function). Espeja el patrón de la app
// (lib/tmdb.ts): Bearer v4 token + defaults AR. No reusa el de la app porque
// aquel es Node/Next; acá corre en Deno.
const BASE = "https://api.themoviedb.org/3";
const TOKEN = Deno.env.get("TMDB_READ_TOKEN") ?? "";
// --- Idioma, por entorno --------------------------------------------------
// Espeja `lib/idioma.ts` de la app: el idioma base sale de una variable y el
// default sigue siendo es-ES, asi que DESPLEGAR ESTO NO CAMBIA NADA. El cambio
// lo hace `supabase secrets set IDIOMA_TITULOS=es-MX`, que es lo que permite
// revertir sin volver a desplegar.
export const IDIOMA_BASE = Deno.env.get("IDIOMA_TITULOS") || "es-ES";
export const IDIOMA_FALLBACK = "es-ES";

// El fallback SOLO puede cambiar la salida si el idioma base es otro. Con es-ES
// es inerte, igual que en la app.
export const FALLBACK_ACTIVO = Deno.env.get("FALLBACK_IDIOMA") !== "0"
  && IDIOMA_BASE !== IDIOMA_FALLBACK;

const DEFAULTS: Record<string, string> = { language: IDIOMA_BASE, watch_region: "AR" };

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
  // `discover` lo devuelve en cada resultado desde siempre; se declara acá para
  // poder persistirlo. Es la señal de anime de `lib/proximamente.ts`.
  original_language?: string;
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
  // `overview`, `original_name` y `original_language` los pide el predicado de
  // idioma (_shared/idioma-nucleo.ts), no el sync.
  overview?: string;
  original_name?: string;
  original_language?: string;
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

export interface ProvidersResponse {
  results?: Record<string, { link?: string; flatrate?: RawProvider[] } | undefined>;
}

export function watchProviders(type: MediaType, id: number) {
  return tmdb<ProvidersResponse>(`/${type}/${id}/watch/providers`);
}

export function tvDetails(id: number, language?: string) {
  return tmdb<TvDetail>(`/tv/${id}`, language ? { language } : {});
}

/**
 * El detalle de una serie CON sus proveedores, en UNA sola llamada.
 *
 * El sync pedía dos cosas por serie —`/tv/{id}` para el `next_episode_to_air` y
 * `/tv/{id}/watch/providers` para el filtro argentino— y con 259 series eso son
 * 518 pedidos. `append_to_response` las trae juntas: 259.
 *
 * Medido sobre 20 series reales antes de tomarlo: proveedores AR **idénticos en
 * 20 de 20**, y los campos que el sync usa (`air_date`, `season_number`,
 * `episode_number` y `name` del próximo episodio, más `status`) idénticos en 20
 * de 20. Los bytes son los mismos: se transfiere lo mismo en un pedido en vez
 * de dos.
 *
 * ⚠️ La clave de la respuesta es literalmente `"watch/providers"`, con la
 * barra. No es un typo.
 */
export function tvDetailsConProveedores(id: number, language?: string) {
  return tmdb<TvDetail & { "watch/providers"?: ProvidersResponse }>(
    `/tv/${id}`,
    { ...(language ? { language } : {}), append_to_response: "watch/providers" },
  );
}

/**
 * Un episodio por COORDENADAS EXACTAS.
 *
 * Es la única forma correcta de pedir el respaldo del nombre de un episodio.
 * Volver a leer `next_episode_to_air` en el otro idioma parece equivalente y no
 * lo es: entre las dos llamadas "el próximo" puede haber avanzado, y entonces se
 * escribiría el nombre de OTRO episodio en una fila que apunta a este.
 */
export function episodeDetails(
  id: number, season: number, episode: number, language?: string,
) {
  return tmdb<{ id: number; name?: string; season_number?: number; episode_number?: number }>(
    `/tv/${id}/season/${season}/episode/${episode}`, language ? { language } : {},
  );
}

export interface RawProviderInfo {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
  display_priority: number;
  display_priorities?: Record<string, number>;
}

// Lista COMPLETA de watch providers de la región (AR por DEFAULTS).
export function providerList(type: MediaType) {
  return tmdb<{ results: RawProviderInfo[] }>(`/watch/providers/${type}`);
}
