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

import { PALABRAS_NUMERO_EN } from "./listas.ts";
import { CONFUSABLES_DIGITO, CONFUSABLES_LETRA_UTS39, RANGOS_CATEGORIA, RANGOS_ME, RANGOS_ND, RANGOS_SEPARADOR } from "./tablas-unicode.ts";
import type { Plegado } from "./tipos.ts";

/** Clase de caracteres (modo `u`) a partir de rangos de puntos de código. */
export function claseDeRangos(rangos: readonly (readonly [number, number])[], extra = ""): string {
  const h = (cp: number) => `\\u{${cp.toString(16)}}`;
  return `[${rangos.map(([a, b]) => (a === b ? h(a) : `${h(a)}-${h(b)}`)).join("")}${extra}]`;
}

/**
 * S (contrato v1 §2): separadores entre grupos de dígitos, de Unicode 18.0.0
 * (Zs, Pd, Ps, Pe, Po sin `,;:`, Sm, Mn, Me, `_`, `/`). Fuente de verdad para
 * reglas.ts y para las corridas de palabras-número.
 */
export const CLASE_SEPARADOR = claseDeRangos(RANGOS_SEPARADOR);
// Selectores de variación (U+FE0E/FE0F) y marcas que encierran (Me, como el
// U+20E3 del emoji de tecla): se quitan para que "1️⃣1️⃣" sea "11" (D6).
const SELECTORES_Y_ME = new RegExp(claseDeRangos(RANGOS_ME, "\\u{fe0e}\\u{fe0f}"), "gu");

// Invisibles que sirven para partir palabras sin que se vea: ZWSP, ZWNJ, ZWJ,
// marcas de dirección, word joiner, BOM y guion blando.
const INVISIBLES = /[­᠎​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;
// Controles C0/C1 salvo salto de línea y tabulación.
const CONTROLES = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;

/** NFC, saltos de línea unificados y bordes recortados: lo que se guarda. */
export function normalizarOriginal(texto: string): string {
  return texto.normalize("NFC").replace(/\r\n?/g, "\n").trim();
}

/**
 * Cualquier dígito decimal Unicode (arábigo-índico ٤, devanagari ४, bengalí…)
 * pasa a ASCII (E1.2, A2). NFKC ya resuelve los de ancho completo y los
 * matemáticos; éstos no tienen descomposición. Los bloques de dígitos de
 * Unicode son de 10 consecutivos empezando en el cero, así que el valor es la
 * distancia al comienzo de la corrida de dígitos módulo 10.
 */
export function digitosAscii(t: string): string {
  return t.replace(/[^\x00-\x7F]/gu, (c) => {
    const cp = c.codePointAt(0)!;
    // v2 (contrato v1, D2): los rangos `Nd` de Unicode 18.0.0 (tablas-unicode.ts),
    // no los del runtime. Cada bloque empieza en su cero.
    for (const [a, b] of RANGOS_ND) if (cp >= a && cp <= b) return String((cp - a) % 10);
    return c;
  });
}

// Marcas combinantes (Mn), que encierran (Me) y selectores de variación pegados
// a un dígito: hacen de separador (S), no desaparecen. Así "1985⃣2026" sigue
// siendo dos años y "1️⃣1️⃣" una corrida "1 1" (contrato v1, S y D6). Las
// categorías son las de Unicode 18.0.0 (tablas), no las del runtime.
const MARCAS_TRAS_DIGITO = new RegExp(`(\\d)(?:${claseDeRangos([...RANGOS_ME, ...RANGOS_CATEGORIA.Mn], "\\u{fe0e}\\u{fe0f}")})+`, "gu");
const MN_18 = new RegExp(claseDeRangos(RANGOS_CATEGORIA.Mn), "gu");

/**
 * v2 (auditoría de bbb8fc7, A5): los espacios se colapsan pero el SALTO DE
 * LÍNEA se conserva (como "\n"), porque el contrato lo usa como fin de
 * oración (§7). Antes se convertía en espacio y H2 unía oraciones separadas.
 */
const colapsar = (t: string) => t.replace(/[^\S\n]+/g, " ").replace(/ ?\n\s*/g, "\n").trim();

const SEPARADOR_SUELTO = new RegExp(CLASE_SEPARADOR, "gu");
const SOLO_SEPARADORES = new RegExp(`^${CLASE_SEPARADOR}+$`, "u");
/**
 * v3 (auditoría de bbb8fc7, A4): un separador S que NFKC expande en varios
 * separadores ("⨌" → "∫∫∫∫") cuenta como UNO, como en el texto original: se
 * reemplaza por el primero de su forma NFKC antes de normalizar el resto.
 */
function nfkc(texto: string): string {
  return texto.replace(SEPARADOR_SUELTO, (c) => {
    const n = c.normalize("NFKC");
    return [...n].length > 1 && SOLO_SEPARADORES.test(n) ? [...n][0] : c;
  }).normalize("NFKC");
}

/** NFKC, dígitos ASCII, minúsculas, sin acentos, sin invisibles ni controles, espacios colapsados (salto de línea conservado). */
export function base(texto: string): string {
  return colapsar(digitosAscii(nfkc(texto))
    .replace(MARCAS_TRAS_DIGITO, "$1 ")
    .replace(INVISIBLES, "")
    .replace(SELECTORES_Y_ME, "")
    .replace(CONTROLES, " ")
    .toLowerCase()
    .normalize("NFD")
    .replace(MN_18, "")
    .normalize("NFC"));
}

/**
 * Como `base` pero CONSERVA las tildes (contrato v1 §0): las formas de voseo
 * sin clítico ("mandá", "pasá por") sólo cuentan con tilde, porque sin ella
 * son tercera persona. Las posiciones coinciden con `base` salvo casos raros.
 */
export function acentuada(texto: string): string {
  return colapsar(digitosAscii(nfkc(texto))
    .replace(MARCAS_TRAS_DIGITO, "$1 ")
    .replace(INVISIBLES, "")
    .replace(SELECTORES_Y_ME, "")
    .replace(CONTROLES, " ")
    .toLowerCase()
    .normalize("NFC"));
}

// ---------------------------------------------------------------- pasada 1

export const PALABRAS_NUMERO: Readonly<Record<string, string>> = {
  cero: "0", uno: "1", un: "1", una: "1", dos: "2", tres: "3", cuatro: "4",
  cinco: "5", seis: "6", siete: "7", ocho: "8", nueve: "9", diez: "10",
  once: "11", doce: "12", trece: "13", catorce: "14", quince: "15",
};

const DECENAS: Readonly<Record<string, number>> = {
  veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
};
const UNIDADES: Readonly<Record<string, number>> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
};
const COMPUESTOS: Readonly<Record<string, number>> = {
  dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24,
  veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
};
// v2 (contrato v1 §6.N): también "diez y seis" a "diez y nueve".
const DIEZ_Y: Readonly<Record<string, number>> = { seis: 16, siete: 17, ocho: 18, nueve: 19 };
const RE_COMPUESTO = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:(${Object.keys(DECENAS).join("|")})(?:\\s+y\\s+(${Object.keys(UNIDADES).join("|")}))?|(${Object.keys(COMPUESTOS).join("|")})|diez\\s+y\\s+(${Object.keys(DIEZ_Y).join("|")}))(?![\\p{L}\\p{N}])`,
  "gu",
);

/**
 * Números de 16 a 99 dichos con palabras ("setenta y dos", "veintitrés",
 * "noventa") pasan a dígitos en cualquier lugar: no hay forma de que esa
 * conversión arme un contacto donde no lo hay, porque el resultado sigue
 * siendo un número de dos cifras (E1.2, A2). Del 0 al 15 se convierten sólo
 * dentro de corridas (`palabrasADigitos`): "un clásico" sigue siendo texto.
 */
export function numerosCompuestos(b: string): string {
  return b.replace(RE_COMPUESTO, (_m, decena?: string, unidad?: string, compuesto?: string, diezY?: string) =>
    String(diezY ? DIEZ_Y[diezY] : compuesto ? COMPUESTOS[compuesto] : DECENAS[decena!] + (unidad ? UNIDADES[unidad] : 0)));
}

/** Corridas con al menos tantas piezas numéricas se convierten. */
export const MIN_PIEZAS_CORRIDA = 3;

// Entre dos piezas de una corrida sólo puede haber separadores, nunca letras.
// v2 (contrato v1): la clase S completa, más `,` `;` `:`.
const SEPARADOR_CORRIDA = new RegExp(`^(?:${CLASE_SEPARADOR}|[\\s,;:])*$`, "u");

/** Palabras-número de una sola cifra, en castellano e inglés (§6.N). */
const CIFRA_PALABRA: Readonly<Record<string, string>> = {
  cero: "0", uno: "1", dos: "2", tres: "3", cuatro: "4", cinco: "5", seis: "6", siete: "7", ocho: "8", nueve: "9",
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9",
};
const RE_PIEZA_PEGADA = new RegExp(`^(?:\\d+|${Object.keys(CIFRA_PALABRA).join("|")})+$`, "u");
const RE_CIFRA_PALABRA = new RegExp(Object.keys(CIFRA_PALABRA).join("|"), "g");

/**
 * v2 (contrato v1, D7/D8): una pieza que mezcla dígitos y palabras de una
 * cifra pegadas ("ocho2cuatro5") pasa a dígitos. Hace falta al menos un
 * dígito y al menos una palabra: "ocho" solo no es una pieza pegada.
 */
export function palabrasPegadas(b: string): string {
  return b.replace(/[\p{L}\p{N}]+/gu, (pieza) => {
    if (!/\d/.test(pieza) || !/\p{L}/u.test(pieza) || !RE_PIEZA_PEGADA.test(pieza)) return pieza;
    return pieza.replace(RE_CIFRA_PALABRA, (w) => CIFRA_PALABRA[w]);
  });
}

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
  // v3 (auditoría de bbb8fc7, A4): "|" es separador (Sm) y también imita al 1.
  // ENTRE dos dígitos manda el separador: "1985|2026" son dos años.
  return b.replace(/(?<=\d)\|(?=\d)/g, " | ").replace(/[\p{L}\p{N}|]+/gu, (pieza) => {
    if (!/\d/.test(pieza)) return pieza;
    if (![...pieza].every((c) => /\d/.test(c) || digitoDe(c) !== undefined)) return pieza;
    return [...pieza].map((c) => (/\d/.test(c) ? c : digitoDe(c)!)).join("");
  });
}

/**
 * v2 (contrato v1, D9 §6.L): la tabla vigente más los confusables de dígito
 * de UTS #39 18.0.0 (`З` → 3); también una letra no ASCII cuyo esqueleto es
 * una letra de la tabla vigente (`о` cirílica → o → 0).
 */
function digitoDe(c: string): string | undefined {
  if (c in LETRA_DIGITO) return LETRA_DIGITO[c];
  if (c in CONFUSABLES_DIGITO) return CONFUSABLES_DIGITO[c];
  const letra = CONFUSABLES_LETRA_UTS39[c];
  return letra !== undefined && letra in LETRA_DIGITO ? LETRA_DIGITO[letra] : undefined;
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
  const esNumerica = (t: string) => /^\d+$/.test(t) || t in PALABRAS_NUMERO || t in PALABRAS_NUMERO_EN;
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
        else if (t in PALABRAS_NUMERO_EN) reemplazos.set(k, PALABRAS_NUMERO_EN[t]);
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

/** La pasada 1 completa, sobre un texto ya en `base`. */
export function pasadaDigitos(b: string): string {
  return palabrasADigitos(letrasADigitos(palabrasPegadas(numerosCompuestos(b))));
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
 * Palabras que no pueden ser la etiqueta de una dirección antes de "punto":
 * artículos, preposiciones y nexos. "las punto com", "en el punto de vista",
 * "a punto de". Lista cerrada de palabras gramaticales, no de temas.
 */
const NO_ETIQUETA: ReadonlySet<string> = new Set([
  "el", "la", "los", "las", "lo", "un", "una", "unos", "unas", "al", "del", "de",
  "en", "a", "y", "o", "u", "e", "que", "su", "sus", "mi", "mis", "tu", "tus",
  "este", "esta", "estos", "estas", "ese", "esa", "esos", "esas", "aquel",
  "aquella", "con", "sin", "por", "para", "como", "cada", "otro", "otra", "buen",
  "mal", "gran", "ultimo", "primer", "mismo", "misma", "era", "es", "fue", "muy",
]);

/**
 * Resuelve las formas ofuscadas de "." y "@" y une letras sueltas:
 * "pelis punto com", "bit(.)ly", "juan arroba gmail", "(at)", "[dot]",
 * "j u a n @ g m a i l . c o m", "cine-oscuro . blogspot . com".
 * "final. Me encantó" NO se une: el punto pegado a la palabra anterior y un
 * espacio después es puntuación, no un dominio.
 *
 * "punto" suelto (sin corchetes) se convierte sólo si la palabra anterior
 * puede ser parte de una dirección (E1.2, A3): "pelisplus punto com" sí, "la
 * burbuja de las punto com" no ("las" es un artículo, no un nombre de sitio).
 * Las formas entre corchetes ("[punto]", "(.)") se convierten siempre.
 */
export function resolverSeparadores(b: string): string {
  let t = b
    // v2 (contrato v1, P): puntos ideográficos pegados entre alfanuméricos.
    .replace(/(?<=[\p{L}\p{N}])[。｡](?=[\p{L}\p{N}])/gu, ".")
    // v2: guiones pegados a una forma entre corchetes ("-[punto]-").
    .replace(/-?[([{]\s*(?:\.|punto|dot)\s*[)\]}]-?/g, ".")
    .replace(/[([{]\s*(?:@|arroba|at)\s*[)\]}]/g, "@")
    .replace(/\barroba\b/g, "@")
    .replace(/([\p{L}\p{N}_.\-]+) (?:punto|dot) (?=[\p{L}\p{N}])/gu, (m, previa: string) =>
      NO_ETIQUETA.has(previa) ? m : `${previa}.`);
  t = unirLetrasSueltas(t);
  // Espacio a ambos lados de "." o "@" entre dos piezas: es una dirección partida.
  t = t.replace(/([\p{L}\p{N}_-]) +([.@]) +(?=[\p{L}\p{N}])/gu, "$1$2");
  t = t.replace(/([\p{L}\p{N}_-]) +@(?=[\p{L}\p{N}])/gu, "$1@");
  t = t.replace(/([\p{L}\p{N}_-])@ +(?=[\p{L}\p{N}])/gu, "$1@");
  // v2 (contrato v1, A): "@ usuario" con un espacio es un usuario.
  t = t.replace(/(^|[^\p{L}\p{N}._%+\-])@ (?=[\p{L}\p{N}])/gu, "$1@");
  return t;
}

/** Corridas de 3 o más piezas de un solo carácter separadas por espacios: "w w w . p e l i s". */
function unirLetrasSueltas(t: string): string {
  // E1.2: la última letra puede ir seguida de puntuación ("… b u s c a r,").
  return t.replace(/(?:^|(?<= ))(?:[\p{L}\p{N}.@] ){2,}[\p{L}\p{N}.@](?=$| |[,;:!?)\]])/gu, (m) => m.replace(/ /g, ""));
}

/**
 * v2 (contrato v1, C): la tabla vigente y, para las letras que no están ahí,
 * el esqueleto UTS #39 18.0.0 de las letras NO ASCII. Las ASCII no se tocan
 * (UTS #39 tiene `m` → `rn`).
 */
export function premapeo(texto: string): string {
  return [...nfkc(texto)].map((c) => (c.charCodeAt(0) >= 0x80 && !/\p{M}/u.test(c) ? CONFUSABLES_LETRA_UTS39[c] ?? c : c)).join("");
}

export function mapearConfusables(t: string): string {
  return [...t].map((c) => CONFUSABLES_LETRA[c] ?? (c.charCodeAt(0) >= 0x80 ? CONFUSABLES_LETRA_UTS39[c] : undefined) ?? c).join("");
}

/** Las cuatro copias que miran las reglas. Lanza si el texto no es un string. */
export function plegar(texto: string): Plegado {
  if (typeof texto !== "string") throw new TypeError("plegar: el texto no es un string");
  const original = normalizarOriginal(texto);
  const b = base(original);
  return {
    original,
    base: b,
    acentuada: acentuada(original),
    digitos: pasadaDigitos(b),
    // v3 (auditoría de bbb8fc7, A4): los confusables de letra de UTS #39 se
    // aplican ANTES de pasar a minúsculas (la mayúscula Η es "H", pero su
    // minúscula η es "n"). Después, la tabla vigente sobre `base`.
    letras: mapearConfusables(resolverSeparadores(base(premapeo(original)))),
  };
}
