// Costo en frío con TMDB disperso: ¿la barrera sigue aportando si los proveedores vuelven muy separados?
// node disperso.mjs <etiqueta> <puerto>
import { writeFileSync } from "node:fs";
const et = process.argv[2], P = process.argv[3];
const t = async (p, q = "") => (await fetch(`http://127.0.0.1:${p}/__t${q}`)).json();
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const vaciar = () => fetch("http://127.0.0.1:4813/__banco/reset", { method: "POST" });
const cfg = (p, o) => fetch(`http://127.0.0.1:${p}/__banco/config`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o) });
const q = "?providers=n,d,m";
const verMas = Array.from({ length: 24 }, (_, i) => `${(i + 36) % 3 ? "movie" : "tv"}:${900200 + 36 + i}`).join(",");
const CASOS = [["ficha sin AR", `/api/title/movie/905001${q}`], ["ficha mezclada", `/api/title/movie/40001${q}`], ["persona sin AR", "/api/person/906001?filmografia=v2"], ["Ver más sin AR", `/api/person/1?filmografia=v2&items=${verMas}`]];
const filas = [];
for (const [n, med, p95] of [["TMDB 40/120", 40, 120], ["TMDB 80/250", 80, 250], ["TMDB 150/900", 150, 900]]) {
  await cfg(4811, { latenciaMs: med, latenciaP95Ms: p95, semilla: 7 });
  for (const [c, u] of CASOS) {
    const res = [];
    for (let i = 0; i < 7; i++) {
      await vaciar(); await t(4804, "?reset"); await t(4805, "?reset");
      const t0 = performance.now(); await (await fetch(`http://127.0.0.1:${P}${u}`)).text(); const ms = performance.now() - t0;
      await dormir(1000);
      const r = await t(4804), m = await t(4805);
      res.push({ cmd: r.comandos, MGET: r.porComando.MGET ?? 0, SET: r.porComando.SET ?? 0, tmdb: m.total, ms });
    }
    const med2 = (k) => [...res.map((x) => x[k])].sort((a, b) => a - b)[3];
    const f = { et, n, c, cmd: med2("cmd"), MGET: med2("MGET"), SET: med2("SET"), tmdb: med2("tmdb"), ms: Math.round(med2("ms")), rango: [Math.min(...res.map((x) => x.cmd)), Math.max(...res.map((x) => x.cmd))] };
    filas.push(f);
    console.log(`${et.padEnd(13)} ${n.padEnd(13)} ${c.padEnd(15)} cmd=${f.cmd} (${f.rango.join("–")}) MGET=${f.MGET} SET=${f.SET} tmdb=${f.tmdb} ${f.ms}ms`);
  }
}
writeFileSync(new URL(`./disperso-${et}.json`, import.meta.url), JSON.stringify(filas, null, 1));
