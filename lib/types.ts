export type MediaType = "movie" | "tv";

// Códigos internos de plataforma (los que usa la UI para logos).
export type PlatformCode =
  | "n" | "d" | "m" | "p" | "pp" | "at" | "mb" | "cr" | "sp";

// Título tal como lo consume la UI (shape estable, igual al del prototipo).
export interface UITitle {
  id: number;
  type: MediaType;
  title: string;
  year: number | null;
  runtime: string | null;
  poster: string | null; // URL completa o null
  country: string | null; // ISO 3166-1 (US, KR, ...)
  genres: string[]; // slugs de la UI
  platforms: PlatformCode[]; // dónde está disponible (AR)
  imdb: number | null;
  metacritic: number | null;
  hasEditorial: boolean;
}

export interface EditorialReview {
  texto: string;
  rating: number | null;
  fecha: string;
}

export interface UITitleDetail extends UITitle {
  age: string;
  synopsis: string;
  cast: string[];
  directors: string[];
  links: Partial<Record<PlatformCode, string>>; // deep-link por plataforma
  editorial: EditorialReview | null;
}

export interface UIPerson {
  id: number;
  name: string;
  profile: string | null;
  knownFor: string[];
}
