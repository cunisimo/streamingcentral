// Ciclo de foco de un diálogo modal.
//
// La lógica vive acá, separada del componente, para poder probarla: `AvatarModal`
// es un componente cliente con `useAuth` adentro y no se puede montar en
// `node --test`. Lo que importa —a qué elemento va el foco cuando alguien
// aprieta Tab en el último control, o Shift+Tab en el primero— es aritmética
// sobre una lista, y eso sí se prueba.
//
// Verificar que existe un `tabIndex` no prueba nada: el foco se escapa igual.
//
// ⚠️ ALCANCE. Los tests de este módulo prueban la ARITMÉTICA, no el cableado al
// DOM: el proyecto no tiene arnés de DOM, así que `AvatarModal` no se monta en
// ningún test. Que `querySelectorAll`, los `focus()` y los listeners estén bien
// conectados se verifica A MANO — la lista está en `docs/AVATARES.md`.

/** Lo mínimo de un elemento enfocable para decidir el ciclo. */
export interface Enfocable {
  /** `true` si está deshabilitado o escondido: se saltea. */
  inerte?: boolean;
}

/** Selector de lo que cuenta como enfocable dentro del diálogo. */
export const SELECTOR_ENFOCABLE = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * A qué índice va el foco al apretar Tab.
 *
 * Devuelve `null` cuando **no hay que interceptar**: el foco sigue su curso
 * natural adentro del diálogo. Sólo devuelve un índice en los dos bordes, que es
 * donde el foco se escaparía a la página de atrás.
 *
 * `actual = -1` significa que el foco está en el contenedor o afuera; ahí Tab
 * entra al primero y Shift+Tab al último.
 */
export function siguienteFoco(
  cantidad: number, actual: number, shift: boolean,
): number | null {
  if (cantidad <= 0) return null;
  if (actual < 0) return shift ? cantidad - 1 : 0;
  if (shift && actual === 0) return cantidad - 1;        // borde de arriba
  if (!shift && actual === cantidad - 1) return 0;       // borde de abajo
  return null;                                           // el navegador se encarga
}

/**
 * Dónde arranca el foco al abrir.
 *
 * En un control ÚTIL, no en el contenedor: si el diálogo trae una opción ya
 * seleccionada, ahí; si no, en el primer enfocable. Aterrizar en el `<div>` deja
 * a quien navega con teclado sin saber dónde está y obliga a un Tab de más.
 */
export function focoInicial(
  cantidad: number, indiceSeleccionado: number,
): number | null {
  if (cantidad <= 0) return null;
  if (indiceSeleccionado >= 0 && indiceSeleccionado < cantidad) return indiceSeleccionado;
  return 0;
}

/**
 * ¿Este gesto cierra el diálogo?
 *
 * `guardando` bloquea el cierre: mientras la petición está en vuelo, un Escape o
 * un clic en el fondo dejarían la pantalla cerrada con una escritura a mitad de
 * camino, y la persona no sabría si su avatar quedó guardado o no.
 */
export function cierraElDialogo(
  gesto: "escape" | "fondo" | "cancelar", guardando: boolean,
): boolean {
  if (guardando) return false;
  return gesto === "escape" || gesto === "fondo" || gesto === "cancelar";
}

// ============================================================================
// Qué se puede hacer MIENTRAS se guarda
// ============================================================================

/**
 * ¿Se puede cambiar la selección?
 *
 * Mientras `updateAvatar` está en vuelo, **no**. Antes sólo se bloqueaban
 * Guardar y Cancelar, y los 31 botones seguían activos: se podía marcar B con la
 * petición ya guardando A, y quedaba una pantalla mostrando B mientras la base
 * recibía A. La incoherencia no era visible hasta recargar.
 */
export function puedeElegir(guardando: boolean): boolean {
  return !guardando;
}

/**
 * La selección que corresponde después de un toque.
 *
 * Es la función que el componente llama de verdad, no una copia para el test:
 * si está guardando devuelve la selección ACTUAL, o sea que el toque no hace
 * nada.
 */
export function nuevaSeleccion(
  actual: string | null, tocado: string, guardando: boolean,
): string | null {
  return puedeElegir(guardando) ? tocado : actual;
}

/**
 * Cómo se bloquea un control durante el guardado.
 *
 * **`aria-disabled` y NO el atributo `disabled`**, y la diferencia importa: un
 * elemento con `disabled` deja de ser enfocable, así que si el foco estaba
 * encima —y lo está, porque acabás de tocar Guardar— se cae al `<body>`. Con eso
 * el ciclo de foco se rompe justo en el momento en que la persona no puede hacer
 * nada más que esperar.
 *
 * Con `aria-disabled` el control sigue en el orden de tabulación, el foco no se
 * pierde, y quien lo tenga escucha "no disponible". El bloqueo real lo hace el
 * manejador, que no hace nada.
 */
export function atributosBloqueo(guardando: boolean): {
  "aria-disabled": boolean | undefined;
} {
  return { "aria-disabled": guardando || undefined };
}
