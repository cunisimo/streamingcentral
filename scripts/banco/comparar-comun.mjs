// Lo común de los comparadores antes/después del banco (Home y búsqueda):
// entorno de cada versión, dobles por juego de puertos, arranque de Next,
// control de los dobles, lectura de las líneas `[home]`, y la comparación
// estructural canónica. Etapa 3.a de capacidad (#19).
import { spawn } from "node:child_process";
import { connect } from "node:net";
import { mkdirSync, openSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parsearLineaHome, esLineaTerminal, esLineaCompone, propietarioDeCompone } from "../../lib/banco-validacion.ts";

export const LOGS = process.env.BANCO_LOGS ?? ".banco-logs";
mkdirSync(LOGS, { recursive: true });
export const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
export const FECHA = process.env.BANCO_FECHA ?? "2026-09-14";

// ----------------------------------------------------------------- entorno
export function entornoDelBanco(base, extra = {}) {
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
  return { ...env, ...extra };
}
export function puertoAbierto(puerto) {
  return new Promise((resolve) => {
    const s = connect({ host: "127.0.0.1", port: puerto });
    s.once("connect", () => { s.destroy(); resolve(true); });
    s.once("error", () => resolve(false));
  });
}
export async function esperar(cond, ms, paso = 250) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await cond()) return true; await dormir(paso); }
  return false;
}

// ----------------------------------------------------------------- procesos
export const hijos = [];
export function matar(child) {
  if (process.platform === "win32") spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
  else child.kill("SIGTERM");
}
export async function levantarDobles(base) {
  for (const p of [base, base + 1, base + 2]) if (await puertoAbierto(p)) throw new Error(`puerto ${p} ocupado`);
  const log = join(LOGS, `cmp-dobles-${base}.log`);
  const fd = openSync(log, "w");
  const child = spawn(process.execPath, ["scripts/banco/dobles.mjs"], {
    env: { ...process.env, BANCO_PUERTO_BASE: String(base) }, stdio: ["ignore", fd, fd], windowsHide: true,
  });
  hijos.push(child);
  const ok = await esperar(() => puertoAbierto(base + 2), 20000);
  if (!ok) throw new Error(`los dobles en ${base} no levantaron`);
  return { base, log };
}
export async function levantarNext(nombre, dir, puerto, base, extra = {}) {
  if (await puertoAbierto(puerto)) throw new Error(`puerto ${puerto} ocupado`);
  const log = join(LOGS, `cmp-next-${nombre}.log`);
  const fd = openSync(log, "w");
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(puerto)], {
    cwd: dir, env: entornoDelBanco(base, extra), stdio: ["ignore", fd, fd], windowsHide: true,
  });
  hijos.push(child);
  const listo = await esperar(async () => {
    try { return (await fetch(`http://127.0.0.1:${puerto}/api/health`, { signal: AbortSignal.timeout(20000) })).ok; } catch { return false; }
  }, 120000, 500);
  if (!listo) throw new Error(`next ${nombre} (${dir}) no respondió /api/health en 120 s`);
  return { nombre, dir, puerto, base, log, leido: 0 };
}

// ----------------------------------------------------------------- dobles: control
export async function control(base, doble, accion, cuerpo) {
  const puerto = base + { tmdb: 0, supabase: 1, redis: 2 }[doble];
  const r = await fetch(`http://127.0.0.1:${puerto}/__banco/${accion}`, {
    method: cuerpo === undefined ? "GET" : "POST", body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return r.json();
}
export const estadoTmdb = (base) => control(base, "tmdb", "estado");
export const clavesRedis = async (base) => (await control(base, "redis", "redis", { accion: "claves", patron: "." })).length;
export async function vaciar(base) {
  await control(base, "redis", "reset");
  await control(base, "tmdb", "reset");
  await control(base, "supabase", "reset");
  return clavesRedis(base);
}

// ----------------------------------------------------------------- log de cada next
export function lineasNuevas(p) {
  const todo = readFileSync(p.log, "utf8");
  const nuevas = todo.slice(p.leido).split("\n").map((l) => l.trim()).filter((l) => l.startsWith("[home]"));
  p.leido = todo.length;
  return {
    compone: nuevas.filter(esLineaCompone).map(propietarioDeCompone),
    terminales: nuevas.filter(esLineaTerminal).map(parsearLineaHome),
  };
}
export async function terminalesDe(p, esperadas, ms = 90000) {
  const acc = { compone: [], terminales: [] };
  await esperar(() => {
    const n = lineasNuevas(p);
    acc.compone.push(...n.compone); acc.terminales.push(...n.terminales);
    return acc.terminales.length >= esperadas;
  }, ms, 200);
  return acc;
}

// ----------------------------------------------------------------- pedir
export async function pedirHome(p, providers, t) {
  const url = `http://127.0.0.1:${p.puerto}/api/home?providers=${encodeURIComponent(providers)}${t ? `&t=${encodeURIComponent(t)}` : ""}`;
  const t0 = Date.now();
  const r = await fetch(url, { signal: AbortSignal.timeout(120000) });
  const json = await r.json();
  return { status: r.status, msPared: Date.now() - t0, json };
}

// ----------------------------------------------------------------- comparación
export const canon = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x)) ? Object.fromEntries(Object.entries(x).sort()) : x);
export const claveTitulo = (i) => `${i.type}:${i.id}`;
export function diffRiel(nombre, a, b) {
  const idsA = a.map(claveTitulo), idsB = b.map(claveTitulo);
  const setA = new Set(idsA), setB = new Set(idsB);
  const platsA = new Map(a.map((i) => [claveTitulo(i), [...(i.platforms ?? [])].sort().join(",")]));
  const platsB = new Map(b.map((i) => [claveTitulo(i), [...(i.platforms ?? [])].sort().join(",")]));
  const movidos = idsA.filter((id, i) => setB.has(id) && idsB.indexOf(id) !== i);
  const plataformasCambiadas = idsA.filter((id) => setB.has(id) && platsA.get(id) !== platsB.get(id))
    .map((id) => ({ id, antes: platsA.get(id), despues: platsB.get(id) }));
  const d = {
    riel: nombre, cantidad: { antes: a.length, despues: b.length },
    ordenIgual: idsA.join(" ") === idsB.join(" "),
    anadidos: idsB.filter((id) => !setA.has(id)),
    eliminados: idsA.filter((id) => !setB.has(id)),
    movidos, plataformasCambiadas,
    jsonIgual: canon(a) === canon(b),
  };
  d.identico = d.jsonIgual && d.ordenIgual && !d.anadidos.length && !d.eliminados.length && !movidos.length && !plataformasCambiadas.length && a.length === b.length;
  return d;
}
export function compararPayload(A, B) {
  const rieles = [];
  rieles.push(diffRiel("hero", A.hero ?? [], B.hero ?? []));
  const keysA = (A.rails ?? []).map((r) => r.key), keysB = (B.rails ?? []).map((r) => r.key);
  const rielesIguales = keysA.join(" ") === keysB.join(" ");
  for (const ra of A.rails ?? []) {
    const rb = (B.rails ?? []).find((r) => r.key === ra.key);
    rieles.push(rb ? diffRiel(ra.key, ra.items ?? [], rb.items ?? []) : { riel: ra.key, faltaEnDespues: true, identico: false });
  }
  for (const rb of B.rails ?? []) if (!keysA.includes(rb.key)) rieles.push({ riel: rb.key, faltaEnAntes: true, identico: false });
  const jsonCompletoIgual = canon(A) === canon(B);
  return {
    jsonCompletoIgual, rielesIguales: rielesIguales, ordenDeRieles: { antes: keysA, despues: keysB },
    degradado: { antes: !!A.degradado, despues: !!B.degradado },
    rieles,
    identico: jsonCompletoIgual && rielesIguales && rieles.every((r) => r.identico),
  };
}
