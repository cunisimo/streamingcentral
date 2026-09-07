// Dónde tiene que quedar la página al volver de una ficha a la ruleta.
//
// ============================================================================
// POR QUÉ NO ALCANZA CON GUARDAR `window.scrollY`
// ============================================================================
// El resto de las vistas restauradas de la app SON la página: en `/proximamente`
// o en `/top`, el contenido que se restaura ocupa todo, así que un número de
// scroll y ese contenido son la misma cosa. La ruleta no: es UN bloque en el
// medio del Home, con el hero, "Elegidas para vos" y los rieles arriba, todos
// asíncronos. Un desplazamiento absoluto describe el documento, no la sección, y
// cualquier cosa que pase arriba —o cualquiera que mueva el scroll después de
// nosotros— deja al usuario mirando otra parte del Home.
//
// Lo que el dueño pidió es literalmente eso: "que no sólo me muestre el último
// estado de la sección sino también la sección".
//
// Así que se guarda **dónde estaba la sección dentro de la pantalla** (`ancla`:
// la distancia entre el borde de arriba de la ventana y el borde de arriba del
// bloque) y al volver se recalcula el desplazamiento que la deja en ese mismo
// lugar. Si la sección se movió, el número cambia y el resultado visual es el
// mismo, que es lo único que le importa a quien mira.
//
// `y` se conserva para los snapshots viejos —los que se guardaron antes de que
// existiera el ancla— y como respaldo si el nodo no está montado.

/** La posición guardada de la sección. `ancla` puede faltar: ver arriba. */
export interface PosicionRuleta {
  /** El `window.scrollY` de cuando se guardó. Respaldo. */
  y: number;
  /** Distancia del borde superior de la sección al borde superior de la ventana. */
  ancla: number | null;
}

/** Dónde está la sección AHORA: su `top` en pantalla y el scroll actual. */
export interface SeccionEnPantalla {
  top: number;
  scrollY: number;
}

/**
 * El desplazamiento vertical que deja la sección donde estaba.
 *
 * Sin ancla, o sin la sección montada, devuelve el desplazamiento guardado: es
 * exactamente el comportamiento anterior, y es lo que hace que un snapshot
 * viejo siga restaurando algo razonable en vez de nada.
 */
export function objetivoDeScroll(pos: PosicionRuleta, seccion: SeccionEnPantalla | null): number {
  if (pos.ancla == null || !seccion) return Math.max(0, Math.round(pos.y));
  // `top + scrollY` es el borde de la sección medido desde el principio del
  // documento; restarle el ancla da el scroll que la devuelve a su lugar en la
  // pantalla. Nunca negativo: con la sección más arriba que el ancla, el tope es
  // el principio del Home.
  return Math.max(0, Math.round(seccion.top + seccion.scrollY - pos.ancla));
}

// Tolerancia en píxeles. El navegador redondea a fracciones (medimos 1020.8 en
// un scroll de 1020), y el propio anclaje de scroll de Chrome corrige de a un
// pixel: perseguir esa diferencia sería pelearse con el navegador para siempre.
export const TOLERANCIA_PX = 2;

/** ¿La página ya está donde tiene que estar? */
export function llego(actual: number, objetivo: number): boolean {
  return Math.abs(actual - objetivo) <= TOLERANCIA_PX;
}
