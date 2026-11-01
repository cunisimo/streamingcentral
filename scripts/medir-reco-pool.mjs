// Pool COMPLETO de candidatos por perfil (antes de la ventana de 80), con
// géneros crudos, para contar qué sobrevive a plataformas y a cada regla.
const L = "../lib/";
const { titleDetails, tmdbKeywords, discover } = await import(L + "tmdb.ts");
const { enrichRaw } = await import(L + "enrich.ts");
const { codesToTmdbIds } = await import(L + "providers-ar.ts");
const { resolveCategory, genreIdsToSlugs } = await import(L + "categories.ts");

const otro = (t) => (t === "movie" ? "tv" : "movie");
const k = (t, id) => `${t}:${id}`;

async function pool(origen, providers, sinFamiliaEnCruce) {
  const { tipo, id } = origen;
  const d = await titleDetails(tipo, id);
  const kw = (await tmdbKeywords(tipo, id)).map((x) => x.id);
  const slugs = genreIdsToSlugs((d.genres ?? []).map((g) => g.id));
  const keywords = [...new Set([...kw, ...slugs.flatMap((s) => resolveCategory(s, otro(tipo)).keywords ?? [])])].slice(0, 4);
  const generosOp = [...new Set(slugs.flatMap((s) => resolveCategory(s, otro(tipo)).genres ?? []))];
  const out = [];
  for (const r of d.recommendations?.results ?? []) out.push({ tipo: r.media_type ?? tipo, raw: r, camino: "mismo" });
  if (keywords.length) {
    const r = await discover(otro(tipo), {
      keywords, genres: generosOp.length ? generosOp : undefined,
      providers: codesToTmdbIds(providers), minVotes: 0,
      withoutGenres: sinFamiliaEnCruce ? [10751, 10762] : undefined,
    });
    for (const x of r.results) out.push({ tipo: otro(tipo), raw: x, camino: "cruce" });
  }
  return { titulo: d.title || d.name, generos: (d.genres ?? []).map((g) => g.id), cands: out };
}

const infantil = (tipo, g) => (tipo === "tv" ? g.includes(10762) : g.includes(16) && g.includes(10751));

async function medir(nombre, origenes, providers, sinFamiliaEnCruce) {
  const vistos = new Map();
  const excl = new Set(origenes.map((o) => k(o.tipo, o.id)));
  for (const o of origenes) {
    const p = await pool(o, providers, sinFamiliaEnCruce);
    for (const c of p.cands) {
      const kk = k(c.tipo, c.raw.id);
      if (!excl.has(kk) && !vistos.has(kk)) vistos.set(kk, { ...c, origen: p.titulo });
    }
  }
  const cands = [...vistos.values()];
  const disp = [];
  for (const tipo of ["movie", "tv"]) {
    const xs = cands.filter((c) => c.tipo === tipo);
    const ok = new Set((await enrichRaw(xs.map((c) => c.raw), tipo, providers)).map((t) => t.id));
    for (const c of xs) if (ok.has(c.raw.id)) disp.push(c);
  }
  const g = (c) => c.raw.genre_ids ?? [];
  const anim = disp.filter((c) => g(c).includes(16)).length;
  const inf = disp.filter((c) => infantil(c.tipo, g(c))).length;
  const fam = disp.filter((c) => g(c).includes(10751)).length;
  const sinInf = disp.filter((c) => !infantil(c.tipo, g(c)));
  console.log(
    `${nombre.padEnd(34)} ${providers.join(",").padEnd(6)} cruce${sinFamiliaEnCruce ? "-fam" : "    "} ` +
    `pool=${String(cands.length).padStart(3)} enPlat=${String(disp.length).padStart(3)} anim=${String(anim).padStart(3)} ` +
    `infantil=${String(inf).padStart(3)} fam10751=${String(fam).padStart(3)} sinInfantil=${String(sinInf.length).padStart(3)} ` +
    `(anim ${sinInf.filter((c) => g(c).includes(16)).length})`,
  );
}

const P = {
  "Simpsons": [{ tipo: "tv", id: 456 }],
  "Simpsons + Padre de familia": [{ tipo: "tv", id: 456 }, { tipo: "tv", id: 1434 }],
  "Bluey (infantil)": [{ tipo: "tv", id: 82728 }],
  "Breaking Bad": [{ tipo: "tv", id: 1396 }],
  "3 crimen (BB, Narcos, Padrino)": [{ tipo: "tv", id: 1396 }, { tipo: "tv", id: 63351 }, { tipo: "movie", id: 238 }],
};
for (const provs of [["n", "d", "m"], ["n"]]) {
  for (const [n, o] of Object.entries(P)) {
    await medir(n, o, provs, false);
    await medir(n, o, provs, true);
  }
}
