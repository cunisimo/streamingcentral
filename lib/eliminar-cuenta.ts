// Borrado definitivo de una cuenta.
//
// Vive acá y no adentro de la ruta a propósito: la página pública
// `/eliminar-cuenta` que va a exigir Google Play tiene que poder reutilizar
// exactamente este mecanismo. Lo único que esa página tendrá que hacer es
// iniciar sesión y llamar al mismo endpoint — la identidad sale del token, no de
// quién llama.
//
// QUÉ BORRA Y EN QUÉ ORDEN: `lib/eliminar-cuenta-deps.ts` (los adaptadores) y
// `lib/eliminar-cuenta-flujo.ts` (el orden, con tests).
//
// HAY UN ESTADO PARCIAL POSIBLE, y es explícito (contrato de baja, E2b). El
// borrado tiene dos pasos que no comparten atomicidad: primero lo comunitario
// (una transacción en la base, que deja un marcador de baja en curso) y
// después `deleteUser` (que es atómico por CASCADE: o se borró la fila de
// `auth.users` y cayó todo, o no se borró nada). Si el segundo falla con la
// cuenta viva, la respuesta lo dice ("baja-parcial") y la persona puede
// reintentar; si no se puede saber, "baja-sin-verificar". Nunca se responde
// que la cuenta se eliminó si Auth sigue teniéndola.
//
// ⚠️ Requiere las migraciones 011 y 012 aplicadas en la base: sin
// `comunidad_baja_comunitaria`, el paso 1 falla y la eliminación responde
// `fallo-borrado` sin borrar nada.
import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import { correrFlujo, type Resultado } from "./eliminar-cuenta-flujo";
import { dependenciasReales } from "./eliminar-cuenta-deps";

export type ResultadoEliminar = Resultado;

export async function eliminarCuenta(opts: {
  // Ya verificado contra Supabase por quien llama. Nunca sale del cuerpo del pedido.
  userId: string;
  email: string;
  password: string;
}): Promise<ResultadoEliminar> {
  return correrFlujo(dependenciasReales({
    admin: supabaseAdmin(),
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  }), opts);
}
