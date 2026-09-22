// Cómo abre la entrada a Pelimatch. Puro y client-safe.
//
// El dueño pidió que Pelimatch se abra en una PESTAÑA NUEVA y que el Home quede
// en la original. En un navegador eso es `target="_blank"` y listo.
//
// 🔴 EN UNA PWA INSTALADA NO HAY PESTAÑAS, y abrir `_blank` desde ahí **saca al
// usuario de la app**: el sistema lo manda al navegador, que es OTRO CONTEXTO DE
// ALMACENAMIENTO (limitación de iOS ya documentada en CLAUDE.md: instalar crea
// un contexto nuevo, por eso existe `StandaloneWelcome`). O sea que ahí
// "pestaña nueva" no conserva el Home: lo reemplaza por una ventana sin sesión,
// sin "mis plataformas" y sin la credencial de la sala guardada. Por eso en
// `standalone` —y en el contenedor nativo, donde tampoco hay pestañas— se abre
// en la misma vista, que es lo que el dueño pidió el 19/09 para iPhone/PWA.
// Queda declarado para que lo decida si quiere otra cosa.
export interface ContextoApertura {
  /** `display-mode: standalone` (o `navigator.standalone` en iOS). */
  standalone: boolean;
  /** El bundle del contenedor Android (`ES_NATIVO`). */
  nativo: boolean;
}

/** ¿La entrada lleva `target="_blank"`? */
export function abreEnPestanaNueva(c: ContextoApertura): boolean {
  return !c.standalone && !c.nativo;
}

/** El `target` y el `rel` del enlace. `rel` viaja SIEMPRE que haya target. */
export function atributosEnlace(c: ContextoApertura): { target?: "_blank"; rel?: string } {
  return abreEnPestanaNueva(c) ? { target: "_blank", rel: "noopener noreferrer" } : {};
}

/** Lee el contexto del navegador. Fuera del navegador (SSR) devuelve el caso conservador. */
export function contextoDelNavegador(nativo: boolean): ContextoApertura {
  if (typeof window === "undefined") return { standalone: true, nativo };
  let standalone = false;
  try {
    // `window.navigator`, no el global suelto: en el navegador son el mismo
    // objeto, y así el doble de los tests puede traer el suyo.
    standalone = window.matchMedia?.("(display-mode: standalone)").matches === true
      || (window.navigator as { standalone?: boolean } | undefined)?.standalone === true;
  } catch { standalone = false; }
  return { standalone, nativo };
}
