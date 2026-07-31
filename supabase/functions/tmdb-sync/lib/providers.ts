import { MediaType, RawProvider, watchProviders } from "./tmdb.ts";

export interface ProviderRow {
  id: number;
  name: string;
  logo_path: string | null;
  display_priority: number | null;
}

// Providers flatrate de AR para un título. [] si no hay ninguno (el título se
// descarta: la Agenda guarda solo lo que tiene >=1 plataforma AR).
export async function arFlatrateProviders(type: MediaType, id: number): Promise<ProviderRow[]> {
  const r = await watchProviders(type, id);
  const flat = r.results?.["AR"]?.flatrate ?? [];
  return flat.map((p: RawProvider) => ({
    id: p.provider_id,
    name: p.provider_name,
    logo_path: p.logo_path ?? null,
    display_priority: p.display_priority ?? null,
  }));
}
