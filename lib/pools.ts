import "server-only";
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
