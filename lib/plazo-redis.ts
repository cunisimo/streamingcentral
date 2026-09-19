// El PLAZO COMPARTIDO de una operación lógica de Redis (3.c.1, auditoría sobre
// 1403ae4). Viaja por AsyncLocalStorage, como la señal de la solicitud
// (lib/senal-solicitud.ts) y las métricas: el cliente ACOTADO de lib/cache.ts
// tiene `signal` como FUNCIÓN y la llama al empezar CADA petición HTTP; dentro
// de `conPlazoRedis` esa función devuelve esta señal, así que todos los
// comandos de la operación —TOMAR, el GET de reconciliación, el segundo TOMAR—
// comparten UN plazo y, vencido, el que esté en vuelo se aborta (el SDK 1.38.0
// lanza y no reintenta) y el siguiente no llega a salir. Fuera de un scope no
// hay plazo y el cliente usa su timeout por petición de siempre.
//
// Módulo sin `server-only` y sin importar el cliente: lo usan lib/cache.ts (la
// función `signal` del cliente acotado) y los dobles de las pruebas.
import { AsyncLocalStorage } from "node:async_hooks";

const als = new AsyncLocalStorage<AbortSignal>();

/** Corre `fn` con `senal` como plazo compartido de todos sus comandos de Redis acotados. */
export function conPlazoRedis<T>(senal: AbortSignal, fn: () => Promise<T>): Promise<T> {
  return als.run(senal, fn);
}

/** El plazo de la operación lógica en curso, o `null` fuera de un scope. */
export function plazoRedisActual(): AbortSignal | null {
  return als.getStore() ?? null;
}
