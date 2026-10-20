// El Top público (`/top`, `/api/top`), armado SÓLO con las publicaciones
// manuales del dueño. PURO: las lecturas llegan inyectadas, así se prueba sin
// base ni red (`lib/top-solo-manual.test.ts`); `lib/top.ts` lo cablea.
//
// 🔴 NO HAY NINGUNA FUENTE ALTERNATIVA (decisión del dueño, 2026-10-20). El
// ranking de cada bloque —qué títulos y en qué orden— es exactamente la última
// versión publicada en `/admin/top`. Antes había dos respaldos: el top
// automático de Netflix (`netflix_top10`) y la popularidad de TMDB para las
// otras cinco, servidos mientras faltara cualquiera de los doce bloques (el
// "cutover atómico"). Los dos se retiraron. TMDB sólo ENRIQUECE los títulos
// elegidos (póster, año, plataformas); nunca elige ni ordena.
//
// Tres estados, y no se confunden:
//  - **publicado**: el bloque muestra sus posiciones, tal cual.
//  - **sin publicar**: el bloque aparece y dice que todavía no está
//    disponible. Los demás se ven igual: un bloque faltante no arrastra a
//    nadie ni dispara un respaldo.
//  - **lectura fallida**: no se pudo leer la base. Es un ERROR con reintento,
//    nunca "no hay publicaciones" ni un ranking alternativo.
import { registrarDescarteTmdb } from "./fallos-tmdb.ts";
import { claveBloque, TOP_PLATAFORMAS, type EntradaTop } from "./top-manual-nucleo.ts";
import type { MediaType, PlatformCode, UITitle } from "./types";

// `item` en null = la posición existe pero no hay ficha (TMDB no la devolvió).
// Se renderiza igual con `rawTitle`: un top de 9 se lee como un bug, y el
// orden es del dueño.
export interface TopSlot { rank: number; item: UITitle | null; rawTitle: string }

export type EstadoBloque = "publicado" | "sin-publicar";

export interface TopBlock {
  platform: PlatformCode;
  /**
   * Siempre `"manual"`. Se conserva porque los bundles Android ya publicados
   * lo leen para elegir el subtítulo; las fuentes viejas (`"netflix"`,
   * `"popular"`) ya no existen.
   */
  source: "manual";
  /** Ausente en payloads anteriores al 20/10/2026: se lee como `publicado`. */
  estado: EstadoBloque;
  /** Fecha de captura declarada por el dueño. NO se renderiza en la app pública. */
  week?: string;
  slots: TopSlot[];
}

export interface TopPayload {
  mine: TopBlock[];
  others: TopBlock[];
  /**
   * Bloques publicados cuyo ENRIQUECIMIENTO falló (TMDB). Se muestran igual,
   * con sus posiciones y títulos, y la vista ofrece reintentar.
   */
  fallos: number;
  degradado: boolean;
}

/** Lo que el Top necesita de una publicación: la fecha y sus posiciones. */
export interface PublicacionTop { captured_at: string; entradas: EntradaTop[] }

export interface DepsTop {
  /**
   * La última versión publicada de cada bloque, por `claveBloque`.
   * 🔴 LANZA si la lectura falla: un error no puede volverse "no hay nada".
   */
  leerPublicaciones: () => Promise<Map<string, PublicacionTop>>;
  /** Fichas de los títulos elegidos. Puede devolver menos (sin ficha) o lanzar. */
  enriquecer: (pares: { tipo: MediaType; id: number }[]) => Promise<UITitle[]>;
  /** La plataforma del bloque cuando TMDB no sabe nada (`conPlataformaDeLaFuente`). */
  conPlataforma: (item: UITitle, plataforma: PlatformCode) => UITitle;
  /** Orden de aparición (el de `PLATFORMS`, como el selector). */
  orden: (p: PlatformCode) => number;
}

export type ResultadoTop =
  | { ok: true; payload: TopPayload }
  | { ok: false; error: string };

export const ERROR_LECTURA_TOP = "No se pudieron leer las publicaciones del Top.";

async function bloque(
  plataforma: PlatformCode, tipo: MediaType, pub: PublicacionTop | undefined,
  deps: DepsTop, c: { fallos: number },
): Promise<TopBlock> {
  if (!pub) return { platform: plataforma, source: "manual", estado: "sin-publicar", slots: [] };

  // El orden es el de `posicion`, y nada más. La base ya las devuelve
  // ordenadas; se ordena igual para no depender de eso. Sin recorte: la
  // publicación valida sus diez posiciones (`publicar_top`).
  const entradas = [...pub.entradas].sort((a, b) => a.posicion - b.posicion);
  let fichas: UITitle[] = [];
  try {
    fichas = await deps.enriquecer(entradas.map((e) => ({ tipo: e.tipo, id: e.tmdb_id })));
  } catch (e) {
    // Sin fichas el bloque se muestra IGUAL, con los títulos que cargó el
    // dueño: esconderlo sería perder su ranking por un hipo de TMDB. El 200
    // sale `degradado` y la vista ofrece reintentar.
    c.fallos++;
    const etiqueta = `top:${tipo}:${plataforma}`;
    registrarDescarteTmdb(e, etiqueta);
    // Error completo (con stack): con sólo `.message` un bug propio se
    // confunde con un 429 de TMDB.
    console.error(`[top] "${etiqueta}": no se pudieron enriquecer las fichas; el bloque se muestra con sus títulos —`, e);
  }
  const porClave = new Map(fichas.map((f) => [`${f.type}:${f.id}`, deps.conPlataforma(f, plataforma)]));
  return {
    platform: plataforma,
    source: "manual",
    estado: "publicado",
    week: pub.captured_at,
    slots: entradas.map((e) => ({
      rank: e.posicion,
      item: porClave.get(`${e.tipo}:${e.tmdb_id}`) ?? null,
      rawTitle: e.titulo,
    })),
  };
}

export async function componerTop(
  tipo: MediaType, providers: PlatformCode[], deps: DepsTop,
): Promise<ResultadoTop> {
  let pubs: Map<string, PublicacionTop>;
  try {
    pubs = await deps.leerPublicaciones();
  } catch {
    return { ok: false, error: ERROR_LECTURA_TOP };
  }

  const elegidas = new Set(providers);
  const porOrden = (a: PlatformCode, b: PlatformCode) => deps.orden(a) - deps.orden(b);
  const mias = TOP_PLATAFORMAS.filter((p) => elegidas.has(p)).sort(porOrden);
  const resto = TOP_PLATAFORMAS.filter((p) => !elegidas.has(p)).sort(porOrden);

  const c = { fallos: 0 };
  const armar = (p: PlatformCode) => bloque(p, tipo, pubs.get(claveBloque(p, tipo)), deps, c);
  const [mine, others] = await Promise.all([
    Promise.all(mias.map(armar)),
    Promise.all(resto.map(armar)),
  ]);
  return { ok: true, payload: { mine, others, fallos: c.fallos, degradado: c.fallos > 0 } };
}
