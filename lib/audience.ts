// Fuente de verdad de la clasificación de audiencia (capa de negocio backend).
// La audiencia es una receta de filtros de TMDB aplicada en las queries de
// discover — NO un atributo por título en Supabase. Cambiar el criterio de qué
// es family/adulto se hace acá y en ningún otro lado.
import type { MediaType, PlatformCode } from "./types";

// Los dos filtros van SEPARADOS porque no se aplican en los mismos lugares.
// Mezclarlos fue un bug real: "Magia navideña" perdía Solo en casa 2, El mago de
// Oz y ¡Qué bello es vivir! —familiares, no animadas— y quedaba con Terrifier 3
// e Iron Man 3, que solo comparten la keyword.
export const ANIMATION_GENRES = [16];
export const FAMILY_GENRES = [10751, 10762]; // Familia (movie+tv) + Kids (solo tv)

// Categorías cuya naturaleza es animación/familiar: NO se les excluye nada
// (si no, un carrusel de Animación se quedaría vacío).
const EXEMPT = new Set(["animacion", "familiar"]);

// Crunchyroll es catálogo de anime casi puro: con el filtro de animación puesto,
// a quien la elige le queda el 4% de sus series (60 de 1640) y los rieles se
// vacían (Terror 38→0, Acción 684→2). Si está entre las plataformas del usuario,
// la animación se muestra en todos lados — eligió una plataforma de anime.
export const ANIME_PLATFORM: PlatformCode = "cr";
export const tieneAnimePlatform = (providers: PlatformCode[]) =>
  providers.includes(ANIME_PLATFORM);
// Con Crunchyroll SOLA todo el Home ya es anime: el carrusel "Animación para
// adultos" no aporta nada. Con Crunchyroll + otra (Max, Netflix…) sí, porque esas
// también tienen animación para adultos.
export const soloAnimePlatform = (providers: PlatformCode[]) =>
  providers.length === 1 && providers[0] === ANIME_PLATFORM;

// Qué géneros excluir de una query de discover.
//  - scope "home":   rieles de género del Home → animación Y familia. El Home
//                    tiene carruseles propios ("Para toda la familia",
//                    "Animación para adultos") a donde va todo eso.
//  - scope "browse": recomendador y páginas de categoría → solo animación, que
//                    tiene su propio riel de cruce ("Terror en dibujos").
//                    Lo familiar se muestra: es búsqueda explícita.
// `genre2` importa: en el cruce "Terror × animación" el usuario pidió animación,
// así que no se le puede excluir justo eso.
export function excludedGenres(opts: {
  scope: "home" | "browse";
  genre?: string;
  genre2?: string;
  providers: PlatformCode[];
}): number[] | undefined {
  const slugs = [opts.genre, opts.genre2].filter((s): s is string => !!s && s !== "todos");
  if (!slugs.length) return undefined;          // sin género no hay nada que separar
  if (slugs.some((s) => EXEMPT.has(s))) return undefined; // lo pidió explícitamente

  const out: number[] = [];
  if (!tieneAnimePlatform(opts.providers)) out.push(...ANIMATION_GENRES);
  if (opts.scope === "home") out.push(...FAMILY_GENRES);
  return out.length ? out : undefined;
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
