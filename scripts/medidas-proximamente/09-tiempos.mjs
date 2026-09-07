import { URL_SB, KEY, H, hoyAR } from "./lib-datos.mjs";
const hoy = hoyAR();
const SEL_COMPLETO = "tmdb_id,media_type,title,poster_path,backdrop_path,overview,release_date,"
  + "season_number,episode_number,episode_name,is_season_premiere,genre_ids,popularity,vote_average,"
  + "upcoming_content_providers(provider_id)";
const SEL_SIN_JOIN = SEL_COMPLETO.replace(",upcoming_content_providers(provider_id)", "");

async function medir(nombre, sel, tipo, limit, veces = 6) {
  const url = `${URL_SB}/rest/v1/upcoming_content?select=${sel}`
    + `&media_type=eq.${tipo}&release_date=gte.${hoy}&order=release_date.asc&limit=${limit}`;
  const ms = [];
  let n = 0, bytes = 0;
  for (let i = 0; i < veces; i++) {
    const t = performance.now();
    const r = await fetch(url, { headers: H });
    const txt = await r.text();
    ms.push(performance.now() - t);
    n = JSON.parse(txt).length; bytes = txt.length;
  }
  const s = [...ms].sort((a,b)=>a-b);
  console.log(`${nombre.padEnd(40)} frio=${ms[0].toFixed(0).padStart(5)}ms  mediana=${s[Math.floor(s.length/2)].toFixed(0).padStart(4)}ms  min=${s[0].toFixed(0).padStart(4)}ms  max=${s.at(-1).toFixed(0).padStart(5)}ms  filas=${String(n).padStart(3)}  ${(bytes/1024).toFixed(1)}KB`);
  return ms;
}

console.log(`=== /api/upcoming?mix=1&limit=15 : sus DOS consultas (per = ceil(15/2)+3 = 11) ===\n`);
await medir("movie, limit 11, CON join providers", SEL_COMPLETO, "movie", 11);
await medir("tv,    limit 11, CON join providers", SEL_COMPLETO, "tv", 11);
console.log();
await medir("movie, limit 11, SIN join", SEL_SIN_JOIN, "movie", 11);
await medir("tv,    limit 11, SIN join", SEL_SIN_JOIN, "tv", 11);
console.log(`\n=== lo que pide /proximamente hoy (limit 100) ===\n`);
await medir("tv, limit 100, CON join", SEL_COMPLETO, "tv", 100);
await medir("tv, limit 100, SIN join", SEL_SIN_JOIN, "tv", 100);
console.log(`\n=== la seleccion completa que necesitaria el diseño nuevo (limit 1000) ===\n`);
const url = `${URL_SB}/rest/v1/upcoming_content?select=${SEL_COMPLETO}&release_date=gte.${hoy}&order=release_date.asc&limit=1000`;
const ms=[];let n=0,b=0;
for(let i=0;i<6;i++){const t=performance.now();const r=await fetch(url,{headers:H});const x=await r.text();ms.push(performance.now()-t);n=JSON.parse(x).length;b=x.length;}
const s=[...ms].sort((a,b)=>a-b);
console.log(`ambos tipos, limit 1000, CON join      frio=${ms[0].toFixed(0).padStart(5)}ms  mediana=${s[Math.floor(s.length/2)].toFixed(0).padStart(4)}ms  min=${s[0].toFixed(0).padStart(4)}ms  filas=${n}  ${(b/1024).toFixed(1)}KB`);
