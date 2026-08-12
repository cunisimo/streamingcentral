#!/usr/bin/env node
/**
 * Genera razón, advertencia y nivel de atención para los títulos de la ruleta.
 *
 * REANUDABLE: lee lo ya generado y sólo procesa lo que falta. La corrida de
 * hoy y la de dentro de tres meses son el mismo comando.
 *
 * ESTRATIFICADO: toma los N más votados de CADA década, no los N más votados
 * en general. Sin eso, las primeras tandas quedarían casi todas post-2010 y
 * se perdería la diversidad temporal que ganamos particionando la extracción.
 *
 * Uso:
 *   node scripts/generate-copy.mjs --dry-run           # ver el prompt
 *   node scripts/generate-copy.mjs --por-decada 100    # ~600 títulos
 *   node scripts/generate-copy.mjs --por-decada 200    # amplía la tanda
 *   node scripts/generate-copy.mjs --todos             # el pool completo
 *
 * Entrada: data/pool-ruleta.json + prompts/ruleta-copy.md
 * Salida:  data/copy-ruleta.json  (se reescribe tras CADA lote)
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";

const args = process.argv.slice(2);
const arg = (f) => {
  const i = args.indexOf(f);
  return i !== -1 ? (args[i + 1] ?? null) : null;
};

const dryRun = args.includes("--dry-run");
const todos = args.includes("--todos");
const POR_DECADA = arg("--por-decada") ? Number(arg("--por-decada")) : 100;
const BATCH_SIZE = arg("--batch") ? Number(arg("--batch")) : 40;
const MODEL = arg("--model") ?? "sonnet";

const POOL_PATH = resolve("data/pool-ruleta.json");
const PROMPT_PATH = resolve("prompts/ruleta-copy.md");
const OUTPUT_PATH = resolve("data/copy-ruleta.json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Claude Code headless ───────────────────────────────────────────────────

function runClaude(prompt) {
  return new Promise((done, fail) => {
    const child = spawn(
      "claude",
      ["-p", "--model", MODEL, "--output-format", "json", "--max-turns", "4"],
      { cwd: tmpdir(), shell: true },
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c));
    child.stderr.on("data", (c) => (stderr += c));
    child.on("error", (e) => fail(new Error(`No pude ejecutar claude: ${e.message}`)));

    child.on("close", (code) => {
      if (!stdout.trim()) {
        return fail(new Error(`claude no devolvió nada (código ${code}). ${stderr.slice(0, 300)}`));
      }
      let envelope;
      try {
        envelope = JSON.parse(stdout);
      } catch {
        return fail(new Error(`Salida no-JSON: ${stdout.slice(0, 300)}`));
      }
      // subtype puede decir "success" aunque haya fallado: se chequea is_error.
      if (envelope.is_error) {
        const detalle = [
          envelope.result,
          envelope.api_error_status && `api_error_status=${envelope.api_error_status}`,
          envelope.terminal_reason && `terminal_reason=${envelope.terminal_reason}`,
        ]
          .filter(Boolean)
          .join(" · ");
        return fail(new Error(`claude falló: ${detalle || JSON.stringify(envelope).slice(0, 400)}`));
      }
      done({ text: envelope.result ?? "", cost: envelope.total_cost_usd ?? 0 });
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function parseArray(text) {
  const clean = text.replace(/```(?:json)?/g, "").trim();
  const start = clean.indexOf("[");
  const end = clean.lastIndexOf("]");
  if (start === -1 || end === -1) return null;
  try {
    const parsed = JSON.parse(clean.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const toCandidate = (t) => ({
  id: t.tmdb_id,
  titulo: t.title,
  año: t.year,
  generos: t.genres,
  duracion: t.runtime,
  sinopsis: (t.overview ?? "").slice(0, 500),
});

const decadaDe = (t) => (t.year ? Math.floor(t.year / 10) * 10 : null);

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const pool = JSON.parse(await readFile(POOL_PATH, "utf8"));
  const prompt = await readFile(PROMPT_PATH, "utf8");
  const titulos = pool.titles ?? [];

  // Lo ya generado en corridas anteriores. Esto es lo que hace reanudable
  // al script: nunca se vuelve a pagar por un título que ya tiene texto.
  let hechos = new Map();
  try {
    const previo = JSON.parse(await readFile(OUTPUT_PATH, "utf8"));
    hechos = new Map((previo.rows ?? []).map((r) => [r.tmdb_id, r]));
    console.log(`\nYa generados en corridas anteriores: ${hechos.size}`);
  } catch {
    console.log("\nPrimera corrida: no hay textos previos.");
  }

  // ── Selección estratificada ───────────────────────────────────────────────
  let objetivo;
  if (todos) {
    objetivo = titulos;
  } else {
    const porDecada = new Map();
    for (const t of titulos) {
      const d = decadaDe(t);
      if (d === null) continue;
      if (!porDecada.has(d)) porDecada.set(d, []);
      porDecada.get(d).push(t);
    }
    objetivo = [];
    for (const [, lista] of [...porDecada].sort()) {
      lista.sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0));
      objetivo.push(...lista.slice(0, POR_DECADA));
    }
  }

  const pendientes = objetivo.filter((t) => !hechos.has(t.tmdb_id));

  console.log(`  objetivo de esta tanda : ${objetivo.length}`);
  console.log(`  pendientes de generar  : ${pendientes.length}`);

  if (!todos) {
    const reparto = new Map();
    for (const t of objetivo) {
      const d = `${decadaDe(t)}s`;
      reparto.set(d, (reparto.get(d) ?? 0) + 1);
    }
    console.log("\n── Reparto por década ──");
    for (const [d, n] of [...reparto].sort()) console.log(`  ${d}  ${n}`);
  }

  if (pendientes.length === 0) {
    console.log("\nNada que generar. Subí --por-decada o usá --todos para ampliar.");
    return;
  }

  const lotes = [];
  for (let i = 0; i < pendientes.length; i += BATCH_SIZE) {
    lotes.push(pendientes.slice(i, i + BATCH_SIZE));
  }

  const armarPrompt = (lote) =>
    `${prompt}\n\nTÍTULOS:\n\n${JSON.stringify(lote.map(toCandidate), null, 1)}`;

  if (dryRun) {
    console.log("\n── PROMPT (recortado a 2 títulos) ──\n");
    console.log(armarPrompt(lotes[0].slice(0, 2)));
    console.log(`\n(el lote real lleva ${lotes[0].length} títulos · ${lotes.length} lotes)`);
    return;
  }

  console.log(`\n  lotes: ${lotes.length} de hasta ${BATCH_SIZE} · modelo ${MODEL}\n`);

  const porId = new Map(titulos.map((t) => [t.tmdb_id, t]));
  let costo = 0;

  async function guardar() {
    const rows = [...hechos.values()];
    await mkdir(dirname(OUTPUT_PATH), { recursive: true });
    await writeFile(
      OUTPUT_PATH,
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          modelo: MODEL,
          total: rows.length,
          con_texto: rows.filter((r) => r.conoce).length,
          rows,
        },
        null,
        2,
      ),
      "utf8",
    );
  }

  for (const [i, lote] of lotes.entries()) {
    process.stdout.write(`  lote ${i + 1}/${lotes.length} (${lote.length})… `);

    let ok = false;
    for (let intento = 0; intento < 2 && !ok; intento++) {
      try {
        const { text, cost } = await runClaude(armarPrompt(lote));
        costo += cost;
        const results = parseArray(text);
        if (!results) {
          if (intento === 0) {
            process.stdout.write("no parseó, reintento… ");
            continue;
          }
          throw new Error(`respuesta no parseable: ${text.slice(0, 200)}`);
        }

        let validos = 0;
        let desconocidos = 0;
        for (const r of results) {
          const t = porId.get(r.id);
          if (!t) continue; // id inventado
          hechos.set(r.id, {
            tmdb_id: r.id,
            title: t.title,
            year: t.year,
            conoce: r.conoce === true,
            razon: r.conoce ? (r.razon ?? null) : null,
            advertencia: r.conoce ? (r.advertencia ?? null) : null,
            atencion: r.conoce ? (r.atencion ?? null) : null,
          });
          validos++;
          if (r.conoce !== true) desconocidos++;
        }
        console.log(`${validos}/${lote.length} ok · ${desconocidos} sin conocer`);
        ok = true;
      } catch (err) {
        if (intento === 1) {
          console.log("FALLÓ");
          console.error(`    ${err.message}`);
        }
      }
    }

    await guardar(); // progreso incremental
    if (i < lotes.length - 1) await sleep(8000); // respiro entre invocaciones
  }

  const rows = [...hechos.values()];
  const conTexto = rows.filter((r) => r.conoce);
  const conAdvertencia = conTexto.filter((r) => r.advertencia);
  const atenciones = new Map();
  for (const r of conTexto) atenciones.set(r.atencion, (atenciones.get(r.atencion) ?? 0) + 1);

  console.log(`\n── Resultado acumulado ──`);
  console.log(`  con texto      : ${conTexto.length}`);
  console.log(`  sin conocer    : ${rows.length - conTexto.length}`);
  console.log(`  con advertencia: ${conAdvertencia.length}  (${Math.round((conAdvertencia.length / Math.max(conTexto.length, 1)) * 100)}%)`);
  console.log("\n── Atención ──");
  for (const [a, n] of [...atenciones].sort((x, y) => y[1] - x[1])) {
    console.log(`  ${String(n).padStart(4)}  ${a}`);
  }
  console.log(`\n  costo informado: USD ${costo.toFixed(4)} (sale de la cuota del plan)`);
  console.log(`\n✔ ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error("Falló:", err);
  process.exit(1);
});
