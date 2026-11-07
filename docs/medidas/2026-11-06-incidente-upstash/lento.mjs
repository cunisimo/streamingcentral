// ¿La barrera hace que un proveedor lento demore la tanda? node lento.mjs <etiqueta>
import { writeFileSync } from "node:fs";
const et = process.argv[2];
const APP = "http://127.0.0.1:3140";
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const vaciar = () => fetch("http://127.0.0.1:4813/__banco/reset", { method: "POST" });
const lento = (p, ms) => fetch(`http://127.0.0.1:4805/__lento?p=${encodeURIComponent(p)}&ms=${ms}`);
const limpiar = () => fetch("http://127.0.0.1:4805/__lento?limpiar=1");
const q = "?providers=n,d,m";
const filas = [];
async function caso(n, u, p, ms) {
  const tiempos = []; let resumen; let golpes = 0;
  for (let i = 0; i < 3; i++) {
    await vaciar(); await limpiar(); await fetch("http://127.0.0.1:4805/__t?reset"); if (p) await lento(p, ms);
    const t0 = Date.now(); const r = await fetch(APP + u); const b = await r.text(); tiempos.push(Date.now() - t0);
    const j = JSON.parse(b);
    const m = await (await fetch("http://127.0.0.1:4805/__t")).json();
    golpes = p ? m.llamadas.filter((c) => c.p === p).length : 0;
    resumen = { status: r.status, rel: j.related?.length, degr: j.degradacion ?? null, disp: j.disponibilidad ? Object.keys(j.disponibilidad).length : null, sinDisp: j.sinDisponibilidad?.length ?? null, golpes };
    await dormir(400);
  }
  tiempos.sort((a, b) => a - b);
  filas.push({ et, n, mediana: tiempos[1], tiempos, ...resumen });
  console.log(`${et.padEnd(10)} ${n.padEnd(44)} mediana=${String(tiempos[1]).padStart(6)}ms [${tiempos.join(",")}] ${JSON.stringify(resumen)}`);
}
const P = (id) => `/movie/${id}/watch/providers`;
await caso("ficha sin AR, sin lentos", `/api/title/movie/905001${q}`);
await caso("ficha sin AR, 1 proveedor +3 s", `/api/title/movie/905001${q}`, P(900040), 3000);
await caso("ficha con AR, sin lentos", `/api/title/movie/20001${q}`);
await caso("ficha con AR, 1 proveedor +3 s", `/api/title/movie/20001${q}`, P(200040), 3000);
await caso("persona sin AR, sin lentos", "/api/person/906001?filmografia=v2");
await caso("persona sin AR, 1 proveedor +3 s", "/api/person/906001?filmografia=v2", P(900201), 3000);
await caso("ficha sin AR, 1 proveedor colgado +20 s", `/api/title/movie/905001${q}`, P(900040), 20000);
await caso("persona sin AR, 1 proveedor colgado +20 s", "/api/person/906001?filmografia=v2", P(900201), 20000);
await limpiar();
writeFileSync(new URL(`./lento-${et}.json`, import.meta.url), JSON.stringify(filas, null, 1));
