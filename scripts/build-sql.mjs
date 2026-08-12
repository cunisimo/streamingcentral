#!/usr/bin/env node
/**
 * Genera el SQL de carga para pegar en el editor de Supabase.
 *
 * No necesita credenciales: produce un archivo .sql que revisás antes de
 * ejecutar. Para automatizar después hace falta service_role.
 *
 * Uso:
 *   node scripts/build-sql.mjs --chip magica-navidad
 *
 * Entrada: data/seleccion-<slug>.json + data/disponibilidad-<slug>.json
 * Salida:  data/carga-<slug>.sql
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const arg = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 ? (args[i + 1] ?? null) : null;
};

const slug = arg("--chip");
if (!slug) {
  console.error("Uso: node scripts/build-sql.mjs --chip <slug>");
  process.exit(1);
}

const SEL_PATH = resolve(`data/seleccion-${slug}.json`);
const DISP_PATH = resolve(`data/disponibilidad-${slug}.json`);
const OUT_PATH = resolve(`data/carga-${slug}.sql`);

/** Escapa un literal de texto para SQL. null → NULL. */
const q = (v) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);

/** Número o NULL. */
const num = (v) => (v === null || v === undefined || Number.isNaN(v) ? "NULL" : String(v));

/** Array de texto → literal ARRAY[...]::text[] */
const arr = (list) =>
  list.length === 0 ? "'{}'::text[]" : `ARRAY[${list.map(q).join(", ")}]::text[]`;

async function main() {
  const sel = JSON.parse(await readFile(SEL_PATH, "utf8"));
  const filas = sel.rows ?? [];

  let disp = { rows: [], region: "AR" };
  try {
    disp = JSON.parse(await readFile(DISP_PATH, "utf8"));
  } catch {
    console.warn("! Sin data/disponibilidad — se genera sólo chip_titles.\n");
  }
  const dispPorId = new Map(disp.rows?.map((r) => [`${r.tmdb_id}:${r.media_type}`, r]) ?? []);
  const region = disp.region ?? "AR";

  const partes = [];
  partes.push(`-- Carga del chip "${slug}"`);
  partes.push(`-- Generado: ${new Date().toISOString()}`);
  partes.push(`-- ${filas.length} títulos curados · región ${region}`);
  partes.push("");
  partes.push("begin;");
  partes.push("");

  // ── chip_titles ───────────────────────────────────────────────────────────
  partes.push("-- ── Títulos curados ──");
  partes.push(
    "insert into chip_titles (chip_slug, tmdb_id, media_type, title, year, priority, source, confianza, revisado) values",
  );
  partes.push(
    filas
      .map(
        (f) =>
          `  (${q(slug)}, ${num(f.tmdb_id)}, ${q(f.media_type)}, ${q(f.title)}, ` +
          `${num(f.year)}, ${num(f.priority)}, ${q(f.source ?? "curated")}, ` +
          `${q(f.confianza)}, ${f.revisado ? "true" : "false"})`,
      )
      .join(",\n"),
  );
  partes.push("on conflict (chip_slug, tmdb_id, media_type) do update set");
  partes.push("  title     = excluded.title,");
  partes.push("  year      = excluded.year,");
  partes.push("  priority  = excluded.priority,");
  partes.push("  source    = excluded.source,");
  partes.push("  confianza = excluded.confianza,");
  // revisado NO se pisa: una recarga del pipeline no debe borrar trabajo humano
  partes.push("  revisado  = chip_titles.revisado;");
  partes.push("");

  // ── title_availability ────────────────────────────────────────────────────
  const conDisp = filas
    .map((f) => dispPorId.get(`${f.tmdb_id}:${f.media_type}`))
    .filter(Boolean);

  if (conDisp.length) {
    partes.push(`-- ── Disponibilidad en ${region} ──`);
    partes.push(
      "insert into title_availability (tmdb_id, media_type, region, providers, rent_only, checked_at) values",
    );
    partes.push(
      conDisp
        .map((r) => {
          const provs = [...(r.suscripcion ?? []), ...(r.gratis ?? [])];
          const rentOnly = provs.length === 0 && (r.alquiler ?? []).length > 0;
          return (
            `  (${num(r.tmdb_id)}, ${q(r.media_type)}, ${q(region)}, ` +
            `${arr(provs)}, ${rentOnly ? "true" : "false"}, now())`
          );
        })
        .join(",\n"),
    );
    partes.push("on conflict (tmdb_id, media_type, region) do update set");
    partes.push("  providers  = excluded.providers,");
    partes.push("  rent_only  = excluded.rent_only,");
    partes.push("  checked_at = excluded.checked_at;");
    partes.push("");
  }

  partes.push("commit;");
  partes.push("");
  partes.push(`-- Verificación:`);
  partes.push(`--   select count(*) from chip_titles where chip_slug = ${q(slug)};`);
  partes.push(
    `--   select * from get_chip_titles(${q(slug)}, ARRAY['Netflix','Disney Plus']::text[], ${q(region)}, 'test', 20);`,
  );
  partes.push("");

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, partes.join("\n"), "utf8");

  const sinDisp = filas.length - conDisp.length;
  console.log(`\n  chip_titles       : ${filas.length} filas`);
  console.log(`  title_availability: ${conDisp.length} filas`);
  if (sinDisp > 0) console.log(`  ! ${sinDisp} títulos sin dato de disponibilidad`);
  console.log(`\n✔ ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("Falló:", err);
  process.exit(1);
});
