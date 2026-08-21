// El almacén de las vistas paginadas: qué títulos tenía cargados, en qué página
// iba y dónde estaba el scroll.
//
// POR QUÉ EXISTE. Volver de una ficha a `/lista/ultimos` te devolvía a la página
// 1 y al scroll 0: si habías apretado "Cargar más" tres veces, perdías las tres
// y el lugar donde estabas. Lo mismo en `/buscar` y en `/directores`. No era un
// patrón, era un bug repetido en cada vista paginada — por eso esto vive en
// `hooks/` y no adentro de una vista.
//
// Está separado del hook por la misma razón que `track-scroll-store`: un hook
// necesita un DOM que dispare scroll y ejecute `requestAnimationFrame`, y eso no
// existe en `node --test`. Lo que sí se puede probar es el contrato del almacén,
// que es donde están las decisiones (cuándo restaurar y cuándo empezar limpio).
//
// sessionStorage y no localStorage, igual que el scroll horizontal: es estado de
// una sesión de navegación, no una preferencia. Abrir la app mañana empieza de
// cero.
const KEY = "yump:lista-paginada";
const KEY_VUELTA = "yump:lista-vuelta";

// Cuánto vale la marca de "volví con el botón atrás". Es una ventana y no un
// booleano eterno porque el `popstate` lo dispara CUALQUIER vuelta atrás, no
// solo la que va a una lista: si el usuario vuelve de la lista al Home, la marca
// queda puesta sin que nadie la consuma. Con la ventana, esa marca huérfana se
// vence sola en vez de disparar una restauración a destiempo.
//
// 8 segundos: una transición de ruta puede tardar bastante con la red mala, y
// pasarse de corto convierte la restauración en algo que "a veces anda".
export const VENTANA_VUELTA_MS = 8000;

export interface EstadoLista<T, E = unknown> {
  // Lo que invalida el estado guardado. Hoy son las plataformas elegidas: con
  // otras plataformas la lista es otra y restaurarla sería mostrar títulos que
  // el usuario ya no puede ver. Va adentro del estado y no en la clave para que
  // cambiar de plataformas PISE lo viejo en vez de dejarlo acumulado.
  firma: string;
  items: T[];
  pagina: number;
  hayMas: boolean;
  scrollY: number;
  // Estado propio de la vista que también tiene que volver. Lo usa la lista de
  // miniseries para el total del catálogo: sin esto el subtítulo pasaba de
  // "60 de 627 títulos" a "60 títulos" al volver — una restauración a medias se
  // nota justo en el detalle que el usuario estaba mirando.
  extra?: E;
}

type Store = Record<string, EstadoLista<unknown, unknown>>;

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

// El estado guardado de una vista, SOLO si sigue valiendo.
//
// Devuelve null —y además OLVIDA— cuando la firma no coincide. Las dos mitades
// importan: sin la primera se restauraría una lista de otras plataformas; sin la
// segunda, ese estado inválido se quedaría esperando a la próxima visita.
export function leerLista<T, E = unknown>(clave: string, firma: string): EstadoLista<T, E> | null {
  const e = leer()[clave] as EstadoLista<T, E> | undefined;
  if (!e || typeof e !== "object" || !Array.isArray(e.items)) return null;
  if (e.firma !== firma) { olvidarLista(clave); return null; }
  return e;
}

export function guardarLista<T, E = unknown>(clave: string, estado: EstadoLista<T, E>) {
  const store = leer();
  store[clave] = estado as EstadoLista<unknown, unknown>;
  escribir(store);
}

export function olvidarLista(clave: string) {
  const store = leer();
  if (clave in store) { delete store[clave]; escribir(store); }
}

// --- La marca de "volví atrás" ----------------------------------------------
// Restaurar SIEMPRE que se monta la vista sería incorrecto: entrar por primera
// vez, o entrar de nuevo desde el Home, tiene que empezar arriba y con la lista
// limpia. Lo único que justifica restaurar es haber vuelto — y eso lo dice el
// `popstate` del navegador, que solo dispara en atrás/adelante y no cuando se
// navega con un link.
//
// `ahora` se inyecta para poder probar el vencimiento sin esperar 8 segundos.
export function marcarVuelta(ahora: number = Date.now()) {
  try { sessionStorage.setItem(KEY_VUELTA, String(ahora)); } catch { /* ídem */ }
}

// Lee la marca Y LA BORRA: una vuelta restaura una vez. Sin el borrado, la misma
// marca justificaría restaurar en cada montaje siguiente.
export function consumirVuelta(ahora: number = Date.now()): boolean {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(KEY_VUELTA);
    sessionStorage.removeItem(KEY_VUELTA);
  } catch {
    return false;
  }
  const t = Number(raw);
  if (!raw || !Number.isFinite(t)) return false;
  return ahora - t <= VENTANA_VUELTA_MS;
}

// Qué hacer al montar una vista paginada: restaurar lo guardado, o empezar
// limpia y tirar lo que hubiera.
//
// Vive acá, y no como un `if` suelto adentro del hook, porque es LA decisión de
// todo esto y es lo único que se puede probar sin un DOM.
export function decidirRestauracion<T, E = unknown>(opts: {
  clave: string;
  firma: string;
  volvio: boolean;
}): EstadoLista<T, E> | null {
  const guardado = leerLista<T, E>(opts.clave, opts.firma);
  if (!opts.volvio) {
    // Entrada normal: arriba de todo y sin herencia. Se olvida explícitamente en
    // vez de dejarlo vencer, porque "empezar limpio" tiene que incluir no
    // arrastrar lo anterior a la vuelta siguiente.
    if (guardado) olvidarLista(opts.clave);
    return null;
  }
  return guardado;
}
