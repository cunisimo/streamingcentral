// Filmografía de una persona: la lógica PURA de `personFilmography`
// (lib/enrich.ts). Sin `server-only` y sin TMDB: las dependencias que salen a la
// red se inyectan, y así se prueba con `node --test` (lib/filmografia.test.ts).
//
// Dos bugs que esto corrige (27/09, Denis Villeneuve con `providers=m` mostraba
// sólo "La llegada" y "Blade Runner 2049"):
//
//   1. 🔴 LA REPARACIÓN DE IDIOMA PISABA LOS ROLES. Los créditos se
//      reconstruían con un índice por `media_type:id` y se expandía el objeto
//      entero sobre cada crédito. Una persona puede tener VARIOS créditos en la
//      misma obra (Duna: Director, Producer, Screenplay): el índice se quedaba
//      con el último y su `job` pisaba al de los demás, así que Duna dejaba de
//      ser un crédito de dirección. Medido con Spielberg: sobrevivían 38 de sus
//      52 créditos de dirección. Ahora se reconstruye POR POSICIÓN
//      (`repararLote` conserva longitud y orden) y la reparación sólo puede
//      tocar título y sinopsis (`fusionarPorCampo`).
//   2. 🔴 EL RECORTE A 40 IBA ANTES DE LA DISPONIBILIDAD. Se descartaban obras
//      válidas antes de saber si estaban en las plataformas del usuario. Ahora
//      no se recorta nada: cada sección se enriquece completa.
//
// Y el comportamiento de producto que se pidió con el arreglo: la ficha muestra
// la filmografía COMPLETA en dos secciones (Dirección y Actuación), y las
// plataformas del usuario ORDENAN en vez de filtrar — igual que el buscador.
import { claveMixta, repararLote, type Localizable } from "./idioma.ts";
import { esErrorTmdb } from "./tmdb-error.ts";
import { registrarDescarteTmdb } from "./fallos-tmdb.ts";
import type { PlatformCode, UITitle } from "./types.ts";

/** Lo que usa esta lógica de un crédito de `combined_credits`. */
export interface CreditoPersona extends Localizable {
  id: number;
  media_type?: string;
  job?: string;
  department?: string;
  character?: string;
  genre_ids?: number[];
  vote_count?: number;
}
export interface Creditos<C> { cast: C[]; crew: C[] }
export interface Secciones<C> { direccion: C[]; actuacion: C[] }
export type Seccion = keyof Secciones<unknown>;

// --- 1. Reparación de idioma sin tocar la identidad de cada crédito ----------
/**
 * Repara título y sinopsis de `cast` y `crew` con UN solo respaldo.
 *
 * `repararLote` devuelve los elementos en el MISMO orden y con la MISMA
 * longitud que recibió, así que `cast` son los primeros `cast.length` y `crew`
 * el resto. Por eso no hace falta ningún índice: un índice por `media_type:id`
 * colapsa los varios roles de una persona en una misma obra (el bug). Y
 * `fusionarPorCampo` sólo copia `title`, `name` y `overview`: `job`,
 * `department`, `character` y `media_type` del respaldo nunca entran.
 */
export async function repararCreditos<C extends CreditoPersona>(
  crudos: Creditos<C>,
  pedirRespaldo: () => Promise<Localizable[] | null | undefined>,
  etiqueta: string,
  activo?: boolean,
): Promise<Creditos<C> & { fallo: boolean }> {
  const planos = [...crudos.cast, ...crudos.crew];
  const rep = await repararLote(planos, pedirRespaldo, etiqueta, { clave: claveMixta, claveRespaldo: claveMixta, activo });
  if (rep.items.length !== planos.length) {
    // Invariante de `repararLote`. Si algún día deja de cumplirse, separar por
    // posición mezclaría reparto y equipo: mejor explotar que mentir.
    throw new Error(`[filmografia] repararLote cambió la longitud (${planos.length} → ${rep.items.length})`);
  }
  return {
    cast: rep.items.slice(0, crudos.cast.length),
    crew: rep.items.slice(crudos.cast.length),
    fallo: rep.fallo,
  };
}

// --- 2. Qué es actuación y qué es dirección ----------------------------------
// Aparición como sí mismo: "Self", "Himself", "Herself", "Themselves" y sus
// variantes con sufijo ("Self (archive footage)", "Self - Guest", "Self –
// Executive Producer"…), más las formas en castellano. Relevado sobre los
// créditos reales de nueve personas (27/09): "Self" solo son 680 de ~1500.
// El `\b` evita "Selfridge".
const APARICION_PROPIA = /^(?:self|himself|herself|themselves|themself|itself)\b|^(?:él|ella|sí) mism[oa]s?(?![a-z])/i;

export function esAparicionPropia(character: string | undefined): boolean {
  return APARICION_PROPIA.test((character ?? "").trim());
}

// Talk show, noticias y reality (géneros de TMDB). NO se excluyen por el
// género: una actuación real en un sketch sigue siendo actuación. Lo que se
// excluye ahí es lo que en esos programas es, en la práctica, una aparición
// propia sin rotular: el crédito sin personaje o como conductor/invitado.
const NO_FICCION = new Set([10767, 10763, 10764]);
const PRESENTACION = /^(?:co-?host|host|presenter|guest|special guest|anfitri[oó]n|presentador|presentadora|invitad[oa])\b/i;

/** Un crédito de reparto que cuenta como actuación (incluye voz y sin acreditar). */
export function esActuacion(c: CreditoPersona): boolean {
  if (esAparicionPropia(c.character)) return false;
  if ((c.genre_ids ?? []).some((g) => NO_FICCION.has(g))) {
    const ch = (c.character ?? "").trim();
    if (!ch || PRESENTACION.test(ch)) return false;
  }
  return true;
}

const esObra = (c: CreditoPersona) => c.media_type === "movie" || c.media_type === "tv";
const claveObra = (c: { media_type?: string; type?: string; id: number }) => `${c.media_type ?? c.type}:${c.id}`;

/** Una entrada por obra DENTRO de la sección (no entre secciones), por votos. */
function unaPorObra<C extends CreditoPersona>(creditos: C[]): C[] {
  const vistos = new Set<string>();
  const out: C[] = [];
  for (const c of creditos) {
    const k = claveObra(c);
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push(c);
  }
  // `sort` es estable: los empates conservan el orden de TMDB.
  return out.sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0));
}

/**
 * Dirección = créditos de equipo con `job === "Director"`. Actuación = créditos
 * de reparto que `esActuacion`. Una misma obra puede estar en las dos si la
 * persona la dirigió y actuó en ella: se deduplica dentro de cada sección,
 * nunca entre secciones.
 */
export function seccionesDeCreditos<C extends CreditoPersona>(credits: Creditos<C>): Secciones<C> {
  return {
    direccion: unaPorObra(credits.crew.filter((c) => esObra(c) && c.job === "Director")),
    actuacion: unaPorObra(credits.cast.filter((c) => esObra(c) && esActuacion(c))),
  };
}

/**
 * Qué sección va primero: la de su profesión conocida (`known_for_department`
 * de TMDB, que viene gratis en `/person/{id}`); sin ese dato, la más grande.
 * Las secciones vacías no se muestran.
 */
export function ordenDeSecciones(conocidoPor: string | undefined, s: Secciones<unknown>): Seccion[] {
  const orden: Seccion[] = conocidoPor === "Directing" ? ["direccion", "actuacion"]
    : conocidoPor === "Acting" ? ["actuacion", "direccion"]
    : s.direccion.length > s.actuacion.length ? ["direccion", "actuacion"] : ["actuacion", "direccion"];
  return orden.filter((k) => s[k].length > 0);
}

// --- 3. Disponibilidad: ordena, no filtra ------------------------------------
const enTusPlataformas = (t: UITitle, providers: PlatformCode[]) => t.platforms.some((c) => providers.includes(c));

/**
 * Partición ESTABLE: primero lo que está en tus plataformas, después el resto,
 * cada grupo en el orden que traía. Es la misma regla que el buscador
 * (`partirPorPlataformas` en lib/enrich.ts).
 */
export function primeroEnTusPlataformas(titles: UITitle[], providers: PlatformCode[]): UITitle[] {
  if (!providers.length) return titles;
  const si: UITitle[] = [];
  const no: UITitle[] = [];
  for (const t of titles) (enTusPlataformas(t, providers) ? si : no).push(t);
  return [...si, ...no];
}

export interface ResultadoFilmografia {
  direccion: UITitle[];
  actuacion: UITitle[];
  /**
   * COMPATIBILIDAD con los bundles nativos ya instalados, que leen `titles` y
   * `hidden` y los muestran como "Filmografía en tus plataformas": sólo lo
   * disponible, una vez por obra, por votos. Ahora sobre la filmografía
   * completa, sin el recorte a 40. Se puede sacar cuando no queden bundles
   * anteriores a este cambio.
   */
  titles: UITitle[];
  hidden: number;
  /** Títulos cuyo `providersOf` falló por TMDB: salen SIN plataformas, no se esconden. */
  degradacion?: { proveedores: number };
}

/**
 * Enriquece TODAS las obras de las dos secciones (una sola vez por obra, aunque
 * esté en las dos) y ordena cada sección con tus plataformas primero.
 *
 * Un fallo de TMDB en un título no lo esconde: sale sin plataformas (gris, "No
 * está en tus plataformas") y se cuenta en `degradacion`, igual que en el
 * buscador. Un error propio se propaga: no se disfraza de TMDB.
 */
export async function armarFilmografia<C extends CreditoPersona>(o: {
  secciones: Secciones<C>;
  providers: PlatformCode[];
  enriquecer: (c: C) => Promise<UITitle>;
  sinPlataformas: (c: C) => UITitle;
}): Promise<ResultadoFilmografia> {
  let sinProveedores = 0;
  const porObra = new Map<string, Promise<UITitle>>();
  const tituloDe = (c: C): Promise<UITitle> => {
    const k = claveObra(c);
    let p = porObra.get(k);
    if (!p) {
      p = o.enriquecer(c).catch((e: unknown) => {
        if (!esErrorTmdb(e)) throw e;
        registrarDescarteTmdb(e, "persona:providersOf");
        sinProveedores++;
        return o.sinPlataformas(c);
      });
      porObra.set(k, p);
    }
    return p;
  };
  const [direccion, actuacion] = await Promise.all([
    Promise.all(o.secciones.direccion.map(tituloDe)),
    Promise.all(o.secciones.actuacion.map(tituloDe)),
  ]);

  // Legado: lo disponible de las dos secciones, una vez por obra, por votos.
  const votos = new Map<string, number>();
  for (const c of [...o.secciones.direccion, ...o.secciones.actuacion]) votos.set(claveObra(c), c.vote_count ?? 0);
  const unicos = new Map<string, UITitle>();
  for (const t of [...direccion, ...actuacion]) if (!unicos.has(claveObra(t))) unicos.set(claveObra(t), t);
  const todos = [...unicos.values()].sort((a, b) => (votos.get(claveObra(b)) ?? 0) - (votos.get(claveObra(a)) ?? 0));
  const titles = todos.filter((t) => enTusPlataformas(t, o.providers));

  const res: ResultadoFilmografia = {
    direccion: primeroEnTusPlataformas(direccion, o.providers),
    actuacion: primeroEnTusPlataformas(actuacion, o.providers),
    titles,
    hidden: todos.length - titles.length,
  };
  if (sinProveedores) res.degradacion = { proveedores: sinProveedores };
  return res;
}
