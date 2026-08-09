import "server-only";
import { cardsByIds, watchLinkFor } from "./enrich";
import { roulettePlatformNames } from "./roulette-providers";
import { supabaseServer } from "./supabase";
import { dailySeed } from "./cache";
import type { MediaType, PlatformCode } from "./types";

export type Escenario = "solo" | "pareja" | "chicos" | "fondo";
export const ESCENARIOS: Escenario[] = ["solo", "pareja", "chicos", "fondo"];
export const esEscenario = (s: string): s is Escenario =>
  (ESCENARIOS as string[]).includes(s);

// Cuántos candidatos pide cada tanda. El cliente los consume de a uno con
// "Otra": una query por tanda, no una por toque.
const TANDA = 20;

export interface RoulettePick {
  id: number;
  type: MediaType;
  title: string;
  year: number | null;
  runtime: string | null;
  poster: string | null;
  genres: string[];
  platforms: PlatformCode[];
  razon: string;
  advertencia: string | null;
  atencion: string | null;
  watchLink: string | null;
}

// Lo que devuelve la RPC. `title`, `genres` y `vote_average` de acá NO se usan
// para mostrar: son snapshot de auditoría del pipeline. Lo visible sale de TMDB.
interface FilaRpc {
  tmdb_id: number;
  media_type: MediaType;
  razon: string;
  advertencia: string | null;
  atencion: string | null;
}

export async function getRoulettePicks(opts: {
  escenario: Escenario;
  providers: PlatformCode[];
  excluir: number[];
}): Promise<RoulettePick[]> {
  const db = supabaseServer();
  if (!db) return [];
  const nombres = roulettePlatformNames(opts.providers);
  if (!nombres.length) return [];

  const { data, error } = await db.rpc("get_roulette_picks", {
    p_providers: nombres,
    p_escenario: opts.escenario,
    p_excluir: opts.excluir,
    p_region: "AR",
    // La MISMA semilla del día que usa el resto de la app: compartida a
    // propósito, es lo que permite que el cache sirva a varios usuarios.
    p_seed: String(dailySeed()),
    p_limit: TANDA,
  });
  if (error) throw new Error(`get_roulette_picks falló: ${error.message}`);

  const filas = (data ?? []) as FilaRpc[];
  if (!filas.length) return [];

  // Enriquecido con la misma función cacheada en Redis que usan los rieles del
  // Home: respeta idioma y región, y no duplica cache.
  const cards = await cardsByIds(
    filas.map((f) => ({ tipo: f.media_type, id: f.tmdb_id })),
  );
  const porId = new Map(cards.map((c) => [c.id, c]));

  const picks = await Promise.all(filas.map(async (f) => {
    const card = porId.get(f.tmdb_id);
    // Un título que TMDB no pudo enriquecer se descarta: sin póster ni título
    // la tarjeta no se sostiene, y hay 19 más en la tanda.
    if (!card) return null;
    return {
      id: card.id,
      type: card.type,
      title: card.title,
      year: card.year,
      runtime: card.runtime,
      poster: card.poster,
      genres: card.genres,
      platforms: card.platforms,
      razon: f.razon,
      advertencia: f.advertencia,
      atencion: f.atencion,
      watchLink: await watchLinkFor(card.type, card.id),
    } satisfies RoulettePick;
  }));

  return picks.filter((p): p is RoulettePick => p !== null);
}
