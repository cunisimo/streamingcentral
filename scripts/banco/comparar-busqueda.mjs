// Comparador antes/después de la BÚSQUEDA sana, con cachés aisladas — el
// refactor de `search()` de la Etapa 3.a (lib/busqueda-enriquecido.ts) no
// tenía comparación completa (auditoría de Codex sobre 09b9dbe).
//
//   BANCO_ANTES_DIR=../wt-etapa3-antes node scripts/banco/comparar-busqueda.mjs [salida.json]
//
// Mismo procedimiento que comparar-home.mjs: dos juegos de dobles, dos
// `next start`, Redis vaciado por corrida fría, y el JSON COMPLETO de
// `/api/search` comparado (títulos: ids, orden, cantidad, plataformas;
// personas), más el desglose por lista. El doble de TMDB responde `/search`
// con 20 títulos por tipo que contienen la consulta, con proveedores por id;
// las dos versiones tienen que pedir la MISMA cantidad de llamadas y dar HIT
// en caliente. Controles: mutaciones que el comparador detecta.
import { writeFileSync } from "node:fs";
import {
  FECHA, canon, compararPayload, control, diffRiel, estadoTmdb, hijos, levantarDobles, levantarNext, matar, vaciar,
} from "./comparar-comun.mjs";

const ANTES_DIR = process.env.BANCO_ANTES_DIR;
const DESPUES_DIR = process.env.BANCO_DESPUES_DIR ?? ".";
if (!ANTES_DIR) { console.error("falta BANCO_ANTES_DIR"); process.exit(2); }
const SALIDA = process.argv[2] ?? "docs/medidas/2026-09-14-etapa3a-identidad-busqueda.json";
const VERSIONES = { antes: { dir: ANTES_DIR, puerto: 3000, base: 4801 }, despues: { dir: DESPUES_DIR, puerto: 3001, base: 4811 } };
const CONSULTAS = ["matrix", "el padrino", "harry", "amor", "xyzzy"];
const PLATAFORMAS = ["", "n", "n,d,m"];

async function pedir(p, q, providers) {
  const url = `http://127.0.0.1:${p.puerto}/api/search?q=${encodeURIComponent(q)}${providers ? `&providers=${encodeURIComponent(providers)}` : ""}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(120000) });
  return { status: r.status, json: await r.json() };
}
function comparar(A, B) {
  const titulos = diffRiel("titles", A.titles ?? [], B.titles ?? []);
  const personas = { identico: canon(A.people ?? []) === canon(B.people ?? []), cantidad: { antes: (A.people ?? []).length, despues: (B.people ?? []).length } };
  const jsonCompletoIgual = canon(A) === canon(B);
  return { jsonCompletoIgual, titulos, personas, identico: jsonCompletoIgual && titulos.identico && personas.identico };
}

const salida = { fecha: FECHA, escenarios: [], controles: {} };
try {
  await levantarDobles(VERSIONES.antes.base); await levantarDobles(VERSIONES.despues.base);
  const pA = await levantarNext("antes-busqueda", VERSIONES.antes.dir, 3000, VERSIONES.antes.base);
  const pB = await levantarNext("despues-busqueda", VERSIONES.despues.dir, 3001, VERSIONES.despues.base);
  let n = 0;
  let base = null;
  for (const q of CONSULTAS) for (const prov of PLATAFORMAS) {
    const id = `B${++n}`;
    const claves = { antes: await vaciar(VERSIONES.antes.base), despues: await vaciar(VERSIONES.despues.base) };
    const t0 = { antes: await estadoTmdb(VERSIONES.antes.base), despues: await estadoTmdb(VERSIONES.despues.base) };
    const [rA, rB] = await Promise.all([pedir(pA, q, prov), pedir(pB, q, prov)]);
    const t1 = { antes: await estadoTmdb(VERSIONES.antes.base), despues: await estadoTmdb(VERSIONES.despues.base) };
    const llamadas = { antes: t1.antes.cuenta.peticiones - t0.antes.cuenta.peticiones, despues: t1.despues.cuenta.peticiones - t0.despues.cuenta.peticiones };
    const frio = comparar(rA.json, rB.json);
    // Caliente: cada versión lee lo que ella guardó (1 h); 0 llamadas a TMDB.
    const t2 = { antes: await estadoTmdb(VERSIONES.antes.base), despues: await estadoTmdb(VERSIONES.despues.base) };
    const [cA, cB] = await Promise.all([pedir(pA, q, prov), pedir(pB, q, prov)]);
    const t3 = { antes: await estadoTmdb(VERSIONES.antes.base), despues: await estadoTmdb(VERSIONES.despues.base) };
    const llamadasCaliente = { antes: t3.antes.cuenta.peticiones - t2.antes.cuenta.peticiones, despues: t3.despues.cuenta.peticiones - t2.despues.cuenta.peticiones };
    const caliente = comparar(cA.json, cB.json);
    const problemas = [];
    if (claves.antes !== 0 || claves.despues !== 0) problemas.push("caché no vacía");
    if (rA.status !== 200 || rB.status !== 200) problemas.push(`HTTP ${rA.status}/${rB.status}`);
    if (llamadas.antes !== llamadas.despues) problemas.push(`llamadas a TMDB distintas: ${llamadas.antes} vs ${llamadas.despues}`);
    if (llamadas.antes === 0) problemas.push("0 llamadas en frío");
    if (llamadasCaliente.antes !== 0 || llamadasCaliente.despues !== 0) problemas.push(`caliente con llamadas: ${llamadasCaliente.antes}/${llamadasCaliente.despues}`);
    const e = { id, q, providers: prov, claves, llamadas, llamadasCaliente, frio, caliente, titulos: (rA.json.titles ?? []).length, problemas, valido: problemas.length === 0, identico: frio.identico && caliente.identico };
    salida.escenarios.push(e);
    if (!base && e.identico && e.titulos >= 3) base = rB.json;
    console.log(`[busq] ${id} q="${q}" providers=${prov || "-"} | frío: tmdb ${llamadas.antes}/${llamadas.despues}, ${e.titulos} títulos, ${frio.identico ? "IDÉNTICO" : "DIFIERE"} | caliente: tmdb ${llamadasCaliente.antes}/${llamadasCaliente.despues}, ${caliente.identico ? "IDÉNTICO" : "DIFIERE"} | ${e.valido ? "válido" : "INVÁLIDO: " + problemas.join("; ")}`);
  }
  // Controles: cuatro mutaciones sobre un resultado real que el comparador tiene que detectar.
  if (base) {
    const clon = () => JSON.parse(JSON.stringify(base));
    const mut = {};
    { const p = clon(); p.titles.splice(1, 1); mut.eliminar = !comparar(base, p).identico; }
    { const p = clon(); p.titles.push({ ...p.titles[0], id: 999999999 }); mut.agregar = !comparar(base, p).identico; }
    { const p = clon(); [p.titles[0], p.titles[1]] = [p.titles[1], p.titles[0]]; mut.mover = !comparar(base, p).identico; }
    { const p = clon(); p.titles[0].platforms = [...(p.titles[0].platforms ?? []), "zz"]; mut.plataforma = !comparar(base, p).identico; }
    salida.controles.mutaciones = { detectadas: mut, todasDetectadas: Object.values(mut).every(Boolean) };
  } else {
    salida.controles.mutaciones = { todasDetectadas: false, motivo: "sin resultado base con ≥ 3 títulos" };
  }
  console.log(`[busq] control mutaciones: ${JSON.stringify(salida.controles.mutaciones)}`);
  const es = salida.escenarios;
  salida.resumen = {
    escenarios: es.length, validos: es.filter((e) => e.valido).length, identicos: es.filter((e) => e.identico).length,
    diferencias: es.filter((e) => !e.identico).map((e) => e.id), invalidos: es.filter((e) => !e.valido).map((e) => e.id),
    controlMutaciones: salida.controles.mutaciones.todasDetectadas,
  };
  salida.resumen.verde = salida.resumen.validos === es.length && salida.resumen.identicos === es.length && salida.resumen.controlMutaciones;
  const archivo = salida.resumen.verde ? SALIDA : SALIDA.replace(/\.json$/, "-DIFERENCIAS.json");
  writeFileSync(archivo, JSON.stringify(salida, null, 2));
  console.log(`[busq] RESUMEN ${JSON.stringify(salida.resumen)} → ${archivo}`);
  process.exitCode = salida.resumen.verde ? 0 : 1;
  void pA; void pB; void control;
} catch (e) {
  console.error("[busq] ERROR", e);
  process.exitCode = 1;
} finally {
  for (const h of hijos) matar(h);
}
