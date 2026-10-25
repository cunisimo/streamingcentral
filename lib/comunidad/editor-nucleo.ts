// La lógica del editor de reseñas (E3a). PURO: sin React ni fetch, para
// probarlo con `node --test`. El componente (components/comunidad/
// EditorResena.tsx) sólo dibuja lo que esto decide.
//
//   - contador: la MISMA cuenta que el servidor y la base (lib/comunidad/
//     texto.ts: normalizado y en puntos de código);
//   - aviso de reinicio de votos: sólo al editar un texto ya persistido y
//     cambiarlo;
//   - id_intento: un reintento del MISMO envío (misma acción, mismos ids,
//     mismo texto normalizado) reusa el id, así un reintento tras una
//     respuesta perdida no duplica ni reinicia votos dos veces; un envío
//     distinto lleva un id nuevo;
//   - generaciones: una respuesta de otra cuenta o de una carga vieja se
//     descarta.
import { LARGO_MAX, LARGO_MIN, largoTexto, mensajeFormato, normalizarTexto, problemaFormato } from "./texto.ts";

export interface Persistida {
  resenaId: number;
  versionId: number;
  texto: string;
  estado: string;
}

export interface Contador {
  largo: number;
  /** `caracteres`: el texto tiene algo que la base no guarda (ver texto.ts). */
  estado: "corto" | "ok" | "largo" | "caracteres";
  /** Lo que se muestra y se anuncia. */
  texto: string;
  /** El problema que la ruta rechazaría, dicho antes de enviar; null si no hay. */
  aviso: string | null;
}

export function contador(texto: string): Contador {
  const t = normalizarTexto(texto);
  const largo = largoTexto(t);
  const p = problemaFormato(t);
  // Los caracteres primero: con ellos el texto no se guarda aunque el largo
  // esté bien (p. ej. el emoji de familia, que lleva U+200D, prohibido por el
  // CHECK de 011). Es la misma decisión que toma la ruta.
  if (p?.tipo === "caracteres") return { largo, estado: "caracteres", texto: `${largo} / ${LARGO_MAX}`, aviso: mensajeFormato(p) };
  const estado = largo < LARGO_MIN ? "corto" : largo > LARGO_MAX ? "largo" : "ok";
  const detalle = estado === "corto" ? ` (faltan ${LARGO_MIN - largo})` : estado === "largo" ? ` (sobran ${largo - LARGO_MAX})` : "";
  return { largo, estado, texto: `${largo} / ${LARGO_MAX}${detalle}`, aviso: null };
}

/** ¿Hay que avisar que se reinician los votos? Sólo si cambia un texto persistido. */
export function avisoReinicio(persistida: Persistida | null, texto: string): boolean {
  return persistida !== null && normalizarTexto(texto) !== persistida.texto;
}

export type Titulo = { tipo: "movie" | "tv"; tmdbId: number };

/** La firma de un envío: si es igual, es el mismo envío (y lleva el mismo id). */
export function firmaEnvio(persistida: Persistida | null, titulo: Titulo, texto: string): string {
  const t = normalizarTexto(texto);
  return persistida
    ? JSON.stringify(["editar", persistida.resenaId, persistida.versionId, t])
    : JSON.stringify(["publicar", titulo.tipo, titulo.tmdbId, t]);
}

export interface Intento { id: string; firma: string }

/** El intento para este envío: el mismo id si la firma no cambió. */
export function intentoPara(previo: Intento | null, firma: string, nuevoId: () => string): Intento {
  return previo && previo.firma === firma ? previo : { id: nuevoId(), firma };
}

/**
 * ¿Se conserva el intento después de esta respuesta? Mientras no haya una
 * versión nueva confirmada, sí: reintentar el mismo envío devuelve el mismo
 * resultado sin duplicar. Con una versión nueva (publicada o retenida) el
 * próximo envío ya es otro.
 */
export function conservarIntento(r: { resultado?: unknown } | "sin-confirmar"): boolean {
  if (r === "sin-confirmar") return true;
  return r.resultado !== "publicada" && r.resultado !== "retenida";
}

/** ¿Se puede enviar? Texto válido en largo y no idéntico al persistido. */
export function puedeEnviar(persistida: Persistida | null, texto: string, enviando: boolean): boolean {
  if (enviando) return false;
  if (contador(texto).estado !== "ok") return false;
  return persistida === null || normalizarTexto(texto) !== persistida.texto;
}

/** Una respuesta sólo vale para la generación y la cuenta que la pidieron. */
export function respuestaVigente(actual: { gen: number; uid: string | null }, de: { gen: number; uid: string | null }): boolean {
  return actual.gen === de.gen && actual.uid !== null && actual.uid === de.uid;
}

/** Cómo se presenta el estado de la propia reseña. */
export function etiquetaEstado(estado: string): string {
  if (estado === "publicada") return "Publicada";
  if (estado === "retenida" || estado === "revision_solicitada") return "En revisión";
  if (estado === "oculta") return "Oculta por moderación";
  return "No visible";
}
