import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

// Aparte de lib/supabase.ts a propósito: ese archivo lo importa también
// supabaseBrowser, así que SÍ llega al bundle del navegador (hoy no filtra
// nada porque Next solo inlinea NEXT_PUBLIC_*, pero la puerta queda abierta).
// `server-only` convierte un import accidental desde el cliente en un error
// de build en vez de un descuido silencioso que expone la service role key.
//
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
