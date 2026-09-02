// El núcleo del selector Películas/Series de los rieles del Home.
//
// Vive aparte de `useHomeTypes` porque el hook es un componente de React y no se
// puede probar con `node --test`: lo que decide si el Home se rearma es el
// PARÁMETRO que sale hacia `/api/home`, y eso es una función pura que sí se
// puede probar.
//
// 🔴 POR QUÉ SE EXTRAJO. "Últimos lanzamientos" estrenó su selector en
// `lib/home.ts` y en `Shelf`, pero acá `TOGGLE_KEYS` seguía siendo sólo
// `HOME_GENRES`: `ultimos` no se leía, no se persistía y no entraba en `param`.
// El botón cambiaba en pantalla y `/api/home` recibía el mismo `t`, así que el
// Home nunca se rearmaba. Los tests que había eran estructurales —miraban el
// riel del composer— y no podían ver el hueco.
//
// Client-safe: `components/data.ts` no arrastra nada del server. Importar esto
// de `lib/home.ts` metería el cliente de Upstash Redis en el bundle.
// Extensión .ts explícita y ruta relativa: es lo que necesita `node --test`
// para cargar este módulo, y todo el punto de que exista es poder probarlo.
import { HOME_GENRES, defaultTypeFor } from "../components/data.ts";
import type { MediaType } from "../lib/types";

/**
 * Las claves con toggle que RECONSTRUYEN el Home (`typeToggle: "refetch"`).
 *
 * Los rieles de votos ("mas-votados" / "hacete-cargo") usan `typeToggle:
 * "filter"`: se resuelven en el cliente sobre la lista mixta ya cargada, así que
 * NO entran acá ni en el parámetro `t`. Su preferencia la sigue guardando
 * `useShelfType`, en la misma clave y formato.
 */
export const TOGGLE_KEYS: string[] = [...HOME_GENRES, "ultimos"];

/**
 * Defaults declarados por clave, para lo que no sale de `defaultTypeFor`.
 *
 * ⚠️ `ultimos` va acá y NO se hereda de `defaultTypeFor`. Esa función alterna
 * movie/tv según la posición del género, así que para una clave que no es un
 * género devuelve cualquier cosa — y si devolviera "tv", el Home inicial de todo
 * el mundo cambiaría de golpe. El default es **Películas** y está escrito.
 */
export const DEFAULTS_TOGGLE: Record<string, MediaType> = {
  ultimos: "movie",
};

/** El tipo de una clave: lo guardado si es válido, si no su default. */
export function tipoDe(clave: string, store: Record<string, MediaType>): MediaType {
  const v = store[clave];
  if (v === "movie" || v === "tv") return v;
  return DEFAULTS_TOGGLE[clave] ?? defaultTypeFor(clave);
}

/** El estado inicial de TODAS las claves de refetch, a partir de lo guardado. */
export function tiposIniciales(store: Record<string, MediaType>): Record<string, MediaType> {
  const out: Record<string, MediaType> = {};
  for (const k of TOGGLE_KEYS) out[k] = tipoDe(k, store);
  return out;
}

/**
 * La serialización para `/api/home?t=…`.
 *
 * Es lo ÚNICO que hace que el Home se rearme: si una clave no sale acá, tocar su
 * selector no cambia la URL y el servidor devuelve el mismo payload cacheado.
 *
 * Sólo salen las claves de refetch, aunque el objeto guardado traiga otras
 * —comparte `localStorage` con `useShelfType`, que guarda también los rieles de
 * filtro—.
 */
export function paramDeTipos(types: Record<string, MediaType>): string {
  return TOGGLE_KEYS.map((k) => `${k}:${types[k] ?? tipoDe(k, {})}`).join(",");
}
