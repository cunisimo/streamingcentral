// Costo y contenido por flujo. node flujos.mjs <etiqueta> [puerto]
import { writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
const et = process.argv[2]; const PUERTO = process.argv[3] ?? "3140";
const APP = `http://127.0.0.1:${PUERTO}`;
const DIR = new URL(`./resp/${et}/`, import.meta.url); mkdirSync(DIR, { recursive: true });
const t = async (p, q = "") => (await fetch(`http://127.0.0.1:${p}/__t${q}`)).json();
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const vaciar = () => fetch("http://127.0.0.1:4813/__banco/reset", { method: "POST" });
const borrar = (patron) => fetch("http://127.0.0.1:4813/__banco/redis", { method: "POST", body: JSON.stringify({ accion: "borrar", patron }) });
const falla = (re, status = 500) => fetch(`http://127.0.0.1:4805/__falla?re=${encodeURIComponent(re)}&status=${status}`);
const sinFallas = () => fetch("http://127.0.0.1:4805/__falla?limpiar=1");
const top = (filas) => fetch(`http://127.0.0.1:4802/__top?filas=${encodeURIComponent(JSON.stringify(filas))}`);
const topCaido = (v) => fetch(`http://127.0.0.1:4802/__top?caido=${v ? 1 : 0}`);
const canon = (v) => Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v;
const q = "providers=n,d,m";
const filas = [];
const archivo = (s) => s.replace(/[^a-zA-Z0-9]+/g, "_");
async function medir(caso, urls) {
  await t(4804, "?reset"); await t(4805, "?reset"); await fetch("http://127.0.0.1:4802/__sb?reset");
  const t0 = performance.now(); let ultimo, status;
  for (const u of urls) { const r = await fetch(APP + u); ultimo = await r.text(); status = r.status; }
  const ms = performance.now() - t0;
  await dormir(700);
  const r = await t(4804), m = await t(4805), s = await (await fetch("http://127.0.0.1:4802/__sb")).json();
  let j = null; try { j = JSON.parse(ultimo); } catch {}
  const texto = JSON.stringify(canon(j), null, 0);
  writeFileSync(new URL(`${archivo(caso)}.json`, DIR), texto ?? "null");
  const lotes = r.clavesMget;
  const f = { et, caso, status, ms: Math.round(ms), cmd: r.comandos, MGET: r.porComando.MGET ?? 0, SET: r.porComando.SET ?? 0, claves: lotes.reduce((a, b) => a + b, 0), loteMax: lotes.length ? Math.max(...lotes) : 0, tmdb: m.total, supabase: s.total, supaTop: s.top, setPref: r.setPorPrefijo, h: createHash("sha256").update(texto ?? "").digest("hex").slice(0, 10) };
  filas.push(f);
  console.log(`${et.padEnd(10)} ${caso.padEnd(50)} ${status} cmd=${String(f.cmd).padEnd(4)} MGET=${String(f.MGET).padEnd(4)} SET=${String(f.SET).padEnd(4)} cl=${String(f.claves).padEnd(4)} max=${String(f.loteMax).padEnd(3)} tmdb=${String(f.tmdb).padEnd(4)} sb=${f.supabase}/${f.supaTop} ${f.ms}ms ${f.h}`);
  return j;
}
const FICHA_5MIN = "^(disp|ed):";
const LISTA_VENCIDA = "^(?!pv3:|oficial:|videos:|tmdb:)"; // venció el listado; siguen vivas las cachés de 8 h
async function tres(n, urls, vencida = FICHA_5MIN, reps = 1) {
  await vaciar(); const j = await medir(`${n} · fría`, urls);
  await medir(`${n} · caliente`, urls);
  await borrar(vencida); await medir(`${n} · vencida`, urls);
  void reps; return j;
}
const ficha = (tipo, id) => [`/titulo/${tipo}/${id}`, `/api/title/${tipo}/${id}?${q}`];
const persona = (id) => [`/persona/${id}`, "/api/providers", `/api/person/${id}?filmografia=v2`];
const siguientes = (j, desde, n = 24) => [...(j.direccion ?? []), ...(j.actuacion ?? [])].map((o) => `${o.type}:${o.id}`).filter((k) => !(k in (j.disponibilidad ?? {}))).slice(desde, desde + n);
const verMas = (claves) => [`/api/person/1?filmografia=v2&items=${claves.join(",")}`];

// --- Fichas de título
await tres("ficha con AR", ficha("movie", 20001));
await tres("ficha con AR sin tráiler", ficha("movie", 20002));
await tres("ficha serie con AR", ficha("tv", 20003));
await tres("ficha sin AR con evidencia", ficha("movie", 905001));
await tres("ficha sin AR sin evidencia ni tráiler", ficha("movie", 905002));
await tres("ficha serie sin AR", ficha("tv", 905003));
await tres("ficha mezclada", ficha("movie", 40001));
// --- Personas y «Ver más»
for (const [n, id] of [["persona con AR", 30000], ["persona sin AR", 906001], ["persona mezclada", 41001]]) {
  const j = await tres(n, persona(id));
  await vaciar(); const a = await medir(`${n} · abrir, para Ver más`, persona(id));
  const c1 = siguientes(a, 0), c2 = siguientes(a, 24);
  await medir(`${n} · Ver más 1, fresco`, verMas(c1));
  await medir(`${n} · Ver más 2, fresco`, verMas(c2));
  await medir(`${n} · Ver más 1, repetido`, verMas(c1));
  await vaciar(); await medir(`${n} · abrir, para vencer`, persona(id)); await borrar(FICHA_5MIN);
  await medir(`${n} · Ver más 1, 5 min vencidos`, verMas(c1));
  void j;
}
await tres("persona v1 sin AR", [`/api/person/906001?${q}`]);
// --- Búsqueda y listas
await tres("búsqueda", [`/api/search?q=accion&${q}`], LISTA_VENCIDA);
await tres("lista últimos películas p1", [`/api/latest?tipo=movie&${q}`], LISTA_VENCIDA);
await tres("lista últimos películas p2", [`/api/latest?tipo=movie&page=2&${q}`], LISTA_VENCIDA);
await tres("lista últimos series p1", [`/api/latest?tipo=tv&${q}`], LISTA_VENCIDA);
await tres("lista miniseries p1", [`/api/miniseries?${q}`], LISTA_VENCIDA);
await tres("lista miniseries p2", [`/api/miniseries?page=2&${q}`], LISTA_VENCIDA);
await tres("categoría", [`/api/discover?tipo=movie&genre=accion&${q}`], LISTA_VENCIDA);
await tres("audiencia familia", [`/api/audience?a=family&${q}`], LISTA_VENCIDA);
const MI_LISTA = ["movie:20001", "movie:905001", "movie:905002", "tv:905003", "tv:20003", "movie:40001", "movie:900041", "movie:200041"].join(",");
await tres("mi lista (cards)", [`/api/cards?items=${MI_LISTA}`], LISTA_VENCIDA);
// --- Home
await tres("Home", [`/api/home?${q}`], LISTA_VENCIDA);
// --- Fallo parcial de TMDB y recuperación
async function fallo(n, urls, re, status = 500) {
  await vaciar(); await falla(re, status); await medir(`${n} · con fallo`, urls);
  await sinFallas(); if (status === 429) await dormir(6500);
  await medir(`${n} · recuperado`, urls);
}
await fallo("fallo proveedores relacionados", ficha("movie", 905001), "^/movie/90004[15]/watch/providers$");
await fallo("fallo oficial relacionados", ficha("movie", 905001), "^/movie/90004[26]$");
await fallo("fallo tráiler", ficha("movie", 905001), "^/movie/905001/videos$");
await fallo("fallo proveedores persona", persona(906001), "/90020[12]/watch/providers$");
await fallo("fallo oficial persona", persona(906001), "^/(movie|tv)/90020[45]$");
await fallo("fallo proveedores búsqueda", [`/api/search?q=accion&${q}`], "/\\d*7/watch/providers$");
await fallo("fallo proveedores últimos series", [`/api/latest?tipo=tv&${q}`], "/\\d*7/watch/providers$");
await fallo("fallo proveedores Home", [`/api/home?${q}`], "/\\d*7/watch/providers$");
await fallo("429 parcial ficha", ficha("movie", 905001), "^/movie/90004[15]/watch/providers$", 429);
await dormir(6500);
// --- Top manual: frescura y caída
const FILAS = [{ plataforma: "n", captured_at: "2026-11-05T12:00:00Z", top_ranking_entries: [{ tipo: "movie", tmdb_id: 905002 }, { tipo: "movie", tmdb_id: 900041 }] }];
await vaciar(); await top([]);
await medir("top manual · antes de publicar", ficha("movie", 905002));
await top(FILAS); await borrar("^disp:top-manual$");
await medir("top manual · publicado, venció top-manual, disp: viva", ficha("movie", 905002));
await borrar("^disp:");
await medir("top manual · publicado, 5 min vencidos", ficha("movie", 905002));
await vaciar(); await topCaido(true);
await medir("top manual · base caída", ficha("movie", 905002));
await topCaido(false);
await medir("top manual · base recuperada, sin esperar", ficha("movie", 905002));
await top([]);
writeFileSync(new URL(`./flujos-${et}.json`, import.meta.url), JSON.stringify(filas, null, 1));
