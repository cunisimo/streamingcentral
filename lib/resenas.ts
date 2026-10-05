// Las reseñas que muestra la ficha, en el orden en que se muestran.
//
// Hoy la única fuente es la reseña editorial de Yump (`editorial_reviews`).
// El dueño anunció (5/10) un sistema de reseñas de usuarios: cuando exista,
// sus reseñas entran por `usuarios` y la sección no cambia. La de Yump va
// SIEMPRE primera.
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
