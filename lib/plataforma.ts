// ¿Este bundle se construyó para el contenedor nativo?
//
// ⚠️ ES UNA BANDERA DE BUILD, NO UNA DETECCIÓN EN RUNTIME, y la diferencia es
// todo el punto. `Capacitor.isNativePlatform()` sólo se puede responder en el
// navegador: durante el prerender estático daría `false` y después de hidratar
// `true`. Con eso, los nueve enlaces internos nacerían en el HTML apuntando a
// `/titulo/movie/278` y recién cambiarían a `/t?tipo=movie&id=278` una vez
// hidratada la página — hydration mismatch, y links equivocados en el primer
// frame, que es justo cuando el usuario toca.
//
// Como sale de una variable que Next INLINEA en build, el servidor y el cliente
// producen el mismo valor desde el primer render.
//
// Este archivo NO importa `@capacitor/core` a propósito: Capacitor recién se
// instala en CP7, y esto tiene que funcionar mucho antes.
//
// La variable la inyecta `scripts/build-capacitor.mjs` en el entorno del proceso
// hijo. Nunca vive en `.env.local`, así que el build web no puede heredarla.

/** true cuando el bundle se construyó para el contenedor. En web, siempre false. */
export const ES_NATIVO: boolean = process.env.NEXT_PUBLIC_YUMP_NATIVO === "1";

/**
 * Igual que `ES_NATIVO`, en forma de función.
 *
 * `override` existe SÓLO para las pruebas, que necesitan evaluar los dos
 * caminos sin depender de `window` ni de relanzar el proceso. En producción se
 * llama sin argumentos.
 */
export function esNativo(override?: boolean): boolean {
  return override ?? ES_NATIVO;
}
