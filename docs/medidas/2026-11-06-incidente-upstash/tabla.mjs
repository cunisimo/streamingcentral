import { readFileSync } from "node:fs";
const leer = (v) => JSON.parse(readFileSync(new URL(`./etapas-${v}.json`, import.meta.url)));
const [v, filtro] = [process.argv[2], process.argv[3]];
for (const f of leer(v)) {
  if (filtro && !f.caso.includes(filtro)) continue;
  console.log(`\n## ${v} · ${f.caso} — cmd=${f.comandos} MGET=${f.MGET} SET=${f.SET} claves=${f.claves} tmdb=${f.tmdb}`);
  console.log("etapa".padEnd(30), "MGET".padStart(6), "claves".padStart(7), "únic".padStart(5), "rep".padStart(4), "SET".padStart(4), "únic".padStart(5), "rep".padStart(4), "tmdb".padStart(5));
  for (const [n, e] of Object.entries(f.etapas).sort()) console.log(n.padEnd(30), String(e.MGET).padStart(6), String(e.clavesLeidas).padStart(7), String(e.unicasLeidas).padStart(5), String(e.repetidasLeidas).padStart(4), String(e.SET).padStart(4), String(e.unicasEscritas).padStart(5), String(e.repetidasEscritas).padStart(4), String(e.tmdb).padStart(5));
}
