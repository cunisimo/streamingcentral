// Banco de la Etapa 3.b, "último bueno primero" (diseño §33, criterios §33.7):
// dos versiones —el "antes" (`903832e`, la Etapa 3.a en Producción) y la rama—
// cada una contra sus propios dobles y su propio Redis del banco. Sin TMDB real.
//
//   BANCO_ANTES_DIR=../wt-etapa3b-antes node scripts/banco/etapa3b-ub-primero.mjs [salida.json]
//
// El doble de TMDB responde con LATENCIA (60 ms por llamada) para que una
// composición tarde varios segundos y "responder en el acto" sea medible. La
// rama corre con `YUMP_BANCO_FONDO=1` (fuera de Vercel no hay waitUntil; en
// `next start` el proceso vive lo suficiente para que el fondo termine), y
// además en dos procesos de control: con `HOME_UB_PRIMERO=0` (kill switch) y
// SIN `YUMP_BANCO_FONDO` (fondo no disponible): los dos tienen que comportarse
// exactamente como el "antes".
import { writeFileSync } from "node:fs";
import { parsearLineaHome, esLineaCompone, esLineaTerminal } from "../../lib/banco-validacion.ts";
import {
  FECHA, canon, control, hijos, levantarDobles, levantarNext, matar, pedirHome, vaciar, esperar, dormir,
} from "./comparar-comun.mjs";
import { readFileSync } from "node:fs";

const ANTES_DIR = process.env.BANCO_ANTES_DIR;
const DESPUES_DIR = process.env.BANCO_DESPUES_DIR ?? ".";
if (!ANTES_DIR) { console.error("falta BANCO_ANTES_DIR"); process.exit(2); }
const SALIDA = process.argv[2] ?? "docs/medidas/2026-09-15-etapa3b-ub-primero.json";
const COMBO = "n,d,m";
const LATENCIA_MS = Number(process.env.BANCO_LATENCIA_MS ?? "60");
const RAPIDO_MS = 1500;   // "en el acto": bien por debajo de una composición con latencia (≥ 5 s)

const claves = async (base, patron) => control(base, "redis", "redis", { accion: "claves", patron });
const expirar = (base, patron) => control(base, "redis", "redis", { accion: "expirar", patron });
const config = (base, c) => control(base, "tmdb", "config", c);
const sano = (base) => config(base, { modo: "ok", latenciaMs: LATENCIA_MS });
const FRESCA = "^home:[^:]+:v\\d+:", UB = "^home:ub:", TURNO = "^home:turno:", DEGRADADO = "^home:degradado:";
/** El último bueno, byte a byte: [clave, sha1 del valor entero]. */
const blobUB = async (base) => canon((await claves(base, UB)).map((k) => [k.clave, k.sha1]));
const ids = (payload) => ({ hero: (payload.hero ?? []).map((i) => `${i.type}:${i.id}`), rails: Object.fromEntries((payload.rails ?? []).map((r) => [r.key, (r.items ?? []).map((i) => `${i.type}:${i.id}`)])) });

/** Líneas [home] nuevas del log: composiciones iniciadas y terminales (con la línea cruda, para `fondo programado`). */
function lineasNuevas(p) {
  const todo = readFileSync(p.log, "utf8");
  const nuevas = todo.slice(p.leido ?? 0).split("\n").map((l) => l.trim()).filter((l) => l.startsWith("[home] "));
  p.leido = todo.length;
  return { compone: nuevas.filter(esLineaCompone), terminales: nuevas.filter(esLineaTerminal).map((l) => ({ ...parsearLineaHome(l), linea: l })) };
}
/** Las líneas [home-fondo] nuevas del log (misma forma que [home], prefijo distinto). */
function fondosNuevos(p) {
  const todo = readFileSync(p.log, "utf8");
  const nuevas = todo.slice(p.leidoFondo ?? 0).split("\n").map((l) => l.trim());
  p.leidoFondo = todo.length;
  return nuevas.filter((l) => /^\[home-fondo\] \d+ms total/.test(l)).map((l) => ({ ...parsearLineaHome(l.replace(/^\[home-fondo\]/, "[home]")), degradadoEnLinea: /DEGRADADO \(/.test(l), cancelada: /CANCELADA/.test(l), enfriado: /ENFRIADO/.test(l), errorProductor: /ERROR PRODUCTOR/.test(l), linea: l }));
}
async function esperarFondo(p, ms = 90000) {
  const acc = [];
  await esperar(() => { acc.push(...fondosNuevos(p)); return acc.length >= 1; }, ms, 250);
  return acc[0] ?? null;
}
const fondoOrigen = (t) => t.origen;
async function unaTerminal(p) {
  const acc = { compone: [], terminales: [] };
  await esperar(() => { const n = lineasNuevas(p); acc.compone.push(...n.compone); acc.terminales.push(...n.terminales); return acc.terminales.length >= 1; }, 90000, 200);
  return acc;
}

/** Deja la combinación con fresca + UB publicados (composición sana) y luego vence la fresca. */
async function prepararUB(p) {
  await vaciar(p.base); await sano(p.base); lineasNuevas(p); fondosNuevos(p);
  const s = await pedirHome(p, COMBO);
  await unaTerminal(p);
  await expirar(p.base, FRESCA); await expirar(p.base, "^pv3:"); await control(p.base, "tmdb", "reset");
  return { sano: s, ubBlob: await blobUB(p.base) };
}

async function escenarios(p, o = { esperaFondo: true }) {
  const out = {};
  const base = p.base;
  // 1. UB presente, fresca vencida, un pedido.
  {
    const prep = await prepararUB(p);
    const r = await pedirHome(p, COMBO);
    const t = await unaTerminal(p);
    // Orden (auditoría sobre c84996e): con el fondo, NINGÚN `[home] compone` puede
    // preceder a la línea terminal de la solicitud: la composición arranca después
    // de construida la respuesta. En el antes, la composición en línea sí la precede (1).
    const componeAntesDeTerminal = t.compone.length;
    const fondo = o.esperaFondo ? await esperarFondo(p, 60000) : null;
    t.compone.push(...lineasNuevas(p).compone);   // el `[home] compone` del fondo sale DESPUÉS de la terminal de la solicitud
    const frescaTrasFondo = (await claves(base, FRESCA)).length;
    const siguiente = await pedirHome(p, COMBO);
    const tSig = await unaTerminal(p);
    out.ubPresente = {
      msPared: r.msPared, origen: t.terminales[0].origen, fondoEnLinea: /fondo programado/.test(t.terminales[0].linea ?? ""), compone: t.compone.length, componeAntesDeTerminal,
      esElUB: canon(ids(r.json)) === canon(ids(prep.sano.json)), degradado: !!r.json.degradado,
      fondo: fondo ? { publicacion: fondo.publicacion, ms: fondo.msTotal, propietario: fondo.propietario, tmdb: fondo.tmdb, mismaClave: fondo.clave === t.terminales[0].clave, mismoPropietario: fondo.propietario === t.terminales[0].propietario } : null,
      frescaTrasFondo, siguiente: { msPared: siguiente.msPared, cache: tSig.terminales[0].cache, origen: tSig.terminales[0].origen },
      frescaIds: ids(siguiente.json), sanoIds: ids(prep.sano.json),
    };
  }
  // 2. Dos pedidos concurrentes con UB.
  {
    await prepararUB(p);
    const [a, b] = await Promise.all([pedirHome(p, COMBO), pedirHome(p, COMBO)]);
    const acc = { compone: [], terminales: [] };
    await esperar(() => { const n = lineasNuevas(p); acc.compone.push(...n.compone); acc.terminales.push(...n.terminales); return acc.terminales.length >= 2; }, 90000, 200);
    const fondo = o.esperaFondo ? await esperarFondo(p, 60000) : null;
    acc.compone.push(...lineasNuevas(p).compone);
    const masFondos = fondosNuevos(p).length;
    // En UN proceso, el segundo pedido comparte el vuelo del líder (single-flight
    // local: cache COMPARTIDA): recibe lo mismo que el líder, el UB, sin origen propio.
    out.concurrentes = {
      msPared: [a.msPared, b.msPared], origenes: acc.terminales.map(fondoOrigen).sort(), caches: acc.terminales.map((x) => x.cache).sort(), compone: acc.compone.length,
      fondos: (fondo ? 1 : 0) + masFondos, propietariosDistintos: new Set(acc.terminales.map((x) => x.propietario)).size === 2,
    };
  }
  // 3. Sin UB: bloqueante (sin cambios).
  {
    await vaciar(base); await sano(base); lineasNuevas(p); fondosNuevos(p);
    const r = await pedirHome(p, COMBO);
    const t = await unaTerminal(p);
    await dormir(500);
    out.sinUB = { msPared: r.msPared, origen: t.terminales[0].origen, publicacion: t.terminales[0].publicacion, fondos: fondosNuevos(p).length, compone: t.compone.length };
  }
  if (!o.esperaFondo) return out;
  // 4. Fondo DEGRADADO: 429 parcial en /discover durante el fondo.
  {
    const prep = await prepararUB(p);
    // Los pools (`disc:`) de la composición sana siguen cacheados: sin vencerlos
    // el fondo no pediría ningún /discover y el 429 no tocaría nada.
    await expirar(base, "^disc:");
    await config(base, { modo: "429-parcial", parcialP: 0.1, familiaParcial: "/discover", parcialPorQuery: true, retryAfter: 2, latenciaMs: LATENCIA_MS });
    const r = await pedirHome(p, COMBO);
    const t = await unaTerminal(p);
    const fondo = await esperarFondo(p, 60000);
    out.degradadoEnFondo = {
      msPared: r.msPared, origen: t.terminales[0].origen, fondo: fondo ? { degradado: fondo.degradadoEnLinea, publicacion: fondo.publicacion, enfriado: fondo.enfriado, descartes: Number((fondo.linea.match(/(\d+) descarte\(s\) tmdb/) ?? [])[1] ?? 0) } : null,
      fresca: (await claves(base, FRESCA)).length, degradadoCompartido: (await claves(base, DEGRADADO)).length, ubIntacto: (await blobUB(base)) === prep.ubBlob,
    };
    await sano(base);
  }
  // 5. TMDB 5xx TOTAL durante el fondo (criterio 9.1): safe() lo atrapa → degradado, no un rechazo del productor.
  {
    const prep = await prepararUB(p);
    await config(base, { modo: "500", latenciaMs: 0 });
    const r = await pedirHome(p, COMBO);
    const t = await unaTerminal(p);
    const fondo = await esperarFondo(p, 60000);
    out.cincoXXTotalEnFondo = {
      msPared: r.msPared, origen: t.terminales[0].origen, fondo: fondo ? { degradado: fondo.degradadoEnLinea, publicacion: fondo.publicacion, enfriado: fondo.enfriado, errorProductor: fondo.errorProductor } : null,
      fresca: (await claves(base, FRESCA)).length, ubIntacto: (await blobUB(base)) === prep.ubBlob, turno: (await claves(base, TURNO)).length,
    };
    await sano(base);
  }
  // 6. Fondo CANCELADO por su presupuesto (latencia que no cabe en 50 s).
  {
    const prep = await prepararUB(p);
    await config(base, { modo: "ok", latenciaMs: 1500 });
    const r = await pedirHome(p, COMBO);
    const t = await unaTerminal(p);
    const fondo = await esperarFondo(p, 75000);
    out.canceladoEnFondo = {
      msPared: r.msPared, origen: t.terminales[0].origen, fondo: fondo ? { cancelada: fondo.cancelada, publicacion: fondo.publicacion, ms: fondo.msTotal } : null,
      fresca: (await claves(base, FRESCA)).length, ubIntacto: (await blobUB(base)) === prep.ubBlob, turno: (await claves(base, TURNO)).length,
    };
    await sano(base);
  }
  return out;
}

const salida = { fecha: FECHA, combo: COMBO, latenciaMs: LATENCIA_MS };
try {
  await levantarDobles(4801); await levantarDobles(4811);
  const pA = await levantarNext("3b-antes", ANTES_DIR, 3000, 4801);
  const pB = await levantarNext("3b-despues", DESPUES_DIR, 3001, 4811, { YUMP_BANCO_FONDO: "1" });
  const pK = await levantarNext("3b-killswitch", DESPUES_DIR, 3003, 4811, { YUMP_BANCO_FONDO: "1", HOME_UB_PRIMERO: "0" });
  const pN = await levantarNext("3b-sin-fondo", DESPUES_DIR, 3004, 4811, {});
  for (const p of [pA, pB, pK, pN]) p.base = p.base ?? (p.puerto === 3000 ? 4801 : 4811);
  salida.antes = await escenarios(pA, { esperaFondo: false });
  salida.despues = await escenarios(pB, { esperaFondo: true });
  salida.killSwitch = await escenarios(pK, { esperaFondo: false });
  salida.sinFondo = await escenarios(pN, { esperaFondo: false });
  const d = salida.despues, a = salida.antes;
  const controlComoAntes = (c) => c.ubPresente.origen === "propia" && c.ubPresente.msPared >= 3000 && !c.ubPresente.fondoEnLinea && c.ubPresente.compone === 1
    && c.concurrentes.fondos === 0 && c.concurrentes.compone === 1 && c.sinUB.fondos === 0;
  salida.resumen = {
    antesBloquea: a.ubPresente.origen === "propia" && a.ubPresente.msPared >= 3000,
    ubPresente: d.ubPresente.msPared < RAPIDO_MS && d.ubPresente.origen === "ultimo-bueno-fondo" && d.ubPresente.fondoEnLinea && d.ubPresente.esElUB && !d.ubPresente.degradado
      && d.ubPresente.compone === 1 && d.ubPresente.fondo?.publicacion === "publicado" && d.ubPresente.fondo?.mismaClave && d.ubPresente.fondo?.mismoPropietario
      && d.ubPresente.frescaTrasFondo === 1 && d.ubPresente.siguiente.cache === "HIT" && d.ubPresente.componeAntesDeTerminal === 0,
    antesComponeEnLinea: a.ubPresente.componeAntesDeTerminal === 1,
    frescaIdentica: canon(d.ubPresente.frescaIds) === canon(a.ubPresente.frescaIds) && canon(d.ubPresente.frescaIds) === canon(d.ubPresente.sanoIds),
    concurrentes: d.concurrentes.msPared.every((ms) => ms < RAPIDO_MS) && d.concurrentes.compone === 1 && d.concurrentes.fondos === 1 && d.concurrentes.propietariosDistintos
      && canon(d.concurrentes.caches) === canon(["COMPARTIDA", "ULTIMO-BUENO"]) && d.concurrentes.origenes.includes("ultimo-bueno-fondo"),
    sinUB: d.sinUB.origen === "propia" && d.sinUB.publicacion === "publicado" && d.sinUB.fondos === 0 && d.sinUB.msPared >= 3000,
    degradadoEnFondo: d.degradadoEnFondo.msPared < RAPIDO_MS && d.degradadoEnFondo.fondo?.degradado && d.degradadoEnFondo.fondo?.publicacion === "no" && d.degradadoEnFondo.fondo?.enfriado
      && d.degradadoEnFondo.fresca === 0 && d.degradadoEnFondo.degradadoCompartido === 1 && d.degradadoEnFondo.ubIntacto && d.degradadoEnFondo.fondo?.descartes > 0,
    cincoXXTotalEnFondo: d.cincoXXTotalEnFondo.fondo?.degradado && !d.cincoXXTotalEnFondo.fondo?.errorProductor && d.cincoXXTotalEnFondo.fondo?.publicacion === "no"
      && d.cincoXXTotalEnFondo.fresca === 0 && d.cincoXXTotalEnFondo.ubIntacto,
    canceladoEnFondo: d.canceladoEnFondo.msPared < RAPIDO_MS && d.canceladoEnFondo.fondo?.cancelada && d.canceladoEnFondo.fondo?.publicacion === "no"
      && d.canceladoEnFondo.fresca === 0 && d.canceladoEnFondo.ubIntacto && d.canceladoEnFondo.turno === 0,
    killSwitchComoAntes: controlComoAntes(salida.killSwitch),
    sinFondoComoAntes: controlComoAntes(salida.sinFondo),
  };
  salida.resumen.verde = Object.entries(salida.resumen).every(([k, v]) => k === "verde" || v === true);
  for (const [k, v] of Object.entries(salida.resumen)) console.log(`[3b] ${k}: ${v}`);
  console.log(`[3b] antes: UB presente → ${a.ubPresente.msPared}ms origen ${a.ubPresente.origen}; concurrentes ${a.concurrentes.msPared.join("/")}ms; sin UB ${a.sinUB.msPared}ms`);
  console.log(`[3b] despues: UB presente → ${d.ubPresente.msPared}ms origen ${d.ubPresente.origen} (fondo ${d.ubPresente.fondo?.ms}ms, ${d.ubPresente.fondo?.publicacion}, tmdb ${d.ubPresente.fondo?.tmdb}), siguiente ${d.ubPresente.siguiente.cache} ${d.ubPresente.siguiente.msPared}ms; concurrentes ${d.concurrentes.msPared.join("/")}ms; sin UB ${d.sinUB.msPared}ms; degradado en fondo: descartes ${d.degradadoEnFondo.fondo?.descartes}; 5xx total: degradado ${d.cincoXXTotalEnFondo.fondo?.degradado}; cancelado: ${d.canceladoEnFondo.fondo?.cancelada} a los ${d.canceladoEnFondo.fondo?.ms}ms`);
  console.log(`[3b] kill switch: UB presente → ${salida.killSwitch.ubPresente.msPared}ms origen ${salida.killSwitch.ubPresente.origen}; sin fondo: ${salida.sinFondo.ubPresente.msPared}ms origen ${salida.sinFondo.ubPresente.origen}`);
  writeFileSync(SALIDA, JSON.stringify(salida, null, 2));
  console.log(`[3b] RESUMEN ${JSON.stringify(salida.resumen)} → ${SALIDA}`);
  process.exitCode = salida.resumen.verde ? 0 : 1;
} catch (e) {
  console.error("[3b] ERROR", e);
  process.exitCode = 1;
} finally {
  for (const h of hijos) matar(h);
}
