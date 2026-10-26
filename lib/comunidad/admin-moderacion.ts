// Moderación administrativa (E4): las llamadas a las funciones de la base.
// Sin `server-only` a propósito, para que la batería local
// (scripts/comunidad/pruebas-admin.mjs) corra exactamente esto contra
// `supabase start`, como escritura-deps.ts.
//
// 🔴 EL CLIENTE ES EL DEL ADMIN, NUNCA `service_role`. Lo arma la ruta con
// `supabaseComoUsuario(token)` (lib/admin-auth.ts): PostgREST lee el Bearer,
// `auth.uid()` resuelve al admin y cada función comprueba `is_admin_mfa()`
// adentro. Con la clave de servicio la base respondería 42501 igual: no hay
// `auth.uid()` que sea admin.
import type { SupabaseClient } from "@supabase/supabase-js";
import { conReconciliacion, errorRpc, ErrorRpc } from "./escritura-nucleo.ts";
import type { PedidoModeracion } from "./admin-nucleo.ts";

type Resultado = Record<string, unknown>;

async function rpcCrudo(sb: SupabaseClient, f: string, args: Record<string, unknown>): Promise<Resultado> {
  const { data, error } = await sb.rpc(f, args);
  if (error) throw errorRpc(f, error);
  if (typeof data !== "object" || data === null || Array.isArray(data)) throw errorRpc(f, { message: "respuesta inesperada" });
  return data as Resultado;
}

/** Un rechazo confirmado de la base, como resultado de la ruta. Otro error: se propaga. */
function rechazoConfirmado(e: unknown): Resultado | null {
  if (!(e instanceof ErrorRpc) || !e.confirmado) return null;
  if (e.code === "42501") return { resultado: "no_autorizado" };
  if (e.code === "22023" || e.code === "22004") return { resultado: "invalido" };
  return { resultado: "error" };
}

const LECTURAS: Record<string, (p: Extract<PedidoModeracion, { tipo: "leer" }>) => [string, Record<string, unknown>]> = {
  resumen: () => ["comunidad_admin_resumen", {}],
  retenidos: (p) => ["comunidad_admin_retenidos", { p_limite: 20, p_despues: p.despues }],
  denuncias: (p) => ["comunidad_admin_denuncias", { p_limite: 20, p_despues: p.despues }],
  retiradas: (p) => ["comunidad_admin_retiradas", { p_limite: 20, p_despues: p.despues }],
  version: (p) => ["comunidad_admin_version", { p_version: p.version }],
  cuentas: () => ["comunidad_admin_cuentas", {}],
  registro: (p) => ["comunidad_admin_registro", { p_limite: 30, p_antes: p.antes }],
  muestreo: () => ["comunidad_admin_muestreo", {}],
};

/**
 * Corre un pedido ya validado (`pedidoModeracion`). Lecturas: el dato o
 * `{resultado: "error" | "no_autorizado"}`. Acciones: idempotentes por su
 * intento, así que una confirmación perdida se repite UNA vez para recuperar
 * el resultado (`conReconciliacion`); si tampoco, `sin_confirmar`.
 */
export async function moderar(sb: SupabaseClient, p: PedidoModeracion): Promise<Resultado> {
  if (p.tipo === "leer") {
    const [f, args] = LECTURAS[p.vista](p);
    try {
      return await rpcCrudo(sb, f, args);
    } catch (e) {
      return rechazoConfirmado(e) ?? { resultado: "error" };
    }
  }
  const [f, args]: [string, Record<string, unknown>] =
    p.tipo === "decidir" ? ["comunidad_admin_decidir", { p_accion: p.accion, p_version: p.version, p_motivo: p.motivo, p_id_intento: p.intento }]
    : p.tipo === "suspender" ? ["comunidad_admin_suspender", { p_participante: p.participante, p_motivo: p.motivo, p_id_intento: p.intento }]
    : p.tipo === "levantar" ? ["comunidad_admin_levantar_suspension", { p_participante: p.participante, p_motivo: p.motivo, p_id_intento: p.intento }]
    : p.tipo === "quitar_marcador" ? ["comunidad_quitar_marcador_baja", { p_user: p.cuenta, p_motivo: p.motivo, p_id_intento: p.intento }]
    : ["comunidad_admin_publicacion", { p_activa: p.activa, p_motivo: p.motivo, p_id_intento: p.intento }];
  try {
    return await conReconciliacion(() => rpcCrudo(sb, f, args));
  } catch (e) {
    return rechazoConfirmado(e) ?? { resultado: "sin_confirmar" };
  }
}
