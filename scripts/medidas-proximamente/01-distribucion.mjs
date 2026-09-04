import { agenda, hoyAR } from "./lib-datos.mjs";
const todo = await agenda();
const conPlat = todo.filter((f) => f.plataformas.length > 0);
console.log(`hoy AR = ${hoyAR()}`);
console.log(`filas vigentes (release_date >= hoy): ${todo.length}`);
console.log(`con plataforma soportada (lo que la app muestra): ${conPlat.length}`);
console.log(`descartadas por plataforma no mapeada: ${todo.length - conPlat.length}`);

const cuenta = (arr, f) => { const m = new Map(); for (const x of arr) { const k = f(x); m.set(k, (m.get(k) ?? 0) + 1); } return [...m].sort((a,b)=>b[1]-a[1]); };
const tabla = (t, pares, tot) => { console.log(`\n### ${t}`); for (const [k,v] of pares) console.log(`  ${String(k).padEnd(28)} ${String(v).padStart(4)}  ${(v*100/tot).toFixed(1)}%`); };

tabla("tipo", cuenta(conPlat, (f) => f.media_type), conPlat.length);
tabla("plataforma (un titulo puede estar en varias)",
  cuenta(conPlat.flatMap((f) => f.plataformas), (x) => x), conPlat.length);

// Fechas
const porFecha = cuenta(conPlat, (f) => f.release_date).sort((a,b)=>a[0]<b[0]?-1:1);
console.log(`\n### rango de fechas: ${porFecha[0][0]} .. ${porFecha.at(-1)[0]}  (${porFecha.length} dias distintos)`);
console.log("primeros 12 dias:");
for (const [d,n] of porFecha.slice(0,12)) console.log(`  ${d}  ${String(n).padStart(3)}`);

// Los primeros 100 por fecha: lo que HOY devuelve la API
const cien = conPlat.slice(0, 100);
console.log(`\n### LO QUE HOY DEVUELVE /api/upcoming?limit=100`);
console.log(`  total ${cien.length}, rango ${cien[0].release_date} .. ${cien.at(-1).release_date}`);
tabla("  tipo", cuenta(cien, (f) => f.media_type), cien.length);
const anim = cien.filter((f) => (f.genre_ids ?? []).includes(16));
console.log(`  con genero Animacion (16): ${anim.length} (${(anim.length*100/cien.length).toFixed(1)}%)`);
const cr = cien.filter((f) => f.plataformas.includes("cr"));
console.log(`  en Crunchyroll: ${cr.length} (${(cr.length*100/cien.length).toFixed(1)}%)`);
const epis = cien.filter((f) => f.episode_number != null && !f.is_season_premiere);
console.log(`  episodios semanales (no premiere): ${epis.length}`);
const prem = cien.filter((f) => f.is_season_premiere);
console.log(`  estrenos de temporada: ${prem.length}`);
const pelis = cien.filter((f) => f.media_type === "movie");
console.log(`  peliculas: ${pelis.length} -> ${pelis.map((p)=>p.release_date+" "+p.title).join(" | ")}`);
