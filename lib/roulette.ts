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

// Cuántos ids de "ya la mostré" se dejan pasar a la RPC. Los pools por
// escenario son chicos (100-300 títulos), así que en una sesión larga de
// "Otra" el excluir crece sin techo si no se le pone un tope acá.
const MAX_EXCLUIR = 500;

// Lo que devuelve la RPC. `title`, `genres` y `vote_average` de acá NO se usan
// para mostrar: son snapshot de auditoría del pipeline y cambian con el idioma.
// `runtime` es la excepción: son minutos, no varían por locale, y es el único
// dato de duración que tenemos (`cardsByIds` siempre trae `runtime: null`,
// porque usa el shape liviano de card, no el de detalle). Por eso viene de acá.
interface FilaRpc {
  tmdb_id: number;
  media_type: MediaType;
  razon: string;
  advertencia: string | null;
  atencion: string | null;
  runtime: number | null;
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

  // Deduplicado y con tope: `excluir` llega crudo del query string y se
  // arrastra tanda tras tanda a medida que el usuario toca "Otra". Sin esto
  // la URL crece sin límite en una sesión larga.
  const excluir = [...new Set(opts.excluir)].slice(0, MAX_EXCLUIR);

  const { data, error } = await db.rpc("get_roulette_picks", {
    p_providers: nombres,
    p_escenario: opts.escenario,
    p_excluir: excluir,
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
  // Clave `type:id`, NO solo `id`: los ids de TMDB son namespaces separados
  // por media_type, así que `movie:550` y `tv:550` son títulos distintos que
  // pueden caer en la misma tanda (la RPC mezcla ambos tipos). Indexar solo
  // por id hace que uno pise al otro y una pick muestre título/póster ajenos.
  const porClave = new Map(cards.map((c) => [`${c.type}:${c.id}`, c]));

  const picks = await Promise.all(filas.map(async (f) => {
    const card = porClave.get(`${f.media_type}:${f.tmdb_id}`);
    // Un título que TMDB no pudo enriquecer se descarta: sin póster ni título
    // la tarjeta no se sostiene, y hay 19 más en la tanda.
    if (!card) return null;
    // El link del agregador es un segundo pedido a Redis (cache que
    // `cardsByIds` ya calentó): en el camino feliz pega en cache, pero un
    // hiccup de Redis o un TTL que vence entre medio no puede tirar abajo
    // la pick entera. Sin link la tarjeta se sostiene igual.
    let watchLink: string | null = null;
    try {
      watchLink = await watchLinkFor(card.type, card.id);
    } catch (err) {
      console.error(`[ruleta] watchLinkFor ${card.type}/${card.id} falló —`, err);
    }
    return {
      id: card.id,
      type: card.type,
      title: card.title,
      year: card.year,
      // `card.runtime` sale de `cardsByIds` → `titleCard`, que siempre lo deja
      // en null (usa el shape liviano, no el de detalle). La duración real la
      // trae la RPC en minutos; se formatea igual que la ficha completa.
      runtime: f.runtime ? `${Math.floor(f.runtime / 60)}h ${f.runtime % 60}m` : null,
      poster: card.poster,
      genres: card.genres,
      platforms: card.platforms,
      razon: f.razon,
      advertencia: f.advertencia,
      atencion: f.atencion,
      watchLink,
    } satisfies RoulettePick;
  }));

  return picks.filter((p): p is RoulettePick => p !== null);
}
