// Costo en frío con cada título volviendo de TMDB en un momento distinto, a propósito. node escalonado.mjs <etiqueta> <puerto>
const et = process.argv[2], P = process.argv[3];
const t = async (p, q = "") => (await fetch(`http://127.0.0.1:${p}/__t${q}`)).json();
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const vaciar = () => fetch("http://127.0.0.1:4813/__banco/reset", { method: "POST" });
const lento = (p, ms) => fetch(`http://127.0.0.1:4805/__lento?p=${encodeURIComponent(p)}&ms=${ms}`);
const limpiar = () => fetch("http://127.0.0.1:4805/__lento?limpiar=1");
const obras = Array.from({ length: 24 }, (_, i) => [(i + 36) % 3 ? "movie" : "tv", 900200 + 36 + i]);
const u = `/api/person/1?filmografia=v2&items=${obras.map(([a, b]) => `${a}:${b}`).join(",")}`;
const res = [];
for (let r = 0; r < 5; r++) {
  await limpiar(); await vaciar(); await t(4804, "?reset"); await t(4805, "?reset");
  for (let i = 0; i < obras.length; i++) await lento(`/${obras[i][0]}/${obras[i][1]}/watch/providers`, 60 * (i + 1));
  const t0 = performance.now(); await (await fetch(`http://127.0.0.1:${P}${u}`)).text(); const ms = performance.now() - t0;
  await dormir(2000);
  const rd = await t(4804), m = await t(4805);
  res.push({ cmd: rd.comandos, MGET: rd.porComando.MGET ?? 0, SET: rd.porComando.SET ?? 0, tmdb: m.total, ms: Math.round(ms) });
}
await limpiar();
console.log(et.padEnd(14), JSON.stringify(res[2]), "rango cmd", Math.min(...res.map((x) => x.cmd)), Math.max(...res.map((x) => x.cmd)), "ms", res.map((x) => x.ms).sort((a, b) => a - b)[2]);
