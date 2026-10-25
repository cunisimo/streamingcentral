// Los textos de cada resultado de las escrituras comunitarias (E3a). PURO y
// apto para el cliente: los usan el editor, la evaluación y las pruebas.
//
// Regla de oro: ningún texto afirma un resultado que no se confirmó. Si la
// respuesta se perdió (red caída, respuesta ilegible), el mensaje dice que no
// se sabe y que reintentar no duplica (el reintento lleva el mismo
// id_intento). "No se pudo guardar" se usa SÓLO cuando el servidor confirmó
// que no se guardó nada.
//
// El texto de retención es el de las reglas de E1 (`MOTIVO_RETENCION_RESENA`),
// copiado para no arrastrar las reglas al navegador; un test fija que sea igual.
export const MENSAJE_PUBLICADA = "Tu reseña está publicada.";
export const MENSAJE_RETENIDA = "Tu reseña quedó en revisión. Te vamos a avisar cuando se resuelva.";
export const MENSAJE_SIN_CAMBIOS = "No hay cambios para guardar.";
export const MENSAJE_ERROR = "No se pudo guardar, probá de nuevo.";
export const MENSAJE_SIN_CONFIRMAR = "No sabemos si se guardó. Reintentá: si ya se había guardado, no se duplica.";
export const MENSAJE_CONFLICTO_VERSION = "Tu reseña cambió en otro dispositivo. Recargá para ver la última versión antes de editar.";
export const MENSAJE_CONFLICTO_INTENTO = "No pudimos guardar este envío. Recargá y probá de nuevo.";
// A2: lo que pasó en otra sesión mientras se editaba. El borrador se conserva.
export const REMOTO_MODIFICADA = "Tu reseña cambió en otro dispositivo mientras la editabas. Tu borrador sigue acá: elegí qué hacer. Si guardás sin elegir, no se pisa la otra versión.";
export const REMOTO_PUBLICADA = "Publicaste una reseña de este título desde otro dispositivo. Tu borrador sigue acá: elegí qué hacer.";
export const MENSAJE_CONFLICTO_BORRADOR = "No se guardó: tu reseña cambió en otro dispositivo. Tu borrador sigue acá; elegí qué hacer en el aviso.";
export const REMOTO_BORRADA = "Tu reseña se borró desde otro dispositivo. Tu borrador sigue acá: elegí qué hacer.";
export const AVISO_REINICIO ="Al editar tu reseña se reinician los votos de utilidad.";

export const MOTIVOS_CUENTA: Readonly<Record<string, string>> = {
  modulo_apagado: "Las reseñas de la comunidad no están disponibles.",
  publicacion_pausada: "La publicación está pausada por ahora. Igual podés borrar tus reseñas y retirar tus votos.",
  suspendida: "Tu cuenta tiene una suspensión vigente: no podés publicar ni evaluar. Podés borrar tus reseñas y retirar tus votos.",
  correo_pendiente: "Confirmá tu correo para publicar y evaluar.",
  terminos_pendientes: "Aceptá los términos de la comunidad para publicar y evaluar.",
  terminos_desactualizados: "Los términos cambiaron. Recargá para leer la versión vigente.",
  limite_diario: "Llegaste al límite de hoy para esta acción. Probá mañana.",
  resena_existente: "Ya tenés una reseña de este título: podés editarla.",
  no_encontrada: "No encontramos esa reseña.",
  propia: "No podés evaluar tu propia reseña.",
  version_no_disponible: "Esa reseña ya no está disponible.",
  baja_en_curso: "Tu cuenta tiene una eliminación pendiente: no se aceptan acciones de la comunidad.",
};

export type Tono = "exito" | "info" | "rechazo" | "error" | "sin_confirmar";

/** Texto y tono de la respuesta de una escritura de reseña. */
export function mensajeEscritura(r: { resultado?: unknown; motivo?: unknown; mensaje?: unknown } | "sin-confirmar"): { tono: Tono; texto: string } {
  if (r === "sin-confirmar") return { tono: "sin_confirmar", texto: MENSAJE_SIN_CONFIRMAR };
  switch (r.resultado) {
    case "publicada": return { tono: "exito", texto: MENSAJE_PUBLICADA };
    case "retenida": return { tono: "info", texto: MENSAJE_RETENIDA };
    case "sin_cambios": return { tono: "info", texto: MENSAJE_SIN_CAMBIOS };
    case "rechazo_formato":
    case "rechazo_contenido":
      return { tono: "rechazo", texto: typeof r.mensaje === "string" && r.mensaje ? r.mensaje : MENSAJE_ERROR };
    case "conflicto":
      return { tono: "rechazo", texto: r.motivo === "version" ? MENSAJE_CONFLICTO_VERSION : MENSAJE_CONFLICTO_INTENTO };
    case "rechazo_cuenta":
      return { tono: "rechazo", texto: MOTIVOS_CUENTA[String(r.motivo)] ?? MENSAJE_ERROR };
    case "baja_en_curso":
      return { tono: "rechazo", texto: MOTIVOS_CUENTA.baja_en_curso };
    case "borrada": return { tono: "exito", texto: "Borraste tu reseña." };
    case "error": return { tono: "error", texto: MENSAJE_ERROR };
    case "sin_confirmar":
    default: return { tono: "sin_confirmar", texto: MENSAJE_SIN_CONFIRMAR };
  }
}
