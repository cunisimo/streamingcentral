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

interface Contador { fallos: number }

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
  const contador: Contador = { fallos: 0 };
  const res = await als.run(contador, fn);
  return { res, fallos: contador.fallos };
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
