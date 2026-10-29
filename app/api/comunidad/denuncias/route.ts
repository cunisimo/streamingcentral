import { NextRequest } from "next/server";
import { conCors, opcionesCors } from "@/lib/cors";
import { cuerpoJson, denunciar, responder, uidDe } from "@/lib/comunidad/escritura";
import { estadoHttpMenu } from "@/lib/comunidad/moderacion-nucleo";

// Denunciar una reseña (E3b, fila C de la matriz). Bearer → núcleo de
// lib/comunidad/moderacion-nucleo.ts → `comunidad_denunciar` (sólo
// service_role). La denuncia NO oculta la reseña: entra a la cola de
// denuncias y la revisa una persona. Con `bloquear: true` se bloquea al autor
// en el mismo paso, aunque la denuncia no se haya podido recibir.
//
// Cuerpo: { version_id, categoria, comentario?, bloquear? }
// Respuestas: 401 sin sesión; 400 pedido inválido; 503 sin configuración o
// `sin_confirmar` (no se sabe si llegó; reintentar no duplica); 500 "error"
// (confirmado: no se registró); 200 con { resultado, motivo?, repetido?,
// bloqueo? } para todo lo demás.
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function manejar(req: NextRequest) {
  const uid = await uidDe(req);
  if (!uid) return responder({ resultado: "sin_sesion" }, 401);
  const c = await cuerpoJson(req);
  if (!c) return responder({ resultado: "invalido" }, 400);
  const r = await denunciar({ uid, versionId: c.version_id, categoria: c.categoria, comentario: c.comentario, bloquear: c.bloquear });
  if (!r) return responder({ resultado: "no_disponible" }, 503);
  return responder(r, estadoHttpMenu(r));
}

export const POST = conCors(manejar, "POST");
export const OPTIONS = opcionesCors("POST");
