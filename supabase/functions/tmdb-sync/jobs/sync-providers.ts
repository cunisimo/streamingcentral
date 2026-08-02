import { SupabaseClient } from "@supabase/supabase-js";
import { providerList, RawProviderInfo } from "../lib/tmdb.ts";

// Puebla `providers` con la lista completa de watch providers de AR (movie+tv)
// desde TMDB. Idempotente (upsert por id). Es la fuente autoritativa de
// plataformas para el onboarding.
export async function syncProviders(sb: SupabaseClient) {
  const [mv, tv] = await Promise.all([providerList("movie"), providerList("tv")]);
  const byId = new Map<number, RawProviderInfo>();
  for (const p of [...mv.results, ...tv.results]) {
    if (!byId.has(p.provider_id)) byId.set(p.provider_id, p);
  }
  const stamp = new Date().toISOString();
  const rows = [...byId.values()].map((p) => ({
    id: p.provider_id,
    name: p.provider_name,
    logo_path: p.logo_path ?? null,
    display_priority: p.display_priorities?.AR ?? p.display_priority ?? null,
    updated_at: stamp,
  }));
  const { error } = await sb.from("providers").upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`providers upsert: ${error.message}`);
  return { providers: rows.length };
}
