import { NextRequest } from "next/server";
import { conCors, opcionesCors } from "@/lib/cors";
import { cuerpoJson, estadoHttp, operar, responder, uidDe } from "@/lib/comunidad/escritura";

// Borrar la propia reseña (E3a, fila B de la matriz: nada más lo impide).
// Idempotente. Cuerpo: { resena_id }.
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function manejar(req: NextRequest) {
  const uid = await uidDe(req);
  if (!uid) return responder({ resultado: "sin_sesion" }, 401);
  const c = await cuerpoJson(req);
  const id = c?.resena_id;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) return responder({ resultado: "invalido" }, 400);
  const r = await operar((ops) => ops.borrar(uid, id));
  if (!r) return responder({ resultado: "no_disponible" }, 503);
  return responder(r, estadoHttp(r as Record<string, unknown>));
}

export const POST = conCors(manejar, "POST");
export const OPTIONS = opcionesCors("POST");
