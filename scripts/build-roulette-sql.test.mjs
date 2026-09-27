// El generador del SQL de carga de la ruleta tiene dos modos, y la diferencia
// es lo único que estas pruebas fijan:
//
//   - Por defecto (el de siempre): el `insert … on conflict` trae razon,
//     advertencia y atencion con `coalesce(excluded.X, roulette_titles.X)`. Un
//     NULL no borra, pero un texto presente en data/copy-ruleta.json SÍ pisa el
//     de la base.
//   - `--solo-datos` (refresco de disponibilidad y metadata, plan de salas
//     Tarea 0.3): el SQL no menciona las tres columnas editoriales, ni en la
//     lista de columnas ni en el `do update`. Sirve para refrescar el catálogo
//     sin poder tocar, ni por accidente, un texto revisado a mano.
//
// Corre con: node --test scripts/build-roulette-sql.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { armarUpsert, armarDisponibilidad, esSoloDatos } from "./build-roulette-sql.mjs";

const titulo = {
  tmdb_id: 1, title: "X", year: 2000, runtime: 100, genres: ["Drama"], edad: "todos",
  apto_chicos: false, vote_count: 10, vote_average: 7.1, providers: ["Netflix"],
};
const textos = new Map([[1, { razon: "r", advertencia: "a", atencion: "alta" }]]);

test("--solo-datos no menciona las columnas editoriales", () => {
  const sql = armarUpsert([titulo], textos, { soloDatos: true });
  assert.ok(!/razon|advertencia|atencion/.test(sql), sql);
  assert.match(sql, /insert into roulette_titles \(tmdb_id, media_type, title, year, runtime, genres, edad, apto_chicos, vote_count, vote_average\) values/);
  assert.match(sql, /on conflict \(tmdb_id, media_type\) do update set/);
  assert.match(sql, /runtime = excluded\.runtime/);
  assert.match(sql, /vote_average = excluded\.vote_average;\s*$/);
});

test("sin --solo-datos conserva el coalesce de siempre, byte a byte en la forma", () => {
  const sql = armarUpsert([titulo], textos, { soloDatos: false });
  assert.match(sql, /insert into roulette_titles \(tmdb_id, media_type, title, year, runtime, genres, edad, apto_chicos, vote_count, vote_average, razon, advertencia, atencion\) values/);
  assert.match(sql, /razon = coalesce\(excluded\.razon, roulette_titles\.razon\),/);
  assert.match(sql, /advertencia = coalesce\(excluded\.advertencia, roulette_titles\.advertencia\),/);
  assert.match(sql, /atencion = coalesce\(excluded\.atencion, roulette_titles\.atencion\);\s*$/);
  assert.match(sql, /'r', 'a', 'alta'\)/);
});

test("un título sin texto va con NULL en el modo normal", () => {
  const sql = armarUpsert([{ ...titulo, tmdb_id: 2 }], textos, { soloDatos: false });
  assert.match(sql, /\(2, 'movie', 'X', 2000, 100, ARRAY\['Drama'\]::text\[\], 'todos', false, 10, 7\.1, NULL, NULL, NULL\)/);
});

test("la disponibilidad es la misma en los dos modos", () => {
  const sql = armarDisponibilidad([titulo], "AR");
  assert.match(sql, /insert into title_availability \(tmdb_id, media_type, region, providers, rent_only, checked_at\) values/);
  assert.match(sql, /\(1, 'movie', 'AR', ARRAY\['Netflix'\]::text\[\], false, now\(\)\)/);
  assert.match(sql, /providers = excluded\.providers, checked_at = excluded\.checked_at;/);
});

test("el flag se lee de los argumentos y por defecto está apagado", () => {
  assert.equal(esSoloDatos(["--chunk", "300"]), false);
  assert.equal(esSoloDatos(["--solo-datos"]), true);
  assert.equal(esSoloDatos(["--chunk", "300", "--solo-datos"]), true);
});
