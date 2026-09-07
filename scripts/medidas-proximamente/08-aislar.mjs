import { agenda } from "./lib-datos.mjs";
const t0 = (await agenda()).filter((f) => f.plataformas.length > 0);
const JP = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/;
const esAnime = (f) => f.plataformas.includes("cr") || ((f.genre_ids ?? []).includes(16) && JP.test(f.original_title ?? ""));
const nivel = (f) => f.media_type === "movie" ? 1 : (f.is_season_premiere ? (f.season_number===1?2:3) : 4);

function sel(items, { porDia, tope }) {
  const porFecha = new Map();
  for (const f of items) { if (nivel(f)!==4) continue;
    if(!porFecha.has(f.release_date)) porFecha.set(f.release_date,[]); porFecha.get(f.release_date).push(f); }
  const ok = new Set();
  for (const [,arr] of porFecha) { arr.sort((a,b)=>(b.popularity??0)-(a.popularity??0)||a.tmdb_id-b.tmdb_id);
    for (const f of arr.slice(0,porDia)) ok.add(`${f.media_type}:${f.tmdb_id}`); }
  const el = items.filter(f=>nivel(f)!==4||ok.has(`${f.media_type}:${f.tmdb_id}`));
  const noA = el.filter(f=>!esAnime(f));
  const A = el.filter(esAnime).sort((a,b)=>(b.popularity??0)-(a.popularity??0)||a.tmdb_id-b.tmdb_id);
  const cupo = tope>=1 ? A.length : Math.floor(noA.length*tope/(1-tope));
  const perm = new Set(A.slice(0,cupo).map(f=>`${f.media_type}:${f.tmdb_id}`));
  const ord=[...el].sort((a,b)=>(a.release_date<b.release_date?-1:a.release_date>b.release_date?1:0)||nivel(a)-nivel(b)||(b.popularity??0)-(a.popularity??0)||a.tmdb_id-b.tmdb_id);
  const out=[]; let na=0;
  for(const f of ord){ if(!esAnime(f)){out.push(f);continue;}
    if(!perm.has(`${f.media_type}:${f.tmdb_id}`))continue;
    if(tope<1 && (na+1)>tope*(out.length+1))continue;
    out.push(f);na++; }
  return out;
}
console.log("APORTE DE CADA MECANISMO (sobre 238 vigentes)\n");
console.log("variante                              n   anime  %anime   epi  dias");
const fila=(t,l)=>{const a=l.filter(esAnime).length;const d=new Set(l.map(f=>f.release_date)).size;
  console.log(`${t.padEnd(36)} ${String(l.length).padStart(3)}   ${String(a).padStart(3)}   ${(a*100/(l.length||1)).toFixed(1).padStart(5)}%   ${String(l.filter(f=>nivel(f)===4).length).padStart(3)}   ${String(d).padStart(2)}`);};
fila("0. actual: fecha asc, limit 100", t0.slice(0,100));
fila("1. sin tope epi, sin tope anime", sel(t0,{porDia:999,tope:1}));
fila("2. SOLO tope anime 20%", sel(t0,{porDia:999,tope:0.20}));
fila("3. SOLO tope 3 epi/dia", sel(t0,{porDia:3,tope:1}));
fila("4. los dos (el diseño)", sel(t0,{porDia:3,tope:0.20}));
console.log("\n-> el tope por dia es el que baja el ruido; el 20% queda como garantia, no como filtro activo.");
console.log("   (variante 3 ya da " + (sel(t0,{porDia:3,tope:1}).filter(esAnime).length*100/sel(t0,{porDia:3,tope:1}).length).toFixed(1) + "% de anime sin tope alguno)");
