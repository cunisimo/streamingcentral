import { NextRequest, NextResponse } from "next/server";
import { conCors, opcionesCors } from "@/lib/cors";
import { operar } from "@/lib/comunidad/escritura";
import { estadoHttpLectura } from "@/lib/comunidad/lectura";
import { leerTopYumpers, pedidoTop } from "@/lib/comunidad/top-yumpers";
import { sesionDeToken } from "@/lib/supabase";
import { supabaseComoUsuario } from "@/lib/admin-auth";

// El Top Yumpers mensual (E7), SÓLO con sesión.
//   [?mes=YYYY-MM]   sin él, el último mes cerrado (corte argentino)
// Bearer → `comunidad_top_yumpers` con la SESIÓN DE QUIEN MIRA (nunca
// service_role); la primera lectura después del corte consolida el mes. Sin
// sesión: 401 con `{resultado: "sin_sesion", activo}`, donde `activo` es SÓLO
// el interruptor (para mostrar o no el selector y la invitación): nada del
// ranking. Respuestas privadas y sin caché: no pasa por /api/top ni por sus
// cachés.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const PRIVADA = { "Cache-Control": "private, no-store", Vary: "Authorization" };
const responder = (body: unknown, status: number) => NextResponse.json(body, { status, headers: PRIVADA });

async function manejar(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const sesion = await sesionDeToken(token);
  if (!sesion || !token) {
    const activo = await operar((ops) => ops.topYumpersActivo());
    return responder({ resultado: "sin_sesion", activo: activo === true }, 401);
  }
  const p = pedidoTop(new URL(req.url).searchParams);
  if ("invalido" in p) return responder({ resultado: "invalido", motivo: p.invalido }, 400);
  const sb = supabaseComoUsuario(token);
  if (!sb) return responder({ resultado: "no_disponible" }, 503);
  const r = await leerTopYumpers(sb, p);
  return responder(r, estadoHttpLectura(r));
}

export const GET = conCors(manejar, "GET");
export const OPTIONS = opcionesCors("GET");
