// Las decisiones de la votación que no dependen de React (plan de salas,
// Tarea 3.4). Puro, client-safe.
//
// El CLIENTE NO COMPUTA RESULTADOS: sólo decide, a partir de lo que respondió
// `sala_votar` o de un `sala_estado` nuevo, a qué posición pasar y si el
// comienzo persistido de la card (hooks/temporizador-card.ts) ya se puede
// borrar. La regla es una: SE CIERRA SÓLO CON AVANCE CONFIRMADO POR EL
// SERVIDOR. Un fallo de red no cierra nada.
import type { Voto } from "./estado.ts";

/** Lo que devuelve `sala_votar` (009_salas.sql). */
export type RespuestaVotar =
  | { ok: true; termine: boolean; estado: string; idempotente?: boolean }
  | { ok: false; motivo: "ronda_cerrada"; estado: string }
  | { ok: false; motivo: "inexistente" }
  | { ok: false; motivo: "ya_votado" | "fuera_de_orden"; siguiente: number };

export interface Decision {
  /** La posición que sigue para este participante, o null si la ronda ya no admite votos. */
  siguiente: number | null;
  /** Hay que borrar el comienzo persistido de `pos` (el servidor confirmó que esa card quedó atrás). */
  cerrar: boolean;
  /** Este participante ya votó todas las cards. */
  termine: boolean;
  /** La ronda se cerró (por deadline o resultado): la vista pasa a lo que diga el estado. */
  rondaCerrada: boolean;
}

/** Qué hacer después de que `sala_votar` respondió para la card `pos`. */
export function decidirTrasVotar(r: RespuestaVotar, pos: number, size: number): Decision {
  if (r.ok) {
    const sig = pos + 1;
    return { siguiente: sig < size ? sig : null, cerrar: true, termine: r.termine || sig >= size, rondaCerrada: false };
  }
  if (r.motivo === "ronda_cerrada" || r.motivo === "inexistente") {
    return { siguiente: null, cerrar: false, termine: false, rondaCerrada: true };
  }
  // ya_votado / fuera_de_orden: el servidor dice cuál es la próxima MÍA.
  const sig = r.siguiente;
  if (sig > pos) return { siguiente: sig < size ? sig : null, cerrar: true, termine: sig >= size, rondaCerrada: false };
  // Estoy adelantado respecto del servidor (raro: otra pestaña, o un estado
  // viejo): vuelvo a la que él dice, sin cerrar nada.
  return { siguiente: sig, cerrar: false, termine: false, rondaCerrada: false };
}

/**
 * Llegó un `sala_estado` con `mi_siguiente_pos`. Si el servidor está más
 * adelante que la vista (recarga, otra pestaña, respuesta perdida), la vista
 * salta ahí y las posiciones anteriores quedan confirmadas.
 */
export function sincronizarPos(posLocal: number, miSiguientePos: number, size: number): { pos: number; confirmadasHasta: number; termine: boolean } {
  const pos = Math.max(posLocal, miSiguientePos);
  return { pos: Math.min(pos, size), confirmadasHasta: miSiguientePos, termine: miSiguientePos >= size };
}

/** El voto que se manda al vencer el contador local. */
export const VOTO_AL_VENCER: Voto = "pass";

/** `Xh Ym` / `Ym` para la duración de la card. */
export function formatoDuracion(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "";
  const h = Math.floor(min / 60), m = min % 60;
  if (h === 0) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** El "Pero" se muestra sólo si tiene contenido de verdad. */
export function hayAdvertencia(a: string | null | undefined): a is string {
  return typeof a === "string" && a.trim().length > 0;
}
