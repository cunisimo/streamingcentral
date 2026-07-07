// Convierte respuestas crudas de TMDB en el shape estable que consume la UI,
// enriqueciendo con providers (cacheados) y ratings.
import {
  TMDB_IMG, discover, watchProviders, titleDetails, personCombinedCredits,
  personDetails, searchMulti, personPopular,
  type RawTitle, type RawDetail, type CreditEntry,
} from "./tmdb";
import { codeForTmdbId, codesToTmdbIds } from "./providers-ar";
import { resolveCategory, genreIdsToSlugs, categoryLabel, CATEGORIES } from "./categories";
import { omdbByImdbId } from "./omdb";
import { getEditorial, publishedIds } from "./reviews";
import { cached, TTL, dailySeed, pickDaily } from "./cache";
import type {
  MediaType, PlatformCode, UITitle, UITitleDetail, UIPerson,
} from "./types";

const img = (p: string | null, size = "w500") => (p ? `${TMDB_IMG}/${size}${p}` : null);
const yearOf = (t: RawTitle) => {
  const d = t.release_date || t.first_air_date;
  return d ? Number(d.slice(0, 4)) : null;
};
const titleOf = (t: RawTitle) => t.title || t.name || "";
const today = () => new Date().toISOString().slice(0, 10);

// providers de un título en AR (cacheado) -> { codes, links, watchLink }
async function providersOf(type: MediaType, id: number) {
  return cached(`pv:${type}:${id}`, TTL.providers, async () => {
    const r = await watchProviders(type, id);
    const ar = r.results?.["AR"];
    const codes = new Set<PlatformCode>();
    const links: Partial<Record<PlatformCode, string>> = {};
    for (const p of ar?.flatrate ?? []) {
      const code = codeForTmdbId(p.provider_id);
      if (code) { codes.add(code); links[code] = ar.link; }
    }
    return { codes: [...codes], links, watchLink: ar?.link ?? null };
  });
}

async function toUITitle(t: RawTitle, type: MediaType, published?: Set<string>): Promise<UITitle> {
  const { codes } = await providersOf(type, t.id);
  return {
    id: t.id, type, title: titleOf(t), year: yearOf(t),
    runtime: null, poster: img(t.poster_path),
    country: t.origin_country?.[0] ?? null,
    genres: genreIdsToSlugs(t.genre_ids ?? []),
    platforms: codes,
    tmdb: t.vote_average ? Number(t.vote_average.toFixed(1)) : null,
    imdb: null, metacritic: null,
    hasEditorial: published ? published.has(`${t.id}:${type}`) : false,
  };
}

// --- Listado por categoría/tipo, filtrado a las plataformas del usuario ---
export async function listByCategory(opts: {
  tipo: MediaType; genre?: string; country?: string;
  providers: PlatformCode[]; page?: number; sortBy?: string; minVotes?: number; extra?: Record<string, string>;
}): Promise<UITitle[]> {
  if (!opts.providers.length) return [];
  const ids = codesToTmdbIds(opts.providers);
  const rule = opts.genre && opts.genre !== "todos" ? resolveCategory(opts.genre, opts.tipo) : {};
  const res = await discover(opts.tipo, {
    providers: ids, genres: rule.genres, keywords: rule.keywords,
    originCountry: opts.country || rule.originCountry, page: opts.page,
    sortBy: opts.sortBy, minVotes: opts.minVotes, extra: opts.extra,
  });
  const pub = await publishedIds(opts.tipo);
  const items = await Promise.all(res.results.slice(0, 20).map((t) => toUITitle(t, opts.tipo, pub)));
  return items.filter((i) => i.platforms.length > 0);
}

// --- Últimos lanzamientos (por fecha de estreno, en tus plataformas) ---
export async function latestReleases(providers: PlatformCode[]): Promise<UITitle[]> {
  return listByCategory({
    tipo: "movie", providers,
    sortBy: "primary_release_date.desc", minVotes: 5,
    extra: { "primary_release_date.lte": today() },
  });
}

// --- Recomendaciones del día (pool + seed) ---
export async function recommendations(opts: {
  genre?: string; tipo: MediaType | "all"; providers: PlatformCode[]; n?: number; offset?: number;
}): Promise<UITitle[]> {
  const types: MediaType[] = opts.tipo === "all" ? ["movie", "tv"] : [opts.tipo];
  const pools = await Promise.all(types.map((tp) =>
    listByCategory({ tipo: tp, genre: opts.genre, providers: opts.providers, page: 1 })));
  const pool = pools.flat();
  return pickDaily(pool, opts.n ?? 6, dailySeed(), opts.offset ?? 0);
}

// --- Búsqueda multi: títulos (todos, con disponibilidad) + personas ---
export async function search(query: string) {
  const [res, pub] = await Promise.all([searchMulti(query), publishedIds()]);
  const slice = res.results.slice(0, 20);
  const people: UIPerson[] = slice
    .filter((r): r is Extract<typeof r, { media_type: "person" }> => r.media_type === "person")
    .map((r) => ({
      id: r.id, name: r.name,
      profile: img(r.profile_path, "w185"),
      knownFor: (r.known_for ?? []).map(titleOf).filter(Boolean).slice(0, 3),
    }));
  const rawTitles = slice.filter(
    (r): r is RawTitle & { media_type: MediaType } => r.media_type === "movie" || r.media_type === "tv",
  );
  // No filtramos por plataforma: si buscás algo por nombre, querés verlo aunque
  // no lo tengas. La card indica disponibilidad.
  const titles = await Promise.all(rawTitles.map((r) => toUITitle(r, r.media_type, pub)));
  return { titles, people };
}

// --- Actores populares (para la pestaña Actores del buscador) ---
export async function popularPeople(): Promise<UIPerson[]> {
  return cached("people:popular", TTL.providers, async () => {
    const res = await personPopular();
    return res.results
      .filter((p) => (p.known_for_department ?? "Acting") === "Acting" && p.profile_path)
      .slice(0, 21)
      .map((p) => ({
        id: p.id, name: p.name, profile: img(p.profile_path, "w185"),
        knownFor: (p.known_for ?? []).map(titleOf).filter(Boolean).slice(0, 2),
      }));
  });
}

// --- Directores destacados (lista curada, editable) ---
const DIRECTOR_IDS = [
  525,     // Christopher Nolan
  137427,  // Denis Villeneuve
  1032,    // Martin Scorsese
  138,     // Quentin Tarantino
  488,     // Steven Spielberg
  45400,   // Greta Gerwig
  21684,   // Bong Joon-ho
  10828,   // Guillermo del Toro
  7467,    // David Fincher
  5655,    // Wes Anderson
  135822,  // Damien Chazelle
  1352973, // Jordan Peele
];
export async function directorCards(): Promise<UIPerson[]> {
  return cached("people:directors", TTL.catalog, async () => {
    const settled = await Promise.allSettled(DIRECTOR_IDS.map((id) => personDetails(id)));
    return settled
      .filter((s): s is PromiseFulfilledResult<Awaited<ReturnType<typeof personDetails>>> => s.status === "fulfilled")
      .map((s) => ({ id: s.value.id, name: s.value.name, profile: img(s.value.profile_path, "w185"), knownFor: [] }));
  });
}

// --- Un póster representativo por género (para los tiles de "Explorar todo") ---
export async function genreCovers(): Promise<Record<string, string | null>> {
  return cached("genre:covers:v1", TTL.catalog, async () => {
    const slugs = CATEGORIES.map((c) => c.slug);
    const entries = await Promise.all(slugs.map(async (slug) => {
      const rule = resolveCategory(slug, "movie");
      try {
        const res = await discover("movie", { genres: rule.genres, keywords: rule.keywords, minVotes: 300 });
        const withPoster = res.results.find((t) => t.poster_path);
        return [slug, img(withPoster?.poster_path ?? null, "w342")] as const;
      } catch {
        return [slug, null] as const;
      }
    }));
    return Object.fromEntries(entries);
  });
}

// --- Filmografía de una persona (actor o director), en tus plataformas ---
const JUNK_GENRES = new Set([10767, 10763, 10764]); // talk, news, reality
export async function personFilmography(id: number, providers: PlatformCode[]) {
  const [det, credits] = await Promise.all([personDetails(id), personCombinedCredits(id)]);
  const pub = await publishedIds();
  const seen = new Set<string>();
  const acting = credits.cast.filter((c) => c.character && !/^(self|himself|herself)$/i.test(c.character));
  const directing = credits.crew.filter((c) => c.job === "Director");
  const merged = [...directing, ...acting].filter((c: CreditEntry) => {
    const k = `${c.id}:${c.media_type}`;
    if (seen.has(k)) return false; seen.add(k);
    if ((c.genre_ids ?? []).some((g) => JUNK_GENRES.has(g))) return false;
    return c.media_type === "movie" || c.media_type === "tv";
  }).sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0));
  const items = await Promise.all(merged.slice(0, 40).map((c) => toUITitle(c, c.media_type, pub)));
  const avail = items.filter((i) => i.platforms.length > 0);
  return {
    person: { id: det.id, name: det.name, profile: img(det.profile_path, "w185"), knownFor: [] } as UIPerson,
    titles: avail,
    hidden: items.length - avail.length,
  };
}

// --- Detalle completo (merge TMDB + OMDB + providers + reseña + relacionados) ---
function certOf(d: RawDetail, type: MediaType): string {
  if (type === "tv") {
    const ar = d.content_ratings?.results.find((r) => r.iso_3166_1 === "AR");
    return ar?.rating || "—";
  }
  const ar = d.release_dates?.results.find((r) => r.iso_3166_1 === "AR");
  return ar?.release_dates?.[0]?.certification || "—";
}

export async function detail(type: MediaType, id: number): Promise<UITitleDetail> {
  const [d, prov] = await Promise.all([titleDetails(type, id), providersOf(type, id)]);
  const ratings = await cached(`omdb:${id}:${type}`, TTL.ratings, () =>
    d.external_ids?.imdb_id ? omdbByImdbId(d.external_ids.imdb_id) : Promise.resolve({ imdb: null, metacritic: null }));
  const editorial = await getEditorial(id, type);
  const pub = await publishedIds();

  const recs = (d.recommendations?.results ?? []).filter((r) => r.poster_path).slice(0, 12);
  const related = await Promise.all(recs.map((r) => toUITitle(r, type, pub)));

  const runtime = type === "movie"
    ? (d.runtime ? `${Math.floor(d.runtime / 60)}h ${d.runtime % 60}m` : null)
    : (d.number_of_seasons ? `${d.number_of_seasons} temp.` : null);

  const composers = d.credits?.crew
    ?.filter((c) => c.job === "Original Music Composer" || c.job === "Music")
    .map((c) => c.name) ?? [];

  return {
    id: d.id, type, title: d.title || d.name || "",
    year: (d.release_date || d.first_air_date)?.slice(0, 4) ? Number((d.release_date || d.first_air_date)!.slice(0, 4)) : null,
    runtime, poster: img(d.poster_path), backdrop: img(d.backdrop_path, "w780"),
    country: d.origin_country?.[0] ?? null,
    genres: [...new Set(genreIdsToSlugs(d.genres.map((g) => g.id)))],
    platforms: prov.codes,
    tmdb: d.vote_average ? Number(d.vote_average.toFixed(1)) : null,
    imdb: ratings.imdb, metacritic: ratings.metacritic,
    hasEditorial: !!editorial,
    age: certOf(d, type),
    synopsis: d.overview || "",
    cast: d.credits?.cast?.slice(0, 6).map((c) => c.name) ?? [],
    directors: d.credits?.crew?.filter((c) => c.job === "Director").map((c) => c.name) ?? [],
    composers: [...new Set(composers)],
    seasons: d.number_of_seasons ?? null,
    episodes: d.number_of_episodes ?? null,
    links: prov.links,
    watchLink: prov.watchLink,
    related,
    editorial,
  };
}

export { categoryLabel };
