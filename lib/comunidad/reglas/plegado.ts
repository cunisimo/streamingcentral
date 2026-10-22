// Copias "plegadas" del texto, sólo para buscar patrones (revisión §3.1). Lo
// que se guarda y se muestra es `original`.
//
// DOS PASADAS, EN ESTE ORDEN, y no es un detalle:
//   1. dígitos: las palabras-número se pasan a dígitos ANTES de tocar
//      confusables, para que "uno uno cinco…" sea un número y no letras.
//   2. letras: dominios, correos, usuarios y vocabulario. Los confusables
//      AMBIGUOS (1 → i o l, 0 → o) no se reemplazan acá: los patrones usan
//      clases de caracteres (ver `clase()`), porque un reemplazo único elegiría
//      mal la mitad de las veces. Sólo se mapean las cirílicas y griegas que no
//      son ambiguas.

import type { Plegado } from "./tipos.ts";

// Invisibles que sirven para partir palabras sin que se vea: ZWSP, ZWNJ, ZWJ,
// marcas de dirección, word joiner, BOM y guion blando.
const INVISIBLES = /[­᠎​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;
// Controles C0/C1 salvo salto de línea y tabulación.
const CONTROLES = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;

/** NFC, saltos de línea unificados y bordes recortados: lo que se guarda. */
export function normalizarOriginal(texto: string): string {
  return texto.normalize("NFC").replace(/\r\n?/g, "\n").trim();
}

/** NFKC, minúsculas, sin acentos, sin invisibles ni controles, espacios colapsados. */
export function base(texto: string): string {
  return texto
    .normalize("NFKC")
    .replace(INVISIBLES, "")
    .replace(CONTROLES, " ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------- pasada 1

export const PALABRAS_NUMERO: Readonly<Record<string, string>> = {
  cero: "0", uno: "1", un: "1", una: "1", dos: "2", tres: "3", cuatro: "4",
  cinco: "5", seis: "6", siete: "7", ocho: "8", nueve: "9", diez: "10",
  once: "11", doce: "12", trece: "13", catorce: "14", quince: "15",
};

/** Corridas con al menos tantas piezas numéricas se convierten. */
export const MIN_PIEZAS_CORRIDA = 3;

// Entre dos piezas de una corrida sólo puede haber separadores, nunca letras.
const SEPARADOR_CORRIDA = /^[\s.\-_()*+,:;/|]*$/;

// Letras que se usan en lugar de dígitos: "5O5O", "1l", "5S", "7O".
const LETRA_DIGITO: Readonly<Record<string, string>> = {
  o: "0", l: "1", i: "1", "|": "1", s: "5", z: "2", b: "8", g: "9",
};

/**
 * En una pieza que YA tiene al menos un dígito y sólo tiene dígitos o letras
 * de `LETRA_DIGITO`, las letras se pasan a dígitos ("5o5o" → "5050"). Una
 * pieza sin dígitos no se toca ("solo", "bis"), y una con otra letra tampoco
 * ("Se7en", "M3GAN", "2do", "T3E8"). La familia es la de los confusables
 * ambiguos de la pasada 2, vista desde los números (E1.1, A1).
 */
export function letrasADigitos(b: string): string {
  return b.replace(/[\p{L}\p{N}|]+/gu, (pieza) => {
    if (!/\d/.test(pieza)) return pieza;
    if (![...pieza].every((c) => /\d/.test(c) || c in LETRA_DIGITO)) return pieza;
    return [...pieza].map((c) => LETRA_DIGITO[c] ?? c).join("");
  });
}

/**
 * Pasa a dígitos las palabras-número que forman una corrida de al menos
 * `MIN_PIEZAS_CORRIDA` piezas numéricas ("once cinco cinco…", "11 cinco 66").
 * Fuera de una corrida no toca nada: "un clásico" o "dos o tres escenas"
 * siguen siendo palabras.
 */
export function palabrasADigitos(b: string): string {
  const piezas = [...b.matchAll(/[\p{L}\p{N}]+/gu)].map((m) => ({
    texto: m[0], desde: m.index!, hasta: m.index! + m[0].length,
  }));
  const esNumerica = (t: string) => /^\d+$/.test(t) || t in PALABRAS_NUMERO;
  const reemplazos = new Map<number, string>();
  let i = 0;
  while (i < piezas.length) {
    if (!esNumerica(piezas[i].texto)) { i++; continue; }
    let j = i;
    while (
      j + 1 < piezas.length &&
      esNumerica(piezas[j + 1].texto) &&
      SEPARADOR_CORRIDA.test(b.slice(piezas[j].hasta, piezas[j + 1].desde))
    ) j++;
    if (j - i + 1 >= MIN_PIEZAS_CORRIDA) {
      for (let k = i; k <= j; k++) {
        const t = piezas[k].texto;
        if (t in PALABRAS_NUMERO) reemplazos.set(k, PALABRAS_NUMERO[t]);
      }
    }
    i = j + 1;
  }
  if (reemplazos.size === 0) return b;
  let salida = "";
  let cursor = 0;
  piezas.forEach((p, k) => {
    const r = reemplazos.get(k);
    if (r === undefined) return;
    salida += b.slice(cursor, p.desde) + r;
    cursor = p.hasta;
  });
  return salida + b.slice(cursor);
}

// ---------------------------------------------------------------- pasada 2

// Letras de otros alfabetos que se ven como una latina (minúsculas: `base` ya
// bajó las mayúsculas). E1.1 amplió la tabla a las formas "de versalita" que
// también se usan para disimular ("сом" con м cirílica, A2). Sigue siendo una
// lista de los confusables más comunes, NO una tabla completa de Unicode.
const CONFUSABLES_LETRA: Readonly<Record<string, string>> = {
  // cirílico
  "а": "a", "в": "b", "с": "c", "ԁ": "d", "е": "e", "г": "r", "һ": "h", "н": "h",
  "і": "i", "ј": "j", "к": "k", "ӏ": "l", "м": "m", "п": "n", "о": "o", "р": "p",
  "ԛ": "q", "ѕ": "s", "т": "t", "и": "u", "ѵ": "v", "ԝ": "w", "х": "x", "у": "y", "ь": "b",
  // griego
  "α": "a", "β": "b", "ε": "e", "η": "n", "ι": "i", "κ": "k", "μ": "u", "ν": "v",
  "ο": "o", "ρ": "p", "τ": "t", "υ": "u", "χ": "x", "ω": "w", "γ": "y",
  // latín extendido y versalitas
  "ı": "i", "ɑ": "a", "ɡ": "g", "ɩ": "i", "ᴀ": "a", "ʙ": "b", "ᴄ": "c", "ᴅ": "d",
  "ᴇ": "e", "ɢ": "g", "ʜ": "h", "ɪ": "i", "ᴊ": "j", "ᴋ": "k", "ʟ": "l", "ᴍ": "m",
  "ɴ": "n", "ᴏ": "o", "ᴘ": "p", "ʀ": "r", "ꜱ": "s", "ᴛ": "t", "ᴜ": "u", "ᴠ": "v",
  "ᴡ": "w", "ʏ": "y", "ᴢ": "z",
  // armenio
  "օ": "o", "ս": "u", "ց": "g",
};

/** Cada letra con sus variantes ambiguas, para armar patrones. */
const VARIANTES: Readonly<Record<string, string>> = {
  a: "a4@", e: "e3", i: "i1l!|", l: "l1i|", o: "o0", s: "s5$", t: "t7+", g: "g9", b: "b8",
};

const escapar = (c: string) => c.replace(/[\\^$.*+?()[\]{}|\-]/g, "\\$&");

/** "com" → "c[o0]m": la palabra con sus confusables ambiguos como clases. */
export function clase(palabra: string): string {
  return [...palabra].map((c) => {
    const v = VARIANTES[c];
    return v ? `[${[...v].map(escapar).join("")}]` : escapar(c);
  }).join("");
}

/**
 * Resuelve las formas ofuscadas de "." y "@" y une letras sueltas:
 * "pelis punto com", "bit(.)ly", "juan arroba gmail", "(at)", "[dot]",
 * "j u a n @ g m a i l . c o m", "cine-oscuro . blogspot . com".
 * "final. Me encantó" NO se une: el punto pegado a la palabra anterior y un
 * espacio después es puntuación, no un dominio.
 */
export function resolverSeparadores(b: string): string {
  let t = b
    .replace(/[([{]\s*(?:\.|punto|dot)\s*[)\]}]/g, ".")
    .replace(/[([{]\s*(?:@|arroba|at)\s*[)\]}]/g, "@")
    .replace(/\barroba\b/g, "@")
    .replace(/ (?:punto|dot) /g, ".");
  t = unirLetrasSueltas(t);
  // Espacio a ambos lados de "." o "@" entre dos piezas: es una dirección partida.
  t = t.replace(/([\p{L}\p{N}_-]) +([.@]) +(?=[\p{L}\p{N}])/gu, "$1$2");
  t = t.replace(/([\p{L}\p{N}_-]) +@(?=[\p{L}\p{N}])/gu, "$1@");
  t = t.replace(/([\p{L}\p{N}_-])@ +(?=[\p{L}\p{N}])/gu, "$1@");
  return t;
}

/** Corridas de 3 o más piezas de un solo carácter separadas por espacios: "w w w . p e l i s". */
function unirLetrasSueltas(t: string): string {
  return t.replace(/(?:^|(?<= ))(?:[\p{L}\p{N}.@] ){2,}[\p{L}\p{N}.@](?=$| )/gu, (m) => m.replace(/ /g, ""));
}

export function mapearConfusables(t: string): string {
  return [...t].map((c) => CONFUSABLES_LETRA[c] ?? c).join("");
}

/** Las cuatro copias que miran las reglas. Lanza si el texto no es un string. */
export function plegar(texto: string): Plegado {
  if (typeof texto !== "string") throw new TypeError("plegar: el texto no es un string");
  const original = normalizarOriginal(texto);
  const b = base(original);
  return {
    original,
    base: b,
    digitos: palabrasADigitos(letrasADigitos(b)),
    letras: mapearConfusables(resolverSeparadores(b)),
  };
}
