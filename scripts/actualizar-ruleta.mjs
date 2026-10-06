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

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { cargarEstado, leerDiario, crearDiario } from "./ruleta/estado.mjs";
import { planificar } from "./ruleta/nucleo.mjs";
import { crearClienteTmdb } from "./ruleta/cliente-tmdb.mjs";
import { ejecutar } from "./ruleta/pipeline.mjs";
import { escribirSalidas, informeMarkdown, archivosDeSalida } from "./ruleta/salidas.mjs";
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
const cfg = {
  fases, ahoraMs,
  ttlDispDias: numero("--ttl-disponibilidad", 30),
  ttlDescartesDias: numero("--ttl-descartes", 90),
  maxDisponibilidad: numero("--max-disponibilidad", Infinity),
};

const { estado, origen } = cargarEstado(DATOS);
const diarioPrevio = leerDiario(DATOS);
const plan = planificar(estado, diarioPrevio, cfg);
const fecha = new Date(ahoraMs).toISOString().slice(0, 10);

if (!EJECUTAR) {
  const s = archivosDeSalida(DATOS, fecha);
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

const cliente = crearClienteTmdb({ token, ritmoMs: numero("--ritmo-ms", 250), presupuesto });
const diario = crearDiario(DATOS, diarioPrevio);
const t0 = Date.now();
const r = await ejecutar({ estado, diario, cliente, cfg, detener: () => detener, log: (m) => console.log(`  ${m}`) });
const duracionMs = Date.now() - t0;

const s = archivosDeSalida(DATOS, fecha);
let archivosEscritos = [];
if (r.completo) {
  const ahoraIso = new Date(ahoraMs).toISOString();
  const out = escribirSalidas(DATOS, { ...r, estadoAnterior: estado }, ahoraIso);
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
