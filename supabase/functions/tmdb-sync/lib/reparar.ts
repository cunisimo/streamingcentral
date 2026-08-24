// Reparación de idioma para el sync, montada sobre el núcleo compartido.
//
// El PREDICADO y la FUSIÓN no se reimplementan acá: salen de
// `_shared/idioma-nucleo.ts`, el mismo archivo que usa la app. Lo único propio
// de este módulo es la política de QUÉ HACER CUANDO EL RESPALDO FALLA, que en el
// sync no puede ser la misma que en la app.
//
// EN LA APP, un respaldo caído se resuelve sirviendo la base sin reparar y NO
// cacheándola: el próximo request reintenta y, mientras tanto, lo peor que pasa
// es que un usuario vea un título raro unos segundos.
//
// ACÁ NO HAY CACHE: lo que se escribe queda en la base hasta el próximo sync que
// vuelva a alcanzar ese título — y el descubrimiento mira 3 páginas por
// popularidad, así que "el próximo sync" puede no llegar nunca. Escribir
// `런닝맨` en `upcoming_content` es persistirlo, no mostrarlo un rato.
//
// Por eso, si LA LLAMADA DE RESPALDO FALLA, los títulos que necesitaban
// reparación se caen de esta corrida: no se escriben. Y como también quedan
// fuera de la lista de evaluados, la reconciliación de `sync-upcoming.ts`
// tampoco los borra — su fila anterior queda intacta. Los sanos de la misma
// página siguen su camino.
//
// PERO "EL RESPALDO NO MEJORA" NO ES LO MISMO QUE "EL RESPALDO FALLÓ", y
// confundirlos costó caro. La primera versión descartaba las dos cosas, y en la
// primera corrida real eso tiró 79 títulos de 120: casi todos eran títulos SIN
// SINOPSIS EN NINGÚN IDIOMA — ni en es-MX ni en es-ES. A esos no los rompió el
// cambio de idioma; el sync viejo los escribía igual, y con razón. Descartarlos
// no protegía nada: bajaba la cobertura del descubrimiento a un tercio.
//
// La regla correcta es la misma que usa `lib/idioma.ts` en la app: se protege
// contra NO PODER MIRAR (la llamada se cayó), no contra "miré y no había nada
// mejor". Si el respaldo responde y no mejora, se escribe la base, que es
// exactamente lo que se escribía antes de todo esto.
import {
  fusionarPorCampo, type Localizable, necesitaReparacion, NO_LATINO,
} from "../../_shared/idioma-nucleo.ts";

/**
 * Metricas de idioma de UNA corrida.
 *
 * Se crean con `nuevasMetricas()` y se pasan por parametro. NO son estado de
 * modulo: dos invocaciones de `syncUpcoming` que se solapen —dos pedidos al
 * endpoint, un reintento del cron encima de la corrida anterior— compartirian
 * el acumulador y mezclarian sus numeros, o peor, uno reiniciaria los del otro
 * a mitad de camino. Es el mismo motivo por el que `lib/cache.ts` y
 * `lib/idioma.ts` de la app usan AsyncLocalStorage en vez de un contador
 * global.
 */
export interface MetricasIdioma {
  /** Requests de respaldo que de verdad salieron a la red. */
  llamadas: number;
  /** Titulos o episodios donde la reparacion CAMBIO algo. */
  reparados: number;
  /** Se cayeron de la corrida porque la llamada de respaldo FALLO. */
  descartados: number;
  /** El respaldo respondio y no mejoraba: se escribe la base, igual que antes
   *  del cambio de idioma. NO es un problema; se cuenta para poder verlo. */
  sinReparar: number;
  /** Respaldos que fallaron (excepcion o timeout). */
  fallos: number;
}

export const nuevasMetricas = (): MetricasIdioma =>
  ({ llamadas: 0, reparados: 0, descartados: 0, sinReparar: 0, fallos: 0 });

export function sumarLote<T>(m: MetricasIdioma, r: ResultadoReparacion<T>): void {
  m.llamadas += r.llamadas;
  m.reparados += r.reparados;
  m.descartados += r.descartados;
  m.sinReparar += r.sinReparar;
  if (r.fallo) m.fallos++;
}

export function sumarEpisodio(m: MetricasIdioma, r: ResultadoEpisodio): void {
  m.llamadas += r.llamadas;
  if (r.reparado) m.reparados++;
  if (r.descartar) { m.descartados++; m.fallos += r.fallo ? 1 : 0; }
}

export interface ResultadoReparacion<T> {
  /** Lo que se puede escribir. Si el respaldo falló, van solo los sanos. */
  items: T[];
  /** Se cayeron de la corrida porque la llamada de respaldo FALLÓ. */
  descartados: number;
  /** El respaldo respondió pero no mejoraba: se escribe la base, como antes.
   *  No es un problema; se cuenta para poder verlo. */
  sinReparar: number;
  /** Requests de respaldo que de verdad salieron a la red. */
  llamadas: number;
  /** Títulos donde la fusión CAMBIÓ algo. No es lo mismo que detectados. */
  reparados: number;
  fallo: boolean;
}

/**
 * Repara un LOTE con UNA sola llamada de respaldo, no una por título.
 *
 * `pedirRespaldo` solo se invoca si hay al menos un roto: una página sin nada
 * roto no cuesta nada. Medido en la app: 21 de 72 páginas necesitan respaldo.
 */
export async function repararLista<T extends Localizable & { id: number }>(
  base: T[],
  pedirRespaldo: () => Promise<Localizable[]>,
  etiqueta: string,
  activo: boolean,
): Promise<ResultadoReparacion<T>> {
  if (!activo) return { items: base, descartados: 0, sinReparar: 0, llamadas: 0, reparados: 0, fallo: false };

  const rotos = new Set<number>();
  for (const t of base) if (necesitaReparacion(t)) rotos.add(t.id);
  if (!rotos.size) return { items: base, descartados: 0, sinReparar: 0, llamadas: 0, reparados: 0, fallo: false };

  let respaldo: Localizable[];
  try {
    respaldo = await pedirRespaldo();
  } catch (e) {
    console.error(`[idioma] respaldo falló en ${etiqueta}: se descartan ${rotos.size} título(s) de esta corrida, sin tocar sus filas —`, e);
    return {
      items: base.filter((t) => !rotos.has(t.id)),
      descartados: rotos.size, sinReparar: 0, llamadas: 1, reparados: 0, fallo: true,
    };
  }

  const porId = new Map<number, Localizable>();
  for (const r of respaldo) {
    const id = (r as { id?: number }).id;
    if (id !== undefined) porId.set(id, r);
  }

  // Una lista vacía devuelta CORRECTAMENTE no es una caída: es una respuesta
  // válida que simplemente no trae con qué reparar. Lo que no se pudo reparar se
  // descarta igual, por la misma razón que arriba.
  const items: T[] = [];
  let sinReparar = 0, reparados = 0;
  for (const t of base) {
    if (!rotos.has(t.id)) { items.push(t); continue; }
    const arreglado = fusionarPorCampo(t, porId.get(t.id));
    if (arreglado === t) {
      // El respaldo respondió y no había nada mejor. Se escribe la base: es lo
      // mismo que escribía el sync antes del cambio de idioma. Ver la nota de
      // arriba sobre por qué descartar acá era un error.
      sinReparar++;
      items.push(t);
      continue;
    }
    reparados++;
    items.push(arreglado);
  }
  if (sinReparar) {
    console.log(`[idioma] ${etiqueta}: ${sinReparar} título(s) sin mejora posible (el respaldo tampoco los tiene); se escriben tal cual`);
  }
  return { items, descartados: 0, sinReparar, llamadas: 1, reparados, fallo: false };
}

/**
 * El nombre de un EPISODIO. No es un título de obra: no tiene `original_name`
 * contra el cual comparar, así que de las tres señales solo aplican dos —
 * vacío y alfabeto no latino. Usar `queReparar` acá daría siempre "roto",
 * porque un episodio no trae sinopsis en este objeto.
 */
export function nombreDeEpisodioRoto(nombre: string | undefined | null): boolean {
  const n = (nombre ?? "").trim();
  return !n || NO_LATINO.test(n);
}

export interface ResultadoEpisodio {
  nombre: string | null;
  /** true = la serie tiene que caerse de ESTA corrida. */
  descartar: boolean;
  llamadas: number;
  reparado: boolean;
  /** true solo si el respaldo se cayo (excepcion). Un respaldo que responde
   *  bien pero sin nombre util NO es un fallo de transporte. */
  fallo: boolean;
}

/**
 * Repara el nombre del episodio, o manda a descartar la serie.
 *
 * LA REGLA, y el bug que corrige: si el nombre NECESITABA reparación y no se
 * pudo reparar, la serie se cae de la corrida — SIN IMPORTAR si el valor roto
 * era vacío o no latino. La primera versión exigía que el nombre original
 * tuviera texto para descartar, así que el caso "vacío + respaldo caído"
 * terminaba escribiendo `episode_name: null` en la base. Persistir un null es
 * peor que no escribir: la fila anterior tenía un nombre bueno.
 *
 * `pedirRespaldo` DEBE pedir el episodio por las MISMAS coordenadas
 * (season/episode) que el episodio base, nunca "el próximo de hoy" en el otro
 * idioma: entre una llamada y la otra el próximo puede ser otro, y ahí se
 * mezclaría el nombre de un episodio distinto con esta fila.
 */
export async function repararNombreEpisodio(
  nombre: string | undefined | null,
  pedirRespaldo: () => Promise<string | null>,
  etiqueta: string,
  activo: boolean,
): Promise<ResultadoEpisodio> {
  const limpio = (nombre ?? "").trim() || null;
  // Con el fallback apagado no se descarta nada: el estado es el de siempre.
  if (!activo) return { nombre: limpio, descartar: false, llamadas: 0, reparado: false, fallo: false };
  if (!nombreDeEpisodioRoto(nombre)) {
    return { nombre: limpio, descartar: false, llamadas: 0, reparado: false, fallo: false };
  }

  let respaldo: string | null;
  try {
    respaldo = await pedirRespaldo();
  } catch (e) {
    console.error(`[idioma] respaldo de episodio falló en ${etiqueta}; se descarta de esta corrida —`, e);
    return { nombre: null, descartar: true, llamadas: 1, reparado: false, fallo: true };
  }
  if (nombreDeEpisodioRoto(respaldo)) {
    // Mismo criterio que el lote: el respaldo respondió y no sirve, así que se
    // conserva la base. Es lo que escribía el sync viejo — un episodio sin
    // nombre en ningún idioma no es un daño del cambio de idioma.
    console.log(`[idioma] ${etiqueta}: el respaldo del episodio tampoco tiene nombre; se conserva la base`);
    return { nombre: limpio, descartar: false, llamadas: 1, reparado: false, fallo: false };
  }
  return { nombre: (respaldo ?? "").trim(), descartar: false, llamadas: 1, reparado: true, fallo: false };
}
