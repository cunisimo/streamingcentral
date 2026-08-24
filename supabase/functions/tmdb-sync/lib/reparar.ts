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
// Por eso, si el respaldo falla, los títulos que NECESITABAN reparación se caen
// de esta corrida: no se escriben. Y como también quedan fuera de la lista de
// evaluados, la reconciliación de `sync-upcoming.ts` tampoco los borra — su fila
// anterior queda intacta, que es exactamente lo que se quiere. Los sanos de la
// misma página siguen su camino.
import {
  fusionarPorCampo, type Localizable, necesitaReparacion, NO_LATINO,
} from "../../_shared/idioma-nucleo.ts";

export interface ResultadoReparacion<T> {
  /** Lo que se puede escribir. Si el respaldo falló, van solo los sanos. */
  items: T[];
  /** Cuántos se cayeron de la corrida por no poder repararse. */
  descartados: number;
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
  if (!activo) return { items: base, descartados: 0, fallo: false };

  const rotos = new Set<number>();
  for (const t of base) if (necesitaReparacion(t)) rotos.add(t.id);
  if (!rotos.size) return { items: base, descartados: 0, fallo: false };

  let respaldo: Localizable[];
  try {
    respaldo = await pedirRespaldo();
  } catch (e) {
    console.error(`[idioma] respaldo falló en ${etiqueta}: se descartan ${rotos.size} título(s) de esta corrida, sin tocar sus filas —`, e);
    return { items: base.filter((t) => !rotos.has(t.id)), descartados: rotos.size, fallo: true };
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
  let descartados = 0;
  for (const t of base) {
    if (!rotos.has(t.id)) { items.push(t); continue; }
    const arreglado = fusionarPorCampo(t, porId.get(t.id));
    if (arreglado === t) { descartados++; continue; }   // no mejoró: no se escribe
    items.push(arreglado);
  }
  if (descartados) {
    console.warn(`[idioma] ${etiqueta}: ${descartados} título(s) sin reparación posible, se descartan de esta corrida`);
  }
  return { items, descartados, fallo: false };
}

/**
 * El nombre de un EPISODIO. No es un título de obra: no tiene `original_name`
 * contra el cual comparar, así que de las tres señales solo aplican dos —
 * vacío y alfabeto no latino. Usar `queReparar` acá daría siempre "roto",
 * porque un episodio no trae sinopsis en este objeto.
 *
 * Devuelve el nombre reparado, o `null` si no hay con qué (y entonces el
 * llamador descarta el título de la corrida en vez de escribir algo peor).
 */
export function nombreDeEpisodioRoto(nombre: string | undefined | null): boolean {
  const n = (nombre ?? "").trim();
  return !n || NO_LATINO.test(n);
}

export async function repararNombreEpisodio(
  nombre: string | undefined | null,
  pedirRespaldo: () => Promise<string | null>,
  etiqueta: string,
  activo: boolean,
): Promise<string | null> {
  if (!activo || !nombreDeEpisodioRoto(nombre)) return (nombre ?? "").trim() || null;
  let respaldo: string | null;
  try {
    respaldo = await pedirRespaldo();
  } catch (e) {
    console.error(`[idioma] respaldo de episodio falló en ${etiqueta} —`, e);
    return null;
  }
  if (nombreDeEpisodioRoto(respaldo)) return null;   // el respaldo tampoco sirve
  return respaldo;
}
