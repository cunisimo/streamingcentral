// Filmografía de una persona: la lógica PURA de `personFilmography` y de
// `disponibilidadFilmografia` (lib/enrich.ts). Sin `server-only` y sin TMDB: lo
// que sale a la red se inyecta, y así se prueba con `node --test`
// (lib/filmografia.test.ts). La parte que también usa el cliente (bloques,
// orden, generaciones) vive en lib/filmografia-bloques.ts.
//
// Dos bugs (issue #25; Denis Villeneuve con `providers=m` mostraba sólo "La
// llegada" y "Blade Runner 2049"):
//
//   1. 🔴 LA REPARACIÓN DE IDIOMA PISABA LOS ROLES. Los créditos se
//      reconstruían con un índice por `media_type:id` y se expandía el objeto
//      entero sobre cada crédito. Una persona puede tener VARIOS créditos en la
//      misma obra (Duna: Director, Producer, Screenplay): el índice se quedaba
//      con el último y su `job` pisaba al de los demás, así que Duna dejaba de
//      ser un crédito de dirección. Ahora la reparación es POSICIONAL
//      (`repararLote` conserva longitud y orden, y sólo toca título y
//      sinopsis), y la consolidación por obra AGREGA los roles en vez de
//      quedarse con uno (`agruparSecciones`).
//   2. 🔴 LA FILMOGRAFÍA SE TRUNCABA. `merged.slice(0, 40)` cortaba antes de
//      armar nada. Ahora la filmografía entera viaja como datos básicos, que no
//      cuestan llamadas por título.
//
// 🔴 Y LO QUE NO SE HACE: enriquecer la carrera entera. La primera corrección
// (706fb7a) resolvía la disponibilidad de TODAS las obras al abrir la ficha
// (352 llamadas a TMDB y 13,5 s en frío para Samuel L. Jackson) y se rechazó.
// La disponibilidad se resuelve por bloques visibles: 12 al abrir, 24 por "Ver
// más" (lib/filmografia-bloques.ts).
import { claveMixta, repararLote, type Localizable } from "./idioma.ts";
import { esErrorTmdb } from "./tmdb-error.ts";
import { registrarDescarteTmdb } from "./fallos-tmdb.ts";
import { BLOQUE, bloqueInicial, claveDe, clavesVisibles, type Seccion } from "./filmografia-bloques.ts";
import type { FilmografiaPersona, MediaType, ObraPersona, PlatformCode, UITitle } from "./types.ts";

/** Lo que usa esta lógica de un crédito de `combined_credits`. */
export interface CreditoPersona extends Localizable {
  id: number;
  media_type?: string;
  credit_id?: string;
  job?: string;
  department?: string;
  character?: string;
  genre_ids?: number[];
  vote_count?: number;
  release_date?: string;
  first_air_date?: string;
}
export interface Creditos<C> { cast: C[]; crew: C[] }

// --- 1. Reparación de idioma sin tocar la identidad de cada crédito ----------
/**
 * Repara título y sinopsis de `cast` y `crew` con UN solo respaldo.
 *
 * La clave de la REPARACIÓN es `media_type:id` (el título de Duna es el mismo
 * en sus tres créditos), pero el resultado se reconstruye POR POSICIÓN:
 * `repararLote` devuelve los elementos en el mismo orden y con la misma
 * longitud, así que `cast` son los primeros `cast.length` y `crew` el resto.
 * Ningún índice por obra vuelve a tocar los créditos: `fusionarPorCampo` sólo
 * copia `title`, `name` y `overview`, y `job`, `department`, `character`,
 * `credit_id` y `media_type` quedan los de cada registro.
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
const claveCredito = (c: CreditoPersona) => `${c.media_type}:${c.id}`;
const fechaDe = (c: CreditoPersona) => c.release_date || c.first_air_date || null;

/** Una obra de una sección: su crédito representativo (para los datos básicos) y TODOS sus roles. */
export interface GrupoObra<C> {
  clave: string;
  tipo: MediaType;
  credito: C;
  /** Trabajos de equipo (Dirección) o personajes (Actuación), sin repetir y sin perder ninguno. */
  roles: string[];
  fecha: string | null;
}
export interface SeccionesAgrupadas<C> { direccion: GrupoObra<C>[]; actuacion: GrupoObra<C>[] }

/**
 * Agrupa por obra (`media_type:id`) AGREGANDO los roles — nunca eligiendo uno.
 * `rol` dice qué se guarda de cada crédito; los vacíos no cuentan.
 */
function agrupar<C extends CreditoPersona>(creditos: C[], rol: (c: C) => string | undefined): GrupoObra<C>[] {
  const porObra = new Map<string, GrupoObra<C>>();
  for (const c of creditos) {
    const k = claveCredito(c);
    let g = porObra.get(k);
    if (!g) {
      g = { clave: k, tipo: c.media_type as MediaType, credito: c, roles: [], fecha: fechaDe(c) };
      porObra.set(k, g);
    }
    const r = rol(c)?.trim();
    if (r && !g.roles.includes(r)) g.roles.push(r);
  }
  return [...porObra.values()];
}

/**
 * Orden de cada sección: FECHA DESCENDENTE (`release_date` o `first_air_date`),
 * las obras sin fecha al final; empate por votos (desc) y después por clave,
 * para que sea total y estable entre pedidos. Se eligió la fecha porque es lo
 * que deja los trabajos recientes —las dos Duna de Villeneuve— en el primer
 * bloque, y porque no depende de nada que haya que consultar.
 */
export function compararObras<C extends CreditoPersona>(a: GrupoObra<C>, b: GrupoObra<C>): number {
  if (a.fecha !== b.fecha) {
    if (!a.fecha) return 1;
    if (!b.fecha) return -1;
    return a.fecha < b.fecha ? 1 : -1;
  }
  const v = (b.credito.vote_count ?? 0) - (a.credito.vote_count ?? 0);
  if (v) return v;
  return a.clave < b.clave ? -1 : a.clave > b.clave ? 1 : 0;
}

/**
 * Dirección = obras donde alguno de sus créditos de equipo es `Director`; la
 * obra conserva TODOS sus trabajos de equipo (Director, Screenplay, Producer…),
 * con `Director` primero. El orden del array de TMDB no importa: se mira el
 * conjunto, no el último.
 * Actuación = obras con algún crédito de reparto que `esActuacion` (voz y sin
 * acreditar incluidos); la obra conserva todos sus personajes.
 * Una obra dirigida y actuada está en las dos secciones: se deduplica dentro de
 * cada sección, nunca entre secciones.
 */
export function agruparSecciones<C extends CreditoPersona>(credits: Creditos<C>): SeccionesAgrupadas<C> {
  const equipo = agrupar(credits.crew.filter(esObra), (c) => c.job)
    .filter((g) => g.roles.includes("Director"))
    .map((g) => ({ ...g, roles: ["Director", ...g.roles.filter((r) => r !== "Director")] }));
  const reparto = agrupar(credits.cast.filter((c) => esObra(c) && esActuacion(c)), (c) => c.character);
  return { direccion: equipo.sort(compararObras), actuacion: reparto.sort(compararObras) };
}

/**
 * Qué sección va primero: la de su profesión conocida (`known_for_department`
 * de TMDB, que viene gratis en `/person/{id}`); sin ese dato, la más grande.
 * Las secciones vacías no se muestran.
 */
export function ordenDeSecciones(conocidoPor: string | undefined, largos: Record<Seccion, number>): Seccion[] {
  const orden: Seccion[] = conocidoPor === "Directing" ? ["direccion", "actuacion"]
    : conocidoPor === "Acting" ? ["actuacion", "direccion"]
    : largos.direccion > largos.actuacion ? ["direccion", "actuacion"] : ["actuacion", "direccion"];
  return orden.filter((k) => largos[k] > 0);
}

// --- 3. Disponibilidad de un bloque, y sólo de un bloque ---------------------
export interface DisponibilidadBloque {
  /** `tipo:id` → plataformas. Sólo las obras consultadas. */
  disponibilidad: Record<string, PlatformCode[]>;
  /** Consultas que fallaron por TMDB: NO son "no está", son "no sé". */
  sinDisponibilidad: string[];
}

/** Cuántas claves acepta un pedido de disponibilidad del contrato v2: un bloque. */
export const MAX_POR_PEDIDO = BLOQUE;
/**
 * Cuántas obras evalúa el contrato v1 (legado): las mismas 40 que evaluaba el
 * código anterior al issue #25 (`merged.slice(0, 40)` en 2af1a37). Es el techo
 * de costo de los clientes viejos: no puede crecer.
 */
export const MAX_V1 = 40;

/**
 * Resuelve la disponibilidad de un bloque de claves `tipo:id`, una vez por
 * obra. Un fallo de TMDB en una obra la deja en `sinDisponibilidad` (la card
 * dice "sin datos", no "no está") y se registra; un error propio se propaga.
 * Rechaza más de `MAX_POR_PEDIDO` claves: el límite es el contrato de coste.
 */
export async function resolverBloque(
  claves: string[],
  plataformasDe: (tipo: MediaType, id: number) => Promise<PlatformCode[]>,
): Promise<DisponibilidadBloque> {
  return resolverHasta(claves, plataformasDe, MAX_POR_PEDIDO);
}

async function resolverHasta(
  claves: string[],
  plataformasDe: (tipo: MediaType, id: number) => Promise<PlatformCode[]>,
  maximo: number,
): Promise<DisponibilidadBloque> {
  const unicas = [...new Set(claves)];
  if (unicas.length > maximo) throw new RangeError(`[filmografia] ${unicas.length} obras en un pedido; el máximo es ${maximo}`);
  const out: DisponibilidadBloque = { disponibilidad: {}, sinDisponibilidad: [] };
  await Promise.all(unicas.map(async (k) => {
    const par = parsearClave(k);
    if (!par) return;
    try {
      out.disponibilidad[k] = await plataformasDe(par.tipo, par.id);
    } catch (e) {
      if (!esErrorTmdb(e)) throw e;
      registrarDescarteTmdb(e, "persona:providersOf");
      out.sinDisponibilidad.push(k);
    }
  }));
  return out;
}

/** `movie:123` → `{ tipo, id }`; cualquier otra cosa → `null`. */
export function parsearClave(k: string): { tipo: MediaType; id: number } | null {
  const m = /^(movie|tv):(\d{1,10})$/.exec(k);
  return m ? { tipo: m[1] as MediaType, id: Number(m[2]) } : null;
}

// --- 4. La apertura completa --------------------------------------------------
/**
 * Contrato **v2** (`/api/person/[id]?filmografia=v2`), a partir de los
 * créditos YA reparados. Es la composición que ejecuta `personFilmography`: los
 * tests la corren entera y cuentan las llamadas a `plataformasDe`.
 *
 * Datos básicos de TODAS las obras; disponibilidad SÓLO de las visibles al
 * abrir (`bloqueInicial`, ≤ `BLOQUE_INICIAL` obras distintas). No depende de
 * las plataformas del usuario (sólo ordenan, y eso es del cliente), y NO arma
 * el contrato viejo: cada petición ejecuta una sola versión.
 */
export async function armarFilmografia<C extends CreditoPersona>(o: {
  credits: Creditos<C>;
  conocidoPor: string | undefined;
  aObra: (g: GrupoObra<C>) => ObraPersona;
  plataformasDe: (tipo: MediaType, id: number) => Promise<PlatformCode[]>;
}): Promise<Omit<FilmografiaPersona, "person">> {
  const grupos = agruparSecciones(o.credits);
  const direccion = grupos.direccion.map(o.aObra);
  const actuacion = grupos.actuacion.map(o.aObra);
  const largos = { direccion: direccion.length, actuacion: actuacion.length };
  const secciones = ordenDeSecciones(o.conocidoPor, largos);
  const inicial = bloqueInicial(secciones, largos);

  // El ÚNICO enriquecido de la apertura: las obras visibles, una vez cada una.
  const bloque = await resolverBloque(
    clavesVisibles({ direccion: direccion.map(claveDe), actuacion: actuacion.map(claveDe) }, inicial),
    o.plataformasDe,
  );

  return {
    secciones, direccion, actuacion, inicial,
    disponibilidad: bloque.disponibilidad, sinDisponibilidad: bloque.sinDisponibilidad,
  };
}

// --- 5. El contrato v1 (legado) ---------------------------------------------
//
// 🔴 LAS REGLAS DE v1 SON LAS DEL CONTRATO VIEJO, NO LAS DE v2. v1 existe para
// que los bundles Android instalados no empeoren mientras la gente actualiza,
// así que su elegibilidad es la de 2af1a37, copiada acá a propósito y separada
// de `esActuacion`/`agruparSecciones` (que son de v2):
//   - dirección: créditos de equipo con `job === "Director"`;
//   - actuación: `character` NO vacío y distinto de Self/Himself/Herself
//     EXACTOS (un crédito sin personaje no es actuación legacy);
//   - dirección primero y después actuación, una vez por obra (gana la primera
//     aparición), y DESPUÉS se descartan talk show, noticias y reality (10767,
//     10763, 10764) sin mirar el personaje, y lo que no sea película o serie;
//   - orden por `vote_count` descendente, estable.
// Lo único que v1 cambia respecto del viejo es la REPARACIÓN de roles: sin el
// índice que pisaba `job` y `character`, Dune vuelve a ser una obra dirigida.
//
// La auditoría del 29/09 encontró que 771301f tomaba la CANTIDAD del viejo pero
// elegía con las reglas de v2: un talk show de muchos votos o un crédito sin
// personaje podían desplazar a una película que el cliente viejo mostraba.

const REGLA_LEGADO_NO_ES_ACTUACION = /^(self|himself|herself)$/i;
const GENEROS_DESCARTADOS_LEGADO = new Set([10767, 10763, 10764]); // talk, news, reality

/**
 * La lista legacy de obras candidatas, ORDENADA, con las reglas de 2af1a37.
 * `indiceViejo: true` reproduce además el índice que pisaba roles (el bug):
 * cada crédito recibe los campos del ÚLTIMO crédito de su obra —reparto y
 * equipo concatenados, en ese orden—, exactamente como `{ ...c, ...último }`.
 * Es la única forma de saber qué evaluaba y qué mostraba el cliente viejo.
 */
export function candidatasLegado<C extends CreditoPersona>(credits: Creditos<C>, opts: { indiceViejo: boolean }): C[] {
  let { cast, crew } = credits;
  if (opts.indiceViejo) {
    const ultimo = new Map<string, C>();
    for (const c of [...cast, ...crew]) ultimo.set(claveCredito(c), c);
    cast = cast.map((c) => ({ ...c, ...ultimo.get(claveCredito(c)) }));
    crew = crew.map((c) => ({ ...c, ...ultimo.get(claveCredito(c)) }));
  }
  const actuacion = cast.filter((c) => c.character && !REGLA_LEGADO_NO_ES_ACTUACION.test(c.character));
  const direccion = crew.filter((c) => c.job === "Director");
  const vistos = new Set<string>();
  return [...direccion, ...actuacion].filter((c) => {
    const k = claveCredito(c);
    if (vistos.has(k)) return false;
    vistos.add(k);
    if ((c.genre_ids ?? []).some((g) => GENEROS_DESCARTADOS_LEGADO.has(g))) return false;
    return c.media_type === "movie" || c.media_type === "tv";
  }).sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0));
}

/** Las obras que EVALUABA el código anterior (2af1a37) para esta persona, en orden. */
export function seleccionDelCodigoAnterior<C extends CreditoPersona>(credits: Creditos<C>): string[] {
  return candidatasLegado(credits, { indiceViejo: true }).slice(0, MAX_V1).map(claveCredito);
}

/**
 * Cuántas obras evaluaba el código anterior: el PRESUPUESTO de v1. Un cliente
 * viejo no puede costar más que antes, y no alcanza con el techo de 40 (medido
 * el 28/09: con sólo el techo, Villeneuve pasaba de 23 a 51 peticiones reales).
 */
export function evaluadasPorElCodigoAnterior(credits: Creditos<CreditoPersona>): number {
  return seleccionDelCodigoAnterior(credits).length;
}

/**
 * Las obras que evalúa v1: las primeras `presupuesto` de la lista legacy SIN el
 * índice viejo (roles reparados), con `presupuesto` = lo que evaluaba el viejo.
 *
 * ⚠️ PENDIENTE DE DECISIÓN DEL DUEÑO (ver docs/ISSUES.md #25). Con el mismo
 * presupuesto, cada obra que la reparación recupera y que entra en el corte
 * (Dune) deja afuera a la última del viejo. Si ésa estaba en tus plataformas,
 * el cliente viejo la pierde. Está DEMOSTRADO que no hay selección que, sin
 * consultar más obras que antes, garantice a la vez conservar todo lo que se
 * veía y sumar lo recuperado (test "imposibilidad" en lib/filmografia.test.ts).
 */
export function seleccionV1<C extends CreditoPersona>(credits: Creditos<C>): C[] {
  return candidatasLegado(credits, { indiceViejo: false }).slice(0, evaluadasPorElCodigoAnterior(credits));
}

/**
 * Las variantes que se comparan para la decisión pendiente (sólo claves; no
 * consulta nada). `antes` es exactamente lo que evaluaba el viejo.
 *   v1       — la selección vigente (reglas legacy, roles reparados, mismo presupuesto)
 *   exacta   — la del viejo, tal cual (sin sumar lo recuperado)
 *   ampliada — la del viejo MÁS lo recuperado que entra en el top 40 reparado
 *              (conserva todo y suma, pero evalúa más obras que antes)
 */
export function variantesV1(credits: Creditos<CreditoPersona>): Record<"antes" | "v1" | "exacta" | "ampliada", string[]> {
  const antes = seleccionDelCodigoAnterior(credits);
  const reparada = candidatasLegado(credits, { indiceViejo: false }).map(claveCredito);
  const recuperadas = reparada.slice(0, MAX_V1).filter((k) => !antes.includes(k));
  return {
    antes,
    v1: seleccionV1(credits).map(claveCredito),
    exacta: antes,
    ampliada: [...antes, ...recuperadas],
  };
}

/**
 * Contrato **v1** (`/api/person/[id]` sin `filmografia=v2`): el que leen los
 * bundles Android instalados antes del issue #25, que muestran `titles` como
 * "Filmografía en tus plataformas". Evalúa `seleccionV1` (reglas legacy, roles
 * reparados, el presupuesto del viejo), una consulta por obra.
 *
 * Una consulta de disponibilidad fallida deja la obra afuera de `titles` (no
 * se puede afirmar que está en tus plataformas) y cuenta en `hidden`. Antes,
 * un solo fallo tiraba la vista entera (`Promise.all`).
 */
export async function armarFilmografiaV1<C extends CreditoPersona>(o: {
  credits: Creditos<C>;
  providers: PlatformCode[];
  aObra: (g: GrupoObra<C>) => ObraPersona;
  plataformasDe: (tipo: MediaType, id: number) => Promise<PlatformCode[]>;
}): Promise<{ titles: UITitle[]; hidden: number }> {
  const evaluadas: GrupoObra<C>[] = seleccionV1(o.credits).map((c) => ({
    clave: claveCredito(c), tipo: c.media_type as MediaType, credito: c, roles: [], fecha: fechaDe(c),
  }));
  const lote = await resolverHasta(evaluadas.map((g) => g.clave), o.plataformasDe, MAX_V1);
  const titles: UITitle[] = [];
  for (const g of evaluadas) {
    const plataformas = lote.disponibilidad[g.clave];
    if (!plataformas?.some((c) => o.providers.includes(c))) continue;
    const { fecha: _f, votos: _v, roles: _r, ...base } = o.aObra(g);
    titles.push({ ...base, runtime: null, platforms: plataformas });
  }
  return { titles, hidden: evaluadas.length - titles.length };
}
