import { NextRequest } from "next/server";
import { conCors, opcionesCors } from "@/lib/cors";
import { cuerpoJson, estadoHttp, operar, responder, uidDe } from "@/lib/comunidad/escritura";

// "Me sirvió" / "No me sirvió" / retirar el voto (E3a). Votar es fila A de la
// matriz; retirar, fila B. Cuerpo: { version_id, voto: "util" | "no_util" | "retirar" }.
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function manejar(req: NextRequest) {
  const uid = await uidDe(req);
  if (!uid) return responder({ resultado: "sin_sesion" }, 401);
  const c = await cuerpoJson(req);
  const v = c?.version_id;
  const voto = c?.voto;
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v <= 0 || !["util", "no_util", "retirar"].includes(voto as string)) {
    return responder({ resultado: "invalido" }, 400);
  }
  const r = await operar((ops) => (voto === "retirar" ? ops.retirarVoto(uid, v) : ops.votar(uid, v, voto === "util")));
  if (!r) return responder({ resultado: "no_disponible" }, 503);
  return responder(r, estadoHttp(r as Record<string, unknown>));
}

export const POST = conCors(manejar, "POST");
export const OPTIONS = opcionesCors("POST");
