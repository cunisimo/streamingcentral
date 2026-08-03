// Categorías de la UI -> géneros/keywords de TMDB.
// Los géneros de movie y tv NO son los mismos. Terror no existe como género
// de TV: se resuelve con keyword 315058 ("horror"). El thriller tampoco existe
// como género de TV: se aproxima con keyword 316362 ("thriller").
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
  { slug: "terror",      label: "Terror",      movie: { genres: [27] },  tv: { keywords: [315058] } },
  { slug: "scifi",       label: "Sci-fi",      movie: { genres: [878] }, tv: { genres: [10765] } },
  { slug: "suspenso",    label: "Suspenso",    movie: { genres: [53] },  tv: { keywords: [316362] } },
  { slug: "crimen",      label: "Crimen",      movie: { genres: [80] },  tv: { genres: [80] } },
  { slug: "aventura",    label: "Aventura",    movie: { genres: [12] },  tv: { genres: [10759] } },
  { slug: "animacion",   label: "Animación",   movie: { genres: [16] },  tv: { genres: [16] } },
  { slug: "misterio",    label: "Misterio",    movie: { genres: [9648] },tv: { genres: [9648] } },
  { slug: "documental",  label: "Documental",  movie: { genres: [99] },  tv: { genres: [99] } },
  { slug: "romance",     label: "Romance",     movie: { genres: [10749] },tv: { genres: [18] } },
  // --- Categorías del recomendador "¿Qué te inspira hoy?" (aditivas) ---
  { slug: "palomitas",           label: "Palomitas",             movie: { genres: [28, 12] },        tv: { genres: [10759] } },
  { slug: "misterio-intrincado", label: "Misterio intrincado",   movie: { genres: [9648, 53] },      tv: { genres: [9648] } },
  { slug: "familiar",            label: "Aventura familiar",     movie: { genres: [10751, 12, 16] }, tv: { genres: [10751, 10762, 16] } },
  { slug: "navidad",             label: "Magia navideña",        movie: { keywords: [207317] },      tv: { keywords: [207317] } },
  { slug: "guerra",              label: "Fuego cruzado",         movie: { genres: [10752] },         tv: { genres: [10768] } },
  { slug: "aliens",              label: "Contacto extraterrestre", movie: { keywords: [9951, 14909, 9739] }, tv: { keywords: [9951, 14909, 9739] } },
  { slug: "espacio",             label: "Odisea espacial",       movie: { keywords: [9882, 3801, 1612] }, tv: { keywords: [9882, 3801, 1612] } },
  { slug: "reales",              label: "Historias reales",      movie: { genres: [99] },             tv: { genres: [99] } },
  { slug: "fantasia",            label: "Mundos fantásticos",    movie: { genres: [14] },             tv: { genres: [10765] } },
  { slug: "supervivencia",       label: "Supervivencia extrema", movie: { keywords: [10349, 10617, 5096] }, tv: { keywords: [10349, 10617, 5096] } },
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

// Frase ingeniosa para el título de un sub-slider de cruce: "{Principal} {frase}".
// Ej. Acción × comedia → "Acción con risas". Clave = slug del género secundario.
export const CROSS_PHRASE: Record<string, string> = {
  comedia: "con risas",
  terror: "con sustos",
  suspenso: "con tensión",
  crimen: "con delito",
  romance: "con amor",
  scifi: "del futuro",
  aventura: "a pura aventura",
  drama: "para llorar",
  animacion: "en dibujos",
  misterio: "con enigmas",
};
