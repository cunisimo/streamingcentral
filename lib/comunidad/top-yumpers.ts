// Top Yumpers (E7): el pedido de la ruta y la llamada a la base. Sin
// `server-only` a propósito, como lectura.ts y perfil.ts: la batería local
// corre exactamente esto contra `supabase start`.
//
// 🔴 EL CLIENTE ES EL DE QUIEN MIRA, NUNCA `service_role`. La función
// `comunidad_top_yumpers` (sólo authenticated) toma al lector de
// `auth.uid()` y, si el mes cerrado todavía no se consolidó, lo consolida
// (comprobación rápida → exclusivo → nueva comprobación → una sentencia).
// Nada de esto pasa por /api/top ni por sus cachés: el Top de plataformas
// sigue siendo exclusivamente la carga manual del dueño.
import type { SupabaseClient } from "@supabase/supabase-js";
import { errorRpc, ErrorRpc } from "./escritura-nucleo.ts";
import type { RespuestaLectura } from "./lectura.ts";

export interface PedidoTop { mes: string | null }

/** `?mes=YYYY-MM` opcional (sin él, el último mes cerrado). */
export function pedidoTop(q: URLSearchParams): PedidoTop | { invalido: string } {
  const mes = q.get("mes");
  if (mes === null) return { mes: null };
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(mes);
  if (!m) return { invalido: "mes" };
  return { mes: `${m[1]}-${m[2]}-01` };
}

export async function leerTopYumpers(sb: SupabaseClient, p: PedidoTop): Promise<RespuestaLectura> {
  try {
    const { data, error } = await sb.rpc("comunidad_top_yumpers", { p_mes: p.mes });
    if (error) throw errorRpc("comunidad_top_yumpers", error);
    if (typeof data !== "object" || data === null || Array.isArray(data)) return { resultado: "error" };
    return data as Record<string, unknown>;
  } catch (e) {
    if (e instanceof ErrorRpc && e.confirmado) {
      if (e.code === "42501" || /^PGRST30\d$/.test(e.code)) return { resultado: "sin_sesion" };
      if (e.code === "22023") return { resultado: "invalido" };
    }
    return { resultado: "error" };
  }
}
