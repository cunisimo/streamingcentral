// El enriquecido de los resultados de búsqueda, con el fallo OPCIONAL de
// `providersOf` tolerado y registrado. Etapa 3.a de capacidad (#19), corrección
// tras la auditoría de Codex sobre e930a1d (hallazgo 2). Módulo PURO, sin
// `server-only`: las dependencias que tocan TMDB se inyectan.
//
// 🔴 EL AGUJERO QUE CIERRA. `search()` recuperaba un 429 de `providersOf` con
// una card sin plataformas… y a renglón seguido `identidadDeBusqueda()` volvía
// a pedir `providersOf()` para ese MISMO título, sin protección: con un 429
// persistente, el dato opcional convertía toda la búsqueda en 503. Acá la
// identidad oficial (que sólo sirve para deduplicar) NO se pide para un título
// cuyo `providersOf` ya falló: queda sin identidad, o sea sin deduplicar, que
// es lo que la regla de `dedupePorIdentidad` ya hace con lo que no la tiene.
//
// Con TMDB sano el resultado es byte a byte el de siempre: los mismos títulos
// enriquecidos, la misma identidad para todos, la misma deduplicación.
import { dedupePorIdentidad } from "./enlace-oficial.ts";
import { esErrorTmdb } from "./tmdb-error.ts";
import { registrarDescarteTmdb, withFallosDeFuentes } from "./fallos-tmdb.ts";
import type { MediaType, UITitle } from "./types.ts";

export interface Elegido<R = unknown> { raw: R; tipo: MediaType }

export interface DepsEnriquecido<E extends Elegido> {
  /** `toUITitle`: adentro pide `providersOf` una vez. Lanza `ErrorTmdb` si TMDB falló. */
  enriquecer: (c: E) => Promise<UITitle>;
  /** La misma card sin la parte de disponibilidad. */
  sinPlataformas: (c: E) => UITitle;
  /** `identidadDeBusqueda`: vuelve a pedir `providersOf` (cacheado) y el detalle en `IDIOMA_EVIDENCIA`. */
  identidadDe: (tipo: MediaType, id: number) => Promise<string | null>;
}

/**
 * Enriquece los elegidos (en orden), tolera el fallo de TMDB por título,
 * pide la identidad SÓLO a los que se enriquecieron bien y deduplica.
 */
export async function enriquecerElegidos<E extends Elegido>(
  elegidos: E[], deps: DepsEnriquecido<E>,
): Promise<{ titles: UITitle[]; sinProveedores: number }> {
  let sinProveedores = 0;
  const conDegradacion = await Promise.all(elegidos.map((c) =>
    deps.enriquecer(c).then((t) => ({ t, degradado: false })).catch((e: unknown) => {
      if (!esErrorTmdb(e)) throw e;
      registrarDescarteTmdb(e, "search:providersOf");
      sinProveedores++;
      return { t: deps.sinPlataformas(c), degradado: true };
    })));
  // La identidad se pide una vez por título enriquecido; para un degradado
  // sería el SEGUNDO `providersOf` contra el mismo 429: no se pide.
  const ids = await Promise.all(conDegradacion.map(({ t, degradado }) =>
    degradado ? Promise.resolve(null) : deps.identidadDe(t.type, t.id)));
  const titles = dedupePorIdentidad(conDegradacion.map(({ t }, i) => ({ t, identidad: ids[i] }))).map((x) => x.t);
  return { titles, sinProveedores };
}

export interface Fase1<E extends Elegido, P> {
  elegidos: E[];
  people: P[];
  /** El respaldo de idioma de las páginas falló: no se cachea. */
  falloIdioma: boolean;
}

export interface ResultadoBusqueda<P> {
  titles: UITitle[];
  people: P[];
  degradacion?: { proveedores: number };
}

/**
 * Produce el resultado de una búsqueda con su verdicto de caché, abriendo el
 * contexto compuesto de fallos: `fallo` es verdadero si el respaldo de idioma
 * falló, si algún `providersOf` falló (degradación opcional) o si falló la
 * evidencia de disponibilidad. Un fallo de las PÁGINAS (`paginas` lanza)
 * propaga tal cual: es el dato principal y la ruta lo traduce a 503.
 *
 * Es lo que `search()` (lib/enrich.ts) entrega a `cachedLocIf` y lo que el
 * test entrega a `resolverConCache`: la misma función, el mismo verdicto.
 */
export async function producirBusquedaConFallos<E extends Elegido, P>(o: {
  paginas: () => Promise<Fase1<E, P>>;
  /** Partición final (por ejemplo, "primero lo que está en tus plataformas"). Identidad si se omite. */
  partir?: (titles: UITitle[]) => UITitle[];
} & DepsEnriquecido<E>): Promise<{ valor: ResultadoBusqueda<P>; fallo: boolean }> {
  const { res, fallos } = await withFallosDeFuentes(async () => {
    const fase1 = await o.paginas();
    const { titles, sinProveedores } = await enriquecerElegidos(fase1.elegidos, o);
    const ordenados = o.partir ? o.partir(titles) : titles;
    const valor: ResultadoBusqueda<P> = { titles: ordenados, people: fase1.people };
    if (sinProveedores) valor.degradacion = { proveedores: sinProveedores };
    return { valor, falloIdioma: fase1.falloIdioma };
  });
  return { valor: res.valor, fallo: res.falloIdioma || fallos > 0 };
}
