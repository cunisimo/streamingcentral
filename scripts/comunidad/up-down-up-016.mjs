#!/usr/bin/env node
// up → down → up de 016 (E4) SOLA, en la base LOCAL, con comparación de
// `pg_dump --schema-only`. SÓLO LOCAL. Mismo criterio que up-down-up-015.mjs:
// bajar 011 borraría el esquema `comunidad` de la base compartida.
//
// Uso:
//   node --env-file=.env.comunidad-local scripts/comunidad/up-down-up-016.mjs
//
// Qué fija:
//   - 016_down deja la base como con 015: las líneas que AGREGA son sólo de
//     las definiciones de 011, 012 y 015 que restaura, y no deja nada de 016;
//   - up → down → up dan los mismos volcados, y repetirlas es inocuo;
//   - los datos ajenos a 016 quedan iguales.
// Antes de bajar comprueba que el registro de decisiones y el historial de
// denuncias estén vacíos (la bajada los borra). Deja la base con 016 aplicada.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { aplicarArchivo, arnes, contenedor, docker, sqlOk, urlLocal } from "./local.mjs";

urlLocal(process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log(`base: ${contenedor()}\n`);
const UP = "supabase/migrations/016_comunidad_admin.sql";
const DOWN = "supabase/migrations/016_comunidad_admin_down.sql";

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
  || '|' || (select count(*) from comunidad.suspensiones) || '|' || (select count(*) from comunidad.bajas_en_curso)
  || '|' || (select modulo_activo || '/' || publicacion_activa || '/' || top_yumpers_activo || '/' || admision_global from comunidad.config)`);

const { prueba, cerrar } = arnes();
const v = {};

await prueba("016 aplicada, sin decisiones ni historial de denuncias que la bajada perdería, muestreo apagado", () => {
  aplicarArchivo(UP);
  assert.equal(sqlOk("select (select count(*) from comunidad.decisiones) + (select count(*) from comunidad.denuncias_cerradas)"), "0");
  assert.equal(sqlOk("select muestreo_activo::text from comunidad.config"), "false");
  v.datos = datosAjenos();
  v.con = volcar("1-con-016");
});

await prueba("016_down: quita todo lo de 016 y sólo restaura definiciones de 011, 012 y 015", () => {
  aplicarArchivo(DOWN);
  v.sin = volcar("2-sin-016");
  assert.equal(sqlOk(`select count(*) from pg_proc where proname like 'comunidad\\_admin\\_%' or proname in ('comunidad_quitar_marcador_baja',
    'exigir_admin', 'proto_admin', 'motivo_valido', 'decision_previa', 'antecedentes', 'situacion', 'reabrir_tramos', 'registrar')`), "0");
  assert.equal(sqlOk("select count(*) from pg_tables where schemaname = 'comunidad' and tablename in ('decisiones', 'denuncias_cerradas')"), "0");
  assert.equal(sqlOk("select count(*) from information_schema.columns where table_schema = 'comunidad' and table_name = 'config' and column_name = 'muestreo_activo'"), "0");
  const cuenta = (t) => t.split("\n").map((l) => l.replace(/,$/, "")).reduce((m, l) => m.set(l, (m.get(l) ?? 0) + 1), new Map());
  const a = cuenta(v.con), d = cuenta(v.sin);
  const previas = new Set(["011_comunidad_esquema.sql", "012_comunidad_baja.sql", "015_comunidad_moderacion_datos.sql"]
    .flatMap((f) => readFileSync(`supabase/migrations/${f}`, "utf8").replace(/\r\n/g, "\n").split("\n").map((l) => l.trim().replace(/,$/, ""))));
  const agregadas = [...d].filter(([l, n]) => n > (a.get(l) ?? 0)).map(([l]) => l).filter((l) => l.trim() !== "");
  const ajenas = agregadas.filter((l) => !previas.has(l.trim().replace(/,$/, "")) && !previas.has(l.trim()));
  assert.deepEqual(ajenas, [], `016_down agregó algo que no es de 011/012/015: ${JSON.stringify(ajenas.slice(0, 8))}`);
  assert.equal(datosAjenos(), v.datos, "los datos ajenos a 016 no cambian");
});

await prueba("016_down repetida: inocua", () => {
  aplicarArchivo(DOWN);
  iguales(volcar("3-sin-016-otra-vez"), v.sin, "repetir 016_down cambió algo");
});

await prueba("016 up: vuelve exactamente al volcado con 016; repetida, inocua", () => {
  aplicarArchivo(UP);
  iguales(volcar("4-con-016"), v.con, "subir 016 no reprodujo el volcado");
  aplicarArchivo(UP);
  iguales(volcar("5-con-016-repetida"), v.con, "repetir 016 cambió el esquema");
});

await prueba("segunda vuelta down → up: mismos volcados; datos ajenos intactos", () => {
  aplicarArchivo(DOWN);
  iguales(volcar("6-sin-016"), v.sin, "la segunda bajada difiere");
  aplicarArchivo(UP);
  iguales(volcar("7-con-016"), v.con, "la segunda subida difiere");
  assert.equal(datosAjenos(), v.datos);
});

cerrar();
