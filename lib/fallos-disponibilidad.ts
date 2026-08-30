// La señal de "la evidencia de disponibilidad falló", por contexto async.
//
// 🔴 PARA QUÉ. `resolverDisponibilidad` devuelve `fallo: true` cuando Supabase o
// TMDB se cayeron, y `disponibilidadDe` ya no guardaba su propio `disp:`. Pero
// devolvía sólo el array de plataformas, así que la señal MORÍA AHÍ — y más
// afuera sí se guardaba: la card hasta 24 h, el Home 6 h y la lista de últimos
// con resultados incompletos. Una caída de dos segundos dejaba títulos en gris
// durante un día.
//
// ⚠️ POR CONTEXTO ASYNC Y NO POR PARÁMETRO, a propósito. Pasarla a mano obligaría
// a enhebrarla por `toUITitle` → `enrichRaw` → `listByCategory` → cada llamador,
// y alcanzaría con que UNO se la olvidara para volver al mismo bug. Es el mismo
// mecanismo que ya usan `withCacheMetrics` (lib/cache.ts) y las métricas de
// idioma, y por el mismo motivo: en Vercel conviven varios requests en la misma
// instancia y un contador de módulo mezclaría los números de todos.
//
// Lo que NO hace: cortar la respuesta. Un fallo se responde igual, con lo que
// haya — sólo que no se guarda.
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Un contador, con el enlace a su padre.
 *
 * 🔴 EL `padre` NO ES UN DETALLE. Sin él, un contexto hijo se comía el fallo:
 * `registrarFalloDisponibilidad` incrementa el store MÁS INTERNO, así que en la
 * composición real —`homePayload` envuelve, y adentro `titleCard` y
 * `ultimosRegionalPagina` vuelven a envolver— el hijo no guardaba su caché
 * (bien) pero el padre no se enteraba y **el Home sí se guardaba**, con el
 * contenido incompleto adentro, por 6 horas. La primera versión de este archivo
 * tenía ese bug y sus tests, que sólo miraban UN contexto, pasaban igual.
 */
interface Contador {
  fallos: number;
  padre: Contador | null;
}

// El único estado es el del contexto async: no hay nada mutable a nivel de
// módulo, así que dos requests que conviven en la misma instancia de Vercel no
// pueden verse entre sí.
const als = new AsyncLocalStorage<Contador>();

/**
 * Corre `fn` con un contador propio y devuelve el resultado junto con cuántos
 * fallos de disponibilidad hubo adentro.
 *
 * Se envuelve **el productor de cada superficie cacheada**, no el request
 * entero: así el predicado de `cachedIf`/`cachedLocIf` decide con los fallos de
 * SU contenido.
 */
export async function withFallosDisponibilidad<T>(
  fn: () => Promise<T>,
): Promise<{ res: T; fallos: number }> {
  const padre = als.getStore() ?? null;
  const contador: Contador = { fallos: 0, padre };
  try {
    const res = await als.run(contador, fn);
    return { res, fallos: contador.fallos };
  } finally {
    // Se suma AL SALIR, y en `finally`: si el hijo lanza, su cuenta igual sube
    // —el fallo pasó— y la excepción sigue viaje sin que este bloque la toque.
    //
    // Sumar acá y no en `registrar` es lo que garantiza que se cuente
    // EXACTAMENTE UNA VEZ por nivel: si `registrar` caminara la cadena hacia
    // arriba, cada ancestro sumaría por su cuenta y un nieto contaría doble en
    // el padre. Y como el hijo se espera adentro del padre, cuando el predicado
    // del padre corre la suma ya ocurrió.
    if (padre) padre.fallos += contador.fallos;
  }
}

/**
 * Anota que una fuente de evidencia se cayó.
 *
 * Fuera de un contexto no hace nada y **no lanza**: hay caminos que no envuelven
 * (un script, un test, una ruta que no cachea) y un contador no puede tirar un
 * request.
 */
export function registrarFalloDisponibilidad(): void {
  const c = als.getStore();
  // Sólo el contexto más interno. La propagación hacia arriba la hace
  // `withFallosDisponibilidad` al salir, no esta función.
  if (c) c.fallos++;
}

/**
 * ¿Hubo algún fallo en este contexto?
 *
 * Se lee DESDE ADENTRO, que es donde está el predicado que decide si guardar.
 */
export function hayFallosDisponibilidad(): boolean {
  return (als.getStore()?.fallos ?? 0) > 0;
}
