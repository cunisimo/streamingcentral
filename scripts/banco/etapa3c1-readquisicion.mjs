// Etapa 3.c.1 — trabajo RESIDUAL de la READQUISICIÓN tras una pausa corta
// (auditoría sobre 1403ae4). Un proceso `next start` contra los tres dobles,
// para cualquier build: sirve para comparar la corrección con `1403ae4` como
// CONTROL (que SÍ deja trabajo residual: la readquisición era `tomar()` por el
// cliente principal y una carrera local; el TOMAR, sus reintentos, la
// reconciliación GET y hasta un LIBERAR seguían después del 503).
//
//   BANCO_DIR=<worktree construido con el entorno del banco> node scripts/banco/etapa3c1-readquisicion.mjs [salida.json]
//
// Dos variantes de Redis, cada una en un proceso limpio: CAÍDO (el doble corta
// el socket) y COLGADO (responde 15 s tarde). Secuencia: TMDB en 429 total con
// `Retry-After: 3` → un primer pedido (n,d,m) hace que el proceso vea su 429 y
// registre la pausa (local 3 s; compartida en Redis, que todavía responde) →
// Redis pasa al modo de la variante y TMDB vuelve a "ok" → un segundo pedido
// (n,d), sin UB, con la pausa local conocida: lecturas acotadas, UN sueño
// (restante ≤ ESPERA_PAUSA_MAX) y la ÚNICA readquisición. TMDB sigue en 429
// todo el escenario (es la tormenta que la pausa modela); el primer pedido no
// se espera: con Redis caído su composición queda en la promesa reducida de la
// Etapa 2 y no es lo que se mide. Sobre las marcas del
// doble de Redis se correlacionan los comandos de ESE pedido —por sus claves
// (`:d,n:`) Y por su propietario (el de su línea `[home]`), porque en
// EVALSHA la clave no es la primera posición— en tres grupos contra el instante
// de la respuesta: iniciados y terminados antes; iniciados antes y terminados
// después (o nunca); iniciados DESPUÉS (tardíos). Se observa ≥ 20 s después de
// responder. Sin TMDB real ni credenciales de Producción.
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { parsearLineaHome, esLineaTerminal, esLineaCompone } from "../../lib/banco-validacion.ts";
import { control, hijos, levantarDobles, levantarNext, matar, vaciar, esperar, dormir, LOGS } from "./comparar-comun.mjs";

const DIR = process.env.BANCO_DIR ?? ".";
const SALIDA = process.argv[2] ?? `docs/medidas/2026-09-19-etapa3c1-readquisicion-${DIR === "." ? "despues" : "control"}.json`;
const BASE = Number(process.env.BANCO_BASE ?? 4811);
const PUERTO = Number(process.env.BANCO_PUERTO ?? 3011);
const VENTANA_MS = 20000;
const RETRY_AFTER_S = 3;
mkdirSync(LOGS, { recursive: true });

const FACTOR_P95 = 2.3, SIGMA = Math.log(FACTOR_P95) / 1.6449, PSM = Math.exp(SIGMA * SIGMA / 2);
const lat = (promedio) => { const m = Math.round(promedio / PSM); return { latenciaMs: m, latenciaP95Ms: Math.round(m * FACTOR_P95) }; };
const marcas = (doble) => control(BASE, doble, "marcas");

function lineas(p) {
  const todo = readFileSync(p.log, "utf8");
  const nuevas = todo.slice(p.leido ?? 0).split("\n").map((l) => l.trim());
  p.leido = todo.length;
  const home = nuevas.filter((l) => l.startsWith("[home]") && esLineaTerminal(l)).map((l) => ({ ...parsearLineaHome(l), propietario: (l.match(/propietario (\S+)/) ?? [])[1] ?? null, pausaMs: Number((l.match(/PAUSA (\d+)ms/) ?? [])[1] ?? 0), esperaPausaMs: Number((l.match(/espera pausa (\d+)ms/) ?? [])[1] ?? 0), lecturasAcotadas: Number((l.match(/(\d+) lectura\(s\) acotada/) ?? [])[1] ?? 0), linea: l }));
  return { home, duerme: nuevas.filter((l) => /^\[home\] duerme/.test(l)), compone: nuevas.filter(esLineaCompone).length, x429: nuevas.filter((l) => /TMDB 429 en/.test(l)).length };
}
async function pedir(p, providers, timeoutMs) {
  const t0 = Date.now();
  const r = await fetch(`http://127.0.0.1:${p.puerto}/api/home?providers=${encodeURIComponent(providers)}`, { signal: AbortSignal.timeout(timeoutMs) });
  const json = await r.json();
  return { status: r.status, retryAfter: r.headers.get("retry-after"), msPared: Date.now() - t0, tInicio: t0, tFin: Date.now(), contenido: (json.hero?.length ?? 0) + (json.rails?.length ?? 0), motivo: json.motivo ?? null };
}
function residual(mr, desde, tFin, esPropia, tMarcas) {
  const propias = mr.filter((m) => m.t >= desde && esPropia(m));
  const iniciadas = propias.filter((m) => m.t <= tFin);
  const tardias = propias.filter((m) => m.t > tFin);
  const cmdCorto = (m) => `${m.c}${m.cmd ? " " + m.cmd.slice(0, 90) : ""}`;
  return {
    ventanaMs: tMarcas - tFin,
    iniciadasAntesDeResponder: iniciadas.length,
    completadasAntes: iniciadas.filter((m) => m.fin && m.fin <= tFin).length,
    completadasDespuesONunca: iniciadas.filter((m) => !m.fin || m.fin > tFin).map((m) => ({ c: m.c, msTrasRespuesta: m.fin ? m.fin - tFin : null, status: m.s ?? null })),
    tardias: tardias.map((m) => ({ c: m.c, msTrasRespuesta: m.t - tFin, status: m.s ?? null })),
    porComando: propias.reduce((o, m) => { o[m.c] = (o[m.c] ?? 0) + 1; return o; }, {}),
    comandos: propias.map((m) => `${m.t - tFin >= 0 ? "+" : ""}${m.t - tFin}ms ${cmdCorto(m)}`),
  };
}

async function variante(modo, puerto) {
  const A = await levantarNext(`3c1-readq-${modo}`, DIR, puerto, BASE, { YUMP_BANCO_FONDO: "1" });
  await dormir(1500);
  const salida = { modo };
  try {
    await control(BASE, "tmdb", "config", { modo: "ok", ...lat(348), semilla: 34, retryAfter: 2 });
    await control(BASE, "supabase", "config", { modo: "ok", ...lat(355), semilla: 36 });
    await control(BASE, "redis", "config", { modo: "ok", ...lat(40), semilla: 35, colgadoMs: 15000 });
    await vaciar(BASE); lineas(A);
    await control(BASE, "tmdb", "config", { modo: "429", latenciaMs: 0, latenciaP95Ms: 0, retryAfter: RETRY_AFTER_S });
    const p1 = pedir(A, "n,d,m", 240000);
    let x429 = 0;
    const vioLaPausa = await esperar(() => { x429 += lineas(A).x429; return x429 > 0; }, 120000, 20);
    const tPausa = Date.now();
    // Redis pasa al modo de la variante; TMDB sigue en 429 con Retry-After corto.
    await control(BASE, "redis", "config", { modo, latenciaMs: 0, latenciaP95Ms: 0, colgadoMs: 15000 });
    const desde = Date.now();
    let primero = null; p1.then((r) => { primero = { status: r.status, motivo: r.motivo, msPared: r.msPared }; }, (e) => { primero = { error: String(e).slice(0, 80) }; });
    const s2 = await pedir(A, "n,d", 400000);
    s2.pausaConocidaAlPedir = vioLaPausa; s2.msDesdeEl429 = s2.tInicio - tPausa;
    await esperar(() => Date.now() - s2.tFin >= VENTANA_MS, VENTANA_MS + 5000, 200);
    await dormir(1000);
    const mr = await marcas("redis");
    const tMarcas = Date.now();
    const l = lineas(A);
    const linea2 = l.home.find((h) => /:d,n:\s*$/.test(h.linea));
    const propietario = linea2?.propietario ?? null;
    const esPropia = (m) => !!m.cmd && (m.cmd.includes(":d,n:") || (propietario !== null && m.cmd.includes(propietario)));
    salida.pausado = { ...s2, propietario, compone: l.home.filter((h) => /:d,n:\s*$/.test(h.linea) && /1 composici/.test(h.linea)).length, durmio: l.duerme.filter((d) => /:d,n:/.test(d)).length, pausaMs: linea2?.pausaMs, esperaPausaMs: linea2?.esperaPausaMs, lecturasAcotadas: linea2?.lecturasAcotadas, linea: linea2?.linea.slice(0, 320) };
    salida.residual = residual(mr, desde, s2.tFin, esPropia, tMarcas);
    // Transparencia: TODO lo que el doble de Redis recibió después de la respuesta, sea de quien sea (el primer pedido y sus claves también corren).
    const todosTras = mr.filter((m) => m.t > s2.tFin);
    salida.redisTrasLaRespuestaTodos = { total: todosTras.length, porComando: todosTras.reduce((o, m) => { o[m.c] = (o[m.c] ?? 0) + 1; return o; }, {}), propios: todosTras.filter(esPropia).length };
    salida.veredicto = { sinTrabajoResidual: salida.residual.ventanaMs >= 10000 && salida.residual.tardias.length === 0 && salida.residual.completadasDespuesONunca.length === 0 };
    salida.primero = primero ?? { pendiente: true, nota: "no se espera: con Redis caído/colgado su composición es la promesa reducida de la Etapa 2" };
  } finally {
    matar(A);
    await control(BASE, "redis", "config", { modo: "ok", ...lat(40) });
    await dormir(1000);
  }
  console.log(`[readq] ${DIR} ${modo}:`, JSON.stringify(salida, null, 1));
  return salida;
}

async function main() {
  const salida = { fecha: new Date().toISOString(), dir: DIR, buildId: (() => { try { return readFileSync(`${DIR}/.next/BUILD_ID`, "utf8").trim(); } catch { return null; } })(), retryAfterS: RETRY_AFTER_S, ventanaMs: VENTANA_MS, variantes: {} };
  await levantarDobles(BASE);
  let puerto = PUERTO;
  for (const modo of ["caido", "colgado"]) salida.variantes[modo] = await variante(modo, puerto++);
  for (const h of hijos) matar(h);
  writeFileSync(SALIDA, JSON.stringify(salida, null, 2));
  console.log(`[readq] → ${SALIDA}`);
}
main().catch((e) => { console.error(e); for (const h of hijos) matar(h); process.exit(1); });
