// La FRONTERA entre construir la respuesta y liberar el trabajo de fondo
// (Etapa 3.b, auditoría de Codex sobre c84996e).
//
// 🔴 EL AGUJERO. El programador de fondo esperaba un microtick y arrancaba la
// composición apenas `waitUntil` la había registrado. Pero "registrada" no es
// "respondida": después de que `servirConTurno` devuelve el UB, `homePayload`
// sigue (imprime la línea `[home]`), y recién después la ruta construye su
// `NextResponse`. Con el microtick, `composeHome` empezaba ANTES de que la
// respuesta existiera: el fondo se metía en el camino crítico.
//
// La frontera es explícita y no depende de microticks ni de milisegundos: el
// handler corre dentro de `conFronteraDeFondo`, y toda tarea registrada
// mientras corre espera una COMPUERTA que se abre cuando el handler ya
// devolvió su respuesta construida (cabeceras incluidas: se envuelve el
// handler completo, `conCors` incluido). Sin frontera declarada no hay
// compuerta y el programador NO registra nada: el camino es el bloqueante de
// siempre. Si el handler lanza, la compuerta se abre igual en `finally`: una
// tarea registrada nunca queda colgada de `waitUntil`.
//
// Módulo puro (AsyncLocalStorage), probable con `node --test`.
import { AsyncLocalStorage } from "node:async_hooks";

interface Frontera {
  liberada: boolean;
  esperando: (() => void)[];
}

const als = new AsyncLocalStorage<Frontera>();

function abrir(f: Frontera) {
  f.liberada = true;
  for (const r of f.esperando.splice(0)) r();
}

/** Corre `fn` (el handler) con una frontera propia; al devolver —o lanzar— abre la compuerta. */
export async function conFronteraDeFondo<T>(fn: () => Promise<T>): Promise<T> {
  const f: Frontera = { liberada: false, esperando: [] };
  try {
    return await als.run(f, fn);
  } finally {
    abrir(f);
  }
}

/** Envuelve un handler `(…args) => Promise<Response>` con la frontera. */
export function conFrontera<A extends unknown[], R>(handler: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return (...args) => conFronteraDeFondo(() => handler(...args));
}

/**
 * La compuerta de la solicitud actual: una promesa que resuelve cuando el
 * handler devolvió su respuesta. `null` si no hay frontera declarada (fuera de
 * un handler envuelto): entonces no hay fondo.
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
