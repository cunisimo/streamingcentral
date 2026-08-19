// Estado navegable de "6 para hoy": qué chip está elegido y en qué tanda.
//
// Vive en su propio módulo —sin JSX y sin hooks— por la misma razón que
// `lib/fecha.ts` y `lib/reco-mezcla.ts`: son funciones puras y así se pueden
// probar. Que un usuario vuelva de una ficha al mismo lugar es un invariante,
// no un detalle de presentación.
//
// SE GUARDA EL MÍNIMO Y SE DERIVA EL RESTO. Del chip solo se persiste el slug;
// la etiqueta, el emoji y el objeto del chip salen de la lista. Guardar el
// objeto entero significaría que renombrar un chip deja estados viejos con el
// nombre anterior dando vueltas en el sessionStorage de la gente.
//
// sessionStorage y no localStorage, igual que el scroll: es estado de una
// sesión de navegación. Abrir la app mañana tiene que empezar en "6 para hoy",
// no en el chip de terror que elegiste anoche.
const KEY = "yump:hero-estado";

export interface EstadoHero {
  slug: string;    // "todos" cuando no hay chip elegido
  offset: number;  // cuántas veces se tocó "Mostrame otras"
}

export const ESTADO_INICIAL: EstadoHero = { slug: "todos", offset: 0 };

// Se valida lo leído en vez de confiar: el sessionStorage puede tener una
// versión vieja del formato, o quedar a medias. Ante cualquier duda se vuelve al
// estado inicial, que siempre es válido.
export function normalizar(v: unknown): EstadoHero {
  if (!v || typeof v !== "object") return ESTADO_INICIAL;
  const o = v as Record<string, unknown>;
  const slug = typeof o.slug === "string" && o.slug ? o.slug : "todos";
  const offset = Number.isInteger(o.offset) && (o.offset as number) >= 0 ? (o.offset as number) : 0;
  return { slug, offset };
}

export function leerEstadoHero(): EstadoHero {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? normalizar(JSON.parse(raw)) : ESTADO_INICIAL;
  } catch {
    return ESTADO_INICIAL;
  }
}

export function guardarEstadoHero(e: EstadoHero) {
  try {
    // El estado inicial no se guarda: se borra. Así, si el usuario vuelve a "6
    // para hoy", volver de una ficha lo deja ahí y no en el chip anterior.
    if (e.slug === "todos" && e.offset === 0) sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, JSON.stringify(e));
  } catch {
    /* no persiste, no rompe */
  }
}

// Clave del scroll horizontal del hero. Incluye el chip Y la tanda a propósito:
// cada conjunto de 6 títulos es contenido distinto, así que tiene su propia
// posición. El efecto secundario es el que se quiere — al cambiar de chip o
// tocar "Otras", la clave es nueva, no hay nada guardado y el riel arranca del
// principio (ver el `?? 0` de useTrackScroll).
export function claveTrackHero(e: EstadoHero): string {
  return `hero:${e.slug}:${e.offset}`;
}
