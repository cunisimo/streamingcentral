// El banco MULTIPROCESO de la Etapa 2 (#17): K procesos de Next contra los
// MISMOS dobles, para medir el turno distribuido y el último bueno. No es una
// prueba de carga ni mide capacidad de Producción.
//
//   node scripts/banco/dobles.mjs                       (en otra terminal)
//   BANCO_PROCESOS=3 node scripts/banco/correr-etapa2.mjs [salida.json]
//
// Requiere el build hecho con `source scripts/banco/entorno.sh && npm run build`
// en un worktree SIN `.env.local`. `BANCO_APP_DIR` (default `.`) es el directorio
// del build que se levanta: con él se mide un "antes" (otro worktree) con este
// MISMO corredor y los mismos dobles. `BANCO_SOLO=E2,E3` acota los escenarios.
//
// Conserva las cuatro garantías del corredor de la Etapa 0/1 (scripts/banco/correr.mjs):
// aislamiento por quiescencia (con reinicio demostrado de TODOS los procesos si
// queda algo activo), correlación por clave, validación automática contra los
// dobles (lib/banco-validacion.ts) y "un timeout del cliente no es una
// finalización". Suma: varios procesos (puertos 3000…), variables por proceso
// (YUMP_FECHA, YUMP_BANCO_VERSION_HOME), matar un proceso al ver su línea
// `compone` (E-muere), solicitudes escalonadas (E-rafaga), el registro del
// turno y los bytes de los dobles, y los controles del doble de Redis
// (borrar/expirar claves, perder una respuesta, fallar EVAL).
import { readFileSync, writeFileSync, openSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { connect } from "node:net";
import { join } from "node:path";
import {
  validarEscenario, validarCorrida, sufijoDeClave, parsearLineaHome, esLineaTerminal, esLineaPedido, claveDePedido,
  esLineaCompone, propietarioDeCompone,
} from "../../lib/banco-validacion.ts";

const APP_DIR = process.env.BANCO_APP_DIR ?? ".";
const K = Number(process.env.BANCO_PROCESOS ?? "3");
const PUERTO0 = 3000;
const DOBLES = { tmdb: "http://127.0.0.1:4801", supabase: "http://127.0.0.1:4802", redis: "http://127.0.0.1:4803" };
const SALIDA = process.argv[2] ?? "docs/medidas/2026-09-13-etapa2-banco.json";
const SOLO = process.env.BANCO_SOLO ? new Set(process.env.BANCO_SOLO.split(",")) : null;
const LOGS = process.env.BANCO_LOGS ?? ".banco-logs";
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const hoyAR = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
const mananaAR = () => hoyAR(new Date(Date.now() + 86400000));

function entornoDelBanco(extra = {}) {
  const env = { ...process.env };
  for (const l of readFileSync("scripts/banco/entorno.sh", "utf8").split("\n")) {
    const m = l.match(/^export ([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
    const u = l.match(/^unset (.+)$/);
    if (u) for (const k of u[1].split(/\s+/)) delete env[k];
  }
  delete env.YUMP_FECHA; delete env.YUMP_BANCO_VERSION_HOME;
  return { ...env, ...extra };
}

// ----------------------------------------------------------------- K procesos de Next
mkdirSync(LOGS, { recursive: true });
const procs = [];            // índice i → { child, log, pid, puerto, n, leido, pedidos, terminales, compone, extra }
let arranques = 0;
const reinicios = [];
function puertoAbierto(puerto) {
  return new Promise((resolve) => {
    const s = connect({ host: "127.0.0.1", port: puerto });
    s.once("connect", () => { s.destroy(); resolve(true); });
    s.once("error", () => resolve(false));
  });
}
async function esperar(cond, ms, paso = 250) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) { if (await cond()) return true; await dormir(paso); }
  return false;
}
async function arrancar(i, motivo, extra = {}) {
  const puerto = PUERTO0 + i;
  if (await puertoAbierto(puerto)) throw new Error(`el puerto ${puerto} ya está ocupado: hay otro proceso; no se mide contra un servidor ajeno`);
  arranques += 1;
  const log = join(LOGS, `e2-next-${i}-${arranques}.log`);
  const fd = openSync(log, "w");
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(puerto)], {
    cwd: APP_DIR, env: entornoDelBanco(extra), stdio: ["ignore", fd, fd], windowsHide: true,
  });
  let estadoHealth = null;
  const listo = await esperar(async () => {
    try { estadoHealth = (await fetch(`http://127.0.0.1:${puerto}/api/health`, { signal: AbortSignal.timeout(20000) })).status; return true; } catch { return false; }
  }, 90000, 500);
  if (!listo) throw new Error(`Next #${i} no respondió /api/health en 90 s`);
  procs[i] = { child, log, pid: child.pid, puerto, n: arranques, leido: 0, pedidos: 0, terminales: 0, compone: 0, extra };
  console.log(`[corredor] next #${i} pid ${child.pid} :${puerto} listo, /api/health ${estadoHealth} (${motivo})${Object.keys(extra).length ? " " + JSON.stringify(extra) : ""}; log ${log}`);
}
async function detener(i, motivo) {
  const p = procs[i];
  if (!p) return null;
  const salida = new Promise((resolve) => p.child.once("exit", (code, signal) => resolve({ code, signal })));
  if (process.platform === "win32") spawn("taskkill", ["/PID", String(p.pid), "/T", "/F"], { windowsHide: true });
  else p.child.kill("SIGKILL");
  const { code, signal } = await salida;
  const cerrado = await esperar(async () => !(await puertoAbierto(p.puerto)), 15000);
  if (!cerrado) throw new Error(`el puerto ${p.puerto} sigue abierto después de matar el pid ${p.pid}`);
  const prueba = { motivo, proceso: i, pidViejo: p.pid, exit: { code, signal }, puertoCerrado: true, activasQueQuedaban: p.pedidos - p.terminales };
  console.log(`[corredor] next #${i} pid ${p.pid} terminado (exit ${JSON.stringify({ code, signal })}), puerto ${p.puerto} cerrado — ${motivo}`);
  // El log del muerto se sigue leyendo (su línea `compone` es la evidencia de
  // la composición interrumpida); lo que no se hace es pedirle nada ni contar
  // sus solicitudes como activas en el servidor: ya no hay servidor.
  p.muerto = true;
  return prueba;
}
async function reiniciar(i, motivo, extra = {}) {
  const prueba = await detener(i, motivo);
  await arrancar(i, `reinicio: ${motivo}`, extra);
  reinicios.push({ ...prueba, pidNuevo: procs[i].pid, extra });
}
async function reiniciarTodos(motivo) {
  for (let i = 0; i < K; i++) if (procs[i] && !procs[i].muerto) await detener(i, motivo);
  await sanos();
  for (let i = 0; i < K; i++) await arrancar(i, `reinicio: ${motivo}`);
  reinicios.push({ motivo, todos: true });
}

// ----------------------------------------------------------------- control de los dobles
const control = async (d, ruta, cuerpo) => (await fetch(`${DOBLES[d]}/__banco/${ruta}`, cuerpo ? { method: "POST", body: JSON.stringify(cuerpo) } : {})).json();
const estados = async () => Object.fromEntries(await Promise.all(Object.keys(DOBLES).map(async (d) => [d, await control(d, "estado")])));
const configurar = (d, c) => control(d, "config", c);
const redis = (c) => control("redis", "redis", c);
const sanos = async () => { for (const d of Object.keys(DOBLES)) await configurar(d, { modo: "ok", latenciaMs: 0 }); };
const resetear = async (...ds) => { for (const d of ds) await control(d, "reset"); };
const FRESCA = "^home:[^:]+:v\\d+:";     // la fresca (con huella) y no ub/gen/degradado/turno
const expirarFresca = () => redis({ accion: "expirar", patron: FRESCA });

// ----------------------------------------------------------------- el log de cada proceso
const FILTRO = (l) => l.startsWith("[home]") || l.startsWith("[cache]") || l.startsWith("[tmdb]");
function lineasNuevas() {
  const out = { pedidos: [], terminales: [], compone: [], cacheErrores: 0 };
  for (const p of procs) {
    if (!p) continue;
    const todo = readFileSync(p.log, "utf8");
    const nuevas = todo.slice(p.leido).split("\n").map((l) => l.trim()).filter(FILTRO);
    p.leido = todo.length;
    const pedidos = nuevas.filter(esLineaPedido).map(claveDePedido);
    const terminales = nuevas.filter(esLineaTerminal).map(parsearLineaHome);
    const compone = nuevas.filter(esLineaCompone).map(propietarioDeCompone);
    p.pedidos += pedidos.length; p.terminales += terminales.length; p.compone += compone.length;
    out.pedidos.push(...pedidos); out.terminales.push(...terminales); out.compone.push(...compone);
    out.cacheErrores += nuevas.filter((l) => l.startsWith("[cache]")).length;
  }
  return out;
}
const activas = () => procs.reduce((a, p) => a + (p && !p.muerto ? p.pedidos - p.terminales : 0), 0);
async function quiescencia(ms) {
  await esperar(() => { lineasNuevas(); return activas() === 0; }, ms, 200);
  lineasNuevas();
  return activas();
}
/** Espera a que aparezca una línea `compone` nueva en algún proceso; devuelve {i, compone}. */
async function esperarCompone(ms) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    for (let i = 0; i < K; i++) {
      const p = procs[i]; if (!p || p.muerto) continue;
      const todo = readFileSync(p.log, "utf8").slice(p.leido);
      const l = todo.split("\n").map((x) => x.trim()).find(esLineaCompone);
      if (l) return { i, compone: propietarioDeCompone(l) };
    }
    await dormir(100);
  }
  return null;
}

// ----------------------------------------------------------------- pedir a la app
// `en`: índices de proceso, en orden de reparto (round-robin por defecto sobre
// todos los vivos); `cadaMs`: escalonado (una solicitud cada tantos ms).
async function pedir(query, veces, timeoutMs, { en = null, cadaMs = 0 } = {}) {
  const t0 = Date.now();
  const vivos = en ?? procs.map((p, i) => (p && !p.muerto ? i : null)).filter((i) => i !== null);
  const rs = await Promise.all(Array.from({ length: veces }, async (_, j) => {
    if (cadaMs) await dormir(j * cadaMs);
    const i = vivos[j % vivos.length];
    const t = Date.now();
    try {
      const r = await fetch(`http://127.0.0.1:${procs[i].puerto}/api/home?${query}`, { signal: AbortSignal.timeout(timeoutMs) });
      const jn = await r.json().catch(() => null);
      return { proceso: i, estado: r.status, ms: Date.now() - t, hero: jn?.hero?.length ?? null, rails: jn?.rails?.length ?? null, degradado: jn?.degradado ?? null, motivo: jn?.motivo ?? null };
    } catch (e) { return { proceso: i, estado: null, ms: Date.now() - t, error: String(e?.name ?? e) }; }
  }));
  return { respuestas: rs, msPared: Date.now() - t0 };
}

const delta = (a, b) => ({
  tmdb: b.tmdb.cuenta.peticiones - a.tmdb.cuenta.peticiones,
  tmdbPorFamilia: Object.fromEntries(Object.entries(b.tmdb.cuenta.porFamilia).map(([k, v]) => [k, v - (a.tmdb.cuenta.porFamilia[k] ?? 0)]).filter(([, v]) => v)),
  supabase: b.supabase.cuenta.peticiones - a.supabase.cuenta.peticiones,
  redisHttp: b.redis.cuenta.peticiones - a.redis.cuenta.peticiones,
  redisComandos: b.redis.comandos.total - a.redis.comandos.total,
  redisErrores: b.redis.comandos.errores - a.redis.comandos.errores,
  redisPorComando: Object.fromEntries(Object.entries(b.redis.comandos.porComando).map(([k, v]) => [k, v - (a.redis.comandos.porComando[k] ?? 0)]).filter(([, v]) => v)),
  redisBytes: { recibidos: b.redis.cuenta.bytes.recibidos - a.redis.cuenta.bytes.recibidos, enviados: b.redis.cuenta.bytes.enviados - a.redis.cuenta.bytes.enviados },
  registroTurno: b.redis.registro.slice(a.redis.registro.length),
});

// ----------------------------------------------------------------- un escenario
const resultados = [];
const validaciones = [];
async function escenario(id, titulo, query, opts = {}) {
  if (SOLO && id !== "C0" && !SOLO.has(id)) return null;
  const { veces = 1, timeoutMs = 300000, preparar, durante, permiteIncompleto = false, quiescenciaMs = 5000, esperado, en = null, cadaMs = 0, tras } = opts;
  const activasAntes = await quiescencia(quiescenciaMs);
  if (activasAntes > 0) await reiniciarTodos(`${activasAntes} solicitud(es) activa(s) antes de ${id}`);
  await sanos();
  if (preparar) await preparar();
  lineasNuevas();
  const inicio = procs.map((p) => (p ? p.leido : 0));
  const antes = await estados();
  const enCurso = pedir(query, veces, timeoutMs, { en, cadaMs });
  // `durante` puede hacer solicitudes propias (otro proceso, otra fecha): las
  // deja en `extras` y se cuentan como parte del escenario.
  const extras = [];
  const eventos = durante ? await durante(extras) : [];
  const r = await enCurso;
  r.respuestas.push(...extras);
  // Solicitudes a un proceso que el corredor MATÓ durante el escenario: quedan
  // declaradas como interrumpidas (E-muere), no como incompletas.
  const interrumpidas = r.respuestas.filter((x) => x.estado === null && procs[x.proceso]?.muerto).length;
  const extraTras = tras ? await tras(r) : {};
  const activasAlCerrar = await quiescencia(permiteIncompleto ? 2000 : quiescenciaMs);
  const despues = await estados();
  const ls = [];
  for (let i = 0; i < K; i++) {
    const p = procs[i]; if (!p) continue;
    ls.push(...readFileSync(p.log, "utf8").slice(inicio[i] ?? 0, p.leido).split("\n").map((l) => l.trim()).filter(FILTRO).map((l) => `#${i} ${l}`));
  }
  const sin = (l) => l.replace(/^#\d+ /, "");
  const nuevas = ls.map(sin).filter((l) => !l.startsWith("[cache]"));
  const pedidos = ls.map(sin).filter(esLineaPedido).map(claveDePedido);
  const terminales = ls.map(sin).filter(esLineaTerminal).map(parsearLineaHome);
  const compone = ls.map(sin).filter(esLineaCompone).map(propietarioDeCompone);
  const cacheErrores = ls.filter((l) => sin(l).startsWith("[cache]")).length;
  const d = delta(antes, despues);
  const observado = { id, query, veces: r.respuestas.length, claveSufijo: sufijoDeClave(query), respuestas: r.respuestas, pedidos, terminales, dobles: d, permiteIncompleto, ventanaMs: timeoutMs, esperado, compone, registroTurno: d.registroTurno, interrumpidas };
  const v = validarEscenario(observado);
  validaciones.push(v);
  const salida = { id, titulo, query, veces: r.respuestas.length, timeoutMs, permiteIncompleto, interrumpidas, procesos: K, msPared: r.msPared, respuestas: r.respuestas, eventos, ...extraTras, pedidos: pedidos.length, activasAlCerrar, lineas: nuevas, terminales, compone, lineasCacheError: cacheErrores, dobles: d, validacion: v };
  resultados.push(salida);
  console.log(`\n== ${id} ${titulo}\n   ${veces}× ${query} → ${r.respuestas.map((x) => `${x.estado ?? `abortada(${x.error})`}@#${x.proceso}`).join(",")} en ${r.msPared}ms de pared${eventos.length ? ` | eventos: ${eventos.map((e) => `${e.que}@${e.ms}ms`).join(", ")}` : ""}`);
  const mostrar = terminales.length > 6 ? terminales.slice(0, 4) : terminales;
  for (const x of mostrar) console.log(`   app: cache ${x.cache} | comp ${x.composiciones} | esperas ${x.esperas} | turno ${x.turno ?? "-"} | origen ${x.origen ?? "-"} | pub ${x.publicacion ?? "-"} | renov ${x.renovaciones ?? "-"} | tmdb ${x.tmdb} | redis ${x.redisIntentos}/${x.redisComandos} | ${x.msTotal}ms`);
  if (terminales.length > 6) console.log(`   … ${terminales.length} líneas: ${JSON.stringify(v.home)}`);
  console.log(`   turno: ${JSON.stringify(v.turno)}`);
  console.log(`   dobles: tmdb ${d.tmdb} | supabase ${d.supabase} | redis http ${d.redisHttp} / comandos ${d.redisComandos} (+${d.redisErrores} err) ${JSON.stringify(d.redisPorComando)} | bytes redis ${d.redisBytes.recibidos}↑ ${d.redisBytes.enviados}↓`);
  console.log(`   ${v.valida ? "✅" : "🔴"} ${v.estado}: ${v.resumen}${v.problemas.length ? "\n      - " + v.problemas.join("\n      - ") : ""}`);
  if (activasAlCerrar > 0) await reiniciarTodos(`${activasAlCerrar} solicitud(es) activa(s) al cerrar ${id}`);
  return salida;
}

// ----------------------------------------------------------------- CORRIDA
await sanos();
for (let i = 0; i < K; i++) await arrancar(i, "arranque");
await resetear("tmdb", "supabase", "redis");
const cero = await estados();
if (cero.tmdb.cuenta.peticiones !== 0 || cero.redis.cuenta.peticiones !== 0) throw new Error("los dobles no arrancaron en cero");

const NDM = "providers=n,d,m";
const ANTES = process.env.BANCO_ETAPA === "1";   // un build de la Etapa 1: sin turno; las afirmaciones de la Etapa 2 no aplican
const E2 = (x) => (ANTES ? undefined : x);

await escenario("C0", "control: la app habla con los dobles", NDM, { en: [0] });
if (!resultados[0].dobles.tmdb || !resultados[0].dobles.redisHttp) { console.error("🔴 la app no está hablando con los dobles"); process.exit(1); }

// --- Línea base por proceso (comparable con la Etapa 1) y el HIT en bytes
await escenario("B1", "Home FRÍO, una solicitud, un proceso", NDM, { en: [0], preparar: () => resetear("redis"), esperado: { composiciones: 1, ...E2({ publicaciones: 1, origenes: { propia: 1 } }) } });
await escenario("B2", "Home CALIENTE, una solicitud: el HIT tiene que transferir UNA copia", NDM, { en: [0], esperado: { cacheDeTodas: "HIT", tmdb: 0, supabase: 0 } });
await escenario("B2b", "…el HIT desde OTRO proceso (misma base): también una copia", NDM, { en: [1], esperado: { cacheDeTodas: "HIT", tmdb: 0, supabase: 0 } });
await escenario("E1", "Etapa 1 intacta: 100 simultáneas en UN proceso con caché fría → 1 composición + 99 esperas compartidas", NDM, {
  veces: 100, en: [0], timeoutMs: 600000, quiescenciaMs: 15000, preparar: () => resetear("redis"), esperado: { composiciones: 1, esperas: 99 },
});

// --- E2: la clave fría en K procesos a la vez
await escenario("E2", `${K} procesos × 34 simultáneas, misma clave fría: UNA composición entre procesos; los otros líderes esperan (sin UB todavía)`, "providers=n,d,m,pp", {
  veces: 34 * K, timeoutMs: 600000, quiescenciaMs: 15000, preparar: () => resetear("redis"),
  esperado: ANTES ? undefined : { composiciones: 1, publicaciones: 1, origenes: { propia: 1, esperada: K - 1 } },
});
await escenario("E2h", "…y en cada proceso la siguiente es HIT", "providers=n,d,m,pp", { veces: K, esperado: { cacheDeTodas: "HIT", tmdb: 0, supabase: 0 } });

// --- E3: la fresca vence y hay UB → los demás sirven el último bueno en tiempo de HIT
await escenario("E3", "fresca expirada por control del doble, UB presente: uno compone, los demás UB en el acto", "providers=n,d,m,pp", {
  veces: K, preparar: expirarFresca,
  esperado: E2({ composiciones: 1, publicaciones: 1, origenes: { propia: 1, "ultimo-bueno": K - 1 } }),
});
await escenario("E3h", "…y la siguiente es HIT del payload nuevo", "providers=n,d,m,pp", { veces: 1, esperado: { cacheDeTodas: "HIT", tmdb: 0 } });

// --- E-renueva: composición más larga que TURNO_MS → renovaciones, sigue siendo una
await escenario("E-renueva", "TMDB +400 ms por llamada (composición > 15 s): el propietario renueva; ningún SET NX ajeno prospera", "providers=n,d,m,vx", {
  veces: K, timeoutMs: 120000, quiescenciaMs: 10000,
  preparar: async () => { await resetear("redis"); await configurar("tmdb", { latenciaMs: 400 }); },
  esperado: E2({ composiciones: 1, publicaciones: 1, setNxOk: 1, renovacionesMin: 1, origenes: { propia: 1, esperada: K - 1 } }),
});

// --- E-muere: matar al propietario al ver su línea `compone`; otro rescata al vencer el turno
await escenario("E-muere", "el corredor mata el proceso propietario tras ver `compone`: el turno vence, EXACTAMENTE UNO rescata, nadie compone sin turno", "providers=n,d,m,mb", {
  veces: K, timeoutMs: 120000, quiescenciaMs: 10000,
  preparar: async () => { await resetear("redis"); await configurar("tmdb", { latenciaMs: 200 }); },
  durante: async () => {
    const t = Date.now();
    const c = await esperarCompone(30000);
    if (!c) return [{ que: "no se vio compone", ms: Date.now() - t }];
    const prueba = await detener(c.i, `E-muere: propietario ${c.compone.propietario} asesinado tras compone`);
    reinicios.push({ ...prueba, escenario: "E-muere" });
    return [{ que: `matado #${c.i} (${c.compone.propietario})`, ms: Date.now() - t }];
  },
  esperado: E2({ publicaciones: 1, origenes: { propia: 1, esperada: K - 2 } }),
});
for (let i = 0; i < K; i++) if (!procs[i] || procs[i].muerto) await arrancar(i, "vuelve el proceso asesinado en E-muere");

// --- E-tarde: el turno se borra a mitad; otro lo toma y publica; el viejo termina y es rechazado
await escenario("E-tarde", "el doble borra el turno a mitad; otro proceso lo toma y publica; el viejo termina después: PUBLICAR rechazado, un solo publicado", "providers=n,d,m,un", {
  veces: 1, en: [0], timeoutMs: 120000, quiescenciaMs: 40000,
  preparar: async () => { await resetear("redis"); await configurar("tmdb", { latenciaMs: 400 }); },
  durante: async (extras) => {
    const t = Date.now();
    await esperarCompone(30000);
    await dormir(4000);
    const b = await redis({ accion: "borrar", patron: ":turno:" });
    const r2 = await pedir("providers=n,d,m,un", 1, 120000, { en: [1] });
    extras.push(...r2.respuestas);
    return [{ que: `turno borrado (${b.borradas.length})`, ms: 4000 }, { que: `segunda solicitud en #1 → ${r2.respuestas[0].estado}`, ms: Date.now() - t }];
  },
  esperado: E2({ publicaciones: 1, origenes: { propia: 1, "propia-sin-publicar": 1 } }),
});

// --- E-medianoche: un proceso con la fecha de mañana publica el UB nuevo mientras el de hoy compone
await reiniciar(K - 1, "E-medianoche: el proceso de MAÑANA", { YUMP_FECHA: mananaAR() });
await escenario("E-medianoche", "el proceso de mañana publica primero; el propietario de hoy termina después: PUBLICAR = -1 (sólo su fresca), gen y UB del día nuevo intactos", "providers=n,d,m,ok", {
  veces: 1, en: [K - 1], timeoutMs: 120000, quiescenciaMs: 40000,
  preparar: async () => { await resetear("redis"); await configurar("tmdb", { latenciaMs: 400 }); },
  durante: async (extras) => {
    const t = Date.now();
    await dormir(3000);
    const r = await pedir("providers=n,d,m,ok", 1, 120000, { en: [0] });
    extras.push(...r.respuestas);
    return [{ que: `hoy en #0 → ${r.respuestas[0].estado}`, ms: Date.now() - t }];
  },
  esperado: E2({ composiciones: 2, publicaciones: 1, publicacionesParciales: 1 }),
});
await reiniciar(K - 1, "E-medianoche: vuelve a hoy");

// --- E-agotada: propietario vivo más lento que el tope de espera, sin UB
await escenario("E-agotada", "sin UB, composición > TOPE_ESPERA (TMDB +700 ms): los que esperan responden 200 vacío `espera-agotada` sin componer", "providers=n,d,m,cr", {
  veces: K, timeoutMs: 120000, quiescenciaMs: 40000,
  preparar: async () => { await resetear("redis"); await configurar("tmdb", { latenciaMs: 700 }); },
  esperado: E2({ composiciones: 1, publicaciones: 1, origenes: { propia: 1, "vacio-espera-agotada": K - 1 } }),
});
await escenario("E-agotada-h", "…la siguiente ronda es HIT", "providers=n,d,m,cr", { veces: K, esperado: { cacheDeTodas: "HIT", tmdb: 0 } });

// --- E-degradado: TMDB 500 con UB presente → UB para todos, ENFRIAR, nada publicado
await escenario("E-degradado", "TMDB 500 con UB presente: el propietario compone degradado y sirve UB (descartado); enfría; los demás UB; nada publicado", "providers=n,d,m,pp", {
  veces: K, preparar: async () => { await expirarFresca(); await configurar("tmdb", { modo: "500" }); },
  esperado: E2({ composiciones: 1, publicaciones: 0, enfriadas: 1, origenes: { "ultimo-bueno": K } }),
});
await escenario("E-degradado-sinUB", "TMDB 500 sin UB: el propietario sirve su degradado; los demás, el degradado COMPARTIDO; nada en fresca ni UB", "providers=n,d,m,at", {
  veces: K, preparar: async () => { await resetear("redis"); await configurar("tmdb", { modo: "500" }); },
  esperado: E2({ composiciones: 1, publicaciones: 0, enfriadas: 1, origenes: { "degradado-propio": 1, "degradado-compartido": K - 1 } }),
});
// --- E-rafaga: escalonada, 1/s × 40 s, TMDB 500, con y sin UB → ≤ ⌈40/15⌉+1 composiciones
await escenario("E-rafaga-sinUB", "ráfaga escalonada 1/s × 40 s con TMDB 500, sin UB: ≤ 4 composiciones degradadas; las demás degradado compartido", "providers=n,d,m,mb", {
  veces: 40, cadaMs: 1000, timeoutMs: 120000, quiescenciaMs: 20000,
  preparar: async () => { await resetear("redis"); await configurar("tmdb", { modo: "500" }); },
  esperado: E2({ composicionesMax: 4, publicaciones: 0 }),
});
await escenario("E-rafaga-conUB", "ráfaga escalonada 1/s × 40 s con TMDB 500, CON UB: ≤ 4 composiciones; las demás UB", "providers=n,d,m,pp", {
  veces: 40, cadaMs: 1000, timeoutMs: 120000, quiescenciaMs: 20000,
  preparar: async () => { await expirarFresca(); await configurar("tmdb", { modo: "500" }); },
  esperado: E2({ composicionesMax: 4, publicaciones: 0 }),
});

// --- E-perdida: respuesta perdida en SET NX → reconciliación; E-eval-falla
await escenario("E-perdida", "el doble ejecuta el SET NX y corta el socket: el SDK reintenta, recibe null, `tomar` reconcilia con GET → una composición", "providers=n,d,m,vx", {
  veces: 1, en: [0], preparar: async () => { await resetear("redis"); await redis({ accion: "perderRespuesta", comando: "SET", veces: 1 }); },
  esperado: E2({ composiciones: 1, publicaciones: 1, turnos: { reconciliado: 1 } }),
});
await escenario("E-eval-falla", "EVAL falla dos veces (PUBLICAR y su reintento): indeterminado, ningún DEL ni SET XX, se sirve igual; el turno vence solo", "providers=n,d,m,un", {
  veces: 1, en: [0], preparar: async () => { await resetear("redis"); await redis({ accion: "fallarEval", veces: 2 }); },
  esperado: E2({ composiciones: 1, publicaciones: 0, origenes: { "propia-sin-publicar": 1 } }),
});

// --- E-sinredis-vuelve: Redis caído cuando A pide; vuelve; B publica; A termina y NO escribe
await escenario("E-sinredis-vuelve", "Redis caído cuando #0 pide (compone sin turno); vuelve a los 20 s; #1 toma el turno y publica; #0 termina después y NO escribe", "providers=n,d,m,ok", {
  veces: 1, en: [0], timeoutMs: 600000, quiescenciaMs: 60000,
  preparar: async () => { await resetear("redis"); await configurar("redis", { modo: "caido" }); },
  durante: async (extras) => {
    // Redis vuelve a los 20 s: para entonces #0 ya agotó los reintentos del SDK
    // en `tomar` (~13 s) y está componiendo SIN turno; #1 pide un segundo
    // después, toma el turno y publica mientras #0 sigue componiendo.
    const t = Date.now();
    await dormir(20000);
    await configurar("redis", { modo: "ok" });
    await dormir(1000);
    const r = await pedir("providers=n,d,m,ok", 1, 120000, { en: [1] });
    extras.push(...r.respuestas);
    return [{ que: "redis vuelve", ms: 20000 }, { que: `#1 → ${r.respuestas[0].estado}`, ms: Date.now() - t }];
  },
  esperado: E2({ publicaciones: 1, origenes: { "sin-redis": 1, propia: 1 } }),
});
await escenario("E-sinredis-h", "…la siguiente es HIT (de lo que publicó #1)", "providers=n,d,m,ok", { veces: 1, en: [2 % K], esperado: { cacheDeTodas: "HIT", tmdb: 0 } });

// --- E-cancelacion: composición que excede el presupuesto → cancelada; TMDB deja de recibir
await escenario("E-cancelacion", "TMDB +1500 ms (composición > 50 s de presupuesto): la propietaria responde `cancelada` antes de 60 s, LIBERAR, sin ENFRIAR ni PUBLICAR; TMDB deja de recibir", "providers=n,d,m,mb", {
  veces: 1, en: [0], timeoutMs: 120000, quiescenciaMs: 30000,
  preparar: async () => { await resetear("redis"); await configurar("tmdb", { latenciaMs: 1500 }); },
  tras: async () => {
    const a = (await control("tmdb", "estado")).cuenta.peticiones;
    await dormir(1000);
    const b = (await control("tmdb", "estado")).cuenta.peticiones;
    await dormir(3000);
    const c = (await control("tmdb", "estado")).cuenta.peticiones;
    return { tmdbTrasRespuesta: { a1s: b - a, a4s: c - a } };
  },
  esperado: E2({ publicaciones: 0, enfriadas: 0, origenes: { "vacio-cancelada": 1 } }),
});
await escenario("E-cancelacion-redis", "CONTROL (promesa reducida): Redis caído en una ventana de 60 s: la solicitud NO termina (F5a); se registra y se reinicia", "providers=n,d,m,zz", {
  veces: 1, en: [0], timeoutMs: 60000, permiteIncompleto: true,
  preparar: async () => { await resetear("redis"); await configurar("redis", { modo: "caido" }); },
});

// --- E-version: un proceso con VERSION_HOME = 7 (rollout simulado)
await reiniciar(K - 1, "E-version: el proceso con VERSION_HOME = 7", { YUMP_BANCO_VERSION_HOME: "7" });
await escenario("E-version", "v6 en #0 y v7 en el último proceso, misma combinación: dos turnos, dos frescas, dos UB; ninguno lee al otro", "providers=n,d,m,vv", {
  veces: 2, en: [0, K - 1], timeoutMs: 120000, preparar: () => resetear("redis"),
  tras: async () => ({ claves: await redis({ accion: "claves", patron: "d,m,n,vv" }) }),
  esperado: E2({ composiciones: 2, publicaciones: 2 }),
});
await escenario("E-version-h", "…cada proceso es HIT de SU versión", "providers=n,d,m,vv", { veces: 2, en: [0, K - 1], esperado: { cacheDeTodas: "HIT", tmdb: 0 } });
await reiniciar(K - 1, "E-version: vuelve a v6");

// (E-claves —dos claves en dos procesos, pared < suma— no entra en este corredor: la
// atribución por clave es de UNA clave por escenario. Lo cubre el test puro
// "dos claves distintas no se bloquean" de lib/home-servir.test.ts.)

await sanos();
const corrida = validarCorrida(validaciones);
const cierre = [];
for (let i = 0; i < K; i++) if (procs[i]) cierre.push(await detener(i, "fin de la corrida"));
const doc = { fecha: new Date().toISOString(), etapa: ANTES ? "1 (antes)" : "2", procesos: K, appDir: APP_DIR, valida: corrida.valida, invalidos: corrida.invalidos, incompletos: corrida.incompletos, dobles: DOBLES, reinicios, cierre, resultados };
const destino = corrida.valida ? SALIDA : SALIDA.replace(/\.json$/, "-INVALIDA.json");
writeFileSync(destino, JSON.stringify(doc, null, 1));
console.log(`\n${corrida.valida ? "✅ corrida VÁLIDA" : "🔴 corrida INVÁLIDA: " + corrida.invalidos.join(", ")} | incompletos declarados: ${corrida.incompletos.join(", ") || "ninguno"} | reinicios: ${reinicios.length}\nguardado en ${destino}`);
process.exit(corrida.valida ? 0 : 1);
