// Convierte respuestas crudas de TMDB en el shape estable que consume la UI,
// enriqueciendo con providers (cacheados) y ratings.
import {
  TMDB_IMG, discover, watchProviders, titleDetails, personCombinedCredits,
  personDetails, searchMulti, type RawTitle, type RawDetail, type CreditEntry,
} from "./tmdb";
import { codeForTmdbId, codesToTmdbIds } from "./providers-ar";
import { resolveCategory, genreIdsToSlugs, categoryLabel } from "./categories";
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

// providers de un título en AR (cacheado) -> { codes, links }
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
    return { codes: [...codes], links };
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
    imdb: t.vote_average ? Number(t.vote_average.toFixed(1)) : null, // placeholder TMDB; OMDB en detalle
    metacritic: null,
    hasEditorial: published ? published.has(`${t.id}:${type}`) : false,
  };
}

// --- Listado por categoría/tipo, filtrado a las plataformas del usuario ---
export async function listByCategory(opts: {
  tipo: MediaType; genre?: string; country?: string;
  providers: PlatformCode[]; page?: number;
}): Promise<UITitle[]> {
  if (!opts.providers.length) return []; // sin plataformas no hay catálogo que mostrar
  const ids = codesToTmdbIds(opts.providers);
  const rule = opts.genre && opts.genre !== "todos" ? resolveCategory(opts.genre, opts.tipo) : {};
  const res = await discover(opts.tipo, {
    providers: ids, genres: rule.genres, keywords: rule.keywords,
    originCountry: opts.country || rule.originCountry, page: opts.page,
  });
  const pub = await publishedIds(opts.tipo);
  const items = await Promise.all(res.results.slice(0, 20).map((t) => toUITitle(t, opts.tipo, pub)));
  // discover ya filtró por provider; nos aseguramos que el badge tenga datos
  return items.filter((i) => i.platforms.length > 0);
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

// --- Búsqueda multi: títulos (filtrados a plataformas) + personas ---
export async function search(query: string, providers: PlatformCode[]) {
  const [res, pub] = await Promise.all([searchMulti(query), publishedIds()]);
  const slice = res.results.slice(0, 18);
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
  const enriched = await Promise.all(rawTitles.map((r) => toUITitle(r, r.media_type, pub)));
  const titles = enriched.filter((t) => t.platforms.length > 0);
  return { titles, people };
}

// --- Filmografía de una persona, filtrada a plataformas y limpia de ruido ---
const JUNK_GENRES = new Set([10767, 10763, 10764]); // talk, news, reality
export async function personFilmography(id: number, providers: PlatformCode[]) {
  const [det, credits] = await Promise.all([personDetails(id), personCombinedCredits(id)]);
  const pub = await publishedIds();
  const seen = new Set<string>();
  const clean = credits.cast.filter((c: CreditEntry) => {
    const k = `${c.id}:${c.media_type}`;
    if (seen.has(k)) return false; seen.add(k);
    if (!c.character || /^(self|himself|herself)$/i.test(c.character)) return false;
    if ((c.genre_ids ?? []).some((g) => JUNK_GENRES.has(g))) return false;
    return (c.media_type === "movie" || c.media_type === "tv");
  }).sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0));
  const items = await Promise.all(clean.slice(0, 40).map((c) => toUITitle(c, c.media_type, pub)));
  const avail = items.filter((i) => i.platforms.length > 0);
  return {
    person: { id: det.id, name: det.name, profile: img(det.profile_path, "w185"), knownFor: [] } as UIPerson,
    titles: avail,
    hidden: items.length - avail.length,
  };
}

// --- Detalle completo (merge TMDB + OMDB + providers + reseña) ---
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
  const runtime = type === "movie"
    ? (d.runtime ? `${Math.floor(d.runtime / 60)}h ${d.runtime % 60}m` : null)
    : (d.number_of_seasons ? `${d.number_of_seasons} temp.` : null);
  return {
    id: d.id, type, title: d.title || d.name || "",
    year: (d.release_date || d.first_air_date)?.slice(0, 4) ? Number((d.release_date || d.first_air_date)!.slice(0, 4)) : null,
    runtime, poster: img(d.poster_path), country: d.origin_country?.[0] ?? null,
    genres: [...new Set(genreIdsToSlugs(d.genres.map((g) => g.id)))],
    platforms: prov.codes, imdb: ratings.imdb, metacritic: ratings.metacritic,
    hasEditorial: !!editorial,
    age: certOf(d, type),
    synopsis: d.overview || "",
    cast: d.credits?.cast?.slice(0, 6).map((c) => c.name) ?? [],
    directors: d.credits?.crew?.filter((c) => c.job === "Director").map((c) => c.name) ?? [],
    links: prov.links,
    editorial,
  };
}

export { categoryLabel };
