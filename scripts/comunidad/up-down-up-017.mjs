#!/usr/bin/env node
// up → down → up de 017 (E5a) SOLA, en la base LOCAL, con comparación de
// `pg_dump --schema-only`. SÓLO LOCAL. Mismo criterio que up-down-up-016.mjs:
// bajar 011 borraría el esquema `comunidad` de la base compartida.
//
// Uso:
//   node --env-file=.env.comunidad-local scripts/comunidad/up-down-up-017.mjs
//
// Qué fija:
//   - 017_down deja la base como con 016: lo que AGREGA es sólo la lectura
//     provisional de 015 (copia literal) y no deja nada de 017;
//   - up → down → up dan los mismos volcados, y repetirlas es inocuo;
//   - los datos ajenos a 017 quedan iguales (017 no toca datos).
// Deja la base con 017 aplicada.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { aplicarArchivo, arnes, contenedor, docker, sqlOk, urlLocal } from "./local.mjs";

urlLocal(process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log(`base: ${contenedor()}\n`);
const UP = "supabase/migrations/017_comunidad_lectura.sql";
const DOWN = "supabase/migrations/017_comunidad_lectura_down.sql";

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

await prueba("017 aplicada: la lectura protegida existe y la provisional no", () => {
  aplicarArchivo(UP);
  assert.equal(sqlOk("select count(*) from pg_proc where proname in ('comunidad_resenas', 'comunidad_modulo_activo', 'item_lectura')"), "3");
  assert.equal(sqlOk("select count(*) from pg_proc where proname = 'comunidad_leer_titulo'"), "0");
  v.datos = datosAjenos();
  v.con = volcar("1-con-017");
});

await prueba("017_down: quita todo lo de 017 y sólo restaura la lectura provisional de 015, con sus permisos", () => {
  aplicarArchivo(DOWN);
  v.sin = volcar("2-sin-017");
  assert.equal(sqlOk("select count(*) from pg_proc where proname in ('comunidad_resenas', 'comunidad_modulo_activo', 'item_lectura')"), "0");
  assert.equal(sqlOk("select count(*) from pg_indexes where schemaname = 'comunidad' and indexname = 'resenas_recientes'"), "0");
  assert.equal(sqlOk(`select has_function_privilege('service_role', 'public.comunidad_leer_titulo(uuid, text, integer)', 'EXECUTE')::text
    || has_function_privilege('authenticated', 'public.comunidad_leer_titulo(uuid, text, integer)', 'EXECUTE')::text
    || has_function_privilege('anon', 'public.comunidad_leer_titulo(uuid, text, integer)', 'EXECUTE')::text`), "truefalsefalse");
  const cuenta = (t) => t.split("\n").map((l) => l.replace(/,$/, "")).reduce((m, l) => m.set(l, (m.get(l) ?? 0) + 1), new Map());
  const a = cuenta(v.con), d = cuenta(v.sin);
  const previas = new Set(readFileSync("supabase/migrations/015_comunidad_moderacion_datos.sql", "utf8").replace(/\r\n/g, "\n").split("\n").map((l) => l.trim().replace(/,$/, "")));
  const agregadas = [...d].filter(([l, n]) => n > (a.get(l) ?? 0)).map(([l]) => l).filter((l) => l.trim() !== "");
  // La función restaurada es NUEVA en el volcado (en 016 existía): pg_dump le
  // agrega su cabecera, su dueño y su ACL, que no son texto literal de 015. Se
  // aceptan SÓLO esas líneas y sólo para comunidad_leer_titulo; su cuerpo sí
  // tiene que ser el de 015.
  const META = /^(-- Name: (FUNCTION )?comunidad_leer_titulo\(|CREATE FUNCTION public\.comunidad_leer_titulo\(|ALTER FUNCTION public\.comunidad_leer_titulo\(.*OWNER TO postgres;$|REVOKE ALL ON FUNCTION public\.comunidad_leer_titulo\(.*FROM PUBLIC;$|GRANT ALL ON FUNCTION public\.comunidad_leer_titulo\(.*TO service_role;$)/;
  const ajenas = agregadas.filter((l) => !previas.has(l.trim().replace(/,$/, "")) && !previas.has(l.trim()) && !META.test(l.trim()));
  assert.deepEqual(ajenas, [], `017_down agregó algo que no es de 015: ${JSON.stringify(ajenas.slice(0, 8))}`);
  assert.equal(agregadas.filter((l) => META.test(l.trim())).length, 6, "cabecera, CREATE, dueño, ACL: las seis de la función restaurada");
  assert.equal(datosAjenos(), v.datos, "los datos ajenos a 017 no cambian");
});

await prueba("017_down repetida: inocua", () => {
  aplicarArchivo(DOWN);
  iguales(volcar("3-sin-017-otra-vez"), v.sin, "repetir 017_down cambió algo");
});

await prueba("017 up: vuelve exactamente al volcado con 017; repetida, inocua", () => {
  aplicarArchivo(UP);
  iguales(volcar("4-con-017"), v.con, "subir 017 no reprodujo el volcado");
  aplicarArchivo(UP);
  iguales(volcar("5-con-017-repetida"), v.con, "repetir 017 cambió el esquema");
});

await prueba("segunda vuelta down → up: mismos volcados; datos ajenos intactos", () => {
  aplicarArchivo(DOWN);
  iguales(volcar("6-sin-017"), v.sin, "la segunda bajada difiere");
  aplicarArchivo(UP);
  iguales(volcar("7-con-017"), v.con, "la segunda subida difiere");
  assert.equal(datosAjenos(), v.datos);
});

cerrar();
