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
export function supabaseServer(): SupabaseClient | null {
  if (!url || !anon) return null;
  return createClient(url, anon, { auth: { persistSession: false } });
}
