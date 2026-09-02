import "server-only";
import { cardsByIds, listByCategoryCacheable } from "./enrich";
import { withFallosDisponibilidad } from "./fallos-disponibilidad";
import { latestWeekRows } from "./netflix-top10";
import { ultimasPublicaciones, type RankingFila } from "./top-manual";
import { claveBloque, hayCutover } from "./top-manual-nucleo";
import { cached, cachedLoc, cachedLocIf, TTL } from "./cache";
import { claveTopPop } from "./claves";
import { HUELLA_IDIOMA } from "./idioma";
import { platformOrder } from "./providers-ar";
import { conPlataformaDeLaFuente } from "./top-plataformas";
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
/**
 * De dónde salió el bloque.
 *
 * ⚠️ `"netflix"` y `"popular"` son las fuentes VIEJAS y sólo se sirven antes del
 * cutover. El copy público ya no las distingue —todo es "Top semanal"— pero el
 * campo se conserva porque `TopView` lo usa para decidir si muestra el logo de
 * la fuente, y borrarlo sería un cambio de contrato sin necesidad.
 */
export type TopSource = "netflix" | "popular" | "manual";
export interface TopBlock {
  platform: PlatformCode;
  source: TopSource;
  /**
   * La fecha de captura del ranking.
   *
   * ⚠️ NO SE RENDERIZA en la app pública, y es una decisión de producto: las
   * fechas de captura viven en el dashboard. Viaja en el payload porque el
   * bloque manual la necesita para diagnosticar desde el dashboard.
   */
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
  // Si la reparación de idioma falló, el bloque se devuelve igual pero NO se
  // guarda: si no, un top sin reparar quedaba congelado 24 h.
  //
  // Lo mismo vale para la disponibilidad: `senal.fallo` sólo cubría el idioma,
  // así que un top con títulos en gris por una caída de la evidencia quedaba
  // congelado 24 h. El contexto de abajo lo cierra.
  const senal = { fallo: false };
  const items = await cachedLocIf(claveTopPop(platform, tipo, HUELLA_IDIOMA), TTL.catalog, async () => {
    const { res, fallos } = await withFallosDisponibilidad(async () => {
    const r = await listByCategoryCacheable({
      tipo, providers: [platform], sortBy: "popularity.desc",
      // Explícito, no el default de discover(): "lo más popular ahora" con
      // menos de 60 votos no es popular en ningún sentido útil, es ruido. Medido
      // contra Netflix AR el piso cambia 2 de 10 posiciones y lo que saca es
      // justamente eso — ruido, no señal real.
      minVotes: 60,
      senal,
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
    if (fallos) senal.fallo = true;
    return res;
  }, () => !senal.fallo);
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
  //
  // `conPlataformaDeLaFuente` es lo único que este bloque sabe y `cardsByIds`
  // no: estos veinte títulos los publicó Netflix como lo más visto EN Netflix
  // Argentina, así que la plataforma es un dato de la fuente. Sin eso, un
  // estreno que TMDB todavía no tiene fichado como disponible entra al bloque
  // de Netflix pintado en gris y con "No está en tus plataformas" — ver el
  // comentario de esa función.
  const porId = new Map(cards.map((c) => [c.id, conPlataformaDeLaFuente(c, "n")]));

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

/**
 * Un bloque del Top cargado a mano.
 *
 * `conPlataformaDeLaFuente` se conserva y acá es todavía más claro que en el
 * bloque de Netflix: la plataforma la eligió el dueño al armar el ranking, así
 * que es un dato del bloque y no una deducción sobre TMDB. Sin eso, un estreno
 * que TMDB no tiene fichado entraría al bloque en gris y con "No está en tus
 * plataformas".
 *
 * La misma confirmación alimenta además la procedencia `top-manual` del
 * resolvedor central, así que el título tampoco sale gris en la ficha ni en la
 * búsqueda.
 */
async function bloqueManual(
  plataforma: PlatformCode, r: RankingFila,
): Promise<TopBlock> {
  const cards = await cardsByIds(
    r.entradas.map((e) => ({ tipo: e.tipo, id: e.tmdb_id })),
  );
  const porClave = new Map(
    cards.map((c) => [`${c.type}:${c.id}`, conPlataformaDeLaFuente(c, plataforma)]),
  );
  return {
    platform: plataforma,
    source: "manual",
    week: r.captured_at,
    slots: r.entradas.slice(0, TOPE).map((e) => ({
      rank: e.posicion,
      // `null` = la posición existe y no tenemos ficha. Se renderiza igual con
      // `rawTitle`: un top de 9 se lee como un bug.
      item: porClave.get(`${e.tipo}:${e.tmdb_id}`) ?? null,
      rawTitle: e.titulo,
    })),
  };
}

/**
 * ¿Ya se puede servir el Top manual?
 *
 * 🔴 EL CUTOVER ES ATÓMICO, por decisión del dueño: mientras falte cualquiera de
 * los doce bloques, `/top` ENTERO sigue con la implementación vieja. No se
 * mezclan fuentes por bloque — media página con ranking curado y media con
 * popularidad de TMDB no le da al lector ninguna forma de saber qué mira.
 *
 * Un fallo al leer las publicaciones tampoco cambia de fuente: se sigue con lo
 * viejo. Que Supabase se caiga no puede vaciar el Top.
 */
async function publicacionesSiHayCutover(): Promise<Map<string, RankingFila> | null> {
  try {
    const pubs = await ultimasPublicaciones();
    return hayCutover(new Set(pubs.keys())) ? pubs : null;
  } catch (e) {
    console.error("[top] no se pudieron leer las publicaciones manuales —", e);
    return null;
  }
}

export async function buildTop(tipo: MediaType, providers: PlatformCode[]): Promise<TopPayload> {
  const manual = await publicacionesSiHayCutover();
  const elegidas = new Set(providers);
  const orden = (a: PlatformCode, b: PlatformCode) => platformOrder(a) - platformOrder(b);
  const mias = TOP_PLATFORMS.filter((p) => elegidas.has(p)).sort(orden);
  const resto = TOP_PLATFORMS.filter((p) => !elegidas.has(p)).sort(orden);

  const c: Contador = { fallos: 0 };
  const armar = (p: PlatformCode) =>
    safe(c, `${tipo}:${p}`, () => {
      // Después del cutover, TODOS los bloques salen de la carga manual: el
      // `hayCutover` de arriba ya garantizó que los doce están publicados.
      if (manual) return bloqueManual(p, manual.get(claveBloque(p, tipo))!);
      return p === "n" ? netflixBlock(tipo) : popularBlock(p, tipo);
    });
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
