#!/usr/bin/env node
// Aislamiento de la limpieza del recorrido E9a (auditoría E9a, A1), en la base
// LOCAL compartida, con datos ficticios propios. No baja migraciones.
//
//   node --env-file=.env.comunidad-local scripts/comunidad/pruebas-recorrido-e9a.mjs
//
// Qué fija, corriendo el `recorrido-e9a.mjs` real en procesos aparte:
//   - una preparación interrumpida se limpia entera y sin tocar nada ajeno;
//   - durante un recorrido, una identidad AJENA dada de baja (participante
//     sin cuenta, con filas residuales) y un ranking AJENO (agosto) sobreviven
//     a la limpieza;
//   - lo propio sí se limpia: las cuentas de `preparar`, una cuenta registrada
//     "a mano" (signUp, como la UI) y otra dada de baja, con su participante
//     desvinculado, y el ranking de septiembre que se consolidó con datos
//     propios;
//   - cortar la limpieza en dos puntos conserva el archivo y el registro, no
//     informa éxito, y el reintento usa los mismos objetivos (un participante
//     ajeno creado entre intentos no entra);
//   - sin archivo de estado, `limpiar` no borra nada;
//   - una discrepancia real (un voto ajeno dentro del mes propio, con el reloj
//     de otra batería) detiene la limpieza antes de borrar nada, sale con 1 y
//     conserva el archivo y el registro; resuelta, el reintento verifica.
// Al final borra sus propias fixtures ajenas (por id) y deja la base como la
// encontró.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { aplicarArchivo, arnes, contenedor, sqlOk, urlLocal } from "./local.mjs";
import { sqlBorrarComunidad, sqlBorrarParticipantes } from "./recorrido-e9a-nucleo.mjs";
import { dependenciasEscritura, operacionesComunidad } from "../../lib/comunidad/escritura-deps.ts";
import { escribirResena } from "../../lib/comunidad/escritura-nucleo.ts";
import { TERMINOS_VERSION } from "../../lib/comunidad/terminos.ts";

const URL_API = urlLocal(process.env.NEXT_PUBLIC_SUPABASE_URL), ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
console.log(`base: ${contenedor()}\n`);
const ARCHIVO = ".recorrido-e9a.local.json";
const AGOSTO = "2026-08-01", SEPTIEMBRE = "2026-09-01";
const opc = { auth: { persistSession: false, autoRefreshToken: false } };
const srv = createClient(URL_API, process.env.SUPABASE_SERVICE_ROLE_KEY, opc);
const ops = operacionesComunidad(srv), deps = dependenciasEscritura(srv);
const q = (s) => `'${String(s).replaceAll("'", "''")}'`;
const n = (sql) => Number(sqlOk(sql));
const hayRegistro = () => n("select count(*) from pg_namespace where nspname = 'recorrido_e9a'") > 0;
const leerArchivo = () => JSON.parse(readFileSync(ARCHIVO, "utf8"));

function recorrido(accion, corte) {
  const r = spawnSync(process.execPath, ["--env-file=.env.comunidad-local", "--no-warnings", "scripts/comunidad/recorrido-e9a.mjs", accion], {
    encoding: "utf8", env: { ...process.env, RECORRIDO_E9A_CORTE: corte ?? "" }, timeout: 300_000,
  });
  const salida = `${r.stdout}${r.stderr}`;
  console.log(salida.split("\n").filter((l) => l.trim() && !/^\s+at /.test(l)).map((l) => `     │ ${l}`).slice(0, 14).join("\n"));
  return { status: r.status, salida };
}

let k = 0;
const TEXTOS = [
  "Texto ficticio de la prueba de aislamiento: la vi con calma un domingo, me gustó el ritmo del final y la música me acompañó toda la noche.",
  "Otra reseña inventada para esta prueba: los diálogos me parecieron largos, pero la fotografía compensa y el reparto sostiene la historia.",
  "Reseña de mentira, sólo para probar la limpieza: tiene escenas muy logradas, aunque en la mitad pierde fuerza y después la recupera.",
];
const texto = (quien) => TEXTOS[(quien - 1) % TEXTOS.length];
async function cuenta(dominio, { viaUi = false } = {}) {
  const email = `e9a-prueba${++k}-${randomBytes(2).toString("hex")}@${dominio}`;
  const password = `Pr-${randomBytes(9).toString("base64url")}`;
  let uid;
  if (viaUi) {
    // Como el registro de la UI: signUp con la clave anónima.
    const { data, error } = await createClient(URL_API, ANON, opc).auth.signUp({ email, password });
    if (error) throw error;
    uid = data.user.id;
  } else {
    const { data, error } = await srv.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    uid = data.user.id;
  }
  await ops.aceptarTerminos(uid, TERMINOS_VERSION);
  const part = sqlOk(`select id from comunidad.participantes where user_id = ${q(uid)}`);
  return { uid, email, part, n: k };
}
async function publicar(c, tmdbId) {
  const r = await escribirResena(deps, { uid: c.uid, idIntento: randomUUID(), texto: texto(c.n), accion: { tipo: "publicar", titulo: { tipo: "movie", tmdbId } } });
  assert.equal(r.resultado, "publicada", JSON.stringify(r));
}
async function baja(c) {
  const { error } = await srv.rpc("comunidad_baja_comunitaria", { p_uid: c.uid });
  if (error) throw error;
  const d = await srv.auth.admin.deleteUser(c.uid, false);
  if (d.error) throw d.error;
}
const huella = (ids) => sqlOk(`select json_build_object(
  'participantes', (select count(*) from comunidad.participantes where id = any('{${ids.join(",")}}'::uuid[])),
  'intentos', (select count(*) from comunidad.intentos where participante_id = any('{${ids.join(",")}}'::uuid[])),
  'huellas', (select count(*) from comunidad.huellas where autor_participante = any('{${ids.join(",")}}'::uuid[])),
  'agosto', (select coalesce(string_agg(posicion || ':' || puntos || ':' || participante_id, ','), '') from comunidad.top_resultados where mes = '${AGOSTO}'),
  'agosto_mes', (select count(*) from comunidad.top_meses where mes = '${AGOSTO}'))::text`);

const { prueba, cerrar } = arnes();
const v = { ajenos: [], cuentasAjenas: [] };

await prueba("punto de partida: sin archivo, sin registro, sin cuentas @recorrido.test, agosto y septiembre sin consolidar", () => {
  assert.equal(existsSync(ARCHIVO), false);
  assert.equal(hayRegistro(), false);
  assert.equal(n("select count(*) from auth.users where email like '%@recorrido.test'"), 0);
  assert.equal(n(`select count(*) from comunidad.top_meses where mes in ('${AGOSTO}', '${SEPTIEMBRE}')`), 0);
  v.participantes0 = n("select count(*) from comunidad.participantes");
  v.config0 = sqlOk("select modulo_activo || '/' || publicacion_activa || '/' || top_yumpers_activo || '/' || muestreo_activo from comunidad.config");
});

await prueba("preparar cortado tras dos autores: deja el archivo y el registro; limpiar lo deja todo como antes", () => {
  const r = recorrido("preparar", "preparar-autores");
  assert.notEqual(r.status, 0);
  assert.match(r.salida, /CORTE DE PRUEBA en "preparar-autores"/);
  const e = leerArchivo();
  assert.equal(e.fase, "preparando");
  assert.equal(e.reloj, "quitado", "el finally quitó el reloj y lo anotó");
  assert.equal(n("select count(*) from recorrido_e9a.cuentas"), 2);
  assert.equal(n("select count(*) from recorrido_e9a.participantes"), 2);
  const l = recorrido("limpiar");
  assert.equal(l.status, 0, l.salida);
  assert.match(l.salida, /limpieza verificada \(intento 1\): 2 cuenta\(s\) y 2 participante\(s\) propios/);
  assert.equal(existsSync(ARCHIVO), false);
  assert.equal(hayRegistro(), false);
  assert.equal(n("select count(*) from auth.users where email like '%@recorrido.test'"), 0);
  assert.equal(n("select count(*) from comunidad.participantes"), v.participantes0);
  assert.equal(sqlOk("select modulo_activo || '/' || publicacion_activa || '/' || top_yumpers_activo || '/' || muestreo_activo from comunidad.config"), v.config0);
});

await prueba("preparar completo", () => {
  const r = recorrido("preparar");
  assert.equal(r.status, 0, r.salida);
  assert.equal(leerArchivo().fase, "preparado");
  assert.equal(n("select count(*) from recorrido_e9a.cuentas"), 12);
});

await prueba("durante el recorrido: identidad AJENA dada de baja, ranking AJENO de agosto, cuentas propias hechas a mano (una dada de baja)", async () => {
  // Ajena: otro dominio, publica y se da de baja → participante sin cuenta.
  const a = await cuenta("auditoria-e9a.test");
  v.ajenos.push(a.part); v.cuentasAjenas.push(a.uid);
  await publicar(a, 603);
  await baja(a);
  assert.equal(sqlOk(`select coalesce(user_id::text, 'null') from comunidad.participantes where id = ${q(a.part)}`), "null");
  // Ranking ajeno: agosto, 5 puntos, de un participante que no es del recorrido.
  sqlOk(`begin;
    insert into comunidad.top_meses (mes, corte, consolidado_en, autores) values ('${AGOSTO}', comunidad.corte_de_mes('${AGOSTO}'), clock_timestamp(), 1);
    insert into comunidad.top_resultados (mes, posicion, puntos, participante_id) values ('${AGOSTO}', 1, 5, ${q(a.part)});
    commit;`);
  // Propias, como las haría el dueño desde la UI: una se queda, otra se da de baja.
  const m1 = await cuenta("recorrido.test", { viaUi: true });
  await publicar(m1, 603);
  const m2 = await cuenta("recorrido.test", { viaUi: true });
  await ops.votar(m2.uid, Number(sqlOk(`select v.id from comunidad.versiones v where v.autor_participante = ${q(m1.part)} order by id desc limit 1`)), true);
  await baja(m1);
  v.m1 = m1; v.m2 = m2;
  assert.equal(sqlOk(`select coalesce(user_id::text, 'null') from comunidad.participantes where id = ${q(m1.part)}`), "null", "m1 quedó desvinculado");
  // El registro tiene las cuentas y participantes propios, también el desvinculado; no el ajeno.
  assert.equal(n(`select count(*) from recorrido_e9a.cuentas where user_id in (${q(m1.uid)}, ${q(m2.uid)})`), 2);
  assert.equal(n(`select count(*) from recorrido_e9a.participantes where id in (${q(m1.part)}, ${q(m2.part)})`), 2);
  assert.equal(n(`select count(*) from recorrido_e9a.participantes where id = ${q(a.part)}`), 0);
  // El Top de septiembre se consolida con datos propios, como al abrirlo.
  assert.equal(sqlOk(`select comunidad.consolidar_mes('${SEPTIEMBRE}')::text`), "true");
  v.septiembre = n(`select count(*) from comunidad.top_resultados where mes = '${SEPTIEMBRE}'`);
  assert.ok(v.septiembre >= 5, `septiembre: ${v.septiembre}`);
  v.huellaAjena = huella(v.ajenos);
  console.log(`     ajeno: ${v.huellaAjena}`);
  assert.match(v.huellaAjena, /"participantes" : 1, "intentos" : [1-9]/);
});

await prueba("limpiar cortado tras guardar los objetivos: sale con error, sin éxito, nada borrado, objetivos = el registro", () => {
  v.registro = JSON.parse(sqlOk(`select json_build_object('cuentas', (select json_agg(user_id::text order by user_id::text) from recorrido_e9a.cuentas),
    'participantes', (select json_agg(id::text order by id::text) from recorrido_e9a.participantes))::text`));
  const r = recorrido("limpiar", "tras-objetivos");
  assert.notEqual(r.status, 0);
  assert.doesNotMatch(r.salida, /limpieza verificada/);
  const e = leerArchivo();
  assert.deepEqual(e.limpieza.objetivos.cuentas, v.registro.cuentas);
  assert.deepEqual(e.limpieza.objetivos.participantes, v.registro.participantes);
  assert.ok(e.limpieza.objetivos.participantes.includes(v.m1.part), "el participante desvinculado propio es objetivo");
  assert.ok(!e.limpieza.objetivos.participantes.includes(v.ajenos[0]), "el ajeno no");
  assert.equal(hayRegistro(), true);
  assert.equal(n(`select count(*) from auth.users where id = ${q(v.m2.uid)}`), 1, "todavía no borró nada");
});

await prueba("entre intentos nace otra identidad ajena; el corte siguiente (tras comunidad) no la incluye", async () => {
  const b = await cuenta("auditoria-e9a.test");
  v.ajenos.push(b.part); v.cuentasAjenas.push(b.uid); v.ajenoVivo = b;
  const r = recorrido("limpiar", "tras-comunidad");
  assert.notEqual(r.status, 0);
  assert.doesNotMatch(r.salida, /limpieza verificada/);
  const e = leerArchivo();
  assert.equal(e.limpieza.intentos, 2);
  assert.deepEqual(e.limpieza.objetivos.participantes, v.registro.participantes, "los objetivos no se ampliaron");
  assert.deepEqual(e.limpieza.mesesPropios, [SEPTIEMBRE]);
  assert.equal(n(`select count(*) from comunidad.top_meses where mes = '${SEPTIEMBRE}'`), 0, "septiembre (propio) se borró en la transacción");
  assert.equal(huella(v.ajenos.slice(0, 1)), v.huellaAjena, "lo ajeno sigue igual");
  assert.equal(n(`select count(*) from comunidad.participantes where id = ${q(b.part)} and user_id = ${q(b.uid)}`), 1);
  assert.equal(hayRegistro(), true);
});

await prueba("reintento completo: éxito verificado; quita archivo y registro", () => {
  const r = recorrido("limpiar");
  assert.equal(r.status, 0, r.salida);
  assert.match(r.salida, /limpieza verificada \(intento 3\): 14 cuenta\(s\) y 13 participante\(s\) propios, sin restos; meses propios borrados: 2026-09-01/);
  assert.equal(existsSync(ARCHIVO), false);
  assert.equal(hayRegistro(), false);
});

await prueba("lo propio se limpió: cuentas de preparar y a mano, el participante desvinculado y septiembre", () => {
  assert.equal(n("select count(*) from auth.users where email like '%@recorrido.test'"), 0);
  assert.equal(n(`select count(*) from comunidad.participantes where id = any('{${v.registro.participantes.join(",")}}'::uuid[])`), 0);
  assert.equal(n(`select count(*) from comunidad.participantes where id = ${q(v.m1.part)}`), 0, "el desvinculado propio");
  assert.equal(n(`select count(*) from comunidad.top_resultados where mes = '${SEPTIEMBRE}'`), 0);
  assert.equal(sqlOk("select modulo_activo || '/' || publicacion_activa || '/' || top_yumpers_activo || '/' || muestreo_activo from comunidad.config"), v.config0);
});

await prueba("lo ajeno sobrevivió: la identidad dada de baja con sus filas, el ranking de agosto y la cuenta viva", () => {
  assert.equal(huella(v.ajenos.slice(0, 1)), v.huellaAjena);
  assert.match(v.huellaAjena, /"agosto" : "1:5:/);
  assert.equal(n(`select count(*) from comunidad.participantes where id = ${q(v.ajenoVivo.part)} and user_id = ${q(v.ajenoVivo.uid)}`), 1);
});

await prueba("limpiar repetido sin archivo: no borra nada y lo dice", () => {
  const antes = huella(v.ajenos);
  const r = recorrido("limpiar");
  assert.notEqual(r.status, 0);
  assert.match(r.salida, /No hay \.recorrido-e9a\.local\.json/);
  assert.equal(huella(v.ajenos), antes);
});

await prueba("discrepancia real: con un voto AJENO en septiembre, la limpieza se detiene ANTES de borrar, sale con 1 y conserva archivo y registro", async () => {
  assert.equal(recorrido("preparar").status, 0);
  const c = await cuenta("auditoria-e9a.test");
  v.ajenos.push(c.part); v.cuentasAjenas.push(c.uid);
  const version = Number(sqlOk(`select v.id from comunidad.versiones v where v.autor_participante in (select id from recorrido_e9a.participantes)
    and v.estado = 'publicada' order by v.id limit 1`));
  // Como otra batería con su propio reloj: el voto ajeno cae en septiembre.
  aplicarArchivo("scripts/comunidad/solo-local-reloj.sql");
  sqlOk(`insert into solo_local.reloj (id, fijo) values (true, comunidad.corte_de_mes('${SEPTIEMBRE}') - interval '2 days')`);
  await ops.votar(c.uid, version, true);
  aplicarArchivo("scripts/comunidad/solo-local-reloj-quitar.sql");
  assert.equal(sqlOk(`select comunidad.consolidar_mes('${SEPTIEMBRE}')::text`), "true");
  const sept = () => sqlOk(`select count(*) || '|' || coalesce(string_agg(posicion || ':' || puntos, ',' order by id), '') from comunidad.top_resultados where mes = '${SEPTIEMBRE}'`);
  v.sept = sept();
  const r = recorrido("limpiar");
  assert.equal(r.status, 1, r.salida);
  assert.match(r.salida, /LIMPIEZA DETENIDA antes de borrar/);
  assert.match(r.salida, /2026-09-01: ranking con 1 tramo\(s\) y 0 resultado\(s\) ajenos; no se toca/);
  assert.doesNotMatch(r.salida, /limpieza verificada/);
  assert.equal(sept(), v.sept, "el ranking mixto de septiembre no se tocó");
  assert.equal(n(`select count(*) from comunidad.tramos where evaluador_participante = ${q(c.part)}`), 1, "el tramo ajeno sigue");
  assert.equal(existsSync(ARCHIVO), true);
  assert.equal(leerArchivo().limpieza.resultado, "discrepancia");
  assert.equal(hayRegistro(), true);
  assert.equal(n("select count(*) from auth.users where email like '%@recorrido.test'"), 12, "no borró nada: ni lo propio");
});

await prueba("resuelta la discrepancia (se quita el voto ajeno de prueba), el reintento verifica y borra septiembre", async () => {
  const o = { cuentas: [], participantes: [v.ajenos.at(-1)], versiones: [] };
  sqlOk(`delete from comunidad.tramos where evaluador_participante = ${q(o.participantes[0])}`);
  sqlOk(`delete from comunidad.evaluaciones where evaluador_participante = ${q(o.participantes[0])}`);
  const r = recorrido("limpiar");
  assert.equal(r.status, 0, r.salida);
  assert.match(r.salida, /limpieza verificada \(intento 2\).*meses propios borrados: 2026-09-01/);
  assert.equal(n(`select count(*) from comunidad.top_meses where mes = '${SEPTIEMBRE}'`), 0);
  assert.equal(existsSync(ARCHIVO), false);
  assert.equal(hayRegistro(), false);
});

await prueba("limpieza de las fixtures ajenas de esta prueba (por id) y base como al principio", async () => {
  for (const uid of v.cuentasAjenas) {
    if (n(`select count(*) from auth.users where id = ${q(uid)}`)) { const d = await srv.auth.admin.deleteUser(uid, false); if (d.error) throw d.error; }
  }
  const o = { cuentas: v.cuentasAjenas, participantes: v.ajenos, versiones: [] };
  sqlOk(`begin; delete from comunidad.top_resultados where mes = '${AGOSTO}' and participante_id = ${q(v.ajenos[0])} and puntos = 5;
    delete from comunidad.top_meses where mes = '${AGOSTO}' and not exists (select 1 from comunidad.top_resultados where mes = '${AGOSTO}'); commit;`);
  sqlOk(sqlBorrarComunidad(o, []));
  sqlOk(sqlBorrarParticipantes(o));
  assert.equal(n("select count(*) from comunidad.participantes"), v.participantes0);
  assert.equal(n(`select count(*) from comunidad.top_meses where mes in ('${AGOSTO}', '${SEPTIEMBRE}')`), 0);
  assert.equal(n("select count(*) from auth.users where email like '%@auditoria-e9a.test' or email like '%@recorrido.test'"), 0);
});

cerrar();
