// "Últimos lanzamientos": mezcla, orden y paginación.
//
// Para películas nada cambia: la fuente regional de TMDB alcanza. Para SERIES no
// alcanza, y no es un problema de la ficha sino del descubrimiento: el
// `discover` filtrado por proveedor no devuelve los títulos cuyo dato regional
// TMDB todavía no tiene. Medido el 2026-08-30 con Disney+/AR: 1152 resultados y
// `tv:275224` no está en ninguno, mientras `with_networks=2739` sí lo trae.
//
// 🔴 LA VENTANA FIJA ES LO QUE HACE QUE LA PAGINACIÓN CIERRE. TMDB no deja
// combinar `with_watch_providers` con `with_networks` en un solo query (los une
// con AND), así que la mezcla es inevitable — y una mezcla paginada "página N de
// cada fuente" produce repetidos y salteos, porque la lista ordenada cambia con
// cada página. Acá se traen VENTANAS FIJAS de las dos fuentes, se ordena una
// sola vez con un orden TOTAL, y las páginas son tajadas de esa lista. Mientras
// la ventana no dependa de la página pedida, dos páginas consecutivas no se
// pisan ni dejan huecos.
//
// LO QUE ESTO NO RESUELVE, dicho claro: la cobertura llega hasta donde llega la
// ventana. Un título más viejo que el último de la ventana no aparece, aunque
// exista. Es el precio de no poder pedirle a TMDB una sola lista.
//
// Sin `server-only`: es lógica pura y todo el punto es poder probarla.
import type { PlatformCode, UITitle } from "./types";

/** Un candidato: una card más la fecha con la que se ordena. */
export type CandidatoUltimos = UITitle & { fecha: string };

/**
 * Orden TOTAL y determinístico: fecha descendente, y a igual fecha id
 * descendente.
 *
 * El desempate no es cosmético. Las dos fuentes resuelven en el orden en que
 * contesta la red, así que dos títulos del mismo día pueden llegar en distinto
 * orden en dos requests. Sin desempate, `sort` los deja en ese orden y la
 * página 2 de un request ya no continúa la página 1 del anterior: repite uno y
 * saltea otro.
 */
export function ordenUltimos(a: CandidatoUltimos, b: CandidatoUltimos): number {
  if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1;
  return b.id - a.id;
}

const clave = (t: UITitle) => `${t.type}:${t.id}`;

/**
 * Mezcla las dos fuentes y devuelve una página.
 *
 * El filtrado va ANTES de ordenar y paginar, para que la clasificación sea la
 * lista final: si se filtrara después, las páginas quedarían de tamaños
 * distintos y `hayMas` mentiría.
 *
 * Los candidatos que llegan por red ya pasaron por la resolución central de
 * disponibilidad, así que `platforms` es lo que la evidencia sostuvo. El que
 * quedó sin plataformas no sobrevive el filtro de abajo — que es exactamente lo
 * que se quiere: por red llegan muchos que no están en Argentina.
 */
export function combinarUltimos(opts: {
  /** Candidatos de la fuente regional de siempre. */
  regionales: CandidatoUltimos[];
  /** Candidatos traídos por las redes oficiales, ya resueltos. */
  porRed: CandidatoUltimos[];
  providers: PlatformCode[];
  page: number;
  porPagina: number;
  /** Fecha argentina, YYYY-MM-DD. */
  hoy: string;
  /**
   * ¿El catálogo regional tiene más páginas en TMDB de las que se pasaron acá?
   *
   * Sin esto, `hayMas` sólo miraría la lista en memoria y diría "se acabó" en
   * cuanto se consume lo cargado — que es lo que truncaba la lista a la ventana.
   */
  hayMasRegional?: boolean;
}): { items: CandidatoUltimos[]; hayMas: boolean } {
  const vistos = new Set<string>();
  const todos: CandidatoUltimos[] = [];

  for (const t of [...opts.regionales, ...opts.porRed]) {
    // Sin fecha no se puede ordenar ni saber si ya estrenó.
    if (!t.fecha) continue;
    // Nada futuro: "Últimos lanzamientos" es lo que YA salió. Comparación de
    // cadenas YYYY-MM-DD, que ordena igual que la fecha y no construye un Date
    // con su huso — el día de esta app es el argentino.
    if (t.fecha > opts.hoy) continue;
    // Ficha completa: mismo criterio que la fuente regional (`soloCompletos`).
    if (!t.poster) continue;
    // Sólo las plataformas del usuario. Un título en varias entra si alguna lo es.
    if (!t.platforms.some((c) => opts.providers.includes(c))) continue;
    // Dedup por `tipo:id`, nunca por nombre: el mismo id en movie y en tv son
    // dos títulos distintos.
    const k = clave(t);
    if (vistos.has(k)) continue;
    vistos.add(k);
    todos.push(t);
  }

  todos.sort(ordenUltimos);

  const desde = (opts.page - 1) * opts.porPagina;
  const items = todos.slice(desde, desde + opts.porPagina);
  // Hay más si sobran títulos ya clasificados O si el catálogo regional sigue
  // teniendo páginas. Lo segundo es lo que impide que la lista se corte donde
  // termina lo que se trajo.
  const sobran = desde + opts.porPagina < todos.length;
  return { items, hayMas: sobran || Boolean(opts.hayMasRegional) };
}

// ============================================================================
// Orquestación: pedir páginas regionales hasta cubrir la pedida
// ============================================================================

/** Una página del catálogo regional, ya enriquecida, más lo que TMDB declara. */
export interface PaginaRegional {
  items: CandidatoUltimos[];
  /** `total_pages` de TMDB. Es el ÚNICO límite real del bucle. */
  totalPaginas: number;
}

/**
 * Sirve una página de "Últimos lanzamientos · Series".
 *
 * 🔴 DOS COSAS QUE ESTA FUNCIÓN EXISTE PARA ARREGLAR, y las dos venían de
 * intentos anteriores mal resueltos:
 *
 * **1. Nada de ventanas fijas.** Antes había un tope de 12 páginas "de
 * seguridad": para una plataforma sin suplemento por red, la página 13 no podía
 * juntar 260 resultados aunque TMDB tuviera más. El único límite es
 * `total_pages`, que es el límite real de la fuente. Y una página enriquecida
 * que queda vacía —porque el filtrado se la llevó entera— **no corta el bucle**
 * si TMDB dice que hay páginas después.
 *
 * **2. Ampliar la ventana no puede mover lo ya servido.** Antes se juntaba todo
 * y se ordenaba por `(fecha, id desc)`: un título de la página 2 empatado en
 * fecha con el borde de la página 1 se colaba ANTES, desplazaba al borde a la
 * página siguiente y producía un repetido y un salteo. Acá el orden regional es
 * **el de TMDB** (que ya viene descendente por fecha), estabilizado: una página
 * nueva sólo puede agregar al final, nunca insertarse en el medio.
 *
 * **La regla de los extras es la otra mitad.** Un candidato traído por red tiene
 * fecha propia y hay que ubicarlo entre los regionales — pero si el stream
 * regional todavía no llegó a su fecha, su posición NO ESTÁ DECIDIDA: una página
 * regional posterior podría traer títulos más nuevos que él y correrlo. Si ya se
 * había servido, aparecería dos veces. Entonces **un extra entra sólo cuando el
 * stream regional pasó su fecha** (o cuando TMDB se agotó y ya no puede venir
 * nada más viejo). Hasta ese momento se retiene, que es exactamente donde
 * todavía no le toca.
 *
 * `traerRegional` y `traerExtras` se inyectan para poder probar la orquestación
 * sin red: en producción cada uno está detrás de su propio `cachedLocIf`, así
 * que el bucle no re-paga las páginas que ya trajo.
 */
export async function paginarUltimos(opts: {
  page: number;
  porPagina: number;
  providers: PlatformCode[];
  /** Fecha argentina, YYYY-MM-DD. */
  hoy: string;
  traerRegional: (pagina: number) => Promise<PaginaRegional>;
  traerExtras: () => Promise<CandidatoUltimos[]>;
}): Promise<{ items: CandidatoUltimos[]; hayMas: boolean }> {
  const extras = ordenarExtras(filtrar(await opts.traerExtras(), opts));
  const necesarios = opts.page * opts.porPagina;

  const regionales: CandidatoUltimos[] = [];
  let pagina = 1;
  let totalPaginas = 1;
  let agotado = false;

  // Se pide de a una página hasta cubrir la pedida o agotar la fuente.
  for (;;) {
    const r = await opts.traerRegional(pagina);
    totalPaginas = r.totalPaginas;
    regionales.push(...filtrar(r.items, opts));
    agotado = pagina >= totalPaginas;
    // La cuenta se hace sobre la MEZCLA, que es lo que se sirve. Una página
    // enriquecida vacía no corta: lo que corta es que TMDB no tenga más.
    if (agotado) break;
    if (mezclar(regionales, extras, agotado).length >= necesarios) break;
    pagina++;
  }

  const todos = mezclar(regionales, extras, agotado);
  const desde = (opts.page - 1) * opts.porPagina;
  const items = todos.slice(desde, desde + opts.porPagina);
  // Hay más si sobran títulos ya clasificados o si la fuente sigue teniendo
  // páginas que no se pidieron.
  return { items, hayMas: desde + opts.porPagina < todos.length || !agotado };
}

/** Los filtros de siempre: plataformas, ficha completa, fecha argentina. */
function filtrar(
  items: CandidatoUltimos[],
  opts: { providers: PlatformCode[]; hoy: string },
): CandidatoUltimos[] {
  return items.filter((t) =>
    Boolean(t.fecha)
    && t.fecha <= opts.hoy
    && Boolean(t.poster)
    && t.platforms.some((c) => opts.providers.includes(c)));
}

/** Los extras, por fecha descendente y con desempate estable por id. */
function ordenarExtras(items: CandidatoUltimos[]): CandidatoUltimos[] {
  return [...items].sort((a, b) => (a.fecha === b.fecha ? b.id - a.id : (a.fecha < b.fecha ? 1 : -1)));
}

/**
 * Mezcla el stream regional con los extras YA ASENTADOS.
 *
 * El regional conserva el orden en que lo devolvió TMDB —`sort` de JS es
 * estable, así que ordenar por fecha no altera el orden de llegada entre
 * empatados—, y por eso una página nueva sólo agrega al final.
 *
 * `frontera` es la fecha del último regional traído: un extra con fecha
 * ESTRICTAMENTE mayor ya no puede ser alcanzado por una página posterior. El
 * `>` estricto es lo que cubre los empates: un extra con la misma fecha que la
 * frontera todavía podría convivir con regionales de esa fecha sin traer.
 */
function mezclar(
  regionales: CandidatoUltimos[], extras: CandidatoUltimos[], agotado: boolean,
): CandidatoUltimos[] {
  const orden = [...regionales].sort((a, b) => (a.fecha === b.fecha ? 0 : (a.fecha < b.fecha ? 1 : -1)));
  const frontera = orden.length ? orden[orden.length - 1].fecha : "9999-12-31";
  const asentados = agotado ? extras : extras.filter((e) => e.fecha > frontera);

  const vistos = new Set<string>();
  const out: CandidatoUltimos[] = [];
  let i = 0;
  for (const e of asentados) {
    // Los regionales de fecha mayor o IGUAL van antes: la regla de desempate es
    // fija (el regional gana) y no depende de cuántas páginas se hayan traído.
    while (i < orden.length && orden[i].fecha >= e.fecha) empujar(orden[i++], out, vistos);
    empujar(e, out, vistos);
  }
  while (i < orden.length) empujar(orden[i++], out, vistos);
  return out;
}

/** Dedup por `tipo:id`, nunca por nombre. */
function empujar(t: CandidatoUltimos, out: CandidatoUltimos[], vistos: Set<string>): void {
  const k = clave(t);
  if (vistos.has(k)) return;
  vistos.add(k);
  out.push(t);
}
