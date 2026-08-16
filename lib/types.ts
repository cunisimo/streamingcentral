export type MediaType = "movie" | "tv";

// Códigos internos de plataforma (los que usa la UI para logos).
export type PlatformCode =
  | "n" | "d" | "m" | "p" | "pp" | "at" | "mb" | "cr" | "sp" | "vx"
  | "mv" | "cv" | "dg" | "un" | "ok";

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
  // ISO YYYY-MM-DD. Lo necesita "Recordarme": la ficha tiene que saber si el
  // título todavía no salió. `year` no alcanza — un estreno de diciembre y uno
  // de enero del mismo año son casos distintos.
  releaseDate: string | null;
  // Solo series: fecha del próximo episodio, si la serie sigue en emisión. En
  // series `releaseDate` es el estreno original y no sirve para "Recordarme".
  nextAirDate: string | null;
  // Estreno DIGITAL en Argentina (tipo 4 de TMDB). Solo películas; null cuando
  // TMDB no lo tiene, que es lo habitual. Hoy se usa únicamente para NO ofrecer
  // "Recordarme" cuando falta: sin este dato la fecha que tenemos es la de cine
  // y el recordatorio puede errarle por meses (issue #5).
  digitalAR: string | null;
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
  department?: string; // known_for_department de TMDB: "Acting" | "Directing" | …
}

// Estreno de la Agenda (upcoming). Shape que consume el read path desde Supabase.
// Para movies los campos de TV van en null. `releaseDate` es ISO YYYY-MM-DD
// (movie: estreno; tv: air_date del próximo episodio).
export interface UIUpcoming {
  id: number; // tmdb_id
  type: MediaType;
  title: string;
  poster: string | null;
  backdrop: string | null;
  overview: string;
  releaseDate: string;
  genres: string[]; // slugs de la UI
  platforms: PlatformCode[]; // códigos internos mapeados (los que tienen logo)
  popularity: number | null;
  voteAverage: number | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  episodeName: string | null;
  isSeasonPremiere: boolean | null;
}

// Por qué una lista del recomendador vino vacía. Existe porque el mensaje al
// usuario no puede ser el mismo en los tres casos: "Nada en tus plataformas,
// activá alguna" le pide que arregle algo que a veces no es suyo.
//  - "sin-plataformas": la consulta llegó sin ninguna plataforma. Ahí sí
//                       corresponde pedirle que active una.
//                       NO es alcanzable desde la interfaz: `PlatformsContext`
//                       nunca deja la lista vacía (destildar todo cae a
//                       DEFAULT_PLATFORMS). Sí lo es desde `/api/recomendaciones`
//                       sin `?providers=`, que es una ruta HTTP pública, y se
//                       queda por eso: sin este caso esa llamada devolvería
//                       "sin-catalogo" —"se rompió de nuestro lado"— cuando lo
//                       que pasó es que no le dijeron con qué filtrar. Un motivo
//                       equivocado es peor que uno de más.
//  - "filtro":          había títulos y el filtro de plataformas los sacó a todos.
//                       Es el caso legítimo de "no lo tenés en tus plataformas".
//  - "sin-catalogo":    la consulta volvió vacía ANTES de filtrar. No es del
//                       usuario: es nuestro (o de TMDB), y no hay nada que pueda
//                       activar para arreglarlo.
export type MotivoVacio = "sin-plataformas" | "filtro" | "sin-catalogo";
