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

export type EfectoRegistro = "contado" | "logueado" | "ignorado";
type Log = (...args: unknown[]) => void;

/**
 * Anota que un título, pool, bloque o card se descartó por un error de TMDB, y
 * DICE qué hizo con eso. Con cualquier otra causa: `ignorado`.
 *
 * 🔴 NUNCA ES INERTE (auditoría de Codex sobre 09b9dbe, hallazgo 2). Dentro de
 * un contexto cuenta y calla (`contado`): el contador lo consume el predicado
 * de la caché o el `degradado` del Home, y no hay una línea por cada título.
 * FUERA de un contexto —una ruta o tarea independiente que no lo abrió— deja
 * UNA línea estructurada por descarte (`logueado`), para que la causa quede en
 * los logs en vez de perderse. Las rutas independientes deberían abrir el
 * contexto con `conDescartesRegistrados`, que resume en una sola línea.
 */
export function registrarDescarteTmdb(e: unknown, sitio: string, o: { log?: Log } = {}): EfectoRegistro {
  if (!esErrorTmdb(e)) return "ignorado";
  const c = als.getStore();
  if (c) { c.fallos++; return "contado"; }
  const log = o.log ?? ((...a: unknown[]) => console.error(...a));
  log(`[tmdb] descarte sin contexto sitio=${sitio} clase=${e.clase} estado=${e.estado ?? "-"} path=${e.path}`);
  return "logueado";
}

/**
 * Para rutas y tareas independientes (directores, portadas, recordatorio, el
 * cron de Netflix, el Top): abre el contexto y, si hubo descartes, deja UNA
 * línea de resumen `[tmdb] <nombre>: N descarte(s)`. No cambia lo que la
 * función devuelve ni lo que responde la ruta.
 */
export async function conDescartesRegistrados<T>(nombre: string, fn: () => Promise<T>, o: { log?: Log } = {}): Promise<T> {
  const log = o.log ?? ((...a: unknown[]) => console.error(...a));
  const { res, fallos } = await withFallosTmdb(fn);
  if (fallos) log(`[tmdb] ${nombre}: ${fallos} descarte(s) por error de TMDB`);
  return res;
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
