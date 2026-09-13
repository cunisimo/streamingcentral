// La señal de cancelación de la solicitud, viajando por el mismo mecanismo que
// las métricas (AsyncLocalStorage). Etapa 2 de capacidad (#17), informe §3.8.
//
// `homePayload` crea `AbortSignal.timeout(PRESUPUESTO_REQUEST_MS)` y corre el
// armado adentro de `conSenal`; lib/tmdb.ts y el `fetch` de `supabaseServer()`
// la leen de acá y la combinan con su propio timeout, sin cambiar sus firmas.
// Fuera de un scope no hay señal y todo se comporta exactamente como hoy.
//
// Lo que esto NO cancela: los reintentos del SDK de Redis, que sólo acepta una
// señal global del cliente. Con Redis caído la solicitud puede seguir hasta
// `maxDuration` (promesa reducida, §3.8). Módulo sin `server-only` para poder
// probarlo con `node --test`.
import { AsyncLocalStorage } from "node:async_hooks";

const als = new AsyncLocalStorage<AbortSignal>();

/** Corre `fn` con `senal` como señal de la solicitud. */
export function conSenal<T>(senal: AbortSignal, fn: () => Promise<T>): Promise<T> {
  return als.run(senal, fn);
}

/** La señal de la solicitud actual, o `null` fuera de un scope. */
export function senalActual(): AbortSignal | null {
  return als.getStore() ?? null;
}

/**
 * Combina la señal de la solicitud (si hay) con una propia. `AbortSignal.any`
 * existe desde Node 20.3; el respaldo manual cubre un runtime más viejo.
 */
export function combinarSenales(...senales: (AbortSignal | null | undefined)[]): AbortSignal | undefined {
  const reales = senales.filter((s): s is AbortSignal => !!s);
  if (!reales.length) return undefined;
  if (reales.length === 1) return reales[0];
  const any = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (typeof any === "function") return any(reales);
  const c = new AbortController();
  for (const s of reales) {
    if (s.aborted) { c.abort(s.reason); break; }
    s.addEventListener("abort", () => c.abort(s.reason), { once: true });
  }
  return c.signal;
}
