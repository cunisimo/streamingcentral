#!/usr/bin/env node
/**
 * Fase 2 — Extracción del pool crudo para el chip "Mágica navidad".
 *
 * Objetivo: COBERTURA, no precisión. Trae todo lo que huela a navidad,
 * aceptando ruido. El filtrado ocurre en la Fase 3 (clasificación LLM).
 *
 * Uso:
 *   TMDB_ACCESS_TOKEN=... node scripts/extract-pool-navidad.mjs
 *   TMDB_API_KEY=...      node scripts/extract-pool-navidad.mjs   (fallback v3)
 *
 * Salida: data/pool-navidad.json
 *
 * NOTA: los IDs de keyword se resuelven en runtime contra /search/keyword.
 * No están hardcodeados a propósito: los IDs de TMDB no son estables entre
 * términos similares y hardcodearlos es una fuente silenciosa de pools vacíos.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

// ─── Configuración ──────────────────────────────────────────────────────────

/** Términos a resolver contra /search/keyword. Amplios a propósito. */
const KEYWORD_TERMS = [
  "christmas",
  "christmas movie",
  "santa claus",
  "christmas eve",
  "christmas party",
  "advent",
  "nativity",
  "north pole",
];

const PAGES_PER_SORT = 10;

/** Un solo sort_by trunca sesgado. vote_count es acumulativo y no estacional. */
const SORTS = {
  movie: ["popularity.desc", "vote_count.desc", "revenue.desc"],
  tv: ["popularity.desc", "vote_count.desc"],
};
const LANGUAGE = "es-ES"; // mejor cobertura de overview que es-AR
const FALLBACK_LANGUAGE = "en-US";
const CONCURRENCY = 8;
const OUTPUT_PATH = resolve("data/pool-navidad.json");

const BASE = "https://api.themoviedb.org/3";
const ACCESS_TOKEN = process.env.TMDB_ACCESS_TOKEN ?? process.env.TMDB_READ_TOKEN ?? null;
const API_KEY = process.env.TMDB_API_KEY ?? null;

if (!ACCESS_TOKEN && !API_KEY) {
  console.error("Falta TMDB_ACCESS_TOKEN (v4) o TMDB_API_KEY (v3) en el entorno.");
  process.exit(1);
}

// ─── Cliente HTTP ───────────────────────────────────────────────────────────

/**
 * GET contra la API de TMDB con reintento ante 429 y errores transitorios.
 * @param {string} path Ruta relativa, ej. "/discover/movie"
 * @param {Record<string, string|number>} [params]
 * @param {number} [attempt]
 * @returns {Promise<object|null>} JSON parseado, o null si falló definitivamente
 */
async function tmdb(path, params = {}, attempt = 0) {
  const url = new URL(BASE + path);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  if (!ACCESS_TOKEN && API_KEY) url.searchParams.set("api_key", API_KEY);

  const headers = { accept: "application/json" };
  if (ACCESS_TOKEN) headers.authorization = `Bearer ${ACCESS_TOKEN}`;

  try {
    const response = await fetch(url, { headers });

    if (response.status === 429 && attempt < 5) {
      const retryAfter = Number(response.headers.get("retry-after") ?? 1);
      await sleep((retryAfter + 1) * 1000);
      return tmdb(path, params, attempt + 1);
    }
    if (response.status >= 500 && attempt < 3) {
      await sleep(2 ** attempt * 500);
      return tmdb(path, params, attempt + 1);
    }
    if (!response.ok) {
      console.warn(`  ! ${path} → HTTP ${response.status}`);
      return null;
    }
    return await response.json();
  } catch (err) {
    if (attempt < 3) {
      await sleep(2 ** attempt * 500);
      return tmdb(path, params, attempt + 1);
    }
    console.warn(`  ! ${path} → ${err.message}`);
    return null;
  }
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * Ejecuta tareas async con concurrencia acotada, preservando el orden.
 * @template T, R
 * @param {readonly T[]} items
 * @param {number} limit
 * @param {(item: T, index: number) => Promise<R>} worker
 * @returns {Promise<R[]>}
 */
async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

// ─── Pasos ──────────────────────────────────────────────────────────────────

/**
 * Resuelve los términos de KEYWORD_TERMS a IDs de keyword de TMDB.
 * Sólo acepta coincidencia exacta de nombre para evitar arrastrar ruido.
 * @returns {Promise<Array<{id: number, name: string}>>}
 */
async function resolveKeywords() {
  const found = new Map();
  for (const term of KEYWORD_TERMS) {
    const data = await tmdb("/search/keyword", { query: term, page: 1 });
    const match = data?.results?.find((k) => k.name.toLowerCase() === term.toLowerCase());
    if (match) {
      found.set(match.id, match.name);
      console.log(`  keyword "${term}" → ${match.id}`);
    } else {
      console.warn(`  keyword "${term}" → sin coincidencia exacta, se omite`);
    }
  }
  return [...found].map(([id, name]) => ({ id, name }));
}

/**
 * Descubre títulos por keywords (OR), uniendo varios ordenamientos.
 * Un solo sort_by trunca sesgado: en agosto ninguna navideña tiene
 * popularidad alta, así que el corte deja afuera clásicos.
 * @param {"movie"|"tv"} mediaType
 * @param {readonly number[]} keywordIds
 * @returns {Promise<Map<number, object>>}
 */
async function discover(mediaType, keywordIds) {
  const collected = new Map();
  const withKeywords = keywordIds.join("|"); // "|" = OR en TMDB

  for (const sortBy of SORTS[mediaType]) {
    let nuevos = 0;
    for (let page = 1; page <= PAGES_PER_SORT; page++) {
      const data = await tmdb(`/discover/${mediaType}`, {
        with_keywords: withKeywords,
        sort_by: sortBy,
        include_adult: false,
        language: LANGUAGE,
        page,
      });
      if (!data?.results?.length) break;

      for (const item of data.results) {
        if (!collected.has(item.id)) nuevos++;
        collected.set(item.id, item);
      }
      if (page >= (data.total_pages ?? 1)) break;
    }
    console.log(`  ${mediaType} · ${sortBy}: +${nuevos} nuevos`);
  }

  console.log(`  ${mediaType}: ${collected.size} candidatos únicos`);
  return collected;
}
/**
 * Trae géneros y keywords reales de cada título, con fallback de overview.
 * @param {"movie"|"tv"} mediaType
 * @param {object} item Resultado crudo de /discover
 * @returns {Promise<object|null>} Registro normalizado
 */
async function enrich(mediaType, item) {
  const detail = await tmdb(`/${mediaType}/${item.id}`, {
    language: LANGUAGE,
    append_to_response: "keywords",
  });
  if (!detail) return null;

  // Movies exponen keywords.keywords; TV expone keywords.results
  const keywords = (detail.keywords?.keywords ?? detail.keywords?.results ?? []).map(
    (k) => k.name,
  );

  let overview = detail.overview?.trim() ?? "";
  if (!overview) {
    const fallback = await tmdb(`/${mediaType}/${item.id}`, { language: FALLBACK_LANGUAGE });
    overview = fallback?.overview?.trim() ?? "";
  }

  const releaseDate = detail.release_date ?? detail.first_air_date ?? "";

  return {
    tmdb_id: detail.id,
    media_type: mediaType,
    title: detail.title ?? detail.name ?? "",
    original_title: detail.original_title ?? detail.original_name ?? "",
    year: releaseDate ? Number(releaseDate.slice(0, 4)) : null,
    overview,
    genres: (detail.genres ?? []).map((g) => g.name),
    keywords,
    popularity: detail.popularity ?? null,
    vote_count: detail.vote_count ?? 0,
    vote_average: detail.vote_average ?? null,
  };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("1. Resolviendo keywords…");
  const keywords = await resolveKeywords();
  if (keywords.length === 0) {
    console.error("Ninguna keyword resuelta. Abortando.");
    process.exit(1);
  }
  const keywordIds = keywords.map((k) => k.id);

  console.log("\n2. Descubriendo candidatos…");
  const movies = await discover("movie", keywordIds);
  const shows = await discover("tv", keywordIds);

  const raw = [
    ...[...movies.values()].map((item) => ["movie", item]),
    ...[...shows.values()].map((item) => ["tv", item]),
  ];

  console.log(`\n3. Enriqueciendo ${raw.length} títulos (concurrencia ${CONCURRENCY})…`);
  const enriched = await mapLimit(raw, CONCURRENCY, ([mediaType, item]) =>
    enrich(mediaType, item),
  );

  const pool = enriched
    .filter((entry) => entry !== null && entry.overview.length > 0)
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));

  const descartados = enriched.length - pool.length;
  if (descartados > 0) console.log(`  ${descartados} descartados (sin detalle o sin overview)`);

  const output = {
    chip_slug: "magica-navidad",
    generated_at: new Date().toISOString(),
    keywords_used: keywords,
    pages_per_sort: PAGES_PER_SORT,
    sorts: SORTS,
    total: pool.length,
    titles: pool,
  };

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf8");

  console.log(`\n✔ ${pool.length} títulos → ${OUTPUT_PATH}`);
  console.log(`  películas: ${pool.filter((t) => t.media_type === "movie").length}`);
  console.log(`  series:    ${pool.filter((t) => t.media_type === "tv").length}`);
}

main().catch((err) => {
  console.error("Falló la extracción:", err);
  process.exit(1);
});
