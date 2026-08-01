import { SupabaseClient } from "@supabase/supabase-js";

// Job futuro: cachear /trending en Supabase para Home sin pegarle a TMDB en vivo.
export function syncTrending(_sb: SupabaseClient): Promise<unknown> {
  throw new Error("NOT_IMPLEMENTED: syncTrending");
}
