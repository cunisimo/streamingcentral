#!/usr/bin/env node
// up → down → up de 018 (E5b) SOLA, en la base LOCAL, con comparación de
// `pg_dump --schema-only`. SÓLO LOCAL. Mismo criterio que up-down-up-017.mjs:
// bajar 011 borraría el esquema `comunidad` de la base compartida.
//
// Uso:
//   node --env-file=.env.comunidad-local scripts/comunidad/up-down-up-018.mjs
//
// Qué fija:
//   - 018_down deja la base como con 017: lo que AGREGA es sólo la lectura de
//     017 (copia literal) y no deja nada de 018 (tablas del orden, Wilson);
//   - up → down → up dan los mismos volcados, y repetirlas es inocuo;
//   - los datos ajenos a 018 quedan iguales.
// Antes de bajar comprueba que no haya órdenes congelados (la bajada los
// borra; son derivados). Deja la base con 018 aplicada.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { aplicarArchivo, arnes, contenedor, docker, sqlOk, urlLocal } from "./local.mjs";

urlLocal(process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log(`base: ${contenedor()}\n`);
const UP = "supabase/migrations/018_comunidad_utilidad.sql";
const DOWN = "supabase/migrations/018_comunidad_utilidad_down.sql";

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

await prueba("018 aplicada, sin órdenes congelados que la bajada perdería", () => {
  aplicarArchivo(UP);
  assert.equal(sqlOk("select count(*) from comunidad.ordenes_utiles"), "0");
  assert.equal(sqlOk("select count(*) from pg_proc where proname in ('wilson', 'orden_utiles')"), "2");
  v.datos = datosAjenos();
  v.con = volcar("1-con-018");
});

await prueba("018_down: quita todo lo de 018 y sólo restaura la lectura de 017 (con sus permisos)", () => {
  aplicarArchivo(DOWN);
  v.sin = volcar("2-sin-018");
  assert.equal(sqlOk("select count(*) from pg_proc where proname in ('wilson', 'orden_utiles')"), "0");
  assert.equal(sqlOk("select count(*) from pg_tables where schemaname = 'comunidad' and tablename like 'ordenes_utiles%'"), "0");
  assert.equal(sqlOk(`select has_function_privilege('authenticated', 'public.comunidad_resenas(text, integer, text, jsonb, integer)', 'EXECUTE')::text
    || has_function_privilege('anon', 'public.comunidad_resenas(text, integer, text, jsonb, integer)', 'EXECUTE')::text
    || has_function_privilege('service_role', 'public.comunidad_resenas(text, integer, text, jsonb, integer)', 'EXECUTE')::text`), "truefalsefalse");
  const cuenta = (t) => t.split("\n").map((l) => l.replace(/,$/, "")).reduce((m, l) => m.set(l, (m.get(l) ?? 0) + 1), new Map());
  const a = cuenta(v.con), d = cuenta(v.sin);
  const previas = new Set(readFileSync("supabase/migrations/017_comunidad_lectura.sql", "utf8").replace(/\r\n/g, "\n").split("\n").map((l) => l.trim().replace(/,$/, "")));
  const agregadas = [...d].filter(([l, n]) => n > (a.get(l) ?? 0)).map(([l]) => l).filter((l) => l.trim() !== "");
  // pg_dump escribe los atributos de la función en su propia línea: la de 017
  // es STABLE (018 la vuelve VOLATILE porque genera el orden). Es la única
  // línea de formato del volcado que se acepta; el cuerpo tiene que ser el de 017.
  const ATRIBUTOS_017 = "    LANGUAGE plpgsql STABLE SECURITY DEFINER";
  const ajenas = agregadas.filter((l) => !previas.has(l.trim().replace(/,$/, "")) && !previas.has(l.trim()) && l !== ATRIBUTOS_017);
  assert.deepEqual(ajenas, [], `018_down agregó algo que no es de 017: ${JSON.stringify(ajenas.slice(0, 8))}`);
  assert.ok(agregadas.includes(ATRIBUTOS_017), "la restaurada vuelve a ser STABLE, como en 017");
  assert.equal(datosAjenos(), v.datos, "los datos ajenos a 018 no cambian");
});

await prueba("018_down repetida: inocua", () => {
  aplicarArchivo(DOWN);
  iguales(volcar("3-sin-018-otra-vez"), v.sin, "repetir 018_down cambió algo");
});

await prueba("018 up: vuelve exactamente al volcado con 018; repetida, inocua", () => {
  aplicarArchivo(UP);
  iguales(volcar("4-con-018"), v.con, "subir 018 no reprodujo el volcado");
  aplicarArchivo(UP);
  iguales(volcar("5-con-018-repetida"), v.con, "repetir 018 cambió el esquema");
});

await prueba("segunda vuelta down → up: mismos volcados; datos ajenos intactos", () => {
  aplicarArchivo(DOWN);
  iguales(volcar("6-sin-018"), v.sin, "la segunda bajada difiere");
  aplicarArchivo(UP);
  iguales(volcar("7-con-018"), v.con, "la segunda subida difiere");
  assert.equal(datosAjenos(), v.datos);
});

cerrar();
