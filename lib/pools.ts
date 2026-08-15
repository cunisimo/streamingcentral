import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { discover, type DiscoverOpts, type RawTitle } from "./tmdb";
import { cached, TTL } from "./cache";
import { hoyAR } from "./fecha";
import { codesToTmdbIds } from "./providers-ar";
import type { MediaType, PlatformCode } from "./types";

// Pools de discover cacheados POR PLATAFORMA INDIVIDUAL.
//
// Hasta acá, discover no se cacheaba en absoluto: cada rearmado del Home hacía
// ~26 llamadas a TMDB para traer los mismos candidatos de siempre. Y lo que sí
// se cacheaba era el Home ya compuesto, cuya clave sirve para UNA combinación
// exacta de plataformas y toggles — o sea que no se puede personalizar sin una
// entrada por usuario.
//
// La idea es guardar el insumo en vez del resultado: un pool por plataforma
// suelta, compartido por todos los usuarios que la tengan, y la combinación de
// cada usuario se resuelve uniendo pools en memoria.
//
// CUIDADO con lo que esto NO es: la unión de pools por plataforma no da lo mismo
// que pedirle a TMDB el conjunto. TMDB devuelve el ranking de popularidad de la
// unión, paginado; unir la página 1 de cada plataforma da otra cosa, y la página
// 2 de la unión no es la unión de las páginas 2. Por eso se reordena por
// popularidad al unir, y por eso el Home compuesto no es idéntico al de antes.
// Da igual porque después se mezcla con la semilla del día, pero no se puede
// comparar byte a byte.

// Kill switch: POOL_CACHE=0 vuelve al camino viejo COMPLETO — una sola consulta
// a TMDB con el conjunto de plataformas del usuario, sin pools y sin cache. No
// alcanza con saltear el cache: si igual se pidiera un pool por plataforma, el
// costo en llamadas a TMDB seguiría siendo el nuevo y el switch no serviría ni
// para volver atrás ni para medir.
export const poolsHabilitados = process.env.POOL_CACHE !== "0";
const REGION = "AR";
const VERSION = "v1";

// Lo que se guarda: el candidato recortado, no el payload de TMDB. Una request
// del Home lee decenas de pools de una sola vez, así que el tamaño importa.
// `popularity` va sí o sí — es con lo que se reordena al unir.
export interface Candidato extends RawTitle {
  popularity?: number;
}

function recortar(t: RawTitle): Candidato {
  return {
    id: t.id,
    media_type: t.media_type,
    title: t.title,
    name: t.name,
    poster_path: t.poster_path,
    overview: t.overview,
    vote_average: t.vote_average,
    vote_count: t.vote_count,
    release_date: t.release_date,
    first_air_date: t.first_air_date,
    genre_ids: t.genre_ids,
    origin_country: t.origin_country,
    popularity: t.popularity,
  };
}

// Los parámetros de discover que definen QUÉ trae el pool, sin la plataforma ni
// la página, que son ejes propios de la clave.
export type ParamsReceta = Omit<DiscoverOpts, "providers" | "page">;

// Una receta es la declaración explícita de género + orden + piso de votos de
// una superficie. El nombre es para poder leer las claves en Redis; el hash es
// el que invalida.
export interface Receta {
  nombre: string;
  params: ParamsReceta;
}

// JSON con las claves ordenadas: sin esto, dos objetos equivalentes escritos en
// otro orden darían hashes distintos y duplicarían pools.
function estable(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(estable).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort()
    .filter((k) => o[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${estable(o[k])}`)
    .join(",")}}`;
}

// FNV-1a en base36, 7 caracteres. No es criptografía: solo tiene que cambiar
// cuando cambian los parámetros.
//
// LO QUE ESTE HASH IMPLICA, Y CONVIENE SABER ANTES DE QUE LOS NÚMEROS NO CIERREN:
// el pool de una plataforma NO es único. Hay una variante por cada configuración
// de filtros, porque `withoutGenres` depende del conjunto COMPLETO de
// plataformas del usuario (tener Crunchyroll apaga el filtro de animación en
// toda la app). O sea que "Netflix, acción, página 1" son hoy dos pools
// distintos: el de quien tiene Crunchyroll y el de quien no.
//
// El hash lo resuelve solo — nadie tiene que acordarse de nada — pero el precio
// es que multiplica la cantidad de pools y reduce cuánto se comparten entre
// usuarios. Con las variantes de hoy no molesta. Cuando se sumen recetas
// (hero, audiencia, chips), la multiplicación crece por los DOS lados: más
// recetas × más variantes de filtro. Si en algún momento la tasa de acierto de
// los pools baja sin explicación, mirar acá antes que al TTL.
function hashParams(p: ParamsReceta): string {
  const s = estable(p);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36).padStart(7, "0").slice(0, 7);
}

// disc:v1:AR:2026-08-15:movie:n:g-accion-home.1a2b3c4:p1
//
// El nombre legible NO invalida nada: si alguien mueve el piso de votos de una
// receta, el nombre queda igual. El hash de los parámetros reales sí, y no
// depende de que nadie se acuerde de subir la versión.
//
// El día va en la clave, y no es lo mismo que un TTL de 24 h. El Home promete
// ser el mismo durante todo el día: con un TTL que vence a media tarde, el pool
// se refetchea, la mezcla cambia con la misma semilla y el Home se reordena
// mientras el usuario lo está mirando. Con el día adentro, el pool rota cuando
// rota la semilla. El TTL (30 h) es solo el colchón para cruzar el límite.
//
// El costo es que a la medianoche argentina TODOS los pools quedan fríos de
// golpe — está documentado en docs/MANTENIMIENTO.md para que no se investigue
// como un bug.
export function clavePool(
  tipo: MediaType, plataforma: PlatformCode, receta: Receta, pagina: number,
): string {
  return `disc:${VERSION}:${REGION}:${hoyAR()}:${tipo}:${plataforma}:${receta.nombre}.${hashParams(receta.params)}:p${pagina}`;
}

// Un pool: una plataforma, una página, una receta.
async function pool(
  tipo: MediaType, plataforma: PlatformCode, receta: Receta, pagina: number,
): Promise<Candidato[]> {
  const ids = codesToTmdbIds([plataforma]);
  if (!ids.length) return [];
  const traer = async () => {
    const r = await discover(tipo, { ...receta.params, providers: ids, page: pagina });
    return r.results.map(recortar);
  };
  return cached(clavePool(tipo, plataforma, receta, pagina), TTL.pool, traer);
}

// Candidatos de varias plataformas y varias páginas, unidos.
//
// Todas las lecturas salen en el mismo tick, así que el batcher de lib/cache.ts
// las junta en MGET: N pools cuestan unos pocos comandos, no N.
export async function candidatosDePools(opts: {
  tipo: MediaType;
  providers: PlatformCode[];
  receta: Receta;
  pages?: number;
  startPage?: number;
}): Promise<Candidato[]> {
  const pages = Math.max(1, opts.pages ?? 1);
  const startPage = Math.max(1, opts.startPage ?? 1);
  if (!opts.providers.length) return [];

  const tareas: Promise<Candidato[]>[] = [];
  for (const p of opts.providers) {
    for (let i = 0; i < pages; i++) {
      tareas.push(pool(opts.tipo, p, opts.receta, startPage + i));
    }
  }
  // Un pool que se cae no tumba al resto: el riel se arma con lo que haya.
  const partes = await Promise.allSettled(tareas);
  const todos: Candidato[] = [];
  for (const r of partes) if (r.status === "fulfilled") todos.push(...r.value);

  // Dedup: un título en Netflix y en Disney+ viene en los dos pools.
  const vistos = new Set<number>();
  const unicos: Candidato[] = [];
  for (const t of todos) {
    if (vistos.has(t.id)) continue;
    vistos.add(t.id);
    unicos.push(t);
  }
  // Reordenar es obligatorio, no cosmético: cada pool viene ordenado por
  // popularidad pero la concatenación de dos no lo está, y el consumidor
  // (genreRail) asume que los primeros son los más relevantes antes de mezclar.
  unicos.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
  return unicos;
}

// --- Ejes de extracción ------------------------------------------------------
// El problema que resuelven: pedir siempre `popularity.desc` páginas 1-3 hace
// que el catálogo real quede fuera de la vista. Sci-fi tiene 406 películas
// elegibles y el riel mostraba 20 del mismo top; los carruseles de audiencia
// eran directamente el top 20 de la página 1, idéntico todos los días y para
// todos los usuarios.
//
// La rotación es INVISIBLE: los títulos de los rieles no cambian. Un encabezado
// variable arriesga el CLS que se arregló en fix/cls-reserva-de-espacio —donde
// el 29% del problema era justamente texto que cambiaba de alto— y además rotar
// filas sin avisar es lo que hace cualquier app de streaming.
export type Eje = "pop" | "top" | "nuevo" | "taquilla" | "hondo";

interface DefEje {
  // Para qué tipos vale. `taquilla` no existe en series: TMDB no tiene
  // `revenue` para tv, así que ahí el equivalente es `vote_count.desc` — "lo que
  // más gente vio", que es lo que taquilla aproxima en cine.
  tipos: MediaType[];
  params: (tipo: MediaType) => ParamsReceta;
  startPage: number;
}

// Piso de votos de `top`, decidido midiendo qué queda afuera y no a ojo. Con 60
// o 100 el ranking se llena de ruido de nicho (un recital de BTS con 114 votos
// arriba de Cadena Perpetua); con 300 aparecen Cadena Perpetua, La lista de
// Schindler y El caballero oscuro. 500 y 1000 dan el mismo top pero achican el
// pool (3130 elegibles contra 2642 y 2036), y un pool más chico es menos
// variedad al mezclar. Solapa 2 de 20 con `pop`: el eje aporta 18 títulos que
// hoy no se ven nunca.
const PISO_TOP = 300;

const EJES: Record<Eje, DefEje> = {
  pop: { tipos: ["movie", "tv"], startPage: 1, params: () => ({ sortBy: "popularity.desc", minVotes: 60 }) },
  top: { tipos: ["movie", "tv"], startPage: 1, params: () => ({ sortBy: "vote_average.desc", minVotes: PISO_TOP }) },
  nuevo: {
    tipos: ["movie", "tv"], startPage: 1,
    // Tope superior en fecha ARGENTINA: sin él, "más recientes" se llena de
    // títulos que todavía no salieron. El piso de votos baja porque un estreno
    // reciente no tuvo tiempo de juntar 60.
    params: (tipo) => ({
      sortBy: tipo === "movie" ? "primary_release_date.desc" : "first_air_date.desc",
      minVotes: 10,
      extra: {
        [tipo === "movie" ? "primary_release_date.lte" : "first_air_date.lte"]: hoyAR(),
      } as Record<string, string>,
    }),
  },
  taquilla: {
    tipos: ["movie", "tv"], startPage: 1,
    params: (tipo) => ({ sortBy: tipo === "movie" ? "revenue.desc" : "vote_count.desc", minVotes: 60 }),
  },
  // Mismo criterio que `pop` pero más abajo en la lista. Sin excepción de
  // etiqueta: como la rotación es invisible, "lo popular de la página 4" no
  // necesita presentarse distinto.
  hondo: { tipos: ["movie", "tv"], startPage: 4, params: () => ({ sortBy: "popularity.desc", minVotes: 60 }) },
};

const ORDEN: Eje[] = ["pop", "top", "nuevo", "taquilla", "hondo"];

function hashTexto(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Qué eje le toca hoy a una superficie. Determinístico por día: dos usuarios del
// mismo día comparten eje y por lo tanto comparten pool. El desplazamiento por
// superficie evita que todo el Home salga el mismo día con el mismo criterio.
export function ejeDelDia(superficie: string, tipo: MediaType, semilla: number): Eje {
  const validos = ORDEN.filter((e) => EJES[e].tipos.includes(tipo));
  return validos[(semilla + hashTexto(superficie)) % validos.length];
}

// Receta de una superficie para el eje que le toca hoy.
export function recetaDelDia(opts: {
  superficie: string;      // "aud-family", "g-accion-home", "hero"
  tipo: MediaType;
  semilla: number;
  base?: ParamsReceta;     // géneros, keywords, exclusiones: lo propio de la superficie
}): { receta: Receta; eje: Eje; startPage: number } {
  const eje = ejeDelDia(opts.superficie, opts.tipo, opts.semilla);
  const def = EJES[eje];
  const paramsEje = def.params(opts.tipo);
  const base = opts.base ?? {};
  return {
    eje,
    startPage: def.startPage,
    receta: {
      nombre: `${opts.superficie}-${eje}`,
      params: {
        ...base,
        ...paramsEje,
        // El `extra` del eje se suma al de la superficie en vez de pisarlo: la
        // certificación por edad de los carruseles de audiencia viaja ahí.
        extra: { ...(base.extra ?? {}), ...(paramsEje.extra ?? {}) },
      },
    },
  };
}

// --- Registro de ejes --------------------------------------------------------
// Qué eje usó cada superficie en este rearmado. No hay interfaz: es solo el
// registro. Cuando haya usuarios va a hacer falta saber qué eje funcionó mejor,
// y sin este dato no hay forma de reconstruirlo después — el eje no queda
// escrito en ningún lado, se deduce de la semilla del día, y esa semilla ya
// cambió para cuando uno se hace la pregunta.
//
// Va por AsyncLocalStorage y no en un objeto de módulo por lo mismo que las
// métricas de cache: en Vercel conviven varios requests en la misma instancia.
const alsEjes = new AsyncLocalStorage<Map<string, Eje>>();

export async function conRegistroDeEjes<T>(fn: () => Promise<T>): Promise<{ res: T; ejes: Map<string, Eje> }> {
  const ejes = new Map<string, Eje>();
  const res = await alsEjes.run(ejes, fn);
  return { res, ejes };
}

export function registrarEje(superficie: string, eje: Eje) {
  alsEjes.getStore()?.set(superficie, eje);
}
