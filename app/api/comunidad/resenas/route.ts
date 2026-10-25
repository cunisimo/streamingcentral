import { NextRequest } from "next/server";
import { conCors, opcionesCors } from "@/lib/cors";
import { cuerpoJson, escribir, estadoHttp, responder, uidDe } from "@/lib/comunidad/escritura";
import type { AccionEscritura } from "@/lib/comunidad/escritura-nucleo";

// Crear o editar una reseña de la comunidad (E3a). Bearer → reglas de E1 →
// `comunidad_publicar` / `comunidad_editar` (sólo service_role). El uid sale
// del token; el cuerpo trae la acción, el texto y el id_intento del cliente.
//
// Cuerpo: { accion: "publicar", tipo, tmdb_id, texto, id_intento }
//       | { accion: "editar", resena_id, version_esperada, texto, id_intento }
// Respuestas: 401 sin sesión; 400 pedido inválido; 503 sin configuración;
// 500 "error" (no se guardó nada); 200 con { resultado, … } para todo lo demás.
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function manejar(req: NextRequest) {
  const uid = await uidDe(req);
  if (!uid) return responder({ resultado: "sin_sesion" }, 401);
  const c = await cuerpoJson(req);
  if (!c) return responder({ resultado: "invalido" }, 400);

  let accion: AccionEscritura | null = null;
  if (c.accion === "publicar") {
    accion = { tipo: "publicar", titulo: { tipo: c.tipo as "movie" | "tv", tmdbId: c.tmdb_id as number } };
  } else if (c.accion === "editar") {
    accion = { tipo: "editar", resenaId: c.resena_id as number, versionEsperada: c.version_esperada as number };
  }
  if (!accion) return responder({ resultado: "invalido" }, 400);

  const r = await escribir({ uid, accion, texto: c.texto as string, idIntento: c.id_intento as string });
  if (!r) return responder({ resultado: "no_disponible" }, 503);
  return responder(r, estadoHttp(r));
}

export const POST = conCors(manejar, "POST");
export const OPTIONS = opcionesCors("POST");
