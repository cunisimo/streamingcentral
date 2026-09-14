// La señal de "TMDB falló en algún título y se descartó", por contexto async.
// Etapa 3.a de capacidad (#19), hallazgo H2 del informe de la Etapa 3 (§2.2).
//
// 🔴 EL AGUJERO. `settleAll` (lib/settle-all.ts) descarta el título cuyo
// `watch/providers` devolvió 429, 5xx o timeout y sólo lo loguea. El riel
// queda corto, el bucle de vueltas pide más candidatos bajo el mismo 429, y el
// payload sale con `degradado: false`: se publicaba 6 h como fresca y 36 h como
// último bueno con títulos faltantes. Lo mismo en `titleCard` (una card `null`
// por un 429), en los pools, en los relacionados de la ficha y en los otros
// sitios inventariados en el informe (§2.3, S1-S11).
//
// Es el MISMO mecanismo que lib/fallos-disponibilidad.ts, por los mismos
// motivos: contexto async y no parámetro (alcanza con que UN llamador se lo
// olvide), y el hijo suma al padre AL SALIR y en `finally`, exactamente una vez
// por nivel. Sólo cuenta lo que es de TMDB (`esErrorTmdb`): un `TypeError`
// propio tiene que verse como bug, no como degradación.
//
// Lo que NO hace: cortar la respuesta ni cambiar el contenido. Un descarte se
// responde igual que hoy, con lo que haya — sólo que ahora la superficie que
// lo contiene NO se guarda, y el Home sale marcado `degradado`, con lo que la
// Etapa 2 hace lo suyo (ENFRIAR + último bueno). Con TMDB sano no hay
// descartes y nada cambia.
import { AsyncLocalStorage } from "node:async_hooks";
import { esErrorTmdb } from "./tmdb-error.ts";
import { withFallosDisponibilidad } from "./fallos-disponibilidad.ts";

interface Contador {
  fallos: number;
  padre: Contador | null;
}

const als = new AsyncLocalStorage<Contador>();

/** Corre `fn` con un contador propio y devuelve cuántos descartes de TMDB hubo adentro. */
export async function withFallosTmdb<T>(fn: () => Promise<T>): Promise<{ res: T; fallos: number }> {
  const padre = als.getStore() ?? null;
  const contador: Contador = { fallos: 0, padre };
  try {
    const res = await als.run(contador, fn);
    return { res, fallos: contador.fallos };
  } finally {
    if (padre) padre.fallos += contador.fallos;
  }
}

/**
 * Anota que un título, pool, bloque o card se descartó por un error de TMDB.
 * Con cualquier otra causa no cuenta. Fuera de un contexto no hace nada y no
 * lanza. `sitio` es sólo para el log de quien registra.
 */
export function registrarDescarteTmdb(e: unknown, _sitio: string): void {
  if (!esErrorTmdb(e)) return;
  const c = als.getStore();
  if (c) c.fallos++;
}

export function hayFallosTmdb(): boolean {
  return (als.getStore()?.fallos ?? 0) > 0;
}

/**
 * Los DOS contextos de fallos de fuentes externas, compuestos. Es lo que abren
 * las siete superficies cacheadas (card, Home, búsqueda, Top, reco y los dos
 * tramos de "Últimos"): `fallos` es la suma y alcanza para el predicado de
 * `cachedIf`/`cachedLocIf`; los dos sumandos viajan aparte para el log.
 */
export async function withFallosDeFuentes<T>(
  fn: () => Promise<T>,
): Promise<{ res: T; fallos: number; fallosDisponibilidad: number; fallosTmdb: number }> {
  const { res: interno, fallos: fallosDisponibilidad } = await withFallosDisponibilidad(() => withFallosTmdb(fn));
  return {
    res: interno.res,
    fallosDisponibilidad,
    fallosTmdb: interno.fallos,
    fallos: fallosDisponibilidad + interno.fallos,
  };
}
