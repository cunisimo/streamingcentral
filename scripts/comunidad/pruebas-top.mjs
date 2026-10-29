#!/usr/bin/env node
// E7: Top Yumpers mensual. FUNCIONES REALES contra `supabase start` y la RUTA
// REAL contra el servidor local. SÓLO LOCAL.
//
// Uso:
//   node --env-file=.env.comunidad-local scripts/comunidad/pruebas-top.mjs
//   (servidor de la app con las claves locales en BASE, por defecto
//    http://localhost:3100, para la sección de la ruta)
//
// Qué es real: cuentas de Auth con sesión, términos, publicar, editar, votar,
// retirar el voto, bloquear (adaptadores de las rutas); retirar, restaurar,
// suspender y levantar con las funciones de E4 y un admin con dos TOTP
// reales; la baja con el flujo de la app; la lectura y la consolidación con
// `comunidad_top_yumpers` (JWT real) y `consolidar_mes`.
// Qué es FIXTURE: el RELOJ. `scripts/comunidad/solo-local-reloj.sql` hace que
// `proto_marca()` devuelva el instante que fija la batería (plan E7: "marcas
// forzadas por solo-local.sql"), así votos, retiros, ediciones, moderación y
// suspensiones caen en meses pasados y exactamente en T(M) o a 1 µs de cada
// lado. La baja usa su propio `clock_timestamp()` (real: después del corte).
// Se instala y se quita en esta corrida, comparando la definición de
// proto_marca antes y después.
//
// Meses de prueba: 2026-03 (fórmula), 2026-05 (igualdad exacta y
// suspensiones), 2026-07 (caso 10). Al empezar se comprueba que nadie más
// tenga tramos ni resultados en ellos; al terminar se borran sólo los de esta
// corrida.
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { aplicarArchivo, arnes, contenedor, sqlOk, urlLocal } from "./local.mjs";
import { dependenciasEscritura, dependenciasNombre, operacionesComunidad, sha256 } from "../../lib/comunidad/escritura-deps.ts";
import { cambiarNombre } from "../../lib/comunidad/nombre-nucleo.ts";
import { normalizarTexto } from "../../lib/comunidad/texto.ts";
import { huella, secretoDuplicados } from "../../lib/comunidad/duplicados.ts";
import { TERMINOS_VERSION } from "../../lib/comunidad/terminos.ts";
import { topValido } from "../../lib/comunidad/top-yumpers-nucleo.ts";
import { correrFlujo } from "../../lib/eliminar-cuenta-flujo.ts";
import { dependenciasReales } from "../../lib/eliminar-cuenta-deps.ts";

const URL_API = urlLocal(process.env.NEXT_PUBLIC_SUPABASE_URL);
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SRV = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!ANON || !SRV) { console.error("Faltan claves (¿--env-file=.env.comunidad-local?)"); process.exit(2); }
const SECRETO = secretoDuplicados();
if (!SECRETO?.startsWith("local-prueba-")) { console.error("Falta el secreto HMAC LOCAL de prueba"); process.exit(2); }
const BASE = process.env.BASE || "http://localhost:3100";
if (!["localhost", "127.0.0.1"].includes(new URL(BASE).hostname)) { console.error(`BASE no es local: ${BASE}`); process.exit(2); }
console.log(`base: ${contenedor()} · API ${URL_API} · app ${BASE}\n`);

const opc = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const srv = createClient(URL_API, SRV, opc);
const deps = dependenciasEscritura(srv);
const ops = operacionesComunidad(srv);
const depsNombre = dependenciasNombre(srv);

const { prueba, cerrar } = arnes();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const q = (v) => { if (!UUID.test(v)) throw new Error(`uuid inesperado: ${v}`); return `'${v}'`; };
const cuentas = new Set(), participantes = new Set();
const MESES = ["2026-03-01", "2026-05-01", "2026-07-01"];
const S = {};

// --------------------------------------------------------------- el reloj
const DEF_MARCA = "select md5(pg_get_functiondef('comunidad.proto_marca()'::regprocedure))";
const T = (mes) => `comunidad.corte_de_mes('${mes}')`;
/** Fija la marca de las próximas operaciones (expresión SQL timestamptz). */
const reloj = (expr) => sqlOk(`insert into solo_local.reloj (id, fijo) values (true, ${expr}) on conflict (id) do update set fijo = excluded.fijo`);
const relojLibre = () => sqlOk("delete from solo_local.reloj");
const instante = (expr) => sqlOk(`select (${expr})::text`);

// ------------------------------------------------------------- cuentas
async function cuenta(et, { terminos = true } = {}) {
  const email = `topy-${et}-${Date.now()}-${randomBytes(3).toString("hex")}@comunidad.test`;
  const password = `Pa-${randomBytes(15).toString("base64url")}`;
  const { data, error } = await srv.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  cuentas.add(data.user.id);
  const c = { uid: data.user.id, email, password, part: null };
  if (terminos) {
    assert.equal((await ops.aceptarTerminos(c.uid, TERMINOS_VERSION)).resultado, "terminos_aceptados");
    c.part = sqlOk(`select id from comunidad.participantes where user_id = ${q(c.uid)}`);
    participantes.add(c.part);
  }
  const cli = createClient(URL_API, ANON, opc);
  const s = await cli.auth.signInWithPassword({ email, password });
  if (s.error) throw s.error;
  c.jwt = s.data.session.access_token;
  c.sb = createClient(URL_API, ANON, { ...opc, global: { headers: { Authorization: `Bearer ${c.jwt}` } } });
  return c;
}
let n = 0, tmdb = 9_880_000 + Math.floor(Math.random() * 1000) * 50;
const texto = () => `Reseña ficticia número ${++n} del Top Yumpers. La fotografía es preciosa y el guion se toma su tiempo sin aburrir nunca.`;
const decision = (t) => ({ resultado: "publicar", version_reglas: "prueba-e7", reglas: [], huella: huella(normalizarTexto(t), SECRETO) });
async function publicar(c, cuando) {
  reloj(cuando);
  const t = texto();
  const r = await deps.publicar({ uid: c.uid, tipo: "movie", tmdbId: tmdb++, texto: t, idIntento: randomUUID(), hash: sha256(t), decision: decision(t) });
  assert.equal(r.resultado, "publicada", JSON.stringify(r));
  return r;
}
async function editar(c, r, cuando) {
  reloj(cuando);
  const t = texto();
  const x = await deps.editar({ uid: c.uid, resenaId: r.resena_id, versionEsperada: r.version_id, texto: t, decision: decision(t), idIntento: randomUUID(), hash: sha256(t) });
  assert.equal(x.resultado, "publicada", JSON.stringify(x));
  return x;
}
async function votar(ev, r, util, cuando) {
  reloj(cuando);
  const x = await ops.votar(ev.uid, r.version_id, util);
  assert.equal(x.resultado, "voto_registrado", JSON.stringify(x));
}
async function retirarVoto(ev, r, cuando) {
  reloj(cuando);
  assert.equal((await ops.retirarVoto(ev.uid, r.version_id)).resultado, "voto_retirado");
}
// Admin con dos TOTP reales (funciones de E4).
function totp(secreto) {
  const a = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let b = "";
  for (const ch of secreto.replace(/=+$/, "").toUpperCase()) b += a.indexOf(ch).toString(2).padStart(5, "0");
  const k = Buffer.from(b.match(/.{8}/g).map((x) => parseInt(x, 2))); const ct = Buffer.alloc(8);
  ct.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", k).update(ct).digest(); const o = h[h.length - 1] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, "0");
}
async function adminAal2() {
  const a = await cuenta("admin", { terminos: false });
  sqlOk(`update public.profiles set is_admin = true where id = ${q(a.uid)}`);
  const cli = createClient(URL_API, ANON, opc);
  await cli.auth.signInWithPassword({ email: a.email, password: a.password });
  for (const nombre of ["principal", "respaldo"]) {
    const { data: f } = await cli.auth.mfa.enroll({ factorType: "totp", friendlyName: nombre });
    const { data: ch } = await cli.auth.mfa.challenge({ factorId: f.id });
    const r = await cli.auth.mfa.verify({ factorId: f.id, challengeId: ch.id, code: totp(f.totp.secret) });
    if (r.error) throw r.error;
  }
  a.sb = createClient(URL_API, ANON, { ...opc, global: { headers: { Authorization: `Bearer ${(await cli.auth.getSession()).data.session.access_token}` } } });
  return a;
}
const MOTIVO = "Prueba local de E7 (Top Yumpers).";
async function decidir(accion, version, cuando) {
  reloj(cuando);
  const r = await S.admin.sb.rpc("comunidad_admin_decidir", { p_accion: accion, p_version: version, p_motivo: MOTIVO, p_id_intento: randomUUID() });
  assert.equal(r.data?.resultado, "aplicada", `${accion}: ${JSON.stringify(r.error ?? r.data)}`);
}
async function suspender(c, cuando) {
  reloj(cuando);
  const r = await S.admin.sb.rpc("comunidad_admin_suspender", { p_participante: c.part, p_motivo: MOTIVO, p_id_intento: randomUUID() });
  assert.equal(r.data?.resultado, "aplicada", JSON.stringify(r.error ?? r.data));
}
async function levantar(c, cuando) {
  reloj(cuando);
  const r = await S.admin.sb.rpc("comunidad_admin_levantar_suspension", { p_participante: c.part, p_motivo: MOTIVO, p_id_intento: randomUUID() });
  assert.equal(r.data?.resultado, "aplicada", JSON.stringify(r.error ?? r.data));
}

// --------------------------------------------------------------- lectura
/** El ranking por PostgREST con el JWT de `c` (la función real). */
async function rpcTop(token, mes) {
  const r = await fetch(`${URL_API}/rest/v1/rpc/comunidad_top_yumpers`, {
    method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_mes: mes }),
  });
  return { status: r.status, texto: await r.text() };
}
async function top(c, mes) {
  const r = await rpcTop(c.jwt, mes);
  assert.equal(r.status, 200, r.texto.slice(0, 200));
  return JSON.parse(r.texto);
}
/** Puntos por participante en lo consolidado (con id) y la lista de huérfanos. */
const consolidado = (mes) => JSON.parse(sqlOk(`select json_build_object(
  'mes', (select row_to_json(m) from comunidad.top_meses m where m.mes = '${mes}'),
  'filas', coalesce((select json_agg(json_build_object('p', participante_id, 'pos', posicion, 'pts', puntos) order by id) from comunidad.top_resultados where mes = '${mes}'), '[]'))::text`));
/** El cómputo exacto (función real) a un corte cualquiera, por participante. */
const exacto = (mes, corte) => Object.fromEntries(sqlOk(`select coalesce(string_agg(autor || '=' || puntos, ','), '') from comunidad.puntos_al_corte('${mes}', ${corte})`)
  .split(",").filter(Boolean).map((x) => { const [a, p] = x.split("="); return [a, Number(p)]; }));
const config = (cols) => sqlOk(`update comunidad.config set ${Object.entries(cols).map(([k, v]) => `${k} = ${v}`).join(", ")} where id`);
const configPrevia = JSON.parse(sqlOk("select row_to_json(c)::text from comunidad.config c"));
const defMarcaAntes = sqlOk(DEF_MARCA);

try {
  await prueba("preparación: meses de prueba libres; reloj forzado instalado; módulo y Top Yumpers encendidos; admin con dos TOTP", async () => {
    for (const mes of MESES) {
      assert.equal(sqlOk(`select count(*) from comunidad.tramos where mes_primera_positiva = '${mes}'`), "0", `${mes} tiene tramos ajenos`);
      assert.equal(sqlOk(`select count(*) from comunidad.top_meses where mes = '${mes}'`), "0", `${mes} ya está consolidado`);
    }
    assert.equal(sqlOk("select count(*) from pg_namespace where nspname = 'solo_local'"), "0", "quedó un solo_local de otra corrida");
    aplicarArchivo("scripts/comunidad/solo-local-reloj.sql");
    config({ modulo_activo: true, publicacion_activa: true, top_yumpers_activo: true });
    S.admin = await adminAal2();
    S.L = await cuenta("lector");
    S.L2 = await cuenta("lector2");
  });

  // ===================================================================
  console.log("\n— Fórmula (marzo de 2026) —");
  await prueba("un punto por evaluador DISTINTO y autor: dos positivos de la misma persona suman 1; publicar no suma; un negativo no resta; retirar o pasar a negativo dentro del mes deja 0; abril no cuenta", async () => {
    const M = "2026-03-01", d = (expr) => `${T(M)} - interval '${expr}'`;
    S.A = await cuenta("A"); S.B = await cuenta("B"); S.C = await cuenta("C"); S.D = await cuenta("D");
    const ev = [];
    for (let i = 0; i < 6; i++) ev.push(await cuenta(`ev${i}`));
    const [E1, E2, E3, E4, E5, E6] = ev;
    const a1 = await publicar(S.A, d("20 days")), a2 = await publicar(S.A, d("19 days"));
    const b1 = await publicar(S.B, d("18 days")), d1 = await publicar(S.D, d("18 days"));
    await publicar(S.C, d("18 days"));
    await votar(E1, a1, true, d("10 days")); await votar(E1, a2, true, d("9 days"));
    await votar(E2, a1, true, d("8 days"));
    await votar(E3, a1, false, d("8 days"));
    await votar(E4, a1, true, d("7 days")); await retirarVoto(E4, a1, d("6 days"));
    await votar(E5, a1, true, d("7 days")); await votar(E5, a1, false, d("5 days"));
    await votar(E4, b1, true, d("4 days"));
    await votar(E2, d1, true, d("4 days"));
    await votar(E6, a1, true, `${T(M)} + interval '1 day'`); // abril
    relojLibre();
    const r = await top(S.L, M);
    const pts = Object.fromEntries(r.items.map((x) => [x.id, [x.posicion, x.puntos]]));
    assert.deepEqual(pts[S.A.part], [1, 2], "A: E1 (dos reseñas) y E2");
    assert.deepEqual(pts[S.B.part], [2, 1]);
    assert.deepEqual(pts[S.D.part], [2, 1], "empate: posición densa");
    assert.equal(pts[S.C.part], undefined, "publicar no da puntos");
    assert.equal(r.autores, 3);
    assert.deepEqual(exacto(M, T(M)), { [S.A.part]: 2, [S.B.part]: 1, [S.D.part]: 1 }, "consolidado = cómputo exacto al corte");
  });

  // ===================================================================
  console.log("\n— Igualdad exacta en T(M) y suspensiones como intervalo (mayo de 2026) —");
  await prueba("caso 11: tramo que empieza, tramo que termina, suspensión (de autor y de evaluador) que empieza y que termina EXACTAMENTE en T(M) y a 1 µs de cada lado", async () => {
    const M = "2026-05-01", t = (desp) => `${T(M)} ${desp}`;
    const us = "interval '1 microsecond'";
    S.casos = {};
    const caso = async (nombre, esperado, fn) => {
      const au = await cuenta(`x-${nombre}`), ev = await cuenta(`e-${nombre}`);
      const r = await publicar(au, t("- interval '10 days'"));
      await fn(au, ev, r);
      S.casos[nombre] = { au, ev, esperado };
    };
    // Tramo que EMPIEZA (primera positiva): en T es de junio.
    await caso("empieza-T-1us", 1, (au, ev, r) => votar(ev, r, true, t(`- ${us}`)));
    await caso("empieza-T", 0, (au, ev, r) => votar(ev, r, true, t("")));
    await caso("empieza-T+1us", 0, (au, ev, r) => votar(ev, r, true, t(`+ ${us}`)));
    // Tramo que TERMINA (retiro): si termina en T, todavía regía.
    for (const [nombre, desp, esp] of [["termina-T-1us", `- ${us}`, 0], ["termina-T", "", 1], ["termina-T+1us", `+ ${us}`, 1]]) {
      await caso(nombre, esp, async (au, ev, r) => { await votar(ev, r, true, t("- interval '1 day'")); await retirarVoto(ev, r, t(desp)); });
    }
    // Suspensión del AUTOR que EMPIEZA: si empieza en T, es del mes siguiente.
    for (const [nombre, desp, esp] of [["susp-autor-empieza-T-1us", `- ${us}`, 0], ["susp-autor-empieza-T", "", 1], ["susp-autor-empieza-T+1us", `+ ${us}`, 1]]) {
      await caso(nombre, esp, async (au, ev, r) => { await votar(ev, r, true, t("- interval '1 day'")); await suspender(au, t(desp)); });
    }
    // Suspensión del AUTOR que TERMINA (se levanta): si termina en T, todavía regía.
    for (const [nombre, desp, esp] of [["susp-autor-termina-T-1us", `- ${us}`, 1], ["susp-autor-termina-T", "", 0], ["susp-autor-termina-T+1us", `+ ${us}`, 0]]) {
      await caso(nombre, esp, async (au, ev, r) => {
        await votar(ev, r, true, t("- interval '3 days'"));
        await suspender(au, t("- interval '2 days'"));
        await levantar(au, t(desp));
      });
    }
    // Suspensión del EVALUADOR: misma condición (vigente antes del corte excluye; levantada antes, cuenta).
    for (const [nombre, susp, lev, esp] of [["susp-evaluador-vigente", `- ${us}`, null, 0], ["susp-evaluador-levantada", "- interval '12 hours'", "- interval '6 hours'", 1]]) {
      await caso(nombre, esp, async (au, ev, r) => {
        await votar(ev, r, true, t("- interval '1 day'"));
        await suspender(ev, t(susp));
        if (lev) await levantar(ev, t(lev));
      });
    }
    relojLibre();
    const r = await top(S.L, M);
    const pts = Object.fromEntries(r.items.filter((x) => x.estado === "activo").map((x) => [x.id, x.puntos]));
    const ex = exacto(M, T(M));
    const mal = [];
    for (const [nombre, c] of Object.entries(S.casos)) {
      const obtenido = pts[c.au.part] ?? 0;
      if (obtenido !== c.esperado || (ex[c.au.part] ?? 0) !== c.esperado) mal.push(`${nombre}: esperado ${c.esperado}, consolidado ${obtenido}, exacto ${ex[c.au.part] ?? 0}`);
    }
    assert.deepEqual(mal, []);
    console.log(`     ${Object.keys(S.casos).length} fronteras, cada una con su par propio`);
  });

  await prueba("suspender NO cierra tramos (conciliación del 25/10): los votos del autor y del evaluador suspendidos siguen abiertos; el cómputo los excluye sólo mientras la suspensión rige antes del corte", () => {
    const abiertos = (c) => sqlOk(`select count(*) from comunidad.tramos where (autor_participante = ${q(c.part)} or evaluador_participante = ${q(c.part)}) and vigente_hasta is null`);
    for (const nombre of ["susp-autor-empieza-T-1us", "susp-autor-termina-T", "susp-evaluador-vigente", "susp-evaluador-levantada"]) {
      const c = S.casos[nombre];
      assert.equal(abiertos(c.au), "1", `${nombre}: el tramo sigue abierto`);
    }
    // La suspensión vigente al corte excluye; levantada antes, cuenta: comprobado arriba. Acá, sus intervalos reales.
    const intervalo = (c) => sqlOk(`select (desde = ${T("2026-05-01")} - interval '1 microsecond')::text || '|' || coalesce(hasta::text, 'abierta') from comunidad.suspensiones where participante_id = ${q(c.part)}`);
    assert.equal(intervalo(S.casos["susp-autor-empieza-T-1us"].au), "true|abierta");
  });

  // ===================================================================
  console.log("\n— Caso 10 y reproducibilidad (julio de 2026) —");
  await prueba("caso 10: edición, retiro por moderación, suspensión y bajas ENTRE el corte y la primera consulta no cambian el mes; restaurar antes del corte cuenta y después no; cierre repetido sin cambios", async () => {
    const M = "2026-07-01", t = (desp) => `${T(M)} ${desp}`;
    const Y = [];
    for (let i = 0; i < 6; i++) Y.push(await cuenta(`Y${i}`));
    const Ev = await cuenta("ev-baja"), Ew = await cuenta("ev-otro");
    const r = [];
    for (const y of Y) r.push(await publicar(y, t("- interval '20 days'")));
    for (const x of r) await votar(Ew, x, true, t("- interval '5 days'"));
    await votar(Ev, r[0], true, t("- interval '5 days'"));
    // Restauraciones: Y4 antes del corte (cuenta), Y5 después (no).
    await decidir("retirar", r[4].version_id, t("- interval '1 day'"));
    await decidir("restaurar", r[4].version_id, t("- interval '12 hours'"));
    await decidir("retirar", r[5].version_id, t("- interval '1 day'"));
    // Después del corte y antes de la primera consulta:
    await editar(Y[0], r[0], t("+ interval '1 hour'"));
    await decidir("retirar", r[1].version_id, t("+ interval '1 hour'"));
    await suspender(Y[2], t("+ interval '1 hour'"));
    await decidir("restaurar", r[5].version_id, t("+ interval '2 hours'"));
    relojLibre();
    const flujo = (c) => correrFlujo(dependenciasReales({ admin: createClient(URL_API, SRV, opc), url: URL_API, anon: ANON }), { userId: c.uid, email: c.email, password: c.password });
    assert.deepEqual(await flujo(Y[3]), { ok: true }); cuentas.delete(Y[3].uid);
    assert.deepEqual(await flujo(Ev), { ok: true }); cuentas.delete(Ev.uid);
    const lectura = await top(S.L, M);
    const c = consolidado(M);
    const porId = Object.fromEntries(c.filas.filter((x) => x.p).map((x) => [x.p, x.pts]));
    assert.equal(porId[Y[0].part], 2, "Y0: Ew y Ev (la edición y la baja del evaluador son posteriores al corte)");
    assert.equal(porId[Y[1].part], 1, "Y1: retirada después del corte");
    assert.equal(porId[Y[2].part], 1, "Y2: suspendido después del corte");
    assert.equal(porId[Y[4].part], 1, "Y4: restaurada antes del corte");
    assert.equal(porId[Y[5].part], undefined, "Y5: al corte estaba retirada");
    assert.equal(porId[Y[3].part], undefined, "Y3 dado de baja: no se guarda su id");
    assert.equal(c.filas.filter((x) => x.p === null).length, 1, "Y3: guardado SIN id");
    const eliminada = lectura.items.filter((x) => x.estado === "eliminada");
    assert.equal(eliminada.length, 1);
    assert.deepEqual(Object.keys(eliminada[0]).sort(), ["estado", "posicion", "puntos"], "Cuenta eliminada: sin id, nombre ni avatar");
    // Igual al cómputo exacto al corte (función real), recalculado ahora.
    const ex = exacto(M, T(M));
    for (const [p, pts] of Object.entries(porId)) assert.equal(ex[p], pts, `exacto ${p}`);
    // Cierre repetido: nada cambia, ni la marca de consolidación.
    const antes = JSON.stringify(c);
    await top(S.L2, M);
    assert.equal(sqlOk(`select comunidad.consolidar_mes('${M}')::text`), "false", "no recalcula");
    assert.equal(JSON.stringify(consolidado(M)), antes);
    S.julio = { Y, r, Ew };
  });

  await prueba("reproducible: un voto con marca de julio que llega DESPUÉS de consolidar (fixture de reloj) no cambia el mes consolidado, aunque el cómputo de hoy sí lo vería", async () => {
    const M = "2026-07-01";
    const antes = JSON.stringify(consolidado(M));
    const nuevo = await cuenta("ev-tarde");
    await votar(nuevo, S.julio.r[2], true, `${T(M)} - interval '2 hours'`);
    relojLibre();
    await top(S.L, M);
    assert.equal(JSON.stringify(consolidado(M)), antes, "lo consolidado no se recalcula");
    assert.notEqual(exacto(M, T(M))[S.julio.Y[2].part], JSON.parse(antes).filas.find((x) => x.p === S.julio.Y[2].part)?.pts,
      "el cómputo de hoy difiere: la lectura usa lo guardado, no depende del día en que se consulta");
  });

  // ===================================================================
  console.log("\n— Proyección, bloqueo y nombres (E6) —");
  await prueba("proyección: sólo posición, puntos, estado y, para cuentas activas, id de participante, nombre comunitario, avatar del catálogo y propio; nunca user_id, correo, display_name ni semilla", async () => {
    assert.equal((await cambiarNombre(depsNombre, { uid: S.A.uid, nombre: "Autora Del Top", idIntento: randomUUID() })).resultado, "nombre_cambiado");
    sqlOk(`update public.profiles set display_name = 'Privado Del Top', avatar_seed = 'coco' where id = ${q(S.A.uid)}`);
    const r = await top(S.L, "2026-03-01");
    const texto = JSON.stringify(r);
    for (const prohibido of [S.A.uid, S.A.email, "Privado Del Top", "user_id", "email", "avatar_seed"]) assert.ok(!texto.includes(prohibido), prohibido);
    assert.deepEqual(Object.keys(r).sort(), ["activo", "autores", "corte", "items", "mes", "mia"]);
    const a = r.items.find((x) => x.id === S.A.part);
    assert.deepEqual([a.nombre, a.avatar, a.estado, a.propio], ["Autora Del Top", "coco", "activo", false]);
    for (const x of r.items) {
      const permitidas = x.estado === "activo" ? ["avatar", "estado", "id", "nombre", "posicion", "propio", "puntos"] : ["estado", "posicion", "puntos"];
      assert.deepEqual(Object.keys(x).sort(), permitidas);
    }
    assert.ok(topValido(r), "el núcleo del cliente la acepta");
    const propia = await top(S.A, "2026-03-01");
    assert.deepEqual(propia.mia, { posicion: 1, puntos: 2 });
    assert.equal(propia.items.find((x) => x.id === S.A.part).propio, true);
  });

  await prueba("bloqueo: quien bloqueó a D lo ve como «Usuario bloqueado» (con su posición y puntos, sin id ni nombre); otro lector lo ve normal", async () => {
    const d1 = sqlOk(`select version_vigente_id from comunidad.resenas where autor_participante = ${q(S.D.part)}`);
    assert.equal((await ops.bloquear(S.L.uid, Number(d1))).resultado, "bloqueado");
    const r = await top(S.L, "2026-03-01");
    const bloqueado = r.items.filter((x) => x.estado === "bloqueado");
    assert.deepEqual(bloqueado, [{ posicion: 2, puntos: 1, estado: "bloqueado" }]);
    assert.ok(!JSON.stringify(r).includes(S.D.part));
    const otro = await top(S.L2, "2026-03-01");
    assert.ok(otro.items.some((x) => x.id === S.D.part && x.estado === "activo"));
  });

  // ===================================================================
  console.log("\n— Permisos y ruta —");
  await prueba("permisos: anon y service_role no leen (401/403 42501); las funciones internas y las tablas no tienen grants; el interruptor sólo para service_role", async () => {
    for (const token of [ANON, SRV]) {
      const r = await rpcTop(token, "2026-03-01");
      assert.ok((r.status === 401 || r.status === 403) && /42501|permission denied/.test(r.texto), `${r.status} ${r.texto.slice(0, 80)}`);
    }
    assert.equal(sqlOk(`select string_agg(r || ':' || f, ',') from (values ('anon'), ('authenticated'), ('service_role')) v(r),
      (values ('comunidad.puntos_al_corte(date, timestamptz)'), ('comunidad.consolidar_mes(date)')) w(f)
      where has_function_privilege(r, f, 'EXECUTE')`), "");
    assert.equal(sqlOk(`select string_agg(r || ':' || t, ',') from (values ('anon'), ('authenticated'), ('service_role')) v(r),
      (values ('comunidad.top_meses'), ('comunidad.top_resultados')) w(t)
      where has_table_privilege(r, t, 'SELECT') or has_table_privilege(r, t, 'INSERT') or has_table_privilege(r, t, 'UPDATE') or has_table_privilege(r, t, 'DELETE')`), "");
    assert.equal(sqlOk(`select has_function_privilege('authenticated', 'public.comunidad_top_yumpers_activo()', 'EXECUTE')::text
      || has_function_privilege('anon', 'public.comunidad_top_yumpers_activo()', 'EXECUTE')::text
      || has_function_privilege('service_role', 'public.comunidad_top_yumpers_activo()', 'EXECUTE')::text`), "falsefalsetrue");
    // Un mes abierto o futuro, o anterior a 2026: inválido.
    for (const mes of ["2026-10-01", "2027-01-01", "2025-12-01"]) assert.equal((await rpcTop(S.L.jwt, mes)).status, 400, mes);
  });

  await prueba("ruta: sin sesión 401 SÓLO {resultado, activo}; con sesión 200 privado y sin caché; mes inválido 400; interruptores apagados → {activo:false} y el selector desaparece", async () => {
    const vivo = await fetch(`${BASE}/api/comunidad/top-yumpers`).catch(() => null);
    if (!vivo) throw new Error(`NO CORRIDA: no hay servidor en ${BASE}`);
    const sin = await fetch(`${BASE}/api/comunidad/top-yumpers?mes=2026-03`);
    assert.deepEqual([sin.status, await sin.json()], [401, { resultado: "sin_sesion", activo: true }]);
    const con = await fetch(`${BASE}/api/comunidad/top-yumpers?mes=2026-03`, { headers: { Authorization: `Bearer ${S.L2.jwt}` } });
    assert.equal(con.status, 200);
    assert.match(con.headers.get("cache-control") ?? "", /private, no-store/);
    assert.ok(topValido(await con.json()));
    for (const m of ["2026-13", "2026-3", "x"]) assert.equal((await fetch(`${BASE}/api/comunidad/top-yumpers?mes=${m}`, { headers: { Authorization: `Bearer ${S.L2.jwt}` } })).status, 400);
    for (const apagar of [{ top_yumpers_activo: false }, { modulo_activo: false }]) {
      config(apagar);
      try {
        const a = await fetch(`${BASE}/api/comunidad/top-yumpers?mes=2026-03`, { headers: { Authorization: `Bearer ${S.L2.jwt}` } });
        assert.deepEqual(await a.json(), { activo: false });
        const s = await fetch(`${BASE}/api/comunidad/top-yumpers`);
        assert.deepEqual(await s.json(), { resultado: "sin_sesion", activo: false });
      } finally { config({ modulo_activo: true, top_yumpers_activo: true }); }
    }
  });
} finally {
  console.log("\n— Limpieza (base compartida): sólo lo de esta corrida —");
  try {
    try { relojLibre(); } catch { /* ya no está */ }
    aplicarArchivo("scripts/comunidad/solo-local-reloj-quitar.sql");
    const prev = configPrevia;
    config({ modulo_activo: prev.modulo_activo, publicacion_activa: prev.publicacion_activa, top_yumpers_activo: prev.top_yumpers_activo,
      muestreo_activo: prev.muestreo_activo ?? false, limite_resenas: prev.limite_resenas });
    const us = [...cuentas];
    const todos = [...participantes].map(q).join(",");
    for (const mes of MESES) {
      // Sólo meses que esta corrida verificó libres al empezar.
      sqlOk(`delete from comunidad.top_resultados where mes = '${mes}'; delete from comunidad.top_meses where mes = '${mes}'`);
    }
    if (us.length) sqlOk(`delete from comunidad.decisiones where admin_id in (${us.map(q).join(",")})${todos ? ` or participante_id in (${todos})` : ""}`);
    for (const u of us) await srv.auth.admin.deleteUser(u, false);
    if (todos) sqlOk(`begin;
      delete from comunidad.intentos where participante_id in (${todos});
      delete from comunidad.tramos where evaluador_participante in (${todos}) or autor_participante in (${todos});
      delete from comunidad.evaluaciones where evaluador_participante in (${todos}) or autor_participante in (${todos});
      delete from comunidad.denuncias where denunciante_participante in (${todos}) or autor_participante in (${todos});
      delete from comunidad.denuncias_cerradas where denunciante_participante in (${todos});
      delete from comunidad.denuncias_excedentes where autor_participante in (${todos});
      delete from comunidad.corroboraciones where autor_participante in (${todos});
      delete from comunidad.huellas where autor_participante in (${todos});
      delete from comunidad.resenas where autor_participante in (${todos});
      delete from comunidad.bloqueos where bloqueador_participante in (${todos}) or bloqueado_participante in (${todos});
      delete from comunidad.contadores where participante_id in (${todos});
      delete from comunidad.suspensiones where participante_id in (${todos});
      delete from comunidad.participantes where id in (${todos});
      commit;`);
    const lista = us.map(q).join(",") || "null";
    console.log(`   cuentas: ${us.length}; restos (cuentas|participantes|meses|locks|decisiones|reloj|proto_marca igual|interruptores): ${sqlOk(`select
      (select count(*) from auth.users where id in (${lista})) || '|' ||
      (select count(*) from comunidad.participantes where id in (${todos || "null"})) || '|' ||
      (select count(*) from comunidad.top_meses where mes in (${MESES.map((m) => `'${m}'`).join(",")})) || '|' ||
      (select count(*) from pg_locks where locktype = 'advisory') || '|' ||
      (select count(*) from comunidad.decisiones where admin_id in (${lista})) || '|' ||
      (select count(*) from pg_namespace where nspname = 'solo_local')`)}|${sqlOk(DEF_MARCA) === defMarcaAntes}|${sqlOk("select (modulo_activo or publicacion_activa or top_yumpers_activo or muestreo_activo)::text from comunidad.config")}`);
  } catch (e) {
    console.error("   ⚠️ la limpieza falló:", e.message);
    process.exitCode = 1;
  }
  cerrar();
}
