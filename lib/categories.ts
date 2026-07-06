// Categorías de la UI -> géneros/keywords de TMDB.
// Los géneros de movie y tv NO son los mismos. Terror no existe como género
// de TV: se resuelve con keyword 9799.
import type { MediaType } from "./types";

type Rule = { genres?: number[]; keywords?: number[]; originCountry?: string };

export interface Category {
  slug: string;
  label: string;
  movie: Rule;
  tv: Rule;
}

export const CATEGORIES: Category[] = [
  { slug: "accion",      label: "Acción",      movie: { genres: [28] },  tv: { genres: [10759] } },
  { slug: "drama",       label: "Drama",       movie: { genres: [18] },  tv: { genres: [18] } },
  { slug: "comedia",     label: "Comedia",     movie: { genres: [35] },  tv: { genres: [35] } },
  { slug: "terror",      label: "Terror",      movie: { genres: [27] },  tv: { keywords: [9799] } },
  { slug: "scifi",       label: "Sci-fi",      movie: { genres: [878] }, tv: { genres: [10765] } },
  { slug: "suspenso",    label: "Suspenso",    movie: { genres: [53] },  tv: { keywords: [9799], genres: [9648] } },
  { slug: "crimen",      label: "Crimen",      movie: { genres: [80] },  tv: { genres: [80] } },
  { slug: "aventura",    label: "Aventura",    movie: { genres: [12] },  tv: { genres: [10759] } },
  { slug: "animacion",   label: "Animación",   movie: { genres: [16] },  tv: { genres: [16] } },
  { slug: "misterio",    label: "Misterio",    movie: { genres: [9648] },tv: { genres: [9648] } },
  { slug: "documental",  label: "Documental",  movie: { genres: [99] },  tv: { genres: [99] } },
  { slug: "romance",     label: "Romance",     movie: { genres: [10749] },tv: { genres: [18] } },
];

const BY_SLUG = new Map(CATEGORIES.map((c) => [c.slug, c]));
export const categoryLabel = (slug: string) => BY_SLUG.get(slug)?.label ?? slug;

export function resolveCategory(slug: string, type: MediaType): Rule {
  const c = BY_SLUG.get(slug);
  return c ? c[type] : {};
}

// Mapa inverso: id de género TMDB -> slug de la UI (para taggear cards/detalle).
// Aproximado: prioriza el primer slug que matchee.
const TMDB_GENRE_TO_SLUG: Record<number, string> = {
  28: "accion", 10759: "accion", 18: "drama", 35: "comedia",
  27: "terror", 878: "scifi", 10765: "scifi", 53: "suspenso",
  80: "crimen", 12: "aventura", 16: "animacion", 9648: "misterio",
  99: "documental", 10749: "romance",
};
export function genreIdsToSlugs(ids: number[]): string[] {
  const out = new Set<string>();
  for (const id of ids) { const s = TMDB_GENRE_TO_SLUG[id]; if (s) out.add(s); }
  return [...out];
}
