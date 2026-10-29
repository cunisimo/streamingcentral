import { NextRequest, NextResponse } from "next/server";
import { sesionDeToken } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { conCors, opcionesCors } from "@/lib/cors";

// ¿La cuenta de este token tiene una eliminación pendiente? (contrato de baja,
// E2b, caso B13). Las tablas de la comunidad están cerradas para todos los
// roles de la API, así que la ÚNICA vía es `comunidad_estado_baja`, ejecutable
// sólo por service_role, con el uid que sale del token verificado. Nada del
// pedido elige de qué cuenta se habla: otra cuenta no puede ver este marcador.
//
// Respuestas: 401 sin sesión; 503 si no se puede consultar (nunca se lee como
// "no hay baja pendiente"); 200 { pendiente, iniciada_en?, intentos? }.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const SIN_CACHE = { "Cache-Control": "no-store, no-cache, must-revalidate" };
const responder = (body: unknown, status: number) =>
  NextResponse.json(body, { status, headers: SIN_CACHE });

async function manejar(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const sesion = await sesionDeToken(token);
  if (!sesion) return responder({ error: "sin-sesion" }, 401);

  const admin = supabaseAdmin();
  if (!admin) return responder({ error: "no-disponible" }, 503);
  const { data, error } = await admin.rpc("comunidad_estado_baja", { p_uid: sesion.id });
  if (error || typeof data !== "object" || data === null || typeof (data as { pendiente?: unknown }).pendiente !== "boolean") {
    return responder({ error: "no-disponible" }, 503);
  }
  const d = data as { pendiente: boolean; iniciada_en?: string; intentos?: number };
  return responder(d.pendiente
    ? { pendiente: true, iniciada_en: d.iniciada_en ?? null, intentos: d.intentos ?? 0 }
    : { pendiente: false }, 200);
}

export const GET = conCors(manejar, "GET");
export const OPTIONS = opcionesCors("GET");
