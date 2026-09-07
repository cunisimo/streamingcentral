// La intención de volver: quién abrió esta ficha y a dónde hay que devolverlo.
//
// ============================================================================
// EL BUG QUE ARREGLA
// ============================================================================
// El botón "Volver" de la ficha usa el back del navegador cuando hay una página
// nuestra atrás, y cae en `router.push("/")` cuando no la hay (ficha abierta por
// un link compartido). Ese fallback NO dispara `popstate`, así que no se escribe
// la marca de vuelta, y la ruleta no sólo no restaura: `decidirRestauracionVista`
// ve `volvio=false` y **BORRA el snapshot**, con lo cual las vueltas siguientes
// tampoco restauran.
//
// Medido en el navegador el 2026-09-06, con la ficha cargada como primer
// documento y apretando "Volver":
//
//   FICHA volver {hayHistorialInterno:false, camino:"router.push('/')"}
//   consumirVuelta: SIN MARCA
//   leerVista hay=true, firma "n,d,m"        <- el snapshot estaba y valía
//   decidir: NO VOLVIO -> olvida             <- lo destruye
//   → panel cerrado, sin tarjeta, scroll 0
//
// En desarrollo se llega ahí sin querer: una recarga completa (F5 o una recarga
// de HMR) mientras se está en la ficha vuelve a tomar la referencia del historial
// ahí mismo, así que "Volver" pasa a ser un push.
//
// ============================================================================
// POR QUÉ NO ALCANZA CON MARCAR LA VUELTA EN EL FALLBACK
// ============================================================================
// 🔴 Marcar la vuelta cada vez que el fallback corre sería PEOR que el bug: una
// ficha abierta desde WhatsApp, desde el buscador o escribiendo la URL también
// cae en ese camino, y ahí "volver" al Home tiene que empezar limpio. Con una
// marca incondicional, esa ficha ajena resucitaría una sesión vieja de la ruleta
// que el usuario ya había dejado.
//
// Por eso la intención se REGISTRA en el origen —la tarjeta de la ruleta, al
// abrir la ficha— y dice para qué ficha exacta vale. El fallback sólo marca la
// vuelta si la intención existe y es de ESA ficha.
const KEY = "yump:intencion-vuelta";

// Cuánto vale una intención. No es "corta" como la ventana de la marca de
// vuelta (8 s), y no puede serlo: esto tiene que sobrevivir todo lo que el
// usuario tarde en LEER la ficha, que son minutos. Lo que impide reutilizarla no
// es el reloj sino que se consume al usarla —una intención sirve una sola vez— y
// que está atada a un título concreto. El vencimiento es la red de contención
// para la que quedó huérfana (el usuario se fue por otro lado y volvió a esa
// ficha por un link una hora después, en la misma pestaña).
export const VENTANA_INTENCION_MS = 30 * 60 * 1000;

export interface IntencionVuelta {
  /** Hoy sólo la ruleta. Está explícito para que sumar otro origen sea agregarlo acá. */
  origen: "ruleta";
  /** La ficha exacta que se abrió. Una intención de otra ficha no sirve. */
  tipo: string;
  id: string;
  /** A dónde hay que volver. */
  ruta: string;
  t: number;
}

export function registrarIntencion(
  i: { origen: "ruleta"; tipo: string; id: string | number; ruta: string },
  ahora: number = Date.now(),
): void {
  // Sin guard de `window`: como en `lista-paginada-store`, el try/catch alcanza
  // —esto lo llama un onClick, o sea que ya es cliente— y así el módulo se puede
  // probar con un sessionStorage falso sin fabricar un `window`.
  try {
    const v: IntencionVuelta = { ...i, id: String(i.id), t: ahora };
    sessionStorage.setItem(KEY, JSON.stringify(v));
  } catch { /* sessionStorage lleno o bloqueado: no persiste, no rompe */ }
}

export function olvidarIntencion(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* ídem */ }
}

/**
 * ¿Hay una intención de volver desde ESTA ficha? Devuelve la ruta y la consume.
 *
 * Se consume aunque el llamador termine usando el back del navegador: una
 * intención vale para una vuelta, y la vuelta ya pasó.
 */
export function consumirIntencion(
  tipo: string,
  id: string | number,
  ahora: number = Date.now(),
): string | null {
  let raw: string | null = null;
  try { raw = sessionStorage.getItem(KEY); } catch { return null; }
  if (!raw) return null;
  let v: IntencionVuelta;
  try {
    const x = JSON.parse(raw);
    if (!x || typeof x !== "object" || x.origen !== "ruleta"
      || typeof x.tipo !== "string" || typeof x.id !== "string"
      || typeof x.ruta !== "string" || !Number.isFinite(x.t)) return null;
    v = x as IntencionVuelta;
  } catch { return null; }
  // De otra ficha: NO se consume. No es nuestra, y borrarla dejaría sin vuelta a
  // la que sí la generó (dos fichas abiertas en la misma pestaña).
  if (v.tipo !== tipo || v.id !== String(id)) return null;
  olvidarIntencion();
  return ahora - v.t <= VENTANA_INTENCION_MS ? v.ruta : null;
}

/** Qué hace el botón "Volver". Pura, para poder probarla sin router ni DOM. */
export type Vuelta =
  | { tipo: "back" }
  | { tipo: "push"; ruta: string; marcarVuelta: boolean };

export function decidirVuelta(hayHistorialInterno: boolean, rutaIntencion: string | null): Vuelta {
  // Con historial nuestro atrás, el back del navegador es el camino bueno: la
  // marca de vuelta la escribe el `popstate` y todo el mecanismo compartido
  // funciona como siempre.
  if (hayHistorialInterno) return { tipo: "back" };
  // Sin historial, pero la ficha se abrió desde la ruleta: se emula la vuelta.
  if (rutaIntencion) return { tipo: "push", ruta: rutaIntencion, marcarVuelta: true };
  // Ficha ajena (link compartido, buscador, URL a mano): al Home, y limpio.
  return { tipo: "push", ruta: "/", marcarVuelta: false };
}
