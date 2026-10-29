// El perfil comunitario (E6): el pedido de la ruta y la llamada a la base.
// Sin `server-only` a propósito, como lectura.ts: la batería local corre
// exactamente esto contra `supabase start`.
//
// 🔴 EL CLIENTE ES EL DE QUIEN MIRA, NUNCA `service_role`. La ruta lo arma con
// `supabaseComoUsuario(token)` y la función `comunidad_perfil` (sólo
// authenticated) toma al lector de `auth.uid()`: decide bloqueos y qué
// reseñas ve. La proyección es de la base: nombre comunitario, avatar del
// catálogo, agregados y reseñas visibles; nunca correo, `user_id` ni datos
// del perfil privado.
import type { SupabaseClient } from "@supabase/supabase-js";
import { errorRpc, ErrorRpc } from "./escritura-nucleo.ts";
import { codificarCursor, decodificarCursor, TANDA, TANDA_INICIAL, type CursorRecientes, type RespuestaLectura } from "./lectura.ts";

/** `id` = participante; `yo` = el perfil propio (para la cuenta). */
export interface PedidoPerfil { id: string | null; cursor: CursorRecientes | null; limite: number }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Valida la consulta: `?id=<uuid>` o `?yo=1`, y el cursor opaco. */
export function pedidoPerfil(q: URLSearchParams): PedidoPerfil | { invalido: string } {
  const yo = q.get("yo") === "1";
  const id = q.get("id");
  if (yo === (id !== null)) return { invalido: "id" };
  if (id !== null && !UUID.test(id)) return { invalido: "id" };
  const c = q.get("cursor");
  const cursor = c === null ? null : decodificarCursor(c);
  if (c !== null && (!cursor || "o" in cursor)) return { invalido: "cursor" };
  return { id: yo ? null : id, cursor: cursor as CursorRecientes | null, limite: cursor ? TANDA : TANDA_INICIAL };
}

/** Una página del perfil, con el cursor ya codificado; o `{resultado}` como en lectura.ts. */
export async function leerPerfil(sb: SupabaseClient, p: PedidoPerfil): Promise<RespuestaLectura> {
  try {
    const { data, error } = await sb.rpc("comunidad_perfil", { p_participante: p.id, p_cursor: p.cursor, p_limite: p.limite });
    if (error) throw errorRpc("comunidad_perfil", error);
    if (typeof data !== "object" || data === null || Array.isArray(data)) return { resultado: "error" };
    const d = data as Record<string, unknown>;
    if (d.activo !== true || d.estado !== "activo") return d;
    const c = d.cursor as { t?: unknown; id?: unknown } | null | undefined;
    const siguiente = c && typeof c.t === "string" && typeof c.id === "number" ? codificarCursor({ t: c.t, id: c.id }) : null;
    return { ...d, cursor: siguiente };
  } catch (e) {
    if (e instanceof ErrorRpc && e.confirmado) {
      if (e.code === "42501" || /^PGRST30\d$/.test(e.code)) return { resultado: "sin_sesion" };
      if (e.code === "22023" || e.code === "22P02") return { resultado: "invalido" };
    }
    return { resultado: "error" };
  }
}
