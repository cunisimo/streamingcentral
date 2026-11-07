// Compara flujos-<et>.json. node comparar.mjs <base> <variantes,coma>
import { readFileSync } from "node:fs";
const leer = (et) => JSON.parse(readFileSync(new URL(`./flujos-${et}.json`, import.meta.url)));
const base = process.argv[2]; const vars = process.argv[3].split(",");
const b = leer(base);
const V = Object.fromEntries(vars.map((v) => [v, new Map(leer(v).map((f) => [f.caso, f]))]));
console.log("caso".padEnd(52) + base.padEnd(16) + vars.map((v) => v.padEnd(18)).join(""));
for (const f of b) {
  const col = (x) => `${x.cmd}/${x.tmdb}/${x.supaTop}`;
  let s = f.caso.padEnd(52) + col(f).padEnd(16);
  for (const v of vars) {
    const x = V[v].get(f.caso);
    s += x ? `${col(x)}${x.h === f.h ? "" : " ≠"}${x.status === f.status ? "" : " S" + x.status}`.padEnd(18) : "—".padEnd(18);
  }
  console.log(s);
}
console.log("\nDiferencias de hash respecto de", base);
for (const v of vars) {
  const d = b.filter((f) => V[v].get(f.caso)?.h !== f.h).map((f) => f.caso);
  console.log(`${v}: ${d.length} de ${b.length}`); for (const c of d) console.log("   " + c);
}
