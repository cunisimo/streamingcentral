// Topes de entrada (Etapa 1 de capacidad, #18): `q` de /api/search e `items`
// de /api/upcoming no tenían tope, y cada variante era una entrada de caché
// nueva o una consulta más grande. Los números y su justificación están en
// lib/limites-entrada.test.ts, con los títulos que tienen que seguir pasando.
// Módulo puro.
import type { MediaType } from "./types";

/** 120 caracteres: el título más largo del pool curado mide 91 y "Borat…" 83. Se trunca, no se rechaza. */
export const MAX_Q = 120;

/** 100 refs: el mismo tope que el handler ya aplica a `limit`; hoy ninguna vista manda `items=`. */
export const MAX_ITEMS_UPCOMING = 100;

/** Recorta los bordes (como hacía el buscador) y trunca por CARACTERES, no por bytes. */
export function acotarQ(q: string): string {
  return [...q.trim()].slice(0, MAX_Q).join("");
}

export function acotarRefs<T extends { tipo: MediaType; tmdb_id: number }>(refs: T[]): T[] {
  return refs.slice(0, MAX_ITEMS_UPCOMING);
}
