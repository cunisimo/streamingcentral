// "No es para mí" — la lógica de descartar un título de "Elegidas para vos".
//
// Módulo aparte, sin JSX y sin hooks, por la misma razón que `hero-estado.ts`:
// son funciones puras y así se pueden probar. Acá está lo que se puede romper en
// silencio —el orden de las escrituras y el piso del riel—, no el markup.
//
// QUÉ DESCARTA Y QUÉ NO. Descarta ESE título y nada más. No lo marca visto, no
// lo vota Malaso y no toca su temática: descartar una película navideña no tiene
// que bajar las navideñas que vengan después. Por eso el descarte no viaja al
// recomendador ni entra en su clave de cache — se filtra entero acá, del lado
// del cliente, sobre lo que el servidor ya devolvió.
//
// EL EFECTO DE FILTRAR EN EL CLIENTE es que Deshacer sale gratis y exacto. La
// lista visible se DERIVA del payload del servidor menos un `Set`, así que sacar
// una clave del `Set` devuelve la tarjeta a su lugar original sola, sin llevar
// índices ni reinsertar en una posición guardada. Un índice guardado se
// desincroniza en cuanto el payload cambia; esto no puede.
import type { MediaType } from "@/lib/types";

export const clave = (tipo: string, id: number) => `${tipo}:${id}`;

export interface Descartable { id: number; type: MediaType }

// Lo que se muestra: lo que vino del servidor, menos lo descartado.
export function visibles<T extends Descartable>(items: T[], descartados: ReadonlySet<string>): T[] {
  if (!descartados.size) return items;
  return items.filter((t) => !descartados.has(clave(t.type, t.id)));
}

// ¿Se muestra el riel?
//
// DOS PISOS DISTINTOS, y confundirlos esconde el riel solo. El piso de 10 decide
// si el riel APARECE, y se mide sobre lo que trajo el servidor. Una vez que
// apareció, descartar no lo puede ocultar: se oculta únicamente cuando no queda
// ninguna tarjeta. Si no, descartar la tercera de once haría desaparecer el riel
// entero, que es justo lo contrario de lo que la persona pidió.
export const PISO_INICIAL = 10;

export function seMuestra(traidosDelServidor: number, visiblesAhora: number): boolean {
  if (traidosDelServidor < PISO_INICIAL) return false;
  return visiblesAhora > 0;
}

// --- Orden de las escrituras -------------------------------------------------

// Encola por clave: la operación nueva de un título espera a que termine la
// anterior DE ESE TÍTULO. Las de títulos distintos siguen yendo en paralelo.
//
// Sin esto hay una carrera silenciosa y permanente. Descartar es un INSERT y
// deshacer es un DELETE; si alguien toca "Deshacer" mientras el INSERT está en
// vuelo y el DELETE se ejecuta primero, el INSERT aterriza después. La pantalla
// muestra la tarjeta restaurada y la base dice que está descartada: el título
// desaparece en la próxima carga y no hay ninguna señal de que pasó.
//
// La cola guarda la promesa YA NEUTRALIZADA (`.catch`), así que un fallo corta
// esa operación pero no bloquea la siguiente del mismo título.
const enVuelo = new Map<string, Promise<unknown>>();

export function encolar<T>(k: string, fn: () => Promise<T>): Promise<T> {
  const previa = enVuelo.get(k) ?? Promise.resolve();
  const propia = previa.then(fn, fn);
  const marcador = propia.catch(() => {});
  enVuelo.set(k, marcador);
  // La cola no crece para siempre: si esta fue la última operación del título,
  // se saca la entrada. El `=== marcador` es la comprobación que importa — si
  // mientras tanto se encoló otra, la entrada ya no es esta y no se toca.
  void marcador.then(() => { if (enVuelo.get(k) === marcador) enVuelo.delete(k); });
  return propia;
}

// Cuál fue la ÚLTIMA acción sobre cada título. La cola de arriba ordena las
// escrituras; esto resuelve algo distinto: qué respuesta tardía puede todavía
// tocar la pantalla.
//
// La secuencia que lo hace falta: descartás A, deshacés y volvés a descartar A,
// todo antes de que termine el primer INSERT. Si ese primero falla, sin esta
// comprobación saca A del Set y la tarjeta reaparece —aunque el SEGUNDO descarte
// siga vigente y se vaya a guardar bien—. La persona ve volver algo que acaba de
// descartar por segunda vez.
const ultimaAccion = new Map<string, number>();

export function registrarAccion(k: string, id: number) {
  ultimaAccion.set(k, id);
}

export function esUltimaAccion(k: string, id: number): boolean {
  return ultimaAccion.get(k) === id;
}

// Solo para los tests: la cola y el registro son estado de módulo y hay que
// poder limpiarlos entre casos.
export function _limpiarCola() {
  enVuelo.clear();
  ultimaAccion.clear();
}

// --- Leer los descartes: completo o nada -------------------------------------

// De a cuántos se leen. NO es un tope: es el tamaño de página. Un tope haría
// reaparecer títulos en silencio al pasarse, que es el peor modo de fallar acá
// —el usuario ya dijo que no y nada avisa que se ignoró—. Quien tiene 40
// descartes paga una query igual que antes; el costo extra lo paga solo quien
// pasa los 500.
export const PAGINA_DESCARTES = 500;

// El bucle, separado del cliente de Supabase para poder probarlo. Recibe cómo
// traer una página y devuelve todo junto.
//
// SI FALLA UNA PÁGINA, FALLA TODO. Devolver lo que se pudo leer sería devolver
// una lista de descartes INCOMPLETA, y con eso los títulos que faltan
// reaparecen en el riel sin que nadie se entere: la persona ve volver algo que
// ya descartó y no hay ningún error que lo explique. Prefiere romperse: el
// llamador oculta el riel, que es una ausencia visible y honesta.
export async function paginar<T>(
  traer: (desde: number, hasta: number) => Promise<{ data: T[] | null; error: unknown }>,
  tam = PAGINA_DESCARTES,
): Promise<T[]> {
  const out: T[] = [];
  for (let desde = 0; ; desde += tam) {
    const { data, error } = await traer(desde, desde + tam - 1);
    if (error) throw new Error(`No se pudieron leer los descartes: ${String(error)}`);
    const pagina = data ?? [];
    out.push(...pagina);
    // Página incompleta = no hay más. Con exactamente `tam` se pide otra, que
    // vuelve vacía: un viaje de más en un caso rarísimo, a cambio de no tener
    // que adivinar el total.
    if (pagina.length < tam) return out;
  }
}

// --- Respuestas que llegan tarde ---------------------------------------------

export interface EstadoAviso { id: number; k: string; titulo: string }

// Qué hacer con el aviso cuando responde una escritura que puede haber quedado
// vieja.
//
// LA CARRERA ES VISUAL, no de datos: la cola de arriba ya ordena lo que llega a
// la base. Descartás A, después B —el aviso ahora es de B—, y recién ahí falla
// el guardado de A. Sin esta comprobación, la respuesta de A borra el
// "Deshacer" de B y muestra un error de una tarjeta que ya no está en pantalla.
// El otro caso es deshacer mientras el INSERT sigue en curso: si después falla,
// aparece el error de algo que la persona ya revirtió.
//
// La regla: una respuesta solo toca el aviso si el aviso TODAVÍA es el de esa
// acción. La tarjeta, en cambio, se restaura siempre — que vuelva a aparecer es
// la señal honesta de que no se guardó, y no puede depender de qué aviso esté.
export function resolverAviso(
  actual: EstadoAviso | null,
  accion: number,
  fallo: boolean,
): { aviso: EstadoAviso | null; mostrarError: boolean } {
  if (actual?.id !== accion) return { aviso: actual, mostrarError: false };
  if (fallo) return { aviso: null, mostrarError: true };
  return { aviso: actual, mostrarError: false };
}
