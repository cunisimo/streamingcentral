// Los recordatorios de estreno en Android: cuándo avisar, con qué identificador
// y con qué texto.
//
// Es un módulo PURO a propósito. Lo que decide si el aviso llega el día correcto
// —o si llega— son tres cuentas chicas, y las tres se rompen en silencio: un
// desplazamiento de huso deja el aviso el día anterior, un identificador
// inestable hace que el segundo toque no cancele nada, y uno fuera de rango lo
// rechaza Android sin decir por qué. Nada de eso se puede probar contra un
// teléfono en cada cambio; acá sí.

/** La hora local del aviso. No es configurable a propósito: v1. */
export const HORA_AVISO = 10;

/** El canal de Android. Sonido por defecto, sin audio propio. */
export const CANAL_ESTRENOS = {
  id: "estrenos",
  name: "Estrenos",
  description: "Avisos de los estrenos que agendaste",
  // 4 = IMPORTANCE_DEFAULT en el plugin (sonido y aviso en la barra).
  importance: 4 as const,
};

export type Programacion =
  /** Hay futuro: se puede programar para `at`. */
  | { estado: "programable"; at: Date }
  /** Es HOY y las 10:00 ya pasaron: no tiene sentido un aviso que llega tarde. */
  | { estado: "hoy-tarde" }
  /** La fecha ya pasó. */
  | { estado: "pasado" }
  /** No hay fecha, o no tiene la forma esperada. */
  | { estado: "sin-fecha" };

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Cuándo hay que avisar por un estreno con fecha `YYYY-MM-DD`.
 *
 * 🔴 LA FECHA SE ARMA CON EL CONSTRUCTOR LOCAL, NO CON `new Date(iso)`.
 * `new Date("2026-09-20")` se interpreta como MEDIANOCHE UTC, así que en
 * Argentina (UTC-3) es el 19 a las 21:00: el aviso caería el día anterior. Con
 * `new Date(2026, 8, 20, 10, 0, 0)` son las 10 de la mañana del teléfono, sea
 * cual sea el huso — que es exactamente lo que se le prometió al usuario.
 */
export function momentoDeAviso(fecha: string | null | undefined, ahora: Date = new Date()): Programacion {
  const m = typeof fecha === "string" ? fecha.match(ISO) : null;
  if (!m) return { estado: "sin-fecha" };
  const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const at = new Date(a, mes - 1, d, HORA_AVISO, 0, 0, 0);
  // Una fecha imposible (2026-02-31) se desborda al mes siguiente: se rechaza.
  if (at.getFullYear() !== a || at.getMonth() !== mes - 1 || at.getDate() !== d) {
    return { estado: "sin-fecha" };
  }
  if (at.getTime() > ahora.getTime()) return { estado: "programable", at };
  const mismoDia = at.getFullYear() === ahora.getFullYear()
    && at.getMonth() === ahora.getMonth()
    && at.getDate() === ahora.getDate();
  return mismoDia ? { estado: "hoy-tarde" } : { estado: "pasado" };
}

/** El tope de un entero con signo de 32 bits, que es lo que acepta Android. */
export const MAX_ID = 2_147_483_647;

/**
 * El identificador del aviso: estable, propio de cada título y dentro de rango.
 *
 * 🔴 NO ES UN HASH NI UN NÚMERO AL AZAR. Tiene que ser el MISMO cada vez que se
 * pregunta por el mismo título —si no, el segundo toque no cancela nada y el
 * botón muestra un estado que no existe—, y tiene que distinguir película de
 * serie: TMDB reusa los ids entre los dos catálogos, así que `movie:1399` y
 * `tv:1399` son títulos distintos con el mismo número.
 *
 * `id * 2` para películas e `id * 2 + 1` para series es una biyección: no hay
 * colisiones que justificar. El id más alto que devuelve TMDB hoy anda por
 * 1,9 millones, o sea que el doble entra holgado en los 2.147 millones que
 * admite Android; igual se valida, porque el día que no entre hay que enterarse
 * acá y no por un aviso que nunca llega.
 */
export function idRecordatorio(tipo: "movie" | "tv", id: number): number | null {
  if (!Number.isInteger(id) || id <= 0) return null;
  const n = id * 2 + (tipo === "tv" ? 1 : 0);
  return n > MAX_ID ? null : n;
}

/** El texto del aviso. Sin plataforma, no se inventa la parte del "en". */
export function textoDeAviso(titulo: string, plataforma?: string | null): string {
  return `Hoy se estrena ${titulo}${plataforma ? ` en ${plataforma}` : ""}`;
}

/** Lo único que viaja en `extra`: a qué ficha hay que ir al tocar el aviso. */
export interface ExtraAviso { tipo: "movie" | "tv"; id: number }

export function extraDeAviso(tipo: "movie" | "tv", id: number): ExtraAviso {
  return { tipo, id };
}

/**
 * Lee el `extra` de una notificación, validando.
 *
 * Lo que llega acá lo devuelve el sistema operativo después de días guardado, y
 * termina en una navegación: se valida antes de usarlo, no se confía.
 */
export function leerExtraAviso(x: unknown): ExtraAviso | null {
  if (!x || typeof x !== "object") return null;
  const { tipo, id } = x as Record<string, unknown>;
  if (tipo !== "movie" && tipo !== "tv") return null;
  const n = typeof id === "number" ? id : Number(id);
  if (!Number.isInteger(n) || n <= 0) return null;
  return { tipo, id: n };
}
