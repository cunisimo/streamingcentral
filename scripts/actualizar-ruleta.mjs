#!/usr/bin/env node
/**
 * Mantenimiento INCREMENTAL del catálogo de la ruleta ("no sé qué ver").
 * Reemplaza la secuencia build-roulette-pool → build-shorts-pool →
 * enrich-roulette-collections para todo lo que consulta TMDB. Los pasos con
 * LLM (generate-copy, classify-context) no cambian y siguen después.
 *
 * Por defecto PLANIFICA: no consulta TMDB, no escribe nada, ni siquiera el
 * estado inicial. Para ejecutar hay que pedirlo y fijar un presupuesto.
 *
 *   node scripts/actualizar-ruleta.mjs                       # plan
 *   node scripts/actualizar-ruleta.mjs --fases descubrir     # plan de una fase
 *   node --env-file=.env.local scripts/actualizar-ruleta.mjs --ejecutar --presupuesto 300 --fases descubrir
 *
 * Opciones:
 *   --datos <dir>               carpeta de datos (default: data)
 *   --fases a,b,c               descubrir,enriquecer,disponibilidad (default: las tres)
 *   --ttl-disponibilidad <días> antigüedad a partir de la cual se reconsulta (default 30)
 *   --ttl-descartes <días>      cuánto vale un descarte antes de reintentarlo (default 90)
 *   --max-disponibilidad <n>    tope de títulos a reconsultar en esta corrida
 *   --presupuesto <n>           máximo de intentos HTTP (obligatorio con --ejecutar)
 *   --ritmo-ms <ms>             separación mínima entre pedidos (default 250 = 4/s)
 *   --ahora <ISO>               fija "hoy" (para medir o reproducir un plan)
 *   --informe <archivo.json>    en modo plan, guarda el plan además de mostrarlo
 *
 * Reanudable: lo terminado queda en <datos>/ruleta-progreso.jsonl. Correr el
 * MISMO comando retoma sin repetir. Ctrl+C corta limpio.
 */

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { OBJETIVO_500, construirCola, cuotasConReserva, estimarConsultas, estimarPendientes } from "./ruleta/seleccion.mjs";

// Tasas SUPUESTAS para estimar el presupuesto (no son medición): proporción de
// candidatos de discover que resultan servibles (flatrate Yump + datos), por
// década prevista, y proporción de "probables cortas" (60–100 min) que duran
// ≤ 90 min de verdad. Salen del pool actual (2026-10-07): plataforma Yump 63%
// antes de 1980, 81% en los 80, 97-100% después; 44% de las de 60–100 min
// duran ≤ 90. Se descuenta un 10% más por discover que no coincide con
// watch/providers y por sinopsis faltantes.
const TASAS_SUPUESTAS = {
  servible: { "<1980": 0.55, "1980s": 0.72, "1990s": 0.85, "2000s": 0.87, "2010s": 0.87, "2020s": 0.88 },
  cortaReal: 0.44,
  cortaRealResto: 0.03,
};
import { cargarEstado, leerDiario, crearDiario } from "./ruleta/estado.mjs";
import { planificar, fechaAR, selloAR } from "./ruleta/nucleo.mjs";
import { crearClienteTmdb } from "./ruleta/cliente-tmdb.mjs";
import { ejecutar } from "./ruleta/pipeline.mjs";
import { escribirSalidas, informeMarkdown, archivosDeSalida, poolLegado } from "./ruleta/salidas.mjs";
import { cargarExclusiones, aplicarExclusiones } from "./ruleta/exclusiones.mjs";
import { sincronizarTextos } from "./ruleta/textos.mjs";
import { escribirAtomico } from "./ruleta/estado.mjs";

const args = process.argv.slice(2);
const arg = (f, d = null) => { const i = args.indexOf(f); return i !== -1 ? (args[i + 1] ?? d) : d; };
const numero = (f, d) => { const v = arg(f); if (v == null) return d; const n = Number(v); if (!Number.isFinite(n) || n < 0) throw new Error(`${f} inválido: ${v}`); return n; };

const DATOS = resolve(arg("--datos", "data"));
const EJECUTAR = args.includes("--ejecutar");
const fasesLista = (arg("--fases") ?? "descubrir,enriquecer,disponibilidad").split(",").map((s) => s.trim());
for (const f of fasesLista) if (!["descubrir", "enriquecer", "disponibilidad"].includes(f)) throw new Error(`fase desconocida: ${f}`);
const fases = { descubrir: fasesLista.includes("descubrir"), enriquecer: fasesLista.includes("enriquecer"), disponibilidad: fasesLista.includes("disponibilidad") };
const ahoraMs = arg("--ahora") ? Date.parse(arg("--ahora")) : Date.now();
if (!Number.isFinite(ahoraMs)) throw new Error("--ahora inválido");
const SIN_NUEVOS_DETALLES = args.includes("--sin-nuevos-detalles");
const cfg = {
  fases, ahoraMs, sinNuevosDetalles: SIN_NUEVOS_DETALLES,
  ttlDispDias: numero("--ttl-disponibilidad", 30),
  ttlDescartesDias: numero("--ttl-descartes", 90),
  maxDisponibilidad: numero("--max-disponibilidad", Infinity),
};

const { estado, origen } = cargarEstado(DATOS);
const diarioPrevio = leerDiario(DATOS);
// Día argentino, no UTC: a partir de las 21 h la fecha UTC ya es mañana.
const fecha = fechaAR(ahoraMs);
const sello = selloAR(ahoraMs);

// ── Cola de selección (sin TMDB) ─────────────────────────────────────────────
// `--armar-cola` ordena TODOS los candidatos nuevos del inventario según la
// distribución acordada y la guarda en <datos>/ruleta-cola.json. Los primeros
// son los elegidos; los siguientes, los suplentes. No consulta TMDB.
const RUTA_COLA = resolve(arg("--cola") ?? `${DATOS}/ruleta-cola.json`);

// ── Exclusiones editoriales (sin TMDB) ───────────────────────────────────────
// Anime, stand-up y especiales no narrativos salen de los NUEVOS y de la
// reserva (los ya cargados sólo se informan). La lista versionada es
// <datos>/ruleta-exclusiones.json; lo excluido queda en excluidos_editoriales.
const EXCLUIDOS = cargarExclusiones(resolve(DATOS, "ruleta-exclusiones.json"));
// ── con_texto (sin TMDB) ─────────────────────────────────────────────────────
// generate-copy escribe los textos pero no el estado: esto lo refleja.
if (args.includes("--sincronizar-textos")) {
  if (origen !== "estado") throw new Error("--sincronizar-textos necesita un ruleta-estado.json existente");
  const filas = JSON.parse(readFileSync(resolve(DATOS, "copy-ruleta.json"), "utf8")).rows ?? [];
  const { estado: sig, cambios } = sincronizarTextos(estado, filas);
  escribirAtomico(resolve(DATOS, "ruleta-estado.json"), JSON.stringify(sig));
  const conTexto = (g) => Object.values(g ?? {}).filter((t) => t.con_texto).length;
  console.log(JSON.stringify({ cambios, poolConTexto: conTexto(sig.titulos), pool: Object.keys(sig.titulos).length, reservaConTexto: conTexto(sig.reserva), reserva: Object.keys(sig.reserva ?? {}).length }, null, 1));
  console.log("\nNo se consultó TMDB. Escrito: ruleta-estado.json.");
  process.exit(0);
}

if (args.includes("--aplicar-exclusiones")) {
  if (origen !== "estado") throw new Error("--aplicar-exclusiones necesita un ruleta-estado.json existente");
  const ahoraIso = new Date(ahoraMs).toISOString();
  const { estado: sig, resumen } = aplicarExclusiones(estado, { excluidos: EXCLUIDOS, ahoraIso });
  const rutaPool = resolve(DATOS, "pool-ruleta.json");
  const poolAnterior = existsSync(rutaPool) ? JSON.parse(readFileSync(rutaPool, "utf8")) : null;
  escribirAtomico(rutaPool, JSON.stringify(poolLegado(sig, poolAnterior, ahoraIso), null, 2));
  escribirAtomico(resolve(DATOS, "ruleta-estado.json"), JSON.stringify(sig));
  const n = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.length]));
  console.log(JSON.stringify({ nuevosExcluidos: n(resumen.nuevos), reservaExcluida: n(resumen.reserva), yaCargadosQueSonAnime: resumen.yaCargadosQueSonAnime.length, yaCargadosStandUp: resumen.yaCargadosStandUp.length, pool: Object.keys(sig.titulos).length, reserva: Object.keys(sig.reserva ?? {}).length }, null, 1));
  console.log("\nNo se consultó TMDB. Escritos: ruleta-estado.json y pool-ruleta.json.");
  process.exit(0);
}

if (args.includes("--armar-cola")) {
  const objetivo = { ...OBJETIVO_500, total: numero("--objetivo", OBJETIVO_500.total) };
  if (objetivo.total !== OBJETIVO_500.total) {
    const f = objetivo.total / OBJETIVO_500.total;
    objetivo.cortaMin = Math.round(OBJETIVO_500.cortaMin * f);
    objetivo.decadas = Object.fromEntries(Object.entries(OBJETIVO_500.decadas).map(([d, n]) => [d, Math.round(n * f)]));
  }
  const inventario = JSON.parse(readFileSync(resolve(DATOS, "ruleta-inventario.json"), "utf8"));
  const cola = construirCola(inventario, estado, objetivo, { ahoraMs, ttlDescartesDias: cfg.ttlDescartesDias });
  const cuotas = cuotasConReserva(objetivo);
  const estimacion = await estimarConsultas(cola, cuotas, TASAS_SUPUESTAS);
  const doc = {
    generada_at: new Date(ahoraMs).toISOString(), fecha, objetivo, cuotas, tasas_supuestas: TASAS_SUPUESTAS, estimacion,
    inventario_descubierto_at: inventario.descubierto_at, candidatos: cola.length, cola,
  };
  escribirAtomico(RUTA_COLA, JSON.stringify(doc, null, 1));
  console.log(JSON.stringify({ candidatos: cola.length, objetivo, cuotas, estimacion }, null, 2));
  console.log(`\n✔ ${RUTA_COLA}\nNo se consultó TMDB.`);
  process.exit(0);
}
if (fases.enriquecer) {
  // Sin cola, enriquecer recorrería TODOS los candidatos nuevos (4764 en el
  // inventario de 2026-10-07). Es exactamente lo que el dueño decidió no hacer.
  if (!args.includes("--sin-cola")) {
    if (existsSync(RUTA_COLA)) {
      const c = JSON.parse(readFileSync(RUTA_COLA, "utf8"));
      cfg.seleccion = { cola: c.cola, cuotas: c.cuotas, estimacion: c.estimacion, excluidos: EXCLUIDOS };
      // Lo que falta se reconstruye del diario (no se resta de la estimación).
      cfg.seleccion.pendientes = await estimarPendientes(c.cola, c.cuotas, diarioPrevio, { sinNuevosDetalles: SIN_NUEVOS_DETALLES });
    } else if (EJECUTAR) {
      throw new Error(`enriquecer exige una cola (${RUTA_COLA}); armala con --armar-cola`);
    }
  }
}

// El plan va DESPUÉS de cargar la cola: con cola, el detalle se estima por su
// simulación y no por todos los candidatos nuevos.
const plan = planificar(estado, diarioPrevio, cfg);

if (!EJECUTAR) {
  const s = archivosDeSalida(DATOS, fecha, sello);
  const inf = {
    modo: "plan", fecha, origenEstado: origen, fases: fasesLista, cfg: { ...cfg, maxDisponibilidad: String(cfg.maxDisponibilidad) }, plan,
    archivos: [s.estado, s.pool, s.poolRespaldo, s.colecciones, s.sql("N"), s.informeJson, s.informeMd].map((p) => `${p} (se escribiría)`),
  };
  process.stdout.write(informeMarkdown(inf));
  if (origen === "legado") console.log("\nEl estado se armaría desde los archivos actuales (pool, copy, colecciones) sin consultar TMDB.");
  if (arg("--informe")) writeFileSync(resolve(arg("--informe")), JSON.stringify(inf, null, 2), "utf8");
  console.log("\nModo plan: no se consultó TMDB y no se escribió ningún dato.");
  process.exit(0);
}

// ── Ejecución ────────────────────────────────────────────────────────────────
const presupuesto = numero("--presupuesto", null);
if (presupuesto == null) throw new Error("--ejecutar exige --presupuesto <intentos HTTP>");
const token = process.env.TMDB_READ_TOKEN ?? process.env.TMDB_ACCESS_TOKEN;
if (!token) throw new Error("falta TMDB_READ_TOKEN");

let detener = false;
process.on("SIGINT", () => { detener = true; console.log("\nCortando al terminar la operación en curso…"); });

const cliente = crearClienteTmdb({
  token, ritmoMs: numero("--ritmo-ms", 250), presupuesto,
  detenerEn429: args.includes("--detener-en-429"),
  // --sin-nuevos-detalles: el recorrido de la cola usa sólo el diario, y por
  // las dudas el cliente rechaza cualquier pedido de detalle.
  prohibidas: SIN_NUEVOS_DETALLES ? ["detalle"] : [],
});
const diario = crearDiario(DATOS, diarioPrevio);
const t0 = Date.now();
const r = await ejecutar({ estado, diario, cliente, cfg, detener: () => detener, log: (m) => console.log(`  ${m}`) });
const duracionMs = Date.now() - t0;

const s = archivosDeSalida(DATOS, fecha, sello);
let archivosEscritos = [];
if (r.completo) {
  const ahoraIso = new Date(ahoraMs).toISOString();
  const out = escribirSalidas(DATOS, { ...r, estadoAnterior: estado }, ahoraIso, { sql: !args.includes("--sin-sql") });
  archivosEscritos = out.escritos;
  diario.borrar();
}
const pendiente = r.completo ? null : planificar(estado, leerDiario(DATOS), cfg).llamadas;
const inf = {
  modo: "ejecucion", fecha, completo: r.completo, motivo: r.motivo ?? null, duracionMs, fases: fasesLista,
  presupuesto, metricas: cliente.metricas(), progreso: r.progreso, pendiente, fallos: r.fallos,
  diferencias: r.diferencias ?? null, plan, archivos: archivosEscritos,
  reutilizado: plan.reutilizados,
};
escribirAtomico(s.informeJson, JSON.stringify(inf, null, 2));
escribirAtomico(s.informeMd, informeMarkdown(inf));
console.log(informeMarkdown(inf));
console.log(`\n${s.informeJson}\n${s.informeMd}`);
if (!r.completo) {
  console.log(`\nCorrida INCOMPLETA (${r.motivo}). El estado no se tocó; lo hecho quedó en el diario.`);
  console.log("Volvé a correr el mismo comando para continuar.");
  process.exit(2);
}
