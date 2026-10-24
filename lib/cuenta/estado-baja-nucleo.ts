// "Eliminación pendiente" en Cuenta → Configuración (contrato de baja, E2b).
// PURO: sin React ni fetch, para probarlo con `node --test`.
//
// Qué decide:
//   - qué muestra la pantalla según `GET /api/cuenta/estado-baja` y según el
//     resultado de un intento de eliminación;
//   - que una respuesta vieja —de otra cuenta, o de una consulta anterior de
//     la misma— no pise el estado actual (generaciones, mismo patrón que la
//     carga del perfil en AuthContext);
//   - los textos de cada resultado de `POST /api/cuenta/eliminar`.
//
// Un error al consultar NO es "no hay baja pendiente": queda `error` y la
// pantalla no afirma nada. El botón de eliminar sigue disponible en todos los
// estados: reintentar es la misma operación.
//
// "pendiente" y "sin-verificar" NO son lo mismo (auditoría de E2b, A1):
//   - pendiente: hay un marcador de baja, y el marcador cae con la cuenta,
//     así que la cuenta existía cuando se leyó (consulta al servidor) o se
//     confirmó viva (`baja-parcial`: getUserById la encontró);
//   - sin-verificar: el paso comunitario confirmó, pero no se sabe si Auth
//     borró la cuenta (la respuesta pudo perderse y la reconciliación
//     falló). El aviso no afirma ni que existe ni que se eliminó.
export type EstadoBaja =
  | { fase: "sin-sesion"; gen: number }
  | { fase: "consultando"; gen: number; uid: string }
  | { fase: "pendiente"; gen: number; uid: string }
  | { fase: "sin-verificar"; gen: number; uid: string }
  | { fase: "sin-baja"; gen: number; uid: string }
  | { fase: "error"; gen: number; uid: string };

export const ESTADO_INICIAL: EstadoBaja = { fase: "sin-sesion", gen: 0 };

/** Empieza una consulta (o vuelve a sin sesión). Siempre abre una generación nueva. */
export function consultar(prev: EstadoBaja, uid: string | null): EstadoBaja {
  const gen = prev.gen + 1;
  return uid ? { fase: "consultando", gen, uid } : { fase: "sin-sesion", gen };
}

export type RespuestaEstado = { status: number; cuerpo: unknown } | "sin-red";

/** Aplica la respuesta de la consulta `gen` de `uid`. Si ya no es la vigente, no cambia nada. */
export function alResponder(prev: EstadoBaja, gen: number, uid: string, r: RespuestaEstado): EstadoBaja {
  if (prev.fase !== "consultando" || prev.gen !== gen || prev.uid !== uid) return prev;
  if (r === "sin-red" || r.status !== 200) return { fase: "error", gen, uid };
  const pendiente = (r.cuerpo as { pendiente?: unknown } | null)?.pendiente;
  if (pendiente === true) return { fase: "pendiente", gen, uid };
  if (pendiente === false) return { fase: "sin-baja", gen, uid };
  return { fase: "error", gen, uid };
}

/**
 * Después de un intento de eliminación que no terminó con `ok`.
 *   - `baja-parcial`: el paso 1 confirmó y Auth confirmó la cuenta VIVA, así
 *     que el marcador sigue → pendiente.
 *   - `baja-sin-verificar`: el paso 1 confirmó, pero no se sabe si Auth la
 *     borró. Si la borró, el marcador cayó con ella: no se puede afirmar que
 *     exista → sin-verificar, con un aviso neutral.
 * El resto no cambia lo que se sabía.
 */
export function trasIntento(prev: EstadoBaja, uid: string, codigo: unknown): EstadoBaja {
  if (prev.fase === "sin-sesion" || prev.uid !== uid) return prev;
  if (codigo === "baja-parcial") return { fase: "pendiente", gen: prev.gen, uid };
  if (codigo === "baja-sin-verificar") return { fase: "sin-verificar", gen: prev.gen, uid };
  return prev;
}

export const TEXTO_PENDIENTE = {
  titulo: "Eliminación pendiente",
  cuerpo: "Ya borramos tus datos de comunidad, pero tu cuenta todavía existe. Reintentá la eliminación para terminar.",
  boton: "Reintentar eliminación",
} as const;

export const TEXTO_SIN_VERIFICAR = {
  titulo: "Eliminación sin confirmar",
  cuerpo: "Ya borramos tus datos de comunidad, pero no pudimos verificar si tu cuenta se eliminó. Reintentá para confirmarlo.",
  boton: "Reintentar eliminación",
} as const;

export const TEXTO_ELIMINAR = {
  titulo: "Eliminar cuenta",
  cuerpo: "Se borra tu cuenta y todo lo tuyo. No se puede deshacer.",
  boton: "Eliminar cuenta",
} as const;

/** El aviso que muestra la zona de riesgo en cada estado. */
export function avisoVisible(e: EstadoBaja): { titulo: string; cuerpo: string; boton: string; anuncio: boolean } {
  if (e.fase === "pendiente") return { ...TEXTO_PENDIENTE, anuncio: true };
  if (e.fase === "sin-verificar") return { ...TEXTO_SIN_VERIFICAR, anuncio: true };
  return { ...TEXTO_ELIMINAR, anuncio: false };
}

/** El texto de cada respuesta de error de POST /api/cuenta/eliminar. */
export function mensajeEliminar(codigo: unknown, minutos?: unknown): string {
  if (codigo === "password-invalida") return "La contraseña no es correcta.";
  if (codigo === "demasiados-intentos") {
    const m = typeof minutos === "number" ? minutos : 15;
    return `Demasiados intentos. Probá de nuevo en ${m} minuto${m === 1 ? "" : "s"}.`;
  }
  if (codigo === "sin-sesion") return "Se cerró tu sesión. Volvé a entrar e intentá de nuevo.";
  if (codigo === "no-disponible") return "El borrado de cuentas no está disponible en este momento. Escribinos si el problema sigue.";
  if (codigo === "baja-parcial") return "Borramos tus datos de comunidad, pero no pudimos eliminar la cuenta. Probá de nuevo.";
  if (codigo === "baja-sin-verificar") return "No pudimos verificar si tu cuenta se eliminó. Probá de nuevo.";
  return "No pudimos eliminar la cuenta. Probá de nuevo en un rato.";
}
