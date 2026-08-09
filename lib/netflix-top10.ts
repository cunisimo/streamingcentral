import "server-only";
import { searchTitles, watchProviders } from "./tmdb";
import { supabaseServer } from "./supabase";
import type { MediaType } from "./types";

// Top 10 semanal de Netflix en Argentina.
//
// El TSV es público y pesa 31 MB, pero está ordenado por país ascendente y
// semana descendente: Argentina de la última semana son las PRIMERAS 20 filas
// de datos. Por eso se lee el stream y se corta; no se baja el archivo entero.
const TSV_URL = "https://www.netflix.com/tudum/top10/data/all-weeks-countries.tsv";
const NETFLIX_PROVIDER_ID = 8;
const FILAS_ESPERADAS = 20; // 10 Films + 10 TV

export interface NetflixRow {
  week: string;            // YYYY-MM-DD
  category: MediaType;
  rank: number;
  rawTitle: string;
}

export interface StoredRow {
  rank: number;
  rawTitle: string;
  tmdbId: number | null;
}

// Minúsculas, sin acentos, sin puntuación, espacios colapsados. Se usa para
// comparar el título del TSV contra el de TMDB: "Fear" != "State of Fear".
export function normalizeTitle(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Toma las primeras líneas del TSV y devuelve las filas de AR de la semana más
// reciente. Tira si el archivo no arranca como se espera: preferimos no
// escribir nada antes que escribir basura si Netflix cambia el orden.
export function parseArWeek(lines: string[]): NetflixRow[] {
  const [header, ...body] = lines;
  if (!header?.startsWith("country_name\tcountry_iso2\tweek\tcategory\tweekly_rank")) {
    throw new Error("El encabezado del TSV cambió");
  }
  const out: NetflixRow[] = [];
  let week: string | null = null;
  for (const line of body) {
    const c = line.split("\t");
    if (c.length < 6) continue;
    const [, iso2, w, category, rank, rawTitle] = c;
    if (iso2 !== "AR") break;
    if (week === null) week = w;
    if (w !== week) break;
    if (category !== "Films" && category !== "TV") {
      throw new Error(`Categoría inesperada en el TSV: ${category}`);
    }
    out.push({
      week: w,
      category: category === "Films" ? "movie" : "tv",
      rank: Number(rank),
      rawTitle,
    });
  }
  if (out.length !== FILAS_ESPERADAS) {
    throw new Error(`Se esperaban ${FILAS_ESPERADAS} filas de AR, llegaron ${out.length}`);
  }
  return out;
}

// Lee el TSV cortando el stream apenas tiene las filas que necesita.
async function fetchArWeek(): Promise<NetflixRow[]> {
  const res = await fetch(TSV_URL, { cache: "no-store", signal: AbortSignal.timeout(20000) });
  if (!res.ok || !res.body) throw new Error(`TSV respondió ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  const lines: string[] = [];
  let buf = "";
  try {
    // +2: el encabezado y una línea de margen para detectar el corte de país.
    while (lines.length < FILAS_ESPERADAS + 2) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n");
      buf = parts.pop() ?? "";
      lines.push(...parts);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return parseArWeek(lines);
}

// Resuelve un título del TSV a un id de TMDB.
//
// Reglas, en orden (medidas contra la semana 2026-08-02: 19/20 automáticos):
//  1. título exacto Y está en Netflix AR -> se acepta
//  2. título exacto, no figura en Netflix AR -> se acepta igual (lag de TMDB en
//     estrenos recientes; le pasó a "My Daughter's Father")
//  3. título distinto pero está en Netflix AR -> se acepta con needs_review
//     ("Fear" matcheó "State of Fear")
//  4. sin candidatos -> null + needs_review
async function resolveTitle(
  category: MediaType, rawTitle: string,
): Promise<{ tmdbId: number | null; needsReview: boolean }> {
  const objetivo = normalizeTitle(rawTitle);
  let candidatos: { id: number; title: string }[] = [];
  try {
    const r = await searchTitles(category, rawTitle);
    candidatos = (r.results ?? []).slice(0, 5).map((c) => ({
      id: c.id, title: c.title ?? c.name ?? "",
    }));
  } catch {
    return { tmdbId: null, needsReview: true };
  }
  if (!candidatos.length) return { tmdbId: null, needsReview: true };

  const exacto = candidatos.find((c) => normalizeTitle(c.title) === objetivo);
  if (exacto) return { tmdbId: exacto.id, needsReview: false };

  for (const c of candidatos) {
    if (await enNetflixAR(category, c.id)) return { tmdbId: c.id, needsReview: true };
  }
  return { tmdbId: candidatos[0].id, needsReview: true };
}

async function enNetflixAR(type: MediaType, id: number): Promise<boolean> {
  try {
    const r = await watchProviders(type, id);
    return (r.results?.AR?.flatrate ?? []).some((p) => p.provider_id === NETFLIX_PROVIDER_ID);
  } catch {
    return false;
  }
}

export async function ingestLatestWeek() {
  const db = supabaseServer();
  if (!db) throw new Error("Supabase no configurado (falta SUPABASE_SERVICE_ROLE_KEY)");

  const filas = await fetchArWeek();
  const week = filas[0].week;

  // Lo que ya está guardado para esa semana: si el raw_title no cambió, la fila
  // NO se toca. Así una corrección manual de tmdb_id sobrevive a los reintentos.
  const { data: previas } = await db
    .from("netflix_top10")
    .select("category,rank,raw_title")
    .eq("week", week);
  const yaEsta = new Map(
    (previas ?? []).map((p) => [`${p.category}:${p.rank}`, p.raw_title as string]),
  );

  const pendientes = filas.filter(
    (f) => yaEsta.get(`${f.category}:${f.rank}`) !== f.rawTitle,
  );
  if (!pendientes.length) return { week, inserted: 0, resolved: 0, review: 0 };

  // Mapa de títulos ya resueltos en semanas anteriores, acotado por categoría:
  // un mismo nombre puede existir como película y como serie.
  const { data: conocidos } = await db
    .from("netflix_top10")
    .select("raw_title,category,tmdb_id")
    .in("raw_title", pendientes.map((f) => f.rawTitle))
    .not("tmdb_id", "is", null);
  const mapa = new Map(
    (conocidos ?? []).map((c) => [`${c.category}:${c.raw_title}`, c.tmdb_id as number]),
  );

  const rows = [];
  let resolved = 0, review = 0;
  for (const f of pendientes) {
    const conocido = mapa.get(`${f.category}:${f.rawTitle}`);
    const r = conocido != null
      ? { tmdbId: conocido, needsReview: false }
      : await resolveTitle(f.category, f.rawTitle);
    if (r.tmdbId != null) resolved++;
    if (r.needsReview) review++;
    rows.push({
      week: f.week, category: f.category, rank: f.rank, raw_title: f.rawTitle,
      tmdb_id: r.tmdbId, needs_review: r.needsReview, updated_at: new Date().toISOString(),
    });
  }

  const { error } = await db.from("netflix_top10").upsert(rows, {
    onConflict: "week,category,rank",
  });
  if (error) throw new Error(`upsert falló: ${error.message}`);
  return { week, inserted: rows.length, resolved, review };
}

// Devuelve la semana más reciente guardada. null si la tabla está vacía o si
// Supabase no está configurado: el llamador cae a popularidad.
export async function latestWeekRows(): Promise<
  { week: string; movie: StoredRow[]; tv: StoredRow[] } | null
> {
  const db = supabaseServer();
  if (!db) return null;
  const { data: ultima } = await db
    .from("netflix_top10")
    .select("week")
    .order("week", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!ultima?.week) return null;
  const { data } = await db
    .from("netflix_top10")
    .select("category,rank,raw_title,tmdb_id")
    .eq("week", ultima.week)
    .order("rank");
  if (!data?.length) return null;
  const pick = (cat: MediaType): StoredRow[] => data
    .filter((r) => r.category === cat)
    .map((r) => ({ rank: r.rank as number, rawTitle: r.raw_title as string, tmdbId: r.tmdb_id as number | null }));
  return { week: ultima.week as string, movie: pick("movie"), tv: pick("tv") };
}
