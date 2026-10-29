import { NextRequest } from "next/server";
import { conCors, opcionesCors } from "@/lib/cors";
import { cuerpoJson, estadoHttp, operar, responder, uidDe } from "@/lib/comunidad/escritura";

// Aceptar la versión vigente de los términos de la comunidad (E3a). Crea la
// identidad comunitaria si no existe. Cuerpo: { version }. Si no coincide con
// la vigente en la base, no se acepta nada (`terminos_desactualizados`).
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function manejar(req: NextRequest) {
  const uid = await uidDe(req);
  if (!uid) return responder({ resultado: "sin_sesion" }, 401);
  const c = await cuerpoJson(req);
  const version = c?.version;
  if (typeof version !== "string" || version.length < 1 || version.length > 40) return responder({ resultado: "invalido" }, 400);
  const r = await operar((ops) => ops.aceptarTerminos(uid, version));
  if (!r) return responder({ resultado: "no_disponible" }, 503);
  return responder(r, estadoHttp(r as Record<string, unknown>));
}

export const POST = conCors(manejar, "POST");
export const OPTIONS = opcionesCors("POST");
