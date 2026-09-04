import { agenda } from "./lib-datos.mjs";
import fs from "node:fs";
const t0 = (await agenda()).filter((f) => f.plataformas.length > 0);

const JP = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/;
const esAnime = (f) => f.plataformas.includes("cr")
  || ((f.genre_ids ?? []).includes(16) && JP.test(f.original_title ?? ""));

// Prioridad editorial. 1 = mas alta.
function nivel(f) {
  if (f.media_type === "movie") return 1;              // pelicula con plataforma AR
  if (f.is_season_premiere && f.season_number === 1) return 2;  // serie nueva
  if (f.is_season_premiere) return 3;                  // estreno de temporada
  return 4;                                            // episodio semanal
}

function seleccionar(items, { porDia, tope = 0.20 }) {
  // 1. dedup por tipo:id
  const vistos = new Set();
  const unicos = [];
  for (const f of items) {
    const k = `${f.media_type}:${f.tmdb_id}`;
    if (vistos.has(k)) continue;
    vistos.add(k); unicos.push(f);
  }
  // 2. presupuesto de episodios semanales: top-`porDia` de cada dia por popularidad
  const porFecha = new Map();
  for (const f of unicos) {
    if (nivel(f) !== 4) continue;
    if (!porFecha.has(f.release_date)) porFecha.set(f.release_date, []);
    porFecha.get(f.release_date).push(f);
  }
  const epiOk = new Set();
  for (const [, arr] of porFecha) {
    arr.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0) || a.tmdb_id - b.tmdb_id);
    for (const f of arr.slice(0, porDia)) epiOk.add(`${f.media_type}:${f.tmdb_id}`);
  }
  const elegibles = unicos.filter((f) => nivel(f) !== 4 || epiOk.has(`${f.media_type}:${f.tmdb_id}`));

  // 3. cupo global de anime: si a <= tope*(M+a) entonces a <= M*tope/(1-tope)
  const noAnime = elegibles.filter((f) => !esAnime(f));
  const anime = elegibles.filter(esAnime).sort(
    (a, b) => (b.popularity ?? 0) - (a.popularity ?? 0) || a.tmdb_id - b.tmdb_id);
  const cupo = Math.floor(noAnime.length * tope / (1 - tope));
  const permitidos = new Set(anime.slice(0, cupo).map((f) => `${f.media_type}:${f.tmdb_id}`));

  // 4. orden TOTAL y deterministico: fecha, nivel, popularidad, id
  const ord = [...elegibles].sort((a, b) =>
    (a.release_date < b.release_date ? -1 : a.release_date > b.release_date ? 1 : 0)
    || nivel(a) - nivel(b)
    || (b.popularity ?? 0) - (a.popularity ?? 0)
    || a.tmdb_id - b.tmdb_id);

  // 5. recorrido con el tope invariante de prefijo
  const out = []; let na = 0;
  for (const f of ord) {
    if (!esAnime(f)) { out.push(f); continue; }
    if (!permitidos.has(`${f.media_type}:${f.tmdb_id}`)) continue;
    if ((na + 1) > tope * (out.length + 1)) continue;
    out.push(f); na++;
  }
  return out;
}

const resumen = (t, l) => {
  const a = l.filter(esAnime).length;
  const pel = l.filter(f=>f.media_type==="movie").length;
  const pr = l.filter(f=>f.is_season_premiere).length;
  const ep = l.filter(f=>nivel(f)===4).length;
  const dias = new Set(l.map(f=>f.release_date)).size;
  return `${t.padEnd(22)} n=${String(l.length).padStart(3)}  ${l[0]?.release_date.slice(5)}..${l.at(-1)?.release_date.slice(5)}  dias=${String(dias).padStart(2)}  pel=${pel} prem=${String(pr).padStart(2)} epi=${String(ep).padStart(3)}  anime=${String(a).padStart(2)} (${(a*100/(l.length||1)).toFixed(1)}%)`;
};

console.log("=== ACTUAL vs SIMULADO ===\n");
const actual = t0.slice(0, 100);
console.log(resumen("ACTUAL (fecha,limit100)", actual));
console.log();
for (const porDia of [2, 3, 4, 6]) {
  console.log(resumen(`nuevo porDia=${porDia}`, seleccionar(t0, { porDia })));
}

// El elegido para el detalle
const ELEG = 3;
const sel = seleccionar(t0, { porDia: ELEG });
console.log(`\n=== DETALLE con porDia=${ELEG} ===`);
// invariante de prefijo en cada tanda de 20
console.log("\ntope de anime en cada tanda acumulada (20,40,60,...):");
for (let n = 20; n <= sel.length + 19; n += 20) {
  const p = sel.slice(0, Math.min(n, sel.length));
  const a = p.filter(esAnime).length;
  console.log(`  acumulado ${String(p.length).padStart(3)}: anime ${String(a).padStart(2)} = ${(a*100/p.length).toFixed(1)}%  ${a<=0.2*p.length?"OK":"VIOLA"}`);
}
console.log("\nplataformas en la seleccion:");
const pm = new Map();
for (const f of sel) for (const c of f.plataformas) pm.set(c,(pm.get(c)??0)+1);
for (const [c,n] of [...pm].sort((a,b)=>b[1]-a[1])) console.log(`  ${c.padEnd(4)} ${String(n).padStart(3)}  ${(n*100/sel.length).toFixed(1)}%`);

const enActual = new Set(actual.map(f=>`${f.media_type}:${f.tmdb_id}`));
const enSel = new Set(sel.map(f=>`${f.media_type}:${f.tmdb_id}`));
const entran = sel.filter(f=>!enActual.has(`${f.media_type}:${f.tmdb_id}`));
const salen = actual.filter(f=>!enSel.has(`${f.media_type}:${f.tmdb_id}`));
console.log(`\nENTRAN (no estaban en los 100 actuales): ${entran.length}`);
for (const f of entran.slice(0,25)) console.log(`  ${f.release_date} n${nivel(f)} ${esAnime(f)?"A":" "} pop=${String(Math.round(f.popularity??0)).padStart(4)} ${f.title.slice(0,44)}`);
console.log(`\nSALEN (estaban y ya no): ${salen.length}`);
for (const f of salen.slice(0,20)) console.log(`  ${f.release_date} n${nivel(f)} ${esAnime(f)?"A":" "} pop=${String(Math.round(f.popularity??0)).padStart(4)} ${f.title.slice(0,44)}`);
fs.writeFileSync("scratch/simulacion.json", JSON.stringify({
  actual: actual.map(f=>({d:f.release_date,t:f.title,n:nivel(f),a:esAnime(f)})),
  nuevo: sel.map(f=>({d:f.release_date,t:f.title,n:nivel(f),a:esAnime(f),p:f.plataformas})),
}, null, 1));
