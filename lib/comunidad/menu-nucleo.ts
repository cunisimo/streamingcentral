// El menú de una reseña ajena: denunciar y bloquear (E3b; revisión §3.3.2 y
// §3.3.4). PURO y apto para el cliente: lo usan MenuResena, la página de
// bloqueados, la ruta y las pruebas.
//
// Regla de oro, la misma que mensajes.ts: ningún texto afirma lo que no se
// confirmó, y una denuncia NUNCA se presenta como atendida. Recibirla no
// oculta la reseña para los demás: la revisa una persona. Si la cola no
// puede recibir más, se dice así y se ofrece bloquear, que siempre funciona.

export const CATEGORIAS = [
  { id: "phishing_estafa", etiqueta: "Estafa o phishing" },
  { id: "spam", etiqueta: "Spam o publicidad" },
  { id: "acoso_amenazas", etiqueta: "Acoso o amenazas" },
  { id: "odio", etiqueta: "Discurso de odio" },
  { id: "datos_personales", etiqueta: "Datos personales de alguien" },
  { id: "sexual_explotacion", etiqueta: "Contenido sexual prohibido o explotación" },
  { id: "otro", etiqueta: "Otro motivo" },
] as const;

export type Categoria = (typeof CATEGORIAS)[number]["id"];
export const esCategoria = (x: unknown): x is Categoria => CATEGORIAS.some((c) => c.id === x);

export const COMENTARIO_MAX = 300;

/** El comentario opcional, como lo guarda la base: NFC, sin bordes, ≤ 300. */
export function comentarioDenuncia(texto: unknown): { ok: true; valor: string | null } | { ok: false; aviso: string } {
  if (texto === undefined || texto === null) return { ok: true, valor: null };
  if (typeof texto !== "string") return { ok: false, aviso: "El comentario no es válido." };
  // Los controles (salvo el salto de línea) se vuelven espacio; el texto no se publica nunca.
  const t = texto.normalize("NFC").replace(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g, " ").replace(/[ \t]+/g, " ").trim();
  if (!t) return { ok: true, valor: null };
  const largo = [...t].length;
  if (largo > COMENTARIO_MAX) return { ok: false, aviso: `El comentario puede tener hasta ${COMENTARIO_MAX} caracteres (tiene ${largo}).` };
  return { ok: true, valor: t };
}

export type Tono = "exito" | "info" | "rechazo" | "error" | "sin_confirmar";
type Respuesta = { resultado?: unknown; motivo?: unknown; repetido?: unknown } | "sin-confirmar";

export const DENUNCIA_RECIBIDA = "Recibimos tu denuncia. La va a revisar una persona; mientras tanto, la reseña sigue visible para los demás.";
export const DENUNCIA_REPETIDA = "Ya habías denunciado esta reseña. La va a revisar una persona.";
export const DENUNCIA_COLA_LLENA = "No podemos recibir más denuncias ahora. Probá más tarde; si no querés ver más a este autor, podés bloquearlo.";
export const DENUNCIA_SIN_CONFIRMAR = "No sabemos si se recibió tu denuncia. Reintentá: si ya había llegado, no se duplica.";
export const DENUNCIA_ERROR = "No se pudo enviar la denuncia, probá de nuevo.";
export const BLOQUEO_HECHO = "Bloqueaste al autor: ya no vas a ver sus reseñas. Podés desbloquearlo desde tu cuenta.";
export const BLOQUEO_SIN_CONFIRMAR = "No sabemos si se guardó el bloqueo. Reintentá: no se duplica.";
export const BLOQUEO_ERROR = "No se pudo bloquear, probá de nuevo.";
export const DESBLOQUEO_HECHO = "Desbloqueaste a este usuario: vas a volver a ver sus reseñas.";

const DENUNCIA_MOTIVOS: Readonly<Record<string, string>> = {
  cola_denuncias_llena: DENUNCIA_COLA_LLENA,
  correo_pendiente: "Confirmá tu correo para denunciar. Igual podés bloquear al autor.",
  limite_diario: "Llegaste al límite de denuncias de hoy. Si no querés ver más a este autor, podés bloquearlo.",
  propia: "No podés denunciar tu propia reseña.",
  version_no_disponible: "Esa reseña ya no está disponible.",
  modulo_apagado: "Las reseñas de la comunidad no están disponibles.",
};

export function mensajeDenuncia(r: Respuesta): { tono: Tono; texto: string } {
  if (r === "sin-confirmar") return { tono: "sin_confirmar", texto: DENUNCIA_SIN_CONFIRMAR };
  switch (r.resultado) {
    case "denuncia_registrada": return { tono: "exito", texto: r.repetido ? DENUNCIA_REPETIDA : DENUNCIA_RECIBIDA };
    case "rechazo_cuenta": return { tono: "rechazo", texto: DENUNCIA_MOTIVOS[String(r.motivo)] ?? DENUNCIA_ERROR };
    case "baja_en_curso": return { tono: "rechazo", texto: "Tu cuenta tiene una eliminación pendiente: no se aceptan acciones de la comunidad." };
    case "invalido": return { tono: "rechazo", texto: "Elegí un motivo para la denuncia." };
    case "sin_sesion": return { tono: "rechazo", texto: "Iniciá sesión para denunciar." };
    case "error": return { tono: "error", texto: DENUNCIA_ERROR };
    case "sin_confirmar":
    default: return { tono: "sin_confirmar", texto: DENUNCIA_SIN_CONFIRMAR };
  }
}

export function mensajeBloqueo(r: Respuesta): { tono: Tono; texto: string } {
  if (r === "sin-confirmar") return { tono: "sin_confirmar", texto: BLOQUEO_SIN_CONFIRMAR };
  switch (r.resultado) {
    case "bloqueado": return { tono: "exito", texto: BLOQUEO_HECHO };
    case "desbloqueado": return { tono: "exito", texto: DESBLOQUEO_HECHO };
    case "sin_efecto": return { tono: "info", texto: "Ese bloqueo ya no estaba." };
    case "rechazo_cuenta":
      if (r.motivo === "propio") return { tono: "rechazo", texto: "No podés bloquearte." };
      if (r.motivo === "limite_diario") return { tono: "rechazo", texto: "Llegaste al límite de bloqueos de hoy. Probá mañana." };
      if (r.motivo === "version_no_disponible") return { tono: "rechazo", texto: "Esa reseña ya no está disponible." };
      return { tono: "error", texto: BLOQUEO_ERROR };
    case "baja_en_curso": return { tono: "rechazo", texto: "Tu cuenta tiene una eliminación pendiente: no se aceptan acciones de la comunidad." };
    case "sin_sesion": return { tono: "rechazo", texto: "Iniciá sesión para bloquear." };
    case "error": return { tono: "error", texto: BLOQUEO_ERROR };
    case "sin_confirmar":
    default: return { tono: "sin_confirmar", texto: BLOQUEO_SIN_CONFIRMAR };
  }
}

/** ¿Se ofrece reintentar? Sólo cuando no se sabe o no se pudo (nunca tras un rechazo). */
export const ofreceReintento = (t: Tono) => t === "sin_confirmar" || t === "error";

// El diálogo de denuncia con "Bloquear también al autor" (corrección A2). La
// denuncia y el bloqueo son dos resultados independientes: la base guarda la
// denuncia primero y bloquea después. Cuando la denuncia ya tiene resultado
// definitivo (recibida, o rechazada habiendo pedido bloquear) el formulario se
// cierra y lo único que puede quedar pendiente es el BLOQUEO:
//   - `incierto` (no se sabe si se guardó) o `fallido` (la base respondió que
//     no se pudo): se ofrece reintentar SÓLO el bloqueo, contra la ruta de
//     bloqueos. Es idempotente y no reenvía la denuncia, así que no cuenta
//     otra vez en el excedente.
//   - un rechazo (límite diario, eliminación pendiente…) es definitivo: no se
//     ofrece reintento.
// Si la DENUNCIA es la incierta, el formulario sigue abierto y "Reintentar"
// reenvía el pedido completo (la denuncia repetida vuelve como `repetido`).
export type BloqueoPendiente = "incierto" | "fallido" | null;
export interface EstadoDenuncia {
  msg: { tono: Tono; texto: string } | null;
  msgBloqueo: { tono: Tono; texto: string } | null;
  denunciada: boolean;
  bloqueado: boolean;
  /** El formulario de la denuncia ya no se ofrece. */
  cerrada: boolean;
  bloqueoPendiente: BloqueoPendiente;
}

export const ESTADO_DENUNCIA_INICIAL: EstadoDenuncia = {
  msg: null, msgBloqueo: null, denunciada: false, bloqueado: false, cerrada: false, bloqueoPendiente: null,
};

function pendiente(m: { tono: Tono }, bloqueado: boolean): BloqueoPendiente {
  if (bloqueado) return null;
  return m.tono === "sin_confirmar" ? "incierto" : m.tono === "error" ? "fallido" : null;
}

/** El estado tras la respuesta de la ruta de denuncias. */
export function trasDenuncia(r: Respuesta & { bloqueo?: unknown }, pidioBloqueo: boolean): EstadoDenuncia {
  const msg = mensajeDenuncia(r);
  const b = pidioBloqueo && r !== "sin-confirmar" && r.bloqueo && typeof r.bloqueo === "object" ? (r.bloqueo as Respuesta) : null;
  const msgBloqueo = b ? mensajeBloqueo(b) : null;
  const denunciada = r !== "sin-confirmar" && r.resultado === "denuncia_registrada";
  const bloqueado = msgBloqueo?.tono === "exito";
  const cerrada = denunciada || bloqueado || (pidioBloqueo && msg.tono === "rechazo" && msgBloqueo !== null);
  return { msg, msgBloqueo, denunciada, bloqueado, cerrada, bloqueoPendiente: cerrada && msgBloqueo ? pendiente(msgBloqueo, bloqueado) : null };
}

/** El estado tras reintentar SÓLO el bloqueo pendiente: la denuncia no cambia. */
export function trasReintentoBloqueo(e: EstadoDenuncia, r: Respuesta): EstadoDenuncia {
  const msgBloqueo = mensajeBloqueo(r);
  const bloqueado = msgBloqueo.tono === "exito";
  return { ...e, msgBloqueo, bloqueado, bloqueoPendiente: pendiente(msgBloqueo, bloqueado) };
}

export const REINTENTAR_BLOQUEO = "Reintentar el bloqueo";

/** La etiqueta de un bloqueo en la cuenta: no hay nombres comunitarios hasta E6. */
export function etiquetaBloqueo(b: { origen_tipo?: unknown; creado_en?: unknown }, titulo?: string | null): string {
  // Con la hora: dos bloqueos del mismo título y el mismo día se distinguen.
  const d = typeof b.creado_en === "string" ? new Date(b.creado_en) : null;
  const zona = { timeZone: "America/Argentina/Buenos_Aires" } as const;
  const fecha = d && !Number.isNaN(d.getTime())
    ? `${d.toLocaleDateString("es-AR", { ...zona, day: "numeric", month: "numeric", year: "numeric" })} a las ${d.toLocaleTimeString("es-AR", { ...zona, hour: "2-digit", minute: "2-digit", hour12: false })}`
    : null;
  const desde = titulo ? `desde una reseña de «${titulo}»` : b.origen_tipo === "tv" ? "desde una reseña de una serie" : "desde una reseña de una película";
  return `Usuario bloqueado ${desde}${fecha ? ` el ${fecha}` : ""}`;
}
