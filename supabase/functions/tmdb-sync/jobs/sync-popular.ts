import { SupabaseClient } from "@supabase/supabase-js";

// Job futuro: cachear catálogo popular por plataforma/género en Supabase.
export function syncPopular(_sb: SupabaseClient): Promise<unknown> {
  throw new Error("NOT_IMPLEMENTED: syncPopular");
}
