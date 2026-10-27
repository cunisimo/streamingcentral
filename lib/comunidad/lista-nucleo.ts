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
//     (recargar llevaría la lista otra vez a cinco). En "Más útiles" eso
//     actualiza el CONTEO pero no REORDENA: el orden es el congelado;
//   - E5b, "Más útiles": si el orden congelado vence mientras se lee, la base
//     responde `orden_actualizado`. La lista queda como está, avisa "Orden
//     actualizado" y permite volver a empezar UNA vez: la primera página del
//     orden nuevo se agrega a lo visible sin repetir reseñas y la lista sigue
//     desde ahí. Si el orden nuevo también vence, ya no se ofrece otro
//     reinicio (sin ciclos).
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
  /** El orden congelado venció: no hay más en ese orden ("Orden actualizado"). */
  vencido: boolean;
  /** Ya se volvió a empezar una vez: no se ofrece otro reinicio. */
  reiniciado: boolean;
}

export const claveLista = (uid: string, tipo: string, tmdbId: number, orden: string) => `${uid}|${tipo}:${tmdbId}|${orden}`;

export function listaVacia(clave: string): EstadoLista {
  return { clave, items: [], cursor: null, hayMas: false, pedido: 0, cargandoMas: false, errorMas: false, vencido: false, reiniciado: false };
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

export interface Tanda { items: ItemLista[]; cursor: string | null; hayMas: boolean; orden: string; vencido: boolean }

/**
 * Una tanda válida, o null. Válida: `activo`, el orden pedido, un arreglo de
 * items bien formados, y un cursor exactamente cuando `hay_mas`. En "Más
 * útiles" una tanda puede traer MENOS de cinco (muchas ocultas en las 50
 * posiciones revisadas) o ninguna. `orden_actualizado` es una tanda válida
 * vacía, sin más, con `vencido`.
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
  const vencido = o.orden_actualizado === true;
  if (vencido && (items.length > 0 || hayMas)) return null;
  return { items: items as ItemLista[], cursor, hayMas, orden, vencido };
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
  return { ...e, items: unir([], t.items), cursor: t.cursor, hayMas: t.hayMas, pedido: e.pedido + 1, cargandoMas: false, errorMas: false,
    vencido: false, reiniciado: false };
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
  if (tanda.vencido) return { ...e, cursor: null, hayMas: false, cargandoMas: false, errorMas: false, vencido: true };
  return { ...e, items: unir(e.items, tanda.items), cursor: tanda.cursor, hayMas: tanda.hayMas, cargandoMas: false, errorMas: false };
}

/** ¿Se puede volver a empezar? Sólo con el orden vencido y si todavía no se reinició. */
export const puedeReiniciar = (e: EstadoLista) => e.vencido && !e.reiniciado && !e.cargandoMas;

/** "Volver a empezar": pide la PRIMERA página del orden nuevo (sin cursor). */
export function pedirReinicio(e: EstadoLista): { estado: EstadoLista; pedido: { n: number; clave: string } } | null {
  if (!puedeReiniciar(e)) return null;
  const n = e.pedido + 1;
  return { estado: { ...e, pedido: n, cargandoMas: true, errorMas: false }, pedido: { n, clave: e.clave } };
}

/**
 * Llegó la primera página del orden nuevo. Se AGREGA a lo visible sin repetir
 * reseñas y la lista sigue desde su cursor. Falla: lo visible queda y se puede
 * reintentar el reinicio (todavía no se gastó).
 */
export function alLlegarReinicio(e: EstadoLista, n: number, clave: string, tanda: Tanda | null): EstadoLista {
  if (clave !== e.clave || n !== e.pedido || !e.cargandoMas || !e.vencido) return e;
  if (!tanda || tanda.vencido) return { ...e, cargandoMas: false, errorMas: true };
  return { ...e, items: unir(e.items, tanda.items), cursor: tanda.cursor, hayMas: tanda.hayMas, cargandoMas: false, errorMas: false,
    vencido: false, reiniciado: true };
}

/**
 * El voto que la base CONFIRMÓ para lo enviado, o `undefined` si no hay
 * confirmación. Los resultados idempotentes también confirman (A1 de la
 * auditoría de E5a): cuando la primera respuesta se pierde después del commit,
 * el reintento de la reconciliación responde `sin_cambios` (el voto vigente
 * YA es el pedido) o, al retirar, `sin_efecto` (ya no hay voto vigente). Sin
 * confirmación (`sin_confirmar`, error, rechazo) no se cambia nada: la
 * pantalla sigue mostrando el último estado conocido y el aviso de
 * incertidumbre.
 */
export function votoConfirmado(resultado: unknown, enviado: Voto | "retirar"): Voto | null | undefined {
  if (enviado === "retirar") return resultado === "voto_retirado" || resultado === "sin_efecto" ? null : undefined;
  return resultado === "voto_registrado" || resultado === "sin_cambios" ? enviado : undefined;
}

/**
 * Un voto CONFIRMADO por la base, aplicado a la reseña que ya se ve. Los
 * conteos se mueven por la diferencia entre lo que se veía y lo confirmado:
 * aplicar la misma confirmación dos veces no suma ni resta de nuevo.
 */
export function trasVoto(e: EstadoLista, versionId: number, resultado: unknown, enviado: Voto | "retirar"): EstadoLista {
  const nuevo = votoConfirmado(resultado, enviado);
  if (nuevo === undefined) return e;
  let cambio = false;
  const items = e.items.map((x) => {
    if (x.version_id !== versionId || x.mi_voto === nuevo) return x;
    cambio = true;
    const antes = x.mi_voto;
    const total = x.total - (antes ? 1 : 0) + (nuevo ? 1 : 0);
    const utiles = x.utiles - (antes === "util" ? 1 : 0) + (nuevo === "util" ? 1 : 0);
    return { ...x, mi_voto: nuevo, total: Math.max(0, total), utiles: Math.max(0, utiles) };
  });
  return cambio ? { ...e, items } : e;
}

/** La denuncia confirmada marca la reseña que ya se ve. */
export function trasDenuncia(e: EstadoLista, versionId: number): EstadoLista {
  return { ...e, items: e.items.map((x) => (x.version_id === versionId ? { ...x, denunciada: true } : x)) };
}
