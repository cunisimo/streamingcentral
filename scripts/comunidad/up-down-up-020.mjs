#!/usr/bin/env node
// up → down → up de 020 (E7) SOLA, en la base LOCAL, con comparación de
// `pg_dump --schema-only`. SÓLO LOCAL. Mismo criterio que up-down-up-019.mjs:
// bajar 011 borraría el esquema `comunidad` de la base compartida.
//
// Uso:
//   node --env-file=.env.comunidad-local scripts/comunidad/up-down-up-020.mjs
//
// Qué fija:
//   - 020_down deja la base EXACTAMENTE como sin 020 (el volcado sin 020 es el
//     mismo antes de subirla y después de bajarla): no restaura nada porque no
//     redefine nada anterior;
//   - up → down → up dan los mismos volcados, y repetirlas es inocuo;
//   - los datos ajenos a 020 (tramos, votos, suspensiones, participantes)
//     quedan iguales.
// Antes de bajar comprueba que no haya meses consolidados (la bajada los
// borra; son derivados de los tramos). Deja la base con 020 aplicada.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { aplicarArchivo, arnes, contenedor, docker, sqlOk, urlLocal } from "./local.mjs";

urlLocal(process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log(`base: ${contenedor()}\n`);
const UP = "supabase/migrations/020_comunidad_top.sql";
const DOWN = "supabase/migrations/020_comunidad_top_down.sql";

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
  || '|' || (select modulo_activo || '/' || publicacion_activa || '/' || top_yumpers_activo || '/' || admision_global from comunidad.config)
  || '|' || (select count(*) || '/' || coalesce(md5(string_agg(id || ':' || coalesce(nombre_comunitario, ''), ',' order by id)), '') from comunidad.participantes)
  || '|' || (select count(*) from comunidad.ordenes_utiles)
  || '|' || (select count(*) || '/' || count(*) filter (where vigente_hasta is null) from comunidad.tramos)
  || '|' || (select count(*) from comunidad.evaluaciones)`);

const { prueba, cerrar } = arnes();
const v = {};

const FUNCIONES_020 = "select count(*) from pg_proc where proname in ('puntos_al_corte', 'consolidar_mes', 'comunidad_top_yumpers', 'comunidad_top_yumpers_activo')";
const TABLAS_020 = "select count(*) from pg_tables where schemaname = 'comunidad' and tablename in ('top_meses', 'top_resultados')";

await prueba("020 aplicada, sin meses consolidados que la bajada perdería", () => {
  aplicarArchivo(UP);
  assert.equal(sqlOk("select count(*) from comunidad.top_meses"), "0");
  assert.equal(sqlOk(FUNCIONES_020), "4");
  assert.equal(sqlOk(TABLAS_020), "2");
  v.datos = datosAjenos();
  v.con = volcar("1-con-020");
});

await prueba("020_down: quita todo lo de 020 y no agrega nada", () => {
  aplicarArchivo(DOWN);
  v.sin = volcar("2-sin-020");
  assert.equal(sqlOk(FUNCIONES_020), "0");
  assert.equal(sqlOk(TABLAS_020), "0");
  const cuenta = (t) => t.split("\n").reduce((m, l) => m.set(l, (m.get(l) ?? 0) + 1), new Map());
  const a = cuenta(v.con), d = cuenta(v.sin);
  const agregadas = [...d].filter(([l, n]) => n > (a.get(l) ?? 0)).map(([l]) => l).filter((l) => l.trim() !== "");
  assert.deepEqual(agregadas, [], `020_down agregó algo: ${JSON.stringify(agregadas.slice(0, 8))}`);
  assert.equal(datosAjenos(), v.datos, "los datos ajenos a 020 no cambian");
});

await prueba("020_down repetida: inocua", () => {
  aplicarArchivo(DOWN);
  iguales(volcar("3-sin-020-otra-vez"), v.sin, "repetir 020_down cambió algo");
});

await prueba("020 up: vuelve exactamente al volcado con 020; repetida, inocua", () => {
  aplicarArchivo(UP);
  iguales(volcar("4-con-020"), v.con, "subir 020 no reprodujo el volcado");
  aplicarArchivo(UP);
  iguales(volcar("5-con-020-repetida"), v.con, "repetir 020 cambió el esquema");
});

await prueba("segunda vuelta down → up: mismos volcados; datos ajenos intactos", () => {
  aplicarArchivo(DOWN);
  iguales(volcar("6-sin-020"), v.sin, "la segunda bajada difiere");
  aplicarArchivo(UP);
  iguales(volcar("7-con-020"), v.con, "la segunda subida difiere");
  assert.equal(datosAjenos(), v.datos);
});

cerrar();
