// Los adaptadores reales del borrado de cuenta: con QUÉ se hace cada paso de
// `lib/eliminar-cuenta-flujo.ts`.
//
// Sin `server-only` a propósito, para que la batería local
// (scripts/comunidad/pruebas-baja.mjs) corra exactamente estos adaptadores
// contra `supabase start`. Los clientes los recibe de quien llama: en la app,
// `lib/eliminar-cuenta.ts` (server-only) le pasa `supabaseAdmin()`. Nada de
// este archivo lee la service role key por su cuenta.
//
// QUÉ BORRA. Paso 1: `comunidad_baja_comunitaria` (migración 012), una
// transacción en la base. Paso 2: `admin.deleteUser`, y todo lo demás cae por
// CASCADE (verificado contra la base real, pg_constraint, 22/08):
//
//   auth.users → auth.identities, auth.sessions, auth.mfa_factors,
//                auth.one_time_tokens, auth.oauth_authorizations,
//                auth.oauth_consents, auth.webauthn_challenges,
//                auth.webauthn_credentials
//              → profiles, votes, user_items (list/watched/dismissed),
//                user_reviews, view_history,
//                comunidad.bajas_en_curso (el marcador)
//              ⇢ comunidad.participantes.user_id = null (set null + la red de
//                seguridad de 012)
//
// Storage no participa: el proyecto tiene 0 buckets y 0 objetos. Si algún día
// se suben archivos por usuario, el borrado se agrega acá.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Dependencias, Existencia } from "./eliminar-cuenta-flujo";

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
export async function contrasenaValida(url: string, anon: string, email: string, password: string): Promise<boolean> {
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

/**
 * ¿La cuenta existe en Auth? Sólo un 404 `user_not_found` es "no existe".
 * Red caída, 5xx, otro error o un cliente ausente son `indeterminado`: con eso
 * el flujo nunca dice que la cuenta se eliminó.
 */
export async function existenciaEnAuth(admin: SupabaseClient | null, userId: string): Promise<Existencia> {
  if (!admin) return "indeterminado";
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (!error) return data.user ? "existe" : "indeterminado";
    const status = (error as { status?: number }).status;
    const code = (error as { code?: string }).code;
    if (status === 404 && (code === "user_not_found" || (!code && /user not found/i.test(error.message)))) {
      return "no-existe";
    }
    return "indeterminado";
  } catch {
    return "indeterminado";
  }
}

export function dependenciasReales(c: {
  admin: SupabaseClient | null;
  url: string;
  anon: string;
  // Sólo pruebas locales: otro cliente para la reconciliación (p. ej. uno que
  // apunta a un puerto cerrado, para B12). Por defecto, `admin`.
  adminExistencia?: SupabaseClient | null;
}): Dependencias {
  const { admin, url, anon } = c;
  return {
    // Se pregunta ANTES de tocar ninguna contraseña. Sin la credencial
    // administrativa el endpoint responde una sola cosa para todos los casos:
    // validar primero convertía la falta de configuración en un oráculo que
    // distingue una contraseña correcta de una incorrecta.
    hayAdmin: () => admin !== null,
    validarPassword: (email, password) => contrasenaValida(url, anon, email, password),
    bajaComunitaria: async (userId) => {
      if (!admin) return false;
      const { data, error } = await admin.rpc("comunidad_baja_comunitaria", { p_uid: userId });
      return !error && typeof data === "object" && data !== null && "cuenta" in data;
    },
    borrar: async (userId) => {
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
    existe: (userId) => existenciaEnAuth(c.adminExistencia === undefined ? admin : c.adminExistencia, userId),
    registrarFallo: async (userId, detalle) => {
      if (!admin) return;
      await admin.rpc("comunidad_baja_registrar_fallo", { p_uid: userId, p_error: detalle });
    },
  };
}
