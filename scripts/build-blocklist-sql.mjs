#!/usr/bin/env node
/**
 * Genera el SQL de chip_blocklist a partir de los rechazados del clasificador.
 *
 * Sin esto, cuando se agotan los curados el relleno automático vuelve a
 * traer Harry Potter y Shazam — el bug original reaparece por la cola.
 *
 * CRITERIO: sólo entran los rechazos del CLASIFICADOR (califica: false).
 * Los títulos cortados por nota o por tope de saga NO van acá: son
 * navideños legítimos y que el relleno los traiga está bien.
 *
 * Por defecto bloquea sólo los rechazos con confianza alta. Los inciertos
 * quedan fuera: un rechazo dudoso es justo el que puede estar mal, y
 * bloquearlo lo esconde para siempre.
 *
 * Uso:
 *   node scripts/build-blocklist-sql.mjs --chip magica-navidad
 *   node scripts/build-blocklist-sql.mjs --chip magica-navidad --incluir-inciertos
 *
 * Entrada: data/clasificado-<slug>.json
 * Salida:  data/blocklist-<slug>.sql
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
  console.error("Uso: node scripts/build-blocklist-sql.mjs --chip <slug>");
  process.exit(1);
}

const incluirInciertos = args.includes("--incluir-inciertos");

const IN_PATH = resolve(`data/clasificado-${slug}.json`);
const OUT_PATH = resolve(`data/blocklist-${slug}.sql`);

const q = (v) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);

async function main() {
  const data = JSON.parse(await readFile(IN_PATH, "utf8"));
  const todos = data.titles ?? [];

  const rechazados = todos.filter((t) => t.califica === false);
  const seguros = rechazados.filter((t) => t.confianza === "alta");
  const inciertos = rechazados.filter((t) => t.confianza !== "alta");

  const aBloquear = incluirInciertos ? rechazados : seguros;

  console.log(`\n── Rechazados por el clasificador ──`);
  console.log(`  confianza alta  : ${seguros.length}  → a la blocklist`);
  console.log(`  confianza media/baja: ${inciertos.length}  → ${incluirInciertos ? "a la blocklist (--incluir-inciertos)" : "fuera, pendientes de revisión"}`);
  console.log(`  total a bloquear: ${aBloquear.length}`);

  if (!incluirInciertos && inciertos.length) {
    console.log(`\n  Rechazos inciertos que NO se bloquean:`);
    for (const t of inciertos.slice(0, 15)) {
      console.log(`    ${t.confianza} · ${t.year} · ${t.title}`);
    }
    if (inciertos.length > 15) console.log(`    … y ${inciertos.length - 15} más`);
  }

  if (aBloquear.length === 0) {
    console.log("\nNada que generar.");
    return;
  }

  const partes = [];
  partes.push(`-- Blocklist del chip "${slug}"`);
  partes.push(`-- Generado: ${new Date().toISOString()}`);
  partes.push(`-- ${aBloquear.length} títulos rechazados por el clasificador`);
  partes.push(`--`);
  partes.push(`-- Los consume el relleno automático: cuando se agotan los curados y`);
  partes.push(`-- el chip cae a discover de TMDB, estos no deben volver a aparecer.`);
  partes.push("");
  partes.push("begin;");
  partes.push("");
  partes.push("insert into chip_blocklist (chip_slug, tmdb_id, media_type, reason) values");
  partes.push(
    aBloquear
      .map((t) => {
        // El esquema no tiene columna de título; se mete en reason para que
        // la tabla sea legible cuando la abras dentro de seis meses.
        const razon = `${t.title} (${t.year ?? "?"}) — ${t.motivo || "rechazado por el clasificador"}`;
        return `  (${q(slug)}, ${t.tmdb_id}, ${q(t.media_type)}, ${q(razon.slice(0, 300))})`;
      })
      .join(",\n"),
  );
  partes.push("on conflict (chip_slug, tmdb_id, media_type) do update set");
  partes.push("  reason = excluded.reason;");
  partes.push("");
  partes.push("commit;");
  partes.push("");
  partes.push(`-- Verificación:`);
  partes.push(`--   select count(*) from chip_blocklist where chip_slug = ${q(slug)};`);
  partes.push("");

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, partes.join("\n"), "utf8");

  console.log(`\n✔ ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("Falló:", err);
  process.exit(1);
});
