#!/usr/bin/env node
// up → down → up de 019 (E6) SOLA, en la base LOCAL, con comparación de
// `pg_dump --schema-only`. SÓLO LOCAL. Mismo criterio que up-down-up-018.mjs:
// bajar 011 borraría el esquema `comunidad` de la base compartida.
//
// Uso:
//   node --env-file=.env.comunidad-local scripts/comunidad/up-down-up-019.mjs
//
// Qué fija:
//   - 019_down deja la base como con 018: lo que AGREGA es sólo el
//     `item_lectura` de 017 (copia literal) y el CHECK de acciones de
//     `intentos` de 014, y no deja nada de 019 (perfil, cambio de nombre,
//     avatar público, la acción 'nombre');
//   - 019 no deja la firma anterior del cambio de nombre como sobrecarga;
//   - up → down → up dan los mismos volcados, y repetirlas es inocuo;
//   - los datos ajenos a 019, los nombres comunitarios incluidos, quedan
//     iguales (019 no tiene tablas ni datos propios).
// Deja la base con 019 aplicada.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { aplicarArchivo, arnes, contenedor, docker, sqlOk, urlLocal } from "./local.mjs";

urlLocal(process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log(`base: ${contenedor()}\n`);
const UP = "supabase/migrations/019_comunidad_perfiles.sql";
const DOWN = "supabase/migrations/019_comunidad_perfiles_down.sql";

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
  || '|' || (select count(*) from comunidad.ordenes_utiles)`);

const { prueba, cerrar } = arnes();
const v = {};

const FUNCIONES_019 = "select count(*) from pg_proc where proname in ('comunidad_perfil', 'comunidad_cambiar_nombre', 'avatar_publico')";
const AUTOR = "select (pg_get_functiondef('comunidad.item_lectura(comunidad.resenas, comunidad.versiones, uuid)'::regprocedure) like '%''autor''%')::text";

const ACCIONES = "select pg_get_constraintdef(oid) from pg_constraint where conname = 'intentos_accion_check' and conrelid = 'comunidad.intentos'::regclass";
// La única línea del volcado ajena a 017 que 019_down puede agregar: el CHECK de 014.
const CHECK_014 = /^\s*CONSTRAINT intentos_accion_check CHECK \(\(accion = ANY \(ARRAY\['publicar'::text, 'editar'::text\]\)\)\)$/;

await prueba("019 aplicada (también sobre la versión de 8cbe0cd): una sola firma del cambio de nombre y la acción 'nombre' en intentos", () => {
  aplicarArchivo(UP);
  assert.equal(sqlOk(FUNCIONES_019), "3");
  assert.equal(sqlOk("select string_agg(pg_get_function_identity_arguments(oid), ' / ') from pg_proc where proname = 'comunidad_cambiar_nombre'"),
    "p_uid uuid, p_nombre text, p_decision jsonb, p_id_intento uuid, p_hash text");
  assert.match(sqlOk(ACCIONES), /'nombre'/);
  assert.equal(sqlOk(AUTOR), "true");
  v.datos = datosAjenos();
  v.con = volcar("1-con-019");
});

await prueba("019_down: quita todo lo de 019 y sólo restaura item_lectura de 017 (sin el autor)", () => {
  aplicarArchivo(DOWN);
  v.sin = volcar("2-sin-019");
  assert.equal(sqlOk(FUNCIONES_019), "0");
  assert.equal(sqlOk(AUTOR), "false");
  assert.equal(sqlOk(`select has_function_privilege('authenticated', 'public.comunidad_resenas(text, integer, text, jsonb, integer)', 'EXECUTE')::text`), "true",
    "la lectura de 018 sigue intacta");
  const cuenta = (t) => t.split("\n").map((l) => l.replace(/,$/, "")).reduce((m, l) => m.set(l, (m.get(l) ?? 0) + 1), new Map());
  const a = cuenta(v.con), d = cuenta(v.sin);
  const previas = new Set(readFileSync("supabase/migrations/017_comunidad_lectura.sql", "utf8").replace(/\r\n/g, "\n").split("\n").map((l) => l.trim().replace(/,$/, "")));
  const agregadas = [...d].filter(([l, n]) => n > (a.get(l) ?? 0)).map(([l]) => l).filter((l) => l.trim() !== "");
  const ajenas = agregadas.filter((l) => !previas.has(l.trim().replace(/,$/, "")) && !previas.has(l.trim()) && !CHECK_014.test(l));
  assert.doesNotMatch(sqlOk(ACCIONES), /'nombre'/, "el CHECK vuelve al de 014");
  assert.deepEqual(ajenas, [], `019_down agregó algo que no es de 017: ${JSON.stringify(ajenas.slice(0, 8))}`);
  assert.equal(datosAjenos(), v.datos, "los datos ajenos a 019 no cambian");
});

await prueba("019_down repetida: inocua", () => {
  aplicarArchivo(DOWN);
  iguales(volcar("3-sin-019-otra-vez"), v.sin, "repetir 019_down cambió algo");
});

await prueba("019 up: vuelve exactamente al volcado con 019; repetida, inocua", () => {
  aplicarArchivo(UP);
  iguales(volcar("4-con-019"), v.con, "subir 019 no reprodujo el volcado");
  aplicarArchivo(UP);
  iguales(volcar("5-con-019-repetida"), v.con, "repetir 019 cambió el esquema");
});

await prueba("segunda vuelta down → up: mismos volcados; datos ajenos intactos", () => {
  aplicarArchivo(DOWN);
  iguales(volcar("6-sin-019"), v.sin, "la segunda bajada difiere");
  aplicarArchivo(UP);
  iguales(volcar("7-con-019"), v.con, "la segunda subida difiere");
  assert.equal(datosAjenos(), v.datos);
});

cerrar();
