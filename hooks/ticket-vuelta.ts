// El ticket de vuelta: cómo una vista con hijos reparte UNA marca de "volví
// atrás" sin que se la coma el primero que pregunte.
//
// EL PROBLEMA. `consumirVuelta` borra la marca al leerla, y eso está bien
// cuando hay un solo lector. En `/buscar` hay dos: el modo y el texto viven en
// `SearchView`, y los títulos y las páginas en `BrowseTitles`/`BrowseActors`. Si
// los dos preguntan, el primero se lleva la marca y el segundo recibe `false`:
// volvería el modo con la lista vacía, que es peor que el bug original.
//
// LA SOLUCIÓN NO ES UN BOOLEANO GLOBAL. Un `true` memorizado a nivel de módulo
// no tiene forma de saber cuándo dejar de valer: si el usuario vuelve, cambia de
// pestaña dentro de la misma vista y monta otro hijo, ese hijo restauraría un
// snapshot que no le corresponde. Y apagarlo "después de un render" tampoco
// sirve, porque el hijo correcto puede tardar en montarse.
//
// EL CICLO ES EXPLÍCITO Y LO CIERRA EL HIJO:
//
//   1. El padre consume la marca (una vez, al montar).
//   2. El padre restaura su propio estado — entre otras cosas, el MODO.
//   3. El ticket queda emitido a nombre de ese modo.
//   4. El hijo de ese modo lo reclama; los hijos de otros modos no.
//   5. El hijo avisa que ya leyó o descartó su snapshot.
//   6. Recién ahí el padre lo invalida.
//
// No hay tiempo, ni contador de renders, ni estado de módulo: el ticket vive en
// el estado del padre y muere cuando el hijo dice que terminó.

export interface Ticket {
  // Identifica ESTA vuelta. Confirmar con un id viejo no puede apagar un ticket
  // nuevo — pasa si el usuario vuelve, cambia de modo y vuelve a entrar rápido.
  id: number;
  // A qué modo le corresponde. Es lo que evita que el hijo equivocado lo tome:
  // el padre ya restauró el modo en el paso 2, así que el hijo que monta es el
  // que estaba abierto cuando el usuario se fue a la ficha.
  modo: string;
}

export function crearTicket(id: number, modo: string): Ticket {
  return { id, modo };
}

// ¿Este hijo puede reclamar el ticket?
export function esParaMi(t: Ticket | null | undefined, modo: string): boolean {
  return !!t && t.modo === modo;
}

// El hijo confirma que ya usó (o descartó) su snapshot.
//
// Devuelve el ticket que queda vigente. Solo lo apaga si el id coincide: una
// confirmación tardía de una vuelta anterior no puede llevarse puesto el ticket
// de la vuelta en curso.
export function invalidar(actual: Ticket | null, id: number): Ticket | null {
  if (!actual || actual.id !== id) return actual;
  return null;
}
