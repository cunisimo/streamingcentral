#!/usr/bin/env node
/**
 * Genera el SQL de carga de la ruleta, partido en archivos.
 *
 * Carga el pool ENTERO (1811), tenga texto o no. Los que no tienen quedan
 * con razon NULL y la función los ignora; las pasadas futuras de generación
 * son un UPDATE sobre filas que ya existen.
 *
 * La disponibilidad va a title_availability, la misma tabla que usa navidad.
 *
 * Uso:
 *   node scripts/build-roulette-sql.mjs
 *   node scripts/build-roulette-sql.mjs --chunk 300
 *
 * Entrada: data/pool-ruleta.json + data/copy-ruleta.json
 * Salida:  data/carga-ruleta-N.sql
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const arg = (f) => {
  const i = args.indexOf(f);
  return i !== -1 ? (args[i + 1] ?? null) : null;
};
const CHUNK = arg("--chunk") ? Number(arg("--chunk")) : 400;

const q = (v) => (v === null || v === undefined || v === "" ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const num = (v) => (v === null || v === undefined || Number.isNaN(v) ? "NULL" : String(v));
const arr = (l) => (l?.length ? `ARRAY[${l.map(q).join(", ")}]::text[]` : "'{}'::text[]");

async function main() {
  const pool = JSON.parse(await readFile(resolve("data/pool-ruleta.json"), "utf8"));
  const copy = JSON.parse(await readFile(resolve("data/copy-ruleta.json"), "utf8"));

  const region = pool.region ?? "AR";
  const textos = new Map(
    (copy.rows ?? []).filter((r) => r.conoce).map((r) => [r.tmdb_id, r]),
  );
  const titulos = pool.titles ?? [];

  console.log(`\n  pool        : ${titulos.length}`);
  console.log(`  con texto   : ${textos.size}`);
  console.log(`  sin texto   : ${titulos.length - textos.size}  (razon NULL, no servibles)`);

  await mkdir(resolve("data"), { recursive: true });

  const trozos = [];
  for (let i = 0; i < titulos.length; i += CHUNK) trozos.push(titulos.slice(i, i + CHUNK));

  for (const [i, trozo] of trozos.entries()) {
    const p = [];
    p.push(`-- Carga de la ruleta — parte ${i + 1} de ${trozos.length}`);
    p.push(`-- ${trozo.length} títulos · región ${region}`);
    p.push("");
    p.push("begin;");
    p.push("");

    p.push("insert into roulette_titles (tmdb_id, media_type, title, year, runtime, genres, edad, apto_chicos, vote_count, vote_average, razon, advertencia, atencion) values");
    p.push(
      trozo
        .map((t) => {
          const c = textos.get(t.tmdb_id);
          return (
            `  (${num(t.tmdb_id)}, 'movie', ${q(t.title)}, ${num(t.year)}, ${num(t.runtime)}, ` +
            `${arr(t.genres)}, ${q(t.edad ?? "desconocido")}, ${t.apto_chicos ? "true" : "false"}, ` +
            `${num(t.vote_count)}, ${num(t.vote_average)}, ` +
            `${q(c?.razon ?? null)}, ${q(c?.advertencia ?? null)}, ${q(c?.atencion ?? null)})`
          );
        })
        .join(",\n"),
    );
    p.push("on conflict (tmdb_id, media_type) do update set");
    p.push("  title = excluded.title, year = excluded.year, runtime = excluded.runtime,");
    p.push("  genres = excluded.genres, edad = excluded.edad,");
    p.push("  apto_chicos = excluded.apto_chicos, vote_count = excluded.vote_count,");
    p.push("  vote_average = excluded.vote_average,");
    // El texto nuevo sólo pisa si viene con contenido: una recarga del pool
    // sin regenerar textos no debe borrar lo ya escrito.
    p.push("  razon = coalesce(excluded.razon, roulette_titles.razon),");
    p.push("  advertencia = coalesce(excluded.advertencia, roulette_titles.advertencia),");
    p.push("  atencion = coalesce(excluded.atencion, roulette_titles.atencion);");
    p.push("");

    p.push("insert into title_availability (tmdb_id, media_type, region, providers, rent_only, checked_at) values");
    p.push(
      trozo
        .map((t) => `  (${num(t.tmdb_id)}, 'movie', ${q(region)}, ${arr(t.providers)}, false, now())`)
        .join(",\n"),
    );
    p.push("on conflict (tmdb_id, media_type, region) do update set");
    p.push("  providers = excluded.providers, checked_at = excluded.checked_at;");
    p.push("");
    p.push("commit;");
    p.push("");

    const path = resolve(`data/carga-ruleta-${i + 1}.sql`);
    await writeFile(path, p.join("\n"), "utf8");
    console.log(`  ✔ parte ${i + 1}: ${trozo.length} filas → ${path}`);
  }

  console.log(`\n  Pegá las ${trozos.length} partes en orden en el SQL Editor.`);
  console.log(`\n  Verificación:`);
  console.log(`    select count(*) from roulette_titles;`);
  console.log(`    select count(*) from roulette_titles where razon is not null;`);
}

main().catch((err) => {
  console.error("Falló:", err);
  process.exit(1);
});
