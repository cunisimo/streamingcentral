// Exclusión editorial de títulos YA cargados en Producción (anime / stand-up).
// Mecanismo: columna `excluido_motivo` en roulette_titles + filtro en
// get_roulette_picks. NO borra filas, NO toca textos, NO usa la disponibilidad.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { armarSqlExclusiones, armarSqlReversion } from "./exclusiones-produccion.mjs";
import { armarUpsert, armarDisponibilidad, armarTextosNuevos } from "../build-roulette-sql.mjs";
import { armarCargaIncremental } from "./salidas.mjs";

const RAIZ = resolve(import.meta.dirname, "..", "..");
const leer = (p) => readFileSync(resolve(RAIZ, p), "utf8");
const lista = [
  { tmdb_id: 129, titulo: "El viaje de Chihiro", motivo: "anime" },
  { tmdb_id: 823754, titulo: "Bo Burnham: Inside", motivo: "stand-up" },
];

test("el SQL de datos sólo MARCA: ni delete, ni textos, ni disponibilidad", () => {
  const sql = armarSqlExclusiones(lista, { fecha: "2026-10-07" });
  assert.ok(!/\bdelete\b/i.test(sql), "no borra filas");
  assert.ok(!/\btruncate\b/i.test(sql));
  assert.ok(!/razon|advertencia|atencion|requiere_contexto/i.test(sql.replace(/^--.*$/gm, "")), "no toca textos editoriales");
  assert.ok(!/title_availability|providers/i.test(sql.replace(/^--.*$/gm, "")), "no usa la disponibilidad como mecanismo");
  assert.match(sql, /update roulette_titles rt set excluido_motivo = v\.motivo, excluido_at = now\(\)/);
  assert.match(sql, /\(129, 'anime'\)/);
  assert.match(sql, /\(823754, 'stand-up'\)/);
  assert.match(sql, /rt\.media_type = 'movie'/);
  assert.match(sql, /rt\.excluido_motivo is null/, "idempotente: no repisa una marca existente");
  // La coma separa filas ANTES del comentario (dentro del comentario no cuenta).
  const filas = sql.split("\n").filter((l) => /^ {2}\(\d+, '/.test(l));
  assert.equal(filas.length, 2);
  assert.match(filas[0], /^ {2}\(\d+, '[^']+'\), {2}-- /);
  assert.match(filas[1], /^ {2}\(\d+, '[^']+'\) {2}-- /);
  assert.match(sql, /^begin;$/m);
  assert.match(sql, /^commit;$/m);
});

test("la reversión es individual: un update por título, sólo sobre las columnas de exclusión", () => {
  const sql = armarSqlReversion(lista);
  assert.equal((sql.match(/^update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = \d+ and media_type = 'movie';$/gm) ?? []).length, 2);
  assert.ok(!/\bdelete\b/i.test(sql));
});

test("la migración agrega las columnas con motivo controlado y filtra en get_roulette_picks", () => {
  const m = leer("supabase/migrations/010_ruleta_exclusiones.sql");
  assert.match(m, /add column if not exists excluido_motivo text/);
  assert.match(m, /check \(excluido_motivo in \('anime', 'stand-up', 'especial-no-narrativo'\)\)/);
  assert.match(m, /add column if not exists excluido_at timestamptz/);
  assert.match(m, /create or replace function get_roulette_picks\(/);
  assert.match(m, /and rt\.excluido_motivo is null/);
  // La función conserva TODO lo de 003 (security definer, search_path, tope, filtros).
  for (const parte of ["security definer", "set search_path = public, pg_temp", "rt.razon is not null", "rt.advertencia is not null", "not rt.requiere_contexto", "ta.providers && p_providers", "least(greatest(coalesce(p_limit, 20), 1), 40)"]) {
    assert.ok(m.includes(parte), parte);
  }
  assert.ok(!/\bdelete\b|\bdrop table\b/i.test(m));
  const down = leer("supabase/migrations/010_ruleta_exclusiones_down.sql");
  assert.match(down, /create or replace function get_roulette_picks\(/);
  assert.ok(!down.includes("excluido_motivo is null"), "el down vuelve a la función de 003");
});

test("la exclusión SOBREVIVE a las cargas: ningún generador de SQL de la ruleta menciona excluido_*", () => {
  const t = { tmdb_id: 1, title: "X", year: 2000, runtime: 100, genres: ["Drama"], edad: "todos", apto_chicos: false, vote_count: 10, vote_average: 7, providers: ["Netflix"] };
  const textos = new Map([[1, { tmdb_id: 1, razon: "r", advertencia: "a", atencion: "alta" }]]);
  const todos = [
    armarUpsert([t], textos), armarUpsert([t], textos, { soloDatos: true }), armarDisponibilidad([t], "AR"),
    armarTextosNuevos(textos, [{ tmdb_id: 1, requiere_contexto: true }], [{ tmdb_id: 1, collection_name: "S" }]),
    ...armarCargaIncremental({ nuevos: [t], metadatos: [t], disponibilidad: [{ tmdb_id: 1, providers: ["Netflix"], at: "2026-10-07T00:00:00Z" }] }),
  ].join("\n");
  assert.ok(!/excluido/i.test(todos));
});
