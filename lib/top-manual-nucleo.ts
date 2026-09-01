// Las reglas del Top manual que no necesitan base ni red.
//
// Vive aparte de `top-manual.ts` por el motivo de siempre en este proyecto: ese
// archivo es `server-only` y arrastra el cliente de Supabase, y lo que decide
// **si el Top público cambia de fuente** tiene que poder probarse sin levantar
// nada.
import type { MediaType, PlatformCode } from "./types";

/** Las seis plataformas del Top. Espeja `TOP_PLATFORMS` de `lib/top.ts`. */
export const TOP_PLATAFORMAS: PlatformCode[] = ["n", "d", "m", "p", "at", "cr"];

export interface Bloque { plataforma: PlatformCode; tipo: MediaType }

/** Los doce bloques: seis plataformas por dos tipos. */
export const BLOQUES: Bloque[] = TOP_PLATAFORMAS.flatMap((plataforma) =>
  (["movie", "tv"] as MediaType[]).map((tipo) => ({ plataforma, tipo })));

export const claveBloque = (p: string, t: string) => `${p}:${t}`;

/**
 * ¿Están publicados los DOCE bloques?
 *
 * 🔴 EL CUTOVER ES ATÓMICO, y es una decisión del dueño. Mientras falte
 * cualquiera, `/top` entero sigue con la implementación vieja. Media página con
 * ranking curado y media con popularidad de TMDB sería peor que cualquiera de
 * las dos cosas por separado: el lector no tendría forma de saber qué está
 * mirando.
 *
 * Se comprueba contra `BLOQUES`, no contra el tamaño del conjunto: doce claves
 * no alcanzan, tienen que ser LAS doce.
 */
export function hayCutover(publicados: Set<string>): boolean {
  return BLOQUES.every((b) => publicados.has(claveBloque(b.plataforma, b.tipo)));
}

export interface EntradaTop {
  posicion: number;
  tipo: MediaType;
  tmdb_id: number;
  titulo: string;
}

/**
 * Qué le falta a un bloque para poder publicarse. Vacío = está listo.
 *
 * Las mismas reglas corren en la base (`publicar_top`), y eso NO es duplicación
 * inútil: acá sirven para pintar el resumen del dashboard sin ir a la base, y
 * allá para que una llamada directa a la API no se las saltee. La que manda es
 * la de la base.
 */
export function validarBloque(entradas: EntradaTop[]): string[] {
  const motivos: string[] = [];
  if (entradas.length !== 10) {
    motivos.push(`tiene ${entradas.length} posiciones y necesita 10`);
  }
  const fuera = entradas.filter((e) => !(e.posicion >= 1 && e.posicion <= 10));
  if (fuera.length) motivos.push(`hay posiciones fuera de 1..10`);

  const pos = new Set(entradas.map((e) => e.posicion));
  if (pos.size !== entradas.length) motivos.push("hay dos títulos en la misma posición");

  const claves = new Set(entradas.map((e) => `${e.tipo}:${e.tmdb_id}`));
  if (claves.size !== entradas.length) motivos.push("hay un título repetido en el bloque");

  if (entradas.some((e) => !e.titulo?.trim())) motivos.push("hay una posición sin título");
  return motivos;
}

/**
 * Mover una posición y renumerar 1..10.
 *
 * Devuelve el arreglo COMPLETO renumerado, no un delta: el llamador guarda las
 * diez de una y no hay estado intermedio con posiciones repetidas, que la base
 * rechazaría por el `unique (ranking_id, posicion)`.
 *
 * Un movimiento inválido devuelve la lista tal cual — no lanza. Es una interfaz
 * de arrastrar y soltar: un destino fuera de rango es un gesto fallido del
 * usuario, no un error del programa.
 */
export function posicionesDeReordenar(
  entradas: EntradaTop[], desde: number, hasta: number,
): EntradaTop[] {
  const orden = [...entradas].sort((a, b) => a.posicion - b.posicion);
  const n = orden.length;
  const ok = (x: number) => Number.isInteger(x) && x >= 1 && x <= n;
  if (!ok(desde) || !ok(hasta) || desde === hasta) {
    return orden.map((e, i) => ({ ...e, posicion: i + 1 }));
  }
  const [movido] = orden.splice(desde - 1, 1);
  orden.splice(hasta - 1, 0, movido);
  return orden.map((e, i) => ({ ...e, posicion: i + 1 }));
}

/** Cuántos días vale una captura como evidencia de disponibilidad. */
export const DIAS_EVIDENCIA_TOP = 14;

export interface FilaEvidencia {
  plataforma: string;
  tipo: string;
  tmdb_id: number;
  /** `YYYY-MM-DD`, la fecha que el dueño declaró para el ranking. */
  captured_at: string;
}

/**
 * La evidencia de disponibilidad que aportan los rankings PUBLICADOS.
 *
 * Devuelve `tipo:id` → plataformas. Lo consume `resolverDisponibilidad` como una
 * procedencia más (`top-manual`), con las mismas reglas que el resto de los
 * respaldos: sólo habla cuando TMDB no sabe nada, y **nunca contradice** a TMDB.
 *
 * 🔴 TRES CONDICIONES, Y CADA UNA ES UN TEST:
 *
 *  - **Sólo lo publicado.** Un borrador es trabajo a medias; no dice nada del
 *    mundo. El filtro por estado lo hace la consulta, no esta función.
 *  - **Vence a los 14 días**, la misma ventana que el top oficial de Netflix y
 *    por el mismo motivo: una captura vieja no dice dónde está hoy un título.
 *  - **La clave es `tipo:id`**, nunca el id solo: TMDB reutiliza los números
 *    entre tipos.
 *
 * Una plataforma que no sea de las seis se ignora en vez de propagarse: la
 * disponibilidad se muestra con el logo de una plataforma soportada o no se
 * muestra.
 */
export function evidenciaDeRankings(
  filas: FilaEvidencia[], hoy: string,
): Map<string, PlatformCode[]> {
  const limite = new Date(`${hoy}T00:00:00Z`);
  limite.setUTCDate(limite.getUTCDate() - DIAS_EVIDENCIA_TOP);
  const desde = limite.toISOString().slice(0, 10);

  const out = new Map<string, PlatformCode[]>();
  for (const f of filas ?? []) {
    if (!TOP_PLATAFORMAS.includes(f.plataforma as PlatformCode)) continue;
    if (f.tipo !== "movie" && f.tipo !== "tv") continue;
    if (!f.captured_at || f.captured_at < desde) continue;
    const k = `${f.tipo}:${f.tmdb_id}`;
    const ya = out.get(k) ?? [];
    if (!ya.includes(f.plataforma as PlatformCode)) ya.push(f.plataforma as PlatformCode);
    out.set(k, ya);
  }
  return out;
}
