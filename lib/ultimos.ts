// "Últimos lanzamientos": mezcla, orden y paginación.
//
// Para películas nada cambia: la fuente regional de TMDB alcanza. Para SERIES no
// alcanza, y no es un problema de la ficha sino del descubrimiento: el
// `discover` filtrado por proveedor no devuelve los títulos cuyo dato regional
// TMDB todavía no tiene. Medido el 2026-08-30 con Disney+/AR: 1152 resultados y
// `tv:275224` no está en ninguno, mientras `with_networks=2739` sí lo trae.
//
// 🔴 NO HAY VENTANA FIJA DEL CATÁLOGO REGIONAL. TMDB no deja combinar
// `with_watch_providers` con `with_networks` en un solo query (los une con AND),
// así que la mezcla es inevitable — y una mezcla paginada "página N de cada
// fuente" produce repetidos y salteos. Hubo dos intentos que sí usaban ventana
// fija (3 páginas por fuente, y después un tope de 12 "de seguridad") y los dos
// truncaban la lista: con Netflix, Max o Prime la página 4 —y después la 13—
// volvían vacías aunque TMDB tuviera cientos de resultados.
//
// Ahora el catálogo regional se pagina hasta donde llegue `total_pages`, que es
// el límite REAL de la fuente, y lo acotado es sólo el suplemento por redes —que
// por naturaleza son un puñado de estrenos recientes—.
//
// Lo que hace que las páginas no se pisen es otra cosa: el orden regional es el
// de TMDB, estabilizado, así que una página nueva sólo agrega al final; y un
// extra entra recién cuando el stream regional pasó su fecha, porque antes su
// posición no está decidida. Ver `paginarUltimos`.
//
// LO QUE ESTO NO RESUELVE, dicho claro:
//  - La cobertura llega hasta `total_pages` de TMDB. No es "indefinida": es el
//    límite de la fuente, no nuestro.
//  - El suplemento por redes SÍ tiene ventana fija (3 páginas). Un título de red
//    más viejo que eso no aparece.
//  - 🔴 RIESGO RESIDUAL: un salto en frío a una página válida y profunda todavía
//    tiene que reconstruir el prefijo —pedir las páginas 1..N— para poder
//    mezclarlo de forma estable. Cada página queda cacheada por separado, así
//    que se paga una vez, pero el costo del salto no desapareció. Quitarlo
//    exigiría rediseñar la paginación (por ejemplo con cursor por fecha), y eso
//    no se hizo.
//
// Sin `server-only`: es lógica pura y todo el punto es poder probarla.
import { platformByCode } from "./providers-ar.ts";
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

// `combinarUltimos` vivía acá y se ELIMINÓ.
//
// Dejó de usarse cuando la orquestación pasó a `paginarUltimos`, y quedó como
// un segundo camino para la misma decisión: exportado, con sus propios tests
// pasando, y sin que nada de producción lo llamara. Es la misma forma del
// problema que tuvo `plataformasDeFicha` — dos lugares decidiendo lo mismo, uno
// de ellos invisible— así que se saca en vez de dejarlo con un comentario.
//
// Lo que hacía lo hacen ahora `filtrar`, `ordenarExtras` y `mezclar`, que son
// privadas y las usa un solo llamador.
// ============================================================================
// Orquestación: pedir páginas regionales hasta cubrir la pedida
// ============================================================================

/** Una página del catálogo regional, ya enriquecida, más lo que TMDB declara. */
export interface PaginaRegional {
  items: CandidatoUltimos[];
  /** `total_pages` de TMDB. Es el ÚNICO límite real del bucle. */
  totalPaginas: number;
  /**
   * `total_results` de TMDB, **antes** de enriquecer y filtrar.
   *
   * Se agregó al contrato para poder descartar una página imposible sin
   * recorrer el catálogo entero: con `totalPaginas` sola no alcanza, porque no
   * dice cuántos títulos hay. Es una COTA SUPERIOR —el filtrado sólo saca— así
   * que nunca declara imposible una página que sí podría traer algo.
   */
  totalResultados: number;
}

/**
 * Sólo los códigos que existen en `providers-ar.ts`.
 *
 * 🔴 UN CÓDIGO DESCONOCIDO NO ES "SIN FILTRO". `codesToTmdbIds` descarta lo que
 * no conoce y devuelve `[]`, y `discover` sólo pone `with_watch_providers` si
 * recibe ids: con un código inválido salía **el catálogo entero sin filtrar**,
 * para después descartarlo contra unas plataformas que no existen. Acá se
 * normaliza una vez, arriba de todo, y las puertas reciben la lista limpia.
 */
export function plataformasValidas(codes: PlatformCode[]): PlatformCode[] {
  return codes.filter((c) => Boolean(platformByCode(c)));
}

/**
 * El contrato de `page`: **un entero finito >= 1, o la página 1**.
 *
 * Ausente, `NaN`, cero, negativa, infinita o fraccionaria caen todas acá y
 * salen normalizadas. Una regla sola, sin excepciones que recordar.
 *
 * Antes `app/api/latest/route.ts` hacía `Number(...)` sin validar: con `page=x`
 * entraba `NaN`, la condición de cobertura no se cumplía nunca y la orquestación
 * recorría `total_pages` completo pidiéndole todo el catálogo a TMDB.
 */
export function normalizarPagina(page: unknown): number {
  const n = Math.trunc(Number(page));
  return Number.isFinite(n) && n >= 1 ? n : 1;
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
  /** Recibe la lista de plataformas YA normalizada. */
  traerRegional: (pagina: number, providers: PlatformCode[]) => Promise<PaginaRegional>;
  traerExtras: (providers: PlatformCode[]) => Promise<CandidatoUltimos[]>;
}): Promise<{ items: CandidatoUltimos[]; hayMas: boolean }> {
  // --- Guardas de entrada, ANTES de pedir nada -----------------------------
  //
  // Sin plataformas válidas no hay nada que buscar: ni una página regional ni el
  // suplemento. `listByCategory` tiene este retorno temprano desde siempre; la
  // rama de series lo perdió al dejar de pasar por ahí, y con `providers: []`
  // sobre una fuente de 50 páginas las pedía las 50 para devolver cero.
  const providers = plataformasValidas(opts.providers);
  if (!providers.length) return { items: [], hayMas: false };
  const page = normalizarPagina(opts.page);
  const filtro = { providers, hoy: opts.hoy };

  const extras = ordenarExtras(filtrar(await opts.traerExtras(providers), filtro));
  const necesarios = page * opts.porPagina;

  const regionales: CandidatoUltimos[] = [];
  let pagina = 1;
  let totalPaginas = 1;
  let agotado = false;

  // Se pide de a una página hasta cubrir la pedida o agotar la fuente.
  for (;;) {
    const r = await opts.traerRegional(pagina, providers);
    totalPaginas = r.totalPaginas;
    regionales.push(...filtrar(r.items, filtro));
    agotado = pagina >= totalPaginas;

    // COTA SUPERIOR, apenas se conoce: más títulos que éstos no puede haber.
    // Sirve para cortar una página imposible sin recorrer el catálogo entero —
    // el caso de `page=9999`, que antes pedía las 50 páginas para nada. Es una
    // cota, no una cuenta exacta: el filtrado sólo saca, así que nunca descarta
    // una página que sí podría tener resultados.
    if (pagina === 1) {
      const techo = Math.ceil((r.totalResultados + extras.length) / opts.porPagina);
      if (page > Math.max(1, techo)) return { items: [], hayMas: false };
    }

    // La cuenta se hace sobre la MEZCLA, que es lo que se sirve. Una página
    // enriquecida vacía no corta: lo que corta es que TMDB no tenga más.
    if (agotado) break;
    if (mezclar(regionales, extras, agotado).length >= necesarios) break;
    pagina++;
  }

  const todos = mezclar(regionales, extras, agotado);
  const desde = (page - 1) * opts.porPagina;
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

/**
 * Los extras, por fecha descendente y con desempate estable por id.
 *
 * Usa `ordenUltimos` en vez de repetir el comparador: el desempate tiene que ser
 * el mismo en los dos lados o dos requests pueden ordenarlos distinto.
 *
 * ⚠️ El stream REGIONAL no se ordena con esto: conserva el orden de TMDB, que es
 * lo que hace que una página nueva sólo agregue al final. Ver `mezclar`.
 */
function ordenarExtras(items: CandidatoUltimos[]): CandidatoUltimos[] {
  return [...items].sort(ordenUltimos);
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
