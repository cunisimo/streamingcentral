// Fuente de verdad de la clasificación de audiencia (capa de negocio backend).
// La audiencia es una receta de filtros de TMDB aplicada en las queries de
// discover — NO un atributo por título en Supabase. Cambiar el criterio de qué
// es family/adulto se hace acá y en ningún otro lado.
import type { MediaType } from "./types";

// Family (movie+tv) y Kids (solo tv). Se excluyen de los géneros adultos.
export const FAMILY_GENRES = [10751, 10762];

// Categorías cuya naturaleza es animación/familiar: NO se les excluye family
// (si no, un carrusel de Animación perdería su contenido familiar).
const EXEMPT = new Set(["animacion", "familiar"]);

// ¿A este slug de género se le excluye el contenido family? true para géneros
// general/adulto; false para exentos, "todos" y sin género.
export function excludeFamilyFor(slug?: string): boolean {
  return !!slug && slug !== "todos" && !EXEMPT.has(slug);
}

export interface AudienceRule {
  genres?: number[];
  withoutGenres?: number[];
  certLte?: string; // certification.lte (US)
  certGte?: string; // certification.gte (US)
}

// Recetas de los carruseles de audiencia, por tipo. IDs validados contra TMDB.
export const AUDIENCES: Record<string, { label: string; movie: AudienceRule; tv: AudienceRule }> = {
  family: {
    label: "Para toda la familia",
    movie: { genres: [10751], certLte: "PG" },
    tv: { genres: [10762] },
  },
  "adult-anime": {
    label: "Animación para adultos",
    movie: { genres: [16], withoutGenres: [10751], certGte: "PG-13" },
    tv: { genres: [16], withoutGenres: [10762] },
  },
};

export function audienceRule(slug: string, tipo: MediaType): AudienceRule | null {
  return AUDIENCES[slug]?.[tipo] ?? null;
}
