// OMDB: IMDb rating y, cuando viene, Metacritic. Se consulta por imdb_id.
const BASE = "https://www.omdbapi.com/";

export interface OmdbResult {
  imdb: number | null;
  metacritic: number | null;
}

export async function omdbByImdbId(imdbId: string): Promise<OmdbResult> {
  const key = process.env.OMDB_API_KEY;
  if (!key || !imdbId) return { imdb: null, metacritic: null };
  try {
    const res = await fetch(`${BASE}?apikey=${key}&i=${imdbId}`, { cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (!res.ok) return { imdb: null, metacritic: null };
    const d = await res.json();
    const imdb = d.imdbRating && d.imdbRating !== "N/A" ? Number(d.imdbRating) : null;
    const mcStr = (d.Ratings ?? []).find((r: { Source: string }) => r.Source === "Metacritic");
    const metacritic = mcStr ? Number(String(mcStr.Value).split("/")[0]) : null;
    return { imdb: Number.isFinite(imdb) ? imdb : null, metacritic: Number.isFinite(metacritic) ? metacritic : null };
  } catch {
    return { imdb: null, metacritic: null };
  }
}
