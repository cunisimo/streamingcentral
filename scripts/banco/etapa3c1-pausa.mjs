// Etapa 3.c.1 — la PAUSA compartida ante 429, en el banco aislado (informe
// §40.4 umbrales, §41.1 sobrepaso, §42 espera sin UB, §44.3 línea base).
// Sin TMDB real, sin credenciales ni servicios de Producción: la app construida
// de esta rama contra los tres dobles, en TRES procesos `next start` que
// comparten el mismo Redis del banco (como varias instancias de Vercel), más un
// cuarto con el kill switch apagado como CONTROL.
//
//   node scripts/banco/etapa3c1-pausa.mjs [salida.json]
//
// Lo que se mide por escenario: las líneas `[home]`/`[home-fondo]` (cache,
// origen, pausa, publicación, liberación), el status HTTP y la duración de
// pared de cada pedido, las llamadas que el doble de TMDB recibió DESPUÉS del
// primer 429 (sobrepaso, por ventanas y con la cadencia pico — contra la línea
// base de §44.3: 750-778 en 3,4-4,4 s), qué escribió Redis (fresca/UB/turno/
// pausa/cubos) y las lecturas del lector (marcas PTTL del doble). Los criterios
// bloqueantes 4-7 del mandato se evalúan al final con lo medido, no con lo que
// la app dice de sí misma.
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { parsearLineaHome, esLineaTerminal, esLineaCompone } from "../../lib/banco-validacion.ts";
import { control, hijos, levantarDobles, levantarNext, matar, vaciar, esperar, dormir, LOGS } from "./comparar-comun.mjs";

const SALIDA = process.argv[2] ?? "docs/medidas/2026-09-18-etapa3c1-banco.json";
const DIR = process.env.BANCO_DESPUES_DIR ?? ".";
const BASE = 4801;
mkdirSync(LOGS, { recursive: true });

// Latencias del modelo "prod-3b" de la 3.c.0 (promedios de Producción; mediana = promedio / 1,137 con p95 = 2,3 × mediana).
const FACTOR_P95 = 2.3, SIGMA = Math.log(FACTOR_P95) / 1.6449, PSM = Math.exp(SIGMA * SIGMA / 2);
const lat = (promedio) => { const m = Math.round(promedio / PSM); return { latenciaMs: m, latenciaP95Ms: Math.round(m * FACTOR_P95) }; };
async function modelo(semilla, redis = { modo: "ok", promedio: 40 }) {
  await control(BASE, "tmdb", "config", { modo: "ok", ...lat(348), semilla: semilla * 3 + 1, retryAfter: 2 });
  await control(BASE, "redis", "config", { modo: redis.modo, ...lat(redis.promedio), semilla: semilla * 3 + 2 });
  await control(BASE, "supabase", "config", { modo: "ok", ...lat(355), semilla: semilla * 3 + 3 });
}
const tmdb429 = (extra = {}) => control(BASE, "tmdb", "config", { modo: "429", latenciaMs: 0, latenciaP95Ms: 0, retryAfter: 2, ...extra });
const tmdbOk = (semilla) => control(BASE, "tmdb", "config", { modo: "ok", ...lat(348), semilla: semilla * 3 + 1, retryAfter: 2 });
const expirar = (patron) => control(BASE, "redis", "redis", { accion: "expirar", patron });
const claves = async () => (await control(BASE, "redis", "redis", { accion: "claves", patron: "." })).map((k) => k.clave);
const estadoRedis = () => control(BASE, "redis", "estado");
const marcas = (doble) => control(BASE, doble, "marcas");
const FRESCA = "^home:[^:]+:v\\d+:";

// ----------------------------------------------------------------- logs de cada next
function lineas(p) {
  const todo = readFileSync(p.log, "utf8");
  const nuevas = todo.slice(p.leido ?? 0).split("\n").map((l) => l.trim());
  p.leido = todo.length;
  const term = (pref) => nuevas.filter((l) => l.startsWith(pref) && esLineaTerminal(l.replace(pref, "[home]")))
    .map((l) => ({ ...parsearLineaHome(l.replace(pref, "[home]")), cancelada: /CANCELADA/.test(l), pausaMs: Number((l.match(/PAUSA (\d+)ms/) ?? [])[1] ?? 0), esperaPausaMs: Number((l.match(/espera pausa (\d+)ms/) ?? [])[1] ?? 0), liberacion: (l.match(/liberacion ([a-z-]+)/) ?? [])[1] ?? null, rechazadas: Number((l.match(/(\d+) rechazadas/) ?? [])[1] ?? 0), x429: Number((l.match(/(\d+) x429/) ?? [])[1] ?? 0), linea: l }));
  return { home: term("[home]"), fondo: term("[home-fondo]"), compone: nuevas.filter(esLineaCompone).length, pausa: nuevas.filter((l) => l.startsWith("[tmdb] pausa")), x429: nuevas.filter((l) => /TMDB 429 en/.test(l)).length };
}
async function esperarLineas(p, cond, ms = 90000) {
  const acc = { home: [], fondo: [], compone: 0, pausa: [] };
  const ok = await esperar(() => { const n = lineas(p); acc.home.push(...n.home); acc.fondo.push(...n.fondo); acc.compone += n.compone; acc.pausa.push(...n.pausa); return cond(acc); }, ms, 200);
  return { ...acc, completo: ok };
}
async function pedir(p, providers, t, timeoutMs = 120000) {
  const url = `http://127.0.0.1:${p.puerto}/api/home?providers=${encodeURIComponent(providers)}${t ? `&t=${encodeURIComponent(t)}` : ""}`;
  const t0 = Date.now();
  const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  const json = await r.json();
  return { status: r.status, retryAfter: r.headers.get("retry-after"), msPared: Date.now() - t0, json, contenido: (json.hero?.length ?? 0) + (json.rails?.length ?? 0), motivo: json.motivo ?? null, error: json.error ?? null, reintentarEnMs: json.reintentarEnMs ?? null };
}
async function salud(p) { const r = await fetch(`http://127.0.0.1:${p.puerto}/api/health`); return (await r.json()).pausa ?? null; }

// ----------------------------------------------------------------- sobrepaso: lo que el doble recibió después del primer 429
function sobrepaso(mt, desde) {
  const en = mt.filter((m) => m.t >= desde && m.f !== "GET /__banco/marcas");
  const primer429 = en.filter((m) => m.s === 429).map((m) => m.t).sort((a, b) => a - b)[0] ?? null;
  const despues = primer429 ? en.filter((m) => m.t >= primer429) : [];
  const ts = despues.map((m) => m.t).sort((a, b) => a - b);
  const ventana = (ms) => despues.filter((m) => m.t < primer429 + ms).length;
  const maxPor = (w) => { let mx = 0, j = 0; for (let i = 0; i < ts.length; i++) { while (ts[i] - ts[j] >= w) j++; mx = Math.max(mx, i - j + 1); } return mx; };
  return { antesDel429: en.length - despues.length, primer429, tras429: { total: despues.length, en1s: ventana(1000), en2s: ventana(2000), en5s: ventana(5000), spanMs: ts.length ? ts.at(-1) - ts[0] : 0, picoPor1s: maxPor(1000), picoPor100ms: maxPor(100) } };
}
const lecturasPttl = (mr, desde) => mr.filter((m) => m.t >= desde && m.c === "PTTL").length;
const marcasDesde = () => Date.now();

// ----------------------------------------------------------------- escenarios
async function main() {
  const salida = { fecha: new Date().toISOString(), rama: "feat/etapa3c1-pausa-tmdb", dir: DIR, lineaBase: "§44.3: 750-778 llamadas tras el primer 429 en 3,4-4,4 s, pico 224-252/s (sin pausa)", escenarios: {}, criterios: {} };
  const log = (k, v) => { salida.escenarios[k] = v; console.log(`[3c1] ${k}:`, JSON.stringify(v).slice(0, 700)); };
  await levantarDobles(BASE);
  const A = await levantarNext("3c1-A", DIR, 3001, BASE, { YUMP_BANCO_FONDO: "1" });
  const B = await levantarNext("3c1-B", DIR, 3002, BASE, { YUMP_BANCO_FONDO: "1" });
  const C = await levantarNext("3c1-C", DIR, 3003, BASE, { YUMP_BANCO_FONDO: "1" });
  const D = await levantarNext("3c1-D-kill", DIR, 3004, BASE, { YUMP_BANCO_FONDO: "1", TMDB_PAUSA_429: "0" });
  const semilla = 11;

  // S0 — sano: frío total, sin 429. Nada de la pausa se nota: MISS, publicada, 0 rechazadas, cubos vacíos.
  await modelo(semilla); await vaciar(BASE); lineas(A);
  const s0 = await pedir(A, "n,d,m");
  const l0 = await esperarLineas(A, (a) => a.home.length >= 1);
  const rs0 = await estadoRedis();
  log("S0-sano-frio", { status: s0.status, msPared: s0.msPared, contenido: s0.contenido, linea: l0.home[0]?.linea.slice(0, 260), publicacion: l0.home[0]?.publicacion ?? l0.home[0]?.linea.match(/publicacion (\S+)/)?.[1], rechazadas: l0.home[0]?.rechazadas, pausaRedis: rs0.pausa, frescaEscrita: (await claves()).some((k) => /^home:[^:]+:v\d+:/.test(k)) });

  // S1 — 429 TOTAL en plena composición fría, SIN UB: la cola se corta (sobrepaso ≤ enVuelo + pocas), nada se publica, la respuesta es 503 + Retry-After (nunca un 200 vacío ni un Home mutilado).
  await vaciar(BASE); lineas(A); await tmdbOk(semilla);
  const desde1 = marcasDesde();
  const p1 = pedir(A, "n,d,m");
  await dormir(4000);
  await tmdb429();
  const s1 = await p1;
  const l1 = await esperarLineas(A, (a) => a.home.length >= 1);
  const sob1 = sobrepaso(await marcas("tmdb"), desde1);
  const k1 = await claves();
  log("S1-429-total-sin-UB", { status: s1.status, retryAfter: s1.retryAfter, motivo: s1.motivo, error: s1.error, reintentarEnMs: s1.reintentarEnMs, contenido: s1.contenido, msPared: s1.msPared, linea: l1.home[0]?.linea.slice(0, 300), liberacion: l1.home[0]?.liberacion, rechazadas: l1.home[0]?.rechazadas, x429: l1.home[0]?.x429, pausaLog: l1.pausa.slice(0, 2), sobrepaso: sob1, frescaEscrita: k1.some((k) => /^home:[^:]+:v\d+:/.test(k)), ubEscrito: k1.some((k) => /^home:ub:/.test(k)), degradadoEscrito: k1.some((k) => /^home:degradado:/.test(k)), turnoVivo: k1.some((k) => /^home:turno:/.test(k)), pausaRedis: (await estadoRedis()).pausa });

  // S1b — un pedido DURANTE la pausa (sin UB), con TMDB ya sano: TOMAR dice pausado → duerme lo que resta (≤ 2 s + jitter) → compone; 200 con contenido; nunca 50 s.
  await tmdbOk(semilla); lineas(A);
  const s1b = await pedir(A, "n,d,m");
  const l1b = await esperarLineas(A, (a) => a.home.length >= 1);
  log("S1b-pedido-durante-la-pausa-sin-UB", { status: s1b.status, msPared: s1b.msPared, contenido: s1b.contenido, linea: l1b.home[0]?.linea.slice(0, 300), esperaPausaMs: l1b.home[0]?.esperaPausaMs, pausaMs: l1b.home[0]?.pausaMs });

  // S1c — pausa LARGA (Retry-After 8 s > ESPERA 5 s), sin UB: 503 inmediato con Retry-After ≈ 8, sin dormir.
  await vaciar(BASE); lineas(A); await tmdbOk(semilla);
  const p1c = pedir(A, "n,d,m"); await dormir(3000); await tmdb429({ retryAfter: 12 }); await p1c;
  await esperarLineas(A, (a) => a.home.length >= 1); await tmdbOk(semilla); lineas(A);
  const s1c = await pedir(A, "n,d,m");
  const l1c = await esperarLineas(A, (a) => a.home.length >= 1);
  log("S1c-pausa-larga-sin-UB-503-inmediato", { status: s1c.status, retryAfter: s1c.retryAfter, reintentarEnMs: s1c.reintentarEnMs, msPared: s1c.msPared, contenido: s1c.contenido, linea: l1c.home[0]?.linea.slice(0, 260), esperaPausaMs: l1c.home[0]?.esperaPausaMs, pausaMs: l1c.home[0]?.pausaMs });
  await dormir(12500);   // que venza esa pausa antes de seguir

  // S2 — 429 TOTAL con UB: el pedido responde el UB en el acto; el fondo se cancela por la pausa; UB intacto, fresca no publicada.
  await vaciar(BASE); lineas(A); await tmdbOk(semilla);
  const cal = await pedir(A, "n,d,m"); await esperarLineas(A, (a) => a.home.length >= 1);   // calienta: fresca + UB
  const ubAntes = JSON.stringify(cal.json);
  await expirar("^(?!home:ub:).*"); lineas(A);   // todo vencido salvo el UB: el fondo reconstruye entero (~926 llamadas)
  const desde2 = marcasDesde();
  const s2 = await pedir(A, "n,d,m");           // UB en el acto; fondo arranca
  await dormir(3000);
  await tmdb429();
  const l2 = await esperarLineas(A, (a) => a.home.length >= 1 && a.fondo.length >= 1);
  const sob2 = sobrepaso(await marcas("tmdb"), desde2);
  const k2 = await claves();
  log("S2-429-total-con-UB", { status: s2.status, msPared: s2.msPared, contenido: s2.contenido, ubIgual: JSON.stringify(s2.json) === ubAntes, lineaHome: l2.home[0]?.linea.slice(0, 220), lineaFondo: l2.fondo[0]?.linea.slice(0, 320), fondoCancelado: l2.fondo[0]?.cancelada, fondoPublicacion: l2.fondo[0]?.linea.match(/publicacion (\S+)/)?.[1], liberacion: l2.fondo[0]?.liberacion, sobrepaso: sob2, frescaEscrita: k2.some((k) => /^home:[^:]+:v\d+:/.test(k)), degradadoEscrito: k2.some((k) => /^home:degradado:/.test(k)) });

  // S2b — pedido DURANTE la pausa con UB: TOMAR pausado → UB en el acto (origen ultimo-bueno-pausa), sin fondo, sin componer.
  lineas(A);
  const s2b = await pedir(A, "n,d,m");
  const l2b = await esperarLineas(A, (a) => a.home.length >= 1);
  log("S2b-pedido-durante-la-pausa-con-UB", { status: s2b.status, msPared: s2b.msPared, contenido: s2b.contenido, ubIgual: JSON.stringify(s2b.json) === ubAntes, linea: l2b.home[0]?.linea.slice(0, 260), compone: l2b.compone });
  await dormir(2500); await tmdbOk(semilla);

  // S3 — propagación entre procesos: A ve el 429 y escribe la pausa; B (que nunca vio un 429) está componiendo OTRA clave: su lector la ve por Δt y su cola se corta; C llega frío con la pausa vigente: TOMAR pausado.
  await vaciar(BASE); lineas(A); lineas(B); lineas(C); await tmdbOk(semilla);
  const desde3 = marcasDesde();
  const pB = pedir(B, "n,d");   // B compone n,d: NUNCA consulta Crunchyroll
  await dormir(1500);
  // 429 SÓLO para /discover/tv de Crunchyroll (with_watch_providers=283|1968): lo consulta A (cr), nunca B ni C.
  await control(BASE, "tmdb", "config", { modo: "429-consulta", consulta429: { path: "/discover/tv", params: { with_watch_providers: "283|1968" } }, ...lat(348), semilla: semilla * 3 + 1, retryAfter: 3 });
  const pA = pedir(A, "cr");
  const s3a = await pA;
  await tmdbOk(semilla);
  const pC = pedir(C, "d,m");   // llega apenas A respondió: la pausa (compartida, 3 s) sigue vigente y TMDB está sano → TOMAR pausado → duerme → compone
  const [s3b, s3c] = await Promise.all([pB, pC]);
  const [l3a, l3b, l3c] = await Promise.all([esperarLineas(A, (a) => a.home.length >= 1), esperarLineas(B, (a) => a.home.length >= 1), esperarLineas(C, (a) => a.home.length >= 1)]);
  const mt3 = await marcas("tmdb"), mr3 = await marcas("redis");
  const sob3 = sobrepaso(mt3, desde3);
  log("S3-propagacion-tres-procesos", { A: { status: s3a.status, motivo: s3a.motivo, rechazadas: l3a.home[0]?.rechazadas, x429: l3a.home[0]?.x429, pausaLog: l3a.pausa.length, linea: l3a.home[0]?.linea.slice(0, 200) }, B: { status: s3b.status, motivo: s3b.motivo, msPared: s3b.msPared, rechazadas: l3b.home[0]?.rechazadas, x429: l3b.home[0]?.x429, pausaLog: l3b.pausa.length, linea: l3b.home[0]?.linea.slice(0, 260) }, C: { status: s3c.status, motivo: s3c.motivo, msPared: s3c.msPared, contenido: s3c.contenido, x429: l3c.home[0]?.x429, pausaMs: l3c.home[0]?.pausaMs, esperaPausaMs: l3c.home[0]?.esperaPausaMs, linea: l3c.home[0]?.linea.slice(0, 260) }, sobrepasoGlobal: sob3, lecturasPTTL: lecturasPttl(mr3, desde3), pausaRedis: (await estadoRedis()).pausa });
  await dormir(3500); await tmdbOk(semilla);

  // S4 — Redis LENTO (300 ms) y CAÍDO con 429: sin tormentas. Lento: el lector sigue leyendo ≤ 1/s; caído: pausa local, ≤ 2 lecturas/min, sin duplicados ni bloqueos.
  await vaciar(BASE); lineas(A); await modelo(semilla, { modo: "ok", promedio: 300 });
  const desde4 = marcasDesde();
  const p4 = pedir(A, "n,d,m"); await dormir(4000); await tmdb429(); const s4 = await p4;
  const l4 = await esperarLineas(A, (a) => a.home.length >= 1);
  const mr4 = await marcas("redis");
  log("S4a-redis-lento-300ms-con-429", { status: s4.status, motivo: s4.motivo, msPared: s4.msPared, linea: l4.home[0]?.linea.slice(0, 260), lecturasPTTL: lecturasPttl(mr4, desde4), sobrepaso: sobrepaso(await marcas("tmdb"), desde4).tras429 });
  await dormir(2500); await tmdbOk(semilla);
  await vaciar(BASE); lineas(A); await modelo(semilla);
  await control(BASE, "redis", "config", { modo: "caido" }); await tmdb429({ retryAfter: 20 });
  const desde4b = marcasDesde();
  const p4b = pedir(A, "n,d,m", "", 240000);   // Redis caído + 429 total desde el inicio; su duración es la promesa reducida de la Etapa 2
  // El segundo pedido sale recién cuando el PROCESO ya vio su 429 (línea `[tmdb] pausa`): pausa LOCAL conocida al entrar.
  // La línea `[tmdb] pausa` sale cuando PAUSAR termina (con Redis caído, tras los reintentos del SDK); la pausa LOCAL
  // rige desde el primer 429 VISTO, que el composer registra al degradar la fuente ("… ErrorTmdb: TMDB 429 en …").
  let x429 = 0;
  const vioLaPausa = await esperar(() => { x429 += lineas(A).x429; return x429 > 0; }, 120000, 50);
  const tPausaConocida = Date.now();
  const p4c = pedir(A, "n,d", "", 240000);     // OTRA clave, con la pausa LOCAL (20 s) conocida, Redis caído, sin UB: precedencia §43.3 → 503 acotado, sin componer
  const [s4b, s4c] = await Promise.all([p4b, p4c]);
  s4c.pausaConocidaAlPedir = vioLaPausa; s4c.msDesdeQueSeVioLaPausa = Date.now() - tPausaConocida;
  const l4bc = await esperarLineas(A, (a) => a.home.length >= 2);
  const l4b = { home: l4bc.home.filter((l) => /:d,m,n:\s*$/.test(l.linea)), compone: l4bc.compone };
  const l4c = { home: l4bc.home.filter((l) => /:d,n:\s*$/.test(l.linea)), compone: l4bc.home.filter((l) => /:d,n:\s*$/.test(l.linea) && /1 composici/.test(l.linea)).length };
  await dormir(3000);
  const mr4b = await marcas("redis");
  await control(BASE, "redis", "config", { modo: "ok", ...lat(40) });
  const tras = mr4b.filter((m) => m.t >= desde4b);
  log("S4b-redis-caido-con-429", { primero: { status: s4b.status, motivo: s4b.motivo, contenido: s4b.contenido, msPared: s4b.msPared, linea: l4b.home[0]?.linea.slice(0, 300) }, duranteLaPausaLocal: { pausaConocidaAlPedir: s4c.pausaConocidaAlPedir, status: s4c.status, motivo: s4c.motivo, contenido: s4c.contenido, msPared: s4c.msPared, compone: l4c.compone, composiciones: l4c.home[0]?.composiciones, pausaMs: l4c.home[0]?.pausaMs, lecturasAcotadas: Number((l4c.home[0]?.linea.match(/(\d+) lectura\(s\) acotada/) ?? [])[1] ?? 0), linea: l4c.home[0]?.linea.slice(0, 300) }, marcasRedisTrasCaida: tras.length, porComandoTrasCaida: tras.reduce((o, m) => { o[m.c] = (o[m.c] ?? 0) + 1; return o; }, {}), lecturasPTTLTrasCaida: tras.filter((m) => m.c === "PTTL").length });
  await dormir(21000); await tmdbOk(semilla);

  // S5 — tres procesos fríos a la vez con 429 total a los 3 s: sobrepaso GLOBAL contra la línea base (sin pausa: ~750 por proceso).
  await vaciar(BASE); lineas(A); lineas(B); lineas(C); await modelo(semilla);
  const desde5 = marcasDesde();
  const p5 = Promise.all([pedir(A, "n,d,m"), pedir(B, "n,d"), pedir(C, "d,m")]);
  await dormir(3000); await tmdb429();
  const s5 = await p5;
  await Promise.all([esperarLineas(A, (a) => a.home.length >= 1), esperarLineas(B, (a) => a.home.length >= 1), esperarLineas(C, (a) => a.home.length >= 1)]);
  const sob5 = sobrepaso(await marcas("tmdb"), desde5);
  const k5 = await claves();
  log("S5-tres-procesos-frios-429-total", { status: s5.map((x) => x.status), motivos: s5.map((x) => x.motivo), sobrepasoGlobal: sob5, frescaEscrita: k5.some((k) => /^home:[^:]+:v\d+:/.test(k)), degradadoEscrito: k5.some((k) => /^home:degradado:/.test(k)), salud: await salud(A) });
  await dormir(2500); await tmdbOk(semilla);

  // S6 — CONTROL: el proceso D con TMDB_PAUSA_429=0 ante el mismo 429 total: el comportamiento de hoy (drena la cola: cientos tras el 429; ENFRIAR degradado).
  await vaciar(BASE); lineas(D); await modelo(semilla);
  const desde6 = marcasDesde();
  const p6 = pedir(D, "n,d,m"); await dormir(4000); await tmdb429(); const s6 = await p6;
  const l6 = await esperarLineas(D, (a) => a.home.length >= 1);
  const sob6 = sobrepaso(await marcas("tmdb"), desde6);
  const k6 = await claves();
  log("S6-CONTROL-kill-switch-apagado", { status: s6.status, contenido: s6.contenido, motivo: s6.motivo, linea: l6.home[0]?.linea.slice(0, 260), sobrepaso: sob6, degradadoEscrito: k6.some((k) => /^home:degradado:/.test(k)), pausaRedis: (await estadoRedis()).pausa.pttl });
  await dormir(2500); await tmdbOk(semilla);

  // /api/health: sólo agregados.
  const h = await fetch(`http://127.0.0.1:${A.puerto}/api/health`).then((r) => r.json());
  log("health", { pausa: h.pausa, sinDatosPrivados: !/uuid|familia|eventos|"id"/.test(JSON.stringify(h)) });

  // ----------------------------------------------------------------- criterios bloqueantes (4-7), con lo medido
  const e = salida.escenarios;
  salida.criterios = {
    "4-429-nunca-publica-un-Home-mutilado": { ok: !e["S1-429-total-sin-UB"].frescaEscrita && !e["S1-429-total-sin-UB"].degradadoEscrito && !e["S2-429-total-con-UB"].frescaEscrita && !e["S5-tres-procesos-frios-429-total"].frescaEscrita && !e["S5-tres-procesos-frios-429-total"].degradadoEscrito, detalle: "fresca/degradado en Redis tras un 429 total (S1, S2, S5)" },
    "5-con-UB-inmediato": { ok: e["S2-429-total-con-UB"].status === 200 && e["S2-429-total-con-UB"].ubIgual && e["S2b-pedido-durante-la-pausa-con-UB"].status === 200 && e["S2b-pedido-durante-la-pausa-con-UB"].ubIgual && e["S2b-pedido-durante-la-pausa-con-UB"].msPared < 2000, msPared: [e["S2-429-total-con-UB"].msPared, e["S2b-pedido-durante-la-pausa-con-UB"].msPared] },
    "6-sin-UB-nunca-50s-ni-200-vacio": { ok: [e["S1-429-total-sin-UB"], e["S1c-pausa-larga-sin-UB-503-inmediato"]].every((x) => x.status === 503 && x.retryAfter && x.contenido === 0) && e["S1b-pedido-durante-la-pausa-sin-UB"].status === 200 && e["S1b-pedido-durante-la-pausa-sin-UB"].contenido > 0 && [e["S1-429-total-sin-UB"], e["S1b-pedido-durante-la-pausa-sin-UB"], e["S1c-pausa-larga-sin-UB-503-inmediato"]].every((x) => x.msPared < 30000), msPared: [e["S1-429-total-sin-UB"].msPared, e["S1b-pedido-durante-la-pausa-sin-UB"].msPared, e["S1c-pausa-larga-sin-UB-503-inmediato"].msPared] },
    "7-redis-lento-caido-sin-tormenta": { ok: e["S4a-redis-lento-300ms-con-429"].lecturasPTTL <= 40 && e["S4b-redis-caido-con-429"].lecturasPTTLTrasCaida <= 6 && e["S4b-redis-caido-con-429"].duranteLaPausaLocal.status === 503 && e["S4b-redis-caido-con-429"].duranteLaPausaLocal.compone === 0 && e["S4b-redis-caido-con-429"].duranteLaPausaLocal.pausaConocidaAlPedir === true && e["S4b-redis-caido-con-429"].duranteLaPausaLocal.msPared <= 4000, limiteLocalMs: 3000 + 1000, msParedPausaLocal: e["S4b-redis-caido-con-429"].duranteLaPausaLocal.msPared, lecturas: [e["S4a-redis-lento-300ms-con-429"].lecturasPTTL, e["S4b-redis-caido-con-429"].lecturasPTTLTrasCaida], porComando: e["S4b-redis-caido-con-429"].porComandoTrasCaida, nota: "la duración del primer pedido con Redis caído es la promesa reducida de la Etapa 2 (reintentos del SDK por lectura), no la 3.c.1" },
    "propagacion-entre-procesos": { ok: e["S3-propagacion-tres-procesos"].B.x429 === 0 && e["S3-propagacion-tres-procesos"].B.rechazadas > 0 && e["S3-propagacion-tres-procesos"].C.x429 === 0 && e["S3-propagacion-tres-procesos"].C.pausaMs > 0 && e["S3-propagacion-tres-procesos"].C.status === 200, detalle: "B (sin 429 propio) cortado por el lector; C (frío) pausado por TOMAR y luego compuesto" },
    "sobrepaso-vs-linea-base": { conPausa: { S1: e["S1-429-total-sin-UB"].sobrepaso.tras429.total, S2: e["S2-429-total-con-UB"].sobrepaso.tras429.total, S5global: e["S5-tres-procesos-frios-429-total"].sobrepasoGlobal.tras429.total }, controlSinPausa: e["S6-CONTROL-kill-switch-apagado"].sobrepaso.tras429.total, lineaBase: "750-778 por proceso" },
  };
  for (const h of hijos) matar(h);
  writeFileSync(SALIDA, JSON.stringify(salida, null, 2));
  console.log(`[3c1] criterios:`, JSON.stringify(salida.criterios, null, 1));
  console.log(`[3c1] → ${SALIDA}`);
}
main().catch((e) => { console.error(e); for (const h of hijos) matar(h); process.exit(1); });
