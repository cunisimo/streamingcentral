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

// Solo para los tests: la cola es estado de módulo y hay que poder limpiarla
// entre casos.
export function _limpiarCola() {
  enVuelo.clear();
}
