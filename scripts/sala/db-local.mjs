#!/usr/bin/env node
// Aplica, en orden, lo que la sala necesita en la base LOCAL de `supabase start`.
//
// No usa psql local: manda cada archivo por stdin al psql del contenedor de
// Postgres que levanta el CLI, con ON_ERROR_STOP para que un error corte ahí.
//
// Por qué no `supabase db reset`: las migraciones del repo (001_… sin timestamp)
// dependen de supabase/schema.sql, que no es una migración, y 005 altera una
// tabla que sólo existe en schema.sql. El orden lo fija esta lista.
//
// Uso:
//   node scripts/sala/db-local.mjs                  # esquema + salas + fixtures sintéticas
//   node scripts/sala/db-local.mjs --catalogo-real  # además, data/carga-ruleta-*.sql
//
// `--catalogo-real` carga el pool curado real en LOCAL para las mediciones de
// preparación (plan de salas, Tarea 2.3; autorizado por el dueño el 2026-09-18).
// Producción no se toca desde acá: este script sólo conoce el contenedor local.
//
// Los archivos que todavía no existen (p. ej. 009_salas.sql antes de la Etapa
// 1) se saltean con aviso, no cortan la corrida.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";

const conCatalogo = process.argv.includes("--catalogo-real");
const cargas = conCatalogo && existsSync("data")
  ? readdirSync("data")
      .filter((f) => /^carga-ruleta-\d+\.sql$/.test(f))
      .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
      .map((f) => `data/${f}`)
  : [];

const ARCHIVOS = [
  "scripts/sala/local-pre.sql",
  "supabase/schema.sql",
  "supabase/migrations/001_chip_titles.sql",
  "supabase/migrations/002_roulette.sql",
  "supabase/migrations/003_lock_roulette.sql",
  "supabase/migrations/009_salas.sql",
  ...cargas,
  "scripts/sala/fixtures-local.sql",
];

const contenedores = execFileSync("docker", ["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"], { encoding: "utf8" })
  .trim().split("\n").filter(Boolean);
if (!contenedores.length) {
  console.error("No hay contenedor supabase_db_*: ¿corriste `supabase start`?");
  process.exit(1);
}
const nombre = contenedores[0];
console.log(`contenedor: ${nombre}${conCatalogo ? ` · catálogo real: ${cargas.length} archivos` : ""}`);

let aplicados = 0;
for (const f of ARCHIVOS) {
  if (!existsSync(f)) { console.log(`– ${f} (no existe todavía, se saltea)`); continue; }
  const r = spawnSync("docker", ["exec", "-i", nombre, "psql", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], {
    input: readFileSync(f, "utf8"), encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) {
    console.error(`✖ ${f}\n${r.stderr}`);
    process.exit(r.status ?? 1);
  }
  const avisos = (r.stderr || "").split("\n").filter((l) => /^(NOTICE|WARNING)/.test(l)).length;
  console.log(`✔ ${f}${avisos ? ` (${avisos} avisos)` : ""}`);
  aplicados++;
}
console.log(`\n${aplicados} archivos aplicados.`);
