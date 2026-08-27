// Qué se muestra cuando un guardado falla.
//
// EL PROBLEMA QUE RESUELVE. En la verificación manual del 27/08, cortar la red y
// tocar Guardar en el selector de avatares mostraba en pantalla, tal cual:
//
//     TypeError: Failed to fetch
//
// Eso es el error crudo del navegador puesto en la interfaz. La recuperación
// funcionaba —las opciones y los botones se reactivaban y se podía reintentar—,
// así que lo único roto era el texto. Y no es un detalle cosmético: alguien que
// lee "TypeError" no sabe que lo único que tiene que hacer es volver a intentar.
//
// LA DECISIÓN SALE DEL ERROR, NO DE `navigator.onLine`. Esa propiedad miente:
// da `true` con un portal cautivo, con el wifi conectado pero sin salida, y con
// el servidor caído del otro lado. El error que YA ocurrió es el dato confiable.
//
// Se traducen sólo los fallos de red, que son los que la persona puede resolver.
// Cualquier otro cae en el genérico y **el detalle técnico no viaja a la
// pantalla**: quien lo necesite lo tiene en la consola del navegador.

/** Falló la red: es lo único que la persona puede arreglar por su cuenta. */
export const CONEXION = "No se pudo guardar. Revisá tu conexión y probá de nuevo.";

/** Cualquier otro fallo. No se inventa una causa que no sabemos. */
export const GENERICO = "No se pudo guardar. Probá de nuevo en un momento.";

/**
 * Las formas en que cada navegador escribe "no salió el pedido".
 *
 * Son varias porque no hay una sola: Chrome dice `Failed to fetch`, Firefox
 * `NetworkError when attempting to fetch resource`, Safari `Load failed` o
 * `The Internet connection appears to be offline`, React Native
 * `Network request failed` y Node `fetch failed`. Ninguna es un código: es texto
 * libre, así que esto es una heurística y por eso el default es el genérico —
 * una forma nueva da un mensaje menos preciso, nunca jerga en pantalla.
 */
const DE_RED = /failed to fetch|networkerror|load failed|network request failed|fetch failed|connection appears to be offline|network ?error/i;

/**
 * El texto que va en pantalla para un error de guardado.
 *
 * Devuelve `""` cuando no hubo error: el hueco del mensaje se renderiza siempre,
 * y un texto por defecto haría que el diálogo abriera mostrando un error que no
 * pasó.
 *
 * Es PURA: mismo error, mismo texto, sin mirar nada del entorno.
 */
export function mensajeDeGuardado(error: string | null | undefined): string {
  const crudo = typeof error === "string" ? error.trim() : "";
  if (!crudo) return "";
  return DE_RED.test(crudo) ? CONEXION : GENERICO;
}
