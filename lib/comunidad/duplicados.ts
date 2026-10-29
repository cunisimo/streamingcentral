// Huella de duplicados de una reseña (E3b; revisión §3.3.1). Corre en el
// SERVIDOR: el secreto nunca sale de acá y la base sólo recibe hashes.
//
//   - texto: HMAC-SHA256 del texto plegado (el `base` de las reglas de E1:
//     NFKC, minúsculas, sin acentos ni invisibles), palabra por palabra;
//   - shingles: HMAC de cada grupo de 3 palabras seguidas, recortado a 64
//     bits (16 hex), sin repetir. Recortar no deja revertirlos y alcanza
//     para comparar conjuntos de ≤ 600 elementos.
// Con la clave, un diccionario de frases comunes no revierte los shingles
// (con un hash sin clave, sí). Siguen siendo datos SEUDÓNIMOS derivados del
// texto, no anónimos. Rotar la clave invalida las comparaciones viejas; se
// acepta (diseño).
//
// El secreto viene de COMUNIDAD_HMAC_DUPLICADOS, una variable de servidor
// DEDICADA. El valor local es de prueba, empieza con `local-prueba-` y vive
// sólo en `.env.comunidad-local` (ignorado por Git); en un build de
// producción ese prefijo se rechaza (Producción tendrá el suyo en E9a). Sin
// secreto válido no hay huella y la escritura responde "error": una regla que
// no puede correr nunca aprueba.
//
// Las comparaciones (hash igual, Jaccard ≥ 0,8, cuentas distintas) las hace
// la base, con los locks del protocolo (015, `comunidad.duplicado`).
// `jaccard` está acá sólo para las pruebas.
import { createHmac } from "node:crypto";
import { base, normalizarOriginal } from "./reglas/plegado.ts";

export const PREFIJO_SECRETO_LOCAL = "local-prueba-";
export const LARGO_MIN_SECRETO = 32;

export interface Huella {
  texto: string;
  shingles: string[];
}

/** El secreto, o null si falta, es corto o es el de prueba en producción. */
export function secretoDuplicados(env: Record<string, string | undefined> = process.env): string | null {
  const s = env.COMUNIDAD_HMAC_DUPLICADOS;
  if (!s || s.length < LARGO_MIN_SECRETO) return null;
  if (env.NODE_ENV === "production" && s.startsWith(PREFIJO_SECRETO_LOCAL)) return null;
  return s;
}

/** Las palabras del texto plegado (letras y números; lo demás separa). */
export function palabras(texto: string): string[] {
  return base(normalizarOriginal(texto)).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

const hmac = (secreto: string, s: string) => createHmac("sha256", secreto).update(s, "utf8").digest("hex");

export function huella(texto: string, secreto: string): Huella {
  if (!secreto || secreto.length < LARGO_MIN_SECRETO) throw new Error("huella: sin secreto");
  const p = palabras(texto);
  const grupos = p.length >= 3 ? p.slice(0, -2).map((_, i) => p.slice(i, i + 3).join(" ")) : [p.join(" ")];
  return {
    texto: hmac(secreto, `t:${p.join(" ")}`),
    shingles: [...new Set(grupos.map((g) => hmac(secreto, `s:${g}`).slice(0, 16)))],
  };
}

/** |A ∩ B| / |A ∪ B| (la misma cuenta que hace la base). */
export function jaccard(a: readonly string[], b: readonly string[]): number {
  const A = new Set(a), B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}
