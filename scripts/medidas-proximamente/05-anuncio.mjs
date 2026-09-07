// Pregunta 4: peliculas futuras con senal de streaming que TMDB aun no informa.
import { parseEnv } from "node:util";
import fs from "node:fs";
const env = parseEnv(fs.readFileSync(".env.local", "utf8"));
const H = { Authorization: `Bearer ${env.TMDB_READ_TOKEN}`, accept: "application/json" };
const api = async (p, q = {}) => {
  const u = new URL(`https://api.themoviedb.org/3/${p}`);
  for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
  const r = await fetch(u, { headers: H });
  if (!r.ok) throw new Error(`${p} ${r.status}`);
  return r.json();
};
const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
const hasta = new Date(Date.now() + 90 * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

// Los dominios de las 4 plataformas que la app acepta para PELICULAS.
const DOM = {
  n:  /(^|\.)netflix\.com$/,
  d:  /(^|\.)disneyplus\.com$/,
  p:  /(^|\.)(primevideo\.com|amazon\.com)$/,
  at: /(^|\.)(tv\.apple\.com|apple\.com)$/,
};
const marca = (hp) => {
  if (!hp) return null;
  let u; try { u = new URL(hp); } catch { return null; }
  for (const [c, re] of Object.entries(DOM)) if (re.test(u.hostname)) return c;
  return null;
};

// 200 peliculas de la ventana, ordenadas por popularidad (las que importan).
const cand = [];
for (let p = 1; p <= 10; p++) {
  const r = await api("discover/movie", {
    region: "AR", "primary_release_date.gte": hoy, "primary_release_date.lte": hasta,
    sort_by: "popularity.desc", language: "es-ES", page: String(p),
  });
  cand.push(...r.results);
}
console.log(`candidatas (ventana 90d, por popularidad): ${cand.length}`);

let conHome = 0, conMarca = 0, conFlatAR = 0;
const hits = [];
for (const m of cand) {
  const det = await api(`movie/${m.id}`, { language: "es-ES", append_to_response: "watch/providers" });
  const hp = det.homepage || "";
  if (hp) conHome++;
  const mk = marca(hp);
  const ar = det["watch/providers"]?.results?.AR;
  const flat = ar?.flatrate?.length ?? 0;
  if (flat) conFlatAR++;
  if (mk) { conMarca++; hits.push({ id: m.id, t: m.title, d: m.release_date, mk, hp, flat, pop: Math.round(m.popularity) }); }
}
console.log(`\nsobre ${cand.length} peliculas futuras verificadas una por una:`);
console.log(`  con campo homepage no vacio:                      ${conHome}`);
console.log(`  con homepage de una plataforma soportada:         ${conMarca}`);
console.log(`  con flatrate AR informado por TMDB:               ${conFlatAR}`);
console.log(`\n  -> senal de streaming SIN proveedor AR: ${hits.filter(h=>!h.flat).length}`);
for (const h of hits) console.log(`     ${h.d}  [${h.mk}] flat=${h.flat} pop=${String(h.pop).padStart(4)}  ${h.t.slice(0,38).padEnd(39)} ${h.hp.slice(0,52)}`);
fs.writeFileSync("scratch/anuncio.json", JSON.stringify(hits, null, 1));
