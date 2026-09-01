import { MediaType, watchProviders } from "./tmdb.ts";
import { arFlatrateDe } from "./descubrir.ts";

export { arFlatrateDe };

export interface ProviderRow {
  id: number;
  name: string;
  logo_path: string | null;
  display_priority: number | null;
}

// Providers flatrate de AR para un título. [] si no hay ninguno (el título se
// descarta: la Agenda guarda solo lo que tiene >=1 plataforma AR).
export async function arFlatrateProviders(type: MediaType, id: number): Promise<ProviderRow[]> {
  return arFlatrateDe(await watchProviders(type, id));
}
