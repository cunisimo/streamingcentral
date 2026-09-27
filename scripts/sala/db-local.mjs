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
// EL CONTENEDOR SE ELIGE POR `project_id`, NO POR PREFIJO. El CLI nombra la base
// `supabase_db_<project_id>` y en una máquina pueden convivir varios proyectos
// locales: tomar "el primero que empiece con supabase_db_" podía aplicar este
// esquema en la base de otro proyecto. Se lee `project_id` de
// supabase/config.toml y se exige UNA coincidencia exacta.
//
// Los archivos que todavía no existen (p. ej. 009_salas.sql antes de la Etapa
// 1) se saltean con aviso, no cortan la corrida.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** El `project_id` declarado en supabase/config.toml, o null si no está. */
export function projectIdDe(configToml) {
  const m = configToml.match(/^\s*project_id\s*=\s*"([^"]+)"/m);
  return m ? m[1] : null;
}

/**
 * Elige el contenedor de la base del proyecto entre los nombres que devuelve
 * `docker ps`. Exige exactamente `supabase_db_<projectId>` y una sola
 * coincidencia; cualquier otra cosa lanza con el motivo.
 */
export function elegirContenedor(nombres, projectId) {
  if (!projectId) throw new Error("supabase/config.toml no declara project_id");
  const esperado = `supabase_db_${projectId}`;
  const coincidencias = nombres.filter((n) => n === esperado);
  if (coincidencias.length === 0) {
    const otros = nombres.filter((n) => n.startsWith("supabase_db_"));
    throw new Error(
      `No está corriendo ${esperado}. ¿corriste \`supabase start\` en ESTE proyecto?` +
      (otros.length ? ` Hay otras bases locales: ${otros.join(", ")}` : ""),
    );
  }
  if (coincidencias.length > 1) throw new Error(`Más de un contenedor se llama ${esperado}: ${coincidencias.join(", ")}`);
  return coincidencias[0];
}

/** La lista de archivos a aplicar, en orden. */
export function archivosAAplicar({ conCatalogo, cargas }) {
  return [
    "scripts/sala/local-pre.sql",
    "supabase/schema.sql",
    "supabase/migrations/001_chip_titles.sql",
    "supabase/migrations/002_roulette.sql",
    "supabase/migrations/003_lock_roulette.sql",
    "supabase/migrations/009_salas.sql",
    ...(conCatalogo ? cargas : []),
    "scripts/sala/fixtures-local.sql",
  ];
}

/** Los data/carga-ruleta-N.sql en orden numérico (1, 2, …, 10, no 1, 10, 2). */
export function cargasOrdenadas(nombresEnData) {
  return nombresEnData
    .filter((f) => /^carga-ruleta-\d+\.sql$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
    .map((f) => `data/${f}`);
}

function main() {
  const conCatalogo = process.argv.includes("--catalogo-real");
  const cargas = existsSync("data") ? cargasOrdenadas(readdirSync("data")) : [];
  const ARCHIVOS = archivosAAplicar({ conCatalogo, cargas });

  const projectId = projectIdDe(readFileSync("supabase/config.toml", "utf8"));
  const corriendo = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .trim().split("\n").filter(Boolean);
  let nombre;
  try {
    nombre = elegirContenedor(corriendo, projectId);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
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
}

// Sólo corre como programa: el test importa las funciones puras.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
