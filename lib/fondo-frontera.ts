// La FRONTERA entre entregar la respuesta y liberar el trabajo de fondo
// (Etapa 3.b, auditorías de Codex sobre c84996e y 3a057fc).
//
// 🔴 LOS DOS AGUJEROS QUE CIERRA.
//   1. (c84996e) El programador esperaba un microtick tras registrar en
//      `waitUntil`. "Registrada" no es "respondida": `composeHome` arrancaba
//      antes de que la ruta construyera su `NextResponse`.
//   2. (3a057fc) La compuerta se abría en el `finally` del handler. Eso
//      encola las continuaciones del fondo como MICROTASKS, y la promesa que
//      `GET` devuelve se resuelve para su llamador en otro microtask
//      posterior: el orden era `respuesta-construida → fondo-inicia →
//      caller-recibio-response`. El primer tramo síncrono de la composición
//      seguía dentro del camino crítico de la entrega.
//
// La frontera: el handler corre dentro de `conFronteraDeFondo`; al devolver —o
// lanzar— NO se abre la compuerta en el acto: primero se CEDE al event loop
// (`ceder`, por defecto `setImmediate`) y recién en esa vuelta se abre. Por
// qué eso garantiza que el llamador recibe la respuesta primero: en Node, la
// cola de microtasks (continuaciones de promesas y `process.nextTick`) se
// vacía POR COMPLETO antes de la fase `check` en la que corre `setImmediate`.
// El llamador de `GET` (`const r = await GET(req)`, o el runtime de Next, que
// hace lo mismo) recibe el `Response` en una de esas continuaciones, así que
// para cuando `setImmediate` dispara, ya lo tiene. Es una frontera de FASE
// del event loop, no una demora ni una cantidad de microticks: no depende de
// cuántos `await` haya en la cadena de promesas entre el handler y su
// llamador. `setImmediate` es la primitiva estándar de Node para "después
// de la vuelta actual" (a diferencia de `setTimeout(0)`, que depende de la
// fase de timers y de su granularidad de 1 ms). `ceder` es inyectable para
// probar el orden con un doble.
//
// Lo que la frontera NO garantiza: que los BYTES hayan salido al usuario. Eso
// lo hace el runtime después de recibir el `Response`, con I/O propia, y sólo
// se observa desde afuera (Preview/Producción). La compuerta garantiza
// "respuesta construida y promesa del handler entregada al llamador".
//
// Sin frontera declarada no hay compuerta y el programador NO registra nada:
// el camino es el bloqueante de siempre. Si el handler lanza, la compuerta se
// abre igual (`finally` → ceder → abrir): una tarea registrada nunca queda
// colgada de `waitUntil`. Cada `conFronteraDeFondo` es una frontera propia
// (AsyncLocalStorage): dos solicitudes concurrentes no comparten compuerta.
//
// Módulo puro, probable con `node --test`.
import { AsyncLocalStorage } from "node:async_hooks";

interface Frontera {
  liberada: boolean;
  esperando: (() => void)[];
}

export interface OpcionesFrontera {
  /** Cede al event loop antes de abrir la compuerta. Default: `setImmediate`. */
  ceder?: () => Promise<void>;
}

const als = new AsyncLocalStorage<Frontera>();
const cederPorDefecto = (): Promise<void> => new Promise<void>((r) => setImmediate(r));

function abrir(f: Frontera) {
  f.liberada = true;
  for (const r of f.esperando.splice(0)) r();
}

/**
 * Corre `fn` (el handler) con una frontera propia; al devolver —o lanzar— cede
 * al event loop y recién entonces abre la compuerta. El valor (o el error) se
 * entrega al llamador SIN esperar esa cesión: la apertura queda programada.
 */
export async function conFronteraDeFondo<T>(fn: () => Promise<T>, o: OpcionesFrontera = {}): Promise<T> {
  const f: Frontera = { liberada: false, esperando: [] };
  const ceder = o.ceder ?? cederPorDefecto;
  try {
    return await als.run(f, fn);
  } finally {
    // No se espera: la respuesta sale ya; la compuerta se abre en la vuelta
    // siguiente del event loop. Si `ceder` fallara, la compuerta se abre igual.
    void ceder().then(() => abrir(f), () => abrir(f));
  }
}

/** Envuelve un handler `(…args) => Promise<Response>` con la frontera. */
export function conFrontera<A extends unknown[], R>(handler: (...args: A) => Promise<R>, o: OpcionesFrontera = {}): (...args: A) => Promise<R> {
  return (...args) => conFronteraDeFondo(() => handler(...args), o);
}

/**
 * La compuerta de la solicitud actual: una promesa que resuelve cuando el
 * handler devolvió su respuesta y el event loop dio una vuelta (el llamador ya
 * la recibió). `null` si no hay frontera declarada (fuera de un handler
 * envuelto): entonces no hay fondo.
 */
export function compuertaDeFondo(): Promise<void> | null {
  const f = als.getStore();
  if (!f) return null;
  if (f.liberada) return Promise.resolve();
  return new Promise<void>((r) => { f.esperando.push(r); });
}

/** Sólo para pruebas y diagnóstico: ¿hay una frontera y está abierta? */
export function estadoDeLaFrontera(): "sin-frontera" | "cerrada" | "abierta" {
  const f = als.getStore();
  return !f ? "sin-frontera" : f.liberada ? "abierta" : "cerrada";
}
