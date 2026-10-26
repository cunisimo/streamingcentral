import { NextRequest, NextResponse } from "next/server";
import { conCors, opcionesCors } from "@/lib/cors";
import { operar } from "@/lib/comunidad/escritura";
import { estadoHttpLectura, leerResenas, pedidoLectura } from "@/lib/comunidad/lectura";
import { sesionDeToken } from "@/lib/supabase";
import { supabaseComoUsuario } from "@/lib/admin-auth";

// Leer las reseñas de la comunidad de un título (E5a), SÓLO con sesión.
// Reemplaza la lectura provisional de E3a/E3b (borrada en 017).
//   ?tipo=movie|tv&id=<tmdb_id>&orden=recientes[&cursor=<opaco>]
// Bearer → `comunidad_resenas` con la SESIÓN DEL LECTOR (nunca service_role):
// la base toma al lector de `auth.uid()` y filtra visibilidad, bloqueos y
// suspensiones en cada página. Sin sesión: 401 con `{resultado: "sin_sesion",
// activo}`, donde `activo` es SÓLO el interruptor del módulo (para mostrar o
// no la invitación a registrarse): nada de ningún título. Respuestas privadas
// y sin caché: nada comunitario pasa por /api/title ni por cachés compartidas.
//
// Vive en su propio archivo y no como GET de /api/comunidad/resenas porque
// la envoltura CORS (lib/cors.ts y su inventario) admite UN método por ruta.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const PRIVADA = { "Cache-Control": "private, no-store", Vary: "Authorization" };
const responder = (body: unknown, status: number) => NextResponse.json(body, { status, headers: PRIVADA });

async function manejar(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const sesion = await sesionDeToken(token);
  if (!sesion || !token) {
    const activo = await operar((ops) => ops.moduloActivo());
    return responder({ resultado: "sin_sesion", activo: activo === true }, 401);
  }
  const p = pedidoLectura(new URL(req.url).searchParams);
  if ("invalido" in p) return responder({ resultado: "invalido", motivo: p.invalido }, 400);
  const sb = supabaseComoUsuario(token);
  if (!sb) return responder({ resultado: "no_disponible" }, 503);
  const r = await leerResenas(sb, p);
  return responder(r, estadoHttpLectura(r));
}

export const GET = conCors(manejar, "GET");
export const OPTIONS = opcionesCors("GET");
