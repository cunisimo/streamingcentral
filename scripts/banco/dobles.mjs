// Los TRES dobles del banco aislado (informe de capacidad §10): TMDB, Supabase y
// Redis (REST de Upstash), en un solo proceso, cada uno en su puerto. Ninguno
// habla con nada real: no hay credenciales, no hay red hacia afuera.
//
//   node scripts/banco/dobles.mjs            → 4801 TMDB · 4802 Supabase · 4803 Redis
//   BANCO_PUERTO_BASE=4811 node …            → 4811 · 4812 · 4813 (un SEGUNDO juego de
//        dobles, para que dos versiones de la app corran cada una contra sus
//        propias cachés: el comparador de identidad del Home, Etapa 3.a)
//
// Cada doble expone, además de lo que imita, un control en `/__banco`:
//
//   GET  /__banco/estado          contadores: peticiones recibidas, por familia
//   POST /__banco/config          { modo, latenciaMs, retryAfter }
//        modo: "ok" | "429" | "500" | "caido"   ("caido" corta el socket: fallo
//        de transporte, que es lo único que el SDK de Upstash reintenta)
//        modo: "429-parcial" + { parcialP: 0.1, familiaParcial: "/watch/providers", parcialPorQuery?: true }
//        (429 determinístico en una fracción de esa familia: Etapa 3.a, H2; el
//        hash es del path —un título, una ruta— o, con `parcialPorQuery`, de la
//        URL entera, para familias como `/discover` donde el path es siempre el
//        mismo y lo que distingue un pool es la query)
//        modo: "429-consulta" + { consulta429: { path: "/discover/movie", params: { page: "4", … } } }
//        (429 sólo en las consultas cuyo path y parámetros coinciden; las URLs
//        rechazadas quedan en cuenta.consultas429)
//        discoverPorPagina: 20   (resultados por página de /discover; con menos
//        un riel no llena su ventana y pide su página extra)
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
import { createHash } from "node:crypto";
import { LUA } from "../../lib/turno-lua.ts";

// ----------------------------------------------------------------- utilidades
// Puerto base configurable: el comparador del Home levanta dos juegos de dobles.
const PUERTO_BASE = Number(process.env.BANCO_PUERTO_BASE) || 4801;
function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; }
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
function leerCuerpo(req) {
  return new Promise((resolve) => { let b = ""; req.on("data", (c) => { b += c; }); req.on("end", () => resolve(b)); });
}
function json(res, estado, cuerpo, headers = {}) {
  const body = JSON.stringify(cuerpo);
  res.writeHead(estado, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), ...headers });
  res.end(body);
  return Buffer.byteLength(body);
}

// Un doble = servidor + estado de control + contadores. `atender` hace lo
// específico; el control y los modos de fallo son comunes.
function doble(nombre, puerto, atender, extra = {}) {
  const estado = { modo: "ok", latenciaMs: 0, retryAfter: 2 };
  // `bytes`: lo que entró y salió por el cable en las peticiones atendidas (sin
  // el control). Es lo que mide el costo en BYTES del camino caliente (Etapa 2,
  // §14.6): un HIT tiene que transferir UNA copia del Home, no dos ni tres.
  const cuenta = { peticiones: 0, porFamilia: {}, desconocidas: [], bytes: { recibidos: 0, enviados: 0 } };
  const familia = (metodo, url) => (extra.familia ? extra.familia(metodo, url) : `${metodo} ${url.split("?")[0]}`);
  const srv = createServer(async (req, res) => {
    const url = req.url ?? "/";
    if (url.startsWith("/__banco/")) {
      if (url === "/__banco/estado") return json(res, 200, { nombre, estado, cuenta, ...(extra.estado?.() ?? {}) });
      if (url === "/__banco/config") { Object.assign(estado, JSON.parse(await leerCuerpo(req) || "{}")); return json(res, 200, estado); }
      if (url === "/__banco/reset") { cuenta.peticiones = 0; cuenta.porFamilia = {}; cuenta.desconocidas = []; cuenta.bytes = { recibidos: 0, enviados: 0 }; cuenta.parciales429 = 0; cuenta.consultas429 = []; cuenta.discovers = []; extra.reset?.(); return json(res, 200, { ok: true }); }
      // Controles propios del doble (Etapa 2: expirar, borrar, perder la
      // respuesta, fallar EVAL, listar claves).
      if (extra.control) { const r = await extra.control(url, await leerCuerpo(req)); if (r !== undefined) return json(res, 200, r); }
      return json(res, 404, { error: "control desconocido" });
    }
    const cuerpo = await leerCuerpo(req);
    cuenta.peticiones += 1;
    cuenta.bytes.recibidos += Buffer.byteLength(cuerpo);
    // Lo enviado se mide al cerrar la respuesta, que es cuando se sabe.
    const escribirOriginal = res.write.bind(res), endOriginal = res.end.bind(res);
    res.write = (chunk, ...a) => { if (chunk) cuenta.bytes.enviados += Buffer.byteLength(chunk); return escribirOriginal(chunk, ...a); };
    res.end = (chunk, ...a) => { if (chunk && typeof chunk !== "function") cuenta.bytes.enviados += Buffer.byteLength(chunk); return endOriginal(chunk, ...a); };
    const f = familia(req.method, url, cuerpo);
    cuenta.porFamilia[f] = (cuenta.porFamilia[f] ?? 0) + 1;
    if (estado.latenciaMs) await dormir(estado.latenciaMs);
    if (estado.modo === "caido") { req.socket.destroy(); return; }
    if (estado.modo === "500") return json(res, 500, { error: "doble en modo 500" });
    if (estado.modo === "429") return json(res, 429, { error: "doble en modo 429" }, { "Retry-After": String(estado.retryAfter) });
    // Etapa 3.a (H2): 429 PARCIAL y determinístico —sólo en la familia
    // `familiaParcial` (por defecto `watch/providers`) y sólo para la fracción
    // `parcialP` de las rutas, elegida por hash de la URL— para reproducir el
    // límite de tasa real: no rechaza todo, rechaza lo que pasa del cupo.
    if (estado.modo === "429-parcial" && url.includes(estado.familiaParcial ?? "/watch/providers")
      && (hash(estado.parcialPorQuery ? url : url.split("?")[0]) % 1000) < Math.round((estado.parcialP ?? 0.1) * 1000)) {
      cuenta.parciales429 = (cuenta.parciales429 ?? 0) + 1;
      return json(res, 429, { error: "doble en modo 429-parcial" }, { "Retry-After": String(estado.retryAfter) });
    }
    // Etapa 3.a (auditoría sobre c6b299e): 429 sobre UNA consulta identificada
    // por sus parámetros (`consulta429: { path, params }`; todos los `params`
    // tienen que coincidir). Es lo que distingue la página extra de un riel de
    // las páginas de su ventana: mismo path y misma receta, otro `page`. Las
    // URLs rechazadas quedan en `cuenta.consultas429`.
    if (estado.modo === "429-consulta" && estado.consulta429) {
      const u = new URL(url, "http://x");
      const c = estado.consulta429;
      if (u.pathname === c.path && Object.entries(c.params ?? {}).every(([k, v]) => u.searchParams.get(k) === String(v))) {
        (cuenta.consultas429 ??= []).push(url);
        return json(res, 429, { error: "doble en modo 429-consulta" }, { "Retry-After": String(estado.retryAfter) });
      }
    }
    try {
      await atender(req, res, url, cuerpo, cuenta, estado);
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
// `porPagina`: cuántos resultados trae cada página (20, como TMDB). Con menos,
// un riel no llena su ventana y pide la página extra — es cómo el banco fuerza
// ese recorrido.
function pagina(tipo, q, porPagina = 20) {
  const generos = (q.get("with_genres") ?? "").split(/[,|]/).filter(Boolean).map(Number);
  const page = Number(q.get("page") ?? "1");
  // La semilla depende de TODO lo que distingue una consulta: así dos rieles
  // distintos traen títulos distintos y dos plataformas también.
  const semilla = hash(`${tipo}|${q.get("with_genres")}|${q.get("with_keywords")}|${q.get("with_watch_providers")}|${q.get("sort_by")}|${q.get("with_type")}|${q.get("without_genres")}|${q.get("primary_release_date.gte") ?? q.get("first_air_date.gte") ?? ""}`) % 100000;
  const base = 1000 + semilla * 100 + (page - 1) * 20;
  return { page, results: Array.from({ length: porPagina }, (_, i) => titulo(tipo, base + i, generos)), total_pages: 10, total_results: 200 };
}
doble("tmdb", PUERTO_BASE + 0, async (req, res, url, _cuerpo, cuenta, estado) => {
  const u = new URL(url, "http://x");
  const p = u.pathname;
  let m;
  if ((m = p.match(/^\/discover\/(movie|tv)$/))) {
    // Registro de cada `discover` atendido (path + query), para que el banco
    // pueda elegir una consulta concreta (p. ej. la página extra de un riel).
    if ((cuenta.discovers ??= []).length < 5000) cuenta.discovers.push(url);
    return json(res, 200, pagina(m[1], u.searchParams, estado.discoverPorPagina ?? 20));
  }
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
  // Búsqueda de títulos: 20 resultados cuyo nombre CONTIENE la consulta, para
  // que la relevancia de la app los acepte (Etapa 3.a: el banco de búsqueda
  // con providersOf en 429 parcial necesita elegidos). Personas: ninguna.
  if ((m = p.match(/^\/search\/(movie|tv)$/))) {
    const consulta = u.searchParams.get("query") ?? "";
    const base = 5000 + (hash(`${m[1]}|${consulta}`) % 1000) * 20;
    const results = Array.from({ length: 20 }, (_, i) => {
      const t = titulo(m[1], base + i, [18]);
      return m[1] === "movie" ? { ...t, title: `${consulta} ${i + 1}` } : { ...t, name: `${consulta} ${i + 1}` };
    });
    return json(res, 200, { page: 1, results, total_pages: 1, total_results: 20 });
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
doble("supabase", PUERTO_BASE + 1, async (req, res, url) => {
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
// ETAPA 2: además de GET/MGET/SET … EX, el doble entiende SET … NX PX, PTTL/TTL,
// y EVAL/EVALSHA de los CUATRO scripts del turno, POR TEXTO (lib/turno-lua.ts:
// los mismos bytes que producción y que la precondición verificada contra la
// base real). Un EVALSHA con un sha que nunca pasó por EVAL responde NOSCRIPT,
// como Redis. Registra cada comando de turno con propietario y resultado
// (`registro`), y cuenta los COMANDOS CONFIRMADOS aparte de los que devolvieron
// error (un EVALSHA rechazado con NOSCRIPT no es un comando confirmado: así lo
// cuenta la app, y así lo compara el validador).
const base = new Map();
const registro = [];           // { t, op, clave, propietario, resultado }
const scriptsCargados = new Map(); // sha1 → texto
const sha1 = (t) => createHash("sha1").update(t).digest("hex");
const NOMBRE_POR_TEXTO = new Map(Object.entries(LUA).map(([n, t]) => [t, n]));
const fallos = { perderRespuesta: { comando: null, veces: 0 }, fallarEval: 0 };
const vivo = (k) => {
  const v = base.get(k); if (!v) return null;
  if (v.exp && v.exp < Date.now()) { base.delete(k); if (k.includes(":turno:")) registro.push({ t: Date.now(), op: "EXPIRA", clave: k, propietario: v.v, resultado: null }); return null; }
  return v.v;
};
const anotarTurno = (op, clave, propietario, resultado) => { if (clave.includes(":turno:")) registro.push({ t: Date.now(), op, clave, propietario, resultado }); };
function correrScript(texto, keys, argv) {
  const nombre = NOMBRE_POR_TEXTO.get(texto);
  if (!nombre) throw new Error("ERR el doble sólo ejecuta los cuatro scripts del turno, por texto");
  if (fallos.fallarEval > 0) { fallos.fallarEval -= 1; anotarTurno(nombre, keys[0], argv[0], "ERROR"); throw new Error("ERR doble en modo fallarEval"); }
  let r;
  switch (nombre) {
    case "RENOVAR": {
      if (vivo(keys[0]) !== argv[0]) r = 0; else { base.set(keys[0], { v: argv[0], exp: Date.now() + Number(argv[1]) }); r = 1; }
      break;
    }
    case "LIBERAR": {
      if (vivo(keys[0]) !== argv[0]) r = 0; else { base.delete(keys[0]); r = 1; }
      break;
    }
    case "ENFRIAR": {
      if (vivo(keys[0]) !== argv[0]) r = 0; else {
        base.set(keys[0], { v: `enfriando:${argv[0]}`, exp: Date.now() + Number(argv[2]) });
        base.set(keys[1], { v: String(argv[1]), exp: Date.now() + Number(argv[2]) });
        r = 1;
      }
      break;
    }
    case "PUBLICAR": {
      const [turno, fresca, ub, gen] = keys;
      const [propietario, frescaJson, ttlF, ubJson, ttlUb, dia] = argv;
      if (vivo(turno) !== propietario) { r = 0; break; }
      const g = vivo(gen); const diaGuardado = g ? String(g).slice(0, 10) : "";
      if (diaGuardado > dia) {
        base.set(fresca, { v: String(frescaJson), exp: Date.now() + Number(ttlF) * 1000 }); base.delete(turno); r = -1; break;
      }
      base.set(fresca, { v: String(frescaJson), exp: Date.now() + Number(ttlF) * 1000 });
      base.set(ub, { v: String(ubJson), exp: Date.now() + Number(ttlUb) * 1000 });
      base.set(gen, { v: `${dia}:${propietario}`, exp: Date.now() + Number(ttlUb) * 1000 });
      base.delete(turno); r = 1;
      break;
    }
  }
  anotarTurno(nombre, keys[0], argv[0], r);
  return r;
}
function ejecutar(cmd) {
  const [c, ...a] = cmd;
  const op = String(c).toUpperCase();
  switch (op) {
    case "GET": return vivo(a[0]);
    case "MGET": return a.map(vivo);
    case "SET": {
      let exp = 0, nx = false;
      for (let i = 2; i < a.length; i++) {
        const f = String(a[i]).toUpperCase();
        if (f === "EX") exp = Date.now() + Number(a[i + 1]) * 1000;
        if (f === "PX") exp = Date.now() + Number(a[i + 1]);
        if (f === "NX") nx = true;
      }
      if (nx && vivo(a[0]) !== null) { anotarTurno("SETNX", a[0], String(a[1]), null); return null; }
      base.set(a[0], { v: String(a[1]), exp });
      if (nx) anotarTurno("SETNX", a[0], String(a[1]), "OK");
      return "OK";
    }
    case "PTTL": { const v = base.get(a[0]); if (vivo(a[0]) === null) return -2; return v.exp ? Math.max(0, v.exp - Date.now()) : -1; }
    case "TTL": { const v = base.get(a[0]); if (vivo(a[0]) === null) return -2; return v.exp ? Math.max(0, Math.ceil((v.exp - Date.now()) / 1000)) : -1; }
    case "EVAL": {
      const [texto, n, ...resto] = a; const nk = Number(n);
      scriptsCargados.set(sha1(String(texto)), String(texto));
      return correrScript(String(texto), resto.slice(0, nk).map(String), resto.slice(nk).map(String));
    }
    case "EVALSHA": {
      const [sha, n, ...resto] = a; const nk = Number(n);
      const texto = scriptsCargados.get(String(sha));
      if (!texto) throw new Error("NOSCRIPT No matching script. Please use EVAL.");
      return correrScript(texto, resto.slice(0, nk).map(String), resto.slice(nk).map(String));
    }
    case "SCRIPT": { if (String(a[0]).toUpperCase() === "LOAD") { const h = sha1(String(a[1])); scriptsCargados.set(h, String(a[1])); return h; } throw new Error("ERR SCRIPT: sólo LOAD"); }
    case "DEL": { let n = 0; for (const k of a) if (base.delete(k)) n++; return n; }
    case "EXISTS": return a.filter((k) => vivo(k) !== null).length;
    case "DBSIZE": return base.size;
    case "PING": return "PONG";
    case "FLUSHALL": base.clear(); return "OK";
    default: throw new Error(`comando no soportado por el doble: ${op}`);
  }
}
const b64 = (v) => typeof v === "string" ? Buffer.from(v).toString("base64") : Array.isArray(v) ? v.map(b64) : v;
// `perdidos`: ejecutados por el doble pero cuya respuesta se cortó a propósito
// (perderRespuesta). No entran en `total`, que es lo que el cliente pudo
// CONFIRMAR —la misma unidad que cuenta la app—; se informan aparte porque
// Upstash sí los ejecutó (y presumiblemente los factura).
const comandosRedis = { total: 0, errores: 0, perdidos: 0, porComando: {} };
doble("redis", PUERTO_BASE + 2, async (req, res, url, cuerpo) => {
  const codificar = (req.headers["upstash-encoding"] === "base64") ? b64 : (v) => v;
  const uno = (cmd) => {
    const op = String(cmd[0]).toUpperCase();
    try {
      const r = ejecutar(cmd);
      comandosRedis.total += 1;
      comandosRedis.porComando[op] = (comandosRedis.porComando[op] ?? 0) + 1;
      return { result: codificar(r) };
    } catch (e) {
      comandosRedis.errores += 1;
      return { error: String(e.message) };
    }
  };
  const parsed = JSON.parse(cuerpo || "[]");
  const esPipeline = url.split("?")[0] === "/pipeline";
  const antes = comandosRedis.total;
  const respuesta = esPipeline ? parsed.map(uno) : uno(parsed);
  // perderRespuesta: el comando EJECUTÓ; el socket se corta sin responder. Es
  // la "respuesta perdida" que la reconciliación del turno tiene que cubrir.
  const primero = Array.isArray(parsed[0]) ? parsed[0][0] : parsed[0];
  if (fallos.perderRespuesta.veces > 0 && String(primero).toUpperCase() === fallos.perderRespuesta.comando) {
    fallos.perderRespuesta.veces -= 1;
    const ejecutados = comandosRedis.total - antes;
    comandosRedis.total = antes; comandosRedis.perdidos += ejecutados;
    for (const cmd of (esPipeline ? parsed : [parsed])) { const op = String(cmd[0]).toUpperCase(); comandosRedis.porComando[op] = (comandosRedis.porComando[op] ?? 0) - 1; }
    req.socket.destroy(); return;
  }
  return json(res, 200, respuesta);
}, {
  familia: (metodo, url, cuerpo) => {
    if (url.startsWith("/pipeline")) return "POST /pipeline";
    try { return `POST / ${String(JSON.parse(cuerpo)[0]).toUpperCase()}`; } catch { return "POST /"; }
  },
  estado: () => ({ comandos: comandosRedis, claves: base.size, registro, cargados: scriptsCargados.size }),
  reset: () => { base.clear(); comandosRedis.total = 0; comandosRedis.errores = 0; comandosRedis.perdidos = 0; comandosRedis.porComando = {}; registro.length = 0; fallos.perderRespuesta = { comando: null, veces: 0 }; fallos.fallarEval = 0; },
  // POST /__banco/redis  { accion: "borrar", patron } | { accion: "expirar", patron }
  //                      | { accion: "perderRespuesta", comando: "SET", veces: 1 }
  //                      | { accion: "fallarEval", veces } | { accion: "claves", patron }
  control: async (url, cuerpo) => {
    if (url !== "/__banco/redis") return undefined;
    const c = JSON.parse(cuerpo || "{}");
    const re = c.patron ? new RegExp(c.patron) : /./;
    const claves = [...base.keys()].filter((k) => re.test(k));
    if (c.accion === "claves") return claves.map((k) => ({ clave: k, valor: String(base.get(k).v).slice(0, 60), pttl: base.get(k).exp ? base.get(k).exp - Date.now() : -1 }));
    if (c.accion === "borrar" || c.accion === "expirar") { for (const k of claves) { if (k.includes(":turno:")) registro.push({ t: Date.now(), op: c.accion.toUpperCase(), clave: k, propietario: String(base.get(k).v), resultado: null }); base.delete(k); } return { borradas: claves }; }
    if (c.accion === "perderRespuesta") { fallos.perderRespuesta = { comando: String(c.comando).toUpperCase(), veces: Number(c.veces ?? 1) }; return fallos; }
    if (c.accion === "fallarEval") { fallos.fallarEval = Number(c.veces ?? 1); return fallos; }
    return { error: "acción desconocida" };
  },
});
