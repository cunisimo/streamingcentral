// Los 10 segundos de cada card de una sala (plan de salas, Tarea 3.1).
// Máquina PURA con la persistencia inyectada: la interfaz le pasa
// `localStorage` y `Date.now()`; los tests, un Map y números.
//
// RECARGAR LA PÁGINA NO REINICIA LOS 10 S. El comienzo persiste por sala,
// ronda y posición, y se borra (`cerrar`) SÓLO cuando el servidor confirmó el
// avance: `sala_votar` aceptado (incluido `idempotente`), `ya_votado` /
// `fuera_de_orden` con `siguiente > pos`, o un `sala_estado` posterior con
// `mi_siguiente_pos > pos`. Un fallo de red conserva el comienzo, vencido o
// no: al volver, si ya venció, se reintenta el `pass` en el acto en vez de
// regalar otros 10 s. El plazo global sigue siendo el del servidor: esto sólo
// evita que el contador local se regale con F5.
export interface StoreTemporizador {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export const DURACION_MS = 10_000;

export const claveInicioCard = (room: string, round: string, pos: number) => `yump:sala:${room}:${round}:${pos}:inicio`;

function leer(store: StoreTemporizador, k: string): number | null {
  try {
    const v = store.getItem(k);
    if (v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
}

/**
 * Lee el comienzo guardado bajo `clave`; si no hay uno válido, guarda `ahoraMs`.
 * Un comienzo en el futuro (reloj movido) no vale: daría más de 10 s.
 */
export function arrancar(store: StoreTemporizador, clave: string, ahoraMs: number): { arrancoEn: number } {
  const guardado = leer(store, clave);
  if (guardado !== null && guardado <= ahoraMs) return { arrancoEn: guardado };
  try { store.setItem(clave, String(ahoraMs)); } catch { /* sin persistencia */ }
  return { arrancoEn: ahoraMs };
}

/** Segundos enteros que faltan (techo), mínimo 0. */
export function restante(arrancoEn: number, ahoraMs: number): number {
  return Math.max(0, Math.ceil((DURACION_MS - (ahoraMs - arrancoEn)) / 1000));
}

export function vencio(arrancoEn: number, ahoraMs: number): boolean {
  return ahoraMs - arrancoEn >= DURACION_MS;
}

/** El servidor confirmó el avance: el comienzo de esa card ya no sirve para nada. */
export function cerrar(store: StoreTemporizador, clave: string): void {
  try { store.removeItem(clave); } catch { /* noop */ }
}

/** Al retomar en `desdePos`, las cards anteriores ya están confirmadas: se limpian sus comienzos. */
export function limpiarAnteriores(store: StoreTemporizador, room: string, round: string, desdePos: number, size: number): void {
  for (let p = 0; p < Math.min(desdePos, size); p++) cerrar(store, claveInicioCard(room, round, p));
}
