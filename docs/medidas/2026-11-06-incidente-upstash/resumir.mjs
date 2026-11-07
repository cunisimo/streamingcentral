import { readFileSync } from "node:fs";
const shas = ["915ef2e", "ca02c4f", "e8929e5", "dffd1d7"];
const f = Object.fromEntries(shas.map((s) => [s, JSON.parse(readFileSync(new URL(`./sha-${s}.json`, import.meta.url), "utf8"))]));
console.log("caso".padEnd(32), shas.map((s) => s.padEnd(19)).join(""));
for (let i = 0; i < f[shas[0]].length; i++) {
  console.log(f[shas[0]][i].caso.padEnd(32), shas.map((s) => { const x = f[s][i]; return `${x.status} c${x.comandos} t${x.tmdb} ${x.bytes}B`.padEnd(19); }).join(""));
}
console.log("\ncache-control:", [...new Set(shas.flatMap((s) => f[s].map((x) => `${x.cc}|${x.xnc}`)))].join("  ||  "));
const nav = readFileSync(new URL("./nav.jsonl", import.meta.url), "utf8").trim().split("\n").map(JSON.parse);
const grupos = {};
for (const n of nav) { const k = `${n.sha} ${n.ancho}`; (grupos[k] ??= []).push(n); }
console.log("\nNAVEGACIÓN (6 pasos)");
for (const [k, g] of Object.entries(grupos)) {
  const c = {}; let e = 0, cmd = 0, t = 0;
  for (const n of g) { e += n.ejecuciones; cmd += n.comandos; t += n.tmdb; for (const [r, v] of Object.entries(n.porRuta)) c[r] = (c[r] ?? 0) + v; }
  console.log(k.padEnd(26), `ejec=${e} cmd=${cmd} tmdb=${t}`, JSON.stringify(c));
}
