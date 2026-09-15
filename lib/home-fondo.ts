// El programador de fondo de la Etapa 3.b, "último bueno primero" (#19,
// informe de la Etapa 3 §33): cuando el líder del turno tiene un último Home
// bueno (UB) de la misma combinación, lo responde en el acto y la composición
// de la fresca corre DESPUÉS de responder, sostenida por `waitUntil` de Vercel.
//
// Módulo PURO: `registrar` (en producción, `waitUntil` de `@vercel/functions`)
// se inyecta, así que se prueba con `node --test`.
//
// 🔴 LAS REGLAS:
//   - PEREZOSO. `iniciar` no se invoca hasta que la tarea quedó REGISTRADA. La
//     tarea espera un microtick y sólo compone si el registro terminó sin
//     lanzar. Si el fondo no está disponible, el kill switch está apagado o el
//     registro lanza, `programarEnFondo` devuelve `false` SIN haber iniciado
//     nada, y el que llama compone en línea: UNA composición, la bloqueante,
//     y ni una tarea huérfana ni una segunda composición.
//   - LA TAREA SIEMPRE RESUELVE. Un rechazo de `iniciar` se contiene y se
//     loguea; un fallo del propio log también. Ninguna promesa registrada en
//     `waitUntil` puede rechazar.
//   - DISPONIBILIDAD, no "no explotó". `waitUntil` de `@vercel/functions`
//     devuelve sin hacer nada cuando no hay contexto de solicitud (local,
//     `next start`, banco): la disponibilidad se decide ANTES, por la variable
//     pública `VERCEL=1` del runtime (o `YUMP_BANCO_FONDO=1` en el banco, donde
//     el proceso de `next start` vive lo suficiente para que el fondo termine).
//
// Kill switch: `HOME_UB_PRIMERO=0` deja exactamente el camino de siempre (el
// líder compone en línea). Es una reversión sin tocar código, pero cambiar una
// variable de entorno en Vercel se aplica recién en el siguiente deployment:
// las funciones ya desplegadas conservan su entorno. La secuencia es variable
// → redeploy del mismo commit → verificar `[home]` sin `ultimo-bueno-fondo`.

export interface DepsFondo {
  /** `waitUntil` (o un doble): sostiene la promesa después de responder. Puede lanzar. */
  registrar: (tarea: Promise<unknown>) => void;
  /** Hay fondo real (Vercel) o el banco lo simula. */
  disponible: boolean;
  /** `HOME_UB_PRIMERO=0`. */
  apagado: boolean;
  /** Dónde va lo contenido (default: console.error). Un fallo acá también se contiene. */
  error?: (...a: unknown[]) => void;
}

export type ProgramarEnFondo = (iniciar: (senal?: AbortSignal) => Promise<void>, senal?: AbortSignal) => boolean;

/** Decide la disponibilidad y el kill switch a partir del entorno. */
export function estadoDelFondo(env: Record<string, string | undefined>): { disponible: boolean; apagado: boolean } {
  return {
    disponible: env.VERCEL === "1" || env.YUMP_BANCO_FONDO === "1",
    apagado: env.HOME_UB_PRIMERO === "0",
  };
}

export function crearProgramadorDeFondo(deps: DepsFondo): ProgramarEnFondo {
  const error = (...a: unknown[]) => {
    try { (deps.error ?? ((...x: unknown[]) => console.error(...x)))(...a); } catch { /* un log roto no puede romper nada más */ }
  };
  return (iniciar, senal) => {
    if (deps.apagado || !deps.disponible) return false;
    let registrado = false;
    // No inicia en este tick: espera un microtick y sólo compone si el
    // registro quedó hecho. Como `registrar` es sincrónico, cuando la tarea
    // despierta `registrado` ya vale true o false definitivamente.
    const tarea = (async () => {
      await Promise.resolve();
      if (!registrado) return;
      try {
        await iniciar(senal);
      } catch (e) {
        error("[home-fondo] la composición de fondo rechazó (contenido):", e);
      }
    })();
    try {
      deps.registrar(tarea);
      registrado = true;
      return true;
    } catch (e) {
      error("[home] el registro en waitUntil lanzó; se compone en línea:", e);
      return false;
    }
  };
}
