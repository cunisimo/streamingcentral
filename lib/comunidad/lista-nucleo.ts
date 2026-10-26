// La lista de reseñas de la comunidad de un título (E5a). PURO y apto para el
// cliente; lo prueba lista-nucleo.test.ts sin DOM.
//
// Lo que ordena:
//   - cinco reseñas iniciales y "Cargar más" de a cinco, con el patrón de
//     `EstadoTanda` (hooks/filtro-paginado-nucleo.ts): el CURSOR CONFIRMADO
//     avanza sólo cuando llega una tanda válida. Si una tanda falla, lo
//     visible queda y el reintento sale desde el mismo cursor;
//   - una respuesta vale sólo si es del pedido EN CURSO y de la misma clave
//     (cuenta, título y orden): una tanda vieja, de otra cuenta, de otro
//     título o de otro orden se descarta sin tocar nada;
//   - deduplicación por RESEÑA, no por versión: si el autor editó entre dos
//     páginas, la clave del cursor (primera publicación, id) no cambia y la
//     reseña no vuelve a entrar; si apareciera igual, gana la que ya se ve;
//   - un voto confirmado se aplica sobre la reseña que ya se ve, sin recargar
//     (recargar llevaría la lista otra vez a cinco).
import type { Voto } from "./evaluacion-nucleo.ts";

export interface ItemLista {
  resena_id: number;
  version_id: number;
  texto: string;
  publicada_en: string;
  editada: boolean;
  utiles: number;
  total: number;
  mi_voto: Voto | null;
  denunciada: boolean;
}

export interface EstadoLista {
  /** cuenta|tipo:id|orden. Una respuesta de otra clave no se aplica. */
  clave: string;
  items: ItemLista[];
  /** El cursor de la próxima tanda; null = no hay más (o todavía no hay lista). */
  cursor: string | null;
  hayMas: boolean;
  /** El pedido en curso (0 = ninguno). Cada pedido nuevo invalida al anterior. */
  pedido: number;
  cargandoMas: boolean;
  errorMas: boolean;
}

export const claveLista = (uid: string, tipo: string, tmdbId: number, orden: string) => `${uid}|${tipo}:${tmdbId}|${orden}`;

export function listaVacia(clave: string): EstadoLista {
  return { clave, items: [], cursor: null, hayMas: false, pedido: 0, cargandoMas: false, errorMas: false };
}

const esVoto = (x: unknown): x is Voto => x === "util" || x === "no_util";

/** Un item como lo devuelve la base, o null si no tiene la forma esperada. */
export function itemValido(x: unknown): ItemLista | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (!Number.isSafeInteger(o.resena_id) || !Number.isSafeInteger(o.version_id) || typeof o.texto !== "string"
      || typeof o.publicada_en !== "string" || !Number.isSafeInteger(o.utiles) || !Number.isSafeInteger(o.total)) return null;
  return {
    resena_id: o.resena_id as number, version_id: o.version_id as number, texto: o.texto, publicada_en: o.publicada_en,
    editada: o.editada === true, utiles: o.utiles as number, total: o.total as number,
    mi_voto: esVoto(o.mi_voto) ? o.mi_voto : null, denunciada: o.denunciada === true,
  };
}

export interface Tanda { items: ItemLista[]; cursor: string | null; hayMas: boolean; orden: string }

/**
 * Una tanda válida, o null. Válida: `activo`, el orden pedido, un arreglo de
 * items bien formados, y un cursor exactamente cuando `hay_mas`.
 */
export function tandaValida(j: unknown, orden: string): Tanda | null {
  if (!j || typeof j !== "object") return null;
  const o = j as Record<string, unknown>;
  if (o.activo !== true || o.orden !== orden || !Array.isArray(o.items)) return null;
  const items = o.items.map(itemValido);
  if (items.some((x) => x === null)) return null;
  const hayMas = o.hay_mas === true;
  const cursor = typeof o.cursor === "string" && o.cursor ? o.cursor : null;
  if (hayMas !== (cursor !== null)) return null;
  return { items: items as ItemLista[], cursor, hayMas, orden };
}

/** Une sin repetir reseñas; lo que ya se ve queda primero y como está. */
export function unir(previos: ItemLista[], nuevos: ItemLista[]): ItemLista[] {
  const vistos = new Set(previos.map((x) => x.resena_id));
  const out = [...previos];
  for (const x of nuevos) if (!vistos.has(x.resena_id)) { vistos.add(x.resena_id); out.push(x); }
  return out;
}

/**
 * La primera página (o una recarga completa): reemplaza la lista. El contador
 * de pedidos SIGUE (no vuelve a 0): un "Cargar más" que estaba en vuelo queda
 * invalidado y su respuesta tardía no puede confundirse con uno nuevo.
 */
export function conPrimeraPagina(e: EstadoLista, t: Tanda): EstadoLista {
  return { ...e, items: unir([], t.items), cursor: t.cursor, hayMas: t.hayMas, pedido: e.pedido + 1, cargandoMas: false, errorMas: false };
}

/** Tocar "Cargar más" (o "Reintentar"): el pedido sale desde el cursor CONFIRMADO. */
export function pedirMas(e: EstadoLista): { estado: EstadoLista; pedido: { n: number; cursor: string; clave: string } } | null {
  if (!e.hayMas || !e.cursor || e.cargandoMas) return null;
  const n = e.pedido + 1;
  return { estado: { ...e, pedido: n, cargandoMas: true, errorMas: false }, pedido: { n, cursor: e.cursor, clave: e.clave } };
}

/**
 * Llegó la respuesta del pedido `n` de la clave `clave`. `tanda` null = falló
 * (red, HTTP o forma). Sólo el pedido en curso de la misma clave cambia algo.
 */
export function alLlegarMas(e: EstadoLista, n: number, clave: string, tanda: Tanda | null): EstadoLista {
  if (clave !== e.clave || n !== e.pedido || !e.cargandoMas) return e;
  if (!tanda) return { ...e, cargandoMas: false, errorMas: true };
  return { ...e, items: unir(e.items, tanda.items), cursor: tanda.cursor, hayMas: tanda.hayMas, cargandoMas: false, errorMas: false };
}

/** Un voto CONFIRMADO por la base, aplicado a la reseña que ya se ve. */
export function trasVoto(e: EstadoLista, versionId: number, resultado: unknown, enviado: Voto | "retirar"): EstadoLista {
  const nuevo: Voto | null | undefined =
    resultado === "voto_registrado" && enviado !== "retirar" ? enviado
    : resultado === "voto_retirado" ? null
    : undefined;
  if (nuevo === undefined) return e;
  return {
    ...e,
    items: e.items.map((x) => {
      if (x.version_id !== versionId || x.mi_voto === nuevo) return x;
      const antes = x.mi_voto;
      const total = x.total - (antes ? 1 : 0) + (nuevo ? 1 : 0);
      const utiles = x.utiles - (antes === "util" ? 1 : 0) + (nuevo === "util" ? 1 : 0);
      return { ...x, mi_voto: nuevo, total: Math.max(0, total), utiles: Math.max(0, utiles) };
    }),
  };
}

/** La denuncia confirmada marca la reseña que ya se ve. */
export function trasDenuncia(e: EstadoLista, versionId: number): EstadoLista {
  return { ...e, items: e.items.map((x) => (x.version_id === versionId ? { ...x, denunciada: true } : x)) };
}
