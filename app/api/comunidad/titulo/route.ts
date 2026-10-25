import { NextRequest } from "next/server";
import { conCors, opcionesCors } from "@/lib/cors";
import { operar, responder, uidDe } from "@/lib/comunidad/escritura";

// LECTURA PROVISIONAL MÍNIMA de las reseñas de un título para la interfaz de
// E3a: la propia (en cualquier estado) y las publicadas de otros, con sus
// votos. Exige sesión. Con el módulo apagado responde { activo: false } y la
// ficha no muestra nada. E5a la reemplaza (bloqueos, suspensiones, orden y
// paginación). Nada de esto viaja en el HTML del servidor: lo pide el cliente.
// Consulta: ?tipo=movie|tv&id=<tmdb_id>.
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function manejar(req: NextRequest) {
  const uid = await uidDe(req);
  if (!uid) return responder({ resultado: "sin_sesion" }, 401);
  const u = new URL(req.url);
  const tipo = u.searchParams.get("tipo");
  const id = Number(u.searchParams.get("id"));
  if ((tipo !== "movie" && tipo !== "tv") || !Number.isSafeInteger(id) || id <= 0) return responder({ resultado: "invalido" }, 400);
  const r = await operar((ops) => ops.leerTitulo(uid, tipo, id));
  if (!r) return responder({ resultado: "no_disponible" }, 503);
  if ((r as { resultado?: unknown }).resultado === "error") return responder(r, 500);
  return responder(r, 200);
}

export const GET = conCors(manejar, "GET");
export const OPTIONS = opcionesCors("GET");
