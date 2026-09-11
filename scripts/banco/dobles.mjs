// Los TRES dobles del banco aislado (informe de capacidad §10): TMDB, Supabase y
// Redis (REST de Upstash), en un solo proceso, cada uno en su puerto. Ninguno
// habla con nada real: no hay credenciales, no hay red hacia afuera.
//
//   node scripts/banco/dobles.mjs            → 4801 TMDB · 4802 Supabase · 4803 Redis
//
// Cada doble expone, además de lo que imita, un control en `/__banco`:
//
//   GET  /__banco/estado          contadores: peticiones recibidas, por familia
//   POST /__banco/config          { modo, latenciaMs, retryAfter }
//        modo: "ok" | "429" | "500" | "caido"   ("caido" corta el socket: fallo
//        de transporte, que es lo único que el SDK de Upstash reintenta)
//   POST /__banco/reset           contadores a cero (y, en Redis, borra la base)
//
// El contador de cada doble es el ÁRBITRO: lo que la app dice que hizo (línea
// `[home]`) se compara contra lo que el doble recibió. Si no coinciden, primero
// se duda del instrumento (docs/MANTENIMIENTO.md 8.b).
//
// Lo que los dobles devuelven es contenido FIJO y determinístico (sale de un
// hash de la consulta): sirve para medir comportamiento y costos, no para mirar
// el Home. El doble de TMDB responde a cualquier ruta con algo plausible y
// registra las que no conoce, para que se vea qué pidió la app.
import { createServer } from "node:http";

// ----------------------------------------------------------------- utilidades
function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; }
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
function leerCuerpo(req) {
  return new Promise((resolve) => { let b = ""; req.on("data", (c) => { b += c; }); req.on("end", () => resolve(b)); });
}
function json(res, estado, cuerpo, headers = {}) {
  const body = JSON.stringify(cuerpo);
  res.writeHead(estado, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), ...headers });
  res.end(body);
}

// Un doble = servidor + estado de control + contadores. `atender` hace lo
// específico; el control y los modos de fallo son comunes.
function doble(nombre, puerto, atender, extra = {}) {
  const estado = { modo: "ok", latenciaMs: 0, retryAfter: 2 };
  const cuenta = { peticiones: 0, porFamilia: {}, desconocidas: [] };
  const familia = (metodo, url) => (extra.familia ? extra.familia(metodo, url) : `${metodo} ${url.split("?")[0]}`);
  const srv = createServer(async (req, res) => {
    const url = req.url ?? "/";
    if (url.startsWith("/__banco/")) {
      if (url === "/__banco/estado") return json(res, 200, { nombre, estado, cuenta, ...(extra.estado?.() ?? {}) });
      if (url === "/__banco/config") { Object.assign(estado, JSON.parse(await leerCuerpo(req) || "{}")); return json(res, 200, estado); }
      if (url === "/__banco/reset") { cuenta.peticiones = 0; cuenta.porFamilia = {}; cuenta.desconocidas = []; extra.reset?.(); return json(res, 200, { ok: true }); }
      return json(res, 404, { error: "control desconocido" });
    }
    const cuerpo = await leerCuerpo(req);
    cuenta.peticiones += 1;
    const f = familia(req.method, url, cuerpo);
    cuenta.porFamilia[f] = (cuenta.porFamilia[f] ?? 0) + 1;
    if (estado.latenciaMs) await dormir(estado.latenciaMs);
    if (estado.modo === "caido") { req.socket.destroy(); return; }
    if (estado.modo === "500") return json(res, 500, { error: "doble en modo 500" });
    if (estado.modo === "429") return json(res, 429, { error: "doble en modo 429" }, { "Retry-After": String(estado.retryAfter) });
    try {
      await atender(req, res, url, cuerpo, cuenta);
    } catch (e) {
      json(res, 500, { error: String(e) });
    }
  });
  srv.listen(puerto, "127.0.0.1", () => console.log(`[banco] ${nombre} en http://127.0.0.1:${puerto}`));
  return srv;
}

// ----------------------------------------------------------------- TMDB
// Proveedores AR que la app conoce (lib/providers-ar.ts): Netflix 8, Disney+
// 337, Max 1899. Cada título cae en uno según su id, así que un Home de n,d,m
// encuentra catálogo y uno de una sola plataforma encuentra un tercio.
const PROVEEDORES = [8, 337, 1899];
function titulo(tipo, id, generos) {
  const esMovie = tipo === "movie";
  return {
    id, [esMovie ? "title" : "name"]: `${esMovie ? "Película" : "Serie"} ${id}`,
    [esMovie ? "original_title" : "original_name"]: `Original ${id}`,
    poster_path: `/p${id}.jpg`, backdrop_path: `/b${id}.jpg`, overview: `Sinopsis fija del título ${id}.`,
    vote_average: 5 + (id % 50) / 10, vote_count: 100 + (id % 900), popularity: 10 + (id % 1000) / 7,
    [esMovie ? "release_date" : "first_air_date"]: `20${10 + (id % 15)}-0${1 + (id % 9)}-1${id % 9}`,
    genre_ids: generos.length ? generos : [18], original_language: "en", origin_country: ["US"], adult: false,
  };
}
function pagina(tipo, q) {
  const generos = (q.get("with_genres") ?? "").split(/[,|]/).filter(Boolean).map(Number);
  const page = Number(q.get("page") ?? "1");
  // La semilla depende de TODO lo que distingue una consulta: así dos rieles
  // distintos traen títulos distintos y dos plataformas también.
  const semilla = hash(`${tipo}|${q.get("with_genres")}|${q.get("with_keywords")}|${q.get("with_watch_providers")}|${q.get("sort_by")}|${q.get("with_type")}|${q.get("without_genres")}|${q.get("primary_release_date.gte") ?? q.get("first_air_date.gte") ?? ""}`) % 100000;
  const base = 1000 + semilla * 100 + (page - 1) * 20;
  return { page, results: Array.from({ length: 20 }, (_, i) => titulo(tipo, base + i, generos)), total_pages: 10, total_results: 200 };
}
doble("tmdb", 4801, async (req, res, url, _cuerpo, cuenta) => {
  const u = new URL(url, "http://x");
  const p = u.pathname;
  let m;
  if ((m = p.match(/^\/discover\/(movie|tv)$/))) return json(res, 200, pagina(m[1], u.searchParams));
  if ((m = p.match(/^\/trending\/(movie|tv|all)\/(day|week)$/))) return json(res, 200, pagina(m[1] === "all" ? "movie" : m[1], u.searchParams));
  if ((m = p.match(/^\/(movie|tv)\/(\d+)\/watch\/providers$/))) {
    const id = Number(m[2]);
    const prov = PROVEEDORES[id % PROVEEDORES.length];
    return json(res, 200, { id, results: { AR: { link: `https://www.themoviedb.org/${m[1]}/${id}/watch?locale=AR`, flatrate: [{ provider_id: prov, provider_name: `Prov ${prov}`, logo_path: "/l.png", display_priority: 1 }] } } });
  }
  if ((m = p.match(/^\/(movie|tv)\/(\d+)\/videos$/))) return json(res, 200, { id: Number(m[2]), results: [] });
  if ((m = p.match(/^\/(movie|tv)\/(\d+)\/keywords$/))) return json(res, 200, { id: Number(m[2]), keywords: [], results: [] });
  if ((m = p.match(/^\/(movie|tv)\/(\d+)$/))) {
    const t = titulo(m[1], Number(m[2]), [18]);
    return json(res, 200, { ...t, genres: [{ id: 18, name: "Drama" }], runtime: 100, episode_run_time: [45], number_of_seasons: 1, status: "Released", homepage: "", networks: [], credits: { cast: [], crew: [] }, external_ids: {}, release_dates: { results: [] }, content_ratings: { results: [] }, recommendations: { results: [] }, seasons: [] });
  }
  if (p.startsWith("/search/")) return json(res, 200, { page: 1, results: [], total_pages: 0, total_results: 0 });
  if (p.startsWith("/person/")) return json(res, 200, { id: 1, name: "Persona", profile_path: null, cast: [], crew: [], results: [] });
  if (p.startsWith("/watch/providers/")) return json(res, 200, { results: PROVEEDORES.map((id) => ({ provider_id: id, provider_name: `Prov ${id}`, logo_path: "/l.png" })) });
  cuenta.desconocidas.push(p);
  return json(res, 200, { page: 1, results: [], total_pages: 0, total_results: 0 });
}, { familia: (metodo, url) => `${metodo} ${url.split("?")[0].replace(/\/\d+/g, "/{id}")}` });

// ----------------------------------------------------------------- Supabase
// PostgREST: toda lectura devuelve una lista vacía con la forma correcta;
// todo RPC devuelve una lista vacía. Datos fijos, nunca Producción.
doble("supabase", 4802, async (req, res, url) => {
  const p = url.split("?")[0];
  if (p.startsWith("/rest/v1/rpc/")) return json(res, 200, []);
  if (p.startsWith("/rest/v1/")) return json(res, 200, [], { "Content-Range": "*/0" });
  if (p.startsWith("/auth/v1/")) return json(res, 401, { error: "el doble no tiene auth" });
  return json(res, 404, { error: "ruta desconocida en el doble de Supabase" });
}, { familia: (metodo, url) => `${metodo} ${url.split("?")[0]}` });

// ----------------------------------------------------------------- Redis (REST de Upstash)
// Lo que el SDK manda: POST a la raíz con `["GET","clave"]`, o a `/pipeline`
// con una lista de comandos. Responde `{ result }` (o una lista de ellos). Con
// `Upstash-Encoding: base64` los resultados de texto van en base64, que es lo
// que pide el cliente por defecto. Valores con vencimiento (SET … EX n).
const base = new Map();
function ejecutar(cmd) {
  const [c, ...a] = cmd;
  const op = String(c).toUpperCase();
  const vivo = (k) => { const v = base.get(k); if (!v) return null; if (v.exp && v.exp < Date.now()) { base.delete(k); return null; } return v.v; };
  switch (op) {
    case "GET": return vivo(a[0]);
    case "MGET": return a.map(vivo);
    case "SET": {
      let exp = 0;
      for (let i = 2; i < a.length; i++) if (String(a[i]).toUpperCase() === "EX") exp = Date.now() + Number(a[i + 1]) * 1000;
      base.set(a[0], { v: String(a[1]), exp }); return "OK";
    }
    case "DEL": { let n = 0; for (const k of a) if (base.delete(k)) n++; return n; }
    case "EXISTS": return a.filter((k) => vivo(k) !== null).length;
    case "DBSIZE": return base.size;
    case "PING": return "PONG";
    case "FLUSHALL": base.clear(); return "OK";
    default: throw new Error(`comando no soportado por el doble: ${op}`);
  }
}
const b64 = (v) => typeof v === "string" ? Buffer.from(v).toString("base64") : Array.isArray(v) ? v.map(b64) : v;
const comandosRedis = { total: 0, porComando: {} };
doble("redis", 4803, async (req, res, url, cuerpo) => {
  const codificar = (req.headers["upstash-encoding"] === "base64") ? b64 : (v) => v;
  const uno = (cmd) => {
    comandosRedis.total += 1;
    const op = String(cmd[0]).toUpperCase();
    comandosRedis.porComando[op] = (comandosRedis.porComando[op] ?? 0) + 1;
    try { return { result: codificar(ejecutar(cmd)) }; } catch (e) { return { error: String(e.message) }; }
  };
  const parsed = JSON.parse(cuerpo || "[]");
  if (url.split("?")[0] === "/pipeline") return json(res, 200, parsed.map(uno));
  return json(res, 200, uno(parsed));
}, {
  familia: (metodo, url, cuerpo) => {
    if (url.startsWith("/pipeline")) return "POST /pipeline";
    try { return `POST / ${String(JSON.parse(cuerpo)[0]).toUpperCase()}`; } catch { return "POST /"; }
  },
  estado: () => ({ comandos: comandosRedis, claves: base.size }),
  reset: () => { base.clear(); comandosRedis.total = 0; comandosRedis.porComando = {}; },
});
