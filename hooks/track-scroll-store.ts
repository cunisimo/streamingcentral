// El almacén de posiciones de scroll horizontal, separado del hook.
//
// Está aparte porque es la parte que se puede probar: un hook necesita un DOM
// que dispare eventos de scroll y ejecute `requestAnimationFrame`, y eso no
// existe en `node --test`. Lo que sí se puede probar es el contrato del
// almacén — y ahí es donde estaban los dos bugs.
//
// sessionStorage y no localStorage a propósito: es estado de una sesión de
// navegación, no una preferencia. Abrir la app al día siguiente tiene que
// empezar de cero, igual que el scroll vertical.
const KEY = "yump:track-scroll";

type Store = Record<string, number>;

function leer(): Store {
  try {
    const raw = sessionStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v === "object" ? (v as Store) : {};
  } catch {
    return {};
  }
}

function escribir(store: Store) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* sessionStorage lleno o bloqueado: no persiste, no rompe */
  }
}

// Posición guardada de un riel, o 0.
//
// Devuelve SIEMPRE un número, y ese es el arreglo. Antes el hook hacía
// `if (guardado) el.scrollLeft = guardado`, con dos agujeros: el 0 guardado es
// falsy y no se aplicaba, y —lo que más se notaba— al cambiar de clave el
// contenedor se quedaba donde estaba. Un riel que cambia de contenido (otro
// chip, otra tanda, otro tipo) heredaba la posición del contenido anterior.
export function posicionDe(clave: string): number {
  const v = leer()[clave];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function guardarPosicion(clave: string, px: number) {
  const store = leer();
  store[clave] = Math.round(px);
  escribir(store);
}

// ¿Un clic en el toggle tiene que reiniciar el riel?
//
// Solo si el tipo CAMBIA. Tocar el toggle que ya está activo es un no-op: sin
// esta comprobación, ese clic olvidaba la posición y mandaba el riel al
// principio, o sea que tocar "Películas" estando en Películas te hacía perder
// el lugar sin cambiar nada de lo que estabas mirando.
//
// Vive acá y no como un `if` suelto en `Shelf` para que sea probable: es un
// invariante del riel, no un detalle de implementación.
export function debeReiniciar(tipoActual: string, tipoNuevo: string): boolean {
  return tipoActual !== tipoNuevo;
}

// Borra la posición guardada de un riel. La usa el toggle Películas/Series:
// resetear `scrollLeft` a mano NO alcanza en los rieles `refetch`, porque
// cuando llega el contenido nuevo el hook se vuelve a ejecutar (`listo` pasa de
// false a true) y restaura lo guardado, deshaciendo el reset. Olvidando el
// valor, la restauración pone 0 y las dos cosas quedan de acuerdo.
export function olvidarTrack(clave: string | undefined) {
  if (!clave) return;
  const store = leer();
  if (clave in store) {
    delete store[clave];
    escribir(store);
  }
}
