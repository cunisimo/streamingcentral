import "server-only";
import { cardsByIds, listByCategory } from "./enrich";
import { latestWeekRows } from "./netflix-top10";
import { cached, TTL } from "./cache";
import { platformOrder } from "./providers-ar";
import type { MediaType, PlatformCode, UITitle } from "./types";

// Las seis del v1. El orden es el de aparición en la página dentro de cada
// grupo. Elegidas por tamaño de catálogo en AR (ver el spec): las demás no
// llegan a diez posiciones sin verse vacías al lado de Netflix.
export const TOP_PLATFORMS: PlatformCode[] = ["n", "p", "m", "d", "at", "cr"];

const TOPE = 10;

// `item` en null = la posición existe pero no tenemos ficha (título de Netflix
// sin resolver). Se renderiza igual: un top 9 se lee como un bug.
export interface TopSlot { rank: number; item: UITitle | null; rawTitle: string }
export interface TopBlock {
  platform: PlatformCode;
  source: "netflix" | "popular";
  week?: string;
  slots: TopSlot[];
}

// Bloque por popularidad. Sin `scope`, así que NO corren los filtros de
// animación/familia de lib/audience.ts: esto es un ranking, no un riel curado.
async function popularBlock(platform: PlatformCode, tipo: MediaType): Promise<TopBlock> {
  const items = await cached(`top:pop:${platform}:${tipo}`, TTL.catalog, () =>
    listByCategory({ tipo, providers: [platform], sortBy: "popularity.desc" }),
  );
  return {
    platform,
    source: "popular",
    slots: items.slice(0, TOPE).map((item, i) => ({
      rank: i + 1, item, rawTitle: item.title,
    })),
  };
}

// Bloque de Netflix con el dato oficial. Si la tabla está vacía (el cron nunca
// corrió, o Supabase no está configurado) cae a popularidad: nunca se muestra
// un bloque roto ni un hueco.
async function netflixBlock(tipo: MediaType): Promise<TopBlock> {
  const data = await latestWeekRows();
  const filas = tipo === "movie" ? data?.movie : data?.tv;
  if (!data || !filas?.length) return popularBlock("n", tipo);

  const conId = filas.filter((f) => f.tmdbId != null);
  const cards = await cardsByIds(conId.map((f) => ({ tipo, id: f.tmdbId as number })));
  // cardsByIds descarta lo que no pudo enriquecer y no preserva el orden, así
  // que se reindexa por id y se rearma siguiendo el rank, que es el que manda.
  const porId = new Map(cards.map((c) => [c.id, c]));

  return {
    platform: "n",
    source: "netflix",
    week: data.week,
    slots: filas.slice(0, TOPE).map((f) => ({
      rank: f.rank,
      item: f.tmdbId != null ? porId.get(f.tmdbId) ?? null : null,
      rawTitle: f.rawTitle,
    })),
  };
}

export async function buildTop(tipo: MediaType, providers: PlatformCode[]) {
  const elegidas = new Set(providers);
  const orden = (a: PlatformCode, b: PlatformCode) => platformOrder(a) - platformOrder(b);
  const mias = TOP_PLATFORMS.filter((p) => elegidas.has(p)).sort(orden);
  const resto = TOP_PLATFORMS.filter((p) => !elegidas.has(p)).sort(orden);

  const armar = (p: PlatformCode) => (p === "n" ? netflixBlock(tipo) : popularBlock(p, tipo));
  // Sin limitador propio: el semáforo de lib/tmdb.ts ya pone el techo global.
  const [mine, others] = await Promise.all([
    Promise.all(mias.map(armar)),
    Promise.all(resto.map(armar)),
  ]);
  // Un bloque sin nada que mostrar no se renderiza.
  const conAlgo = (b: TopBlock) => b.slots.length > 0;
  return { mine: mine.filter(conAlgo), others: others.filter(conAlgo) };
}
