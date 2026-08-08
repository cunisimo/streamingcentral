// Categorías de la UI -> géneros/keywords de TMDB.
// Los géneros de movie y tv NO son los mismos. Terror no existe como género
// de TV: se resuelve con keyword 315058 ("horror"). El thriller tampoco existe
// como género de TV: se aproxima con keyword 316362 ("thriller").
import type { MediaType } from "./types";

// `alt` es una regla ALTERNATIVA que se une por OR a la principal. Existe porque
// TMDB combina `with_genres` y `with_keywords` con AND: no hay forma de pedir
// "género documental O keyword hechos reales" en una sola query. Cuando está
// presente, listByCategory dispara las dos y mergea (dedup por id).
// `withoutGenres`: géneros que sacan falsos positivos de la propia categoría
// (no tiene nada que ver con el filtro de audiencia de lib/audience.ts, que se
// aplica aparte y se suma a este).
type Rule = { genres?: number[]; keywords?: number[]; withoutGenres?: number[]; originCountry?: string; alt?: Rule };

export interface Category {
  slug: string;
  label: string;
  movie: Rule;
  tv: Rule;
  // Si está, el chip se resuelve contra los títulos curados de la base
  // (lib/curated.ts) en vez de discover; `movie`/`tv` quedan solo como relleno
  // cuando los curados no alcanzan. El slug difiere del de la app a propósito:
  // este es el del pipeline de curado, aquel es de UI.
  curatedSlug?: string;
}

export const CATEGORIES: Category[] = [
  { slug: "accion",      label: "Acción",      movie: { genres: [28] },  tv: { genres: [10759] } },
  { slug: "drama",       label: "Drama",       movie: { genres: [18] },  tv: { genres: [18] } },
  { slug: "comedia",     label: "Comedia",     movie: { genres: [35] },  tv: { genres: [35] } },
  { slug: "terror",      label: "Terror",      movie: { genres: [27] },  tv: { keywords: [315058] } },
  // tv con keywords: sin ellas daba lo mismo que "Mundos fantásticos" (TMDB une
  // sci-fi y fantasía en el género 10765). Acá van espacio/futuro/distopía.
  { slug: "scifi",       label: "Sci-fi",      movie: { genres: [878] }, tv: { genres: [10765], keywords: [9882, 3801, 1612, 9685, 4565] } },
  { slug: "suspenso",    label: "Suspenso",    movie: { genres: [53] },  tv: { keywords: [316362] } },
  { slug: "crimen",      label: "Crimen",      movie: { genres: [80] },  tv: { genres: [80] } },
  { slug: "aventura",    label: "Aventura",    movie: { genres: [12] },  tv: { genres: [10759] } },
  { slug: "animacion",   label: "Animación",   movie: { genres: [16] },  tv: { genres: [16] } },
  { slug: "misterio",    label: "Misterio",    movie: { genres: [9648] },tv: { genres: [9648] } },
  { slug: "documental",  label: "Documental",  movie: { genres: [99] },  tv: { genres: [99] } },
  // TMDB no tiene género Romance en series (10749 es solo de películas). Con
  // `genres: [18]` a secas el chip pedía literalmente "drama" y devolvía
  // The Walking Dead, El mentalista y Breaking Bad. Drama + keyword romance
  // (9840) trae Outlander, Los Bridgerton y El verano en que me enamoré.
  // En tv, la keyword romance la tienen series que NO son románticas: Better
  // Call Saul la lleva por el vínculo Jimmy/Kim siendo policial. Sacando
  // crimen/acción/misterio quedan Outlander, Los Bridgerton, El verano en que
  // me enamoré.
  { slug: "romance",     label: "Romance",     movie: { genres: [10749] },tv: { genres: [18], keywords: [9840], withoutGenres: [80, 10759, 9648] } },
];

// Categorías EXCLUSIVAS del recomendador ("¿Qué te inspira hoy?"). Separadas de
// CATEGORIES a propósito: CATEGORIES lo iteran las páginas de género
// (CategoryView, cross-shelves) y genreCovers, que NO deben ver estos temas.
// El lookup por slug (BY_SLUG, abajo) sí une ambos arrays, así que
// resolveCategory las resuelve para /api/recomendaciones.
export const RECOMMENDER_CATEGORIES: Category[] = [
  { slug: "palomitas",           label: "Palomitas",             movie: { genres: [28, 12] },        tv: { genres: [10759] } },
  // Sin el 53 (Thriller): el OR con thriller traía acción tensa y terror
  // (La Boca del Diablo, La momia) en vez de enigmas. Solo misterio deja
  // The Batman, Perdida, La asistenta, Las ovejas detectives.
  // Sin terror en pelis y sin sci-fi/fantasía en series: el enigma se diluía
  // con sustos y con lo sobrenatural (Watchmen, Sobrenatural, From, Stranger
  // Things llevan el género Misterio pero no son whodunit).
  { slug: "misterio-intrincado", label: "Misterio intrincado",   movie: { genres: [9648], withoutGenres: [27] }, tv: { genres: [9648], withoutGenres: [10765] } },
  // Sin el 16 (Animación): el OR lo metía suelto y traía animación PARA ADULTOS
  // (Rick y Morty, Padre de familia). No se pierde la animación familiar: esas
  // llevan 10751 igual (Toy Story, Zootrópolis).
  { slug: "familiar",            label: "Aventura familiar",     movie: { genres: [10751, 12] },     tv: { genres: [10751, 10762] } },
  // La keyword christmas sola trae todo lo que TRANSCURRE en navidad: Harry
  // Potter, Iron Man 3, Shazam, Estragos. Cruzada con comedia/romance/familia
  // quedan las navideñas de verdad (El Grinch, Solo en casa 2, Red One,
  // ¡Qué bello es vivir!). En tv no existe el género romance (10749).
  // CURADO: se resuelve contra chip_titles. Las reglas de abajo quedan como
  // relleno para cuando los curados disponibles no alcanzan (usuario con una
  // sola plataforma chica), y en ese caso se filtran contra chip_blocklist.
  { slug: "navidad",             label: "Mágica navidad",        curatedSlug: "magica-navidad", movie: { genres: [35, 10749, 10751], keywords: [207317] }, tv: { genres: [35, 10751], keywords: [207317] } },
  { slug: "guerra",              label: "Fuego cruzado",         movie: { genres: [10752] },         tv: { genres: [10768] } },
  { slug: "aliens",              label: "Contacto extraterrestre", movie: { keywords: [9951, 14909, 9739] }, tv: { keywords: [9951, 14909, 9739] } },
  { slug: "espacio",             label: "Odisea espacial",       movie: { keywords: [9882, 3801, 1612] }, tv: { keywords: [9882, 3801, 1612] } },
  // Documentales Y ficción basada en hechos reales, unidos por OR (ver `alt`).
  // Solo el género 99 traía realities y programas de cocina (Jackass, Diners
  // Drive-Ins, ¿Cómo lo hacen?); la keyword 9672 suma Oppenheimer, La lista de
  // Schindler, Chernobyl, The Crown y Narcos.
  { slug: "reales",              label: "Historias reales",      movie: { genres: [99], alt: { keywords: [9672] } }, tv: { genres: [99], alt: { keywords: [9672] } } },
  // En SERIES, TMDB une sci-fi y fantasía en un solo género (10765), así que
  // los dos chips devolvían exactamente lo mismo. Se separan por keywords:
  // magia/dragones/espada acá, espacio/futuro/distopía en scifi.
  { slug: "fantasia",            label: "Mundos fantásticos",    movie: { genres: [14] },             tv: { genres: [10765], keywords: [2343, 12554, 234213] } },
  { slug: "supervivencia",       label: "Supervivencia extrema", movie: { keywords: [10349, 10617, 5096] }, tv: { keywords: [10349, 10617, 5096] } },
];

const BY_SLUG = new Map([...CATEGORIES, ...RECOMMENDER_CATEGORIES].map((c) => [c.slug, c]));
export const categoryLabel = (slug: string) => BY_SLUG.get(slug)?.label ?? slug;
export const categoryBySlug = (slug: string): Category | undefined => BY_SLUG.get(slug);

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
