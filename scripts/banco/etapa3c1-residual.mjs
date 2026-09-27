// Etapa 3.c.1 — trabajo RESIDUAL de Redis tras responder (auditoría sobre
// d322282). Sólo el escenario S4b del banco de la pausa, en UN proceso, contra
// cualquier build: sirve para comparar el código corregido con el de `d322282`
// como CONTROL (que SÍ deja trabajo residual: la carrera `conTope` respondía en
// ~3 s pero el MGET del cliente principal seguía reintentando 20-25 s después).
//
//   BANCO_DIR=<worktree construido con el entorno del banco> node scripts/banco/etapa3c1-residual.mjs [salida.json]
//
// Qué mide: con Redis CAÍDO y TMDB en 429 total (Retry-After 20 s), un primer
// pedido (n,d,m) que sirve para que el proceso vea su 429 y, con la pausa LOCAL
// ya conocida, un segundo pedido (n,d) sin UB. Sobre las marcas del doble de
// Redis —una por petición HTTP recibida, con comando y primera clave— se cuentan
// los comandos con claves del SEGUNDO pedido en tres grupos contra el instante
// de su respuesta: iniciados y terminados antes; iniciados antes y terminados
// después; iniciados DESPUÉS (tardíos). Las marcas se leen ≥ 10 s después de
// esa respuesta. Sin TMDB real ni credenciales de Producción.
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { parsearLineaHome, esLineaTerminal, esLineaCompone } from "../../lib/banco-validacion.ts";
import { control, hijos, levantarDobles, levantarNext, matar, vaciar, esperar, dormir, LOGS } from "./comparar-comun.mjs";

const DIR = process.env.BANCO_DIR ?? ".";
const SALIDA = process.argv[2] ?? `docs/medidas/2026-09-18-etapa3c1-residual-${DIR === "." ? "despues" : "control"}.json`;
const BASE = Number(process.env.BANCO_BASE ?? 4811);
const PUERTO = Number(process.env.BANCO_PUERTO ?? 3011);
mkdirSync(LOGS, { recursive: true });

const FACTOR_P95 = 2.3, SIGMA = Math.log(FACTOR_P95) / 1.6449, PSM = Math.exp(SIGMA * SIGMA / 2);
const lat = (promedio) => { const m = Math.round(promedio / PSM); return { latenciaMs: m, latenciaP95Ms: Math.round(m * FACTOR_P95) }; };
const marcas = (doble) => control(BASE, doble, "marcas");

function lineas(p) {
  const todo = readFileSync(p.log, "utf8");
  const nuevas = todo.slice(p.leido ?? 0).split("\n").map((l) => l.trim());
  p.leido = todo.length;
  const home = nuevas.filter((l) => l.startsWith("[home]") && esLineaTerminal(l)).map((l) => ({ ...parsearLineaHome(l), pausaMs: Number((l.match(/PAUSA (\d+)ms/) ?? [])[1] ?? 0), lecturasAcotadas: Number((l.match(/(\d+) lectura\(s\) acotada/) ?? [])[1] ?? 0), linea: l }));
  return { home, compone: nuevas.filter(esLineaCompone).length, x429: nuevas.filter((l) => /TMDB 429 en/.test(l)).length };
}
async function pedir(p, providers, timeoutMs) {
  const t0 = Date.now();
  const r = await fetch(`http://127.0.0.1:${p.puerto}/api/home?providers=${encodeURIComponent(providers)}`, { signal: AbortSignal.timeout(timeoutMs) });
  const json = await r.json();
  return { status: r.status, retryAfter: r.headers.get("retry-after"), msPared: Date.now() - t0, tFin: Date.now(), contenido: (json.hero?.length ?? 0) + (json.rails?.length ?? 0), motivo: json.motivo ?? null };
}
function residual(mr, desde, tFin, patronClave, tMarcas) {
  const propias = mr.filter((m) => m.t >= desde && patronClave.test(m.k ?? ""));
  const iniciadas = propias.filter((m) => m.t <= tFin);
  const tardias = propias.filter((m) => m.t > tFin);
  return {
    ventanaMs: tMarcas - tFin,
    iniciadasAntesDeResponder: iniciadas.length,
    completadasAntes: iniciadas.filter((m) => m.fin && m.fin <= tFin).length,
    completadasDespues: iniciadas.filter((m) => !m.fin || m.fin > tFin).length,
    tardias: tardias.length,
    tardiasMsTrasRespuesta: tardias.map((m) => m.t - tFin).sort((a, b) => a - b),
    porComando: propias.reduce((o, m) => { o[m.c] = (o[m.c] ?? 0) + 1; return o; }, {}),
    claves: [...new Set(propias.map((m) => m.k))],
  };
}

async function main() {
  const commit = (() => { try { return readFileSync(`${DIR}/.git`, "utf8").trim(); } catch { return null; } })();
  const salida = { fecha: new Date().toISOString(), dir: DIR, buildId: (() => { try { return readFileSync(`${DIR}/.next/BUILD_ID`, "utf8").trim(); } catch { return null; } })(), commitRef: commit };
  await levantarDobles(BASE);
  const A = await levantarNext("3c1-residual", DIR, PUERTO, BASE, { YUMP_BANCO_FONDO: "1" });
  await dormir(1500);
  await control(BASE, "tmdb", "config", { modo: "ok", ...lat(348), semilla: 34, retryAfter: 2 });
  await control(BASE, "supabase", "config", { modo: "ok", ...lat(355), semilla: 36 });
  await vaciar(BASE); lineas(A);
  await control(BASE, "redis", "config", { modo: "caido" });
  await control(BASE, "tmdb", "config", { modo: "429", latenciaMs: 0, latenciaP95Ms: 0, retryAfter: 20 });
  const desde = Date.now();
  const p1 = pedir(A, "n,d,m", 240000);
  let x429 = 0;
  const vioLaPausa = await esperar(() => { x429 += lineas(A).x429; return x429 > 0; }, 120000, 50);
  const s2 = await pedir(A, "n,d", 240000);
  s2.pausaConocidaAlPedir = vioLaPausa;
  // ≥ 10 s después de la respuesta del pedido pausado, sin esperar al primero.
  await esperar(() => Date.now() - s2.tFin >= 10000, 30000, 200);
  await dormir(2000);
  const mr = await marcas("redis");
  const tMarcas = Date.now();
  const l = lineas(A);
  const linea2 = l.home.find((h) => /:d,n:\s*$/.test(h.linea));
  salida.pausado = { ...s2, compone: l.home.filter((h) => /:d,n:\s*$/.test(h.linea) && /1 composici/.test(h.linea)).length, pausaMs: linea2?.pausaMs, lecturasAcotadas: linea2?.lecturasAcotadas, linea: linea2?.linea.slice(0, 300) };
  salida.residual = residual(mr, desde, s2.tFin, /:d,n:/, tMarcas);
  salida.tmdbTrasLaPausa = (await marcas("tmdb")).filter((m) => m.t > s2.tFin - s2.msPared && m.f !== "GET /__banco/marcas").length;
  salida.veredicto = { sinTrabajoResidual: salida.residual.ventanaMs >= 10000 && salida.residual.tardias === 0 && salida.residual.completadasDespues === 0 };
  console.log(`[residual] ${DIR}:`, JSON.stringify(salida, null, 1));
  const s1 = await p1;
  salida.primero = { status: s1.status, motivo: s1.motivo, msPared: s1.msPared };
  for (const h of hijos) matar(h);
  writeFileSync(SALIDA, JSON.stringify(salida, null, 2));
  console.log(`[residual] → ${SALIDA}`);
}
main().catch((e) => { console.error(e); for (const h of hijos) matar(h); process.exit(1); });
