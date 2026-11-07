// Mismas consultas sobre cada SHA: ejecución, caché de la ruta y Redis por pedido.
import { writeFileSync } from "node:fs";
const etiqueta = process.argv[2];
const APP = "http://127.0.0.1:3140";
const t = async (p, q = "") => (await fetch(`http://127.0.0.1:${p}/__t${q}`)).json();
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const vaciar = () => fetch("http://127.0.0.1:4813/__banco/reset", { method: "POST" });
const filas = [];
async function medir(caso, url, opts = {}) {
  await t(4804, "?reset"); await t(4805, "?reset");
  const res = await fetch(APP + url, opts);
  const b = await res.text(); await dormir(800);
  const r = await t(4804), m = await t(4805);
  const f = { sha: etiqueta, caso, status: res.status, bytes: b.length, cc: res.headers.get("cache-control"), xnc: res.headers.get("x-nextjs-cache"), comandos: r.comandos, MGET: r.porComando.MGET ?? 0, SET: r.porComando.SET ?? 0, tmdb: m.total };
  filas.push(f);
  console.log(`${etiqueta} ${caso.padEnd(34)} ${f.status} ${String(f.bytes).padStart(6)}B cmd=${String(f.comandos).padEnd(4)} MGET=${String(f.MGET).padEnd(4)} SET=${String(f.SET).padEnd(4)} tmdb=${String(f.tmdb).padEnd(4)} nextcache=${f.xnc} cc=${(f.cc ?? "").slice(0, 34)}`);
}
const PREF = { RSC: "1", "Next-Router-Prefetch": "1" }, NAV = { RSC: "1" };
const q = "?providers=n,d,m";
// Las señales del cuerpo coinciden con las filas del Supabase simulado: el SHA viejo
// usa el cuerpo y el nuevo lee las filas, y así piden lo mismo.
const senales = (base) => [
  ...Array.from({ length: 8 }, (_, i) => ({ tipo: i % 3 === 2 ? "tv" : "movie", id: base + i * 3, peso: i % 2 ? 2 : 3 })),
  ...Array.from({ length: 6 }, (_, i) => ({ tipo: i % 3 === 2 ? "tv" : "movie", id: base + 500 + i * 3, peso: 1 })),
];
const home = (d) => Array.from({ length: 274 }, (_, i) => `movie:${d + i}`);
const reco = (base, ex) => ({ method: "POST", headers: { "content-type": "application/json", authorization: `Bearer banco.${base}.8.6` }, body: JSON.stringify({ senales: senales(base), excluir: ex, providers: ["n", "d", "m"] }) });

await vaciar();
for (const [n, h] of [["documento", {}], ["navegación", NAV], ["precarga", PREF]]) {
  await medir(`titulo ${n} fría`, `/titulo/movie/${n === "documento" ? 71001 : n === "navegación" ? 71002 : 71003}`, { headers: h });
  await medir(`titulo ${n} repetida`, `/titulo/movie/${n === "documento" ? 71001 : n === "navegación" ? 71002 : 71003}`, { headers: h });
  await medir(`persona ${n} fría`, `/persona/${n === "documento" ? 71004 : n === "navegación" ? 71005 : 71006}`, { headers: h });
  await medir(`persona ${n} repetida`, `/persona/${n === "documento" ? 71004 : n === "navegación" ? 71005 : 71006}`, { headers: h });
}
await vaciar(); await medir("api/title fría", `/api/title/movie/20000${q}`); await medir("api/title caliente", `/api/title/movie/20000${q}`);
await vaciar(); await medir("api/title fría sin AR", `/api/title/movie/905000${q}`); await medir("api/title caliente sin AR", `/api/title/movie/905000${q}`);
await vaciar(); await medir("api/person fría", "/api/person/30000?filmografia=v2"); await medir("api/person caliente", "/api/person/30000?filmografia=v2");
await vaciar(); await medir("api/person fría sin AR", "/api/person/906000?filmografia=v2"); await medir("api/person caliente sin AR", "/api/person/906000?filmografia=v2");
await vaciar();
await medir("reco fría", "/api/te-va-a-gustar", reco(10000, home(500000)));
await medir("reco caliente", "/api/te-va-a-gustar", reco(10000, home(500000)));
await medir("reco otro Home", "/api/te-va-a-gustar", reco(10000, home(510000)));
await vaciar(); await medir("reco fría sin AR", "/api/te-va-a-gustar", reco(900000, []));
writeFileSync(new URL(`./sha-${etiqueta}.json`, import.meta.url), JSON.stringify(filas, null, 1));
