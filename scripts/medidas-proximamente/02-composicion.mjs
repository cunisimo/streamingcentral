import { agenda } from "./lib-datos.mjs";
const t = (await agenda()).filter((f) => f.plataformas.length > 0);
const pct = (n) => `${(n*100/t.length).toFixed(1)}%`;

console.log(`=== TODA la agenda vigente: ${t.length} elementos ===\n`);
const peli = t.filter((f) => f.media_type === "movie");
console.log(`peliculas: ${peli.length}`);
for (const p of peli) console.log(`   ${p.release_date}  ${p.title}  [${p.plataformas}]  pop=${p.popularity}`);

const prem = t.filter((f) => f.is_season_premiere);
const epi = t.filter((f) => f.media_type==="tv" && f.episode_number != null && !f.is_season_premiere);
const serieSinEp = t.filter((f) => f.media_type==="tv" && f.episode_number == null);
console.log(`\nestrenos de temporada (is_season_premiere): ${prem.length}  ${pct(prem.length)}`);
console.log(`episodios semanales:                        ${epi.length}  ${pct(epi.length)}`);
console.log(`tv sin numero de episodio:                  ${serieSinEp.length}`);

// Temporada 1 = serie nueva
const t1 = prem.filter((f) => f.season_number === 1);
console.log(`\n  de esos premieres, temporada 1 (serie NUEVA): ${t1.length}`);
for (const p of t1) console.log(`     ${p.release_date}  ${p.title}  [${p.plataformas}] pop=${Math.round(p.popularity)}`);
const tN = prem.filter((f) => f.season_number !== 1);
console.log(`  temporadas siguientes: ${tN.length}`);
for (const p of tN.slice(0,20)) console.log(`     ${p.release_date}  T${p.season_number} ${p.title}  [${p.plataformas}] pop=${Math.round(p.popularity)}`);

const anim = t.filter((f) => (f.genre_ids ?? []).includes(16));
const cr = t.filter((f) => f.plataformas.includes("cr"));
const animYcr = t.filter((f) => (f.genre_ids ?? []).includes(16) && f.plataformas.includes("cr"));
const animNoCr = t.filter((f) => (f.genre_ids ?? []).includes(16) && !f.plataformas.includes("cr"));
const crNoAnim = t.filter((f) => !(f.genre_ids ?? []).includes(16) && f.plataformas.includes("cr"));
console.log(`\n=== ANIMACION vs CRUNCHYROLL ===`);
console.log(`  genero Animacion (16):        ${anim.length}  ${pct(anim.length)}`);
console.log(`  en Crunchyroll:               ${cr.length}  ${pct(cr.length)}`);
console.log(`  Animacion Y Crunchyroll:      ${animYcr.length}`);
console.log(`  Animacion SIN Crunchyroll:    ${animNoCr.length}`);
console.log(`  Crunchyroll SIN Animacion:    ${crNoAnim.length}`);
console.log(`\n  --- Animacion que NO es anime (muestra) ---`);
for (const f of animNoCr.slice(0,25)) console.log(`     ${f.title.slice(0,42).padEnd(43)} orig="${(f.original_title??'').slice(0,32)}" [${f.plataformas}]`);
console.log(`\n  --- Crunchyroll SIN genero Animacion ---`);
for (const f of crNoAnim) console.log(`     ${f.title.slice(0,42).padEnd(43)} generos=${f.genre_ids}`);
