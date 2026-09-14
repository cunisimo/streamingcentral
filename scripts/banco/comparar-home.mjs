// Comparador de IDENTIDAD del Home entre dos versiones de la app, con cachés
// completamente aisladas. Etapa 3.a de capacidad (#19) — la restricción del
// dueño: la Etapa 3 no puede alterar el contenido correcto del Home (informe
// v4.1 §1 y §14).
//
//   BANCO_ANTES_DIR=../wt-etapa3-antes node scripts/banco/comparar-home.mjs [salida.json]
//
// Dos juegos de dobles (4801-4803 para "antes", 4811-4813 para "después") y
// dos `next start` (3000 y 3001), cada uno contra SUS propios dobles: turno,
// fresca, UB, degradado, generación, cards, pools y pv3 viven separados. Como
// `VERSION_HOME` no cambia, compartir Redis dejaría que una versión leyera el
// payload que compuso la otra y diera un falso "diferencia cero"; por eso:
//
//   - corrida FRÍA: se vacía CADA Redis justo antes (DBSIZE = 0 registrado) y
//     las DOS versiones tienen que registrar `[home] compone` + `cache MISS` +
//     `1 composición`, y el doble de TMDB de cada una tiene que haber
//     recibido llamadas (y la misma cantidad);
//   - corrida CALIENTE: cada versión calienta su propia caché con su propia
//     fría; las dos tienen que dar HIT y 0 llamadas a TMDB;
//   - comparación del JSON COMPLETO (no sólo ids ni cantidad), más un
//     desglose por riel: ids, orden, cantidad, plataformas, añadidos,
//     eliminados, movidos, plataformas cambiadas;
//   - CONTROLES: cuatro mutaciones artificiales que el comparador TIENE que
//     detectar, y una corrida compartida (el "después" contra el Redis del
//     "antes", sin vaciar) que el validador TIENE que rechazar;
//   - `VERSION_HOME` idéntica en los dos fuentes (si no, corrida inválida).
//
// Todo determinístico: mismos dobles (respuestas por hash), misma fecha
// argentina (YUMP_FECHA), mismas plataformas y toggles. Sale con código 1 si
// hay una sola diferencia, una corrida inválida o un control que no falla.
import { spawn } from "node:child_process";
import { connect } from "node:net";
import { mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parsearLineaHome, esLineaTerminal, esLineaCompone, propietarioDeCompone } from "../../lib/banco-validacion.ts";

const ANTES_DIR = process.env.BANCO_ANTES_DIR;
const DESPUES_DIR = process.env.BANCO_DESPUES_DIR ?? ".";
if (!ANTES_DIR) { console.error("falta BANCO_ANTES_DIR (el worktree con el build de b7be927)"); process.exit(2); }
const FECHA = process.env.BANCO_FECHA ?? "2026-09-14";
const SALIDA = process.argv[2] ?? "docs/medidas/2026-09-14-etapa3a-identidad-home.json";
const LOGS = process.env.BANCO_LOGS ?? ".banco-logs";
mkdirSync(LOGS, { recursive: true });
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const VERSIONES = {
  antes: { dir: ANTES_DIR, puerto: 3000, base: 4801 },
  despues: { dir: DESPUES_DIR, puerto: 3001, base: 4811 },
};
const COMBOS = ["n,d,m", "n", "n,d", "d,m", "n,d,m,at,p,cr"];
const TOGGLES = ["", "accion:tv", "ultimos:tv,comedia:movie"];
const CONCURRENTES = ["n,d,m", "n,d", "d,m"];

// ----------------------------------------------------------------- entorno
function entornoDelBanco(base, extra = {}) {
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
function puertoAbierto(puerto) {
  return new Promise((resolve) => {
    const s = connect({ host: "127.0.0.1", port: puerto });
    s.once("connect", () => { s.destroy(); resolve(true); });
    s.once("error", () => resolve(false));
  });
}
async function esperar(cond, ms, paso = 250) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await cond()) return true; await dormir(paso); }
  return false;
}

// ----------------------------------------------------------------- procesos
const hijos = [];
function matar(child) {
  if (process.platform === "win32") spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
  else child.kill("SIGTERM");
}
async function levantarDobles(base) {
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
async function levantarNext(nombre, dir, puerto, base, extra = {}) {
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
async function control(base, doble, accion, cuerpo) {
  const puerto = base + { tmdb: 0, supabase: 1, redis: 2 }[doble];
  const r = await fetch(`http://127.0.0.1:${puerto}/__banco/${accion}`, {
    method: cuerpo === undefined ? "GET" : "POST", body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return r.json();
}
const estadoTmdb = (base) => control(base, "tmdb", "estado");
const clavesRedis = async (base) => (await control(base, "redis", "redis", { accion: "claves", patron: "." })).length;
async function vaciar(base) {
  await control(base, "redis", "reset");
  await control(base, "tmdb", "reset");
  await control(base, "supabase", "reset");
  return clavesRedis(base);
}

// ----------------------------------------------------------------- log de cada next
function lineasNuevas(p) {
  const todo = readFileSync(p.log, "utf8");
  const nuevas = todo.slice(p.leido).split("\n").map((l) => l.trim()).filter((l) => l.startsWith("[home]"));
  p.leido = todo.length;
  return {
    compone: nuevas.filter(esLineaCompone).map(propietarioDeCompone),
    terminales: nuevas.filter(esLineaTerminal).map(parsearLineaHome),
  };
}
async function terminalesDe(p, esperadas, ms = 90000) {
  const acc = { compone: [], terminales: [] };
  await esperar(() => {
    const n = lineasNuevas(p);
    acc.compone.push(...n.compone); acc.terminales.push(...n.terminales);
    return acc.terminales.length >= esperadas;
  }, ms, 200);
  return acc;
}

// ----------------------------------------------------------------- pedir
async function pedirHome(p, providers, t) {
  const url = `http://127.0.0.1:${p.puerto}/api/home?providers=${encodeURIComponent(providers)}${t ? `&t=${encodeURIComponent(t)}` : ""}`;
  const t0 = Date.now();
  const r = await fetch(url, { signal: AbortSignal.timeout(120000) });
  const json = await r.json();
  return { status: r.status, msPared: Date.now() - t0, json };
}

// ----------------------------------------------------------------- comparación
const canon = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x)) ? Object.fromEntries(Object.entries(x).sort()) : x);
const claveTitulo = (i) => `${i.type}:${i.id}`;
function diffRiel(nombre, a, b) {
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
function compararPayload(A, B) {
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

// ----------------------------------------------------------------- validación de una corrida fría/caliente
function validarFrio(nombre, terminales, compone, tmdbAntes, tmdbDespues, clavesAntes) {
  const t = terminales[0];
  const problemas = [];
  if (clavesAntes !== 0) problemas.push(`${nombre}: la caché no estaba vacía (${clavesAntes} claves)`);
  if (!t) problemas.push(`${nombre}: sin línea terminal`);
  else {
    if (t.cache !== "MISS") problemas.push(`${nombre}: cache ${t.cache}, se esperaba MISS (¿caché cruzada o residual?)`);
    if (t.composiciones !== 1) problemas.push(`${nombre}: ${t.composiciones} composiciones, se esperaba 1`);
    if (!(t.tmdb > 0)) problemas.push(`${nombre}: 0 llamadas a TMDB en frío`);
  }
  if (!compone.length) problemas.push(`${nombre}: sin línea [home] compone`);
  const recibidas = tmdbDespues.cuenta.peticiones - tmdbAntes.cuenta.peticiones;
  if (t && recibidas !== t.tmdb) problemas.push(`${nombre}: la app dice ${t.tmdb} llamadas y el doble recibió ${recibidas}`);
  return { problemas, tmdb: t?.tmdb ?? null, recibidas, cache: t?.cache ?? null, composiciones: t?.composiciones ?? null, compone: compone.length };
}
function validarCaliente(nombre, terminales, tmdbAntes, tmdbDespues) {
  const t = terminales[0];
  const problemas = [];
  if (!t) problemas.push(`${nombre}: sin línea terminal`);
  else if (t.cache !== "HIT") problemas.push(`${nombre}: cache ${t.cache}, se esperaba HIT`);
  const recibidas = tmdbDespues.cuenta.peticiones - tmdbAntes.cuenta.peticiones;
  if (recibidas !== 0) problemas.push(`${nombre}: ${recibidas} llamadas a TMDB en caliente`);
  return { problemas, cache: t?.cache ?? null, recibidas };
}

// ----------------------------------------------------------------- escenarios
const salida = { fecha: FECHA, versiones: {}, escenarios: [], controles: {}, resumen: {} };
let procs = {};

async function corridaPar(id, providers, t) {
  // FRÍA: vaciar cada Redis, pedir en las dos, validar y comparar.
  const clavesAntes = { antes: await vaciar(VERSIONES.antes.base), despues: await vaciar(VERSIONES.despues.base) };
  for (const v of Object.values(procs)) lineasNuevas(v);
  const tmdb0 = { antes: await estadoTmdb(VERSIONES.antes.base), despues: await estadoTmdb(VERSIONES.despues.base) };
  const [rA, rB] = await Promise.all([pedirHome(procs.antes, providers, t), pedirHome(procs.despues, providers, t)]);
  const lA = await terminalesDe(procs.antes, 1), lB = await terminalesDe(procs.despues, 1);
  const tmdb1 = { antes: await estadoTmdb(VERSIONES.antes.base), despues: await estadoTmdb(VERSIONES.despues.base) };
  const frio = {
    antes: validarFrio("antes", lA.terminales, lA.compone, tmdb0.antes, tmdb1.antes, clavesAntes.antes),
    despues: validarFrio("despues", lB.terminales, lB.compone, tmdb0.despues, tmdb1.despues, clavesAntes.despues),
  };
  const problemasFrio = [...frio.antes.problemas, ...frio.despues.problemas];
  if (frio.antes.tmdb !== frio.despues.tmdb) problemasFrio.push(`llamadas a TMDB distintas en frío: antes ${frio.antes.tmdb}, despues ${frio.despues.tmdb}`);
  if (rA.status !== 200 || rB.status !== 200) problemasFrio.push(`HTTP ${rA.status} / ${rB.status}`);
  const cmpFrio = compararPayload(rA.json, rB.json);
  // CALIENTE: sin vaciar; cada versión lee lo que ella misma escribió.
  for (const v of Object.values(procs)) lineasNuevas(v);
  const tmdb2 = { antes: await estadoTmdb(VERSIONES.antes.base), despues: await estadoTmdb(VERSIONES.despues.base) };
  const [cA, cB] = await Promise.all([pedirHome(procs.antes, providers, t), pedirHome(procs.despues, providers, t)]);
  const mA = await terminalesDe(procs.antes, 1), mB = await terminalesDe(procs.despues, 1);
  const tmdb3 = { antes: await estadoTmdb(VERSIONES.antes.base), despues: await estadoTmdb(VERSIONES.despues.base) };
  const caliente = {
    antes: validarCaliente("antes", mA.terminales, tmdb2.antes, tmdb3.antes),
    despues: validarCaliente("despues", mB.terminales, tmdb2.despues, tmdb3.despues),
  };
  const cmpCaliente = compararPayload(cA.json, cB.json);
  const cmpFrioVsCaliente = compararPayload(rA.json, cA.json);
  const e = {
    id, providers, t, clavesAntes,
    frio: { ...frio, problemas: problemasFrio, comparacion: cmpFrio, msPared: { antes: rA.msPared, despues: rB.msPared } },
    caliente: { ...caliente, problemas: [...caliente.antes.problemas, ...caliente.despues.problemas], comparacion: cmpCaliente, msPared: { antes: cA.msPared, despues: cB.msPared } },
    frioVsCalienteAntes: cmpFrioVsCaliente.identico,
    valido: problemasFrio.length === 0 && caliente.antes.problemas.length === 0 && caliente.despues.problemas.length === 0,
    identico: cmpFrio.identico && cmpCaliente.identico,
  };
  salida.escenarios.push(e);
  console.log(`[cmp] ${id} providers=${providers} t=${t || "-"} | frío: tmdb ${frio.antes.tmdb}/${frio.despues.tmdb} compone ${frio.antes.compone}/${frio.despues.compone} ${cmpFrio.identico ? "IDÉNTICO" : "DIFIERE"} | caliente: ${caliente.antes.cache}/${caliente.despues.cache} ${cmpCaliente.identico ? "IDÉNTICO" : "DIFIERE"} | ${e.valido ? "válido" : "INVÁLIDO: " + [...problemasFrio, ...caliente.antes.problemas, ...caliente.despues.problemas].join("; ")}`);
  return e;
}

async function corridaConcurrente() {
  const clavesAntes = { antes: await vaciar(VERSIONES.antes.base), despues: await vaciar(VERSIONES.despues.base) };
  for (const v of Object.values(procs)) lineasNuevas(v);
  const tmdb0 = { antes: await estadoTmdb(VERSIONES.antes.base), despues: await estadoTmdb(VERSIONES.despues.base) };
  const [resA, resB] = await Promise.all([
    Promise.all(CONCURRENTES.map((c) => pedirHome(procs.antes, c, ""))),
    Promise.all(CONCURRENTES.map((c) => pedirHome(procs.despues, c, ""))),
  ]);
  const lA = await terminalesDe(procs.antes, CONCURRENTES.length), lB = await terminalesDe(procs.despues, CONCURRENTES.length);
  const tmdb1 = { antes: await estadoTmdb(VERSIONES.antes.base), despues: await estadoTmdb(VERSIONES.despues.base) };
  const porCombo = CONCURRENTES.map((c, i) => ({ providers: c, comparacion: compararPayload(resA[i].json, resB[i].json) }));
  const composiciones = { antes: lA.terminales.reduce((a, t) => a + (t.composiciones ?? 0), 0), despues: lB.terminales.reduce((a, t) => a + (t.composiciones ?? 0), 0) };
  const compone = { antes: lA.compone.length, despues: lB.compone.length };
  const recibidas = { antes: tmdb1.antes.cuenta.peticiones - tmdb0.antes.cuenta.peticiones, despues: tmdb1.despues.cuenta.peticiones - tmdb0.despues.cuenta.peticiones };
  const problemas = [];
  if (clavesAntes.antes !== 0 || clavesAntes.despues !== 0) problemas.push("caché no vacía");
  if (composiciones.antes !== CONCURRENTES.length || composiciones.despues !== CONCURRENTES.length) problemas.push(`composiciones ${composiciones.antes}/${composiciones.despues}, se esperaban ${CONCURRENTES.length}`);
  if (compone.antes !== CONCURRENTES.length || compone.despues !== CONCURRENTES.length) problemas.push(`compone ${compone.antes}/${compone.despues}`);
  if (recibidas.antes !== recibidas.despues) problemas.push(`TMDB recibió ${recibidas.antes} vs ${recibidas.despues}`);
  const e = { id: "concurrente", combos: CONCURRENTES, clavesAntes, composiciones, compone, recibidas, porCombo, problemas, valido: problemas.length === 0, identico: porCombo.every((p) => p.comparacion.identico) };
  salida.escenarios.push(e);
  console.log(`[cmp] concurrente ${CONCURRENTES.join(" | ")} | composiciones ${composiciones.antes}/${composiciones.despues} | TMDB ${recibidas.antes}/${recibidas.despues} | ${e.identico ? "IDÉNTICO" : "DIFIERE"} | ${e.valido ? "válido" : "INVÁLIDO: " + problemas.join("; ")}`);
}

// Controles del comparador: cuatro mutaciones que TIENE que detectar.
function controlesDelComparador(payload) {
  const clon = () => JSON.parse(JSON.stringify(payload));
  const rielCon = (p) => p.rails.find((r) => (r.items ?? []).length >= 3);
  const mut = {};
  { const p = clon(); rielCon(p).items.splice(1, 1); mut.eliminar = compararPayload(payload, p); }
  { const p = clon(); const r = rielCon(p); r.items.push({ ...r.items[0], id: 999999999 }); mut.agregar = compararPayload(payload, p); }
  { const p = clon(); const r = rielCon(p); [r.items[0], r.items[1]] = [r.items[1], r.items[0]]; mut.mover = compararPayload(payload, p); }
  { const p = clon(); const r = rielCon(p); r.items[0].platforms = [...(r.items[0].platforms ?? []), "zz"]; mut.plataforma = compararPayload(payload, p); }
  const detectadas = Object.fromEntries(Object.entries(mut).map(([k, v]) => [k, !v.identico]));
  return { detectadas, todasDetectadas: Object.values(detectadas).every(Boolean), detalle: mut };
}

// Control de aislamiento: el "después" contra el Redis del "antes", sin vaciar.
async function controlCompartido() {
  const compartido = await levantarNext("despues-compartido", VERSIONES.despues.dir, 3002, VERSIONES.antes.base);
  try {
    // El "antes" ya escribió n,d,m en su Redis (última corrida caliente): sin
    // vaciar, el "después" compartido lo encuentra. El validador de FRÍO tiene
    // que rechazarlo.
    lineasNuevas(compartido);
    const claves = await clavesRedis(VERSIONES.antes.base);
    const tmdb0 = await estadoTmdb(VERSIONES.antes.base);
    await pedirHome(compartido, "n,d,m", "");
    const l = await terminalesDe(compartido, 1);
    const tmdb1 = await estadoTmdb(VERSIONES.antes.base);
    const v = validarFrio("despues-compartido", l.terminales, l.compone, tmdb0, tmdb1, claves);
    const rechazada = v.problemas.length > 0;
    console.log(`[cmp] control compartido: ${rechazada ? "RECHAZADA por el validador" : "ACEPTADA (validador roto)"} — ${v.problemas.join("; ")}`);
    return { rechazada, validacion: v, clavesEnRedisAntes: claves };
  } finally {
    matar(hijos.pop());
    await dormir(1500);
  }
}

// ----------------------------------------------------------------- main
try {
  // `VERSION_HOME` es un número con un override sólo para el banco: se lee el
  // valor por defecto (`: <n>;`) del fuente de cada versión.
  const vh = (dir) => (readFileSync(join(dir, "lib/claves.ts"), "utf8").match(/export const VERSION_HOME[\s\S]*?:\s*(\d+);/) ?? [])[1] ?? null;
  salida.versiones = {
    antes: { dir: ANTES_DIR, versionHome: vh(ANTES_DIR), dobles: VERSIONES.antes.base, puerto: 3000 },
    despues: { dir: DESPUES_DIR, versionHome: vh(DESPUES_DIR), dobles: VERSIONES.despues.base, puerto: 3001 },
  };
  if (!salida.versiones.antes.versionHome || salida.versiones.antes.versionHome !== salida.versiones.despues.versionHome) {
    throw new Error(`VERSION_HOME difiere o no se pudo leer: ${salida.versiones.antes.versionHome} vs ${salida.versiones.despues.versionHome}`);
  }
  await levantarDobles(VERSIONES.antes.base);
  await levantarDobles(VERSIONES.despues.base);
  procs.antes = await levantarNext("antes", VERSIONES.antes.dir, VERSIONES.antes.puerto, VERSIONES.antes.base);
  procs.despues = await levantarNext("despues", VERSIONES.despues.dir, VERSIONES.despues.puerto, VERSIONES.despues.base);
  console.log(`[cmp] antes ${ANTES_DIR} :3000 → dobles ${VERSIONES.antes.base}; despues ${DESPUES_DIR} :3001 → dobles ${VERSIONES.despues.base}; fecha ${FECHA}; VERSION_HOME ${salida.versiones.antes.versionHome}`);

  let n = 0;
  for (const c of COMBOS) for (const t of TOGGLES) await corridaPar(`E${++n}`, c, t);
  await corridaConcurrente();
  // Controles del comparador sobre un payload real del "después".
  const base = salida.escenarios[0]?.frio?.comparacion?.identico ? (await pedirHome(procs.despues, "n,d,m", "")).json : null;
  salida.controles.mutaciones = base ? controlesDelComparador(base) : { todasDetectadas: false, motivo: "sin payload base" };
  console.log(`[cmp] control mutaciones: ${JSON.stringify(salida.controles.mutaciones.detectadas)}`);
  salida.controles.compartido = await controlCompartido();

  const escenarios = salida.escenarios;
  salida.resumen = {
    escenarios: escenarios.length,
    validos: escenarios.filter((e) => e.valido).length,
    identicos: escenarios.filter((e) => e.identico).length,
    diferencias: escenarios.filter((e) => !e.identico).map((e) => e.id),
    invalidos: escenarios.filter((e) => !e.valido).map((e) => e.id),
    controlMutaciones: salida.controles.mutaciones.todasDetectadas,
    controlCompartidoRechazado: salida.controles.compartido.rechazada,
    versionHome: salida.versiones.antes.versionHome,
  };
  salida.resumen.verde = salida.resumen.validos === escenarios.length && salida.resumen.identicos === escenarios.length
    && salida.resumen.controlMutaciones && salida.resumen.controlCompartidoRechazado;
  const archivo = salida.resumen.verde ? SALIDA : SALIDA.replace(/\.json$/, "-DIFERENCIAS.json");
  writeFileSync(archivo, JSON.stringify(salida, null, 2));
  console.log(`[cmp] RESUMEN ${JSON.stringify(salida.resumen)} → ${archivo}`);
  process.exitCode = salida.resumen.verde ? 0 : 1;
} catch (e) {
  console.error("[cmp] ERROR", e);
  process.exitCode = 1;
} finally {
  for (const h of hijos) matar(h);
}
