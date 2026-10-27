// El nombre comunitario tal como se guarda, y los textos de cada resultado
// (E6). PURO y apto para el cliente: lo usan el campo de la cuenta (aviso
// previo), la ruta (validación antes de las reglas) y las pruebas.
//
//   - Normalización: NFC, bordes recortados y cada tramo de espacios en uno
//     solo. La regla de formato de E1 cuenta el largo con los espacios ya
//     colapsados; guardar el mismo texto que se midió evita que pase las
//     reglas y falle el CHECK de 011.
//   - Caracteres no permitidos: los del CHECK `participantes_nombre_forma` de
//     011 (todo control, salto de línea incluido, e invisibles o de
//     dirección). Las reglas de E1 dejan pasar algunos invisibles.
//   - Largo: 2–24 puntos de código (`char_length`).
//
// 🔴 El aviso del cliente NO decide nada: la ruta corre las reglas de E1 y la
// base sólo acepta lo que la ruta le pasa (función de service_role) y lo que
// cumple su CHECK. `profiles.display_name` no participa.
export const NOMBRE_MIN = 2;
export const NOMBRE_MAX = 24;

const NO_PERMITIDOS = /[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁠-⁩﻿]/u;

export function normalizarNombre(nombre: string): string {
  return nombre.normalize("NFC").trim().replace(/\s+/gu, " ");
}

export function largoNombre(normalizado: string): number {
  let n = 0;
  for (const _ of normalizado) n++;
  return n;
}

/** Lo que impediría guardar el nombre ya normalizado, o null. */
export function problemaNombre(normalizado: string): string | null {
  if (NO_PERMITIDOS.test(normalizado)) return "Sacá los caracteres invisibles, de control o de dirección del nombre.";
  const n = largoNombre(normalizado);
  if (n < NOMBRE_MIN || n > NOMBRE_MAX) return `El nombre tiene que tener entre ${NOMBRE_MIN} y ${NOMBRE_MAX} caracteres.`;
  return null;
}

export const MENSAJE_NOMBRE_NO_ADMITIDO = "Ese nombre no se puede usar en la comunidad. Elegí otro.";
export const MENSAJE_NOMBRE_SIN_CAMBIOS = "Ese ya es tu nombre comunitario.";
export const MENSAJE_NOMBRE_SIN_CONFIRMAR = "No sabemos si se guardó. Reintentá: si ya se había guardado, queda igual.";
export const MENSAJE_NOMBRE_ERROR = "No se pudo guardar, probá de nuevo.";
export const MENSAJE_NOMBRE_CONFLICTO = "No pudimos guardar este envío. Recargá y probá de nuevo.";

const MOTIVOS: Readonly<Record<string, string>> = {
  modulo_apagado: "La comunidad no está disponible.",
  publicacion_pausada: "La comunidad está en pausa: por ahora no se puede cambiar el nombre.",
  suspendida: "Tu cuenta tiene una suspensión vigente: no podés cambiar el nombre comunitario.",
  correo_pendiente: "Confirmá tu correo para elegir tu nombre comunitario.",
  terminos_pendientes: "Aceptá los términos de la comunidad (en las reseñas de cualquier ficha) para elegir tu nombre.",
  limite_diario: "Llegaste al límite de cambios de nombre de hoy. Probá mañana.",
  baja_en_curso: "Tu cuenta tiene una eliminación pendiente: no se aceptan acciones de la comunidad.",
};

export type TonoNombre = "exito" | "info" | "rechazo" | "error" | "sin_confirmar";

/** Texto y tono de la respuesta de la ruta del nombre. */
export function mensajeNombre(r: { resultado?: unknown; motivo?: unknown; mensaje?: unknown; nombre?: unknown; repetido?: unknown } | "sin-confirmar"): { tono: TonoNombre; texto: string } {
  if (r === "sin-confirmar") return { tono: "sin_confirmar", texto: MENSAJE_NOMBRE_SIN_CONFIRMAR };
  switch (r.resultado) {
    case "nombre_cambiado":
      // Un intento ya resuelto (recuperado): el registro no guarda el nombre y no se afirma cuál es el actual.
      return r.repetido === true
        ? { tono: "info", texto: "Tu cambio de nombre ya se había guardado." }
        : { tono: "exito", texto: `Listo: tu nombre comunitario es «${String(r.nombre ?? "")}».` };
    case "conflicto": return { tono: "rechazo", texto: MENSAJE_NOMBRE_CONFLICTO };
    case "sin_cambios": return { tono: "info", texto: MENSAJE_NOMBRE_SIN_CAMBIOS };
    case "nombre_no_admitido": return { tono: "rechazo", texto: MENSAJE_NOMBRE_NO_ADMITIDO };
    case "rechazo_formato":
    case "rechazo_contenido":
      return { tono: "rechazo", texto: typeof r.mensaje === "string" && r.mensaje ? r.mensaje : MENSAJE_NOMBRE_NO_ADMITIDO };
    case "rechazo_cuenta":
      return { tono: "rechazo", texto: MOTIVOS[String(r.motivo)] ?? MENSAJE_NOMBRE_ERROR };
    case "baja_en_curso": return { tono: "rechazo", texto: MOTIVOS.baja_en_curso };
    case "sin_sesion": return { tono: "rechazo", texto: "Tu sesión venció. Volvé a ingresar." };
    case "sin_confirmar": return { tono: "sin_confirmar", texto: MENSAJE_NOMBRE_SIN_CONFIRMAR };
    default: return { tono: "error", texto: MENSAJE_NOMBRE_ERROR };
  }
}

/** Lo que se muestra cuando el autor todavía no eligió nombre. Nunca el del perfil privado. */
export const NOMBRE_PENDIENTE = "Yumper sin nombre";
