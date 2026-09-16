// Etapa 3.c.0 — MEDIR antes de proteger (informe §39). Sin código productivo,
// sin TMDB real, sin credenciales ni servicios de Producción: la app construida
// de esta rama contra los tres dobles, en UNO, DOS y TRES procesos `next start`
// que comparten el mismo Redis del banco (como varias instancias de Vercel).
//
//   node scripts/banco/etapa3c0-medir.mjs [salida.json]
//
// Lo que se mide, por escenario: llamadas lógicas a TMDB (línea `[home]` /
// `[home-fondo]`) contra las que el doble recibió; duración de la composición;
// cadencia efectiva (llamadas / duración) y ráfaga máxima por segundo móvil y
// por 100 ms (marcas del doble); concurrencia máxima real (marcas con inicio
// y fin); fases (primera y última llamada a TMDB, SET de la fresca, liberación
// del turno) para separar composición / publicación / cierre; y cuántas
// operaciones de Redis y a qué latencia.
//
// CALIBRACIÓN OBLIGATORIA (mandato): el banco no es "realista" por decreto.
// Antes de creerle al frío de 926, el mismo modelo de latencias tiene que
// reproducir razonablemente las dos observaciones de Producción:
//   · 3.a, 15/09: 250 llamadas / 15,1 s (tmdb 527 ms/llamada; redis 279 ops,
//     138 ms/op; supabase 6 consultas, 604 ms/consulta)             — §32.1
//   · 3.b, 15/09: 342 llamadas / 16,7 s en fondo (tmdb 348 ms/llamada;
//     redis 383 ops; supabase 11 consultas, 355 ms/consulta)        — §37
// Las latencias por llamada salen de esas líneas (PROMEDIO = acumulado /
// cantidad). El doble sortea una log-normal por MEDIANA y p95; el p95 NO está
// medido en Producción: se PROPONE p95 = 2,3 × mediana, y con ese p95 el
// promedio de la log-normal es 1,137 × mediana — así que la mediana que se
// configura es promedio / 1,137, para que el promedio del doble sea el de
// Producción (primera pasada, con mediana = promedio: `…-pasada1.json`,
// sobreestimaba ~35-60 % las duraciones observadas).
// La calibración reproduce la parcialidad de Redis de las dos observaciones
// venciendo un SUBCONJUNTO de `pv3:<tipo>:<id>` por el último dígito del id
// (~30 % → ~250 llamadas; ~40 % → ~340) y compara duración y cadencia.
import { writeFileSync, mkdirSync } from "node:fs";
import { parsearLineaHome, esLineaTerminal, esLineaCompone } from "../../lib/banco-validacion.ts";
import { control, hijos, levantarDobles, levantarNext, matar, pedirHome, vaciar, esperar, dormir, LOGS } from "./comparar-comun.mjs";
import { readFileSync } from "node:fs";

const SALIDA = process.argv[2] ?? "docs/medidas/2026-09-16-etapa3c0-medicion.json";
const DIR = process.env.BANCO_DESPUES_DIR ?? ".";
const BASE = 4801;
// Modelos de latencia (medianas en ms; p95 = FACTOR_P95 × mediana, PROPUESTO).
const FACTOR_P95 = Number(process.env.BANCO_FACTOR_P95 ?? "2.3");
// Promedio de una log-normal con p95 = F × mediana: exp(σ²/2), σ = ln(F)/1,645.
const SIGMA = Math.log(FACTOR_P95) / 1.6449, PROMEDIO_SOBRE_MEDIANA = Math.exp(SIGMA * SIGMA / 2);
// `BANCO_REDIS_PROMEDIO` reemplaza el promedio de Redis (la calibración lo fijó en 40:
// el promedio de 138 ms de la línea lo domina la fase paralela de `pv3:`, no la cadena secuencial).
const REDIS_PROMEDIO = Number(process.env.BANCO_REDIS_PROMEDIO ?? "138");
const MODELOS = {
  // PROMEDIOS observados en Producción (ms por llamada); la mediana configurada es promedio / PROMEDIO_SOBRE_MEDIANA.
  "prod-3b": { tmdb: 348, redis: REDIS_PROMEDIO, supabase: 355 },
  "prod-3a": { tmdb: 527, redis: REDIS_PROMEDIO, supabase: 604 },
};
const MODELOS_A_CORRER = (process.env.BANCO_MODELOS ?? "prod-3b,prod-3a").split(",");
const lat = (promedio) => { const m = Math.round(promedio / PROMEDIO_SOBRE_MEDIANA); return { latenciaMs: m, latenciaP95Ms: Math.round(m * FACTOR_P95) }; };
async function modelo(nombre) {
  const m = MODELOS[nombre];
  await control(BASE, "tmdb", "config", { modo: "ok", ...lat(m.tmdb) });
  await control(BASE, "redis", "config", { modo: "ok", ...lat(m.redis) });
  await control(BASE, "supabase", "config", { modo: "ok", ...lat(m.supabase) });
  return { nombre, promedios: m, medianasConfiguradas: { tmdb: lat(m.tmdb).latenciaMs, redis: lat(m.redis).latenciaMs, supabase: lat(m.supabase).latenciaMs }, factorP95: FACTOR_P95, promedioSobreMediana: +PROMEDIO_SOBRE_MEDIANA.toFixed(3) };
}
const expirar = (patron) => control(BASE, "redis", "redis", { accion: "expirar", patron });
const FRESCA = "^home:[^:]+:v\\d+:", UB = "^home:ub:";

// ----------------------------------------------------------------- logs
function lineas(p) {
  const todo = readFileSync(p.log, "utf8");
  const nuevas = todo.slice(p.leido ?? 0).split("\n").map((l) => l.trim());
  p.leido = todo.length;
  const term = (pref) => nuevas.filter((l) => l.startsWith(pref) && esLineaTerminal(l.replace(pref, "[home]")))
    .map((l) => ({ ...parsearLineaHome(l.replace(pref, "[home]")), cancelada: /CANCELADA/.test(l), degradado: /DEGRADADO \(/.test(l), tmdbMs: Number((l.match(/llamadas.*?\) (\d+)ms/) ?? [])[1] ?? 0), redisMs: Number((l.match(/miss\)(?: \|[^|]*fallo[^|]*)? \| (\d+)ms \| lotes/) ?? [])[1] ?? 0), linea: l }));
  return { home: term("[home]"), fondo: term("[home-fondo]"), compone: nuevas.filter(esLineaCompone).length };
}
async function esperarLineas(p, cond, ms = 150000) {
  const acc = { home: [], fondo: [], compone: 0 };
  const ok = await esperar(() => { const n = lineas(p); acc.home.push(...n.home); acc.fondo.push(...n.fondo); acc.compone += n.compone; return cond(acc); }, ms, 250);
  return { ...acc, completo: ok };
}

// ----------------------------------------------------------------- marcas del doble
async function marcas(doble) { return control(BASE, doble, "marcas"); }
function resumenTmdb(ms, t0, t1) {
  const enVentana = ms.filter((m) => m.t >= t0 && m.t <= t1);
  const ts = enVentana.map((m) => m.t).sort((a, b) => a - b);
  const maxVentana = (w) => { let mx = 0, j = 0; for (let i = 0; i < ts.length; i++) { while (ts[i] - ts[j] >= w) j++; mx = Math.max(mx, i - j + 1); } return mx; };
  // Concurrencia máxima: barrido de inicios (+1) y fines (−1).
  const ev = [];
  for (const m of enVentana) { ev.push([m.t, 1]); ev.push([m.fin || t1, -1]); }
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let c = 0, cmax = 0; for (const [, d] of ev) { c += d; cmax = Math.max(cmax, c); }
  const dur = enVentana.map((m) => (m.fin || t1) - m.t).sort((a, b) => a - b);
  const pct = (q) => dur.length ? dur[Math.min(dur.length - 1, Math.floor(q * dur.length))] : 0;
  return {
    llamadas: ts.length, primera: ts[0] ?? null, ultima: ts.at(-1) ?? null, ultimaFin: enVentana.length ? Math.max(...enVentana.map((m) => m.fin || 0)) : null,
    spanMs: ts.length ? ts.at(-1) - ts[0] : 0,
    cadenciaPorS: ts.length > 1 ? +(ts.length / ((ts.at(-1) - ts[0]) / 1000)).toFixed(1) : null,
    maxPor1s: maxVentana(1000), maxPor100ms: maxVentana(100), concurrenciaMax: cmax,
    latenciaDobleMs: { p50: pct(0.5), p95: pct(0.95) },
  };
}
// La publicación NO es un SET suelto: es el script Lua del turno (EVALSHA, o
// EVAL tras NOSCRIPT) que escribe fresca + UB + generación y libera el turno
// (DEL) en una sola operación atómica. Publicación = desde que terminó la
// última llamada a TMDB hasta que ese script respondió; cierre = lo que queda
// hasta la última operación de Redis (normalmente nada: el DEL va adentro).
function fasesRedis(ms, t0, t1, ultimaTmdbFin) {
  const en = ms.filter((m) => m.t >= t0 && m.t <= t1);
  const publicar = en.filter((m) => (m.c === "EVAL" || m.c === "EVALSHA") && ultimaTmdbFin && m.t >= ultimaTmdbFin - 50);
  const pub = publicar.at(-1) ?? null;
  return { ops: en.length, publicarInicio: pub?.t ?? null, publicarFin: pub?.fin ?? null, ultimaOp: en.length ? Math.max(...en.map((m) => m.fin || m.t)) : null };
}

// ----------------------------------------------------------------- un pedido medido
async function medir(p, providers, o = {}) {
  lineas(p);
  // Sólo contadores/marcas del doble de TMDB; Redis NO se vacía acá. En los
  // escenarios concurrentes el reset se hace UNA vez antes (`sinReset`): las
  // marcas del doble son globales, no por proceso.
  if (!o.sinReset) await control(BASE, "tmdb", "reset").catch(() => {});
  const marcasRedisAntes = (await marcas("redis")).length;
  const t0 = Date.now();
  const r = await pedirHome(p, providers, o.t);
  const tResp = Date.now();
  const cond = o.esperaFondo ? (a) => a.fondo.length >= 1 : (a) => a.home.length >= 1;
  const ls = await esperarLineas(p, cond, o.esperaMs ?? 150000);
  await dormir(300);
  const t1 = Date.now();
  const mt = await marcas("tmdb");
  const mr = (await marcas("redis")).slice(marcasRedisAntes);
  const term = o.esperaFondo ? ls.fondo[0] : ls.home[0];
  const tm = resumenTmdb(mt, t0, t1);
  const ultimaTmdbFin = tm.ultimaFin;
  const fr = fasesRedis(mr, t0, t1, ultimaTmdbFin);
  const fases = tm.llamadas ? {
    hastaPrimeraLlamadaMs: tm.primera - t0,
    composicionMs: tm.spanMs,                                     // primera → última llamada a TMDB (llegada)
    ultimaLlamadaMs: ultimaTmdbFin && tm.ultima ? ultimaTmdbFin - tm.ultima : null,   // latencia de la última llamada
    publicacionMs: fr.publicarFin && ultimaTmdbFin ? fr.publicarFin - ultimaTmdbFin : null,   // fin de la última llamada → script de publicación respondido
    cierreMs: fr.publicarFin && fr.ultimaOp ? Math.max(0, fr.ultimaOp - fr.publicarFin) : null,  // publicación → última operación de Redis
    trasUltimaLlamadaMs: term?.msTotal ? term.msTotal - (tm.primera - t0) - tm.spanMs : null,  // publicación + cierre + latencia de la última llamada, por diferencia
  } : null;
  return {
    providers, status: r.status, respuestaMs: r.msPared, hero: r.json?.hero?.length ?? null, rails: r.json?.rails?.length ?? null,
    linea: term ? { cache: term.cache, origen: term.origen, publicacion: term.publicacion, msTotal: term.msTotal, tmdb: term.tmdb, tmdbMs: term.tmdbMs, redis: term.redisIntentos, redisMs: term.redisMs, supabase: term.supabase, cancelada: term.cancelada, degradado: term.degradado, renovaciones: term.renovaciones } : null,
    lineaCompleta: term?.linea ?? null, doble: tm, redisOps: fr.ops, fases, completo: ls.completo,
  };
}

// ----------------------------------------------------------------- tmdb-sync simulado (HIPÓTESIS)
function cargaSimulada(porSegundo) {
  let vivo = true, hechas = 0;
  (async () => { while (vivo) { fetch(`http://127.0.0.1:${BASE}/discover/movie?page=1&sync=1`).then(() => { hechas++; }).catch(() => {}); await dormir(1000 / porSegundo); } })();
  return { parar: () => { vivo = false; return hechas; } };
}

// ----------------------------------------------------------------- calibración de Redis (barrido)
// La pasada 2 mostró que con Redis a 138 ms de PROMEDIO el banco tarda ~2× lo
// observado para 250-340 llamadas: el promedio de Producción lo domina la fase
// paralela de `pv3:`, mientras que la cadena SECUENCIAL del pipeline (65
// operaciones con todo cacheado, S7) es más rápida de lo que ese promedio
// sugiere. La distribución real no está medida → se BARRE la latencia de Redis
// y se toma como calibrada la que reproduce las dos observaciones; con ella se
// mide el frío total de 926. TMDB se deja en los promedios observados.
async function calibrarRedis(A, log, resumen) {
  const barrido = (process.env.BANCO_BARRIDO_REDIS ?? "20,40,60,90").split(",").map(Number);
  for (const nombreModelo of ["prod-3b", "prod-3a"]) {
    for (const redis of barrido) {
      const m = MODELOS[nombreModelo];
      await control(BASE, "tmdb", "config", { modo: "ok", ...lat(m.tmdb) });
      await control(BASE, "supabase", "config", { modo: "ok", ...lat(m.supabase) });
      await control(BASE, "redis", "config", { modo: "ok", ...lat(redis) });
      await vaciar(BASE); lineas(A);
      const s1 = await medir(A, "n,d,m");   // frío total (calienta Redis)
      log(`calibracion/${nombreModelo}/redis-${redis}ms/S1-frio-total-en-linea`, { redisPromedioMs: redis, resumen: resumen(s1) });
      await expirar(FRESCA); await expirar("^pv3:.*[0-3]$");
      const cal = await medir(A, "n,d,m", { esperaFondo: true });
      log(`calibracion/${nombreModelo}/redis-${redis}ms/CAL-342-fondo`, { objetivo: { llamadas: 342, ms: 16682 }, resumen: resumen(cal) });
      await expirar(FRESCA); await expirar(UB); await expirar("^pv3:.*[0-2]$");
      const calL = await medir(A, "n,d,m");
      log(`calibracion/${nombreModelo}/redis-${redis}ms/CAL-250-linea`, { objetivo: { llamadas: 250, ms: 15091 }, resumen: resumen(calL) });
      await expirar(FRESCA);
      const s7 = await medir(A, "n,d,m", { esperaFondo: true });
      log(`calibracion/${nombreModelo}/redis-${redis}ms/S7-miss-intradia-fondo`, { resumen: resumen(s7) });
      await expirar("^(?!home:ub:).*");
      const s3 = await medir(A, "n,d,m", { esperaFondo: true });
      log(`calibracion/${nombreModelo}/redis-${redis}ms/S3-frio-total-en-fondo`, { resumen: resumen(s3) });
    }
  }
}

// ----------------------------------------------------------------- corrida
async function main() {
  mkdirSync(LOGS, { recursive: true });
  const salida = { fecha: new Date().toISOString(), rama: "diseno/etapa3c-proteccion-tmdb", factorP95: FACTOR_P95, redisPromedio: REDIS_PROMEDIO, modelos: MODELOS, modo: process.env.BANCO_MODO ?? "matriz", escenarios: {} };
  await levantarDobles(BASE);
  const A = await levantarNext("3c0-A", DIR, 3001, BASE, { YUMP_BANCO_FONDO: "1" });
  const B = await levantarNext("3c0-B", DIR, 3002, BASE, { YUMP_BANCO_FONDO: "1" });
  const C = await levantarNext("3c0-C", DIR, 3003, BASE, { YUMP_BANCO_FONDO: "1" });
  const log = (k, v) => { salida.escenarios[k] = v; console.log(`[3c0] ${k}:`, JSON.stringify(v.resumen ?? v).slice(0, 600)); };
  if (process.env.BANCO_MODO === "fases") {
    // Sólo los dos fríos totales, para el desglose por componentes (39.3).
    const resumenF = (m) => ({ respuestaMs: m.respuestaMs, cache: m.linea?.cache, cancelada: m.linea?.cancelada, msTotal: m.linea?.msTotal, tmdbLinea: m.linea?.tmdb, redisOps: m.redisOps, fases: m.fases });
    await modelo("prod-3b"); await vaciar(BASE); lineas(A);
    const s1 = await medir(A, "n,d,m"); log("fases/S1-frio-total-en-linea", { resumen: resumenF(s1) });
    await expirar("^(?!home:ub:).*");
    const s3 = await medir(A, "n,d,m", { esperaFondo: true }); log("fases/S3-frio-total-en-fondo", { resumen: resumenF(s3) });
    await expirar("^(?!home:ub:).*");
    const s3b = await medir(A, "n,d,m", { esperaFondo: true }); log("fases/S3b-frio-total-en-fondo-repeticion", { resumen: resumenF(s3b) });
    for (const h of hijos) matar(h);
    writeFileSync(SALIDA, JSON.stringify(salida, null, 2));
    console.log(`[3c0] → ${SALIDA}`);
    return;
  }
  if (process.env.BANCO_MODO === "calibrar-redis") {
    const resumenC = (m) => ({ status: m.status, respuestaMs: m.respuestaMs, cache: m.linea?.cache, origen: m.linea?.origen, publicacion: m.linea?.publicacion, cancelada: m.linea?.cancelada, msTotal: m.linea?.msTotal, tmdbLinea: m.linea?.tmdb, cadenciaLineaPorS: m.linea?.tmdb && m.linea?.msTotal ? +(m.linea.tmdb / (m.linea.msTotal / 1000)).toFixed(1) : null, maxPor1s: m.doble.maxPor1s, concurrenciaMax: m.doble.concurrenciaMax, redisOps: m.redisOps, fases: m.fases });
    await calibrarRedis(A, log, resumenC);
    for (const h of hijos) matar(h);
    writeFileSync(SALIDA, JSON.stringify(salida, null, 2));
    console.log(`[3c0] → ${SALIDA}`);
    return;
  }
  const resumen = (m) => ({ status: m.status, respuestaMs: m.respuestaMs, cache: m.linea?.cache, origen: m.linea?.origen, publicacion: m.linea?.publicacion, cancelada: m.linea?.cancelada, msTotal: m.linea?.msTotal, tmdbLinea: m.linea?.tmdb, cadenciaLineaPorS: m.linea?.tmdb && m.linea?.msTotal ? +(m.linea.tmdb / (m.linea.msTotal / 1000)).toFixed(1) : null, tmdbDoble: m.doble.llamadas, cadenciaPorS: m.doble.cadenciaPorS, maxPor1s: m.doble.maxPor1s, maxPor100ms: m.doble.maxPor100ms, concurrenciaMax: m.doble.concurrenciaMax, redisOps: m.redisOps, fases: m.fases });

  for (const nombreModelo of MODELOS_A_CORRER) {
    const mod = await modelo(nombreModelo);
    // S1 — frío TOTAL en línea (Redis vacío, sin UB): el líder compone en línea.
    await vaciar(BASE); lineas(A);
    const s1 = await medir(A, "n,d,m");
    log(`${nombreModelo}/S1-frio-total-en-linea`, { modelo: mod, medida: s1, resumen: resumen(s1) });
    // S1b — HIT inmediato (control: la fresca recién publicada).
    const s1b = await medir(A, "n,d,m");
    log(`${nombreModelo}/S1b-hit`, { resumen: resumen(s1b) });
    // CAL-342 — calibración contra la observación de la 3.b (fondo, 342 llamadas / 16,7 s):
    // fresca vencida, UB presente, ~40 % de `pv3:` vencidos (ids terminados en 0-3).
    await expirar(FRESCA); await expirar("^pv3:.*[0-3]$");
    const cal = await medir(A, "n,d,m", { esperaFondo: true });
    log(`${nombreModelo}/CAL-342-fondo`, { objetivo: { llamadas: 342, ms: 16682, fuente: "§37, [home-fondo] 15/09" }, medida: cal, resumen: resumen(cal) });
    // CAL-250 — calibración contra la observación de la 3.a (en línea, 250 llamadas / 15,1 s):
    // fresca y UB vencidos, ~30 % de `pv3:` vencidos (ids terminados en 0-2).
    await expirar(FRESCA); await expirar(UB); await expirar("^pv3:.*[0-2]$");
    const calL = await medir(A, "n,d,m");
    log(`${nombreModelo}/CAL-250-linea`, { objetivo: { llamadas: 250, ms: 15091, fuente: "§32.1, [home] 15/09" }, medida: calL, resumen: resumen(calL) });
    // S7 — MISS intradía: sólo la fresca vencida (UB presente) → fondo con pocas llamadas.
    await expirar(FRESCA);
    const s7 = await medir(A, "n,d,m", { esperaFondo: true });
    log(`${nombreModelo}/S7-miss-intradia-fondo`, { resumen: resumen(s7) });
    // S3 — frío TOTAL en FONDO: sólo queda el UB; el fondo compone las 926 con el presupuesto de 50 s.
    const ubs = await control(BASE, "redis", "redis", { accion: "claves", patron: UB });
    await expirar("^(?!home:ub:).*");
    const s3 = await medir(A, "n,d,m", { esperaFondo: true });
    log(`${nombreModelo}/S3-frio-total-en-fondo`, { ubPrevio: ubs.length, medida: s3, resumen: resumen(s3) });
    // S4 — DOS claves frías a la vez, dos procesos, Redis vacío.
    await vaciar(BASE); lineas(A); lineas(B);
    const [s4a, s4b] = await Promise.all([medir(A, "n,d,m", { sinReset: true }), medir(B, "n,d", { sinReset: true })]);
    const mt4 = await marcas("tmdb");
    const g4 = resumenTmdb(mt4, Math.min(s4a.doble.primera ?? Infinity, s4b.doble.primera ?? Infinity) - 1, Date.now());
    log(`${nombreModelo}/S4-dos-claves-dos-procesos`, { nota: "las marcas del doble son globales: `doble` de A y B es la misma serie; la cadencia por proceso es cadenciaLineaPorS", A: resumen(s4a), B: resumen(s4b), global: g4 });
    // S5 — TRES claves frías a la vez, tres procesos, Redis vacío.
    await vaciar(BASE); lineas(A); lineas(B); lineas(C);
    const [s5a, s5b, s5c] = await Promise.all([medir(A, "n,d,m", { sinReset: true }), medir(B, "n,d", { sinReset: true }), medir(C, "d,m", { sinReset: true })]);
    const g5 = resumenTmdb(await marcas("tmdb"), Math.min(...[s5a, s5b, s5c].map((s) => s.doble.primera ?? Infinity)) - 1, Date.now());
    log(`${nombreModelo}/S5-tres-claves-tres-procesos`, { A: resumen(s5a), B: resumen(s5b), C: resumen(s5c), global: g5 });
  }

  // S6 — sensibilidad a Redis: mismo TMDB (prod-3b), Redis a 30 ms (colocado, HIPÓTESIS) y a 300 ms (lento).
  for (const r of [30, 300]) {
    await modelo("prod-3b"); await control(BASE, "redis", "config", { modo: "ok", ...lat(r) });
    await vaciar(BASE); lineas(A);
    const s6 = await medir(A, "n,d,m");
    log(`S6-redis-${r}ms/frio-total-en-linea`, { redisMedianaMs: r, resumen: resumen(s6) });
  }
  // S8 — tmdb-sync SIMULADO (HIPÓTESIS: 10/s constantes contra el mismo doble, mientras un Home frío compone).
  await modelo("prod-3b"); await vaciar(BASE); lineas(A);
  const sync = cargaSimulada(10);
  const s8 = await medir(A, "n,d,m");
  const hechasSync = sync.parar();
  const g8 = resumenTmdb(await marcas("tmdb"), s8.doble.primera - 1, Date.now());
  log("S8-sync-simulado-10ps/frio-total-en-linea", { hipotesis: "tmdb-sync a 10/s constantes; el doble no limita, así que sólo mide la tasa global resultante", llamadasSync: hechasSync, home: resumen(s8), global: g8 });

  for (const h of hijos) matar(h);
  writeFileSync(SALIDA, JSON.stringify(salida, null, 2));
  console.log(`[3c0] → ${SALIDA}`);
}
main().catch((e) => { console.error(e); for (const h of hijos) matar(h); process.exit(1); });
