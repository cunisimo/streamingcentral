import "server-only";
import { cardsByIds, listByCategory } from "./enrich";
import { latestWeekRows } from "./netflix-top10";
import { cached, TTL } from "./cache";
import { claveTopPop } from "./claves";
import { HUELLA_EN_CLAVES } from "./idioma";
import { platformOrder } from "./providers-ar";
import type { MediaType, PlatformCode, UITitle } from "./types";

// Las seis del v1. Elegidas por tamaño de catálogo en AR (ver el spec): las
// demás no llegan a diez posiciones sin verse vacías al lado de Netflix. El
// orden NO es el de aparición en la página — eso lo decide `platformOrder`
// (el mismo orden de PLATFORMS que usa el selector) en `buildTop`, más abajo.
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

export interface TopPayload {
  mine: TopBlock[];
  others: TopBlock[];
  // Mismo criterio que HomePayload (lib/home.ts): cuántos bloques se cayeron
  // (`safe` los descartó por una excepción, ej. un 429 transitorio de TMDB) y
  // el booleano derivado. Sin esto, un 200 con 5 de 6 bloques era indistinguible
  // de "esa plataforma no tiene top" — mensaje falso y sin forma de reintentar.
  fallos: number;
  degradado: boolean;
}

// Bloque por popularidad. Sin `scope`, así que NO corren los filtros de
// animación/familia de lib/audience.ts: esto es un ranking, no un riel curado.
async function popularBlock(platform: PlatformCode, tipo: MediaType): Promise<TopBlock> {
  const items = await cached(claveTopPop(platform, tipo, HUELLA_EN_CLAVES), TTL.catalog, async () => {
    const r = await listByCategory({
      tipo, providers: [platform], sortBy: "popularity.desc",
      // Explícito, no el default de discover(): "lo más popular ahora" con
      // menos de 60 votos no es popular en ningún sentido útil, es ruido. Medido
      // contra Netflix AR el piso cambia 2 de 10 posiciones y lo que saca es
      // justamente eso — ruido, no señal real.
      minVotes: 60,
    });
    // `cached()` guarda cualquier valor que el fetcher devuelva, incluido `[]`
    // (ver lib/cache.ts): un [] real de "esta plataforma no tiene top" es
    // indistinguible de un [] por un hipo transitorio de TMDB (settleAll se
    // traga los rechazos por título, así que una ráfaga de 429 puede dejar los
    // candidatos en cero). Tirar acá hace que `cached()` no escriba nada y que
    // `safe()` en buildTop lo cuente como fallo real — mismo criterio que
    // lib/curated.ts con su propia blocklist.
    if (!r.length) throw new Error(`sin resultados para ${platform}/${tipo}`);
    return r;
  });
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

// --- Tolerancia a fallos -----------------------------------------------------
// Mismo criterio que `safe()` en lib/home.ts: antes, un solo `Promise.all` sin
// aislar hacía que un 429 transitorio en UNA plataforma tumbara el array entero
// (mine o others), y con él los bloques que ya habían resuelto bien — incluido
// Netflix, que ni siquiera es la plataforma que falló. Acá un bloque caído se
// loguea, se cuenta en `c.fallos` y se descarta, como ya se hace con los que
// quedan sin slots (eso no es un fallo, es una plataforma sin top hoy).
interface Contador { fallos: number }

async function safe(c: Contador, etiqueta: string, fn: () => Promise<TopBlock>): Promise<TopBlock | null> {
  try {
    return await fn();
  } catch (e) {
    c.fallos++;
    // Error completo (con stack): con solo `.message` un bug propio se
    // confunde con un 429 de TMDB, igual que en home.ts.
    console.error(`[top] "${etiqueta}" falló, se descarta el bloque —`, e);
    // Fuera de producción se re-lanza: un bug propio tiene que verse en
    // desarrollo (500 + stack), no esconderse detrás de un bloque descartado.
    if (process.env.NODE_ENV !== "production") throw e;
    return null;
  }
}

export async function buildTop(tipo: MediaType, providers: PlatformCode[]): Promise<TopPayload> {
  const elegidas = new Set(providers);
  const orden = (a: PlatformCode, b: PlatformCode) => platformOrder(a) - platformOrder(b);
  const mias = TOP_PLATFORMS.filter((p) => elegidas.has(p)).sort(orden);
  const resto = TOP_PLATFORMS.filter((p) => !elegidas.has(p)).sort(orden);

  const c: Contador = { fallos: 0 };
  const armar = (p: PlatformCode) =>
    safe(c, `${tipo}:${p}`, () => (p === "n" ? netflixBlock(tipo) : popularBlock(p, tipo)));
  // Sin limitador propio: el semáforo de lib/tmdb.ts ya pone el techo global.
  const [mine, others] = await Promise.all([
    Promise.all(mias.map(armar)),
    Promise.all(resto.map(armar)),
  ]);
  // Un bloque caído (null) o sin nada que mostrar no se renderiza.
  const conAlgo = (b: TopBlock | null): b is TopBlock => !!b && b.slots.length > 0;
  if (c.fallos) console.error(`[top] payload degradado: ${c.fallos} bloque(s) caído(s)`);
  return {
    mine: mine.filter(conAlgo), others: others.filter(conAlgo),
    fallos: c.fallos, degradado: c.fallos > 0,
  };
}
