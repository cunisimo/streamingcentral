// Constructores de las claves de cache que guardan contenido LOCALIZADO.
//
// POR QUÉ EXISTE ESTE MÓDULO. Once familias de claves guardan `title`, `name` u
// `overview`. Si el idioma cambia y las claves no, un rollback a es-ES sigue
// leyendo títulos mexicanos de las mismas claves hasta que expire el TTL (24 h
// en varias): el rollback no revierte nada. Con la huella adentro de la clave,
// cambiar la configuración selecciona otro espacio y el rollback es inmediato.
//
// TANDA 2 — LA HUELLA ESTÁ PUESTA. Las familias localizadas se llaman con
// `HUELLA_IDIOMA` (lib/idioma.ts), así que hoy producen `card:es-MX+f.r1:movie:278`
// y no `card:movie:278`. Ahí ocurrió la única invalidación del plan: un solo
// arranque frío, todas las familias a la vez. Se hicieron juntas a propósito —
// escalonarlas habría dado un arranque frío por tanda y, peor, un Home mitad
// es-MX y mitad es-ES mientras durara.
//
// El parámetro `huella` sigue siendo un ARGUMENTO y no una lectura del módulo:
// `HUELLA_IDIOMA` se calcula al importar, y con eso los constructores no se
// podrían probar en sus cuatro configuraciones sin recargar módulos. La cadena
// vacía sigue siendo válida y produce los bytes del código pre-tanda-1; lo que
// la conserva probada es el test de modo compatible, que es también la mitad
// "antes" del test de rollback.
//
// El tipo `ClaveLocalizada` es una marca: `cached()` en las familias de acá
// exige ese tipo, así que una clave escrita a mano no compila. El test de
// barrido (lib/claves.test.ts) es la red para lo que un `as` podría saltear.
// Sin `server-only`, misma razón que `lib/busqueda-orden.ts`: es lógica pura
// sin credenciales y hay que poder probarla con `node --test`. Que no llegue
// al bundle del navegador lo garantiza un test de importaciones
// (lib/consultas-verificadas.test.ts), que es más preciso que el guard: lo
// que hay que impedir es que un componente cliente lo importe, no que exista.
import type { MediaType, PlatformCode } from "./types";

// Marca de tipo. No cambia nada en runtime: es una cadena.
export type ClaveLocalizada = string & { readonly __localizada: unique symbol };

// Prefijo con la huella, o sin ella en modo compatible. Es lo único que hay que
// cambiar en la tanda 2, y está en UN solo lugar a propósito.
function pre(huella: string): string {
  return huella ? `${huella}:` : "";
}

const marcar = (s: string) => s as ClaveLocalizada;

// --- Las doce familias localizadas --------------------------------------------
// Eran once en la tanda 2. La doceava, `ultimos:`, entró con la corrección de
// disponibilidad. El número vigente lo fija lib/claves.test.ts.
// El orden y el formato de cada una reproducen el código anterior byte a byte.
// Los tests fijan los literales de hoy: si alguna cambia, fallan.

/**
 * Payload compuesto del Home. La versión `v6` es del contenido, no del idioma.
 *
 * `v6`: "Últimos lanzamientos" estrenó selector Películas/Series. Sube porque un
 * payload `v5` cacheado NO trae `typeToggle` ni `shelfKey` en ese riel, así que
 * durante las 6 h del TTL el selector no aparecería y el cambio "no se vería"
 * después de deployar. Un solo cambio de versión y un solo arranque frío.
 */
export function claveHome(semilla: number, providers: string, tipos: string, huella: string): ClaveLocalizada {
  return marcar(`home:${pre(huella)}v6:${semilla}:${providers}:${tipos}`);
}

/** Un pool de discover: una plataforma, una receta, una página. */
export function clavePoolCache(
  version: string, region: string, dia: string, tipo: MediaType,
  plataforma: PlatformCode, receta: string, pagina: number, huella: string,
): ClaveLocalizada {
  return marcar(`disc:${pre(huella)}${version}:${region}:${dia}:${tipo}:${plataforma}:${receta}:p${pagina}`);
}

/** La consulta combinada de varias plataformas, paginada por TMDB. */
export function claveCombinadaCache(
  version: string, region: string, dia: string, tipo: MediaType,
  providers: string, receta: string, pagina: number, huella: string,
): ClaveLocalizada {
  return marcar(`disc:${pre(huella)}${version}:${region}:${dia}:${tipo}:combo-${providers}:${receta}:p${pagina}`);
}

/** Card reconstruida a partir de (tipo, id). */
export function claveCard(tipo: MediaType, id: number, huella: string): ClaveLocalizada {
  return marcar(`card:${pre(huella)}${tipo}:${id}`);
}

/** Bloque de popularidad de /top. */
export function claveTopPop(plataforma: PlatformCode, tipo: MediaType, huella: string): ClaveLocalizada {
  return marcar(`top:pop:${pre(huella)}${plataforma}:${tipo}`);
}

/** El riel "Elegidas para vos", ya armado. */
export function claveReco(huellaSenales: string, huella: string): ClaveLocalizada {
  return marcar(`reco:${pre(huella)}v2:${huellaSenales}`);
}

/** Recomendados de TMDB para un título. */
export function claveRecoMismo(tipo: MediaType, id: number, huella: string): ClaveLocalizada {
  return marcar(`reco:mismo:${pre(huella)}${tipo}:${id}`);
}

/** Cruce de tipo por keywords. */
export function claveRecoCruce(
  tipo: MediaType, id: number, providers: string, huella: string,
): ClaveLocalizada {
  return marcar(`reco:cruce:${pre(huella)}${tipo}:${id}:${providers}`);
}

/** Perfil temático. Guarda `titulo`, que es localizado aunque solo se use para puntuar. */
export function claveRecoPerfil(tipo: MediaType, id: number, huella: string): ClaveLocalizada {
  return marcar(`reco:perfil:${pre(huella)}v2:${tipo}:${id}`);
}

/** Búsqueda ya ordenada.
 *
 *  SÍ es localizada, aunque `searchDeTipo` esté clavado en es-MX: el resultado
 *  incluye personas, y su `knownFor` sale del IDIOMA BASE. Con es-MX la mitad
 *  del payload cambia. La primera auditoría la dejó fuera mirando solo la parte
 *  de títulos. */
export function claveSearch(q: string, providers: string, huella: string): ClaveLocalizada {
  return marcar(`search:${pre(huella)}v2:${q}:${providers}`);
}

/**
 * "Últimos lanzamientos · Series", ya mezclado y paginado.
 *
 * Lleva la fecha argentina en la clave porque la ventana se corta en "hoy": sin
 * eso, la lista del día anterior sobreviviría al cambio de día y el riel se
 * quedaría sin los estrenos de la mañana.
 */
export function claveUltimosSeries(
  dia: string, providers: string, tramo: string, huella: string,
): ClaveLocalizada {
  return marcar(`ultimos:${pre(huella)}v1:tv:${dia}:${providers}:${tramo}`);
}

/** Actores populares. Guarda `knownFor`, que son títulos localizados. */
export function clavePeoplePopular(page: number, huella: string): ClaveLocalizada {
  return marcar(`people:popular:${pre(huella)}${page}`);
}

// --- Claves NO localizadas ---------------------------------------------------
// Verificadas una por una; no guardan title/name/overview y por eso no llevan
// huella. Están acá para que la lista completa viva en un solo lugar y el
// barrido pueda distinguir "no lleva huella" de "se olvidaron de ponerla".
//
//   pv3:<tipo>:<id>         códigos de plataforma, si AR tiene algún flatrate,
//                           y el RESUMEN REGIONAL: cuántas regiones hay, cuántas
//                           informan cada plataforma soportada, y cuántas no
//                           traen ninguna. No es un mapa por región — ver
//                           `resumenRegional` en lib/enlace-oficial.ts.
//                           Historia de la clave: `pv:` no tenía datos
//                           regionales; `pv2:` guardaba ids DEDUPLICADOS, que
//                           perdían la frecuencia y no servían para comprobar
//                           la dominancia por regiones; `pv3:` cuenta regiones
//   disp:<tipo>:<id>        disponibilidad ya resuelta de un título vacío en AR
//   oficial:<tipo>:<id>     redes, homepage y estreno para la regla de evidencia
//                           oficial. Era `serie:oficial:<id>` y sólo cubría
//                           series; ahora cubre los dos tipos, y por eso lleva
//                           el tipo en la clave
//   videos:<tipo>:<id>      key de YouTube; ya pide el idioma original
//   genre:covers:v2         rutas de póster
//   people:directors        knownFor siempre vacío
//   ed:pub:<tipo>           ids
//   blocklist:<chip>        ids
//
// 🔴 ESTA LISTA SE HACE VALER. Era una constante que no consumía nadie —ni el
// código ni un test— así que cuando `pv2:` pasó a `pv3:` y `serie:oficial:` a
// `oficial:`, el barrido siguió en verde vigilando dos familias muertas.
// `lib/claves.test.ts` ahora exige que toda familia usada esté declarada y que
// ninguna declarada quede huérfana.
//
// ⚠️ QUE NO LLEVEN HUELLA ESTÁ MEDIDO, no heredado del nombre anterior
// (2026-08-31, contra TMDB): el `link` de `watch/providers` no cambia con el
// idioma —su slug sale del título ORIGINAL, en inglés, aunque se pida es-ES— y
// el `homepage` de un título es IDÉNTICO en es-ES, es-MX y en-US. Ponerles
// huella fabricaría un espacio de caché por idioma para datos que no cambian
// con el idioma: más arranques fríos a cambio de nada.
export const CLAVES_SIN_HUELLA = [
  "pv3:", "videos:", "genre:covers:", "people:directors", "ed:pub:", "blocklist:",
  // Las dos de disponibilidad guardan códigos de plataforma, ids de red, una
  // URL y contadores: ningún título, ninguna sinopsis.
  "disp:", "oficial:",
] as const;
