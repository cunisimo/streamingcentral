// El selector de contenedor de db-local.mjs. Lo que fija: se elige por
// `project_id` exacto, nunca por prefijo, y cualquier ambigüedad falla.
//
// Corre con: node --test scripts/sala/db-local.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { archivosAAplicar, cargasOrdenadas, elegirContenedor, projectIdDe } from "./db-local.mjs";

test("projectIdDe lee el project_id del config.toml real del repo", () => {
  const toml = fs.readFileSync("supabase/config.toml", "utf8");
  assert.equal(projectIdDe(toml), "streamingcentral");
  assert.equal(projectIdDe("# nada\n[api]\nport = 1"), null);
  assert.equal(projectIdDe('project_id = "otro"\n'), "otro");
});

test("elige exactamente supabase_db_<project_id>, aunque haya otros proyectos corriendo", () => {
  const nombres = ["supabase_db_otro", "supabase_db_streamingcentral", "supabase_auth_streamingcentral", "supabase_db_streamingcentral2"];
  assert.equal(elegirContenedor(nombres, "streamingcentral"), "supabase_db_streamingcentral");
});

test("falla si el contenedor del proyecto no está, y nombra los que sí están", () => {
  assert.throws(
    () => elegirContenedor(["supabase_db_otro", "supabase_db_streamingcentral2"], "streamingcentral"),
    /No está corriendo supabase_db_streamingcentral[\s\S]*supabase_db_otro, supabase_db_streamingcentral2/,
  );
  assert.throws(() => elegirContenedor([], "streamingcentral"), /No está corriendo/);
});

test("falla si la selección no es inequívoca o falta el project_id", () => {
  assert.throws(() => elegirContenedor(["supabase_db_x", "supabase_db_x"], "x"), /Más de un contenedor/);
  assert.throws(() => elegirContenedor(["supabase_db_x"], null), /no declara project_id/);
});

test("un prefijo parecido NO alcanza: 'streamingcentral2' no es 'streamingcentral'", () => {
  assert.throws(() => elegirContenedor(["supabase_db_streamingcentral2"], "streamingcentral"), /No está corriendo/);
});

test("las cargas del catálogo van en orden numérico y sólo si se pidieron", () => {
  const enData = ["carga-ruleta-10.sql", "carga-ruleta-2.sql", "carga-ruleta-1.sql", "carga-contexto.sql", "pool-ruleta.json"];
  assert.deepEqual(cargasOrdenadas(enData), ["data/carga-ruleta-1.sql", "data/carga-ruleta-2.sql", "data/carga-ruleta-10.sql"]);
  const sin = archivosAAplicar({ conCatalogo: false, cargas: cargasOrdenadas(enData) });
  assert.ok(!sin.some((f) => f.startsWith("data/")));
  const con = archivosAAplicar({ conCatalogo: true, cargas: cargasOrdenadas(enData) });
  assert.equal(con.indexOf("data/carga-ruleta-1.sql"), con.indexOf("supabase/migrations/009_salas.sql") + 1);
  assert.equal(con.at(-1), "scripts/sala/fixtures-local.sql");
  assert.equal(con[0], "scripts/sala/local-pre.sql");
});
