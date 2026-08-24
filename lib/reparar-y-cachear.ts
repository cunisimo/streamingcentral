// "Calcular → decidir si cachear → guardar", en un solo lugar.
//
// Módulo puro y sin imports de runtime: `lib/cache.ts` arrastra el cliente de
// Upstash y no se puede cargar con `node --test`. La producción entra por
// `cachedIf`/`cachedLocIf`, que delegan acá; los tests entran por la MISMA
// función con un backend en memoria. Nadie copia la lógica.
//
// POR QUÉ EXISTE. La versión anterior de los tests replicaba la semántica del
// caché adentro del propio test, y por eso tres bugs reales quedaron verdes:
// un test que reimplementa lo que dice probar no prueba nada.

/** Lo mínimo que el resolver necesita de un backend de caché. */
export interface BackendCache {
  leer<T>(clave: string): Promise<T | null>;
  escribir<T>(clave: string, valor: T, ttl: number): Promise<void>;
}

/** Lo que produce un fetcher que además repara idioma. */
export interface Producido<T> {
  valor: T;
  /** El respaldo falló: esto NO se puede guardar. */
  fallo: boolean;
}

/**
 * Devuelve el valor cacheado, o lo produce y decide si guardarlo.
 *
 * La regla que centraliza: **un resultado con `fallo` se DEVUELVE pero no se
 * guarda**. Si se guardara, la base sin reparar quedaría congelada lo que dure
 * el TTL (6 a 30 h según la familia) y nadie volvería a intentar. Al no
 * escribir, el próximo request vuelve a ejecutar el fetcher y reintenta.
 */
export async function resolverConCache<T>(opts: {
  clave: string;
  ttl: number;
  backend: BackendCache;
  producir: () => Promise<Producido<T>>;
}): Promise<T> {
  const hit = await opts.backend.leer<T>(opts.clave);
  if (hit !== null && hit !== undefined) return hit;

  const { valor, fallo } = await opts.producir();
  if (!fallo) await opts.backend.escribir(opts.clave, valor, opts.ttl);
  return valor;
}
