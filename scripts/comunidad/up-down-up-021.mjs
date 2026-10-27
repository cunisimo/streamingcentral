#!/usr/bin/env node
// up → down → up de 021 (E8) SOLA, en la base LOCAL, con comparación de
// `pg_dump --schema-only`. SÓLO LOCAL. Mismo criterio que up-down-up-020.mjs:
// bajar 011 borraría el esquema `comunidad` de la base compartida.
//
// Uso:
//   node --env-file=.env.comunidad-local scripts/comunidad/up-down-up-021.mjs
//
// Qué fija:
//   - 021_down deja la base EXACTAMENTE como sin 021: el volcado después de
//     bajar es idéntico al de ANTES de subirla, incluidas consolidar_mes y
//     comunidad_top_yumpers, que 021 redefine y el down devuelve a 020;
//   - up → down → up dan los mismos volcados, y repetirlas es inocuo;
//   - la configuración nace con la purga APAGADA y los plazos del dueño; los
//     no definidos (huellas) y la excepción de la baja, sin configurar;
//   - los datos ajenos a 021 quedan iguales.
// La bajada borra la configuración y el registro de ejecuciones, NO
// recupera nada purgado (no hay nada purgado: se comprueba que el registro
// esté vacío). Deja la base con 021 aplicada.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { aplicarArchivo, arnes, contenedor, docker, sqlOk, urlLocal } from "./local.mjs";

urlLocal(process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log(`base: ${contenedor()}\n`);
const UP = "supabase/migrations/021_comunidad_purga.sql";
const DOWN = "supabase/migrations/021_comunidad_purga_down.sql";

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
  || '|' || (select count(*) from comunidad.evaluaciones) || '|' || (select count(*) from comunidad.top_meses)
  || '|' || (select count(*) from comunidad.decisiones) || '|' || (select count(*) from comunidad.intentos)`);

const { prueba, cerrar } = arnes();
const v = {};

const FUNCIONES_021 = "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'comunidad' and proname in ('mas_plazo', 'vencido', 'mes_conservado', 'historial_libre', 'par_con_memoria', 'version_protegida', 'resena_purgable', 'purga_tomar', 'purga_lote', 'purgar')";
const TABLAS_021 = "select count(*) from pg_tables where schemaname = 'comunidad' and tablename in ('purga_config', 'purga_ejecuciones')";
const DEF = (f) => `select md5(pg_get_functiondef('${f}'::regprocedure))`;

await prueba("antes: sin 021 (el volcado de partida), con 020 aplicada", () => {
  // Reentrante: si una corrida anterior la dejó aplicada (y nunca purgó nada), se baja primero.
  if (sqlOk(TABLAS_021) !== "0") {
    assert.equal(sqlOk("select count(*) from comunidad.purga_ejecuciones"), "0", "hay ejecuciones registradas: no se baja en esta prueba");
    aplicarArchivo(DOWN);
  }
  assert.equal(sqlOk(TABLAS_021), "0");
  v.datos = datosAjenos();
  v.sin0 = volcar("0-sin-021");
  v.cons020 = sqlOk(DEF("comunidad.consolidar_mes(date)"));
  v.top020 = sqlOk(DEF("public.comunidad_top_yumpers(date)"));
});

await prueba("021 up: tablas, funciones y procedimiento; purga APAGADA; plazos del dueño; huellas y excepción sin configurar", () => {
  aplicarArchivo(UP);
  v.con = volcar("1-con-021");
  assert.equal(sqlOk(FUNCIONES_021), "10");
  assert.equal(sqlOk(TABLAS_021), "2");
  assert.equal(sqlOk(`select json_build_object('activa', purga_activa, 'intentos', plazo_intentos, 'reemplazadas', plazo_reemplazadas,
    'retiradas', plazo_retiradas, 'borradas', plazo_borradas, 'denuncias', plazo_denuncias_cerradas, 'decisiones', plazo_decisiones,
    'rankings', plazo_rankings, 'margen', margen_historial_puntos, 'huellas', plazo_huellas, 'excepcion', conservar_texto_denunciado_baja)::text
    from comunidad.purga_config`),
    '{"activa" : false, "intentos" : "7 days", "reemplazadas" : "30 days", "retiradas" : "30 days", "borradas" : "30 days", "denuncias" : "30 days", "decisiones" : "1 year", "rankings" : "1 year", "margen" : "30 days", "huellas" : null, "excepcion" : false}');
  assert.equal(sqlOk("select count(*) from comunidad.purga_ejecuciones"), "0");
  assert.notEqual(sqlOk(DEF("comunidad.consolidar_mes(date)")), v.cons020, "021 redefine consolidar_mes");
  assert.equal(datosAjenos(), v.datos, "subir 021 no toca datos");
});

await prueba("021_down: vuelve EXACTAMENTE al volcado de antes (020 restaurada) y no toca datos", () => {
  assert.equal(sqlOk("select count(*) from comunidad.purga_ejecuciones"), "0", "hay ejecuciones registradas: no se baja en esta prueba");
  aplicarArchivo(DOWN);
  v.sin = volcar("2-sin-021");
  iguales(v.sin, v.sin0, "021_down no dejó la base como antes de subirla");
  assert.equal(sqlOk(FUNCIONES_021), "0");
  assert.equal(sqlOk(TABLAS_021), "0");
  assert.equal(sqlOk(DEF("comunidad.consolidar_mes(date)")), v.cons020);
  assert.equal(sqlOk(DEF("public.comunidad_top_yumpers(date)")), v.top020);
  assert.equal(datosAjenos(), v.datos, "los datos ajenos a 021 no cambian");
});

await prueba("021_down repetida: inocua", () => {
  aplicarArchivo(DOWN);
  iguales(volcar("3-sin-021-otra-vez"), v.sin0, "repetir 021_down cambió algo");
});

await prueba("021 up: vuelve exactamente al volcado con 021; repetida, inocua", () => {
  aplicarArchivo(UP);
  iguales(volcar("4-con-021"), v.con, "subir 021 no reprodujo el volcado");
  aplicarArchivo(UP);
  iguales(volcar("5-con-021-repetida"), v.con, "repetir 021 cambió el esquema");
});

await prueba("segunda vuelta down → up: mismos volcados; datos ajenos intactos", () => {
  aplicarArchivo(DOWN);
  iguales(volcar("6-sin-021"), v.sin0, "la segunda bajada difiere");
  aplicarArchivo(UP);
  iguales(volcar("7-con-021"), v.con, "la segunda subida difiere");
  assert.equal(datosAjenos(), v.datos);
});

cerrar();
