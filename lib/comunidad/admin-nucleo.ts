// Moderación administrativa (E4): lo que decide el panel y la ruta, sin red
// ni base. PURO y apto para el cliente: lo usan app/admin/moderacion, la ruta
// /api/admin/moderacion y las pruebas.
//
// Regla de oro, la misma que mensajes.ts y menu-nucleo.ts: ningún texto
// afirma lo que no se confirmó. Una decisión cuya respuesta se perdió dice
// "No sabemos si se aplicó" y ofrece reintentar con el MISMO intento (la base
// no la duplica).
import { CATEGORIAS } from "./menu-nucleo.ts";

export const ACCIONES_VERSION = ["publicar", "rechazar", "retirar", "restaurar", "descartar", "cerrar"] as const;
export type AccionVersion = (typeof ACCIONES_VERSION)[number];
export const esAccionVersion = (x: unknown): x is AccionVersion => ACCIONES_VERSION.includes(x as AccionVersion);

export const VISTAS = ["resumen", "retenidos", "denuncias", "retiradas", "version", "cuentas", "registro", "muestreo"] as const;
export type Vista = (typeof VISTAS)[number];

export const MOTIVO_MIN = 3;
export const MOTIVO_MAX = 300;

/** El motivo como lo guarda la base: NFC, sin controles (salvo el salto de línea), sin bordes, 3–300. */
export function normalizarMotivo(texto: unknown): { ok: true; valor: string } | { ok: false; aviso: string } {
  if (typeof texto !== "string") return { ok: false, aviso: "Escribí el motivo de la decisión." };
  const t = texto.normalize("NFC").replace(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g, " ").replace(/[ \t]+/g, " ").trim();
  const largo = [...t].length;
  if (largo < MOTIVO_MIN) return { ok: false, aviso: "Escribí el motivo de la decisión (al menos 3 caracteres)." };
  if (largo > MOTIVO_MAX) return { ok: false, aviso: `El motivo puede tener hasta ${MOTIVO_MAX} caracteres (tiene ${largo}).` };
  return { ok: true, valor: t };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const entero = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n > 0;
const objeto = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

export type PedidoModeracion =
  | { tipo: "leer"; vista: Vista; despues: Record<string, unknown> | null; antes: number | null; version: number | null }
  | { tipo: "decidir"; accion: AccionVersion; version: number; motivo: string; intento: string }
  | { tipo: "suspender"; participante: string; motivo: string; intento: string }
  | { tipo: "levantar"; participante: string; motivo: string; intento: string }
  | { tipo: "quitar_marcador"; cuenta: string; motivo: string; intento: string }
  | { tipo: "publicacion"; activa: boolean; motivo: string; intento: string };

/**
 * Valida el cuerpo de la ruta. Devuelve el pedido o un aviso. Nunca toma la
 * identidad del admin del cuerpo: sale del token verificado.
 */
export function pedidoModeracion(b: unknown): PedidoModeracion | { invalido: string } {
  if (!objeto(b)) return { invalido: "cuerpo inválido" };
  const accion = b.accion;
  if (accion === "leer") {
    if (!VISTAS.includes(b.vista as Vista)) return { invalido: "vista desconocida" };
    const despues = b.despues === undefined || b.despues === null ? null : objeto(b.despues) ? b.despues : undefined;
    if (despues === undefined) return { invalido: "cursor inválido" };
    const antes = b.antes === undefined || b.antes === null ? null : entero(b.antes) ? b.antes : undefined;
    if (antes === undefined) return { invalido: "cursor inválido" };
    // La situación de UNA versión (desde el Registro) exige cuál.
    const version = b.vista === "version" ? (entero(b.version) ? b.version : undefined) : null;
    if (version === undefined) return { invalido: "versión inválida" };
    return { tipo: "leer", vista: b.vista as Vista, despues, antes, version };
  }
  if (typeof b.intento !== "string" || !UUID.test(b.intento)) return { invalido: "intento inválido" };
  const m = normalizarMotivo(b.motivo);
  if (!m.ok) return { invalido: m.aviso };
  if (accion === "decidir") {
    if (!esAccionVersion(b.decision) || !entero(b.version)) return { invalido: "decisión inválida" };
    return { tipo: "decidir", accion: b.decision, version: b.version, motivo: m.valor, intento: b.intento };
  }
  if (accion === "suspender" || accion === "levantar") {
    if (typeof b.participante !== "string" || !UUID.test(b.participante)) return { invalido: "participante inválido" };
    return { tipo: accion, participante: b.participante, motivo: m.valor, intento: b.intento };
  }
  if (accion === "quitar_marcador") {
    if (typeof b.cuenta !== "string" || !UUID.test(b.cuenta)) return { invalido: "cuenta inválida" };
    return { tipo: "quitar_marcador", cuenta: b.cuenta, motivo: m.valor, intento: b.intento };
  }
  if (accion === "publicacion") {
    if (typeof b.activa !== "boolean") return { invalido: "estado inválido" };
    return { tipo: "publicacion", activa: b.activa, motivo: m.valor, intento: b.intento };
  }
  return { invalido: "acción desconocida" };
}

/** Fecha y hora argentinas (dd/mm/aaaa hh:mm), o "—". */
export function fechaAR(iso: unknown): string {
  const d = typeof iso === "string" ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "—";
  const z = { timeZone: "America/Argentina/Buenos_Aires" } as const;
  return `${d.toLocaleDateString("es-AR", { ...z, day: "2-digit", month: "2-digit", year: "numeric" })} ${d.toLocaleTimeString("es-AR", { ...z, hour: "2-digit", minute: "2-digit", hour12: false })}`;
}

/** El participante, como lo ve el admin: un código corto, seudónimo. */
export const codigoParticipante = (id: unknown) =>
  typeof id === "string" && UUID.test(id) ? `P-${id.slice(0, 6).toUpperCase()}` : "P-?";

export const SITUACION: Readonly<Record<string, string>> = {
  visible: "Visible",
  publicada: "Publicada",
  borrada: "Borrada por el autor",
  reemplazada: "Reemplazada por una edición",
  retenida: "Retenida",
  revision_solicitada: "Revisión pedida",
  oculta: "Retirada",
  rechazada: "Rechazada",
  eliminada: "Eliminada (baja de la cuenta)",
};

export const etiquetaCategoria = (c: string) => CATEGORIAS.find((x) => x.id === c)?.etiqueta ?? c;

export const ETIQUETA_ACCION: Readonly<Record<string, string>> = {
  publicar: "Publicar", rechazar: "Rechazar", retirar: "Retirar", restaurar: "Restaurar",
  descartar: "Descartar denuncias", cerrar: "Cerrar el caso",
  suspender: "Suspender", levantar_suspension: "Levantar la suspensión", levantar: "Levantar la suspensión",
  quitar_marcador_baja: "Quitar el marcador de baja", quitar_marcador: "Quitar el marcador de baja",
  pausar_publicacion: "Pausar la publicación", reanudar_publicacion: "Reanudar la publicación",
};

/** Lo que se le muestra al admin ANTES de confirmar (diseño §3.4: el efecto de restaurar). */
export function efectoDecision(accion: AccionVersion, caso: { votos?: number; denuncias?: number; revision?: boolean }): string {
  const votos = caso.votos ?? 0, den = caso.denuncias ?? 0;
  const deVotos = votos > 0
    ? `Recupera ${votos} voto${votos === 1 ? "" : "s"} de utilidad de esta versión; los meses ya cerrados no cambian.`
    : "Esta versión no tiene votos: empieza en cero.";
  switch (accion) {
    case "publicar":
      return `La versión se publica y la ve todo el mundo. ${deVotos}${caso.revision ? " Queda registrada como falso positivo de las reglas." : ""}`;
    case "restaurar":
      return votos > 0
        ? `La versión vuelve a verse. Vuelven a contar ${votos} voto${votos === 1 ? "" : "s"} de utilidad que ya tenía, en su mes original; no se suma ninguno nuevo y los meses ya cerrados no cambian.`
        : "La versión vuelve a verse. No tiene votos de utilidad que recuperar: no se suma ninguno.";
    case "rechazar":
      return `No se publica. El autor la ve como rechazada y puede corregirla o borrarla.${den ? ` ${den} denuncia${den === 1 ? "" : "s"} abierta${den === 1 ? "" : "s"} quedan resueltas.` : ""}`;
    case "retirar":
      return `Deja de verse para todos. Sus votos se conservan pero no suman mientras esté retirada.${den ? ` ${den} denuncia${den === 1 ? "" : "s"} abierta${den === 1 ? "" : "s"} quedan resueltas.` : ""}`;
    case "descartar":
      return den === 1
        ? "La reseña sigue como está. La denuncia se marca como descartada: baja la prioridad de las próximas de esa cuenta, sin bloquearla."
        : `La reseña sigue como está. ${den || "Las"} denuncias se marcan como descartadas: bajan la prioridad de las próximas de esas cuentas, sin bloquearlas.`;
    case "cerrar":
      return "El contenido ya no se ve. Las denuncias se archivan como resueltas, sin otra decisión.";
  }
}

export type Tono = "exito" | "info" | "rechazo" | "error" | "sin_confirmar";
type Respuesta = { resultado?: unknown; situacion?: unknown; estado?: unknown; motivo?: unknown; repetido?: unknown } | "sin-confirmar";

export const MOD_SIN_CONFIRMAR = "No sabemos si se aplicó. Reintentá: no se duplica.";
export const MOD_ERROR = "No se pudo aplicar, probá de nuevo.";

/** El resultado de una acción, en el tono que corresponde. */
export function mensajeModeracion(accion: string, r: Respuesta): { tono: Tono; texto: string } {
  if (r === "sin-confirmar") return { tono: "sin_confirmar", texto: MOD_SIN_CONFIRMAR };
  const sit = typeof r.situacion === "string" ? (SITUACION[r.situacion] ?? r.situacion) : null;
  switch (r.resultado) {
    case "aplicada": {
      const hecho: Record<string, string> = {
        publicar: "Publicada.", rechazar: "Rechazada.", retirar: "Retirada.", restaurar: "Restaurada.",
        descartar: "Denuncias descartadas.", cerrar: "Caso cerrado.", suspender: "Cuenta suspendida.",
        levantar: "Suspensión levantada.", levantar_suspension: "Suspensión levantada.",
        quitar_marcador: "Marcador de baja quitado. No se restauró nada.", quitar_marcador_baja: "Marcador de baja quitado. No se restauró nada.",
        publicacion: "Listo.", pausar_publicacion: "Publicación pausada.", reanudar_publicacion: "Publicación reanudada.",
      };
      return { tono: "exito", texto: `${hecho[accion] ?? "Listo."}${r.repetido ? " (ya estaba aplicada)" : ""}` };
    }
    case "conflicto":
      if (r.motivo === "intento") return { tono: "rechazo", texto: "Ese pedido ya se usó para otra decisión. Recargá y volvé a intentar." };
      if (r.motivo === "visible") return { tono: "rechazo", texto: "La reseña sigue visible: decidí retirarla o descartar las denuncias." };
      return { tono: "rechazo", texto: `No se aplicó: la versión cambió${sit ? ` (ahora: ${sit.toLowerCase()})` : ""}. Recargá la cola.` };
    case "no_disponible":
      if (r.situacion === "cuenta_eliminada") return { tono: "rechazo", texto: "La cuenta se eliminó: no hay a quién suspender." };
      return { tono: "rechazo", texto: "Ya no está disponible (se eliminó). No se aplicó nada." };
    case "sin_efecto": {
      const s: Record<string, string> = {
        ya_suspendida: "Ya estaba suspendida.", sin_suspension: "No tenía una suspensión vigente.",
        sin_marcador: "No hay un marcador de baja para esa cuenta.", ya_cancelado: "El marcador ya estaba quitado.",
      };
      if (typeof r.situacion === "string" && s[r.situacion]) return { tono: "info", texto: s[r.situacion] };
      return { tono: "info", texto: "No había nada que cambiar." };
    }
    case "no_autorizado": return { tono: "rechazo", texto: "Tu sesión no tiene permiso de moderación (falta el segundo factor o no sos administrador)." };
    case "invalido": return { tono: "rechazo", texto: "El pedido no es válido." };
    case "error": return { tono: "error", texto: MOD_ERROR };
    case "sin_confirmar":
    default: return { tono: "sin_confirmar", texto: MOD_SIN_CONFIRMAR };
  }
}

/** ¿Se ofrece reintentar con el mismo intento? Sólo si no se sabe o no se pudo. */
export const reintentable = (t: Tono) => t === "sin_confirmar" || t === "error";

/** HTTP de la ruta. */
export function estadoHttpModeracion(r: { resultado?: unknown }): number {
  if (r.resultado === "invalido") return 400;
  if (r.resultado === "no_autorizado") return 403;
  if (r.resultado === "error") return 500;
  if (r.resultado === "sin_confirmar") return 503;
  return 200;
}

/** Qué acciones ofrece un caso según dónde está su versión. */
export function accionesRetenido(estado: string): AccionVersion[] {
  return estado === "retenida" || estado === "revision_solicitada" ? ["publicar", "rechazar"] : [];
}
/** Restaurar sólo se ofrece sobre una retirada vigente (la base vuelve a comprobarlo con todo bloqueado). */
export function accionesRetirada(situacion: string): AccionVersion[] {
  return situacion === "oculta" ? ["restaurar"] : [];
}
/** Por qué una versión del Registro no se puede restaurar, o null si se puede. */
export function motivoNoRestaurable(situacion: string): string | null {
  switch (situacion) {
    case "oculta": return null;
    case "visible": return "Ya está visible.";
    case "reemplazada": return "El autor la editó: la versión vigente es otra y ésta no vuelve.";
    case "borrada": return "El autor borró la reseña: no se restaura.";
    case "eliminada": return "Se eliminó con la baja de la cuenta: no se restaura.";
    default: return "No está retirada: no hay nada que restaurar.";
  }
}
export function accionesDenuncia(situacion: string): AccionVersion[] {
  if (situacion === "visible") return ["retirar", "descartar"];
  // Retenida (por ejemplo, por corroboración): publicar o rechazar se decide
  // en la cola de retenidos; acá sólo el caso de las denuncias.
  if (situacion === "retenida" || situacion === "revision_solicitada") return ["descartar", "cerrar"];
  return ["cerrar"];
}
