// El texto de una reseña tal como se guarda, y su largo. PURO y apto para el
// cliente: lo usan el editor (contador), la ruta (validación previa) y las
// pruebas, y tiene que dar EXACTAMENTE lo mismo que la base (E3a).
//
//   - Normalización: la de las reglas de E1 (`normalizarOriginal` en
//     lib/comunidad/reglas/plegado.ts): NFC, saltos de línea unificados en
//     "\n" y bordes recortados. Está copiada acá, y no importada, para no
//     arrastrar al navegador las tablas Unicode de las reglas; un test fija
//     que las dos den lo mismo.
//   - Largo: puntos de código, igual que `char_length` de PostgreSQL y que
//     la regla de formato de E1. Un emoji compuesto (familia, bandera) cuenta
//     todos sus puntos de código: la pantalla muestra el mismo número que va
//     a contar la base.
//   - Caracteres no permitidos: los mismos que el CHECK
//     `versiones_texto_forma` de 011 (controles salvo el salto de línea, la
//     tabulación incluida, e invisibles o de dirección). Las reglas de E1
//     dejan pasar la tabulación y algunos invisibles; sin esta validación,
//     ese texto pasaría las reglas y fallaría al guardar.
export const LARGO_MIN = 80;
export const LARGO_MAX = 600;

const NO_PERMITIDOS = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F​-‏‪-‮⁠-⁩﻿]/u;

/** NFC, saltos de línea "\n" y bordes recortados: lo que se guarda. */
export function normalizarTexto(texto: string): string {
  return texto.normalize("NFC").replace(/\r\n?/g, "\n").trim();
}

/** Puntos de código del texto ya normalizado (= `char_length` en la base). */
export function largoTexto(normalizado: string): number {
  let n = 0;
  for (const _ of normalizado) n++;
  return n;
}

export type ProblemaFormato = { tipo: "largo"; largo: number } | { tipo: "caracteres" };

/** Lo que impediría guardar el texto normalizado, o null. */
export function problemaFormato(normalizado: string): ProblemaFormato | null {
  if (NO_PERMITIDOS.test(normalizado)) return { tipo: "caracteres" };
  const n = largoTexto(normalizado);
  if (n < LARGO_MIN || n > LARGO_MAX) return { tipo: "largo", largo: n };
  return null;
}

export function mensajeFormato(p: ProblemaFormato): string {
  if (p.tipo === "caracteres") return "Sacá los caracteres invisibles, de control o de dirección del texto.";
  return `La reseña tiene que tener entre ${LARGO_MIN} y ${LARGO_MAX} caracteres; ahora tiene ${p.largo}.`;
}
