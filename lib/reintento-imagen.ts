// Un reintento acotado para una imagen que no cargó, y qué hacer si tampoco.
//
// ⚠️ ESTO NO ES LA CORRECCIÓN DEL BUG DE LOS CÍRCULOS VACÍOS. La causa de ese
// bug era `loading="lazy"`, y esas imágenes **ni siquiera llegaban a pedirse**
// (`complete === false`): no hay error que reintentar. La corrección es cargar
// las 31 al montar el selector — ver `docs/ISSUES.md` → **#15**.
//
// Esto cubre el OTRO camino, el que sí es un fallo de red: hasta ahora
// `AvatarCard` no manejaba `onError`, así que una petición fallida dejaba el
// círculo vacío para siempre. Es una defensa, y se dimensiona como tal.
//
// LAS TRES REGLAS QUE LO MANTIENEN HONESTO:
//
//   · UN reintento. No un bucle. `onError` puede dispararse muchas veces —cada
//     cambio de `src` puede provocar otro—, así que el contador tiene tope y no
//     crece: sin eso, un 404 permanente sería una petición por render, para
//     siempre.
//   · Una marca FIJA en la URL, no un timestamp. Un timestamp daría una URL
//     nueva en cada fallo y con eso una entrada nueva en el cache del service
//     worker cada vez. La marca fija agrega, como mucho, UNA entrada por avatar.
//   · Un 404 permanente NO se esconde. Agotado el reintento se muestra un
//     respaldo visible en lugar del círculo vacío, y la opción deja de poder
//     elegirse: guardar un avatar cuya imagen no existe le dejaría a la persona
//     un avatar roto en toda la app.

/** El original es el intento 0; sólo se admite UNO más. */
export const INTENTO_MAXIMO = 1;

/** La marca del reintento. Fija a propósito: ver el encabezado. */
const MARCA = "reintento=1";

/**
 * La URL que corresponde a este intento.
 *
 * El intento 0 es la ruta tal cual. Cualquier intento posterior devuelve
 * SIEMPRE la misma URL marcada: no existe una tercera.
 */
export function urlDeIntento(src: string, intento: number): string {
  if (intento <= 0) return src;
  return src.includes("?") ? `${src}&${MARCA}` : `${src}?${MARCA}`;
}

/**
 * Qué corresponde después de un `onError`.
 *
 * Devuelve el intento siguiente y si ya se agotó. El intento nunca pasa de
 * `INTENTO_MAXIMO`, así que llamarla de más es inofensivo.
 */
export function trasError(intento: number): { intento: number; agotado: boolean } {
  if (intento < INTENTO_MAXIMO) return { intento: intento + 1, agotado: false };
  return { intento: INTENTO_MAXIMO, agotado: true };
}

/**
 * ¿Se puede elegir esta opción?
 *
 * Agotado el reintento, no: la imagen no está disponible y elegirla dejaría un
 * avatar roto en la nav, en el hub y en el perfil. El botón sigue existiendo,
 * con su nombre accesible, mostrando el respaldo.
 */
export function puedeElegirse(agotado: boolean): boolean {
  return !agotado;
}
