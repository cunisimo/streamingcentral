// Las reseñas que muestra la ficha, en el orden en que se muestran.
//
// Una sola sección "RESEÑAS" (components/ResenasAcordeon.tsx): primero la
// reseña editorial de Yump (`editorial_reviews`), SIEMPRE primera, y después
// las de la comunidad (E5a), que se piden aparte, con sesión, desde el cliente
// (/api/comunidad/resenas/lista): nunca viajan en /api/title, en el HTML del
// servidor ni en una caché compartida.
import type { EditorialReview } from "./types";

export interface ResenaFicha {
  id: string;
  origen: "yump" | "usuario";
  autor: string;
  texto: string;
  fecha: string;
  rating: number | null;
}

export function resenasDeFicha(editorial: EditorialReview | null, usuarios: ResenaFicha[] = []): ResenaFicha[] {
  const yump: ResenaFicha[] = editorial
    ? [{ id: "yump", origen: "yump", autor: "Reseña Yump", texto: editorial.texto, fecha: editorial.fecha, rating: editorial.rating }]
    : [];
  return [...yump, ...usuarios];
}

export const tituloResenas = (n: number) => `RESEÑAS · ${n}`;

/**
 * El encabezado de la sección. `comunidad` es cuántas de la comunidad ve ESTE
 * lector (con sesión), o `null` cuando no se sabe o no se puede decir: sin
 * sesión, con el módulo encendido, el encabezado no lleva número, para no
 * revelar si el título tiene reseñas de la comunidad. Con el módulo apagado
 * (`comunidad` null y `soloYump`), cuenta sólo la de Yump, como antes.
 */
export function encabezadoResenas(yump: number, comunidad: number | null, soloYump: boolean): string {
  if (soloYump) return tituloResenas(yump);
  return comunidad === null ? "RESEÑAS" : tituloResenas(yump + comunidad);
}
