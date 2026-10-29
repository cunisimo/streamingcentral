// Lectura protegida de las reseñas de la comunidad (E5a): el pedido de la ruta
// y la llamada a la base. Sin `server-only` a propósito, como
// admin-moderacion.ts: la batería local corre exactamente esto contra
// `supabase start`.
//
// 🔴 EL CLIENTE ES EL DEL LECTOR, NUNCA `service_role`. La ruta lo arma con
// `supabaseComoUsuario(token)`: PostgREST lee el Bearer y la función de la base
// (`comunidad_resenas`, sólo `authenticated`) toma al lector de `auth.uid()`.
// No hay uid en el pedido: nadie lee "como" otro. Con la clave de servicio la
// base respondería 42501 (no tiene EXECUTE).
import type { SupabaseClient } from "@supabase/supabase-js";
import { errorRpc, ErrorRpc } from "./escritura-nucleo.ts";

export const ORDENES = ["recientes", "utiles"] as const;
export type Orden = (typeof ORDENES)[number];
/** Los órdenes habilitados (E5b agregó "Más útiles"). */
export const ORDENES_HABILITADOS: readonly Orden[] = ["recientes", "utiles"];
/** El orden por defecto de la LISTA (E5b). Sin `orden`, la ruta lee "Recientes", como en E5a. */
export const ORDEN_INICIAL: Orden = "utiles";
export const TANDA_INICIAL = 5;
export const TANDA = 5;

/** "Recientes": la clave (primera publicación, id). "Más útiles": el orden congelado y la posición. */
export type CursorRecientes = { t: string; id: number };
export type CursorUtiles = { o: number; p: number };
export type Cursor = CursorRecientes | CursorUtiles;
export interface PedidoLectura { tipo: "movie" | "tv"; tmdbId: number; orden: Orden; cursor: Cursor | null; limite: number }

const entero = (s: string | null) => (s !== null && /^[1-9]\d{0,15}$/.test(s) && Number.isSafeInteger(Number(s)) ? Number(s) : null);

/** El cursor viaja opaco en la URL (base64url de `{t, id}` o de `{o, p}`). */
export function codificarCursor(c: Cursor): string {
  const j = JSON.stringify("o" in c ? { o: c.o, p: c.p } : { t: c.t, id: c.id });
  return typeof Buffer !== "undefined" ? Buffer.from(j).toString("base64url")
    : btoa(unescape(encodeURIComponent(j))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function decodificarCursor(s: string): Cursor | null {
  try {
    const b = s.replace(/-/g, "+").replace(/_/g, "/");
    const j = JSON.parse(typeof Buffer !== "undefined" ? Buffer.from(b, "base64").toString("utf8") : decodeURIComponent(escape(atob(b))));
    if (!j || typeof j !== "object") return null;
    if ("o" in j) {
      if (!Number.isSafeInteger(j.o) || j.o <= 0 || !Number.isSafeInteger(j.p) || j.p < 0 || j.p > 10_000_000) return null;
      return { o: j.o, p: j.p };
    }
    if (typeof j.t !== "string" || Number.isNaN(Date.parse(j.t)) || !Number.isSafeInteger(j.id) || j.id <= 0) return null;
    return { t: j.t, id: j.id };
  } catch {
    return null;
  }
}

/** Valida la consulta de la ruta. El lector NUNCA sale de acá: sale del token. */
export function pedidoLectura(q: URLSearchParams): PedidoLectura | { invalido: string } {
  const tipo = q.get("tipo");
  const tmdbId = entero(q.get("id"));
  if ((tipo !== "movie" && tipo !== "tv") || tmdbId === null || tmdbId > 2_147_483_647) return { invalido: "titulo" };
  const orden = (q.get("orden") ?? "recientes") as Orden;
  if (!ORDENES.includes(orden)) return { invalido: "orden" };
  if (!ORDENES_HABILITADOS.includes(orden)) return { invalido: "orden_no_disponible" };
  const c = q.get("cursor");
  const cursor = c === null ? null : decodificarCursor(c);
  if (c !== null && (!cursor || ("o" in cursor) !== (orden === "utiles"))) return { invalido: "cursor" };
  return { tipo, tmdbId, orden, cursor, limite: cursor ? TANDA : TANDA_INICIAL };
}

export type RespuestaLectura = Record<string, unknown>;

/**
 * Una página. Lo que vuelve de la base, con el cursor siguiente ya
 * codificado; o `{resultado}`: `sin_sesion` (42501, token vencido), `invalido`
 * (22023) o `error`. Una lectura no se repite: el cliente reintenta desde el
 * mismo cursor.
 */
export async function leerResenas(sb: SupabaseClient, p: PedidoLectura): Promise<RespuestaLectura> {
  try {
    const { data, error } = await sb.rpc("comunidad_resenas", {
      p_tipo: p.tipo, p_tmdb_id: p.tmdbId, p_orden: p.orden, p_cursor: p.cursor, p_limite: p.limite,
    });
    if (error) throw errorRpc("comunidad_resenas", error);
    if (typeof data !== "object" || data === null || Array.isArray(data)) return { resultado: "error" };
    const d = data as Record<string, unknown>;
    if (d.activo !== true) return d; // módulo apagado: { activo: false } y nada más
    const c = d.cursor as { t?: unknown; id?: unknown; o?: unknown; p?: unknown } | null | undefined;
    const siguiente = !c ? null
      : typeof c.o === "number" && typeof c.p === "number" ? codificarCursor({ o: c.o, p: c.p })
      : typeof c.t === "string" && typeof c.id === "number" ? codificarCursor({ t: c.t, id: c.id }) : null;
    return { ...d, cursor: siguiente };
  } catch (e) {
    if (e instanceof ErrorRpc && e.confirmado) {
      // 42501: sin EXECUTE o sin lector; PGRST30x: JWT inválido o vencido.
      if (e.code === "42501" || /^PGRST30\d$/.test(e.code)) return { resultado: "sin_sesion" };
      if (e.code === "22023") return { resultado: "invalido" };
    }
    return { resultado: "error" };
  }
}

/** HTTP de la ruta. */
export function estadoHttpLectura(r: RespuestaLectura): number {
  if (r.resultado === "sin_sesion") return 401;
  if (r.resultado === "invalido") return 400;
  if (r.resultado === "error") return 500;
  return 200;
}
