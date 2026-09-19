// La forma del JSON que devuelve `sala_estado` (supabase/migrations/009_salas.sql)
// y las dos lecturas que hace la interfaz sobre él. Client-safe.
//
// El cliente NUNCA computa resultados: `resultado` viene armado por la base.
// Acá sólo se decide si la sala terminó y cuánto falta para el plazo que
// rige en cada estado, para mostrar un contador. El plazo que MANDA es el del
// servidor: estas cuentas son de presentación.
import type { PlatformCode } from "../types.ts";
import type { CardSala, Duracion, Size } from "./tipos.ts";

export type EstadoRoom = "lobby" | "preparando" | "votando" | "empate" | "resultado" | "vencida";
export type Voto = "yes" | "no" | "pass";
export type TipoResultado = "match" | "ganador" | "empate" | "sin_coincidencias" | "vencida";

export interface Participante { nombre: string; es_host: boolean; soy: boolean }

export interface RondaSala {
  id: string;
  numero: number;
  size: Size;
  duracion: Duracion;
  limite_seg: number;
  estado: "preparando" | "votando" | "cerrada";
  started_at: string | null;
  deadline_at: string | null;
  /** Cuántos participantes ya votaron las `size` cards. */
  terminaron: number;
  /** Cuántos votos míos hay = la próxima posición que me toca. */
  mi_siguiente_pos: number;
  /** `{ "0": "yes", "1": "no" }` — las claves son la posición como texto (jsonb_object_agg). */
  mis_votos: Record<string, Voto>;
  /** Vacío mientras la ronda está `preparando`. */
  titulos: CardSala[];
}

export interface ResultadoSala {
  tipo: TipoResultado;
  ganador_pos: number | null;
  empatadas: number[] | null;
  desempatado: boolean;
  puede_desempatar: boolean;
  puede_otra_tanda: boolean;
}

export interface EstadoSala {
  estado: EstadoRoom;
  version: number;
  /** `now()` del servidor al responder: de acá sale el desfase del reloj. */
  ahora: string;
  expires_at: string;
  lobby_expires_at: string;
  soy: { id: string; nombre: string; platforms: PlatformCode[]; es_host: boolean };
  participantes: Participante[];
  union: PlatformCode[];
  n: number;
  config_default: { size: Size; duracion: Duracion };
  ronda?: RondaSala;
  resultado?: ResultadoSala;
}

export interface EstadoInexistente { estado: "inexistente" }
export type RespuestaEstado = EstadoSala | EstadoInexistente;

export function esInexistente(e: RespuestaEstado): e is EstadoInexistente {
  return e.estado === "inexistente";
}

/** Vencida o inexistente: no hay nada más que hacer con esta sala. */
export function esTerminal(e: RespuestaEstado): boolean {
  return e.estado === "vencida" || e.estado === "inexistente";
}

/** El plazo que rige en el estado actual, como ISO, o null si no hay uno que mostrar. */
export function plazoVigente(e: RespuestaEstado): string | null {
  if (esInexistente(e)) return null;
  switch (e.estado) {
    case "lobby": return e.lobby_expires_at;
    case "votando": return e.ronda?.deadline_at ?? null;
    case "empate":
    case "resultado": return e.expires_at;
    default: return null;
  }
}

/**
 * Desfase entre el reloj del servidor y el del cliente, en ms, medido cuando
 * la respuesta LLEGÓ: `ahora_servidor − ahora_cliente`. Negativo si el
 * teléfono está adelantado. Se suma al reloj local para comparar contra los
 * plazos del servidor.
 */
export function desfaseReloj(e: RespuestaEstado, recibidoMs: number): number {
  if (esInexistente(e)) return 0;
  const servidor = Date.parse(e.ahora);
  return Number.isFinite(servidor) ? servidor - recibidoMs : 0;
}

/** Segundos hasta el plazo vigente (techo, mínimo 0), o null si no hay plazo. */
export function venceEnSeg(e: RespuestaEstado, ahoraMs: number, desfaseMs = 0): number | null {
  const plazo = plazoVigente(e);
  if (!plazo) return null;
  const fin = Date.parse(plazo);
  if (!Number.isFinite(fin)) return null;
  return Math.max(0, Math.ceil((fin - (ahoraMs + desfaseMs)) / 1000));
}
