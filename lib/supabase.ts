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

// Cliente admin (service role): bypassa RLS. SOLO para rutas de servidor que
// escriben en tablas sin policy de escritura — hoy, el cron que ingesta el top
// 10 de Netflix. Nunca importarlo desde un componente cliente: la key da acceso
// total a la base.
export function supabaseAdmin(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: "no-store" }),
    },
  });
}
