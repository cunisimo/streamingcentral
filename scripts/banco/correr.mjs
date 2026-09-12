// La LÍNEA BASE de la Etapa 0 sobre el banco aislado. No es una prueba de
// carga ni mide capacidad de Producción: registra el comportamiento actual
// bajo condiciones declaradas, con los dobles como árbitros externos.
//
//   node scripts/banco/dobles.mjs                 (en otra terminal)
//   node scripts/banco/correr.mjs [salida.json]   (la app la levanta ESTE script)
//
// Requiere el build hecho con `source scripts/banco/entorno.sh && npm run build`
// en un worktree SIN `.env.local`. El corredor lee ese mismo `entorno.sh`, así
// que build y ejecución no pueden divergir.
//
// ============================================================================
// LO QUE ESTE CORREDOR GARANTIZA, Y POR QUÉ (auditoría de Codex de ceeed75)
// ============================================================================
// La primera versión solapó dos escenarios: una solicitud que el cliente abortó
// por timeout siguió viva en Next y terminó dentro del escenario siguiente. Y
// sólo controlaba un escenario, sin abortar. Ahora:
//
//   1. AISLAMIENTO: cada solicitud deja `[home] pedido <clave>` al entrar y una
//      línea terminal con `| clave <clave>` al salir. Pedidos − terminales =
//      solicitudes ACTIVAS en el servidor. Un escenario no empieza mientras
//      haya activas; si las hay (una abortada por timeout), se REINICIA Next y
//      se demuestra: el proceso viejo emite `exit`, el puerto deja de aceptar
//      conexiones, el nuevo responde /api/health con otro PID. Ningún timer.
//   2. CORRELACIÓN: cada línea se atribuye por clave. El sufijo esperado sale de
//      la query como lo arma `claveHome` (plataformas ordenadas, toggles). Los
//      escenarios de fallo usan combinaciones EXCLUSIVAS.
//   3. VALIDACIÓN AUTOMÁTICA (lib/banco-validacion.ts, con tests): por escenario
//      completado, las sumas de las líneas = deltas de los dobles en TMDB,
//      Supabase, intentos HTTP y comandos; líneas terminales = respuestas
//      completadas; pedidos = solicitudes hechas; ninguna clave ajena. Una
//      diferencia invalida la corrida: el JSON se escribe con `valida: false`
//      bajo otro nombre y el proceso termina con código 1.
//   4. UN TIMEOUT DEL CLIENTE NO ES UNA FINALIZACIÓN: la respuesta queda con
//      `estado: null`; el escenario que puede quedar incompleto lo declara y se
//      registra sólo "no completó en más de X ms", sin métricas inventadas.
import { readFileSync, writeFileSync, openSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { connect } from "node:net";
import { join } from "node:path";
import { validarEscenario, validarCorrida, sufijoDeClave, parsearLineaHome, esLineaTerminal, esLineaPedido, claveDePedido } from "../../lib/banco-validacion.ts";

const APP = "http://127.0.0.1:3000";
const PUERTO = 3000;
const DOBLES = { tmdb: "http://127.0.0.1:4801", supabase: "http://127.0.0.1:4802", redis: "http://127.0.0.1:4803" };
const SALIDA = process.argv[2] ?? "docs/medidas/2026-09-11-etapa0-linea-base.json";
// BANCO_SOLO=E1,E1h corre sólo esos escenarios (más el control C0): sirve para
// medir un "antes" sobre un build viejo sin pasar por escenarios que ese build
// no puede cumplir. Sin la variable, corre todo.
const SOLO = process.env.BANCO_SOLO ? new Set(process.env.BANCO_SOLO.split(",")) : null;
const LOGS = process.env.BANCO_LOGS ?? ".banco-logs";
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// ----------------------------------------------------------------- el entorno, del mismo archivo que el build
function entornoDelBanco() {
  const env = { ...process.env };
  for (const l of readFileSync("scripts/banco/entorno.sh", "utf8").split("\n")) {
    const m = l.match(/^export ([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
    const u = l.match(/^unset (.+)$/);
    if (u) for (const k of u[1].split(/\s+/)) delete env[k];
  }
  return env;
}

// ----------------------------------------------------------------- Next como proceso administrado
mkdirSync(LOGS, { recursive: true });
let proceso = null;      // { child, log, pid, n }
let procesos = 0;
const reinicios = [];
let leido = 0;           // offset de lectura del log del proceso actual
let pedidosTotales = 0, terminalesTotales = 0; // del proceso actual

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
async function arrancarNext(motivo) {
  if (await puertoAbierto(PUERTO)) throw new Error(`el puerto ${PUERTO} ya está ocupado: hay otro proceso; no se mide contra un servidor ajeno`);
  procesos += 1;
  const log = join(LOGS, `next-${procesos}.log`);
  const fd = openSync(log, "w");
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PUERTO)], {
    env: entornoDelBanco(), stdio: ["ignore", fd, fd], windowsHide: true,
  });
  // "Listo" = el proceso RESPONDE, con cualquier estado: /api/health devuelve
  // 503 mientras Redis no conteste, y un reinicio puede ocurrir con el doble
  // de Redis todavía caído a propósito.
  let estadoHealth = null;
  const listo = await esperar(async () => {
    try { estadoHealth = (await fetch(`${APP}/api/health`, { signal: AbortSignal.timeout(20000) })).status; return true; } catch { return false; }
  }, 60000, 500);
  if (!listo) throw new Error("Next no respondió /api/health en 60 s");
  proceso = { child, log, pid: child.pid, n: procesos };
  leido = 0; pedidosTotales = 0; terminalesTotales = 0;
  console.log(`[corredor] next #${procesos} pid ${child.pid} listo, /api/health ${estadoHealth} (${motivo}); log ${log}`);
  return proceso;
}
async function detenerNext(motivo) {
  const p = proceso;
  const salida = new Promise((resolve) => p.child.once("exit", (code, signal) => resolve({ code, signal })));
  if (process.platform === "win32") spawn("taskkill", ["/PID", String(p.pid), "/T", "/F"], { windowsHide: true });
  else p.child.kill("SIGKILL");
  const { code, signal } = await salida;
  const cerrado = await esperar(async () => !(await puertoAbierto(PUERTO)), 15000);
  if (!cerrado) throw new Error(`el puerto ${PUERTO} sigue abierto después de matar el pid ${p.pid}`);
  const prueba = { motivo, pidViejo: p.pid, exit: { code, signal }, puertoCerrado: true, activasQueQuedaban: pedidosTotales - terminalesTotales };
  console.log(`[corredor] next #${p.n} pid ${p.pid} terminado (exit ${JSON.stringify({ code, signal })}), puerto ${PUERTO} cerrado — ${motivo}`);
  proceso = null;
  return prueba;
}
async function reiniciarNext(motivo) {
  // Orden: matar y comprobar que murió → recién entonces poner sanos los dobles
  // → arrancar el nuevo. Rehabilitar Redis con el proceso viejo vivo es lo que
  // mezcló dos escenarios en ceeed75.
  const prueba = await detenerNext(motivo);
  await sanos();
  const nuevo = await arrancarNext(`reinicio: ${motivo}`);
  reinicios.push({ ...prueba, pidNuevo: nuevo.pid });
}

// ----------------------------------------------------------------- control de los dobles
const control = async (d, ruta, cuerpo) => (await fetch(`${DOBLES[d]}/__banco/${ruta}`, cuerpo ? { method: "POST", body: JSON.stringify(cuerpo) } : {})).json();
const estados = async () => Object.fromEntries(await Promise.all(Object.keys(DOBLES).map(async (d) => [d, await control(d, "estado")])));
const configurar = (d, c) => control(d, "config", c);
const sanos = async () => { for (const d of Object.keys(DOBLES)) await configurar(d, { modo: "ok", latenciaMs: 0 }); };
const resetear = async (...ds) => { for (const d of ds) await control(d, "reset"); };

// ----------------------------------------------------------------- el log de la app: pedidos y terminales
function lineasNuevas() {
  const todo = readFileSync(proceso.log, "utf8");
  const nuevas = todo.slice(leido).split("\n").map((l) => l.trim()).filter((l) => l.startsWith("[home]") || l.startsWith("[cache]") || l.startsWith("[tmdb]"));
  leido = todo.length;
  const pedidos = nuevas.filter(esLineaPedido).map(claveDePedido);
  const terminales = nuevas.filter(esLineaTerminal).map(parsearLineaHome);
  pedidosTotales += pedidos.length; terminalesTotales += terminales.length;
  return { nuevas, pedidos, terminales, cacheErrores: nuevas.filter((l) => l.startsWith("[cache]")).length };
}
// Espera a que el servidor no tenga solicitudes activas; si no llega a cero en
// la ventana, devuelve cuántas quedan (y el llamador reinicia Next).
async function quiescencia(ms) {
  await esperar(() => { lineasNuevas(); return pedidosTotales === terminalesTotales; }, ms, 200);
  lineasNuevas();
  return pedidosTotales - terminalesTotales;
}

// ----------------------------------------------------------------- pedir a la app
async function pedir(query, veces, timeoutMs) {
  const t0 = Date.now();
  const rs = await Promise.all(Array.from({ length: veces }, async () => {
    const t = Date.now();
    try {
      const r = await fetch(`${APP}/api/home?${query}`, { signal: AbortSignal.timeout(timeoutMs) });
      const j = await r.json().catch(() => null);
      return { estado: r.status, ms: Date.now() - t, hero: j?.hero?.length ?? null, rails: j?.rails?.length ?? null, degradado: j?.degradado ?? null, fallos: j?.fallos ?? null };
    } catch (e) { return { estado: null, ms: Date.now() - t, error: String(e?.name ?? e) }; }
  }));
  return { respuestas: rs, msPared: Date.now() - t0 };
}

const delta = (a, b) => ({
  tmdb: b.tmdb.cuenta.peticiones - a.tmdb.cuenta.peticiones,
  tmdbPorFamilia: Object.fromEntries(Object.entries(b.tmdb.cuenta.porFamilia).map(([k, v]) => [k, v - (a.tmdb.cuenta.porFamilia[k] ?? 0)]).filter(([, v]) => v)),
  tmdbDesconocidas: b.tmdb.cuenta.desconocidas.slice(a.tmdb.cuenta.desconocidas.length),
  supabase: b.supabase.cuenta.peticiones - a.supabase.cuenta.peticiones,
  redisHttp: b.redis.cuenta.peticiones - a.redis.cuenta.peticiones,
  redisComandos: b.redis.comandos.total - a.redis.comandos.total,
  redisPorComando: Object.fromEntries(Object.entries(b.redis.comandos.porComando).map(([k, v]) => [k, v - (a.redis.comandos.porComando[k] ?? 0)]).filter(([, v]) => v)),
});

// ----------------------------------------------------------------- un escenario
const resultados = [];
const validaciones = [];
async function escenario(id, titulo, query, opts = {}) {
  if (SOLO && id !== "C0" && !SOLO.has(id)) return null;
  const { veces = 1, timeoutMs = 300000, preparar, durante, permiteIncompleto = false, quiescenciaMs = 5000, esperado } = opts;
  // 1. Nada activo antes de empezar. Si quedó algo (una solicitud abortada por
  //    timeout sigue viva en Next), se reinicia y se demuestra. Recién DESPUÉS
  //    se ponen sanos los dobles: rehabilitar Redis con una solicitud vieja
  //    todavía viva es exactamente lo que mezcló F5 con F5r en ceeed75.
  const activasAntes = await quiescencia(quiescenciaMs);
  if (activasAntes > 0) await reiniciarNext(`${activasAntes} solicitud(es) activa(s) antes de ${id}`);
  await sanos();
  if (preparar) await preparar();
  lineasNuevas();
  const inicio = leido;            // desde acá, todo lo del log es de este escenario
  const antes = await estados();
  const t0 = Date.now();
  const enCurso = pedir(query, veces, timeoutMs);
  const eventos = durante ? await durante() : [];
  const r = await enCurso;
  // 2. Las líneas se escriben después de responder: se espera a que el
  //    servidor no tenga nada activo (o a que venza la ventana) antes de leer
  //    los dobles, así el delta y las líneas abarcan la misma ventana.
  const activas = await quiescencia(permiteIncompleto ? 2000 : quiescenciaMs);
  const despues = await estados();
  // Se relee la ventana entera del escenario (sin mover los contadores de
  // quiescencia, que ya la contaron): es lo que se valida y se publica.
  const ls = readFileSync(proceso.log, "utf8").slice(inicio, leido).split("\n").map((l) => l.trim())
    .filter((l) => l.startsWith("[home]") || l.startsWith("[cache]") || l.startsWith("[tmdb]"));
  const nuevas = ls.filter((l) => !l.startsWith("[cache]"));
  const pedidos = ls.filter(esLineaPedido).map(claveDePedido);
  const terminales = ls.filter(esLineaTerminal).map(parsearLineaHome);
  const cacheErrores = ls.filter((l) => l.startsWith("[cache]")).length;
  const observado = { id, query, veces, claveSufijo: sufijoDeClave(query), respuestas: r.respuestas, pedidos, terminales, dobles: delta(antes, despues), permiteIncompleto, ventanaMs: timeoutMs, esperado };
  const v = validarEscenario(observado);
  validaciones.push(v);
  const salida = { id, titulo, query, veces, timeoutMs, permiteIncompleto, msPared: r.msPared, respuestas: r.respuestas, eventos, pedidos: pedidos.length, activasAlCerrar: activas, lineas: nuevas, terminales, lineasCacheError: cacheErrores, dobles: observado.dobles, validacion: v };
  resultados.push(salida);
  console.log(`\n== ${id} ${titulo}\n   ${veces}× ${query} → ${r.respuestas.map((x) => x.estado ?? `abortada(${x.error})`).join(",")} en ${r.msPared}ms de pared${eventos.length ? ` | eventos: ${eventos.map((e) => `${e.que}@${e.ms}ms`).join(", ")}` : ""}`);
  // Con muchas solicitudes (E1) se resume: las cien líneas van al JSON.
  const mostrar = terminales.length > 6 ? terminales.slice(0, 3) : terminales;
  for (const x of mostrar) console.log(`   app: cache ${x.cache} | comp ${x.composiciones} | esperas ${x.esperas} | tmdb ${x.tmdb} | supabase ${x.supabase} | redis ${x.redisIntentos} intentos / ${x.redisComandos} comandos | ${x.msTotal}ms | …${x.clave?.slice(-14)}`);
  if (terminales.length > 6) console.log(`   … ${terminales.length} líneas: ${JSON.stringify(v.home)}; suma tmdb ${v.sumas?.tmdb} | supabase ${v.sumas?.supabase} | redis ${v.sumas?.redisHttp} intentos / ${v.sumas?.redisComandos} comandos`);
  console.log(`   dobles: tmdb ${observado.dobles.tmdb} | supabase ${observado.dobles.supabase} | redis http ${observado.dobles.redisHttp} / comandos ${observado.dobles.redisComandos} ${JSON.stringify(observado.dobles.redisPorComando)}`);
  console.log(`   ${v.valida ? "✅" : "🔴"} ${v.estado}: ${v.resumen}${v.problemas.length ? "\n      - " + v.problemas.join("\n      - ") : ""}`);
  // 3. Si quedó algo activo, el escenario siguiente arranca con un Next nuevo.
  if (activas > 0) { await reiniciarNext(`${activas} solicitud(es) activa(s) al cerrar ${id}`); }
  return salida;
}
// ----------------------------------------------------------------- CORRIDA
// Los dobles sanos ANTES de arrancar: con el doble de Redis caído de una corrida
// anterior, /api/health tarda ~13 s (3 comandos × 6 intentos) y parece muerto.
await sanos();
await arrancarNext("arranque");
await resetear("tmdb", "supabase", "redis");
const cero = await estados();
if (cero.tmdb.cuenta.peticiones !== 0 || cero.redis.cuenta.peticiones !== 0) throw new Error("los dobles no arrancaron en cero");

const NDM = "providers=n,d,m";
// Control: si la app no mueve los dobles, se está midiendo otra cosa.
await escenario("C0", "control: la app habla con los dobles (arrancan en cero y una solicitud los mueve)", NDM);
if (!resultados[0].dobles.tmdb || !resultados[0].dobles.redisHttp) { console.error("🔴 la app no está hablando con los dobles"); process.exit(1); }

await escenario("B1", "Home FRÍO, una solicitud", NDM, { preparar: () => resetear("redis") });
await escenario("B1b", "control de repetibilidad: el mismo Home frío otra vez", NDM, { preparar: () => resetear("redis") });
await escenario("B2", "Home CALIENTE, una solicitud (clave guardada por B1b)", NDM);
await escenario("B3", "5 solicitudes IGUALES con caché fría (comportamiento actual, sin single-flight)", NDM, { veces: 5, preparar: () => resetear("redis") });
await escenario("B4a", "variante equivalente: mismo conjunto en otro orden (d,m,n) → misma clave que B3", "providers=d,m,n");
await escenario("B4b", "variante distinta: n,d → otra clave, rearma", "providers=n,d");
await escenario("B4c", "variante por toggle: n,d,m con t=accion:tv → otra clave, rearma", "providers=n,d,m&t=accion:tv");
await escenario("B4d", "n,d,m&t=accion:movie (el default escrito) frente a sin `t`: en la Etapa 0 era OTRA clave (MISS); con la Etapa 1 es la misma (HIT)", "providers=n,d,m&t=accion:movie");

// ----------------------------------------------------------------- ETAPA 1: E1, cien solicitudes iguales sobre caché fría
// El criterio central del #17, por proceso: composiciones = 1, medido con el
// contador de la Etapa 0 y no deducido de HIT/MISS. En la Etapa 0 (B3, cinco
// solicitudes) daba cinco composiciones. Se afirma lo esperado y el validador
// lo comprueba; sobre un build de la Etapa 0 este escenario sale INVÁLIDO, que
// es lo que un "antes" tiene que decir.
await escenario("E1", "100 solicitudes IGUALES y simultáneas con caché fría: ¿cuántas composiciones?", NDM, {
  veces: 100, timeoutMs: 600000, quiescenciaMs: 15000, preparar: () => resetear("redis"),
  esperado: process.env.BANCO_ETAPA === "0" ? undefined : { composiciones: 1, esperas: 99 },
});
await escenario("E1h", "…y la siguiente es HIT", NDM, { esperado: { cacheDeTodas: "HIT", tmdb: 0, supabase: 0 } });

// Fallo y recuperación, cada uno con una combinación EXCLUSIVA de plataformas.
await escenario("F1", "TMDB responde 500: el Home sale DEGRADADO y no se guarda", "providers=n,d,m,p", { preparar: async () => { await resetear("redis"); await configurar("tmdb", { modo: "500" }); } });
await escenario("F1r", "TMDB vuelve: la misma clave rearma y guarda", "providers=n,d,m,p");
await escenario("F1h", "…y la siguiente es HIT", "providers=n,d,m,p");
await escenario("F2", "TMDB responde 429 con Retry-After", "providers=n,d,m,at", { preparar: async () => { await resetear("redis"); await configurar("tmdb", { modo: "429", retryAfter: 2 }); } });
await escenario("F3", "TMDB CAÍDO (corta el socket): fallos de red", "providers=n,d,m,cr", { preparar: async () => { await resetear("redis"); await configurar("tmdb", { modo: "caido" }); } });
await escenario("F3r", "TMDB vuelve", "providers=n,d,m,cr");
await escenario("F4", "Supabase CAÍDO con TMDB sano", "providers=n,d,m,pp", { preparar: async () => { await resetear("redis"); await configurar("supabase", { modo: "caido" }); } });
await escenario("F4r", "Supabase vuelve", "providers=n,d,m,pp");

// Redis caído, en DOS escenarios separados a propósito:
//   F5a — caída SOSTENIDA en una ventana limitada de 60 s (la `maxDuration` de
//         /api/home en Vercel). Si no completa, se registra sólo eso; la
//         solicitud sigue viva en Next y el corredor REINICIA el proceso.
//   F5b — recuperación CONTROLADA: clave exclusiva, una solicitud con Redis
//         caído, Redis vuelve a los 15 s exactos, y se espera a que ESA
//         solicitud termine. Después una segunda solicitud y el HIT de control.
await escenario("F5a", "Redis CAÍDO (corta el socket) durante una ventana de 60 s: ¿completa?", "providers=n,d,m,mb", {
  timeoutMs: 60000, permiteIncompleto: true,
  preparar: async () => { await resetear("redis"); await configurar("redis", { modo: "caido" }); },
});
await escenario("F5b", "recuperación CONTROLADA: Redis caído al pedir, vuelve a los 15 s, se espera a que la solicitud termine", "providers=n,d,m,ok", {
  timeoutMs: 600000,
  preparar: async () => { await resetear("redis"); await configurar("redis", { modo: "caido" }); },
  durante: async () => { const t = Date.now(); await dormir(15000); await configurar("redis", { modo: "ok" }); return [{ que: "redis vuelve", ms: Date.now() - t }]; },
});
await escenario("F5c", "la solicitud SIGUIENTE a la recuperación", "providers=n,d,m,ok");
await escenario("F5d", "…y la siguiente", "providers=n,d,m,ok");
await escenario("F6", "Redis responde 500 (respuesta HTTP de error: el SDK NO reintenta)", "providers=n,d,m,un", { preparar: async () => { await resetear("redis"); await configurar("redis", { modo: "500" }); } });
await escenario("L1", "latencia declarada: TMDB +100 ms por llamada, Home frío", "providers=n,d,m,vx", { preparar: async () => { await resetear("redis"); await configurar("tmdb", { latenciaMs: 100 }); } });

// ----------------------------------------------------------------- ETAPA 1: E4, canonización (#18)
// Todas contra la clave de `n,d,m` recién compuesta: las equivalentes tienen
// que ser HIT sin tocar TMDB ni Supabase; las distintas, MISS; y la que queda
// sin plataformas válidas no consulta a nadie.
await escenario("E4-0", "base: n,d,m frío (compone)", NDM, { preparar: () => resetear("redis"), esperado: { composiciones: 1 } });
await escenario("E4a", "N,D,M → la misma clave que n,d,m: HIT, conserva las TRES plataformas", "providers=N,D,M", { esperado: { cacheDeTodas: "HIT", tmdb: 0, supabase: 0 } });
await escenario("E4b", "n,,d,m (vacío en el medio) → HIT", "providers=n,,d,m", { esperado: { cacheDeTodas: "HIT", tmdb: 0, supabase: 0 } });
await escenario("E4c", "n,n,d,m,m (duplicados) → HIT", "providers=n,n,d,m,m", { esperado: { cacheDeTodas: "HIT", tmdb: 0, supabase: 0 } });
await escenario("E4d", "n,d,m,zzz (código inexistente) → HIT: se descarta el desconocido", "providers=n,d,m,zzz", { esperado: { cacheDeTodas: "HIT", tmdb: 0, supabase: 0 } });
await escenario("E4e", "t=accion:movie (default escrito) → HIT", "providers=n,d,m&t=accion:movie", { esperado: { cacheDeTodas: "HIT", tmdb: 0, supabase: 0 } });
await escenario("E4f", "las 7 claves en default, como manda el cliente → HIT", "providers=n,d,m&t=accion:movie,comedia:movie,documental:tv,drama:tv,scifi:tv,terror:movie,ultimos:movie", { esperado: { cacheDeTodas: "HIT", tmdb: 0, supabase: 0 } });
await escenario("E4g", "t=inventado:tv (riel desconocido) → HIT: no multiplica entradas", "providers=n,d,m&t=inventado:tv", { esperado: { cacheDeTodas: "HIT", tmdb: 0, supabase: 0 } });
await escenario("E4h", "t=accion:tv (toggle NO default) → otra clave: MISS y compone", "providers=n,d,m&t=accion:tv", { esperado: { composiciones: 1 } });
await escenario("E4i", "zzz → sin plataformas: NO consulta TMDB ni Supabase", "providers=zzz", { esperado: { tmdb: 0, supabase: 0 } });
await escenario("E4j", "___ → sin plataformas: NO consulta TMDB ni Supabase", "providers=___", { esperado: { tmdb: 0, supabase: 0 } });
await escenario("E4k", "CONTROL: n → conjunto distinto, compone", "providers=n", { preparar: () => resetear("redis"), esperado: { composiciones: 1 } });
await escenario("E4l", "CONTROL: n,d → conjunto distinto, compone", "providers=n,d", { esperado: { composiciones: 1 } });
await escenario("E4m", "CONTROL: d,m → conjunto distinto, compone", "providers=d,m", { esperado: { composiciones: 1 } });
await escenario("E4n", "CONTROL: n de nuevo → HIT (los tres conjuntos conservan su contenido)", "providers=n", { esperado: { cacheDeTodas: "HIT", tmdb: 0 } });

await sanos();
const corrida = validarCorrida(validaciones);
const prueba = await detenerNext("fin de la corrida");
const doc = { fecha: new Date().toISOString(), valida: corrida.valida, invalidos: corrida.invalidos, incompletos: corrida.incompletos, app: APP, dobles: DOBLES, reinicios, cierre: prueba, resultados };
const destino = corrida.valida ? SALIDA : SALIDA.replace(/\.json$/, "-INVALIDA.json");
writeFileSync(destino, JSON.stringify(doc, null, 1));
console.log(`\n${corrida.valida ? "✅ corrida VÁLIDA" : "🔴 corrida INVÁLIDA: " + corrida.invalidos.join(", ")} | incompletos declarados: ${corrida.incompletos.join(", ") || "ninguno"} | reinicios de Next: ${reinicios.length}\nguardado en ${destino}`);
process.exit(corrida.valida ? 0 : 1);
