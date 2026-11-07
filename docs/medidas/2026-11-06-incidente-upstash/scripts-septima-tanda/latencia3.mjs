// Repetición enfocada: persona y «Ver más» en frío, con controles A/A de las DOS versiones.
// node latencia3.mjs <salida.json> nombre=puerto ...
import { writeFileSync } from "node:fs";
const salida = process.argv[2];
const VAR = process.argv.slice(3).map((x) => x.split("="));
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const vaciar = () => fetch("http://127.0.0.1:4813/__banco/reset", { method: "POST" });
const cfg = (p, o) => fetch(`http://127.0.0.1:${p}/__banco/config`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o) });
let semilla = 20261107;
const azar = () => { semilla = (semilla * 1664525 + 1013904223) >>> 0; return semilla / 2 ** 32; };
const barajar = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(azar() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const verMasSinAr = Array.from({ length: 24 }, (_, i) => `${(i + 36) % 3 ? "movie" : "tv"}:${900200 + 36 + i}`).join(",");
const L1 = [40, 120, 10, 30], L2 = [80, 250, 15, 40];
const CASOS = [
  { n: "persona sin AR, fría", u: "/api/person/906001?filmografia=v2", r: 80, l: L1 },
  { n: "persona sin AR, fría, TMDB más lento", u: "/api/person/906001?filmografia=v2", r: 60, l: L2 },
  { n: "«Ver más» sin AR, fría", u: `/api/person/1?filmografia=v2&items=${verMasSinAr}`, r: 80, l: L1 },
];
const filas = [];
for (const c of CASOS) {
  await cfg(4811, { latenciaMs: c.l[0], latenciaP95Ms: c.l[1], semilla: 11 }); await cfg(4813, { latenciaMs: c.l[2], latenciaP95Ms: c.l[3], semilla: 11 });
  for (let i = 0; i < 3; i++) for (const [, p] of VAR) { await vaciar(); await (await fetch(`http://127.0.0.1:${p}${c.u}`)).text(); }
  const r = Object.fromEntries(VAR.map(([n]) => [n, []])); const est = {};
  for (let i = 0; i < c.r; i++) {
    for (const [n, p] of barajar(VAR)) {
      await vaciar();
      const t0 = performance.now(); const x = await fetch(`http://127.0.0.1:${p}${c.u}`); await x.text(); r[n].push(performance.now() - t0);
      if (x.status !== 200) est[n] = (est[n] ?? 0) + 1;
      await dormir(80);
    }
  }
  filas.push({ n: c.n, rondas: c.r, r, noOk: est });
  writeFileSync(salida, JSON.stringify(filas));
  console.log(c.n, Object.entries(r).map(([n, v]) => `${n}=${Math.round([...v].sort((a, b) => a - b)[v.length >> 1])}`).join(" "), JSON.stringify(est));
}
