// Orden de los resultados del buscador de la Ruleta Yump.
//
// Módulo aparte y puro por la misma razón que `hero-estado.ts` o
// `reco-descartes.ts`: es lo que se puede probar sin un DOM, y es donde está la
// única regla que puede romperse en silencio.
import type { UITitle } from "@/lib/types";

// Primero lo que está en tus plataformas, después el resto, TODO en la misma
// fila y sin separación visual. Los no disponibles no se ocultan: se pueden
// mirar, no elegir.
//
// PARTICIÓN, NO `sort()`. Dos arrays y un concat conservan el orden relativo
// dentro de cada grupo por construcción, que es el requisito: adentro de cada
// mitad manda la relevancia que ya trajo `/api/search`. Con un comparador habría
// que confiar en que el sort sea estable y además sería más fácil de romper
// después con un desempate de más.
//
// Y se hace ACÁ, en el cliente, no en `/api/search`: ese endpoint lo comparte el
// buscador principal, donde el criterio es a propósito el contrario —buscás por
// nombre y querés ver el título aunque no lo tengas—. Tocarlo cambiaría las dos
// superficies y agregaría una clave de cache nueva.
export function ordenarPorDisponibilidad<T>(items: T[], disponible: (t: T) => boolean): T[] {
  const si: T[] = [];
  const no: T[] = [];
  for (const t of items) (disponible(t) ? si : no).push(t);
  return [...si, ...no];
}

// ¿Está en alguna de las plataformas elegidas? Sale de `t.platforms`, que ya
// viaja en el payload: cambiar de plataformas reordena la fila con lo que ya
// está cargado, sin volver a buscar.
export function estaEnTusPlataformas(t: UITitle, plataformas: string[]): boolean {
  return t.platforms.some((p) => plataformas.includes(p));
}
