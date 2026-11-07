// Latencia de la barrera: rondas pareadas y orden aleatorio, con un control rama contra rama.
// node latencia.mjs <salida.json> nombre=puerto nombre=puerto ...
import { writeFileSync } from "node:fs";
const salida = process.argv[2];
const VAR = process.argv.slice(3).map((x) => x.split("="));
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const vaciar = () => fetch("http://127.0.0.1:4813/__banco/reset", { method: "POST" });
const lento = (p, ms) => fetch(`http://127.0.0.1:4805/__lento?p=${encodeURIComponent(p)}&ms=${ms}`);
const limpiar = () => fetch("http://127.0.0.1:4805/__lento?limpiar=1");
const cfg = (p, o) => fetch(`http://127.0.0.1:${p}/__banco/config`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o) });
let semilla = 20261106;
const azar = () => { semilla = (semilla * 1664525 + 1013904223) >>> 0; return semilla / 2 ** 32; };
const barajar = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(azar() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const q = "?providers=n,d,m";
const verMasSinAr = Array.from({ length: 24 }, (_, i) => `${(i + 36) % 3 ? "movie" : "tv"}:${900200 + 36 + i}`).join(",");
const P = (id) => `/movie/${id}/watch/providers`;
const L1 = [40, 120, 10, 30], L2 = [80, 250, 15, 40];
const CASOS = [
  // Carga normal, sin ningún lento.
  { n: "normal · ficha sin AR, fría", u: `/api/title/movie/905001${q}`, r: 40, l: L1 },
  { n: "normal · ficha con AR, fría", u: `/api/title/movie/20001${q}`, r: 40, l: L1 },
  { n: "normal · ficha mezclada, fría", u: `/api/title/movie/40001${q}`, r: 40, l: L1 },
  { n: "normal · persona sin AR, fría", u: "/api/person/906001?filmografia=v2", r: 40, l: L1 },
  { n: "normal · «Ver más» sin AR, fría", u: `/api/person/1?filmografia=v2&items=${verMasSinAr}`, r: 40, l: L1 },
  { n: "normal · ficha sin AR, caliente", u: `/api/title/movie/905001${q}`, r: 40, l: L1, caliente: true },
  { n: "normal, TMDB más lento · ficha sin AR, fría", u: `/api/title/movie/905001${q}`, r: 25, l: L2 },
  { n: "normal, TMDB más lento · persona sin AR, fría", u: "/api/person/906001?filmografia=v2", r: 25, l: L2 },
  // Los casos del informe anterior.
  { n: "lento +3 s · ficha sin AR", u: `/api/title/movie/905001${q}`, r: 20, l: L1, lento: [P(900040), 3000] },
  { n: "lento +3 s · ficha con AR", u: `/api/title/movie/20001${q}`, r: 20, l: L1, lento: [P(200040), 3000] },
  { n: "lento +3 s · persona sin AR", u: "/api/person/906001?filmografia=v2", r: 20, l: L1, lento: [P(900201), 3000] },
  { n: "colgado · ficha sin AR", u: `/api/title/movie/905001${q}`, r: 12, l: L1, lento: [P(900040), 20000] },
  { n: "colgado · persona sin AR", u: "/api/person/906001?filmografia=v2", r: 12, l: L1, lento: [P(900201), 20000] },
];
const filas = [];
for (const c of CASOS) {
  await cfg(4811, { latenciaMs: c.l[0], latenciaP95Ms: c.l[1], semilla: 7 }); await cfg(4813, { latenciaMs: c.l[2], latenciaP95Ms: c.l[3], semilla: 7 });
  await limpiar();
  // Tres rondas de calentamiento, descartadas.
  for (let i = 0; i < 3; i++) for (const [, p] of VAR) { await vaciar(); await (await fetch(`http://127.0.0.1:${p}${c.u}`)).text(); }
  const r = Object.fromEntries(VAR.map(([n]) => [n, []])); const est = {};
  for (let i = 0; i < c.r; i++) {
    for (const [n, p] of barajar(VAR)) {
      await limpiar(); await vaciar();
      if (c.caliente) { await (await fetch(`http://127.0.0.1:${p}${c.u}`)).text(); await dormir(100); }
      if (c.lento) await lento(c.lento[0], c.lento[1]);
      const t0 = performance.now(); const x = await fetch(`http://127.0.0.1:${p}${c.u}`); const b = await x.text(); r[n].push(performance.now() - t0);
      if (x.status !== 200) est[n] = (est[n] ?? 0) + 1; void b;
      await dormir(80);
    }
  }
  await limpiar();
  filas.push({ n: c.n, rondas: c.r, r, noOk: est });
  writeFileSync(salida, JSON.stringify(filas));
  console.log(c.n, Object.entries(r).map(([n, v]) => `${n}=${Math.round([...v].sort((a, b) => a - b)[v.length >> 1])}`).join(" "), JSON.stringify(est));
}
