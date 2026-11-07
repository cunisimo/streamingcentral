// Banco del incidente de Upstash: sólo localhost, sin credenciales.
//   4805 TMDB realista → completa lo que el doble no trae (créditos, relacionados, filmografía)
//   4804 contador de Redis → reenvía al doble 4803; puede simular la cuota agotada
//   3141 frente de la app → registra cada pedido que llegaría a una función de Vercel
import { createServer, request } from "node:http";

const leer = (req) => new Promise((r) => { const b = []; req.on("data", (c) => b.push(c)); req.on("end", () => r(Buffer.concat(b))); });
const json = (res, s, o) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
const reenviar = (puerto, req, cuerpo) => new Promise((ok, mal) => {
  const q = request({ host: "127.0.0.1", port: puerto, path: req.url, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${puerto}`, "accept-encoding": "identity" } }, (r) => {
    const b = []; r.on("data", (c) => b.push(c)); r.on("end", () => ok({ status: r.statusCode, headers: r.headers, cuerpo: Buffer.concat(b) }));
  });
  q.on("error", mal); if (cuerpo?.length) q.write(cuerpo); q.end();
});

// ---------------------------------------------------------------- TMDB
// ids ≥ 900000: títulos SIN proveedor argentino (el camino de `disp:` y `oficial:`).
const SIN_AR = 900000;
const tmdb = { total: 0, porFamilia: {}, llamadas: [] };
const lentos = new Map();
const fam = (p) => p.replace(/\/\d+/g, "/{id}");
const obra = (id, tipo) => ({ id, media_type: tipo, title: `T${id}`, name: `T${id}`, original_title: `T${id}`, original_name: `T${id}`, overview: `Sinopsis ${id}`, poster_path: `/p${id}.jpg`, backdrop_path: `/b${id}.jpg`, vote_average: 7, vote_count: 500, popularity: 50, genre_ids: [18], release_date: "2020-01-01", first_air_date: "2020-01-01", original_language: "en", origin_country: ["US"] });
const RELACIONADOS = Number(process.env.BANCO_RELACIONADOS ?? 20);
const CREDITOS = Number(process.env.BANCO_CREDITOS ?? 60);
createServer(async (req, res) => {
  const u = new URL(req.url, "http://x"); const p = u.pathname;
  if (p === "/__t") { const r = structuredClone(tmdb); if (u.searchParams.has("reset")) { tmdb.total = 0; tmdb.porFamilia = {}; tmdb.llamadas = []; } return json(res, 200, r); }
  if (p === "/__lento") { if (u.searchParams.has("limpiar")) lentos.clear(); else lentos.set(u.searchParams.get("p"), Number(u.searchParams.get("ms"))); return json(res, 200, [...lentos]); }
  tmdb.total++; tmdb.porFamilia[fam(p)] = (tmdb.porFamilia[fam(p)] ?? 0) + 1;
  tmdb.llamadas.push({ p, lang: u.searchParams.get("language"), append: u.searchParams.has("append_to_response") });
  if (lentos.has(p)) await new Promise((r) => setTimeout(r, lentos.get(p)));
  let m;
  if ((m = p.match(/^\/person\/(\d+)$/))) {
    const id = Number(m[1]);
    return json(res, 200, { id, name: `Persona ${id}`, profile_path: `/f${id}.jpg`, known_for_department: "Acting", biography: "", birthday: "1970-01-01", place_of_birth: "X", popularity: 10 });
  }
  if ((m = p.match(/^\/person\/(\d+)\/combined_credits$/))) {
    const id = Number(m[1]); const base = id >= SIN_AR ? SIN_AR + (id % 1000) * 200 : 100000 + (id % 1000) * 200;
    return json(res, 200, { id, cast: Array.from({ length: CREDITOS }, (_, i) => ({ ...obra(base + i, i % 3 ? "movie" : "tv"), character: "X", order: i })), crew: [] });
  }
  if ((m = p.match(/^\/(movie|tv)\/(\d+)\/watch\/providers$/)) && Number(m[2]) >= SIN_AR) return json(res, 200, { id: Number(m[2]), results: {} });
  if ((m = p.match(/^\/(movie|tv)\/(\d+)\/keywords$/))) {
    const id = Number(m[2]);
    const lista = Array.from({ length: 5 }, (_, i) => ({ id: 1000 + (id + i) % 50, name: "k" + i }));
    return json(res, 200, { id, keywords: lista, results: lista });
  }
  if ((m = p.match(/^\/(movie|tv)\/(\d+)\/videos$/))) {
    const id = Number(m[2]);
    return json(res, 200, { id, results: id % 2 ? [{ site: "YouTube", type: "Trailer", key: "k" + id, iso_639_1: "en", official: true, name: "Tráiler" }] : [] });
  }
  const r = await reenviar(4811, req);
  if ((m = p.match(/^\/(movie|tv)\/(\d+)$/)) && r.status === 200) {
    const id = Number(m[2]); const d = JSON.parse(r.cuerpo.toString());
    const base = id >= SIN_AR ? SIN_AR + (id % 500) * 40 : 200000 + (id % 500) * 40;
    d.credits = { cast: Array.from({ length: 12 }, (_, i) => ({ id: 7000 + (id + i) % 3000, name: `A${i}`, character: "X", profile_path: `/a${i}.jpg`, order: i })), crew: [{ id: 9000, name: "D", job: "Director" }, { id: 9001, name: "M", job: "Original Music Composer" }] };
    if (id >= SIN_AR && id % 3 === 0) { d.homepage = "https://www.netflix.com/title/" + id; d.networks = [{ id: 213, name: "Netflix" }]; d.first_air_date = d.first_air_date ?? "2026-10-01"; d.release_date = d.release_date ?? "2026-10-01"; }
    d.recommendations = { page: 1, total_pages: 1, results: Array.from({ length: RELACIONADOS }, (_, i) => obra(base + i, m[1])) };
    return json(res, 200, d);
  }
  if (p.startsWith("/discover/") && r.status === 200) {
    const d = JSON.parse(r.cuerpo.toString());
    d.results = (d.results ?? []).map((x) => ({ ...x, id: x.id % 800000 }));
    return json(res, 200, d);
  }
  res.writeHead(r.status, { "content-type": "application/json" }); res.end(r.cuerpo);
}).listen(4805, "127.0.0.1");

// ---------------------------------------------------------------- Redis
const nuevo = () => ({ http: 0, comandos: 0, porComando: {}, clavesMget: [], setPorPrefijo: {}, mgetPorPrefijo: {}, ops: [], rechazadosHttp: 0, rechazadosComandos: 0, porComandoRechazado: {} });
let r = nuevo(); let agotada = false; const vistas = new Set();
const pref = (k) => String(k).split(":")[0];
createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/__t") { const s = r; if (u.searchParams.has("reset")) r = nuevo(); return json(res, 200, s); }
  if (u.pathname === "/__agotada") { agotada = u.searchParams.get("v") === "1"; return json(res, 200, { agotada }); }
  if (u.pathname === "/__borrar") {
    // Simula el vencimiento de un TTL: borra las claves de los prefijos pedidos, en el doble.
    const prefijos = (u.searchParams.get("p") ?? "").split(",");
    const re = u.searchParams.get("re") ? new RegExp(u.searchParams.get("re")) : null;
    const lista = [...vistas];
    const borrar = lista.filter((k) => prefijos.includes(pref(k)) || (re && re.test(k)));
    for (const k of borrar) await reenviar(4813, { url: "/", method: "POST", headers: { "content-type": "application/json" } }, Buffer.from(JSON.stringify(["DEL", k])));
    return json(res, 200, { total: lista.length, borradas: borrar.length });
  }
  const cuerpo = await leer(req);
  let cmds = []; try { const c = JSON.parse(cuerpo.toString() || "[]"); cmds = u.pathname === "/pipeline" || u.pathname === "/multi-exec" ? c : [c]; } catch {}
  if (agotada) {
    r.rechazadosHttp++; r.rechazadosComandos += cmds.length;
    for (const c of cmds) { const op = String(c[0]).toUpperCase(); r.porComandoRechazado[op] = (r.porComandoRechazado[op] ?? 0) + 1; }
    return json(res, 400, { error: "ERR max requests limit exceeded. Limit: 500000, Usage: 500000" });
  }
  r.http++;
  for (const c of cmds) {
    const op = String(c[0]).toUpperCase(); r.comandos++; r.porComando[op] = (r.porComando[op] ?? 0) + 1;
    r.ops.push({ op, claves: op === "MGET" ? c.slice(1).map(String) : op === "SET" || op === "GET" || op === "PTTL" ? [String(c[1])] : [] });
    if (op === "MGET") { r.clavesMget.push(c.length - 1); for (const k of c.slice(1)) r.mgetPorPrefijo[pref(k)] = (r.mgetPorPrefijo[pref(k)] ?? 0) + 1; }
    if (op === "SET") vistas.add(String(c[1]));
    if (op === "SET") r.setPorPrefijo[pref(c[1])] = (r.setPorPrefijo[pref(c[1])] ?? 0) + 1;
  }
  const a = await reenviar(4813, req, cuerpo);
  res.writeHead(a.status, { "content-type": "application/json" }); res.end(a.cuerpo);
}).listen(4804, "127.0.0.1");

// ---------------------------------------------------------------- frente de la app
let log = [];
createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/__t") { const s = log; if (u.searchParams.has("reset")) log = []; return json(res, 200, s); }
  const estatico = u.pathname.startsWith("/_next/static") || /\.(png|webp|svg|ico|woff2?|js|css|json|html)$/.test(u.pathname);
  const fila = { p: u.pathname, rsc: !!req.headers.rsc, prefetch: !!req.headers["next-router-prefetch"], m: req.method, q: u.search.slice(0, 20), dest: req.headers["sec-fetch-dest"], mode: req.headers["sec-fetch-mode"], purpose: req.headers.purpose ?? req.headers["sec-purpose"] ?? null, nextUrl: req.headers["next-url"] ?? null, referer: (req.headers.referer ?? "").replace(/^https?:\/\/[^/]+/, ""), bytes: 0 };
  if (!estatico) log.push(fila);
  const q = request({ host: "127.0.0.1", port: 3140, path: req.url, method: req.method, headers: req.headers }, (a) => { res.writeHead(a.statusCode, a.headers); a.on("data", (c) => { fila.bytes += c.length; }); a.pipe(res); });
  q.on("error", (e) => { res.writeHead(502); res.end(String(e)); });
  req.pipe(q);
}).listen(3141, "127.0.0.1");
console.log("proxies listos: 4805 TMDB, 4804 Redis, 3141 app");

// ---------------------------------------------------------------- Supabase
const perfil = (req) => {
  const t = String(req.headers.authorization ?? "").replace(/^Bearer /i, "").split(".");
  return t[0] === "banco" ? { base: Number(t[1]), votos: Number(t[2]), lista: Number(t[3]), extra: Number(t[4] ?? 0) } : null;
};
let moduloActivo = false;
const fecha = (i) => new Date(Date.UTC(2026, 9, 28, 12) - i * 3600e3).toISOString();
createServer(async (req, res) => {
  const u = new URL(req.url, "http://x"); const pr = perfil(req);
  if (u.pathname === "/__modulo") { moduloActivo = u.searchParams.get("v") === "1"; return json(res, 200, { moduloActivo }); }
  if (u.pathname === "/rest/v1/rpc/comunidad_modulo_activo") return json(res, 200, moduloActivo);
  if (u.pathname === "/auth/v1/user") return pr ? json(res, 200, { id: "00000000-0000-4000-8000-" + String(pr.base).padStart(12, "0"), aud: "authenticated", role: "authenticated", email: "banco@example.test", created_at: fecha(0), app_metadata: {}, user_metadata: {} }) : json(res, 401, { message: "sin sesión" });
  if (pr && u.pathname === "/rest/v1/votes") return json(res, 200, Array.from({ length: pr.votos + pr.extra }, (_, i) => ({ tmdb_id: pr.base + i * 3, tipo: i % 3 === 2 ? "tv" : "movie", rating: i % 2 ? 2 : 3, created_at: i < pr.extra ? fecha(-1 - i) : fecha(i) })));
  if (pr && u.pathname === "/rest/v1/user_items") {
    if ((u.searchParams.get("kind") ?? "").includes("dismissed")) return json(res, 200, []);
    return json(res, 200, Array.from({ length: pr.lista }, (_, i) => ({ tmdb_id: pr.base + 500 + i * 3, tipo: i % 3 === 2 ? "tv" : "movie", kind: "list", created_at: fecha(50 + i) })));
  }
  const cuerpo = await leer(req); const a = await reenviar(4812, req, cuerpo);
  res.writeHead(a.status, { "content-type": a.headers["content-type"] ?? "application/json", ...(a.headers["content-range"] ? { "content-range": a.headers["content-range"] } : {}) }); res.end(a.cuerpo);
}).listen(4802, "127.0.0.1");
