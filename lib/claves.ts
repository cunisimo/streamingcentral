// Constructores de las claves de cache que guardan contenido LOCALIZADO.
//
// POR QUÉ EXISTE ESTE MÓDULO. Diez familias de claves guardan `title`, `name` u
// `overview`. Si el idioma cambia y las claves no, un rollback a es-ES sigue
// leyendo títulos mexicanos de las mismas claves hasta que expire el TTL (24 h
// en varias): el rollback no revierte nada. Con la huella adentro de la clave,
// cambiar la configuración selecciona otro espacio y el rollback es inmediato.
//
// MODO COMPATIBLE (tanda 1). Hoy se llaman con `HUELLA_EN_CLAVES`, que es la
// cadena vacía, y por eso producen EXACTAMENTE los mismos bytes que el código
// anterior. Eso permite cablearlos y probar el barrido sin provocar ningún
// arranque frío. En la tanda 2 se les pasa `HUELLA_IDIOMA` y ahí ocurre la
// única invalidación del plan.
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

// --- Las diez familias -------------------------------------------------------
// El orden y el formato de cada una reproducen el código anterior byte a byte.
// Los tests fijan los literales de hoy: si alguna cambia, fallan.

/** Payload compuesto del Home. La versión `v5` es del contenido, no del idioma. */
export function claveHome(semilla: number, providers: string, tipos: string, huella: string): ClaveLocalizada {
  return marcar(`home:${pre(huella)}v5:${semilla}:${providers}:${tipos}`);
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

/** Actores populares. Guarda `knownFor`, que son títulos localizados. */
export function clavePeoplePopular(page: number, huella: string): ClaveLocalizada {
  return marcar(`people:popular:${pre(huella)}${page}`);
}

// --- Claves NO localizadas ---------------------------------------------------
// Verificadas una por una; no guardan title/name/overview y por eso no llevan
// huella. Están acá para que la lista completa viva en un solo lugar y el
// barrido pueda distinguir "no lleva huella" de "se olvidaron de ponerla".
//
//   pv:<tipo>:<id>          códigos de plataforma
//   videos:<tipo>:<id>      key de YouTube; ya pide el idioma original
//   genre:covers:v2         rutas de póster
//   people:directors        knownFor siempre vacío
//   ed:pub:<tipo>           ids
//   blocklist:<chip>        ids
//   search:v2:<q>:<plats>   `searchDeTipo` está clavado en es-MX y no se toca
export const CLAVES_SIN_HUELLA = [
  "pv:", "videos:", "genre:covers:", "people:directors", "ed:pub:", "blocklist:", "search:",
] as const;
