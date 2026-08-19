import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Cliente para el navegador (dashboard): mantiene sesión en localStorage.
let browser: SupabaseClient | null = null;
export function supabaseBrowser(): SupabaseClient {
  if (!browser) browser = createClient(url, anon, { auth: { persistSession: true } });
  return browser;
}

// Cliente para el servidor (lectura pública con RLS): sin sesión.
// Next parchea el `fetch` global con su Data Cache. supabase-js usa ese fetch,
// y las lecturas del server (sobre todo `.rpc()` POST) quedaban cacheadas:
// devolvían un resultado viejo/vacío aunque hubiera datos nuevos (ej. "Lo más
// votados" mostraba solo los votos del primer usuario). Forzamos `no-store` en
// todas las llamadas de este cliente para que nunca sirvan datos viejos —
// consistente con la regla del proyecto (Supabase es Network Only, ver el SW).
export function supabaseServer(): SupabaseClient | null {
  if (!url || !anon) return null;
  return createClient(url, anon, {
    auth: { persistSession: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: "no-store" }),
    },
  });
}

// Valida un access token de Supabase y devuelve el id del usuario, o null.
//
// Es la ÚNICA forma de que una ruta sepa que quien pide tiene sesión: el resto
// de la app es anónima del lado del servidor (la sesión vive en localStorage del
// navegador, no en cookies). La usa /api/te-va-a-gustar, que sin esto aceptaba
// pedidos de cualquiera — y cada pedido puede costar hasta 80 llamadas a TMDB.
//
// Devuelve el id y NADA MÁS: no hace falta el mail ni el perfil para lo único
// que se necesita, que es saber que la sesión es real. Lo que no se pide no se
// puede filtrar por un log.
export async function usuarioDeToken(token: string | null): Promise<string | null> {
  if (!token) return null;
  const sb = supabaseServer();
  if (!sb) return null;
  try {
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

// supabaseAdmin (service role) vive en ./supabase-admin.ts, no acá: este
// archivo lo importa supabaseBrowser y SÍ llega al bundle del navegador. Ver
// el comentario en ese archivo.
