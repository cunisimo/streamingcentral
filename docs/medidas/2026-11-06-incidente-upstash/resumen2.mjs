import { readFileSync } from "node:fs";
for (const v of ["produccion","rama","sinDisp","sfTop","sinDisp+sfTop","videos"]) {
  const f = JSON.parse(readFileSync(new URL(`./etapas2-${v}.json`, import.meta.url)));
  const g = {};
  for (const x of f) { const m = x.caso.match(/^(.*) r\d+$/); if (m) (g[m[1]] ??= []).push(x); }
  for (const [n, xs] of Object.entries(g)) {
    const s = (k) => xs.map((x) => x[k]).sort((a, b) => a - b);
    console.log(v.padEnd(14), n.padEnd(30), "cmd", s("cmd").join("/").padEnd(26), "SET", s("SET").join("/").padEnd(24), "tmdb", s("tmdb").join("/").padEnd(24), [...new Set(xs.map((x) => x.h))].join(" "));
  }
}
