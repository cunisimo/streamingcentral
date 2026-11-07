// Antes y después del cambio: mismos datos, misma secuencia, con y sin latencia.
// node medir7.mjs <etiqueta> <latencia 0|1>
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const [etiqueta, latencia = "0"] = process.argv.slice(2);
const APP = "http://127.0.0.1:3140";
const t = async (p, q = "") => (await fetch(`http://127.0.0.1:${p}/__t${q}`)).json();
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const vaciar = () => fetch("http://127.0.0.1:4813/__banco/reset", { method: "POST" });
const borrar = (q) => fetch(`http://127.0.0.1:4804/__borrar?${q}`).then((r) => r.json());
const cfg = (p, o) => fetch(`http://127.0.0.1:${p}/__banco/config`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o) });
if (latencia === "1") { await cfg(4811, { latenciaMs: 80, latenciaP95Ms: 250, semilla: 7 }); await cfg(4813, { latenciaMs: 15, latenciaP95Ms: 40, semilla: 7 }); }
else { await cfg(4811, { latenciaMs: 0 }); await cfg(4813, { latenciaMs: 0 }); }
const filas = [];
const resumen = (b) => {
  try {
    const j = JSON.parse(b);
    if (j.person) {
      const d = j.disponibilidad ?? {}; const obras = Object.values(d);
      return { obrasEnBloque: obras.length, conPlataforma: obras.filter((x) => x.length).length, titulos: (j.titles ?? []).length };
    }
    const rel = j.related ?? [];
    return { plataformas: (j.platforms ?? []).join(","), trailer: j.trailer ?? j.trailerKey ?? null, relacionados: rel.length, relConPlataforma: rel.filter((x) => (x.platforms ?? []).length).length };
  } catch { return {}; }
};
async function medir(caso, url) {
  await t(4804, "?reset"); await t(4805, "?reset");
  const t0 = Date.now(); const res = await fetch(APP + url); const b = await res.text(); const ms = Date.now() - t0;
  await dormir(1100);
  const r = await t(4804), m = await t(4805);
  const f = { etiqueta, latencia, caso, status: res.status, ms, viajes: r.http, comandos: r.comandos, MGET: r.porComando.MGET ?? 0, claves: r.clavesMget.reduce((x, y) => x + y, 0), lotes: r.clavesMget.join("+"), SET: r.porComando.SET ?? 0, otros: r.comandos - (r.porComando.MGET ?? 0) - (r.porComando.SET ?? 0), tmdb: m.total, leidas: r.mgetPorPrefijo, escritas: r.setPorPrefijo, hash: createHash("sha256").update(b).digest("hex").slice(0, 12), ...resumen(b) };
  filas.push(f);
  console.log(`${etiqueta} L${latencia} ${caso.padEnd(30)} ${f.status} ${String(ms).padStart(5)}ms viajes=${String(f.viajes).padEnd(4)} cmd=${String(f.comandos).padEnd(4)} MGET=${String(f.MGET).padEnd(3)} claves=${String(f.claves).padEnd(3)} SET=${String(f.SET).padEnd(3)} tmdb=${String(f.tmdb).padEnd(3)} ${f.hash} ${JSON.stringify(resumen(b))}`);
}
const q = "?providers=n,d,m";
const par = async (n, u) => { await vaciar(); await medir(`${n} fría`, u); await medir(`${n} caliente`, u); };
for (const [p, d] of [["p1", 0], ["p2", 1237]]) {
  await par(`title AR ${p}`, `/api/title/movie/${20001 + d}${q}`);
  await par(`title sinAR ${p}`, `/api/title/movie/${905001 + d}${q}`);
  await par(`person AR ${p}`, `/api/person/${30000 + d}?filmografia=v2`);
  await par(`person sinAR ${p}`, `/api/person/${906000 + d}?filmografia=v2`);
}
await par("title serie sinAR", `/api/title/tv/905003${q}`);
await par("person v1 sinAR", "/api/person/906003?providers=n,d,m");
await vaciar();
await medir("title sinAR base", `/api/title/movie/905001${q}`);
await borrar("p=disp,ed");
await medir("title sinAR a los 5 min", `/api/title/movie/905001${q}`);
await borrar("p=disp,ed,pv3,oficial,videos");
await medir("title sinAR a las 8 h", `/api/title/movie/905001${q}`);
await vaciar();
await medir("items sinAR", `/api/person/906000?filmografia=v2&items=${Array.from({ length: 24 }, (_, i) => `movie:${950000 + i}`).join(",")}`);
await medir("control /persona", "/persona/71004");
writeFileSync(new URL(`./fichas-${etiqueta}-L${latencia}.json`, import.meta.url), JSON.stringify(filas, null, 1));
