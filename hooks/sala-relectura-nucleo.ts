// La relectura acotada de `useSala` (plan de salas, Tarea 3.2). Puro.
//
// El canal de Broadcast sólo dice "cambió algo" (`{v}`): la verdad se relee
// con `sala_estado`. Con seis personas votando, las señales llegan en ráfaga;
// releer por cada una sería una consulta por voto por participante. Acá se
// acota a UNA relectura por ventana de 1500 ms, programada al final de la
// ventana (trailing), así una ráfaga termina en una sola lectura que ya ve
// todos los cambios. Una señal aislada, pasada la ventana, relee en el acto.
export const VENTANA_MS = 1500;

export interface EstadoRelectura {
  /** Cuándo terminó la última lectura (ms), o null si todavía no hubo ninguna. */
  ultimaMs: number | null;
  /** Hay una relectura programada o en vuelo. */
  pendiente: boolean;
}

export const inicial = (): EstadoRelectura => ({ ultimaMs: null, pendiente: false });

/**
 * Llegó una señal. Devuelve en cuántos ms hay que releer (0 = ya), o null si
 * ya hay una relectura pendiente que la va a cubrir.
 */
export function alSenal(s: EstadoRelectura, ahoraMs: number, ventana = VENTANA_MS): { estado: EstadoRelectura; programarEnMs: number | null } {
  if (s.pendiente) return { estado: s, programarEnMs: null };
  const transcurrido = s.ultimaMs === null ? Infinity : ahoraMs - s.ultimaMs;
  const enMs = transcurrido >= ventana ? 0 : ventana - transcurrido;
  return { estado: { ...s, pendiente: true }, programarEnMs: enMs };
}

/** Terminó una lectura (con o sin éxito): se anota el momento y se libera el pendiente. */
export function alReleer(s: EstadoRelectura, ahoraMs: number): EstadoRelectura {
  return { ultimaMs: ahoraMs, pendiente: false };
}
