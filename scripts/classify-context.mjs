#!/usr/bin/env node
/**
 * ¿Esta secuela se entiende sin haber visto las anteriores?
 *
 * Pertenecer a una saga es un mal proxy: Fury Road es la cuarta de Mad Max y
 * no necesita nada previo; Endgame sin Infinity War es incomprensible. Esta
 * pasada distingue una cosa de la otra.
 *
 * Sólo consulta por las que ya se detectaron como no-primeras de su saga.
 *
 * REANUDABLE: saltea lo ya clasificado.
 *
 * Uso:
 *   node scripts/classify-context.mjs --dry-run
 *   node scripts/classify-context.mjs
 *
 * Entrada: data/colecciones-ruleta.json
 * Salida:  data/contexto-ruleta.json + data/carga-contexto.sql
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";

const args = process.argv.slice(2);
const arg = (f) => {
  const i = args.indexOf(f);
  return i !== -1 ? (args[i + 1] ?? null) : null;
};

const dryRun = args.includes("--dry-run");
const BATCH_SIZE = arg("--batch") ? Number(arg("--batch")) : 40;
const MODEL = arg("--model") ?? "sonnet";

const IN_PATH = resolve("data/colecciones-ruleta.json");
const OUT_PATH = resolve("data/contexto-ruleta.json");
const SQL_PATH = resolve("data/carga-contexto.sql");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (v) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);

// Editá acá si el criterio no te cierra al ver los resultados.
const PROMPT = `Recibís películas que pertenecen a una saga y NO son la primera por
fecha de estreno.

Para cada una, una sola pregunta: ¿se entiende y se disfruta sin haber
visto las anteriores?

requiere_contexto = true
  El espectador que no vio las anteriores se pierde algo importante: no
  sabe quiénes son los personajes, la trama arranca a mitad de camino, o
  el peso emocional depende de lo que pasó antes.

requiere_contexto = false
  Funciona sola. Presenta a sus personajes de cero, la trama cierra en sí
  misma, o la relación con las otras es sólo de universo compartido.

Ejemplos resueltos:
- "Mad Max: Furia en la carretera" → false. Cuarta de la saga, pero el
  mundo se explica solo y no depende de ninguna anterior.
- "El caballero oscuro" → false. Segunda de la trilogía, se sostiene sola.
- "Vengadores: Endgame" → true. Sin Infinity War no se entiende nada.
- "El señor de los anillos: Las dos torres" → true. Arranca a mitad de
  una historia y termina sin cerrarla.
- "Toy Story 2" → false. Se entiende sin la primera, aunque gane con ella.

Ante la duda, poné false: excluir de más una película autoconclusiva es
peor que dejar pasar una que pide contexto, porque la advertencia de la
tarjeta ya avisa.

Devolvé SOLO un array JSON, sin markdown:
[{"id":123,"requiere_contexto":true,"motivo":"máximo 12 palabras"}]
Un objeto por cada título recibido, en el mismo orden.`;

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
      if (!stdout.trim()) return fail(new Error(`claude no devolvió nada (${code}). ${stderr.slice(0, 200)}`));
      let env;
      try {
        env = JSON.parse(stdout);
      } catch {
        return fail(new Error(`Salida no-JSON: ${stdout.slice(0, 200)}`));
      }
      if (env.is_error) {
        const d = [env.result, env.terminal_reason && `terminal_reason=${env.terminal_reason}`]
          .filter(Boolean)
          .join(" · ");
        return fail(new Error(`claude falló: ${d || "sin detalle"}`));
      }
      done({ text: env.result ?? "", cost: env.total_cost_usd ?? 0 });
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function parseArray(text) {
  const clean = text.replace(/```(?:json)?/g, "").trim();
  const a = clean.indexOf("[");
  const b = clean.lastIndexOf("]");
  if (a === -1 || b === -1) return null;
  try {
    const p = JSON.parse(clean.slice(a, b + 1));
    return Array.isArray(p) ? p : null;
  } catch {
    return null;
  }
}

async function main() {
  const data = JSON.parse(await readFile(IN_PATH, "utf8"));
  const filas = data.rows ?? [];
  const secuelas = filas.filter((f) => f.es_secuela);

  let hechos = new Map();
  try {
    const previo = JSON.parse(await readFile(OUT_PATH, "utf8"));
    hechos = new Map((previo.rows ?? []).map((r) => [r.tmdb_id, r]));
    console.log(`\nYa clasificados: ${hechos.size}`);
  } catch {
    console.log("\nPrimera corrida.");
  }

  const pendientes = secuelas.filter((f) => !hechos.has(f.tmdb_id));
  console.log(`  secuelas detectadas: ${secuelas.length}`);
  console.log(`  pendientes         : ${pendientes.length}`);

  const lotes = [];
  for (let i = 0; i < pendientes.length; i += BATCH_SIZE) {
    lotes.push(pendientes.slice(i, i + BATCH_SIZE));
  }

  const armar = (lote) =>
    `${PROMPT}\n\nTÍTULOS:\n\n${JSON.stringify(
      lote.map((f) => ({ id: f.tmdb_id, titulo: f.title, año: f.year, saga: f.collection_name })),
      null,
      1,
    )}`;

  if (dryRun) {
    console.log("\n── PROMPT (3 títulos) ──\n");
    console.log(armar(pendientes.slice(0, 3)));
    console.log(`\n(${lotes.length} lotes de hasta ${BATCH_SIZE})`);
    return;
  }

  const porId = new Map(secuelas.map((f) => [f.tmdb_id, f]));
  let costo = 0;

  async function guardar() {
    await mkdir(resolve("data"), { recursive: true });
    await writeFile(
      OUT_PATH,
      JSON.stringify(
        { classified_at: new Date().toISOString(), total: hechos.size, rows: [...hechos.values()] },
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
        const { text, cost } = await runClaude(armar(lote));
        costo += cost;
        const res = parseArray(text);
        if (!res) {
          if (intento === 0) {
            process.stdout.write("no parseó, reintento… ");
            continue;
          }
          throw new Error("respuesta no parseable");
        }
        let n = 0;
        for (const r of res) {
          const f = porId.get(r.id);
          if (!f) continue;
          hechos.set(r.id, {
            tmdb_id: r.id,
            title: f.title,
            year: f.year,
            saga: f.collection_name,
            requiere_contexto: r.requiere_contexto === true,
            motivo: r.motivo ?? "",
          });
          n++;
        }
        console.log(`${n}/${lote.length} ok`);
        ok = true;
      } catch (err) {
        if (intento === 1) {
          console.log("FALLÓ");
          console.error(`    ${err.message}`);
        }
      }
    }
    await guardar();
    if (i < lotes.length - 1) await sleep(8000);
  }

  const rows = [...hechos.values()];
  const requieren = rows.filter((r) => r.requiere_contexto);
  const autonomas = rows.filter((r) => !r.requiere_contexto);

  console.log(`\n── Resultado ──`);
  console.log(`  requieren contexto: ${requieren.length}`);
  console.log(`  autoconclusivas   : ${autonomas.length}`);

  console.log(`\n── Rescatadas (secuelas que SÍ se pueden recomendar) ──`);
  for (const r of autonomas.slice(0, 20)) {
    console.log(`  ${r.year} · ${r.title} — ${r.motivo}`);
  }

  // ── SQL ───────────────────────────────────────────────────────────────────
  const sql = [];
  sql.push("-- Contexto previo requerido, para la ruleta");
  sql.push(`-- ${requieren.length} títulos que piden haber visto las anteriores`);
  sql.push("");
  sql.push("");
  sql.push("begin;");
  sql.push("");
  sql.push("update roulette_titles set requiere_contexto = false;");
  sql.push("");
  if (requieren.length) {
    sql.push("update roulette_titles set requiere_contexto = true where tmdb_id in (");
    sql.push("  " + requieren.map((r) => r.tmdb_id).join(", "));
    sql.push(");");
    sql.push("");
  }
  const conSaga = filas.filter((f) => f.collection_name);
  if (conSaga.length) {
    sql.push("update roulette_titles rt set collection_name = v.nombre");
    sql.push("from (values");
    sql.push(conSaga.map((f) => `  (${f.tmdb_id}, ${q(f.collection_name)})`).join(",\n"));
    sql.push(") as v(id, nombre) where rt.tmdb_id = v.id;");
    sql.push("");
  }
  sql.push("commit;");
  sql.push("");
  sql.push("-- Verificación:");
  sql.push("--   select count(*) from roulette_titles where requiere_contexto;");
  sql.push("");

  await writeFile(SQL_PATH, sql.join("\n"), "utf8");

  console.log(`\n  costo informado: USD ${costo.toFixed(4)}`);
  console.log(`\n✔ ${OUT_PATH}`);
  console.log(`✔ ${SQL_PATH}`);
}

main().catch((err) => {
  console.error("Falló:", err);
  process.exit(1);
});
