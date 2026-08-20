#!/usr/bin/env node
// Por dónde puede haber entrado Bleach al riel "Elegidas para vos".
//
//   node --env-file=.env.local --import ./scripts/cargar-lib.mjs \
//        scripts/rastrear-bleach.mjs
//
// No adivina el origen: sin las señales del usuario no se puede saber cuál fue.
// Lo que hace es medir QUÉ CAMINOS pueden producirlo y con qué facilidad, que es
// lo que acota la causa sin inventarla.
import { titleDetails, tmdbKeywords, discover, watchProviders } from "../lib/tmdb.ts";
import { codesToTmdbIds } from "../lib/providers-ar.ts";
import { resolveCategory, genreIdsToSlugs } from "../lib/categories.ts";

const BLEACH_TV = 30984;
const P = ["n", "d", "m", "cr"];

const d = await titleDetails("tv", BLEACH_TV);
const kws = await tmdbKeywords("tv", BLEACH_TV);
const generos = (d.genres ?? []).map((g) => g.id);

console.log("\n=== BLEACH, los datos que YA viajan en el payload ===");
console.log("nombre:            ", d.name);
console.log("genre_ids:         ", generos.join(", "), "→", genreIdsToSlugs(generos).join(", "));
console.log("original_language: ", d.original_language);
console.log("¿anime? (16 + ja): ", generos.includes(16) && d.original_language === "ja" ? "SÍ" : "no");
console.log("keywords:          ", kws.slice(0, 8).map((k) => `${k.id}:${k.name}`).join(", "));

const wp = await watchProviders("tv", BLEACH_TV).catch(() => null);
const flat = wp?.results?.AR?.flatrate ?? [];
console.log("plataformas AR:    ", flat.map((f) => `${f.provider_name}(${f.provider_id})`).join(", ") || "(ninguna)");

// --- ¿Puede llegar por CRUCE desde una película NO anime? --------------------
// El cruce es `discover(tv, {keywords del origen, géneros mapeados, providers})`.
// Si aparece Bleach, ese origen lo produce.
console.log("\n=== ¿Llega por CRUCE desde una película no-anime? ===");
const ORIGENES = [
  { id: 27205, t: "El origen" },
  { id: 155, t: "Batman: El caballero de la noche" },
  { id: 496243, t: "Parásitos" },
  { id: 245891, t: "John Wick" },
  { id: 1726, t: "Iron Man" },
  { id: 603, t: "Matrix" },
];
const idsProv = codesToTmdbIds(P);
for (const o of ORIGENES) {
  const det = await titleDetails("movie", o.id);
  const propias = (await tmdbKeywords("movie", o.id)).map((k) => k.id);
  const slugs = genreIdsToSlugs((det.genres ?? []).map((g) => g.id));
  const delMapeo = [...new Set(slugs.flatMap((s) => resolveCategory(s, "tv").keywords ?? []))];
  const generosOpuesto = [...new Set(slugs.flatMap((s) => resolveCategory(s, "tv").genres ?? []))];
  const keywords = [...new Set([...propias, ...delMapeo])].slice(0, 4);
  if (!keywords.length) { console.log(`  ${o.t.padEnd(32)} sin keywords → no cruza`); continue; }
  const r = await discover("tv", { keywords, genres: generosOpuesto.length ? generosOpuesto : undefined, providers: idsProv, minVotes: 0 });
  const hay = r.results.find((x) => x.id === BLEACH_TV);
  const animes = r.results.filter((x) => (x.genre_ids ?? []).includes(16) && x.original_language === "ja");
  console.log(
    `  ${o.t.padEnd(32)} ${String(r.results.length).padStart(2)} cand · ` +
    `${String(animes.length).padStart(2)} anime · Bleach: ${hay ? `SÍ (pos ${r.results.indexOf(hay) + 1})` : "no"}`,
  );
  if (animes.length) console.log(`      ${animes.slice(0, 4).map((a) => a.name).join(" · ")}`);
}

// --- ¿Llega por MISMO TIPO desde una serie no-anime? -------------------------
console.log("\n=== ¿Llega por MISMO TIPO (/recommendations) desde una serie no-anime? ===");
const SERIES = [
  { id: 1396, t: "Breaking Bad" },
  { id: 100088, t: "The Last of Us" },
  { id: 66732, t: "Stranger Things" },
  { id: 1399, t: "Game of Thrones" },
  { id: 71912, t: "The Witcher" },
  { id: 94605, t: "Arcane" },
];
for (const s of SERIES) {
  const det = await titleDetails("tv", s.id);
  const recs = det.recommendations?.results ?? [];
  const hay = recs.find((x) => x.id === BLEACH_TV);
  const animes = recs.filter((x) => (x.genre_ids ?? []).includes(16) && x.original_language === "ja");
  console.log(
    `  ${s.t.padEnd(32)} ${String(recs.length).padStart(2)} rec · ` +
    `${String(animes.length).padStart(2)} anime · Bleach: ${hay ? `SÍ (pos ${recs.indexOf(hay) + 1})` : "no"}`,
  );
  if (animes.length) console.log(`      ${animes.slice(0, 5).map((a) => a.name).join(" · ")}`);
}
console.log("");
