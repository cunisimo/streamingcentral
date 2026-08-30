import { NextRequest, NextResponse } from "next/server";
import { sesionDeToken } from "@/lib/supabase";
import { eliminarCuenta } from "@/lib/eliminar-cuenta";
import { bloqueado, minutosRestantes, registrarFallo, type Intentos } from "@/lib/intentos-eliminar";
import { cuentaComoIntento } from "@/lib/eliminar-cuenta-flujo";
import { conCors, opcionesCors } from "@/lib/cors";

// Dinámica y sin caché: es una acción destructiva, no una lectura. Una respuesta
// de esto guardada en cualquier lado no tiene ningún uso legítimo.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Sin cache en ningún salto intermedio. Se pone en TODAS las respuestas, no solo
// en la exitosa: un 401 cacheado dejaría a alguien sin poder reintentar.
const SIN_CACHE = { "Cache-Control": "no-store, no-cache, must-revalidate" };
const responder = (body: unknown, status: number) =>
  NextResponse.json(body, { status, headers: SIN_CACHE });

// Intentos fallidos por usuario. En memoria del proceso, y hay que decir qué
// significa eso: en serverless cada instancia tiene la suya, así que el límite
// real es "5 por instancia" y no "5 en total". Alcanza para lo que protege —que
// alguien con un dispositivo abierto no pueda probar contraseñas de a miles— y
// no vale la pena un round-trip a Upstash en el camino de una acción que se hace
// una vez en la vida. Si algún día hace falta que sea estricto, la pieza a
// cambiar es este Map por `lib/cache.ts`.
const intentos = new Map<string, Intentos>();

// El cuerpo SOLO trae la contraseña. Ni el id ni el email: los dos salen del
// token verificado. No hay ningún campo del cliente que pueda cambiar A QUIÉN se
// borra, así que un usuario no puede borrar a otro ni equivocándose ni a
// propósito.
interface Cuerpo { password?: unknown }

async function manejar(req: NextRequest) {
  // NADA de esta función registra el cuerpo, la contraseña, el token ni el
  // email. Los errores se devuelven como códigos propios, no como el mensaje de
  // Supabase, que puede incluir el email en algunos casos.
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const sesion = await sesionDeToken(token);
  if (!sesion) return responder({ error: "sin-sesion" }, 401);

  const ahora = Date.now();
  const previos = intentos.get(sesion.id) ?? null;
  if (bloqueado(previos, ahora)) {
    return responder({ error: "demasiados-intentos", minutos: minutosRestantes(previos, ahora) }, 429);
  }

  let cuerpo: Cuerpo;
  try {
    cuerpo = (await req.json()) as Cuerpo;
  } catch {
    return responder({ error: "cuerpo-invalido" }, 400);
  }
  const password = typeof cuerpo.password === "string" ? cuerpo.password : "";
  if (!password) return responder({ error: "falta-password" }, 400);

  const r = await eliminarCuenta({ userId: sesion.id, email: sesion.email, password });

  // Solo suma al límite lo que de verdad comprobó una contraseña y la encontró
  // mal. Un `sin-config` no llegó a comprobar ninguna, y contarlo dejaría a la
  // persona bloqueada quince minutos por un problema del servidor.
  if (cuentaComoIntento(r)) {
    intentos.set(sesion.id, registrarFallo(previos, ahora));
    return responder({ error: "password-invalida" }, 401);
  }
  if (!r.ok && r.motivo === "sin-config") {
    // 503 y no 500: el servicio no está disponible, no es que este pedido salió
    // mal. Y es la MISMA respuesta con cualquier contraseña — sin esto, el par
    // 401/500 convertía la falta de configuración en un oráculo que distingue
    // la contraseña correcta de la incorrecta.
    return responder({ error: "no-disponible" }, 503);
  }
  if (!r.ok) return responder({ error: "no-se-pudo" }, 500);

  // La cuenta ya no existe: el contador tampoco tiene por qué.
  intentos.delete(sesion.id);
  return responder({ ok: true }, 200);
}

// CORS para el contenedor. `manejar` es el cuerpo de siempre, sin cambios:
// `conCors` envuelve la Response FINAL, así que ningún camino de salida queda
// sin encabezados. `opcionesCors` NO recibe el handler, así que el preflight no
// puede ejecutar la lógica de la ruta. Ver lib/cors.ts.
export const POST = conCors(manejar, "POST");
export const OPTIONS = opcionesCors("POST");
