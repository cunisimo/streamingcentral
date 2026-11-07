// Varias solicitudes al mismo título con caché fría: un proceso y varias instancias. node simult.mjs <etiqueta> <puertos,coma>
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const et = process.argv[2]; const PUERTOS = process.argv[3].split(",");
const t = async (p, q = "") => (await fetch(`http://127.0.0.1:${p}/__t${q}`)).json();
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const vaciar = () => fetch("http://127.0.0.1:4813/__banco/reset", { method: "POST" });
const canon = (v) => Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v;
const q = "?providers=n,d,m";
const pedir = async (u, p) => { const r = await fetch(`http://127.0.0.1:${p}${u}`); return createHash("sha256").update(JSON.stringify(canon(await r.json()))).digest("hex").slice(0, 8); };
const CASOS = [["ficha sin AR", `/api/title/movie/905001${q}`], ["ficha con AR", `/api/title/movie/20001${q}`], ["ficha mezclada", `/api/title/movie/40001${q}`], ["persona sin AR", "/api/person/906001?filmografia=v2"], ["persona con AR", "/api/person/30000?filmografia=v2"]];
const filas = [];
for (const [n, u] of CASOS) {
  for (const [modo, puertos] of [["5 en un proceso", Array(5).fill(PUERTOS[0])], ["6 en 3 instancias", [...PUERTOS, ...PUERTOS]]]) {
    const res = [];
    for (let i = 0; i < 5; i++) {
      await vaciar(); await t(4804, "?reset"); await t(4805, "?reset");
      const t0 = performance.now();
      const h = await Promise.all(puertos.map((p) => pedir(u, p)));
      const ms = performance.now() - t0; await dormir(600);
      const r = await t(4804), m = await t(4805);
      res.push({ cmd: r.comandos, MGET: r.porComando.MGET ?? 0, SET: r.porComando.SET ?? 0, tmdb: m.total, ms: Math.round(ms), h: [...new Set(h)] });
    }
    const med = (k) => [...res.map((x) => x[k])].sort((a, b) => a - b)[2];
    const f = { et, n, modo, cmd: med("cmd"), MGET: med("MGET"), SET: med("SET"), tmdb: med("tmdb"), ms: med("ms"), rangoCmd: [Math.min(...res.map((x) => x.cmd)), Math.max(...res.map((x) => x.cmd))], h: [...new Set(res.flatMap((x) => x.h))] };
    filas.push(f);
    console.log(`${et.padEnd(12)} ${n.padEnd(16)} ${modo.padEnd(18)} cmd=${f.cmd} (${f.rangoCmd.join("–")}) MGET=${f.MGET} SET=${f.SET} tmdb=${f.tmdb} ${f.ms}ms ${f.h.join("+")}`);
  }
}
writeFileSync(new URL(`./simult-${et}.json`, import.meta.url), JSON.stringify(filas, null, 1));
