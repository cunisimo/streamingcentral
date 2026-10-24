// Ámbito de las señales combinadas (contrato de moderación v1, §7): la misma
// oración o la contigua, y como máximo AMBITO_PALABRAS palabras entre el
// primer y el último indicio. Se calcula sobre la copia en la que se buscaron
// los indicios (las posiciones de cada copia son distintas).
//
// LÍMITE conocido: las copias plegadas colapsan los saltos de línea en
// espacios, así que una oración que termina sólo con un salto de línea se
// une a la siguiente (el ámbito se agranda, no se achica).

import { AMBITO_PALABRAS } from "./listas.ts";

// Fin de oración: . ! ? … (o una combinación) seguido de espacio o del final.
// Un punto entre dos alfanuméricos sin espacio (dominio, 8.5, 1.155.512) no corta.
const RE_FIN = /[.!?…]+(?=\s|$)/gu;
const RE_PALABRA = /[\p{L}\p{N}_]+/gu;

export interface Ambito {
  /** Índice de oración de una posición. */
  oracion: (i: number) => number;
  /** Palabras entre dos posiciones (las que empiezan en [min, max)). */
  palabrasEntre: (i: number, j: number) => number;
  /** ¿Están i y j en el ámbito? `mismaOracion` restringe a la misma oración (H2-a). */
  cerca: (i: number, j: number, mismaOracion?: boolean) => boolean;
}

export function ambito(t: string, maxPalabras = AMBITO_PALABRAS): Ambito {
  const finales: number[] = [];
  RE_FIN.lastIndex = 0;
  for (const m of t.matchAll(RE_FIN)) finales.push(m.index! + m[0].length);
  const comienzos: number[] = [];
  RE_PALABRA.lastIndex = 0;
  for (const m of t.matchAll(RE_PALABRA)) comienzos.push(m.index!);
  const oracion = (i: number) => {
    let n = 0;
    while (n < finales.length && finales[n] <= i) n++;
    return n;
  };
  const palabrasEntre = (i: number, j: number) => {
    const [a, b] = i <= j ? [i, j] : [j, i];
    return comienzos.filter((c) => c > a && c < b).length;
  };
  return {
    oracion,
    palabrasEntre,
    cerca: (i, j, mismaOracion = false) =>
      Math.abs(oracion(i) - oracion(j)) <= (mismaOracion ? 0 : 1) && palabrasEntre(i, j) <= maxPalabras,
  };
}
