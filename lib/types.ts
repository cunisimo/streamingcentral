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
  tmdb: number | null; // puntaje TMDB (para cards)
  imdb: number | null; // solo en detalle (OMDB)
  metacritic: number | null; // solo en detalle (OMDB)
  hasEditorial: boolean;
  votes?: number; // cantidad de "me gusta" (solo en "Lo más votados")
}

export interface EditorialReview {
  texto: string;
  rating: number | null;
  fecha: string;
}

export interface UICastMember {
  id: number;
  name: string;
  character: string | null;
  profile: string | null; // URL de la foto (w185) o null
}

export interface UITitleDetail extends UITitle {
  age: string;
  backdrop: string | null;
  synopsis: string;
  cast: UICastMember[];
  directors: string[];
  composers: string[];
  seasons: number | null;
  episodes: number | null;
  links: Partial<Record<PlatformCode, string>>; // por plataforma (todos apuntan al watch link del título)
  watchLink: string | null; // link título-específico de TMDB (agregador AR)
  trailerKey: string | null; // key de YouTube del mejor trailer, o null
  related: UITitle[];
  editorial: EditorialReview | null;
}

export interface UIPerson {
  id: number;
  name: string;
  profile: string | null;
  knownFor: string[];
}
