import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Cliente admin (service role). SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY las
// inyecta automáticamente la plataforma de Edge Functions de Supabase.
// El service role bypassa RLS, así que puede escribir en upcoming_content/etc.
export function adminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return createClient(url, key, { auth: { persistSession: false } });
}
