// Latencia por flujo: fría, caliente y vencida. Rondas pareadas y orden aleatorio.
// node latencia2.mjs <salida.json> nombre=puerto ...
import { writeFileSync } from "node:fs";
const salida = process.argv[2];
const VAR = process.argv.slice(3).map((x) => x.split("="));
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const vaciar = () => fetch("http://127.0.0.1:4813/__banco/reset", { method: "POST" });
const borrar = (patron) => fetch("http://127.0.0.1:4813/__banco/redis", { method: "POST", body: JSON.stringify({ accion: "borrar", patron }) });
const topCaido = (v) => fetch(`http://127.0.0.1:4802/__top?caido=${v ? 1 : 0}`);
let semilla = 20261107;
const azar = () => { semilla = (semilla * 1664525 + 1013904223) >>> 0; return semilla / 2 ** 32; };
const barajar = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(azar() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const q = "?providers=n,d,m";
const verMasSinAr = Array.from({ length: 24 }, (_, i) => `${(i + 36) % 3 ? "movie" : "tv"}:${900200 + 36 + i}`).join(",");
const F5 = "^(disp|ed):"; const LV = "^(?!pv3:|oficial:|videos:|tmdb:)";
const FLUJOS = [
  ["ficha sin AR", `/api/title/movie/905001${q}`, F5, 25],
  ["ficha con AR", `/api/title/movie/20001${q}`, F5, 20],
  ["ficha mezclada", `/api/title/movie/40001${q}`, F5, 25],
  ["persona sin AR", "/api/person/906001?filmografia=v2", F5, 25],
  ["«Ver más» sin AR", `/api/person/1?filmografia=v2&items=${verMasSinAr}`, F5, 25],
  ["búsqueda", `/api/search?q=accion&${q.replace("?", "&").slice(1)}`, LV, 20],
  ["últimos series", `/api/latest?tipo=tv&${q.slice(1)}`, LV, 15],
  ["categoría", `/api/discover?tipo=movie&genre=accion&${q.slice(1)}`, LV, 20],
  ["mi lista", "/api/cards?items=movie:20001,movie:905001,movie:905002,tv:905003,tv:20003,movie:40001,movie:900041,movie:200041", LV, 20],
  ["Home", `/api/home${q}`, LV, 5],
];
const filas = [];
const pedir = async (p, u) => { const t0 = performance.now(); const x = await fetch(`http://127.0.0.1:${p}${u}`); await x.text(); return [performance.now() - t0, x.status]; };
for (const [n, u, venc, rondas] of FLUJOS) for (const estado of ["fría", "caliente", "vencida"]) {
  const r = Object.fromEntries(VAR.map(([k]) => [k, []])); const est = {};
  for (const [, p] of VAR) { await vaciar(); await pedir(p, u); } // calentamiento del proceso, descartado
  for (let i = 0; i < rondas; i++) for (const [k, p] of barajar(VAR)) {
    await vaciar();
    if (estado !== "fría") { await pedir(p, u); await dormir(150); }
    if (estado === "vencida") await borrar(venc);
    const [ms, s] = await pedir(p, u); r[k].push(ms); if (s !== 200) est[k] = (est[k] ?? 0) + 1;
    await dormir(60);
  }
  filas.push({ n: `${n} · ${estado}`, rondas, r, noOk: est });
  writeFileSync(salida, JSON.stringify(filas));
  console.log(`${n} · ${estado}`, Object.entries(r).map(([k, v]) => `${k}=${Math.round([...v].sort((a, b) => a - b)[v.length >> 1])}`).join(" "), JSON.stringify(est));
}
// Top manual con la base caída: acá la lectura compartida debería notarse.
await topCaido(true);
{
  const u = `/api/title/movie/905002${q}`; const r = Object.fromEntries(VAR.map(([k]) => [k, []]));
  for (let i = 0; i < 8; i++) for (const [k, p] of barajar(VAR)) { await vaciar(); const [ms] = await pedir(p, u); r[k].push(ms); }
  filas.push({ n: "base del Top caída · ficha sin AR fría", rondas: 8, r, noOk: {} });
  const u2 = "/api/person/906001?filmografia=v2"; const r2 = Object.fromEntries(VAR.map(([k]) => [k, []]));
  for (let i = 0; i < 8; i++) for (const [k, p] of barajar(VAR)) { await vaciar(); const [ms] = await pedir(p, u2); r2[k].push(ms); }
  filas.push({ n: "base del Top caída · persona sin AR fría", rondas: 8, r: r2, noOk: {} });
}
await topCaido(false);
writeFileSync(salida, JSON.stringify(filas));
