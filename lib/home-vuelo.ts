// El vuelo compartido del Home: N solicitudes simultáneas a la misma clave con
// caché fría = UNA composición. Etapa 1 de capacidad (#17), acotado al Home.
//
// ============================================================================
// POR QUÉ ACÁ Y NO EN cached/cachedIf
// ============================================================================
// Los contextos de degradación (`lib/fallos-disponibilidad.ts`, `lib/idioma.ts`)
// son AsyncLocalStorage por request, y de ellos sale el `degradado` que decide
// si un payload se publica. Con un single-flight profundo, el trabajo compartido
// corre en el contexto de quien lo empezó: el segundo vería su contador en
// cero, creería limpio un payload construido con fallos y lo publicaría como
// sano hasta 6 h. En el Home no pasa por construcción: acá se comparte el
// resultado ENTERO de la resolución del líder —desde la Etapa 2 es
// `servirConTurno` (lib/home-servir.ts): leer → tomar el turno → producir →
// PUBLICAR o ENFRIAR, con el verdicto adentro del payload; en la Etapa 1 era
// `cachedLocIf`—. El seguidor no produce, no evalúa ningún predicado y no
// escribe: recibe lo que resolvió el líder.
//
// ============================================================================
// DOS FASES, Y POR QUÉ LA PRIMERA
// ============================================================================
// 1. Lectura previa del caché. Con caché caliente, N solicitudes simultáneas
//    tienen que ser N HIT: envolver también la lectura en el vuelo las haría
//    "esperas compartidas" de una lectura, que es una espera innecesaria y una
//    métrica que miente. (El batcher de lib/cache.ts ya junta esas N lecturas
//    en un MGET.)
// 2. Si no estaba, el vuelo por clave: el primero en llegar resuelve (desde la
//    Etapa 2, `servirConTurno`, que vuelve a leer la fresca —un comando más
//    para el líder, y correcto: si alguien publicó entre las dos fases, es un
//    HIT—, lee el último bueno sólo en el MISS, toma el turno y produce UNA
//    vez); los demás esperan esa misma promesa.
//
// EL CONTEXTO. La clave de coordinación es SOLO la fresca; lo que el resolver
// necesite además (las otras cuatro claves del Home) viaja como contexto de la
// solicitud y se usa el del LÍDER. Antes vivía en un Map de módulo de
// lib/home.ts que crecía con cada combinación y nunca se vaciaba (auditoría
// de Codex sobre fb3a3f1); ahora no hay nada que retener: `enVuelo()` vuelve a
// cero al terminar.
//
// Métricas (Etapa 0): el líder anota `composiciones += 1` y `cache = "miss"`
// dentro del productor, en SU scope, porque el productor lo invoca él. Cada
// seguidor anota `esperasCompartidas += 1` y `cache = "compartida"` en el SUYO.
// HIT, MISS, composición propia y espera compartida quedan diferenciados sin
// deducir ninguno de otro.
//
// Rechazo: `crearSingleFlight` borra la entrada en `finally`, así que todos los
// que esperaban ven el rechazo y la petición siguiente vuelve a intentar.
//
// ⚠️ ES POR PROCESO. Entre instancias de Vercel no coordina nada; el turno
// distribuido y el último Home bueno son la Etapa 2. Módulo puro, probado con
// `resolverConCache` y las métricas reales en lib/home-vuelo.test.ts.
import { crearSingleFlight } from "./single-flight.ts";
import { anotar } from "./metricas.ts";

export interface DepsVueloHome<T, K extends string = string, C = void> {
  /** La lectura previa: el backend real del caché (`backendCache.leer`). */
  leer: (clave: K) => Promise<T | null>;
  /** La resolución completa (desde la Etapa 2: `servirConTurno`). Sólo la ejecuta el líder, con SU contexto. */
  resolver: (clave: K, producir: () => Promise<T>, contexto: C) => Promise<T>;
}

/**
 * `K` es el tipo de la clave: el Home usa `ClaveLocalizada`, que sólo fabrican
 * los constructores de lib/claves.ts. `C` es el contexto que el resolver
 * necesita además de la clave (las otras cuatro claves del Home).
 */
export function crearVueloHome<T, K extends string = string, C = void>(deps: DepsVueloHome<T, K, C>) {
  const vuelo = crearSingleFlight<T>();
  async function servir(clave: K, producir: () => Promise<T>, contexto: C): Promise<T> {
    const previo = await deps.leer(clave);
    if (previo !== null && previo !== undefined) {
      anotar((m) => { m.home.cache = "hit"; });
      return previo;
    }
    let lider = false;
    const res = await vuelo(clave, () => { lider = true; return deps.resolver(clave, producir, contexto); });
    if (!lider) anotar((m) => { m.home.cache = "compartida"; m.home.esperasCompartidas += 1; });
    return res;
  }
  /** Claves con un vuelo en curso. Cero al terminar: no hay estado que retener. */
  servir.enVuelo = () => vuelo.enVuelo();
  return servir;
}
