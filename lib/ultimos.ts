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
