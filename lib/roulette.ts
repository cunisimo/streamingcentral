import "server-only";
import { cardsByIds, watchLinkFor } from "./enrich";
import { roulettePlatformNames } from "./roulette-providers";
import { supabaseServer } from "./supabase";
import { dailySeed } from "./cache";
import type { MediaType, PlatformCode } from "./types";

// Tres escenarios, definidos por DURACIÓN — que es un dato de TMDB, no una
// inferencia. Los cuatro anteriores (solo/pareja/chicos/fondo) se cambiaron
// porque "ver solo" y "ver en pareja" no son atributos que existan en los
// datos: los dos terminaban filtrando por lo mismo. Y "fondo" mezclaba
// películas simples con películas flojas bajo la misma promesa.
//
// OJO: la función `get_roulette_picks` NO valida el escenario. Un valor que ya
// no existe cae en su `else true` y devuelve resultados sin filtrar por nada,
// sin tirar error. Por eso `esEscenario` gatea la entrada de la ruta.
// El corte está en 90 min: `corta` es `runtime <= 90`, `larga` es `> 90`.
export type Escenario = "corta" | "larga" | "chicos";

// El default de la función pasó de 'solo' a 'larga'.
export const ESCENARIO_DEFAULT: Escenario = "larga";
// Sin `export`: sólo lo usa `esEscenario`, acá abajo. No hace falta sacarlo
// del módulo.
const ESCENARIOS: Escenario[] = ["corta", "larga", "chicos"];
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

// Tope de contención del lado del server. El cliente (RuletaBanner.tsx) ya
// arma `excluir` acotado antes de armar la URL, pero esta ruta es pública y
// cualquiera puede pegarle directo con un query string más largo. Lo que no
// tiene techo acá es la lista de "ya la vi" del usuario (`vistos` en el
// cliente): "Otra" no es el problema, `useRouletteSeen` ya la capa en 300
// por escenario.
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

// `total` es cuántas filas trajo la RPC, ANTES de que `cardsByIds` descarte
// las que no pudo enriquecer. Es lo que distingue "pool agotado" (total = 0,
// hay que resetear los mostrados) de "vino algo pero se cayó al enriquecer"
// (total > 0, picks puede venir vacío igual por un hiccup de TMDB) — el
// cliente resetea el progreso de paginación sólo en el primer caso.
export interface RoulettePicksResult {
  picks: RoulettePick[];
  total: number;
}

export async function getRoulettePicks(opts: {
  escenario: Escenario;
  providers: PlatformCode[];
  excluir: number[];
}): Promise<RoulettePicksResult> {
  const db = supabaseServer();
  if (!db) return { picks: [], total: 0 };
  const nombres = roulettePlatformNames(opts.providers);
  if (!nombres.length) return { picks: [], total: 0 };

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
  if (!filas.length) return { picks: [], total: 0 };

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
      // trae la RPC en minutos. OJO: el formato "Xh Ym" de acá abajo es el de
      // la ficha completa sólo para `movie` (lib/enrich.ts:549) — en `tv` la
      // ficha usa "N temp." en cambio, y la RPC puede traer tv. No es "igual
      // que la ficha completa" en todos los casos.
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

  return { picks: picks.filter((p): p is RoulettePick => p !== null), total: filas.length };
}
