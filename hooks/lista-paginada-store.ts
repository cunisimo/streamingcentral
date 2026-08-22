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
  // Lo que INVALIDA el estado guardado. Hoy son las plataformas elegidas: con
  // otras plataformas la lista es otra y restaurarla sería mostrar títulos que
  // el usuario ya no puede ver. Va adentro del estado y no en la clave para que
  // cambiar de plataformas PISE lo viejo en vez de dejarlo acumulado.
  //
  // OJO CON QUÉ VA ACÁ Y QUÉ VA EN `extra`. Lo que la vista RESTAURA no puede
  // estar en la firma. El toggle Películas/Series de "Últimos lanzamientos"
  // estaba acá y era un bug: la vista monta siempre en `movie`, así que la firma
  // del montaje era `movie|…`, no coincidía con la guardada `tv|…`, y
  // `leerLista` BORRABA el estado antes de que nadie pudiera leer que el toggle
  // estaba en Series. Lo que se restaura va en `extra`; en la firma va solo lo
  // que, si cambió, obliga a tirar todo.
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
// LA MARCA GUARDA A DÓNDE SE VOLVIÓ, no solo cuándo. Con una fecha sola había
// una regresión concreta: volver con Atrás desde cualquier lado hacia una página
// que NO es la lista deja la marca puesta —nadie la consume, porque esa página
// no usa este hook— y si dentro de la ventana el usuario entra normalmente a la
// lista, esa marca ajena le restauraba un estado viejo que ya no correspondía.
// Con la ruta adentro, la marca solo vale para la ruta que la generó.
//
// `ahora` se inyecta para poder probar el vencimiento sin esperar 8 segundos.
interface Marca { ruta: string; t: number }

// El listener se registra UNA vez por carga del bundle, al importar el módulo, y
// no en un efecto de la vista. Tiene que estar puesto ANTES de que la vista se
// monte: al apretar atrás el orden es popstate → render de la ruta anterior →
// montaje de la vista, así que un listener montado con la vista llega tarde a su
// propio evento.
//
// Vive en el STORE y no en `useListaPaginada` porque no todas las vistas usan
// ese hook: `/categoria` y las listas simples hablan con el store directamente.
// Con el listener en el hook, en esas páginas no se registraba nadie y la marca
// no se escribía nunca — la restauración fallaba en silencio.
//
// `location.pathname` YA es el destino cuando corre el handler: el navegador
// cambia la URL y recién después dispara popstate.
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => marcarVuelta(window.location.pathname));
}

export function marcarVuelta(ruta: string, ahora: number = Date.now()) {
  try {
    sessionStorage.setItem(KEY_VUELTA, JSON.stringify({ ruta, t: ahora } satisfies Marca));
  } catch { /* ídem */ }
}

// ¿Se llegó a `ruta` volviendo atrás?
//
// Solo consume (borra) la marca cuando es SUYA. Una marca de otra ruta se deja
// donde está: no es de esta vista, y borrarla sería tirar información de una
// vuelta que todavía no llegó a su destino. Se vence sola.
export function consumirVuelta(ruta: string, ahora: number = Date.now()): boolean {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(KEY_VUELTA);
  } catch {
    return false;
  }
  if (!raw) return false;
  let m: Marca;
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object" || typeof v.ruta !== "string" || !Number.isFinite(v.t)) return false;
    m = v as Marca;
  } catch {
    return false;
  }
  if (m.ruta !== ruta) return false;
  // Es la nuestra: se borra pase o no pase la ventana. Una vuelta restaura UNA
  // vez, y una marca vencida no tiene por qué quedar dando vueltas.
  try { sessionStorage.removeItem(KEY_VUELTA); } catch { /* ídem */ }
  return ahora - m.t <= VENTANA_VUELTA_MS;
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

// --- Estado de vistas que NO paginan ----------------------------------------
//
// `/proximamente`, `/directores`, `/top` y las listas simples de `/lista/[key]`
// también pierden lo que tenían al volver de una ficha, pero no son listas
// paginadas: traen todo de una sola vez. Forzarlas dentro de `EstadoLista`
// significaría inventarles una `pagina` y un `hayMas` que no existen, y esa
// mentira después hay que mantenerla.
//
// Comparten el MISMO almacén y la MISMA marca de vuelta: lo que cambia es la
// forma de lo guardado, no el mecanismo. Un `popstate` solo, un `sessionStorage`
// solo.
export interface EstadoVista<D, E = unknown> {
  // Mismo criterio que en `EstadoLista`: acá va lo que INVALIDA (plataformas), y
  // lo que se RESTAURA (filtro, texto, modo) va en `extra`.
  firma: string;
  // Lo que se muestra. Puede ser un array (títulos, personas) o un objeto (el
  // payload de /top, que son bloques por plataforma).
  datos: D;
  scrollY: number;
  extra?: E;
}

// Igual que `leerLista`, pero sin exigir que `datos` sea un array: `/top` guarda
// un objeto. Lo único que se valida es que haya algo y que la firma coincida.
export function leerVista<D, E = unknown>(clave: string, firma: string): EstadoVista<D, E> | null {
  const e = leer()[clave] as unknown as EstadoVista<D, E> | undefined;
  if (!e || typeof e !== "object" || e.datos === undefined || e.datos === null) return null;
  if (e.firma !== firma) { olvidarLista(clave); return null; }
  return e;
}

export function guardarVista<D, E = unknown>(clave: string, estado: EstadoVista<D, E>) {
  const store = leer();
  (store as Record<string, unknown>)[clave] = estado;
  escribir(store);
}

// La misma decisión que `decidirRestauracion`, para las vistas sin paginación.
export function decidirRestauracionVista<D, E = unknown>(opts: {
  clave: string;
  firma: string;
  volvio: boolean;
}): EstadoVista<D, E> | null {
  const guardado = leerVista<D, E>(opts.clave, opts.firma);
  if (!opts.volvio) {
    if (guardado) olvidarLista(opts.clave);
    return null;
  }
  return guardado;
}
