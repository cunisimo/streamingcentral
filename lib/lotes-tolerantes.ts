// Dos lotes cacheados que toleran el fallo de TMDB por elemento y NO guardan
// el resultado parcial. Etapa 3.a de capacidad (#19), corrección tras la
// auditoría de Codex sobre e930a1d (hallazgos 1 y 3). Módulo PURO.
//
//   - Directores (`directorCards`): antes `Promise.allSettled` + `cached`
//     incondicional; un 429 en un director dejaba la lista corta guardada
//     `TTL.catalog` (24 h), y el `registrarDescarteTmdb` que se había agregado
//     corría FUERA de todo contexto (no hacía nada).
//   - Portadas de género (`genreCovers`): un `catch` por género convertía el
//     fallo en `[]` y el mapa incompleto quedaba 24 h. Era el doceavo sitio
//     que tragaba errores de TMDB, y el inventario a mano decía once.
//
// La regla es la misma de `resolverConCache` (lib/reparar-y-cachear.ts): un
// resultado con `fallo` se DEVUELVE —los directores que llegaron, el fallback
// visual de siempre para el género caído— pero no se escribe; la llamada
// siguiente vuelve a intentar y, si TMDB volvió, obtiene el resultado completo
// y recién entonces lo guarda. Con TMDB sano, la salida y la escritura son
// las de siempre.
import { resolverConCache, type BackendCache } from "./reparar-y-cachear.ts";
import { esErrorTmdb } from "./tmdb-error.ts";
import { registrarDescarteTmdb } from "./fallos-tmdb.ts";

export async function resolverDirectores<T extends { id: number }>(o: {
  ids: readonly number[];
  ttl: number;
  cache: BackendCache;
  clave?: string;
  /** `personDetails` ya mapeado a la card; lanza `ErrorTmdb` si TMDB falló. */
  pedirDetalle: (id: number) => Promise<T>;
}): Promise<T[]> {
  return resolverConCache<T[]>({
    clave: o.clave ?? "people:directors",
    ttl: o.ttl,
    backend: o.cache,
    producir: async () => {
      const settled = await Promise.allSettled(o.ids.map((id) => o.pedirDetalle(id)));
      let fallo = false;
      const valor: T[] = [];
      for (const s of settled) {
        if (s.status === "fulfilled") { valor.push(s.value); continue; }
        // Un director que no llegó se descarta como siempre; pero el lote NO
        // se guarda, sea cual sea la causa (de TMDB se registra además).
        fallo = true;
        if (esErrorTmdb(s.reason)) registrarDescarteTmdb(s.reason, "directorCards");
      }
      return { valor, fallo };
    },
  });
}

export async function resolverPortadas(o: {
  slugs: readonly string[];
  ttl: number;
  cache: BackendCache;
  clave?: string;
  /** Los `poster_path` candidatos de un género, en orden; lanza `ErrorTmdb` si TMDB falló. */
  pedirPosters: (slug: string) => Promise<string[]>;
  img: (path: string | null) => string | null;
}): Promise<Record<string, string | null>> {
  return resolverConCache<Record<string, string | null>>({
    clave: o.clave ?? "genre:covers:v2",
    ttl: o.ttl,
    backend: o.cache,
    producir: async () => {
      let fallo = false;
      // 1) Candidatos (posters) por género, en paralelo.
      const candidates = await Promise.all(o.slugs.map(async (slug) => {
        try {
          return [slug, await o.pedirPosters(slug)] as const;
        } catch (e) {
          // El fallback visual de siempre (sin póster) para ese género, y el
          // mapa entero sin guardar: al recuperarse TMDB, la siguiente llamada
          // trae la portada. De TMDB se registra la causa.
          fallo = true;
          if (esErrorTmdb(e)) registrarDescarteTmdb(e, "genreCovers");
          return [slug, [] as string[]] as const;
        }
      }));
      // 2) Asignación secuencial: cada género toma el primer poster no usado por
      //    otro (evita imágenes repetidas entre tiles). Fallback: su primer poster.
      const used = new Set<string>();
      const entries = candidates.map(([slug, posters]) => {
        const pick = posters.find((p) => !used.has(p)) ?? posters[0] ?? null;
        if (pick) used.add(pick);
        return [slug, o.img(pick)] as const;
      });
      return { valor: Object.fromEntries(entries), fallo };
    },
  });
}
