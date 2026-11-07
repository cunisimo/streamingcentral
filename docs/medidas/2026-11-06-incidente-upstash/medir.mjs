// Mide cada ruta contra el banco. Salida en JSON y en una tabla.
import { writeFileSync } from "node:fs";
const APP = "http://127.0.0.1:3140";
const t = async (p, q = "") => (await fetch(`http://127.0.0.1:${p}/__t${q}`)).json();
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const filas = [];
async function medir(nombre, url, headers = {}) {
  await t(4804, "?reset"); await t(4805, "?reset");
  const t0 = Date.now();
  const res = await fetch(APP + url, { headers, redirect: "manual" });
  const cuerpo = await res.text();
  await dormir(700); // escrituras y flush que terminan después de responder
  const r = await t(4804); const m = await t(4805);
  const f = {
    caso: nombre, status: res.status, bytes: cuerpo.length, ms: Date.now() - t0 - 700,
    http: r.http, comandos: r.comandos, GET: r.porComando.GET ?? 0, MGET: r.porComando.MGET ?? 0, clavesMget: r.clavesMget.reduce((a, b) => a + b, 0), lotes: r.clavesMget.join("+"),
    SET: r.porComando.SET ?? 0, otros: Object.entries(r.porComando).filter(([k]) => !["GET", "MGET", "SET"].includes(k)).map(([k, v]) => `${k}:${v}`).join(","),
    setPor: JSON.stringify(r.setPorPrefijo), rechazadosHttp: r.rechazadosHttp, rechazadosCmd: r.rechazadosComandos, rechazadosPor: JSON.stringify(r.porComandoRechazado), tmdb: m.total, cc: res.headers.get("cache-control"),
  };
  filas.push(f);
  console.log(`${nombre.padEnd(52)} ${String(res.status).padEnd(4)} http=${String(f.http).padEnd(3)} cmd=${String(f.comandos).padEnd(4)} GET=${String(f.GET).padEnd(3)} MGET=${String(f.MGET).padEnd(3)}[${f.lotes}] SET=${String(f.SET).padEnd(3)} ${f.otros} tmdb=${String(f.tmdb).padEnd(3)} rech=${f.rechazadosCmd} ${f.setPor}`);
  return f;
}
const PREF = { RSC: "1", "Next-Router-Prefetch": "1" };
const NAV = { RSC: "1" };
const borrar = async (p) => (await fetch(`http://127.0.0.1:4804/__borrar?p=${p}`)).json();

console.log("\n--- control: dos rutas que no deberían tocar Redis ni TMDB");
await medir("control /top (estática)", "/top");

console.log("\n--- /titulo: HTML (generateMetadata), títulos CON proveedor AR");
await medir("titulo HTML frío A", "/titulo/movie/1001");
await medir("titulo HTML repetido A", "/titulo/movie/1001");
await medir("titulo HTML frío B", "/titulo/movie/1002");
await medir("titulo HTML frío C (serie)", "/titulo/tv/1003");
console.log("\n--- /titulo: variantes RSC");
await medir("titulo prefetch frío", "/titulo/movie/1004", PREF);
await medir("titulo prefetch repetido", "/titulo/movie/1004", PREF);
await medir("titulo navegación RSC fría", "/titulo/movie/1005", NAV);
console.log("\n--- /titulo: SIN proveedor AR (disp/oficial)");
await medir("titulo HTML frío sin AR", "/titulo/movie/900001");
await medir("titulo HTML repetido sin AR", "/titulo/movie/900001");

console.log("\n--- /persona: página (sin datos en el servidor)");
await medir("persona HTML fría", "/persona/5001");
await medir("persona HTML repetida", "/persona/5001");
await medir("persona prefetch", "/persona/5002", PREF);
await medir("persona navegación RSC", "/persona/5003", NAV);

console.log("\n--- /api/title");
const prov = "?providers=n,d,m";
await medir("api/title fría A (relacionados fríos)", `/api/title/movie/2001${prov}`);
await medir("api/title repetida A", `/api/title/movie/2001${prov}`);
await medir("api/title fría B (otros relacionados)", `/api/title/movie/2600${prov}`);
await medir("api/title después de titulo HTML (mismo id)", `/api/title/movie/1002${prov}`);
await medir("api/title fría sin AR", `/api/title/movie/900700${prov}`);
await medir("api/title repetida sin AR", `/api/title/movie/900700${prov}`);
await borrar("disp,ed");
await medir("api/title sin AR, a los 5 min (vence disp, ed)", `/api/title/movie/900700${prov}`);
await borrar("disp,ed,pv3,oficial,videos");
await medir("api/title sin AR, a las 8 h (vence pv3, oficial)", `/api/title/movie/900700${prov}`);
await borrar("ed,pv3,oficial,videos");
await medir("api/title con AR, a las 8 h (vence pv3, videos)", `/api/title/movie/2001${prov}`);

console.log("\n--- /api/person");
await medir("api/person v2 fría", "/api/person/6001?filmografia=v2");
await medir("api/person v2 repetida", "/api/person/6001?filmografia=v2");
await medir("api/person v2 fría B", "/api/person/6002?filmografia=v2");
await medir("api/person v2 fría sin AR", "/api/person/900900?filmografia=v2");
await medir("api/person v2 repetida sin AR", "/api/person/900900?filmografia=v2");
await medir("api/person v1 fría (Android viejo)", "/api/person/6003?providers=n,d,m");
await medir("api/person v1 repetida", "/api/person/6003?providers=n,d,m");

console.log("\n--- otras");
await medir("api/health", "/api/health");

console.log("\n--- CUOTA AGOTADA (aparte)");
await fetch("http://127.0.0.1:4804/__agotada?v=1");
await medir("agotada: titulo HTML frío", "/titulo/movie/3001");
await medir("agotada: titulo prefetch", "/titulo/movie/3002", PREF);
await medir("agotada: persona HTML", "/persona/5004");
await medir("agotada: api/title ya cacheada antes", `/api/title/movie/2001${prov}`);
await medir("agotada: api/title nueva", `/api/title/movie/3003${prov}`);
await medir("agotada: api/person v2", "/api/person/6001?filmografia=v2");
await fetch("http://127.0.0.1:4804/__agotada?v=0");
await medir("control: vuelve el Redis, api/title 3003", `/api/title/movie/3003${prov}`);

writeFileSync(process.argv[2] ?? "resultados.json", JSON.stringify(filas, null, 1));
