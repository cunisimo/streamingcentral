// Las 4 preguntas del dueño sobre peliculas de TMDB en AR.
import { parseEnv } from "node:util";
import fs from "node:fs";
const env = parseEnv(fs.readFileSync(".env.local", "utf8"));
const T = env.TMDB_READ_TOKEN;
const H = { Authorization: `Bearer ${T}`, accept: "application/json" };
const api = async (p, q = {}) => {
  const u = new URL(`https://api.themoviedb.org/3/${p}`);
  for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
  const r = await fetch(u, { headers: H });
  if (!r.ok) throw new Error(`${p} ${r.status}`);
  return r.json();
};
const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
const hasta = new Date(Date.now() + 90 * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
console.log(`ventana: ${hoy} .. ${hasta} (90 dias)\n`);

// --- 1. Que devuelve TMDB como "upcoming" para Argentina -------------------
const up = await api("movie/upcoming", { region: "AR", language: "es-ES", page: 1 });
console.log(`1) /movie/upcoming?region=AR  -> total_results=${up.total_results}, paginas=${up.total_pages}`);
const upAll = [];
for (let p = 1; p <= Math.min(up.total_pages, 10); p++) {
  const r = await api("movie/upcoming", { region: "AR", language: "es-ES", page: String(p) });
  upAll.push(...r.results);
}
console.log(`   recolectadas: ${upAll.length}`);

// discover sin filtro de proveedor, misma ventana, region AR
let d1 = await api("discover/movie", {
  region: "AR", "primary_release_date.gte": hoy, "primary_release_date.lte": hasta,
  sort_by: "primary_release_date.asc", language: "es-ES", page: "1",
});
console.log(`   /discover/movie (ventana 90d, sin filtro de proveedor) -> ${d1.total_results} en ${d1.total_pages} paginas`);

// --- 3. Cuantas tienen flatrate AR confirmado ------------------------------
const provs = await api("watch/providers/movie", { watch_region: "AR" });
const idsAR = provs.results.map((p) => p.provider_id).sort((a,b)=>a-b).join("|");
const conProv = await api("discover/movie", {
  region: "AR", "primary_release_date.gte": hoy, "primary_release_date.lte": hasta,
  with_watch_monetization_types: "flatrate", with_watch_providers: idsAR,
  watch_region: "AR", sort_by: "primary_release_date.asc", language: "es-ES", page: "1",
});
console.log(`\n3) mismas fechas CON flatrate AR (los ${provs.results.length} proveedores de TMDB para AR):`);
console.log(`   total_results = ${conProv.total_results}`);
for (const m of conProv.results.slice(0, 20)) console.log(`      ${m.release_date}  ${m.title}`);

// --- 2 y 4: muestra de las de cine, verificando providers uno por uno -------
const muestra = [];
for (let p = 1; p <= Math.min(d1.total_pages, 6); p++) {
  const r = await api("discover/movie", {
    region: "AR", "primary_release_date.gte": hoy, "primary_release_date.lte": hasta,
    sort_by: "popularity.desc", language: "es-ES", page: String(p),
  });
  muestra.push(...r.results);
}
console.log(`\n2) muestra de estreno general/cine en la ventana: ${muestra.length} (6 paginas por popularidad)`);
let conFlat = 0, sinNada = 0, conOtro = 0;
const detalles = [];
for (const m of muestra.slice(0, 120)) {
  const wp = await api(`movie/${m.id}/watch/providers`);
  const ar = wp.results?.AR;
  const flat = ar?.flatrate?.length ?? 0;
  const otro = (ar?.rent?.length ?? 0) + (ar?.buy?.length ?? 0);
  if (flat) conFlat++; else if (otro) conOtro++; else sinNada++;
  detalles.push({ id: m.id, title: m.title, date: m.release_date, flat, otro, pop: m.popularity });
}
const n = Math.min(120, muestra.length);
console.log(`   sobre ${n} verificadas una por una con watch/providers:`);
console.log(`     con flatrate AR:            ${conFlat}`);
console.log(`     solo alquiler/compra AR:    ${conOtro}`);
console.log(`     sin NINGUN proveedor AR:    ${sinNada}`);
fs.writeFileSync("scratch/pelis-detalle.json", JSON.stringify(detalles, null, 1));
console.log(`\n   (detalle en scratch/pelis-detalle.json)`);
