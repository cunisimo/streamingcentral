import { NextRequest, NextResponse } from "next/server";
import { adminDeToken, supabaseComoUsuario, tokenDeHeader } from "@/lib/admin-auth";
import { estadoHttpModeracion, pedidoModeracion } from "@/lib/comunidad/admin-nucleo";
import { moderar } from "@/lib/comunidad/admin-moderacion";

export const dynamic = "force-dynamic";

// Moderación de las reseñas de la comunidad (E4). Igual que /api/admin/top:
// UNA ruta con `accion`, para que la puerta (admin + segundo factor) esté
// escrita una sola vez. La segunda capa es la base: cada función comprueba
// `is_admin_mfa()` adentro, así que un RPC directo con un token sin MFA
// también se rechaza (42501).
//
// 🔴 CON LA SESIÓN DEL ADMIN, NUNCA CON `service_role`: el cliente sale de
// `supabaseComoUsuario(token)`. El admin que decide sale del token verificado
// (`auth.uid()` en la base), nunca del cuerpo.
//
// Sólo POST (lecturas incluidas): la respuesta es privada y nunca se cachea.
const PRIVADO = { "Cache-Control": "private, no-store" };

export async function POST(req: NextRequest) {
  const a = await adminDeToken(tokenDeHeader(req.headers.get("authorization")));
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status, headers: PRIVADO });
  const sb = supabaseComoUsuario(a.token);
  if (!sb) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503, headers: PRIVADO });

  let cuerpo: unknown;
  try { cuerpo = await req.json(); } catch { return NextResponse.json({ resultado: "invalido" }, { status: 400, headers: PRIVADO }); }
  const p = pedidoModeracion(cuerpo);
  if ("invalido" in p) return NextResponse.json({ resultado: "invalido", aviso: p.invalido }, { status: 400, headers: PRIVADO });

  const r = await moderar(sb, p);
  return NextResponse.json(r, { status: estadoHttpModeracion(r), headers: PRIVADO });
}
