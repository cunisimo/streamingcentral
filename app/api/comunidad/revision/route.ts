import { NextRequest } from "next/server";
import { conCors, opcionesCors } from "@/lib/cors";
import { cuerpoJson, escribir, estadoHttp, responder, uidDe } from "@/lib/comunidad/escritura";
import type { AccionEscritura } from "@/lib/comunidad/escritura-nucleo";

// "Pedir revisión" de un rechazo por regla de contenido (E3b; revisión
// §3.3.3). El autor reenvía VOLUNTARIAMENTE el mismo texto, con un
// id_intento nuevo. La ruta vuelve a correr las reglas vigentes:
//   - si siguen rechazándolo por contenido, se guarda RETENIDO con estado
//     `revision_solicitada`, pasa por la admisión de la cola (por autor y
//     global) y cuenta para el límite de la acción original. Nunca se
//     publica por esta vía sin una decisión humana (E4);
//   - si ya no lo rechazan, es un envío normal (publicar o retener).
// Sobre una edición exige `confirmar_oculta: true`: la publicada deja de
// verse mientras se revisa (§3.4.1); sin eso responde `requiere_confirmacion`
// sin tocar la base.
//
// Cuerpo: el de /api/comunidad/resenas más `confirmar_oculta` en una edición.
// Respuestas: las de /api/comunidad/resenas.
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

  const r = await escribir({
    uid, accion, texto: c.texto as string, idIntento: c.id_intento as string,
    revision: true, confirmarOculta: c.confirmar_oculta === true,
  });
  if (!r) return responder({ resultado: "no_disponible" }, 503);
  return responder(r, estadoHttp(r));
}

export const POST = conCors(manejar, "POST");
export const OPTIONS = opcionesCors("POST");
