// Política por clase de respuesta de TMDB y bucle de reintentos. Etapa 3.a de
// capacidad (#19), informe de la Etapa 3 §6-§7. Módulo PURO, sin `server-only`.
//
// 🔴 APAGADO POR DEFECTO. `reintentosActivos(process.env.TMDB_REINTENTOS)` es
// `false` salvo que la variable valga exactamente "1". Con la política apagada
// `decidir` devuelve siempre `fallar` con espera 0 y `conReintentos` hace UN
// intento: el comportamiento de `lib/tmdb.ts` es el de siempre. La auditoría
// de Codex sobre el diseño v4 aprobó sólo esta sub-etapa (3.a) y exigió que
// los reintentos no se enciendan antes del circuito (3.b) y del limitador
// (3.c): reintentar sin ellos multiplica una caída de TMDB hasta ×3.
//
// Lo que la tabla decide cuando esté encendida (§6): 429 y 5xx se reintentan
// hasta 3 intentos en total; 429/503 respetan `Retry-After` (tope 30 s) y sin
// encabezado usan backoff con jitter completo; red y timeout un solo
// reintento; 4xx (404, 401, 400…), cuerpo inválido y cancelación, nunca; y
// ningún reintento se inicia si no cabe en el presupuesto restante.
import { ErrorTmdb, esErrorTmdb } from "./tmdb-error.ts";

export const RETRY_AFTER_MAX_MS = 30_000;
export const BACKOFF_BASE_MS = 300;
export const BACKOFF_TOPE_MS = 2000;
export const JITTER_RETRY_AFTER_MS = 1000;
export const TIMEOUT_LLAMADA_MS = 8000;
export const TIMEOUT_MIN_MS = 1500;
const MAX_INTENTOS: Record<string, number> = {
  http429: 3, http5xx: 3, red: 2, timeout: 2, http4xx: 1, cuerpo: 1, cancelada: 1, rechazada: 1,
};

/** Sólo "1" enciende. Ausente, vacío, "0" o cualquier otra cosa: apagado. */
export function reintentosActivos(valor: string | undefined): boolean {
  return valor === "1";
}

export interface Decision {
  accion: "reintentar" | "fallar";
  esperaMs: number;
  /** Timeout del intento siguiente (si se reintenta): lo que cabe, tope 8 s. */
  timeoutMs: number;
  motivo: "apagada" | "no-reintentable" | "tope-intentos" | "no-cabe" | "reintentar";
}

export function decidir(
  e: unknown,
  o: { intento: number; restanteMs: number; activa: boolean; azar: () => number },
): Decision {
  const fallar = (motivo: Decision["motivo"]): Decision => ({ accion: "fallar", esperaMs: 0, timeoutMs: 0, motivo });
  if (!o.activa) return fallar("apagada");
  if (!esErrorTmdb(e)) return fallar("no-reintentable");
  const tope = MAX_INTENTOS[e.clase] ?? 1;
  if (tope <= 1) return fallar("no-reintentable");
  if (o.intento >= tope) return fallar("tope-intentos");

  const esperaMs = esperaPara(e, o.intento, o.azar);
  // Regla de "cabe" (§7.2): la espera más un intento mínimo tienen que entrar
  // en lo que queda del presupuesto; si no, se falla ya con el último error.
  if (esperaMs + TIMEOUT_MIN_MS > o.restanteMs) return fallar("no-cabe");
  const timeoutMs = Math.min(TIMEOUT_LLAMADA_MS, o.restanteMs - esperaMs);
  return { accion: "reintentar", esperaMs, timeoutMs, motivo: "reintentar" };
}

function esperaPara(e: ErrorTmdb, intento: number, azar: () => number): number {
  // `Retry-After` válido (429 o 503): se respeta, acotado, con jitter ADITIVO
  // —nunca antes de lo que TMDB pidió—.
  if ((e.clase === "http429" || e.estado === 503) && e.retryAfterMs !== null) {
    return Math.min(e.retryAfterMs, RETRY_AFTER_MAX_MS) + Math.floor(azar() * JITTER_RETRY_AFTER_MS);
  }
  // Sin encabezado: jitter completo sobre 300 · 2^(intento−1), tope 2 s.
  const ventana = Math.min(BACKOFF_BASE_MS * 2 ** (intento - 1), BACKOFF_TOPE_MS);
  return Math.floor(azar() * ventana);
}

export interface OpcionesReintento {
  activa: boolean;
  /** Presupuesto restante en ms, consultado antes de cada decisión. */
  restante: () => number;
  dormir: (ms: number, senal?: AbortSignal) => Promise<void>;
  azar: () => number;
  senal?: AbortSignal;
  alReintentar?: (d: Decision, intento: number) => void;
  alNoCaber?: (d: Decision) => void;
}

/**
 * Ejecuta `intentar` con la política. `intentar` es UN intento completo
 * (permiso del semáforo + fetch + liberación): entre dos intentos no se retiene
 * permiso ni nada, y la espera se hace con la señal de la solicitud.
 */
export async function conReintentos<T>(intentar: (timeoutMs?: number) => Promise<T>, o: OpcionesReintento): Promise<T> {
  let intento = 0;
  let timeoutMs: number | undefined;
  for (;;) {
    intento++;
    try {
      return await intentar(timeoutMs);
    } catch (e) {
      const d = decidir(e, { intento, restanteMs: o.restante(), activa: o.activa, azar: o.azar });
      if (d.accion === "fallar") {
        if (d.motivo === "no-cabe") o.alNoCaber?.(d);
        throw e;
      }
      o.alReintentar?.(d, intento);
      await o.dormir(d.esperaMs, o.senal);
      if (o.senal?.aborted) throw new DOMException("solicitud cancelada", "AbortError");
      timeoutMs = d.timeoutMs;
    }
  }
}
