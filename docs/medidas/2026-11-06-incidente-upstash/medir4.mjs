// Costo por solicitud, con cada caso frío sobre un Redis VACÍO. Dos pasadas con ids
// distintos: tienen que coincidir. Corrige medir3, donde los ids se pisaban (8.b).
import { writeFileSync } from "node:fs";
const APP = "http://127.0.0.1:3140";
const t = async (p, q = "") => (await fetch(`http://127.0.0.1:${p}/__t${q}`)).json();
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const borrar = (q) => fetch(`http://127.0.0.1:4804/__borrar?${q}`).then((r) => r.json());
const vaciar = () => fetch("http://127.0.0.1:4813/__banco/reset", { method: "POST" });
const filas = [];
async function medir(nombre, url, opts = {}) {
  await t(4804, "?reset"); await t(4805, "?reset");
  const res = await fetch(APP + url, opts);
  const b = await res.text();
  await dormir(900);
  const r = await t(4804), m = await t(4805);
  let items = null; try { items = JSON.parse(b).items?.length ?? null; } catch {}
  const f = { caso: nombre, status: res.status, http: r.http, comandos: r.comandos, MGET: r.porComando.MGET ?? 0, claves: r.clavesMget.reduce((x, y) => x + y, 0), SET: r.porComando.SET ?? 0, otros: Object.entries(r.porComando).filter(([k]) => !["MGET", "SET"].includes(k)).map(([k, v]) => `${k}:${v}`).join(","), rechazados: r.rechazadosComandos, tmdb: m.total, items, setPor: r.setPorPrefijo };
  filas.push(f);
  console.log(`${nombre.padEnd(44)} ${res.status} cmd=${String(f.comandos).padEnd(5)} MGET=${String(f.MGET).padEnd(4)} claves=${String(f.claves).padEnd(5)} SET=${String(f.SET).padEnd(4)} ${f.otros.padEnd(8)} rech=${String(f.rechazados).padEnd(5)} tmdb=${String(f.tmdb).padEnd(4)} items=${items} ${JSON.stringify(f.setPor)}`);
  return f;
}
const reco = (token, providers = ["n", "d", "m"]) => ({ method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ senales: [], excluir: [], providers }) });
const q = "?providers=n,d,m";
const par = async (nombre, url, opts) => { await vaciar(); await medir(`${nombre} FRÍA`, url, opts); await medir(`${nombre} CALIENTE`, url, opts); };

for (const [p, d] of [["p1", 0], ["p2", 1237]]) {
  console.log(`\n--- ${p}: con plataforma AR`);
  await par(`reco ${p}`, "/api/te-va-a-gustar", reco(`banco.${10000 + d}.8.6`));
  await par(`title ${p}`, `/api/title/movie/${20000 + d}${q}`);
  await par(`person ${p}`, `/api/person/${30000 + d}?filmografia=v2`);
  console.log(`--- ${p}: sin plataforma AR`);
  await par(`reco sinAR ${p}`, "/api/te-va-a-gustar", reco(`banco.${900000 + d}.8.6`));
  await par(`title sinAR ${p}`, `/api/title/movie/${905000 + d}${q}`);
  await par(`person sinAR ${p}`, `/api/person/${906000 + d}?filmografia=v2`);
}

console.log("\n--- reco, parcialmente caliente (perfil banco.10000.8.6)");
const A = "banco.10000.8.6";
await vaciar();
await medir("reco base", "/api/te-va-a-gustar", reco(A));
await medir("reco voto nuevo", "/api/te-va-a-gustar", reco("banco.10000.8.6.1"));
await medir("reco otras plataformas", "/api/te-va-a-gustar", reco(A, ["n"]));
const RIEL = "^reco:(?!mismo|cruce|perfil)";
await borrar(`re=${encodeURIComponent(RIEL)}`);
await medir("reco a las 6 h (vence el riel)", "/api/te-va-a-gustar", reco(A));
await borrar(`re=${encodeURIComponent(RIEL)}&p=pv3,disp,oficial,ed`);
await medir("reco a las 8 h (+ pv3, disp, oficial)", "/api/te-va-a-gustar", reco(A));

console.log("\n--- controles");
await medir("reco sin sesión", "/api/te-va-a-gustar", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
await vaciar();
await medir("reco perfil sin señales", "/api/te-va-a-gustar", reco("banco.40000.0.0"));

console.log("\n--- cuota agotada (aparte)");
await vaciar();
await fetch("http://127.0.0.1:4804/__agotada?v=1");
await medir("agotada reco", "/api/te-va-a-gustar", reco(A));
await medir("agotada title", `/api/title/movie/20000${q}`);
await medir("agotada person", "/api/person/30000?filmografia=v2");
await fetch("http://127.0.0.1:4804/__agotada?v=0");
writeFileSync(new URL("./resultados4.json", import.meta.url), JSON.stringify(filas, null, 1));
