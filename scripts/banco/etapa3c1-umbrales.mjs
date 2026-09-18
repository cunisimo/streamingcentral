// Etapa 3.c.1 — UMBRALES del camino SANO, antes/después (informe §40.4/§41.7):
// con TMDB sano la pausa no puede costar. Dos versiones de la app, cada una
// contra SUS propios dobles (como el comparador de identidad), tres semillas,
// y por semilla: un frío total en línea, y el camino UB-primero (fresca
// vencida → UB en el acto → reconstrucción en fondo). Se comparan, por
// composición: llamadas a TMDB (0 de diferencia), operaciones de Redis
// adicionales (≤ ⌈llamadas / 24⌉ + 2), duración (mediana ≤ +5 %, ninguna
// repetición > +10 %), publicación (≤ +1 operación) y respuesta del UB
// (≤ +50 ms). Los umbrales se fijaron ANTES de medir (§40.4) y no se mueven.
//
//   BANCO_ANTES_DIR=../wt-etapa3c1-antes node scripts/banco/etapa3c1-umbrales.mjs [salida.json]
import { writeFileSync, readFileSync } from "node:fs";
import { parsearLineaHome, esLineaTerminal } from "../../lib/banco-validacion.ts";
import { control, hijos, levantarDobles, levantarNext, matar, vaciar, esperar, dormir, pedirHome } from "./comparar-comun.mjs";

const ANTES_DIR = process.env.BANCO_ANTES_DIR;
if (!ANTES_DIR) { console.error("falta BANCO_ANTES_DIR (el worktree con el build de 37d4707)"); process.exit(2); }
const SALIDA = process.argv[2] ?? "docs/medidas/2026-09-18-etapa3c1-umbrales.json";
const V = { antes: { dir: ANTES_DIR, puerto: 3000, base: 4801 }, despues: { dir: ".", puerto: 3001, base: 4811 } };
const SEMILLAS = (process.env.BANCO_SEMILLAS ?? "11,22,33").split(",").map(Number);
const FACTOR_P95 = 2.3, SIGMA = Math.log(FACTOR_P95) / 1.6449, PSM = Math.exp(SIGMA * SIGMA / 2);
const lat = (promedio) => { const m = Math.round(promedio / PSM); return { latenciaMs: m, latenciaP95Ms: Math.round(m * FACTOR_P95) }; };
async function modelo(base, semilla) {
  await control(base, "tmdb", "config", { modo: "ok", ...lat(348), semilla: semilla * 3 + 1 });
  await control(base, "redis", "config", { modo: "ok", ...lat(40), semilla: semilla * 3 + 2 });
  await control(base, "supabase", "config", { modo: "ok", ...lat(355), semilla: semilla * 3 + 3 });
}
function lineas(p) {
  const todo = readFileSync(p.log, "utf8");
  const nuevas = todo.slice(p.leido ?? 0).split("\n").map((l) => l.trim());
  p.leido = todo.length;
  const term = (pref) => nuevas.filter((l) => l.startsWith(pref) && esLineaTerminal(l.replace(pref, "[home]"))).map((l) => ({ ...parsearLineaHome(l.replace(pref, "[home]")), linea: l }));
  return { home: term("[home]"), fondo: term("[home-fondo]") };
}
async function esperarLineas(p, cond, ms = 150000) {
  const acc = { home: [], fondo: [] };
  await esperar(() => { const n = lineas(p); acc.home.push(...n.home); acc.fondo.push(...n.fondo); return cond(acc); }, ms, 200);
  return acc;
}
const marcasRedis = (base) => control(base, "redis", "marcas");
const opsRedisDesde = (ms, desde) => ms.filter((m) => m.t >= desde).length;
const publicaciones = (ms, desde) => ms.filter((m) => m.t >= desde && (m.c === "EVAL" || m.c === "EVALSHA")).length;

async function medirVersion(nombre, p, base, semilla) {
  await modelo(base, semilla); await vaciar(base); lineas(p);
  const d0 = Date.now();
  const frio = await pedirHome(p, "n,d,m", "");
  const lf = await esperarLineas(p, (a) => a.home.length >= 1);
  const mrFrio = await marcasRedis(base);
  const linea = lf.home[0];
  // UB-primero: fresca vencida, la respuesta es el UB y el fondo reconstruye.
  await control(base, "redis", "redis", { accion: "expirar", patron: "^home:[^:]+:v\\d+:" }); lineas(p);
  const d1 = Date.now();
  const ub = await pedirHome(p, "n,d,m", "");
  const lu = await esperarLineas(p, (a) => a.home.length >= 1 && a.fondo.length >= 1);
  const mrFondo = await marcasRedis(base);
  return {
    frio: { status: frio.status, msPared: frio.msPared, msTotal: linea?.msTotal, tmdb: linea?.tmdb, redisComandos: linea?.redisComandos, redisOpsDoble: opsRedisDesde(mrFrio, d0), publicacion: linea?.publicacion, cache: linea?.cache },
    ub: { status: ub.status, msPared: ub.msPared, msTotalSolicitud: lu.home[0]?.msTotal, cache: lu.home[0]?.cache, fondo: { msTotal: lu.fondo[0]?.msTotal, tmdb: lu.fondo[0]?.tmdb, redisComandos: lu.fondo[0]?.redisComandos, publicacion: lu.fondo[0]?.publicacion, redisOpsDoble: opsRedisDesde(mrFondo, d1), evalsDoble: publicaciones(mrFondo, d1) } },
  };
}
const mediana = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

async function main() {
  const salida = { fecha: new Date().toISOString(), antes: "37d4707", despues: "feat/etapa3c1-pausa-tmdb", semillas: SEMILLAS, corridas: [], umbrales: {} };
  await levantarDobles(V.antes.base); await levantarDobles(V.despues.base);
  const pa = await levantarNext("umb-antes", V.antes.dir, V.antes.puerto, V.antes.base, { YUMP_BANCO_FONDO: "1" });
  const pd = await levantarNext("umb-despues", V.despues.dir, V.despues.puerto, V.despues.base, { YUMP_BANCO_FONDO: "1" });
  for (const semilla of SEMILLAS) {
    const [a, d] = await Promise.all([medirVersion("antes", pa, V.antes.base, semilla), medirVersion("despues", pd, V.despues.base, semilla)]);
    salida.corridas.push({ semilla, antes: a, despues: d });
    console.log(`[umb] semilla ${semilla} | frío: tmdb ${a.frio.tmdb}/${d.frio.tmdb} redis ${a.frio.redisOpsDoble}/${d.frio.redisOpsDoble} ms ${a.frio.msTotal}/${d.frio.msTotal} | UB: respuesta ${a.ub.msPared}/${d.ub.msPared} ms, fondo tmdb ${a.ub.fondo.tmdb}/${d.ub.fondo.tmdb} redis ${a.ub.fondo.redisOpsDoble}/${d.ub.fondo.redisOpsDoble} ms ${a.ub.fondo.msTotal}/${d.ub.fondo.msTotal} evals ${a.ub.fondo.evalsDoble}/${d.ub.fondo.evalsDoble}`);
    await dormir(500);
  }
  const c = salida.corridas;
  const tope = (llamadas) => Math.ceil(llamadas / 24) + 2;
  const eval_ = (nombre, ok, detalle) => { salida.umbrales[nombre] = { ok, ...detalle }; };
  eval_("tmdb-0-diferencia", c.every((x) => x.antes.frio.tmdb === x.despues.frio.tmdb && x.antes.ub.fondo.tmdb === x.despues.ub.fondo.tmdb), { frio: c.map((x) => [x.antes.frio.tmdb, x.despues.frio.tmdb]), fondo: c.map((x) => [x.antes.ub.fondo.tmdb, x.despues.ub.fondo.tmdb]) });
  eval_("redis-extra-≤-⌈llamadas/24⌉+2", c.every((x) => x.despues.frio.redisOpsDoble - x.antes.frio.redisOpsDoble <= tope(x.antes.frio.tmdb) && x.despues.ub.fondo.redisOpsDoble - x.antes.ub.fondo.redisOpsDoble <= tope(x.antes.ub.fondo.tmdb)), { frio: c.map((x) => ({ antes: x.antes.frio.redisOpsDoble, despues: x.despues.frio.redisOpsDoble, extra: x.despues.frio.redisOpsDoble - x.antes.frio.redisOpsDoble, tope: tope(x.antes.frio.tmdb) })), fondo: c.map((x) => ({ antes: x.antes.ub.fondo.redisOpsDoble, despues: x.despues.ub.fondo.redisOpsDoble, extra: x.despues.ub.fondo.redisOpsDoble - x.antes.ub.fondo.redisOpsDoble, tope: tope(x.antes.ub.fondo.tmdb) })) });
  const dFrio = { antes: mediana(c.map((x) => x.antes.frio.msTotal)), despues: mediana(c.map((x) => x.despues.frio.msTotal)) };
  const dFondo = { antes: mediana(c.map((x) => x.antes.ub.fondo.msTotal)), despues: mediana(c.map((x) => x.despues.ub.fondo.msTotal)) };
  const peorRep = Math.max(...c.map((x) => x.despues.frio.msTotal / x.antes.frio.msTotal), ...c.map((x) => x.despues.ub.fondo.msTotal / x.antes.ub.fondo.msTotal));
  eval_("duracion-mediana-≤+5%-y-ninguna->+10%", dFrio.despues <= dFrio.antes * 1.05 && dFondo.despues <= dFondo.antes * 1.05 && peorRep <= 1.10, { frio: dFrio, fondo: dFondo, peorRepeticion: +peorRep.toFixed(3), porSemilla: c.map((x) => ({ frio: [x.antes.frio.msTotal, x.despues.frio.msTotal], fondo: [x.antes.ub.fondo.msTotal, x.despues.ub.fondo.msTotal] })) });
  eval_("publicacion-≤+1-op", c.every((x) => x.despues.ub.fondo.evalsDoble - x.antes.ub.fondo.evalsDoble <= 1 && x.despues.ub.fondo.publicacion === "publicado" && x.despues.frio.publicacion === "publicado"), { evals: c.map((x) => [x.antes.ub.fondo.evalsDoble, x.despues.ub.fondo.evalsDoble]), publicacion: c.map((x) => [x.antes.ub.fondo.publicacion, x.despues.ub.fondo.publicacion]) });
  const ubMed = { antes: mediana(c.map((x) => x.antes.ub.msPared)), despues: mediana(c.map((x) => x.despues.ub.msPared)) };
  eval_("respuesta-UB-≤+50ms", ubMed.despues <= ubMed.antes + 50, { mediana: ubMed, porSemilla: c.map((x) => [x.antes.ub.msPared, x.despues.ub.msPared]) });
  for (const h of hijos) matar(h);
  writeFileSync(SALIDA, JSON.stringify(salida, null, 2));
  console.log("[umb] umbrales:", JSON.stringify(salida.umbrales, null, 1));
  console.log(`[umb] → ${SALIDA}`);
}
main().catch((e) => { console.error(e); for (const h of hijos) matar(h); process.exit(1); });
