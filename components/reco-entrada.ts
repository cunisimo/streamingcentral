// Qué se le manda al recomendador: las SEÑALES y las EXCLUSIONES.
//
// Son dos cosas distintas y hasta ahora salían de la misma lista recortada, que
// es el bug que arregla este módulo.
//
//   SEÑALES = de qué títulos partir para recomendar. Se acotan a los más
//   recientes a propósito: el riel tiene que moverse cuando la persona se mueve,
//   no quedar anclado a lo que votó hace ocho meses. Además solo entran seis
//   (MAX_ORIGENES), así que mandar más no cambiaría nada.
//
//   EXCLUSIONES = qué NO puede aparecer. Acá recortar es un bug: un título que
//   calificaste hace un año sigue calificado, y el riel recomienda lo que
//   TODAVÍA NO calificaste. Con el tope de 40 compartido, el voto número 41 se
//   caía de las dos listas y el título volvía a aparecer recomendado — con el
//   agravante de que le pasa justo a quien más usa la app.
//
// Cuesta cero llamadas extra: se piden todos los votos UNA vez, en la misma
// query de siempre, y el recorte de las señales se hace acá con `.slice()`.
import type { MediaType } from "@/lib/types";

export interface Voto { tmdb_id: number; tipo: MediaType; rating: number }
export interface Marcado { tmdb_id: number; tipo: MediaType; kind: string }

// Cuántos votos alimentan las señales. NO acota las exclusiones.
export const VOTOS_PARA_SENALES = 40;

export interface Senal { tipo: MediaType; id: number; peso: number }

// Jerarquía: Petacular (3) > Ta buena (2) > Mi lista (1).
// `Malaso` NO es fuente — un título que no te gustó no origina nada.
// Un mismo título puede estar votado Y en Mi lista; de eso se encarga
// `recomendaciones`, que deduplica conservando la señal más fuerte.
export function armarSenales(votos: Voto[], marcados: Marcado[], tope = VOTOS_PARA_SENALES): Senal[] {
  const recientes = votos.slice(0, tope);
  return [
    ...recientes.filter((x) => x.rating === 3).map((x) => ({ tipo: x.tipo, id: x.tmdb_id, peso: 3 })),
    ...recientes.filter((x) => x.rating === 2).map((x) => ({ tipo: x.tipo, id: x.tmdb_id, peso: 2 })),
    ...marcados.filter((x) => x.kind === "list").map((x) => ({ tipo: x.tipo, id: x.tmdb_id, peso: 1 })),
  ];
}

// Todo lo que el usuario ya tocó, SIN recortar los votos: cualquier calificación
// (incluido Malaso), Mi lista y Ya la vi, más lo que ya se está mostrando en el
// Home para no repetir.
//
// Los descartes de "No es para mí" NO entran acá: viajan al servidor y forman
// parte de su clave de cache, así que un descarte costaría un rearmado completo
// del riel. Se filtran en el cliente (ver ./reco-descartes).
export function clavesExcluidas(votos: Voto[], marcados: Marcado[], enHome: string[]): string[] {
  return [
    ...votos.map((x) => `${x.tipo}:${x.tmdb_id}`),
    ...marcados.map((x) => `${x.tipo}:${x.tmdb_id}`),
    ...enHome,
  ];
}
