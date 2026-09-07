import { agenda } from "./lib-datos.mjs";
const t = (await agenda()).filter((f) => f.plataformas.length > 0);
const porSerie = new Map();
for (const f of t) {
  const k = `${f.media_type}:${f.tmdb_id}`;
  if (!porSerie.has(k)) porSerie.set(k, []);
  porSerie.get(k).push(f);
}
const ord = [...porSerie].sort((a, b) => b[1].length - a[1].length);
console.log(`titulos UNICOS (tipo:id): ${porSerie.size}   filas: ${t.length}`);
console.log(`titulos que aparecen mas de una vez: ${ord.filter(([,v])=>v.length>1).length}\n`);
console.log("los que mas se repiten:");
for (const [k, v] of ord.slice(0, 15)) {
  console.log(`  ${String(v.length).padStart(2)}x  ${v[0].title.slice(0,36).padEnd(37)} ${v.map(x=>`${x.release_date.slice(5)}`).join(" ")}`);
}
const hist = new Map();
for (const [,v] of ord) hist.set(v.length, (hist.get(v.length)??0)+1);
console.log("\nhistograma de repeticiones:");
for (const [n,c] of [...hist].sort((a,b)=>a[0]-b[0])) console.log(`  ${n} aparicion(es): ${c} titulos`);

// popularidad de los episodios semanales
const epi = t.filter((f) => f.episode_number != null && !f.is_season_premiere);
const pops = epi.map(f=>f.popularity??0).sort((a,b)=>b-a);
const q = (p) => pops[Math.floor(pops.length*p)];
console.log(`\npopularidad de los ${epi.length} episodios semanales:`);
console.log(`  max=${Math.round(pops[0])} p25=${Math.round(q(.25))} mediana=${Math.round(q(.5))} p75=${Math.round(q(.75))} min=${Math.round(pops.at(-1))}`);
const prem = t.filter(f=>f.is_season_premiere).map(f=>f.popularity??0).sort((a,b)=>b-a);
console.log(`popularidad de los ${prem.length} estrenos de temporada:`);
console.log(`  max=${Math.round(prem[0])} mediana=${Math.round(prem[Math.floor(prem.length/2)])} min=${Math.round(prem.at(-1))}`);
