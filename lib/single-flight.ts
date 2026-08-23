// Une las llamadas que están EN VUELO al mismo tiempo por la misma clave.
//
// Módulo aparte y sin imports de runtime, misma razón que `lib/busqueda-orden.ts`:
// `lib/reco.ts` arrastra el cliente de Upstash y no se puede importar desde un
// test con `node --test`.
//
// POR QUÉ HACE FALTA. En "Elegidas para vos", cada origen dispara TRES caminos
// en paralelo (`recomendadosDe`, `cruzadosDe` → `perfilDe`, y `perfilDe` otra
// vez) y los tres piden el MISMO `titleDetails`. `cached()` NO hace
// single-flight: en un MISS concurrente los tres salen a TMDB, y con el
// fallback de idioma cada uno podía además pagar su propia llamada de respaldo.
//
// SÍ SE COMPARTE ENTRE REQUESTS SIMULTÁNEOS, y eso es deseable: dos usuarios
// pidiendo la misma ficha al mismo tiempo son un solo pedido a TMDB. La versión
// anterior de este comentario decía lo contrario y estaba mal.
//
// Lo que NO hace es guardar entre requests: la entrada se borra en cuanto la
// promesa se resuelve o rechaza, así que nunca sirve datos viejos y no hay nada
// que invalidar. Une lo que está en el aire, nada más.
//
// LA CLAVE LLEVA EL IDIOMA. La llamada base y la de respaldo son dos pedidos
// distintos al mismo título y no se pueden confundir: `es-MX:movie:550` y
// `es-ES:movie:550`.

/** Fábrica de un single-flight con su propio mapa. */
export function crearSingleFlight<T>(opts: {
  /** Se llama SOLO cuando de verdad se sale a la red, no cuando se comparte una
   *  promesa que ya estaba en vuelo. Es el dueño real de la llamada, y por eso
   *  las métricas se cuentan acá y no en el reparador. */
  alPedir?: () => void;
} = {}) {
  const enVuelo = new Map<string, Promise<T>>();

  return function compartir(clave: string, pedir: () => Promise<T>): Promise<T> {
    const ya = enVuelo.get(clave);
    if (ya) return ya;
    opts.alPedir?.();
    // El `finally` es lo que evita que una promesa RECHAZADA quede pegada: sin
    // él, un fallo de TMDB dejaría ese título imposible de pedir en todo lo que
    // le queda de vida al proceso.
    const p = pedir().finally(() => { enVuelo.delete(clave); });
    enVuelo.set(clave, p);
    return p;
  };
}
