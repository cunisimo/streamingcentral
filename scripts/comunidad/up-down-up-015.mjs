#!/usr/bin/env node
// up → down → up de 015 (E3b) SOLA, en la base LOCAL, con comparación de
// `pg_dump --schema-only`. SÓLO LOCAL.
//
// Por qué aparte de up-down-up.mjs: aquella baja 011 y con ella el esquema
// `comunidad` entero, y la base local es COMPARTIDA (fixtures y cuentas de
// otras pruebas). Ésta sólo mueve 015, que crea tablas propias (huellas,
// excedentes, corroboraciones), agrega columnas a config y bloqueos, y
// redefine funciones de 013 y 014. Antes de bajarla comprueba que esas tablas
// y columnas no tengan datos que se perderían.
//
// Uso:
//   node --env-file=.env.comunidad-local scripts/comunidad/up-down-up-015.mjs
//
// Qué fija:
//   - 015_down deja la base como con 014: las líneas que AGREGA son sólo de
//     las definiciones de 013 y 014 que restaura, y no deja nada de 015;
//   - up → down → up dan los mismos volcados, y repetirlas es inocuo;
//   - los datos ajenos a 015 (reseñas, versiones, participantes, la config
//     con sus interruptores) quedan iguales.
// Deja la base con 015 aplicada.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { aplicarArchivo, arnes, contenedor, docker, sqlOk, urlLocal } from "./local.mjs";

urlLocal(process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log(`base: ${contenedor()}\n`);
const UP = "supabase/migrations/015_comunidad_moderacion_datos.sql";
const DOWN = "supabase/migrations/015_comunidad_moderacion_datos_down.sql";

function volcar(nombre) {
  const r = docker(["exec", contenedor(), "pg_dump", "-U", "postgres", "-d", "postgres", "--schema-only"],
    { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`pg_dump: ${r.stderr}`);
  const texto = r.stdout.split("\n").filter((l) => !/^\\(un)?restrict /.test(l)).join("\n");
  console.log(`   volcado ${nombre}: ${texto.split("\n").length} líneas, sha256 ${createHash("sha256").update(texto).digest("hex").slice(0, 16)}…`);
  return texto;
}
function diferencias(a, b) {
  const la = a.split("\n"), lb = b.split("\n");
  const out = [];
  for (let i = 0; i < Math.max(la.length, lb.length) && out.length < 6; i++) {
    if (la[i] !== lb[i]) out.push(`línea ${i + 1}: «${la[i] ?? "∅"}» ≠ «${lb[i] ?? "∅"}»`);
  }
  return out.join("\n");
}
const iguales = (a, b, msg) => assert.ok(a === b, `${msg}\n${diferencias(a, b)}`);
const datosAjenos = () => sqlOk(`select (select count(*) from comunidad.resenas) || '|' || (select count(*) from comunidad.versiones)
  || '|' || (select count(*) from comunidad.participantes) || '|' || (select count(*) from comunidad.denuncias)
  || '|' || (select count(*) from comunidad.bloqueos) || '|' || (select modulo_activo || '/' || publicacion_activa || '/' || top_yumpers_activo
  || '/' || limite_resenas || '/' || limite_ediciones || '/' || limite_evaluaciones from comunidad.config)`);

const { prueba, cerrar } = arnes();
const v = {};

await prueba("015 aplicada y sin datos que la bajada perdería (huellas, excedentes, corroboraciones, bloqueos con origen, límites de E3b por defecto)", () => {
  aplicarArchivo(UP);
  assert.equal(sqlOk(`select (select count(*) from comunidad.huellas) + (select count(*) from comunidad.denuncias_excedentes)
    + (select count(*) from comunidad.corroboraciones) + (select count(*) from comunidad.bloqueos where origen_tipo is not null)`), "0");
  assert.equal(sqlOk("select admision_por_autor || '/' || admision_global || '/' || denuncias_filas_por_version || '/' || denuncias_por_hora from comunidad.config"), "2/50/50/100");
  v.datos = datosAjenos();
  v.con = volcar("1-con-015");
});

await prueba("015_down: quita todo lo de 015 y sólo restaura definiciones de 013 y 014", () => {
  aplicarArchivo(DOWN);
  v.sin = volcar("2-sin-015");
  assert.equal(sqlOk(`select count(*) from pg_proc where proname in ('comunidad_denunciar', 'comunidad_retener_por_regla', 'comunidad_bloquear',
    'comunidad_desbloquear', 'comunidad_bloqueados', 'proto_huella', 'proto_cola', 'duplicado', 'admision', 'retenidos_sin_resolver',
    'huella_valida', 'shingles_forma', 'reglas_texto', 'cola_denuncias')`), "0");
  assert.equal(sqlOk("select count(*) from pg_tables where schemaname = 'comunidad' and tablename in ('huellas', 'denuncias_excedentes', 'corroboraciones')"), "0");
  assert.equal(sqlOk(`select count(*) from information_schema.columns where table_schema = 'comunidad' and (
    (table_name = 'config' and column_name in ('admision_por_autor', 'admision_global', 'denuncias_filas_por_version', 'denuncias_por_hora'))
    or (table_name = 'bloqueos' and column_name in ('id', 'origen_tipo', 'origen_tmdb_id')))`), "0");
  const cuenta = (t) => t.split("\n").map((l) => l.replace(/,$/, "")).reduce((m, l) => m.set(l, (m.get(l) ?? 0) + 1), new Map());
  const a = cuenta(v.con), d = cuenta(v.sin);
  const previas = new Set(["013_comunidad_protocolo.sql", "014_comunidad_escritura.sql"]
    .flatMap((f) => readFileSync(`supabase/migrations/${f}`, "utf8").replace(/\r\n/g, "\n").split("\n").map((l) => l.trim().replace(/,$/, ""))));
  const agregadas = [...d].filter(([l, n]) => n > (a.get(l) ?? 0)).map(([l]) => l).filter((l) => l.trim() !== "");
  const ajenas = agregadas.filter((l) => !previas.has(l.trim().replace(/,$/, "")) && !previas.has(l.trim()));
  assert.deepEqual(ajenas, [], `015_down agregó algo que no es de 013/014: ${JSON.stringify(ajenas.slice(0, 8))}`);
  assert.equal(datosAjenos(), v.datos, "los datos ajenos a 015 no cambian");
});

await prueba("015_down repetida: inocua", () => {
  aplicarArchivo(DOWN);
  iguales(volcar("3-sin-015-otra-vez"), v.sin, "repetir 015_down cambió algo");
});

await prueba("015 up: vuelve exactamente al volcado con 015; repetida, inocua", () => {
  aplicarArchivo(UP);
  iguales(volcar("4-con-015"), v.con, "subir 015 no reprodujo el volcado");
  aplicarArchivo(UP);
  iguales(volcar("5-con-015-repetida"), v.con, "repetir 015 cambió el esquema");
});

await prueba("segunda vuelta down → up: mismos volcados; datos ajenos intactos", () => {
  aplicarArchivo(DOWN);
  iguales(volcar("6-sin-015"), v.sin, "la segunda bajada difiere");
  aplicarArchivo(UP);
  iguales(volcar("7-con-015"), v.con, "la segunda subida difiere");
  assert.equal(datosAjenos(), v.datos);
});

cerrar();
