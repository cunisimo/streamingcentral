// El escenario de FALLO PARCIAL de la Etapa 3.a (H2, informe v4.1 §1 y §14):
// con TMDB devolviendo 429 en una fracción de los `watch/providers` (y, en el
// escenario D, de los `/discover`: el recorrido real del sitio de pools), el Home
//
//   - puede variar respecto del sano (títulos descartados): es esperable;
//   - TIENE que salir marcado `degradado: true`;
//   - NO se escribe como fresca ni como último bueno;
//   - y si hay último bueno correcto, se sirve ESE (origen `ultimo-bueno`).
//
// Se corre sobre las DOS versiones, cada una contra sus dobles: el "antes"
// (`b7be927`) es el RED —publica el Home mutilado con `degradado: false`— y
// el "después" (la rama de 3.a) es el GREEN.
//
//   BANCO_ANTES_DIR=../wt-etapa3-antes node scripts/banco/etapa3a-parcial.mjs [salida.json]
import { spawn } from "node:child_process";
import { connect } from "node:net";
import { mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parsearLineaHome, esLineaTerminal } from "../../lib/banco-validacion.ts";

const ANTES_DIR = process.env.BANCO_ANTES_DIR;
const DESPUES_DIR = process.env.BANCO_DESPUES_DIR ?? ".";
if (!ANTES_DIR) { console.error("falta BANCO_ANTES_DIR"); process.exit(2); }
const FECHA = process.env.BANCO_FECHA ?? "2026-09-14";
const SALIDA = process.argv[2] ?? "docs/medidas/2026-09-14-etapa3a-parcial.json";
const LOGS = process.env.BANCO_LOGS ?? ".banco-logs";
mkdirSync(LOGS, { recursive: true });
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const VERSIONES = { antes: { dir: ANTES_DIR, puerto: 3000, base: 4801 }, despues: { dir: DESPUES_DIR, puerto: 3001, base: 4811 } };
const COMBO = "n,d,m";
const P = Number(process.env.BANCO_PARCIAL_P ?? "0.1");

function entornoDelBanco(base) {
  const env = { ...process.env };
  for (const l of readFileSync("scripts/banco/entorno.sh", "utf8").split("\n").map((x) => x.replace(/\r$/, ""))) {
    const m = l.match(/^export ([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
    const u = l.match(/^unset (.+)$/);
    if (u) for (const k of u[1].split(/\s+/)) delete env[k];
  }
  env.TMDB_BASE_URL = `http://127.0.0.1:${base}`;
  env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${base + 1}`;
  env.UPSTASH_REDIS_REST_URL = `http://127.0.0.1:${base + 2}`;
  env.YUMP_FECHA = FECHA;
  delete env.YUMP_BANCO_VERSION_HOME;
  return env;
}
const puertoAbierto = (puerto) => new Promise((resolve) => {
  const s = connect({ host: "127.0.0.1", port: puerto });
  s.once("connect", () => { s.destroy(); resolve(true); });
  s.once("error", () => resolve(false));
});
async function esperar(cond, ms, paso = 250) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await cond()) return true; await dormir(paso); }
  return false;
}
const hijos = [];
const matar = (child) => process.platform === "win32" ? spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true }) : child.kill("SIGTERM");
async function levantarDobles(base) {
  for (const p of [base, base + 1, base + 2]) if (await puertoAbierto(p)) throw new Error(`puerto ${p} ocupado`);
  const fd = openSync(join(LOGS, `parcial-dobles-${base}.log`), "w");
  hijos.push(spawn(process.execPath, ["scripts/banco/dobles.mjs"], { env: { ...process.env, BANCO_PUERTO_BASE: String(base) }, stdio: ["ignore", fd, fd], windowsHide: true }));
  if (!await esperar(() => puertoAbierto(base + 2), 20000)) throw new Error(`dobles ${base} no levantaron`);
}
async function levantarNext(nombre, dir, puerto, base, envExtra = {}) {
  if (await puertoAbierto(puerto)) throw new Error(`puerto ${puerto} ocupado`);
  const log = join(LOGS, `parcial-next-${nombre}.log`);
  const fd = openSync(log, "w");
  hijos.push(spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(puerto)], { cwd: dir, env: { ...entornoDelBanco(base), ...envExtra }, stdio: ["ignore", fd, fd], windowsHide: true }));
  if (!await esperar(async () => { try { return (await fetch(`http://127.0.0.1:${puerto}/api/health`, { signal: AbortSignal.timeout(20000) })).ok; } catch { return false; } }, 120000, 500)) throw new Error(`next ${nombre} no levantó`);
  return { nombre, puerto, base, log, leido: 0 };
}
async function control(base, doble, accion, cuerpo) {
  const puerto = base + { tmdb: 0, supabase: 1, redis: 2 }[doble];
  const r = await fetch(`http://127.0.0.1:${puerto}/__banco/${accion}`, { method: cuerpo === undefined ? "GET" : "POST", body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  return r.json();
}
const claves = async (base, patron) => control(base, "redis", "redis", { accion: "claves", patron });
async function vaciar(base) { await control(base, "redis", "reset"); await control(base, "tmdb", "reset"); await control(base, "supabase", "reset"); }
const sano = (base) => control(base, "tmdb", "config", { modo: "ok", latenciaMs: 0 });
// En `/discover` el path es siempre el mismo (`/discover/movie|tv`): la fracción
// se elige por la URL entera, que es lo que distingue un pool de otro.
const parcial = (base, familia = "/watch/providers") => control(base, "tmdb", "config", { modo: "429-parcial", parcialP: P, familiaParcial: familia, parcialPorQuery: familia === "/discover", retryAfter: 2 });
function terminales(p) {
  const todo = readFileSync(p.log, "utf8");
  const nuevas = todo.slice(p.leido).split("\n").map((l) => l.trim());
  p.leido = todo.length;
  return nuevas.filter(esLineaTerminal).map((l) => ({ ...parsearLineaHome(l), degradadoEnLinea: /DEGRADADO/.test(l), descartes: Number((l.match(/(\d+) descarte\(s\) tmdb/) ?? [])[1] ?? 0), linea: l }));
}
async function terminal(p) {
  let t = [];
  await esperar(() => { t.push(...terminales(p)); return t.length >= 1; }, 90000, 200);
  return t[0];
}
async function pedir(p) {
  const r = await fetch(`http://127.0.0.1:${p.puerto}/api/home?providers=${COMBO}`, { signal: AbortSignal.timeout(120000) });
  return { status: r.status, json: await r.json() };
}
const ids = (payload) => ({ hero: (payload.hero ?? []).map((i) => `${i.type}:${i.id}`), rails: Object.fromEntries((payload.rails ?? []).map((r) => [r.key, (r.items ?? []).map((i) => `${i.type}:${i.id}`)])) });
const canon = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x)) ? Object.fromEntries(Object.entries(x).sort()) : x);
const cuentaTitulos = (payload) => (payload.hero ?? []).length + (payload.rails ?? []).reduce((a, r) => a + (r.items ?? []).length, 0);

async function escenarios(nombre, p, pSinEjes) {
  const out = { version: nombre };
  const base = p.base;
  // --- A. SIN último bueno: Redis vacío, TMDB con 429 parcial ---------------
  await vaciar(base); await parcial(base); terminales(p);
  const a = await pedir(p);
  const tA = await terminal(p);
  const parciales = (await control(base, "tmdb", "estado")).cuenta.parciales429 ?? 0;
  const fresca = await claves(base, "^home:[^:]+:v\\d+:");
  const ub = await claves(base, "^home:ub:");
  const degradadoCompartido = await claves(base, "^home:degradado:");
  out.sinUB = {
    http: a.status, degradado: !!a.json.degradado, fallos: a.json.fallos ?? null, titulos: cuentaTitulos(a.json),
    parciales429: parciales, linea: { cache: tA.cache, origen: tA.origen, publicacion: tA.publicacion, degradadoEnLinea: tA.degradadoEnLinea, descartes: tA.descartes, tmdb: tA.tmdb },
    escrito: { fresca: fresca.length, ub: ub.length, degradadoCompartido: degradadoCompartido.length },
  };
  // --- B. CON último bueno correcto: sano → publica; se expira la fresca; parcial → ¿sirve el UB? ---
  await vaciar(base); await sano(base); terminales(p);
  const sanoRes = await pedir(p);
  const tSano = await terminal(p);
  const ubAntes = await claves(base, "^home:ub:");
  // Se expira la fresca Y los `pv3:` (8 h): si no, los `watch/providers` no se
  // vuelven a pedir y el 429 parcial no toca nada — el escenario no probaría
  // nada (MANTENIMIENTO 8.b: si prendido y apagado dan lo mismo, dudar del
  // instrumento).
  await control(base, "redis", "redis", { accion: "expirar", patron: "^home:[^:]+:v\\d+:" });
  await control(base, "redis", "redis", { accion: "expirar", patron: "^pv3:" });
  await control(base, "tmdb", "reset");
  await parcial(base); terminales(p);
  const b = await pedir(p);
  const tB = await terminal(p);
  const parcialesB = (await control(base, "tmdb", "estado")).cuenta.parciales429 ?? 0;
  const frescaB = await claves(base, "^home:[^:]+:v\\d+:");
  const ubB = await claves(base, "^home:ub:");
  out.conUB = {
    sano: { http: sanoRes.status, degradado: !!sanoRes.json.degradado, titulos: cuentaTitulos(sanoRes.json), publicacion: tSano.publicacion, ubEscrito: ubAntes.length },
    parcial: {
      http: b.status, degradado: !!b.json.degradado, titulos: cuentaTitulos(b.json), parciales429: parcialesB,
      linea: { cache: tB.cache, origen: tB.origen, publicacion: tB.publicacion, degradadoEnLinea: tB.degradadoEnLinea, descartes: tB.descartes },
      sirvioElUBCorrecto: canon(ids(b.json)) === canon(ids(sanoRes.json)) && !b.json.degradado,
      frescaReescrita: frescaB.length, ubIntacto: ubB.length === ubAntes.length && ubB.every((k, i) => k.valor === ubAntes[i].valor),
    },
  };
  // --- C. BÚSQUEDA (corrección tras la auditoría, hallazgo 2) ---------------
  // Páginas sanas + providersOf en 429 parcial persistente → 200 con títulos
  // degradados, SIN repetir la consulta en la deduplicación y SIN guardar el
  // resultado (la segunda búsqueda vuelve a pedir providers). Páginas caídas
  // (429 total) → 503 con Retry-After.
  await vaciar(base); await parcial(base); terminales(p);
  const buscar = async () => {
    const r = await fetch(`http://127.0.0.1:${p.puerto}/api/search?q=matrix&providers=${COMBO}`, { signal: AbortSignal.timeout(120000) });
    return { status: r.status, retryAfter: r.headers.get("retry-after"), json: await r.json() };
  };
  const b1 = await buscar();
  const parcialesB1 = (await control(base, "tmdb", "estado")).cuenta.parciales429 ?? 0;
  const cuenta0 = (await control(base, "tmdb", "estado")).cuenta;
  const providersB1 = Object.entries(cuenta0.porFamilia ?? {}).filter(([k]) => k.includes("watch/providers")).reduce((a, [, v]) => a + v, 0);
  const b2 = await buscar();
  const parcialesB2 = (await control(base, "tmdb", "estado")).cuenta.parciales429 ?? 0;
  const claveBusqueda = await claves(base, "^search:");
  await control(base, "tmdb", "config", { modo: "429", retryAfter: 3 });
  await control(base, "redis", "reset");
  const b3 = await buscar();
  out.busqueda = {
    parcial: {
      http: b1.status, titulos: (b1.json.titles ?? []).length, degradacion: b1.json.degradacion ?? null,
      sinPlataformas: (b1.json.titles ?? []).filter((t) => !(t.platforms ?? []).length).length,
      parciales429: parcialesB1, providersPedidos: providersB1,
      // Si el resultado degradado se hubiera guardado, la segunda búsqueda sería HIT y NO sumaría 429 nuevos.
      segundaVolvioAPedir: parcialesB2 > parcialesB1, guardado: claveBusqueda.length,
    },
    total429: { http: b3.status, retryAfter: b3.retryAfter, error: b3.json.error ?? null },
  };
  // --- D. POOLS: 429 parcial en /discover, por los DOS recorridos soportados ---
  // (auditorías sobre 708bce0 y 6ef35c5). El sitio de lib/pools.ts (un pool
  // caído se descarta y se registra) no se puede importar en node: éste es su
  // recorrido real. Con EJES_RIELES encendido el Home llega por
  // candidatosConEje; con EJES_RIELES=0 home.ts no pasa `superficie` y
  // candidatosDeSuperficie llama a candidatosDePools directo. Los dos tienen
  // que conservar el contexto: sin último bueno, con Redis vacío (cachés
  // aisladas por corrida) y el doble devolviendo 429 en una fracción de los
  // `/discover`, el Home sale degradado, con descartes contados y sin publicar.
  // Con POOL_CACHE=0 este sitio NO se alcanza (va a `discover` directo y un
  // fallo lo atrapa el `safe()` del Home): queda fuera de este escenario.
  const escenarioPools = async (proceso) => {
    await vaciar(base); await parcial(base, "/discover"); terminales(proceso);
    const d = await pedir(proceso);
    const tD = await terminal(proceso);
    const parcialesD = (await control(base, "tmdb", "estado")).cuenta.parciales429 ?? 0;
    const r = {
      familia: "/discover", ejesRieles: proceso.ejesRieles,
      http: d.status, degradado: !!d.json.degradado, fallos: d.json.fallos ?? null, titulos: cuentaTitulos(d.json),
      parciales429: parcialesD, linea: { cache: tD.cache, origen: tD.origen, publicacion: tD.publicacion, degradadoEnLinea: tD.degradadoEnLinea, descartes: tD.descartes, tmdb: tD.tmdb },
      escrito: { fresca: (await claves(base, "^home:[^:]+:v\\d+:")).length, ub: (await claves(base, "^home:ub:")).length },
    };
    r.verde = r.http === 200 && r.degradado === true && r.parciales429 > 0 && r.linea.descartes > 0 && r.escrito.fresca === 0 && r.escrito.ub === 0;
    await sano(base);
    return r;
  };
  out.pools = { conEjes: await escenarioPools(p), sinEjes: await escenarioPools(pSinEjes) };
  await sano(base);
  // --- E. PÁGINA EXTRA de un riel (auditoría sobre c6b299e) ------------------
  // El recorrido composeHome → genreRail → categoryCandidates →
  // candidatosDeSuperficie (rama `opts.ejeFijo`, con ejes; la llamada directa,
  // sin ejes) → candidatosDePools. Un 429 "parcial en /discover" agrega todas
  // las llamadas y no dice qué rama llegó al descarte; acá se fuerza la extra y
  // se identifica ESA consulta por sus parámetros:
  //   1. con el doble devolviendo 2 resultados por página, ningún riel llena su
  //      ventana de 3 páginas y todos piden la extra (página 4 para las recetas
  //      que arrancan en la 1); una corrida sana registra qué `discover` pidió;
  //   2. se elige una consulta (género + sort) que pidió la página 4 y NO la 5
  //      —o sea, la 4 fue su extra, no parte de una ventana `hondo` 4-6—;
  //   3. cachés vaciadas, el doble en modo 429-consulta sobre exactamente esa
  //      consulta (path + page + with_genres + sort_by: coincide para las tres
  //      plataformas), y el Home tiene que salir degradado, con tantos
  //      descartes como consultas rechazadas, y sin publicar.
  const escenarioExtra = async (proceso) => {
    const config = (c) => control(base, "tmdb", "config", c);
    await vaciar(base); await config({ modo: "ok", latenciaMs: 0, discoverPorPagina: 2 }); terminales(proceso);
    const sanoCorto = await pedir(proceso);
    await terminal(proceso);
    const discovers = (await control(base, "tmdb", "estado")).cuenta.discovers ?? [];
    // Consultas de /discover/movie agrupadas por (with_genres, sort_by) → páginas pedidas.
    const porReceta = new Map();
    for (const u of discovers) {
      const x = new URL(u, "http://x");
      if (x.pathname !== "/discover/movie") continue;
      const k = `${x.searchParams.get("with_genres")}|${x.searchParams.get("sort_by")}`;
      if (!porReceta.has(k)) porReceta.set(k, new Set());
      porReceta.get(k).add(Number(x.searchParams.get("page")));
    }
    const elegida = [...porReceta.entries()].find(([k, pags]) => k.split("|")[0] && pags.has(4) && !pags.has(5));
    const r = { discoverPorPagina: 2, ejesRieles: proceso.ejesRieles, sanoCorto: { http: sanoCorto.status, titulos: cuentaTitulos(sanoCorto.json), recetas: porReceta.size }, consulta: null };
    if (!elegida) { r.valido = false; r.motivo = "ninguna receta pidió la página 4 sin la 5"; await config({ modo: "ok", discoverPorPagina: 20 }); return r; }
    const [withGenres, sortBy] = elegida[0].split("|");
    r.consulta = { path: "/discover/movie", params: { page: "4", with_genres: withGenres, sort_by: sortBy } };
    await vaciar(base); await config({ modo: "429-consulta", consulta429: r.consulta, discoverPorPagina: 2 }); terminales(proceso);
    const d = await pedir(proceso);
    const tD = await terminal(proceso);
    const cuenta = (await control(base, "tmdb", "estado")).cuenta;
    r.valido = true;
    r.http = d.status; r.degradado = !!d.json.degradado; r.fallos = d.json.fallos ?? null; r.titulos = cuentaTitulos(d.json);
    r.consultas429 = (cuenta.consultas429 ?? []).length;
    r.linea = { cache: tD.cache, origen: tD.origen, publicacion: tD.publicacion, degradadoEnLinea: tD.degradadoEnLinea, descartes: tD.descartes, tmdb: tD.tmdb };
    r.escrito = { fresca: (await claves(base, "^home:[^:]+:v\\d+:")).length, ub: (await claves(base, "^home:ub:")).length };
    r.verde = r.http === 200 && r.consultas429 > 0 && r.linea.descartes === r.consultas429 && r.degradado === true && r.escrito.fresca === 0 && r.escrito.ub === 0;
    await config({ modo: "ok", latenciaMs: 0, discoverPorPagina: 20 });
    return r;
  };
  out.paginaExtra = { conEjes: await escenarioExtra(p), sinEjes: await escenarioExtra(pSinEjes) };
  // Verdicto por versión.
  out.verde = out.sinUB.http === 200 && out.sinUB.degradado === true && out.sinUB.escrito.fresca === 0 && out.sinUB.escrito.ub === 0
    && out.sinUB.parciales429 > 0 && out.conUB.parcial.sirvioElUBCorrecto && out.conUB.parcial.frescaReescrita === 0 && out.conUB.parcial.ubIntacto
    && out.busqueda.parcial.http === 200 && out.busqueda.parcial.parciales429 > 0 && (out.busqueda.parcial.degradacion?.proveedores ?? 0) > 0
    && out.busqueda.parcial.segundaVolvioAPedir && out.busqueda.parcial.guardado === 0
    && out.busqueda.total429.http === 503 && out.busqueda.total429.retryAfter === "3"
    && out.pools.conEjes.verde && out.pools.sinEjes.verde
    && out.paginaExtra.conEjes.verde === true && out.paginaExtra.sinEjes.verde === true;
  await sano(base);
  return out;
}

const salida = { fecha: FECHA, combo: COMBO, parcialP: P };
try {
  await levantarDobles(VERSIONES.antes.base); await levantarDobles(VERSIONES.despues.base);
  const pA = await levantarNext("antes", VERSIONES.antes.dir, 3000, VERSIONES.antes.base);
  const pB = await levantarNext("despues", VERSIONES.despues.dir, 3001, VERSIONES.despues.base);
  // Un segundo `next start` por versión con EJES_RIELES=0 (la variable se lee
  // del entorno del proceso): mismos dobles, Redis vaciado antes de cada corrida.
  const pA0 = { ...(await levantarNext("antes-sin-ejes", VERSIONES.antes.dir, 3002, VERSIONES.antes.base, { EJES_RIELES: "0" })), ejesRieles: "0" };
  const pB0 = { ...(await levantarNext("despues-sin-ejes", VERSIONES.despues.dir, 3003, VERSIONES.despues.base, { EJES_RIELES: "0" })), ejesRieles: "0" };
  pA.ejesRieles = "1"; pB.ejesRieles = "1";
  salida.antes = await escenarios("antes (b7be927)", pA, pA0);
  salida.despues = await escenarios("despues (3.a)", pB, pB0);
  for (const v of ["antes", "despues"]) {
    const s = salida[v];
    console.log(`[parcial] ${s.version} | sin UB: http ${s.sinUB.http}, degradado ${s.sinUB.degradado}, ${s.sinUB.titulos} títulos, ${s.sinUB.parciales429} x429 parciales, descartes ${s.sinUB.linea.descartes}, origen ${s.sinUB.linea.origen}, publicacion ${s.sinUB.linea.publicacion}, escrito fresca ${s.sinUB.escrito.fresca} ub ${s.sinUB.escrito.ub} degradadoCompartido ${s.sinUB.escrito.degradadoCompartido}`);
    console.log(`[parcial] ${s.version} | búsqueda parcial: http ${s.busqueda.parcial.http}, ${s.busqueda.parcial.titulos} títulos (${s.busqueda.parcial.sinPlataformas} sin plataformas), degradacion ${JSON.stringify(s.busqueda.parcial.degradacion)}, ${s.busqueda.parcial.parciales429} x429, segunda volvió a pedir ${s.busqueda.parcial.segundaVolvioAPedir}, guardado ${s.busqueda.parcial.guardado} | búsqueda 429 total: http ${s.busqueda.total429.http}, Retry-After ${s.busqueda.total429.retryAfter}, error ${s.busqueda.total429.error}`);
    for (const [k, q] of Object.entries(s.pools)) {
      console.log(`[parcial] ${s.version} | pools ${k} (EJES_RIELES=${q.ejesRieles}, 429 parcial en /discover): http ${q.http}, degradado ${q.degradado}, ${q.titulos} títulos, ${q.parciales429} x429 parciales, descartes ${q.linea.descartes}, origen ${q.linea.origen}, publicacion ${q.linea.publicacion}, escrito fresca ${q.escrito.fresca} ub ${q.escrito.ub} → ${q.verde ? "verde" : "rojo"}`);
    }
    for (const [k, q] of Object.entries(s.paginaExtra)) {
      if (!q.valido) { console.log(`[parcial] ${s.version} | página extra ${k}: INVÁLIDO — ${q.motivo}`); continue; }
      console.log(`[parcial] ${s.version} | página extra ${k} (EJES_RIELES=${q.ejesRieles}, 429 sólo en ${q.consulta.path} page=${q.consulta.params.page} with_genres=${q.consulta.params.with_genres} sort_by=${q.consulta.params.sort_by}): http ${q.http}, degradado ${q.degradado}, ${q.consultas429} consultas rechazadas, descartes ${q.linea.descartes}, origen ${q.linea.origen}, publicacion ${q.linea.publicacion}, escrito fresca ${q.escrito.fresca} ub ${q.escrito.ub} → ${q.verde ? "verde" : "rojo"}`);
    }
    console.log(`[parcial] ${s.version} | con UB: sano ${s.conUB.sano.titulos} títulos (publicacion ${s.conUB.sano.publicacion}); parcial → degradado ${s.conUB.parcial.degradado}, ${s.conUB.parcial.titulos} títulos, origen ${s.conUB.parcial.linea.origen}, sirvió el UB correcto: ${s.conUB.parcial.sirvioElUBCorrecto}, fresca reescrita ${s.conUB.parcial.frescaReescrita}, UB intacto ${s.conUB.parcial.ubIntacto} → ${s.verde ? "VERDE" : "ROJO"}`);
  }
  salida.resumen = { antesRojo: !salida.antes.verde, despuesVerde: salida.despues.verde, ok: !salida.antes.verde && salida.despues.verde };
  writeFileSync(SALIDA, JSON.stringify(salida, null, 2));
  console.log(`[parcial] RESUMEN ${JSON.stringify(salida.resumen)} → ${SALIDA}`);
  process.exitCode = salida.resumen.ok ? 0 : 1;
} catch (e) {
  console.error("[parcial] ERROR", e);
  process.exitCode = 1;
} finally {
  for (const h of hijos) matar(h);
}
