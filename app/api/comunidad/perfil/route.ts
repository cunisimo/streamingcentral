import { NextRequest, NextResponse } from "next/server";
import { conCors, opcionesCors } from "@/lib/cors";
import { estadoHttpLectura } from "@/lib/comunidad/lectura";
import { leerPerfil, pedidoPerfil } from "@/lib/comunidad/perfil";
import { sesionDeToken } from "@/lib/supabase";
import { supabaseComoUsuario } from "@/lib/admin-auth";

// El perfil comunitario de un autor (E6), SÓLO con sesión.
//   ?id=<participante>[&cursor=<opaco>]   el de un autor
//   ?yo=1[&cursor=<opaco>]                 el propio (la cuenta)
// Bearer → `comunidad_perfil` con la SESIÓN DE QUIEN MIRA (nunca
// service_role). Sin sesión: 401 con `{resultado: "sin_sesion"}` y nada más
// (ni siquiera si el perfil existe). Respuestas privadas y sin caché.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const PRIVADA = { "Cache-Control": "private, no-store", Vary: "Authorization" };
const responder = (body: unknown, status: number) => NextResponse.json(body, { status, headers: PRIVADA });

async function manejar(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const sesion = await sesionDeToken(token);
  if (!sesion || !token) return responder({ resultado: "sin_sesion" }, 401);
  const p = pedidoPerfil(new URL(req.url).searchParams);
  if ("invalido" in p) return responder({ resultado: "invalido", motivo: p.invalido }, 400);
  const sb = supabaseComoUsuario(token);
  if (!sb) return responder({ resultado: "no_disponible" }, 503);
  const r = await leerPerfil(sb, p);
  return responder(r, estadoHttpLectura(r));
}

export const GET = conCors(manejar, "GET");
export const OPTIONS = opcionesCors("GET");
