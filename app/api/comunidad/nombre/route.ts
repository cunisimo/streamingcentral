import { NextRequest } from "next/server";
import { conCors, opcionesCors } from "@/lib/cors";
import { cuerpoJson, estadoHttp, nombrar, responder, uidDe } from "@/lib/comunidad/escritura";

// Elegir o cambiar el nombre comunitario (E6). Bearer → reglas de nombre de
// E1 → `comunidad_cambiar_nombre` (sólo service_role). El uid sale del token;
// el cuerpo trae SÓLO el nombre. Nunca toca `profiles.display_name`, y
// cambiar ese campo no cambia este nombre.
//
// Cuerpo: { nombre, id_intento } (id_intento: uuid del cliente, el mismo en
// cada reintento del mismo envío; A1 de la auditoría de E6)
// Respuestas: 401 sin sesión; 400 pedido inválido; 503 sin configuración o
// "sin_confirmar" (se perdió la confirmación dos veces: pudo haberse
// guardado); 500 "error" (confirmado: no se guardó nada); 200 con
// { resultado, … } para lo demás: nombre_cambiado, sin_cambios,
// rechazo_formato, rechazo_contenido, nombre_no_admitido, rechazo_cuenta,
// conflicto (mismo intento con otro nombre); `repetido` si el intento ya se
// había resuelto.
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function manejar(req: NextRequest) {
  const uid = await uidDe(req);
  if (!uid) return responder({ resultado: "sin_sesion" }, 401);
  const c = await cuerpoJson(req);
  if (!c || typeof c.nombre !== "string" || typeof c.id_intento !== "string") return responder({ resultado: "invalido" }, 400);
  const r = await nombrar({ uid, nombre: c.nombre, idIntento: c.id_intento });
  if (!r) return responder({ resultado: "no_disponible" }, 503);
  return responder(r, estadoHttp(r));
}

export const POST = conCors(manejar, "POST");
export const OPTIONS = opcionesCors("POST");
