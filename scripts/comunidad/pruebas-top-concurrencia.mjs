#!/usr/bin/env node
// E7: los casos CONCURRENTES del Top Yumpers con sesiones reales. Plan E7:
// casos 6–7 de rev. §2.2.4, 50 lecturas concurrentes después del corte y B8
// con votos y `consolidar_mes` reales. El criterio de cierre pide cinco
// corridas seguidas: este archivo es UNA; se corre cinco veces.
//
// Uso:
//   node --env-file=.env.comunidad-local scripts/comunidad/pruebas-top-concurrencia.mjs
//
// Qué es real: votos (`comunidad_votar`), lecturas del ranking
// (`comunidad_top_yumpers` con JWT real por PostgREST o como `authenticated`
// en psql con sus claims), `consolidar_mes`, el borrado de Auth por la API
// admin (red de seguridad de 012, sin paso 1) y las esperas de locks, que se
// OBSERVAN en pg_stat_activity (scripts/comunidad/sesiones.mjs).
// Qué es FIXTURE: el reloj (`solo-local-reloj.sql`), para poner las marcas de
// los votos antes o después del corte de un mes pasado, como pasaría al
// cruzar T(M) de verdad. Las barreras son locks consultivos 7399 de una
// sesión de control.
//
// Meses: 2026-01 (caso 6), 2026-02 (7a), 2026-04 (7b), 2026-06 (50 lecturas),
// 2026-03 (mes de control, sin consolidar, para la espera del exclusivo) y
// 2026-08 (B8). Se verifican libres al empezar y se borran al terminar.
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { aplicarArchivo, arnes, contenedor, sqlOk, urlLocal } from "./local.mjs";
import { Sesion, barrera, cerrarSesiones, consultar, esperaLock, esperar } from "./sesiones.mjs";
import { dependenciasEscritura, operacionesComunidad, sha256 } from "../../lib/comunidad/escritura-deps.ts";
import { normalizarTexto } from "../../lib/comunidad/texto.ts";
import { huella, secretoDuplicados } from "../../lib/comunidad/duplicados.ts";
import { TERMINOS_VERSION } from "../../lib/comunidad/terminos.ts";

const URL_API = urlLocal(process.env.NEXT_PUBLIC_SUPABASE_URL);
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SRV = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!ANON || !SRV) { console.error("Faltan claves (¿--env-file=.env.comunidad-local?)"); process.exit(2); }
const SECRETO = secretoDuplicados();
if (!SECRETO?.startsWith("local-prueba-")) { console.error("Falta el secreto HMAC LOCAL de prueba"); process.exit(2); }
console.log(`base: ${contenedor()} · API ${URL_API} · corrida ${process.env.CORRIDA ?? "única"}\n`);

const opc = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const srv = createClient(URL_API, SRV, opc);
const deps = dependenciasEscritura(srv);
const ops = operacionesComunidad(srv);
const { prueba, cerrar } = arnes();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const q = (v) => { if (!UUID.test(v)) throw new Error(`uuid inesperado: ${v}`); return `'${v}'`; };
const cuentas = new Set(), participantes = new Set();
const MESES = ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-06-01", "2026-08-01"];
const DEF_MARCA = "select md5(pg_get_functiondef('comunidad.proto_marca()'::regprocedure))";
const T = (mes) => `comunidad.corte_de_mes('${mes}')`;
const reloj = (expr) => sqlOk(`insert into solo_local.reloj (id, fijo) values (true, ${expr}) on conflict (id) do update set fijo = excluded.fijo`);
const relojLibre = () => sqlOk("delete from solo_local.reloj");

async function cuenta(et) {
  const email = `topc-${et}-${Date.now()}-${randomBytes(3).toString("hex")}@comunidad.test`;
  const password = `Pa-${randomBytes(15).toString("base64url")}`;
  const { data, error } = await srv.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  cuentas.add(data.user.id);
  assert.equal((await ops.aceptarTerminos(data.user.id, TERMINOS_VERSION)).resultado, "terminos_aceptados");
  const c = { uid: data.user.id, email, password, part: sqlOk(`select id from comunidad.participantes where user_id = ${q(data.user.id)}`) };
  participantes.add(c.part);
  const s = await createClient(URL_API, ANON, opc).auth.signInWithPassword({ email, password });
  if (s.error) throw s.error;
  c.jwt = s.data.session.access_token;
  return c;
}
let n = 0, tmdb = 9_890_000 + Math.floor(Math.random() * 1000) * 40;
async function publicar(c, cuando) {
  reloj(cuando);
  const t = `Reseña ficticia número ${++n} para la concurrencia del Top Yumpers. La fotografía es preciosa y el guion nunca aburre.`;
  const r = await deps.publicar({ uid: c.uid, tipo: "movie", tmdbId: tmdb++, texto: t, idIntento: randomUUID(), hash: sha256(t),
    decision: { resultado: "publicar", version_reglas: "prueba-e7", reglas: [], huella: huella(normalizarTexto(t), SECRETO) } });
  assert.equal(r.resultado, "publicada", JSON.stringify(r));
  return r;
}
async function votar(ev, r, cuando) {
  reloj(cuando);
  assert.equal((await ops.votar(ev.uid, r.version_id, true)).resultado, "voto_registrado");
}
/** SQL de una lectura REAL del ranking como `authenticated` (claims del JWT), en psql. */
const leerSql = (c, mes, etiqueta = "K") => `begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"${c.uid}","role":"authenticated"}', true);
select '${etiqueta}|' || public.comunidad_top_yumpers('${mes}')::text;
commit;
select '${etiqueta}|fin';`;
const votoSql = (ev, version, n) => `begin;
select 'V|' || public.comunidad_votar(${q(ev.uid)}, ${version}, true)::text;
select pg_advisory_lock(7399, ${n});
commit;
select pg_advisory_unlock(7399, ${n});
select 'V|fin';`;
async function hasta(s, re, desc, ms = 30000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) { if (re.test(s.out) || re.test(s.err)) return; await new Promise((r) => setTimeout(r, 100)); }
  throw new Error(`no llegó: ${desc}\nout: ${s.out.slice(-300)}\nerr: ${s.err.slice(-300)}`);
}
const json = (s, tag) => { const l = s.out.split("\n").find((x) => x.startsWith(`${tag}|{`)); return l ? JSON.parse(l.slice(tag.length + 1)) : null; };
const consolidado = (mes) => sqlOk(`select coalesce(string_agg(coalesce(participante_id::text, '∅') || '=' || puntos || '@' || posicion, ',' order by id), '') from comunidad.top_resultados where mes = '${mes}'`);
const exacto = (mes) => sqlOk(`select coalesce(string_agg(autor || '=' || puntos, ',' order by puntos desc, autor), '') from comunidad.puntos_al_corte('${mes}', ${T(mes)})`);
const puntosDe = (mes, c) => sqlOk(`select coalesce((select puntos::text from comunidad.top_resultados where mes = '${mes}' and participante_id = ${q(c.part)}), '0')`);
async function rpcTop(token, mes) {
  const r = await fetch(`${URL_API}/rest/v1/rpc/comunidad_top_yumpers`, {
    method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_mes: mes }),
  });
  return { status: r.status, texto: await r.text() };
}
const config = (cols) => sqlOk(`update comunidad.config set ${Object.entries(cols).map(([k, v]) => `${k} = ${v}`).join(", ")} where id`);
const configPrevia = JSON.parse(sqlOk("select row_to_json(c)::text from comunidad.config c"));
const defMarcaAntes = sqlOk(DEF_MARCA);
const S = {};

try {
  await prueba("preparación: meses libres, reloj forzado, interruptores encendidos", async () => {
    for (const mes of MESES) {
      assert.equal(sqlOk(`select count(*) from comunidad.tramos where mes_primera_positiva = '${mes}'`), "0", `${mes} tiene tramos ajenos`);
      assert.equal(sqlOk(`select count(*) from comunidad.top_meses where mes = '${mes}'`), "0", `${mes} ya está consolidado`);
    }
    assert.equal(sqlOk("select count(*) from pg_namespace where nspname = 'solo_local'"), "0");
    aplicarArchivo("scripts/comunidad/solo-local-reloj.sql");
    config({ modulo_activo: true, publicacion_activa: true, top_yumpers_activo: true });
    S.L = await cuenta("lector");
  });

  await prueba("caso 6: un voto que tomó el compartido ANTES de T(M) y confirma DESPUÉS, mientras la consolidación espera el exclusivo: la consolidación lo espera y lo cuenta", async () => {
    const M = "2026-01-01";
    const au = await cuenta("c6-autor"), ev = await cuenta("c6-ev");
    const r = await publicar(au, `${T(M)} - interval '5 days'`);
    reloj(`${T(M)} - interval '1 second'`);
    const b = await barrera(61);
    const voto = new Sesion("c6-voto"), cons = new Sesion("c6-cons");
    voto.enviar(votoSql(ev, r.version_id, 61));
    await esperar(esperaLock(voto, "advisory"), "el voto (con su compartido y sus filas) espera la barrera antes de confirmar");
    cons.enviar(leerSql(S.L, M));
    await esperar(esperaLock(cons, "advisory"), "la consolidación espera el exclusivo");
    assert.equal(await consultar(`(select count(*) from comunidad.top_meses where mes = '${M}')`), "0");
    b.soltar();
    await hasta(voto, /V\|fin/, "el voto confirma");
    await hasta(cons, /K\|fin/, "la lectura consolida");
    await voto.terminar(); await cons.terminar();
    relojLibre();
    assert.equal(puntosDe(M, au), "1", "el voto confirmado durante la espera cuenta");
    assert.equal(json(cons, "K")?.items?.[0]?.puntos, 1);
    assert.equal(consolidado(M).replace(/@\d+/g, ""), exacto(M), "consolidado = cómputo exacto al corte");
  });

  await prueba("caso 7a: con la consolidación CALCULANDO (exclusivo tomado), un voto con marca después de T(M) espera el compartido; el mes no lo incluye y coincide con el cómputo exacto", async () => {
    const M = "2026-02-01";
    const au = await cuenta("c7a-autor"), e1 = await cuenta("c7a-e1"), e2 = await cuenta("c7a-e2");
    const r = await publicar(au, `${T(M)} - interval '5 days'`);
    await votar(e1, r, `${T(M)} - interval '1 hour'`);
    relojLibre();
    const b = await barrera(71);
    const cons = new Sesion("c7a-cons"), voto = new Sesion("c7a-voto");
    cons.enviar(`begin;
select 'K|' || comunidad.consolidar_mes('${M}')::text;
select pg_advisory_lock(7399, 71);
commit;
select pg_advisory_unlock(7399, 71);
select 'K|fin';`);
    await esperar(esperaLock(cons, "advisory"), "la consolidación calculó y retiene el exclusivo");
    reloj(`${T(M)} + interval '1 microsecond'`);
    voto.enviar(`select 'V|' || public.comunidad_votar(${q(e2.uid)}, ${r.version_id}, true)::text; select 'V|fin';`);
    await esperar(esperaLock(voto, "advisory"), "el voto espera el compartido (K_CORTE)");
    assert.equal(await consultar(`(select count(*) from comunidad.evaluaciones where version_id = ${r.version_id})`), "1", "el voto todavía no escribió nada");
    b.soltar();
    await hasta(cons, /K\|fin/, "la consolidación confirma");
    await hasta(voto, /V\|fin/, "el voto confirma después");
    await cons.terminar(); await voto.terminar();
    relojLibre();
    assert.match(cons.out, /K\|true/, "esta llamada calculó");
    assert.equal(puntosDe(M, au), "1", "sólo el voto anterior al corte");
    assert.equal(consolidado(M).replace(/@\d+/g, ""), exacto(M));
  });

  await prueba("caso 7b: con la consolidación ESPERANDO el exclusivo, un voto nuevo (marca después de T(M)) queda detrás de ella; el previo cuenta, el nuevo no", async () => {
    const M = "2026-04-01";
    const au = await cuenta("c7b-autor"), e1 = await cuenta("c7b-e1"), e2 = await cuenta("c7b-e2");
    const r = await publicar(au, `${T(M)} - interval '5 days'`);
    reloj(`${T(M)} - interval '1 microsecond'`);
    const b = await barrera(72);
    const v1 = new Sesion("c7b-v1"), cons = new Sesion("c7b-cons"), v2 = new Sesion("c7b-v2");
    v1.enviar(votoSql(e1, r.version_id, 72));
    await esperar(esperaLock(v1, "advisory"), "el primer voto retiene su compartido");
    cons.enviar(leerSql(S.L, M));
    await esperar(esperaLock(cons, "advisory"), "la consolidación espera el exclusivo");
    reloj(`${T(M)} + interval '1 microsecond'`);
    v2.enviar(`select 'V|' || public.comunidad_votar(${q(e2.uid)}, ${r.version_id}, true)::text; select 'V|fin';`);
    await esperar(esperaLock(v2, "advisory"), "el voto nuevo queda en cola detrás del exclusivo pedido");
    b.soltar();
    await hasta(v1, /V\|fin/, "primer voto"); await hasta(cons, /K\|fin/, "consolidación"); await hasta(v2, /V\|fin/, "voto nuevo");
    await v1.terminar(); await cons.terminar(); await v2.terminar();
    relojLibre();
    assert.equal(puntosDe(M, au), "1", "cuenta el voto anterior al corte; el nuevo es de mayo");
    assert.equal(consolidado(M).replace(/@\d+/g, ""), exacto(M));
    assert.equal(sqlOk(`select count(*) from comunidad.evaluaciones where version_id = ${r.version_id} and retirada_en is null`), "2", "los dos votos se aplicaron");
  });

  await prueba("50 lecturas concurrentes después del corte: UN solo cálculo y la misma respuesta; después, 50 más se resuelven sin pedir el exclusivo (con un compartido retenido) mientras un mes sin consolidar sí lo espera", async () => {
    const M = "2026-06-01";
    const au = [await cuenta("l-a1"), await cuenta("l-a2"), await cuenta("l-a3")];
    const ev = [await cuenta("l-e1"), await cuenta("l-e2"), await cuenta("l-e3")];
    for (let i = 0; i < 3; i++) {
      const r = await publicar(au[i], `${T(M)} - interval '10 days'`);
      for (let j = 0; j <= i; j++) await votar(ev[j], r, `${T(M)} - interval '${5 - j} days'`);
    }
    relojLibre();
    const lectores = [S.L, ...ev, ...au];
    const ola = (mes) => Promise.all(Array.from({ length: 50 }, (_, i) => rpcTop(lectores[i % lectores.length].jwt, mes)));
    const t0 = Date.now();
    const r1 = await ola(M);
    const ms1 = Date.now() - t0;
    assert.deepEqual([...new Set(r1.map((x) => x.status))], [200], r1.find((x) => x.status !== 200)?.texto);
    const items = new Set(r1.map((x) => JSON.stringify(JSON.parse(x.texto).items.map((i) => [i.posicion, i.puntos, i.id]))));
    assert.equal(items.size, 1, "todas ven el mismo ranking");
    assert.equal(sqlOk(`select count(*) || '|' || (select count(*) from comunidad.top_resultados where mes = '${M}') from comunidad.top_meses where mes = '${M}'`), "1|3",
      "un solo mes consolidado y sus tres filas (un segundo cálculo chocaría con la clave)");
    const marca = sqlOk(`select consolidado_en::text from comunidad.top_meses where mes = '${M}'`);
    // Segunda ola con un compartido K_CORTE retenido (como una escritura en curso).
    const b = await barrera(81);
    const compartido = new Sesion("l-compartido");
    compartido.enviar(`begin; select pg_advisory_xact_lock_shared(7301, 0); select pg_advisory_lock(7399, 81); commit; select pg_advisory_unlock(7399, 81); select 'C|fin';`);
    await esperar(esperaLock(compartido, "advisory"), "el compartido queda retenido");
    const t1 = Date.now();
    const r2 = await ola(M);
    const ms2 = Date.now() - t1;
    assert.deepEqual([...new Set(r2.map((x) => x.status))], [200]);
    assert.equal(sqlOk(`select consolidado_en::text from comunidad.top_meses where mes = '${M}'`), marca, "nadie recalculó");
    // Control: un mes SIN consolidar sí espera el exclusivo mientras el compartido sigue retenido.
    const ctl = new Sesion("l-control");
    ctl.enviar(leerSql(S.L, "2026-03-01"));
    await esperar(esperaLock(ctl, "advisory"), "la lectura de un mes sin consolidar espera el exclusivo");
    b.soltar();
    await hasta(compartido, /C\|fin/, "el compartido se suelta"); await hasta(ctl, /K\|fin/, "el mes de control se consolida");
    await compartido.terminar(); await ctl.terminar();
    console.log(`     primera ola: ${ms1} ms; segunda ola (con el compartido retenido): ${ms2} ms`);
  });

  await prueba("B8: borrado por Auth SIN paso 1, con un voto real de otra cuenta en vuelo y una consolidación real esperando: o termina (tramos cerrados con UNA marca, participante sin user_id) o se revierte entera y el reintento termina; la consolidación termina y coincide con el cómputo exacto", async () => {
    const M = "2026-08-01";
    const u = await cuenta("b8-u"), e = await cuenta("b8-e"), v = await cuenta("b8-v");
    const ru = await publicar(u, `${T(M)} - interval '10 days'`), re = await publicar(e, `${T(M)} - interval '10 days'`);
    await votar(e, ru, `${T(M)} - interval '5 days'`);
    await votar(u, re, `${T(M)} - interval '5 days'`);
    reloj(`${T(M)} - interval '1 hour'`);
    const b = await barrera(91);
    const esc = new Sesion("b8-voto"), cons = new Sesion("b8-cons");
    esc.enviar(votoSql(v, ru.version_id, 91));
    await esperar(esperaLock(esc, "advisory"), "el voto de otra cuenta retiene compartido, su cuenta y las filas de los participantes");
    cons.enviar(leerSql(S.L, M));
    await esperar(esperaLock(cons, "advisory"), "la consolidación espera el exclusivo");
    const t0 = Date.now();
    const borrado = srv.auth.admin.deleteUser(u.uid, false);
    await esperar(`exists (select 1 from pg_stat_activity where usename = 'supabase_auth_admin' and wait_event_type = 'Lock')`, "la transacción de Auth espera un lock");
    b.soltar();
    const { error } = await borrado;
    await hasta(esc, /V\|fin|ERROR/, "el voto termina");
    await hasta(cons, /K\|fin|ERROR/, "la consolidación termina");
    await esc.terminar(); await cons.terminar();
    relojLibre();
    const motivo = (t) => (/deadlock detected/.test(t) ? "deadlock" : /lock timeout/.test(t) ? "lock_timeout" : null);
    const abortada = motivo(esc.err) ? `voto (${motivo(esc.err)})` : motivo(cons.err) ? `consolidación (${motivo(cons.err)})` : error ? `auth (${error.status})` : "ninguna";
    console.log(`     deleteUser: ${error ? `error ${error.status}` : "ok"} en ${Date.now() - t0} ms · abortada: ${abortada}`);
    const estado = () => JSON.parse(sqlOk(`select json_build_object(
      'auth', (select count(*) from auth.users where id = ${q(u.uid)}),
      'user_id', (select user_id from comunidad.participantes where id = ${q(u.part)}),
      'abiertos', (select count(*) from comunidad.tramos where (autor_participante = ${q(u.part)} or evaluador_participante = ${q(u.part)}) and vigente_hasta is null),
      'cerrados', (select count(*) from comunidad.tramos where (autor_participante = ${q(u.part)} or evaluador_participante = ${q(u.part)}) and vigente_hasta is not null),
      'marcas', (select count(distinct vigente_hasta) from comunidad.tramos where (autor_participante = ${q(u.part)} or evaluador_participante = ${q(u.part)}) and vigente_hasta is not null))::text`));
    let s = estado();
    if (error) {
      assert.deepEqual([s.auth, s.cerrados], [1, 0], "Auth se revirtió ENTERA: cuenta viva y ningún tramo cerrado a medias");
      const { error: e2 } = await srv.auth.admin.deleteUser(u.uid, false);
      assert.equal(e2, null, "el reintento termina");
      s = estado();
    }
    assert.deepEqual([s.auth, s.user_id, s.abiertos, s.marcas], [0, null, 0, 1], `tramos cerrados con UNA marca, participante sin user_id (${JSON.stringify(s)})`);
    cuentas.delete(u.uid);
    // psql sigue después de un error (ON_ERROR_STOP=0): «K|fin» llega igual.
    // Que la consolidación terminó lo dice el JSON del ranking.
    if (!json(cons, "K")) {
      const r = await rpcTop(S.L.jwt, M);
      assert.equal(r.status, 200, "el reintento de la lectura consolida");
    }
    assert.equal(sqlOk(`select count(*) from comunidad.top_meses where mes = '${M}'`), "1");
    const puntos = (txt) => txt.split(",").filter(Boolean).map((x) => Number(x.split("=")[1].split("@")[0])).sort().join(",");
    const c = consolidado(M), x = exacto(M);
    console.log(`     consolidado: ${c.replace(/[0-9a-f-]{36}/g, (m) => (m === u.part ? "u" : m === e.part ? "e" : "?"))} · exacto: ${x.replace(/[0-9a-f-]{36}/g, (m) => (m === u.part ? "u" : m === e.part ? "e" : "?"))}`);
    assert.equal(puntos(c), puntos(x), `mismos puntos que el cómputo exacto al corte (${c} | ${x})`);
    assert.equal(sqlOk(`select coalesce(max(puntos), 0) from comunidad.top_resultados where mes = '${M}'`), "2", `u: los votos de e y de v (anteriores al corte) cuentan (${c})`);
  });
} finally {
  console.log("\n— Limpieza (base compartida): sólo lo de esta corrida —");
  try {
    await cerrarSesiones();
    try { relojLibre(); } catch { /* ya no está */ }
    aplicarArchivo("scripts/comunidad/solo-local-reloj-quitar.sql");
    const prev = configPrevia;
    config({ modulo_activo: prev.modulo_activo, publicacion_activa: prev.publicacion_activa, top_yumpers_activo: prev.top_yumpers_activo, muestreo_activo: prev.muestreo_activo ?? false });
    for (const mes of MESES) sqlOk(`delete from comunidad.top_resultados where mes = '${mes}'; delete from comunidad.top_meses where mes = '${mes}'`);
    const us = [...cuentas];
    for (const u of us) await srv.auth.admin.deleteUser(u, false);
    const todos = [...participantes].map(q).join(",");
    if (todos) sqlOk(`begin;
      delete from comunidad.intentos where participante_id in (${todos});
      delete from comunidad.tramos where evaluador_participante in (${todos}) or autor_participante in (${todos});
      delete from comunidad.evaluaciones where evaluador_participante in (${todos}) or autor_participante in (${todos});
      delete from comunidad.huellas where autor_participante in (${todos});
      delete from comunidad.resenas where autor_participante in (${todos});
      delete from comunidad.contadores where participante_id in (${todos});
      delete from comunidad.participantes where id in (${todos});
      commit;`);
    console.log(`   cuentas: ${participantes.size}; restos (cuentas|participantes|meses|locks|reloj|proto_marca igual|interruptores): ${sqlOk(`select
      (select count(*) from auth.users where email like 'topc-%@comunidad.test') || '|' ||
      (select count(*) from comunidad.participantes where id in (${todos || "null"})) || '|' ||
      (select count(*) from comunidad.top_meses where mes in (${MESES.map((m) => `'${m}'`).join(",")})) || '|' ||
      (select count(*) from pg_locks where locktype = 'advisory') || '|' ||
      (select count(*) from pg_namespace where nspname = 'solo_local')`)}|${sqlOk(DEF_MARCA) === defMarcaAntes}|${sqlOk("select (modulo_activo or publicacion_activa or top_yumpers_activo or muestreo_activo)::text from comunidad.config")}`);
  } catch (e) {
    console.error("   ⚠️ la limpieza falló:", e.message);
    process.exitCode = 1;
  }
  cerrar();
}
