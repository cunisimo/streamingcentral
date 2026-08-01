import { SupabaseClient } from "@supabase/supabase-js";

// Job futuro: sincronizar el catálogo de géneros de TMDB (movie/tv) a Supabase.
export function syncGenres(_sb: SupabaseClient): Promise<unknown> {
  throw new Error("NOT_IMPLEMENTED: syncGenres");
}
