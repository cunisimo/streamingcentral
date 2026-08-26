// Borrado definitivo de una cuenta.
//
// Vive acá y no adentro de la ruta a propósito: la página pública
// `/eliminar-cuenta` que va a exigir Google Play tiene que poder reutilizar
// exactamente este mecanismo. Lo único que esa página tendrá que hacer es
// iniciar sesión y llamar al mismo endpoint — la identidad sale del token, no de
// quién llama.
//
// QUÉ BORRA. Una sola operación: `admin.deleteUser`. Todo lo demás cae por
// CASCADE, y eso está verificado contra la base real (pg_constraint, 22/08), no
// contra schema.sql:
//
//   auth.users → auth.identities, auth.sessions, auth.mfa_factors,
//                auth.one_time_tokens, auth.oauth_authorizations,
//                auth.oauth_consents, auth.webauthn_challenges,
//                auth.webauthn_credentials
//              → profiles, votes, user_items (list/watched/dismissed),
//                user_reviews, view_history
//
// Storage no participa: el proyecto tiene 0 buckets y 0 objetos. Los avatares
// son archivos propios de Yump servidos desde `/avatars/`, iguales para todo el
// mundo; el perfil sólo guarda CUÁL eligió cada persona, y esa fila se va con el
// CASCADE. Si algún día se suben archivos por usuario, ESTE es el lugar donde
// hay que agregar su borrado.
//
// NO HAY ESTADOS PARCIALES, y no por cuidado nuestro sino por el diseño de la
// base: al ser todo CASCADE, el borrado es atómico. O se borró la fila de
// `auth.users` y cayó todo, o no se borró nada. No hay secuencia que pueda
// quedar a la mitad.
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "./supabase-admin";
import { correrFlujo, type Resultado } from "./eliminar-cuenta-flujo";

// El orden de los pasos vive en ./eliminar-cuenta-flujo, que es donde se puede
// probar QUÉ se ejecuta y qué no. Acá solo se cablea con qué se hace cada uno.
export type ResultadoEliminar = Resultado;

// Revalida la contraseña de un usuario YA identificado por su token.
//
// CLIENTE AISLADO POR PEDIDO, y las tres opciones importan:
//   - `persistSession: false` — no guarda nada en ningún storage del servidor.
//   - `autoRefreshToken: false` — no arranca un temporizador que sobreviva al
//     pedido y renueve una sesión que nadie va a usar.
//   - `detectSessionInUrl: false` — no tiene sentido fuera del navegador.
//
// Un cliente global compartido guardaría la sesión creada acá y la dejaría
// disponible para el pedido siguiente, que puede ser de otra persona. Este
// cliente nace y muere con la verificación.
//
// El email NO viene del cliente: lo trae quien llama, sacado del usuario que ya
// verificó el token. Si viniera del cuerpo del pedido, alguien podría revalidar
// contra una cuenta y borrar otra.
async function contrasenaValida(email: string, password: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !anon) return false;
  const sb = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.session) return false;
  // Se cierra la sesión que acaba de crearse. Con `persistSession: false` no
  // quedó guardada en ningún lado, pero el refresh token SÍ existe del lado de
  // Supabase hasta que se revoque: dejarlo vivo sería dejar una credencial
  // válida flotando por cada verificación.
  await sb.auth.signOut();
  return true;
}

export async function eliminarCuenta(opts: {
  // Ya verificado contra Supabase por quien llama. Nunca sale del cuerpo del pedido.
  userId: string;
  email: string;
  password: string;
}): Promise<ResultadoEliminar> {
  return correrFlujo({
    // Se pregunta ANTES de tocar ninguna contraseña. Sin la credencial
    // administrativa el endpoint responde una sola cosa para todos los casos:
    // validar primero convertía la falta de configuración en un oráculo que
    // distingue una contraseña correcta de una incorrecta.
    hayAdmin: () => supabaseAdmin() !== null,
    validarPassword: contrasenaValida,
    borrar: async (userId) => {
      const admin = supabaseAdmin();
      if (!admin) return false;
      // `shouldSoftDelete: false` EXPLÍCITO. Es el default de Supabase, pero es
      // justo el parámetro que convierte esto en lo contrario de lo que promete
      // la pantalla: un soft delete deja la fila con `deleted_at` y NO dispara
      // los CASCADE, así que votos, historial y perfil seguirían existiendo
      // mientras la interfaz dice "eliminada para siempre". Escrito, no puede
      // cambiar por un default de una versión futura sin que alguien lo lea.
      const { error } = await admin.auth.admin.deleteUser(userId, false);
      return !error;
    },
  }, opts);
}
