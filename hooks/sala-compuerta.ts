// La compuerta monotónica de `useSala` (plan de salas, Tarea 3.2). Pura.
//
// Varias lecturas de `sala_estado` pueden estar en vuelo a la vez (señal del
// canal + respaldo + volver a la pestaña), y la red no respeta el orden en que
// salieron. Sin esto, una respuesta VIEJA que llega después de una nueva pisa
// el estado y la vista retrocede (una card ya votada vuelve a aparecer, "3 de
// 3 terminaron" vuelve a "2 de 3"). Y al cambiar de sala o de credencial, una
// respuesta de la sala anterior no puede escribir sobre la nueva.
//
// Cada lectura pide un TICKET al salir (`emitir`) y sólo aplica su resultado si
// la compuerta lo admite al volver (`aplicar`): mismo número de generación y
// más nuevo que el último aplicado. Aplica tanto al éxito como al error: un
// error viejo tampoco tiene por qué tapar un estado nuevo.
export interface Ticket { gen: number; n: number }

export interface Compuerta {
  /** Sale una lectura: ticket con la generación actual y un número creciente. */
  emitir(): Ticket;
  /** Volvió una lectura: ¿se aplica? Si sí, queda como la última aplicada. */
  aplicar(t: Ticket): boolean;
  /** Cambió la sala o la credencial: todo lo emitido antes queda descartado. */
  reiniciar(): void;
  /** Sólo diagnóstico/tests. */
  estado(): { gen: number; emitidas: number; aplicada: number };
}

export function crearCompuerta(): Compuerta {
  let gen = 0, emitidas = 0, aplicada = 0;
  return {
    emitir: () => ({ gen, n: ++emitidas }),
    aplicar: (t) => {
      if (t.gen !== gen || t.n <= aplicada) return false;
      aplicada = t.n;
      return true;
    },
    reiniciar: () => { gen++; emitidas = 0; aplicada = 0; },
    estado: () => ({ gen, emitidas, aplicada }),
  };
}
