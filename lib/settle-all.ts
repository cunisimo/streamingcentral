// Enriquecido tolerante a fallos, extraído de lib/enrich.ts sin cambiar su
// comportamiento (Etapa 3.a). `toUITitle` hace 1 request a TMDB por título
// (providersOf): en un listado de 20 basta un 429 o un timeout para que el
// Promise.all entero rechace y se caiga el riel/endpoint completo. Acá el título
// que falla se descarta y el resto sobrevive — mismo criterio que `titleCard`,
// que ya devolvía null. En el camino feliz la salida es idéntica a Promise.all.
// Nunca falla en silencio: lo descartado se loguea en server.
//
// Lo que suma la Etapa 3.a (H2): cada rechazo se pasa por
// `registrarDescarteTmdb`, que cuenta SÓLO los de causa TMDB en el contexto de
// fallos (lib/fallos-tmdb.ts). Así un riel corto por un 429 llega marcado a
// quien decide si guardar. Con TMDB sano no hay rechazos y la salida es la de
// siempre.
//
// Sin `server-only`: se prueba con `node --test`. Las dos dependencias de
// entorno (relanzar fuera de producción; el logger) se inyectan por eso.
import { registrarDescarteTmdb } from "./fallos-tmdb.ts";

export interface OpcionesSettle {
  /** Fuera de producción no se traga nada: un bug propio tiene que explotar. */
  relanzar?: boolean;
  log?: (mensaje: string, motivo: unknown) => void;
}

export async function settleAll<T>(tareas: Promise<T>[], etiqueta: string, o: OpcionesSettle = {}): Promise<T[]> {
  const relanzar = o.relanzar ?? process.env.NODE_ENV !== "production";
  const log = o.log ?? ((m, motivo) => console.error(m, motivo));
  const r = await Promise.allSettled(tareas);
  const ok: T[] = [];
  let primerMotivo: unknown;
  let descartados = 0;
  for (const s of r) {
    if (s.status === "fulfilled") { ok.push(s.value); continue; }
    descartados++;
    if (descartados === 1) primerMotivo = s.reason;
    registrarDescarteTmdb(s.reason, etiqueta);
  }
  if (descartados) {
    // El error COMPLETO (con stack), no solo `.message`: si no, un TypeError
    // propio queda indistinguible de un 429 de TMDB.
    log(`[enrich] ${etiqueta}: ${descartados}/${r.length} título(s) descartados —`, primerMotivo);
    if (relanzar) throw primerMotivo;
  }
  return ok;
}
