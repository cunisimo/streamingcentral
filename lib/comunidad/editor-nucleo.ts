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
  return !guardoVersion(r.resultado);
}

/** ¿La respuesta confirma una versión nueva? (E3b suma la revisión pedida.) */
export const guardoVersion = (resultado: unknown) =>
  resultado === "publicada" || resultado === "retenida" || resultado === "revision_solicitada";

/**
 * "Pedir revisión" (E3b, §3.3.3) se ofrece SÓLO tras un rechazo por regla de
 * contenido: los de formato o de cuenta se corrigen sin caso.
 */
export const ofreceRevision = (r: { resultado?: unknown } | "sin-confirmar" | null) =>
  r !== null && r !== "sin-confirmar" && r.resultado === "rechazo_contenido";

/** La firma del pedido de revisión: otra que la del envío normal, así lleva su propio id. */
export const firmaRevision = (persistida: Persistida | null, titulo: Titulo, texto: string) =>
  `${firmaEnvio(persistida, titulo, texto)}|revision`;

/** ¿Se puede enviar? Texto válido en largo y no idéntico al persistido. */
export function puedeEnviar(persistida: Persistida | null, texto: string, enviando: boolean): boolean {
  if (enviando) return false;
  if (contador(texto).estado !== "ok") return false;
  return persistida === null || normalizarTexto(texto) !== persistida.texto;
}

// ============================================================================
// Estado del editor ante versiones que llegan de afuera (auditoría E3a, A2)
// ============================================================================
//
// `base` es la versión DESDE LA QUE se edita: de ahí salen la versión
// esperada, la firma del intento y el aviso de reinicio. Mientras se edita,
// una versión persistida distinta (otra sesión de la misma cuenta la cambió o
// la borró, y una recarga la trajo) NO pisa el borrador ni cambia la base en
// silencio: queda un aviso con decisiones explícitas. Sin decidir, el envío
// sigue saliendo contra la base original y la base devuelve el conflicto.
// La escritura propia confirmada sí actualiza el editor.
//
// Cambiar de cuenta o de título no pasa por acá: el componente se monta de
// nuevo (`claveEditor`), sin borrador ni intento del anterior.

export type AvisoRemoto = { tipo: "modificada"; version: Persistida } | { tipo: "borrada" };

export interface EstadoEditor {
  base: Persistida | null;
  texto: string;
  editando: boolean;
  remoto: AvisoRemoto | null;
}

/** Tomar la versión persistida tal cual: sin borrador ni aviso. */
export function adoptar(mia: Persistida | null): EstadoEditor {
  return { base: mia, texto: mia?.texto ?? "", editando: mia === null, remoto: null };
}

/** ¿Hay texto sin guardar respecto de la base? */
export function hayBorrador(e: EstadoEditor): boolean {
  return e.editando && normalizarTexto(e.texto) !== (e.base?.texto ?? "");
}

/** Abrir la edición de la versión que se está viendo. */
export function empezarEdicion(mia: Persistida): EstadoEditor {
  return { base: mia, texto: mia.texto, editando: true, remoto: null };
}

/** Llegó otra versión persistida (recarga, otra sesión, guardado propio). */
export function alCambiarPersistida(e: EstadoEditor, mia: Persistida | null): EstadoEditor {
  if (!e.editando) return adoptar(mia);
  if ((e.base?.versionId ?? null) === (mia?.versionId ?? null)) return e.remoto ? { ...e, remoto: null } : e;
  // Sin nada escrito no hay qué conservar: se muestra la versión vigente. Y
  // si la que llegó ES el borrador (el propio envío, con la respuesta perdida
  // o adelantada por otra recarga), tampoco se pierde nada.
  if (!hayBorrador(e) || (mia && normalizarTexto(e.texto) === mia.texto)) return adoptar(mia);
  return { ...e, remoto: mia ? { tipo: "modificada", version: mia } : { tipo: "borrada" } };
}

/** Decisión: descartar el borrador y ver la versión vigente. */
export const cargarRemota = (mia: Persistida | null): EstadoEditor => adoptar(mia);

/** Decisión: seguir con el borrador SOBRE la versión nueva (pasa a ser la base). */
export function mantenerBorrador(e: EstadoEditor): EstadoEditor {
  if (e.remoto?.tipo !== "modificada") return e;
  return { ...e, base: e.remoto.version, remoto: null };
}

/** Decisión tras un borrado remoto: publicar el borrador como reseña nueva. */
export function publicarComoNueva(e: EstadoEditor): EstadoEditor {
  if (e.remoto?.tipo !== "borrada") return e;
  return { ...e, base: null, remoto: null };
}

/**
 * La escritura propia se confirmó (publicada o retenida). Si la recarga ya
 * trajo esa versión, se toma; si no, se cierra la edición y la recarga que
 * sigue la trae (sin edición abierta, cualquier versión se adopta).
 */
export function trasGuardado(e: EstadoEditor, versionId: unknown, mia: Persistida | null): EstadoEditor {
  if (mia && mia.versionId === versionId) return adoptar(mia);
  return { ...e, editando: false, remoto: null };
}

/**
 * Lo que se envía. La versión esperada es la BASE de la edición, nunca la
 * última recibida: si otra sesión la cambió, la base de datos responde el
 * conflicto en vez de pisarla.
 */
export function cuerpoEnvio(e: EstadoEditor, titulo: Titulo, idIntento: string): Record<string, unknown> {
  return e.base
    ? { accion: "editar", resena_id: e.base.resenaId, version_esperada: e.base.versionId, texto: e.texto, id_intento: idIntento }
    : { accion: "publicar", tipo: titulo.tipo, tmdb_id: titulo.tmdbId, texto: e.texto, id_intento: idIntento };
}

/** El pedido de revisión: el mismo texto, y en una edición la confirmación de que la publicada deja de verse. */
export function cuerpoRevision(e: EstadoEditor, titulo: Titulo, idIntento: string, confirmarOculta: boolean): Record<string, unknown> {
  return e.base ? { ...cuerpoEnvio(e, titulo, idIntento), confirmar_oculta: confirmarOculta } : cuerpoEnvio(e, titulo, idIntento);
}

/** El editor es otro para otra cuenta u otro título: nada se traslada. */
export function claveEditor(uid: string, titulo: Titulo): string {
  return `${uid}:${titulo.tipo}:${titulo.tmdbId}`;
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
  // E4: el autor se entera del rechazo en la app; puede corregirla o borrarla.
  if (estado === "rechazada") return "Rechazada por moderación";
  return "No visible";
}
