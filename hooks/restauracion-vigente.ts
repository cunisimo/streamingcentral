// ¿El snapshot que se restauró SIGUE valiendo?
//
// EL BUG QUE ARREGLA. Las vistas que gatean el fetch con la decisión —`/top` y
// las listas simples— dejan la URL de `useApi` vacía mientras haya algo
// restaurado. Eso es lo que evita el pedido repetido al volver, y es correcto…
// hasta que el usuario cambia algo. Ahí el snapshot deja de corresponder pero
// sigue presente, así que la URL sigue vacía: no se pide nada nuevo y se muestra
// para siempre el contenido viejo.
//
// Medido en `/top`: volver de una ficha y tocar Series dejaba el toggle en
// Series mostrando películas, sin ninguna llamada a `/api/top`.
//
// EL CONTEXTO es todo lo que, si cambia, invalida lo restaurado. En `/top` son
// el tipo y las plataformas; en las listas simples, las plataformas. Va como
// string para poder compararlo entero de una y para que agregar una dimensión
// sea sumarla acá y no repetir la comparación en cada vista.
export function contextoDe(partes: (string | null | undefined)[]): string {
  return partes.map((p) => p ?? "").join("|");
}

// `null` en `alRestaurar` = no se restauró nada, así que no hay nada que
// invalidar: la vista está pidiendo normalmente.
export function snapshotVigente(alRestaurar: string | null, actual: string): boolean {
  if (alRestaurar === null) return true;
  return alRestaurar === actual;
}
