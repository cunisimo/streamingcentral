// Frenos de los arneses destructivos (auditoría E9a, A2). Sin base: los
// estados se arman con los objetos que crean los archivos de migración, y los
// arneses REALES se ejecutan con un `local.mjs` falso que anota cada llamada y
// bloquea toda escritura (frenos-arneses.gancho.mjs).
//   node --test scripts/comunidad/frenos-arneses.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { frenoUpDownUp, frenoUpDownUp020, literalDefault, objetosDe, objetosDeMigracion } from "./frenos-arneses.mjs";

const HASTA = (n) => Array.from({ length: n - 10 }, (_, i) => i + 11);
const ADM_UDU = objetosDe([11, 12, 13, 14]);
const ADM_020 = objetosDe(HASTA(20));

/** Estado como lo devuelve ESTADO_SQL, con los objetos de `nums` y `config` en sus defaults. */
function estadoDe(nums, { filas = {}, config = {}, triggers = [] } = {}) {
  const o = objetosDe(nums);
  const defaults = {}, fila = {};
  for (const c of o.columnasConfig) {
    defaults[c] = c === "id" ? "true" : c === "actualizada_en" ? "now()" : c === "terminos_version" ? "'borrador-local-1'::text" : "0";
    fila[c] = c === "id" ? true : c === "actualizada_en" ? "2026-10-28T00:00:00+00:00" : c === "terminos_version" ? "borrador-local-1" : 0;
  }
  return {
    esquema: true,
    tablas: Object.fromEntries([...o.tablas].map((t) => [t, filas[t] ?? (t === "config" || t === "purga_config" ? 1 : 0)])),
    funciones: [...o.funciones].filter((f) => f.startsWith("comunidad.") || f.startsWith("public.comunidad_")),
    triggers: [...o.triggers, ...triggers],
    config: JSON.stringify({ ...fila, ...config }),
    defaults,
  };
}
const SIN_ESQUEMA = { esquema: false, tablas: {}, funciones: [], triggers: [], config: null, defaults: {} };

test("el parser de migraciones ve tablas, funciones, procedimientos, triggers y columnas de config", () => {
  const o = objetosDeMigracion(`-- create table comunidad.comentada (
create table if not exists comunidad.a (id int);
create or replace function comunidad.f(x int) returns int language sql as $$ select 1 $$;
create or replace procedure comunidad.p() language sql as $$ select 1 $$;
create constraint trigger t1 after insert on comunidad.a for each row execute function comunidad.f();
alter table comunidad.config
  add column if not exists c1 integer not null default 2,
  add column c2 boolean not null default false;`);
  assert.deepEqual(o.tablas, ["a"]);
  assert.deepEqual(o.funciones, ["comunidad.f", "comunidad.p"]);
  assert.deepEqual(o.triggers, ["t1"]);
  assert.deepEqual(o.columnasConfig, ["c1", "c2"]);
  assert.ok(objetosDe([15]).tablas.has("huellas"), "015 crea huellas");
  assert.ok(objetosDe([16]).tablas.has("decisiones"), "016 crea decisiones");
  assert.ok(objetosDe([21]).funciones.has("comunidad.purgar"), "021 crea el procedimiento purgar");
});

test("defaults literales", () => {
  assert.equal(literalDefault("false"), false);
  assert.equal(literalDefault("50"), 50);
  assert.equal(literalDefault("'borrador-local-1'::text"), "borrador-local-1");
  assert.equal(literalDefault("now()"), Symbol.for("marca-de-tiempo"));
  assert.equal(literalDefault("gen_random_uuid()"), undefined);
});

test("up-down-up.mjs: admite sin esquema y 011–014 vacía", () => {
  assert.deepEqual(frenoUpDownUp(SIN_ESQUEMA, ADM_UDU), []);
  assert.deepEqual(frenoUpDownUp(estadoDe([11, 12, 13, 14]), ADM_UDU), []);
  assert.deepEqual(frenoUpDownUp(estadoDe([11, 12, 13, 14, 22]), ADM_UDU), [], "022 no crea objetos de comunidad");
});

test("up-down-up.mjs: rechaza 015 sin 016 (el hueco del freno anterior)", () => {
  const e = estadoDe([11, 12, 13, 14, 15]);
  assert.equal(e.tablas.decisiones, undefined, "el freno anterior sólo miraba decisiones");
  const m = frenoUpDownUp(e, ADM_UDU);
  assert.match(m.join("\n"), /tablas de migraciones no admitidas: corroboraciones, denuncias_excedentes, huellas/);
  assert.match(m.join("\n"), /columnas de config de migraciones no admitidas: admision_global/);
});

test("up-down-up.mjs: rechaza el estado actual (011–022)", () => {
  const m = frenoUpDownUp(estadoDe(HASTA(22)), ADM_UDU);
  assert.match(m.join("\n"), /decisiones/);
  assert.match(m.join("\n"), /purga_config/);
});

test("up-down-up.mjs: rechaza filas que la bajada de 011 perdería, aun con 011–014 sola", () => {
  const m = frenoUpDownUp(estadoDe([11, 12, 13, 14], { filas: { participantes: 6, versiones: 2, suspensiones: 2 } }), ADM_UDU);
  assert.deepEqual(m, ["la bajada de 011 borraría filas: participantes 6, versiones 2, suspensiones 2"]);
});

test("up-down-up.mjs: rechaza config cambiada (la bajada la vuelve a los defaults)", () => {
  const m = frenoUpDownUp(estadoDe([11, 12, 13, 14], { config: { modulo_activo: true, limite_resenas: 7 } }), ADM_UDU);
  assert.deepEqual(m, ["config tiene valores que la bajada perdería: modulo_activo, limite_resenas"]);
});

test("up-down-up.mjs: rechaza un trigger ajeno sobre comunidad (p. ej. el registro del recorrido)", () => {
  const m = frenoUpDownUp(estadoDe([11, 12, 13, 14], { triggers: ["recorrido_e9a_participante"] }), ADM_UDU);
  assert.deepEqual(m, ["triggers no admitidos sobre comunidad: recorrido_e9a_participante"]);
});

test("up-down-up-020.mjs: admite 011–019 y 011–020 sin meses consolidados", () => {
  assert.deepEqual(frenoUpDownUp020(estadoDe(HASTA(19)), ADM_020), []);
  assert.deepEqual(frenoUpDownUp020(estadoDe(HASTA(20)), ADM_020), []);
});

test("up-down-up-020.mjs: rechaza 021 (reaplicar 020 pisaría sus protecciones) y el estado actual", () => {
  for (const e of [estadoDe(HASTA(21)), estadoDe(HASTA(22))]) {
    const m = frenoUpDownUp020(e, ADM_020).join("\n");
    assert.match(m, /meses_sin_historial, purga_config, purga_ejecuciones/);
    assert.match(m, /comunidad\.purgar|\(\+\d+\)/);
  }
});

test("up-down-up-020.mjs: rechaza meses consolidados y la falta de esquema", () => {
  assert.deepEqual(frenoUpDownUp020(estadoDe(HASTA(20), { filas: { top_meses: 1, top_resultados: 3 } }), ADM_020),
    ["la bajada de 020 borraría 1 fila(s) de top_meses", "la bajada de 020 borraría 3 fila(s) de top_resultados"]);
  assert.equal(frenoUpDownUp020(SIN_ESQUEMA, ADM_020).length, 1);
});

/** Corre el arnés REAL con el local.mjs falso; devuelve el código y las llamadas anotadas. */
function correr(arnes, estado) {
  const dir = mkdtempSync(join(tmpdir(), "frenos-"));
  const log = join(dir, "llamadas.log");
  const r = spawnSync(process.execPath, ["--import", "./scripts/comunidad/frenos-arneses.gancho.mjs", `scripts/comunidad/${arnes}`], {
    encoding: "utf8",
    env: { ...process.env, FRENO_ESTADO: JSON.stringify(estado), FRENO_LOG: log, FRENO_GANCHO_HILO: "",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_ANON_KEY: "falsa" },
  });
  let llamadas = [];
  try { llamadas = readFileSync(log, "utf8").split("\n").filter(Boolean); } catch { /* sin llamadas */ }
  return { status: r.status, stderr: r.stderr, llamadas };
}

const RECHAZOS = [
  ["up-down-up.mjs", "estado actual 011–022", estadoDe(HASTA(22))],
  ["up-down-up.mjs", "015 sin 016", estadoDe([11, 12, 13, 14, 15])],
  ["up-down-up.mjs", "011–014 con filas", estadoDe([11, 12, 13, 14], { filas: { participantes: 6 } })],
  ["up-down-up-020.mjs", "estado actual 011–022", estadoDe(HASTA(22))],
  ["up-down-up-020.mjs", "021 aplicada", estadoDe(HASTA(21))],
  ["up-down-up-020.mjs", "011–020 con un mes consolidado", estadoDe(HASTA(20), { filas: { top_meses: 1 } })],
];
for (const [arnes, nombre, estado] of RECHAZOS) {
  test(`${arnes} real, ${nombre}: sale con 2 ANTES de la primera mutación`, () => {
    const r = correr(arnes, estado);
    assert.equal(r.status, 2, r.stderr);
    assert.deepEqual(r.llamadas, ["contenedor", "lectura-estado"], "sólo lecturas");
    assert.match(r.stderr, /no es compatible; no corre \(nada se escribió\)/);
  });
}

test("up-down-up.mjs real, estado compatible: el freno deja pasar y la primera mutación viene DESPUÉS de leer el estado", () => {
  const r = correr("up-down-up.mjs", estadoDe([11, 12, 13, 14]));
  assert.notEqual(r.status, 2, r.stderr);
  assert.deepEqual(r.llamadas.slice(0, 3), ["contenedor", "lectura-estado", "MUTACION aplicarArchivo supabase/migrations/011_comunidad_esquema.sql"]);
});

test("up-down-up-020.mjs real, estado compatible: la primera mutación (reaplicar 020) viene DESPUÉS del freno", () => {
  const r = correr("up-down-up-020.mjs", estadoDe(HASTA(20)));
  assert.notEqual(r.status, 2, r.stderr);
  assert.deepEqual(r.llamadas.slice(0, 3), ["contenedor", "lectura-estado", "MUTACION aplicarArchivo supabase/migrations/020_comunidad_top.sql"]);
});
