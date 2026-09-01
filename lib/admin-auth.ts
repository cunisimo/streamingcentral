// La puerta de las APIs administrativas: admin CON segundo factor.
//
// ============================================================================
// POR QUÉ ESTO EXISTE, SI YA HAY UN GUARD EN `/admin`
// ============================================================================
// La sesión de esta app vive en `localStorage`, no en cookies (ver
// `supabaseBrowser` en lib/supabase.ts). El servidor no sabe quién pide una
// página, así que el guard de `/admin/layout.tsx` es **sólo experiencia de
// usuario**: evita que se dibuje un dashboard que no vas a poder usar, y nada
// más. Un `curl` contra la API no lo ve nunca.
//
// La seguridad real son dos capas que comprueban lo mismo:
//
//   1. `adminDeToken`, en cada API administrativa;
//   2. `is_admin_mfa()` en las policies de RLS (migración 007).
//
// 🔴 LA SEGUNDA NO ES REDUNDANTE: sin ella, un token de admin sin MFA escribe
// directo contra PostgREST con la anon key y la API no se entera. Con ella, la
// base rechaza igual.
//
// ⚠️ ACÁ NO SE USA `service_role`, y es una decisión del dueño. El dashboard
// escribe con la sesión del admin, bajo RLS. Con la clave de servicio las
// policies no correrían y la comprobación de MFA en la base sería decorativa.
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { aalDelToken } from "./admin-auth-nucleo";
import { supabaseServer } from "./supabase";

export { aalDelToken, tokenDeHeader } from "./admin-auth-nucleo";

export type ResultadoAdmin =
  | { ok: true; id: string; token: string }
  | { ok: false; status: 401 | 403 | 503; error: string };

/**
 * ¿Quien manda este token es admin y pasó por el segundo factor?
 *
 * Devuelve códigos distintos a propósito: `401` es "no sé quién sos" y `403` es
 * "sé quién sos y no alcanza". Mezclarlos le diría a un atacante que un token
 * cualquiera es válido.
 *
 * El orden importa y está fijado por un test: primero `getUser()` —que verifica
 * la firma contra Supabase— y recién después se lee el `aal`.
 */
export async function adminDeToken(token: string | null): Promise<ResultadoAdmin> {
  if (!token) return { ok: false, status: 401, error: "sin sesión" };
  const sb = supabaseServer();
  if (!sb) return { ok: false, status: 503, error: "Supabase no configurado" };

  let uid: string;
  try {
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) return { ok: false, status: 401, error: "sesión inválida" };
    uid = data.user.id;
  } catch {
    return { ok: false, status: 503, error: "no se pudo validar la sesión" };
  }

  if (aalDelToken(token) !== "aal2") {
    return { ok: false, status: 403, error: "falta el segundo factor" };
  }

  // El perfil se lee CON el token del usuario, no con la anon key suelta: así la
  // consulta pasa por las mismas policies que todo lo demás.
  const comoUsuario = supabaseComoUsuario(token);
  if (!comoUsuario) return { ok: false, status: 503, error: "Supabase no configurado" };
  const { data, error } = await comoUsuario
    .from("profiles").select("is_admin").eq("id", uid).maybeSingle();
  if (error) return { ok: false, status: 503, error: "no se pudo leer el perfil" };
  if (!data?.is_admin) return { ok: false, status: 403, error: "no sos administrador" };

  return { ok: true, id: uid, token };
}

/**
 * Un cliente de Supabase que actúa COMO el usuario del token.
 *
 * Es lo que hace que las escrituras del dashboard pasen por RLS: PostgREST lee
 * el `Authorization` y `auth.uid()` resuelve al admin, así que
 * `is_admin_mfa()` puede decidir. Con `service_role` no correría ninguna policy.
 */
export function supabaseComoUsuario(token: string): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !anon) return null;
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${token}` },
      // Mismo motivo que en `supabaseServer`: Next parchea el fetch global con
      // su Data Cache y una lectura del dashboard no puede servir datos viejos.
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: "no-store" }),
    },
  });
}
