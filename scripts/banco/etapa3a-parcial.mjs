// El escenario de FALLO PARCIAL de la Etapa 3.a (H2, informe v4.1 §1 y §14):
// con TMDB devolviendo 429 en una fracción de los `watch/providers`, el Home
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
async function levantarNext(nombre, dir, puerto, base) {
  if (await puertoAbierto(puerto)) throw new Error(`puerto ${puerto} ocupado`);
  const log = join(LOGS, `parcial-next-${nombre}.log`);
  const fd = openSync(log, "w");
  hijos.push(spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(puerto)], { cwd: dir, env: entornoDelBanco(base), stdio: ["ignore", fd, fd], windowsHide: true }));
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
const parcial = (base) => control(base, "tmdb", "config", { modo: "429-parcial", parcialP: P, familiaParcial: "/watch/providers", retryAfter: 2 });
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

async function escenarios(nombre, p) {
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
  // Verdicto por versión.
  out.verde = out.sinUB.http === 200 && out.sinUB.degradado === true && out.sinUB.escrito.fresca === 0 && out.sinUB.escrito.ub === 0
    && out.sinUB.parciales429 > 0 && out.conUB.parcial.sirvioElUBCorrecto && out.conUB.parcial.frescaReescrita === 0 && out.conUB.parcial.ubIntacto;
  await sano(base);
  return out;
}

const salida = { fecha: FECHA, combo: COMBO, parcialP: P };
try {
  await levantarDobles(VERSIONES.antes.base); await levantarDobles(VERSIONES.despues.base);
  const pA = await levantarNext("antes", VERSIONES.antes.dir, 3000, VERSIONES.antes.base);
  const pB = await levantarNext("despues", VERSIONES.despues.dir, 3001, VERSIONES.despues.base);
  salida.antes = await escenarios("antes (b7be927)", pA);
  salida.despues = await escenarios("despues (3.a)", pB);
  for (const v of ["antes", "despues"]) {
    const s = salida[v];
    console.log(`[parcial] ${s.version} | sin UB: http ${s.sinUB.http}, degradado ${s.sinUB.degradado}, ${s.sinUB.titulos} títulos, ${s.sinUB.parciales429} x429 parciales, descartes ${s.sinUB.linea.descartes}, origen ${s.sinUB.linea.origen}, publicacion ${s.sinUB.linea.publicacion}, escrito fresca ${s.sinUB.escrito.fresca} ub ${s.sinUB.escrito.ub} degradadoCompartido ${s.sinUB.escrito.degradadoCompartido}`);
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
