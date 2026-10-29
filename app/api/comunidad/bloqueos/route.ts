import { NextRequest } from "next/server";
import { conCors, opcionesCors } from "@/lib/cors";
import { cuerpoJson, operar, responder, uidDe } from "@/lib/comunidad/escritura";
import { estadoHttpMenu } from "@/lib/comunidad/moderacion-nucleo";

// Bloqueos personales (E3b, fila D de la matriz): ocultan las reseñas del
// bloqueado SÓLO para quien bloquea y no cambian su estado. Nada más que la
// sesión los impide (ni suspensión, ni pausa, ni módulo apagado, ni términos
// ni correo).
//
// POST { accion: "listar" } → { activo, bloqueados: [{ bloqueo_id, creado_en, origen_tipo, origen_tmdb_id }] }
//      (POST y no GET: el CORS de la app declara un método por ruta)
// POST { accion: "bloquear", version_id } | { accion: "desbloquear", bloqueo_id }
// Respuestas como /api/comunidad/denuncias.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const entero = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n > 0;

async function listar(uid: string) {
  const r = await operar((ops) => ops.bloqueados(uid));
  if (!r) return responder({ resultado: "no_disponible" }, 503);
  const x = r as Record<string, unknown>;
  return responder(x, x.resultado === "error" ? 500 : 200);
}

async function manejar(req: NextRequest) {
  const uid = await uidDe(req);
  if (!uid) return responder({ resultado: "sin_sesion" }, 401);
  const c = await cuerpoJson(req);
  if (c?.accion === "listar") return listar(uid);
  let r: unknown = null;
  if (c?.accion === "bloquear" && entero(c.version_id)) {
    const v = c.version_id;
    r = await operar((ops) => ops.bloquear(uid, v));
  } else if (c?.accion === "desbloquear" && entero(c.bloqueo_id)) {
    const b = c.bloqueo_id;
    r = await operar((ops) => ops.desbloquear(uid, b));
  } else {
    return responder({ resultado: "invalido" }, 400);
  }
  if (!r) return responder({ resultado: "no_disponible" }, 503);
  const x = r as Record<string, unknown>;
  const out: Record<string, unknown> = { resultado: x.resultado };
  for (const k of ["motivo", "repetido", "bloqueo_id"]) if (k in x) out[k] = x[k];
  return responder(out, estadoHttpMenu(out));
}

export const POST = conCors(manejar, "POST");
export const OPTIONS = opcionesCors("POST");
