#!/usr/bin/env node
/**
 * Fase 3 — Clasificación de candidatos vía Claude Code headless (`claude -p`).
 *
 * Usa la suscripción, no la API. El peaje de contexto de Claude Code es por
 * invocación (~26k tokens), así que conviene lote grande y pocas llamadas.
 *
 * NO decide qué entra al chip: propone un sí/no que un humano revisa en la
 * Fase 4. Todo lo que no salga con confianza "alta" va a cola de revisión.
 *
 * Uso:
 *   node scripts/classify.mjs --chip magica-navidad --dry-run   # ver el prompt
 *   node scripts/classify.mjs --chip magica-navidad --limit 60  # una tanda
 *   node scripts/classify.mjs --chip magica-navidad             # completo
 *
 * Entrada: chips/<slug>.json + chips/<slug>.criterio.md + data/candidatos-<slug>.json
 * Salida:  data/clasificado-<slug>.json  (se reescribe tras CADA lote)
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";

const args = process.argv.slice(2);
const arg = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 ? (args[i + 1] ?? null) : null;
};

const slug = arg("--chip");
if (!slug) {
  console.error("Uso: node scripts/classify.mjs --chip <slug>");
  process.exit(1);
}

const dryRun = args.includes("--dry-run");
const limit = arg("--limit") ? Number(arg("--limit")) : Infinity;
const BATCH_SIZE = arg("--batch") ? Number(arg("--batch")) : 60;
const MODEL = arg("--model") ?? "sonnet";

const CONFIG_PATH = resolve(`chips/${slug}.json`);
const CANDIDATOS_PATH = resolve(`data/candidatos-${slug}.json`);
const OUTPUT_PATH = resolve(`data/clasificado-${slug}.json`);

// ─── Invocación de Claude Code ──────────────────────────────────────────────

/**
 * Corre `claude -p` con el prompt por stdin y devuelve el texto de la respuesta.
 * Se ejecuta desde el temp del sistema para que NO cargue el CLAUDE.md del repo.
 * @param {string} prompt
 * @returns {Promise<string>}
 */
function runClaude(prompt) {
  return new Promise((done, fail) => {
    const child = spawn(
      "claude",
      ["-p", "--model", MODEL, "--output-format", "json", "--max-turns", "1"],
      { cwd: tmpdir(), shell: true },
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));

    child.on("error", (err) => fail(new Error(`No pude ejecutar claude: ${err.message}`)));

    child.on("close", (code) => {
      if (!stdout.trim()) {
        return fail(new Error(`claude no devolvió nada (código ${code}). ${stderr.slice(0, 300)}`));
      }
      let envelope;
      try {
        envelope = JSON.parse(stdout);
      } catch {
        return fail(new Error(`Salida no-JSON de claude: ${stdout.slice(0, 300)}`));
      }
      // OJO: subtype puede decir "success" aunque haya fallado. Se chequea is_error.
      if (envelope.is_error) {
        return fail(new Error(`claude falló: ${envelope.result ?? "sin detalle"}`));
      }
      done({ text: envelope.result ?? "", cost: envelope.total_cost_usd ?? 0 });
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

// ─── Parseo ─────────────────────────────────────────────────────────────────

/**
 * Extrae el array JSON de la respuesta, tolerando fences y texto alrededor.
 * @param {string} text
 * @returns {object[]|null}
 */
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

/** Reduce un título a lo que el clasificador necesita leer. */
const toCandidate = (t) => ({
  id: t.tmdb_id,
  titulo: t.title,
  año: t.year,
  generos: t.genres,
  sinopsis: (t.overview ?? "").slice(0, 400),
});

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const config = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
  const criterio = await readFile(
    resolve(config.criterio_file ?? `chips/${slug}.criterio.md`),
    "utf8",
  );
  const candidatos = JSON.parse(await readFile(CANDIDATOS_PATH, "utf8"));

  const titulos = (candidatos.titles ?? []).slice(0, limit);
  const lotes = [];
  for (let i = 0; i < titulos.length; i += BATCH_SIZE) {
    lotes.push(titulos.slice(i, i + BATCH_SIZE));
  }

  console.log(`\n═══ CLASIFICACIÓN · ${config.nombre ?? slug} ═══`);
  console.log(`  candidatos : ${titulos.length}`);
  console.log(`  lotes      : ${lotes.length} de hasta ${BATCH_SIZE}`);
  console.log(`  modelo     : ${MODEL}\n`);

  const armarPrompt = (lote) =>
    `${criterio}\n\nTÍTULOS A CLASIFICAR:\n\n${JSON.stringify(lote.map(toCandidate), null, 1)}`;

  if (dryRun) {
    console.log("── PROMPT DEL PRIMER LOTE (recortado a 3 títulos) ──\n");
    console.log(armarPrompt(lotes[0].slice(0, 3)));
    console.log(`\n(el lote real lleva ${lotes[0].length} títulos)`);
    return;
  }

  const byId = new Map(titulos.map((t) => [t.tmdb_id, t]));
  const veredictos = new Map();
  let costoTotal = 0;

  /** Guarda el estado actual. Se llama tras cada lote para no perder trabajo. */
  async function guardar() {
    const clasificados = titulos.map((t) => {
      const v = veredictos.get(t.tmdb_id);
      return {
        ...t,
        califica: v?.califica ?? null,
        confianza: v?.confianza ?? "sin_veredicto",
        motivo: v?.motivo ?? "",
        revisado: false,
      };
    });
    await mkdir(dirname(OUTPUT_PATH), { recursive: true });
    await writeFile(
      OUTPUT_PATH,
      JSON.stringify(
        {
          chip_slug: slug,
          classified_at: new Date().toISOString(),
          via: "claude-code-headless",
          modelo: MODEL,
          total: clasificados.length,
          con_veredicto: veredictos.size,
          titles: clasificados,
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
        costoTotal += cost;
        const results = parseArray(text);
        if (!results) {
          if (intento === 0) {
            process.stdout.write("no parseó, reintento… ");
            continue;
          }
          throw new Error(`respuesta no parseable: ${text.slice(0, 200)}`);
        }
        let validos = 0;
        for (const r of results) {
          if (!byId.has(r.id)) continue; // id inventado: se ignora
          veredictos.set(r.id, r);
          validos++;
        }
        console.log(`${validos}/${lote.length} ok`);
        if (validos < lote.length) {
          console.warn(`    ! faltaron ${lote.length - validos} veredictos`);
        }
        ok = true;
      } catch (err) {
        if (intento === 1) {
          console.log("FALLÓ");
          console.error(`    ${err.message}`);
        }
      }
    }

    await guardar(); // progreso incremental: si algo se cae, no se pierde lo hecho
  }

  const clasificados = titulos.map((t) => veredictos.get(t.tmdb_id));
  const aprobados = clasificados.filter((v) => v?.califica === true).length;
  const rechazados = clasificados.filter((v) => v?.califica === false).length;
  const sinVeredicto = clasificados.filter((v) => !v).length;
  const aRevisar = clasificados.filter((v) => !v || v.confianza !== "alta").length;

  console.log(`\n── Resultado ──`);
  console.log(`  aprobados     : ${aprobados}`);
  console.log(`  rechazados    : ${rechazados}`);
  console.log(`  sin veredicto : ${sinVeredicto}`);
  console.log(`  a revisar     : ${aRevisar}  (confianza media/baja o sin veredicto)`);
  console.log(`  tasa de aprobación: ${Math.round((aprobados / titulos.length) * 100)}%`);
  console.log(`\n  costo informado por Claude Code: USD ${costoTotal.toFixed(4)}`);
  console.log(`  (informativo — bajo suscripción se descuenta de la cuota del plan)`);
  console.log(`\n✔ ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error("Falló la clasificación:", err);
  process.exit(1);
});
