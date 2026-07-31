import { SupabaseClient } from "@supabase/supabase-js";

// Job futuro: sincronizar el catálogo completo de watch providers de AR
// (nombres/logos/prioridad) desde /watch/providers/{movie,tv}?watch_region=AR,
// independientemente de los estrenos. Hoy `providers` se puebla como efecto
// secundario de syncUpcoming; este job lo mantendría completo y al día.
export function syncProviders(_sb: SupabaseClient): Promise<unknown> {
  throw new Error("NOT_IMPLEMENTED: syncProviders");
}
