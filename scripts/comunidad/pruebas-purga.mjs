#!/usr/bin/env node
// E8: retención y purga. FUNCIONES REALES contra `supabase start`. SÓLO LOCAL.
//
// Uso:
//   node --env-file=.env.comunidad-local scripts/comunidad/pruebas-purga.mjs
//
// Qué es real: cuentas de Auth, términos, publicar, editar, borrar, votar,
// retirar el voto, denunciar y bloquear (adaptadores de las rutas); retirar,
// restaurar, rechazar, descartar, cerrar, suspender, levantar y pausar con las
// funciones de E4 y un admin con dos TOTP reales; la baja con el flujo de la
// app; la consolidación (`consolidar_mes`), la lectura del Top Yumpers (JWT
// real), el generador de órdenes (`orden_utiles`) y la purga entera
// (`comunidad.purgar`, el procedimiento que programaría cron-comunidad.sql).
//
// Qué es FIXTURE (simulación), y por qué:
//   - el RELOJ de las marcas: solo-local-reloj.sql hace que `proto_marca()`
//     devuelva el instante fijado (como en E7), así votos, ediciones,
//     borrados, retiros, cierres de denuncias, decisiones y suspensiones caen
//     exactamente en el vencimiento o a 1 µs de cada lado;
//   - `ahora` de la purga: el parámetro de `comunidad.purgar` (nunca futuro);
//   - columnas que la base fija con su reloj REAL y no con la marca:
//     `intentos.creado_en` (default now()), `top_meses.consolidado_en`
//     (clock_timestamp) y `denuncias_cerradas.cerrada_en` (la baja usa su
//     clock_timestamp). Se mueven con UPDATE sobre filas de esta corrida;
//   - órdenes de "Más útiles" vencidas: filas propias insertadas como las
//     deja el generador (la vigente, en cambio, la crea el generador real);
//   - plazo de rankings: se cambia SÓLO durante una prueba para consolidar
//     meses de 2025 o para ejercitar la ventana con meses de 2026, y se
//     restaura (los plazos del dueño quedan como estaban).
//
// Meses usados: 2025-04, 2025-05, 2025-07, 2025-08, 2025-09, 2025-10,
// 2026-02, 2026-04 y 2026-08. Al empezar se comprueba que nadie más tenga
// tramos ni resultados en ellos; al terminar se borran sólo los de esta
// corrida. La base es compartida: antes y después se compara una huella de
// los datos ajenos (participantes, reseñas, versiones, suspensiones, votos).
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { aplicarArchivo, arnes, contenedor, psql, sqlOk, urlLocal } from "./local.mjs";
import { Sesion, cerrarSesiones, consultar, esperar, esperaLock } from "./sesiones.mjs";
import { dependenciasEscritura, operacionesComunidad, sha256 } from "../../lib/comunidad/escritura-deps.ts";
import { normalizarTexto } from "../../lib/comunidad/texto.ts";
import { huella, secretoDuplicados } from "../../lib/comunidad/duplicados.ts";
import { TERMINOS_VERSION } from "../../lib/comunidad/terminos.ts";
import { correrFlujo } from "../../lib/eliminar-cuenta-flujo.ts";
import { dependenciasReales } from "../../lib/eliminar-cuenta-deps.ts";

const URL_API = urlLocal(process.env.NEXT_PUBLIC_SUPABASE_URL);
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SRV = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!ANON || !SRV) { console.error("Faltan claves (¿--env-file=.env.comunidad-local?)"); process.exit(2); }
const SECRETO = secretoDuplicados();
if (!SECRETO?.startsWith("local-prueba-")) { console.error("Falta el secreto HMAC LOCAL de prueba"); process.exit(2); }
console.log(`base: ${contenedor()} · API ${URL_API}\n`);

const opc = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const srv = createClient(URL_API, SRV, opc);
const deps = dependenciasEscritura(srv);
const ops = operacionesComunidad(srv);

const { prueba, cerrar } = arnes();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const q = (v) => { if (!UUID.test(v)) throw new Error(`uuid inesperado: ${v}`); return `'${v}'`; };
const cuentas = new Set(), participantes = new Set(), tmdbs = new Set();
const MESES = ["2025-04-01", "2025-05-01", "2025-07-01", "2025-08-01", "2025-09-01", "2025-10-01", "2026-02-01", "2026-04-01", "2026-08-01"];
const S = {};

// --------------------------------------------------------------- tiempo
const AR = "America/Argentina/Buenos_Aires";
/** El `ahora` de referencia: 1/10/2026 00:00 en Argentina. */
const P = "timestamptz '2026-10-01 00:00:00-03'";
const AHORA = "clock_timestamp()";
const menos = (base, iv) => `(((${base}) at time zone '${AR}') - interval '${iv}') at time zone '${AR}'`;
const mas = (base, iv) => `(((${base}) at time zone '${AR}') + interval '${iv}') at time zone '${AR}'`;
const us = (base, n = 1) => `((${base}) + interval '${n} microseconds')`;
const T = (mes) => `comunidad.corte_de_mes('${mes}')`;
const DEF_MARCA = "select md5(pg_get_functiondef('comunidad.proto_marca()'::regprocedure))";
const reloj = (expr) => sqlOk(`insert into solo_local.reloj (id, fijo) values (true, ${expr}) on conflict (id) do update set fijo = excluded.fijo`);
const relojLibre = () => sqlOk("delete from solo_local.reloj");

// --------------------------------------------------------------- la purga
const purgaCfg = (cols) => sqlOk(`update comunidad.purga_config set ${Object.entries(cols).map(([k, v]) => `${k} = ${v}`).join(", ")} where id`);
const ultima = () => JSON.parse(sqlOk("select row_to_json(e)::text from comunidad.purga_ejecuciones e order by id desc limit 1") || "null");
/** Corre la purga real (CALL, transacción propia por lote) y devuelve el registro de esa corrida. */
function purgar(alcance, ahora, { estado = "completa" } = {}) {
  const antes = sqlOk("select coalesce(max(id), 0) from comunidad.purga_ejecuciones");
  sqlOk(`call comunidad.purgar('${alcance}', ${ahora})`);
  const e = ultima();
  assert.ok(e && Number(e.id) > Number(antes), `la corrida ${alcance} no quedó registrada`);
  if (estado) assert.equal(e.estado, estado, `corrida ${alcance}: ${JSON.stringify(e.resumen)}`);
  return e;
}
const borrados = (e, cat) => e.resumen[cat]?.borrados;
const cuenta = (sql) => Number(sqlOk(`select count(*) from ${sql}`));
const existe = (sql) => sqlOk(`select exists (select 1 from ${sql})::text`) === "true";

// --------------------------------------------------------------- cuentas
async function nueva(et, { terminos = true, sesion = false } = {}) {
  const email = `purga-${et}-${Date.now()}-${randomBytes(3).toString("hex")}@comunidad.test`;
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
  if (sesion) {
    const cli = createClient(URL_API, ANON, opc);
    const s = await cli.auth.signInWithPassword({ email, password });
    if (s.error) throw s.error;
    c.jwt = s.data.session.access_token;
  }
  return c;
}
// Textos distintos de verdad: la detección de casi duplicados (015) retendría
// textos que sólo cambian en un número.
const PALABRAS = "luz sombra ritmo guion actores final música paisaje silencio humor drama tensión color montaje voces calma viaje ciudad familia memoria invierno verano promesa secreto puerto tren carta jardín noche mañana".split(" ");
let n = 0, tmdb = 9_890_000 + Math.floor(Math.random() * 1000) * 100;
function texto() {
  const extra = Array.from({ length: 14 }, () => PALABRAS[randomBytes(1)[0] % PALABRAS.length] + randomBytes(2).toString("hex")).join(" ");
  return `Reseña ficticia ${++n} de la prueba de purga. ${extra}.`;
}
const decision = (t, resultado = "publicar") =>
  ({ resultado, version_reglas: "prueba-e8", reglas: resultado === "publicar" ? [] : ["prueba"], huella: huella(normalizarTexto(t), SECRETO) });
async function publicar(c, cuando, { retener = false, id = randomUUID(), titulo = null } = {}) {
  reloj(cuando);
  const t = texto();
  const tm = titulo ?? tmdb++;
  tmdbs.add(tm);
  const r = await deps.publicar({ uid: c.uid, tipo: "movie", tmdbId: tm, texto: t, idIntento: id, hash: sha256(t), decision: decision(t, retener ? "retener" : "publicar") });
  assert.equal(r.resultado, retener ? "retenida" : "publicada", JSON.stringify(r));
  return { ...r, idIntento: id, texto: t, tmdb: tm, hash: sha256(t) };
}
async function editar(c, r, cuando) {
  reloj(cuando);
  const t = texto();
  const x = await deps.editar({ uid: c.uid, resenaId: r.resena_id, versionEsperada: r.version_id, texto: t, decision: decision(t), idIntento: randomUUID(), hash: sha256(t) });
  assert.equal(x.resultado, "publicada", JSON.stringify(x));
  return { ...x, anterior: r.version_id };
}
async function borrar(c, r, cuando) {
  reloj(cuando);
  assert.equal((await ops.borrar(c.uid, r.resena_id)).resultado, "borrada");
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
async function denunciar(d, version, cuando) {
  reloj(cuando);
  const x = await ops.denunciar(d.uid, version, "spam", null);
  assert.equal(x.resultado, "denuncia_registrada", JSON.stringify(x));
}
async function baja(c) {
  relojLibre();
  const r = await correrFlujo(dependenciasReales({ admin: srv, url: URL_API, anon: ANON }), { userId: c.uid, email: c.email, password: c.password });
  assert.ok(r.ok, JSON.stringify(r));
  cuentas.delete(c.uid);
  c.baja = true;
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
  const a = await nueva("admin", { terminos: false });
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
const MOTIVO = "Prueba local de E8 (purga).";
async function admin(fn, args, cuando) {
  reloj(cuando);
  const r = await S.admin.sb.rpc(fn, { ...args, p_motivo: MOTIVO, p_id_intento: randomUUID() });
  assert.equal(r.data?.resultado, "aplicada", `${fn} ${JSON.stringify(args)}: ${JSON.stringify(r.error ?? r.data)}`);
  return r.data;
}
const decidir = (accion, version, cuando) => admin("comunidad_admin_decidir", { p_accion: accion, p_version: version }, cuando);
const suspender = (c, cuando) => admin("comunidad_admin_suspender", { p_participante: c.part }, cuando);
const levantar = (c, cuando) => admin("comunidad_admin_levantar_suspension", { p_participante: c.part }, cuando);

/** Una consulta que la ruta haría con el JWT de `c`: la función real por PostgREST. */
async function rpcTop(c, mes) {
  const r = await fetch(`${URL_API}/rest/v1/rpc/comunidad_top_yumpers`, {
    method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${c.jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_mes: mes }),
  });
  return { status: r.status, texto: await r.text() };
}

// Huella de los datos AJENOS a esta corrida (la base es compartida).
const ajenos = () => {
  // Nunca `not in (null)`: con el conjunto vacío no devolvería ninguna fila.
  const mios = [...participantes].map(q).join(",") || "'00000000-0000-0000-0000-000000000000'";
  return sqlOk(`select json_build_object(
    'participantes', (select count(*) || '/' || md5(coalesce(string_agg(id::text || ':' || coalesce(user_id::text, '-'), ',' order by id), '')) from comunidad.participantes where id not in (${mios})),
    'resenas', (select count(*) || '/' || md5(coalesce(string_agg(id || ':' || coalesce(borrada_en::text, '-') || ':' || version_vigente_id, ',' order by id), '')) from comunidad.resenas where autor_participante not in (${mios})),
    'versiones', (select count(*) || '/' || md5(coalesce(string_agg(id || ':' || estado, ',' order by id), '')) from comunidad.versiones where autor_participante not in (${mios})),
    'suspensiones', (select count(*) || '/' || md5(coalesce(string_agg(id || ':' || coalesce(hasta::text, '-'), ',' order by id), '')) from comunidad.suspensiones where participante_id not in (${mios})),
    'votos', (select count(*) from comunidad.evaluaciones where evaluador_participante not in (${mios})),
    'tramos', (select count(*) from comunidad.tramos where evaluador_participante not in (${mios})),
    'cuentas', (select count(*) from auth.users where email like '%@comunidad.test' and email not like 'purga-%'),
    'perfiles_select', has_table_privilege('authenticated', 'public.profiles', 'select'))::text`);
};
const configPrevia = JSON.parse(sqlOk("select row_to_json(c)::text from comunidad.config c"));
const purgaPrevia = JSON.parse(sqlOk("select row_to_json(c)::text from comunidad.purga_config c"));
const ejecucionesAntes = sqlOk("select coalesce(max(id), 0) from comunidad.purga_ejecuciones");
const defMarcaAntes = sqlOk(DEF_MARCA);
const config = (cols) => sqlOk(`update comunidad.config set ${Object.entries(cols).map(([k, v]) => `${k} = ${v}`).join(", ")} where id`);

try {
  await prueba("preparación: meses libres, registro de purga vacío, purga APAGADA; reloj forzado; módulo y publicación encendidos; admin con dos TOTP", async () => {
    for (const mes of MESES) {
      assert.equal(sqlOk(`select count(*) from comunidad.tramos where mes_primera_positiva = '${mes}'`), "0", `${mes} tiene tramos ajenos`);
      assert.equal(sqlOk(`select count(*) from comunidad.top_meses where mes = '${mes}'`), "0", `${mes} ya está consolidado`);
    }
    assert.equal(sqlOk("select count(*) from comunidad.purga_ejecuciones"), "0", "el registro de ejecuciones no está vacío");
    assert.equal(purgaPrevia.purga_activa, false, "la purga tiene que arrancar apagada");
    assert.equal(sqlOk("select count(*) from pg_namespace where nspname = 'solo_local'"), "0", "quedó un solo_local de otra corrida");
    S.ajenos = ajenos();
    aplicarArchivo("scripts/comunidad/solo-local-reloj.sql");
    config({ modulo_activo: true, publicacion_activa: true, limite_resenas: 500, limite_ediciones: 500, limite_denuncias: 500 });
    S.admin = await adminAal2();
    S.V = []; for (let i = 0; i < 6; i++) S.V.push(await nueva(`vot${i}`));
  });

  await prueba("apagada: con candidatos vencidos, `purgar` no hace nada ni deja registro", async () => {
    const a = await nueva("apagada");
    const r = await publicar(a, menos(P, "20 days"));
    sqlOk(`update comunidad.intentos set creado_en = ${menos(P, "8 days")} where participante_id = ${q(a.part)}`);
    const antes = sqlOk("select count(*) from comunidad.purga_ejecuciones");
    sqlOk(`call comunidad.purgar('dia', ${P})`);
    sqlOk(`call comunidad.purgar('hora', ${P})`);
    assert.equal(sqlOk("select count(*) from comunidad.purga_ejecuciones"), antes);
    assert.ok(existe(`comunidad.intentos where participante_id = ${q(a.part)} and id_intento = ${q(r.idIntento)}`));
    purgaCfg({ purga_activa: true });
  });

  // ===================================================================
  console.log("\n— Intentos de recuperación: 7 días —");
  await prueba("intentos: justo antes se conserva; en y después se borra; idempotente; un reintento con un intento purgado no duplica", async () => {
    const a = await nueva("intentos");
    const r = [await publicar(a, menos(P, "20 days")), await publicar(a, menos(P, "20 days")), await publicar(a, menos(P, "20 days"))];
    const al = [us(menos(P, "7 days")), menos(P, "7 days"), menos(P, "8 days")];
    r.forEach((x, i) => sqlOk(`update comunidad.intentos set creado_en = ${al[i]} where participante_id = ${q(a.part)} and id_intento = ${q(x.idIntento)}`));
    const e = purgar("intentos", P);
    assert.equal(e.estado, "completa");
    const quedan = r.map((x) => existe(`comunidad.intentos where participante_id = ${q(a.part)} and id_intento = ${q(x.idIntento)}`));
    assert.deepEqual(quedan, [true, false, false]);
    assert.equal(borrados(purgar("intentos", P), "intentos"), 0, "idempotente");
    // Reintento del MISMO envío (mismo id, mismo hash y título) con el intento ya purgado: no crea otra reseña.
    reloj(AHORA);
    const re = await deps.publicar({ uid: a.uid, tipo: "movie", tmdbId: r[1].tmdb, texto: r[1].texto, idIntento: r[1].idIntento, hash: r[1].hash, decision: decision(r[1].texto) });
    assert.equal(re.motivo, "resena_existente", JSON.stringify(re));
    assert.equal(cuenta(`comunidad.resenas where autor_participante = ${q(a.part)} and tmdb_id = ${r[1].tmdb}`), 1);
    // Con el intento conservado, el reintento sigue respondiendo lo mismo.
    const ok = await deps.publicar({ uid: a.uid, tipo: "movie", tmdbId: r[0].tmdb, texto: r[0].texto, idIntento: r[0].idIntento, hash: r[0].hash, decision: decision(r[0].texto) });
    assert.equal(ok.repetido, true, JSON.stringify(ok));
  });

  // ===================================================================
  console.log("\n— Órdenes de «Más útiles»: al vencer sus 2 horas (cada hora) —");
  await prueba("órdenes: vigente (1 µs antes) se conserva; vencida en y después se borra con sus tramos; la del generador real se conserva", async () => {
    const t = [tmdb++, tmdb++, tmdb++]; t.forEach((x) => tmdbs.add(x));
    const vence = [us(P), P, menos(P, "1 hour")];
    t.forEach((x, i) => sqlOk(`with o as (insert into comunidad.ordenes_utiles (tipo, tmdb_id, creado_en, vence_en, total)
      values ('movie', ${x}, ${menos(vence[i], "2 hours")}, ${vence[i]}, 1) returning id)
      insert into comunidad.ordenes_utiles_tramos (orden_id, tramo_no, ids) select id, 0, array[1]::bigint[] from o`));
    const real = tmdb++; tmdbs.add(real);
    const id = sqlOk(`select comunidad.orden_utiles('movie', ${real})`);
    const e = purgar("hora", P);
    assert.deepEqual(Object.keys(e.resumen), ["ordenes"], "cada hora: sólo órdenes");
    assert.deepEqual(t.map((x) => existe(`comunidad.ordenes_utiles where tmdb_id = ${x}`)), [true, false, false]);
    assert.equal(cuenta(`comunidad.ordenes_utiles_tramos ot join comunidad.ordenes_utiles o on o.id = ot.orden_id where o.tmdb_id in (${t.join(",")})`), 1);
    purgar("hora", AHORA);
    assert.ok(existe(`comunidad.ordenes_utiles where id = ${id}`), "la vigente del generador real (vence en 2 h) no se toca");
    assert.ok(!existe(`comunidad.ordenes_utiles where tmdb_id = ${t[0]}`), "con el reloj real, la de 1 µs ya venció");
    S.ordenReal = real;
  });

  await prueba("órdenes, concurrencia: un título que el generador está regenerando (lock 7311 tomado) se saltea sin esperar; la corrida siguiente lo borra", async () => {
    const x = tmdb++; tmdbs.add(x);
    sqlOk(`insert into comunidad.ordenes_utiles (tipo, tmdb_id, creado_en, vence_en, total) values ('movie', ${x}, ${menos(P, "3 hours")}, ${menos(P, "1 hour")}, 0)`);
    const g = new Sesion("generador");
    g.enviar(`begin; select pg_advisory_xact_lock(7311, hashtext('movie:${x}')); select 'TOMADO|1';`);
    await esperar(`exists (select 1 from pg_locks l join pg_stat_activity a on a.pid = l.pid where a.application_name = '${g.app}' and l.locktype = 'advisory' and l.classid = 7311 and l.granted)`, "generador con el lock");
    const t0 = Date.now();
    const e = purgar("ordenes", P);
    assert.ok(Date.now() - t0 < 4000, "no esperó al generador");
    assert.equal(e.resumen.ordenes.omitidos, 1);
    assert.ok(existe(`comunidad.ordenes_utiles where tmdb_id = ${x}`));
    g.enviar("commit;");
    await g.terminar();
    purgar("ordenes", P);
    assert.ok(!existe(`comunidad.ordenes_utiles where tmdb_id = ${x}`));
  });

  // ===================================================================
  console.log("\n— Denuncias resueltas: 30 días después del cierre —");
  await prueba("denuncias: cerradas justo antes se conservan; en y después se borran; con otra abierta en la misma versión, se conservan; las abiertas nunca", async () => {
    const A = await nueva("den-autor"), D1 = await nueva("den-1"), D2 = await nueva("den-2");
    S.denunciantes = [D1, D2];
    const r = [];
    for (let i = 0; i < 4; i++) r.push(await publicar(A, menos(P, "60 days")));
    for (const x of r) await denunciar(D1, x.version_id, menos(P, "50 days"));
    const cierre = [menos(P, "30 days"), us(menos(P, "30 days")), menos(P, "31 days"), menos(P, "31 days")];
    for (let i = 0; i < 4; i++) await decidir("descartar", r[i].version_id, cierre[i]);
    await denunciar(D2, r[3].version_id, menos(P, "20 days"));   // caso abierto en r[3]
    // Una abierta vieja (nunca se borra por antigüedad).
    const vieja = await publicar(A, menos(P, "400 days"));
    await denunciar(D1, vieja.version_id, menos(P, "399 days"));
    const den = (v, d) => `comunidad.denuncias where version_id = ${v} and denunciante_participante = ${q(d.part)}`;
    const e = purgar("denuncias", P);
    assert.deepEqual(r.map((x) => existe(den(x.version_id, D1))), [false, true, false, true]);
    assert.ok(existe(den(r[3].version_id, D2)), "la abierta");
    assert.ok(existe(`${den(vieja.version_id, D1)} and estado = 'abierta'`), "abierta de hace más de un año");
    assert.equal(borrados(e, "denuncias"), 2);
    // Las versiones siguen vivas: borrar una denuncia no toca el contenido.
    assert.equal(cuenta(`comunidad.versiones where id in (${r.map((x) => x.version_id).join(",")})`), 4);
    S.denVieja = vieja;
  });

  await prueba("denuncias_cerradas (historial mínimo de la baja): 30 días desde el cierre, mismo criterio", async () => {
    const [D1, D2] = S.denunciantes;
    const filas = [];
    for (const [i, d] of [D1, D2].entries()) {
      const B = await nueva(`den-baja${i}`);
      const r = await publicar(B, menos(P, "45 days"));
      await denunciar(d, r.version_id, menos(P, "44 days"));
      await baja(B);
      const id = sqlOk(`select max(id) from comunidad.denuncias_cerradas where denunciante_participante = ${q(d.part)} and estado = 'cerrada_por_baja'`);
      assert.ok(id, "la baja dejó el historial mínimo");
      filas.push(id);
    }
    // La baja usa su reloj real: se fija el cierre de ESTAS dos filas.
    sqlOk(`update comunidad.denuncias_cerradas set cerrada_en = ${menos(P, "30 days")}, creada_en = ${menos(P, "44 days")} where id = ${filas[0]}`);
    sqlOk(`update comunidad.denuncias_cerradas set cerrada_en = ${us(menos(P, "30 days"))}, creada_en = ${menos(P, "44 days")} where id = ${filas[1]}`);
    purgar("denuncias", P);
    assert.deepEqual(filas.map((id) => existe(`comunidad.denuncias_cerradas where id = ${id}`)), [false, true]);
  });

  // ===================================================================
  console.log("\n— Historial de moderación sin texto: 12 meses —");
  await prueba("decisiones: justo antes se conserva; en y después se borra; se conservan las de casos abiertos, la suspensión vigente y el último estado de la publicación", async () => {
    const A = await nueva("dec-autor"), SX = await nueva("dec-sx"), SY = await nueva("dec-sy"), D = await nueva("dec-den"), D2 = await nueva("dec-den2");
    const B = menos(P, "12 months"), Ant = menos(B, "1 day");
    const r1 = await publicar(A, menos(B, "30 days")), r2 = await publicar(A, menos(B, "30 days")), r3 = await publicar(A, menos(B, "30 days"));
    await decidir("retirar", r1.version_id, Ant);
    await decidir("restaurar", r1.version_id, us(Ant));          // r1 vuelve: caso cerrado
    await decidir("retirar", r2.version_id, Ant);                 // r2 sigue oculta: caso abierto
    await denunciar(D, r3.version_id, menos(Ant, "1 day"));
    await decidir("descartar", r3.version_id, Ant);
    await denunciar(D2, r3.version_id, menos(P, "5 days"));       // otra abierta en r3: caso abierto
    await suspender(SX, B); await levantar(SX, us(B));            // suspender EN el plazo; levantar 1 µs antes
    await suspender(SY, Ant);                                     // sigue suspendido
    await admin("comunidad_admin_publicacion", { p_activa: false }, Ant);
    await admin("comunidad_admin_publicacion", { p_activa: true }, us(Ant));
    const dec = (accion, cond) => sqlOk(`select id from comunidad.decisiones where accion = '${accion}' and ${cond} order by id desc limit 1`);
    const ids = {
      retirar_r1: dec("retirar", `version_id = ${r1.version_id}`), restaurar_r1: dec("restaurar", `version_id = ${r1.version_id}`),
      retirar_r2: dec("retirar", `version_id = ${r2.version_id}`), descartar_r3: dec("descartar", `version_id = ${r3.version_id}`),
      suspender_sx: dec("suspender", `participante_id = ${q(SX.part)}`), levantar_sx: dec("levantar_suspension", `participante_id = ${q(SX.part)}`),
      suspender_sy: dec("suspender", `participante_id = ${q(SY.part)}`),
      pausar: dec("pausar_publicacion", "true"), reanudar: dec("reanudar_publicacion", "true"),
    };
    purgar("decisiones", P);
    const quedan = Object.fromEntries(Object.entries(ids).map(([k, id]) => [k, existe(`comunidad.decisiones where id = ${id}`)]));
    assert.deepEqual(quedan, {
      retirar_r1: false, restaurar_r1: false,     // después del plazo, caso cerrado
      retirar_r2: true,                           // la versión sigue retirada (y el panel muestra el motivo)
      descartar_r3: true,                         // la versión tiene una denuncia abierta
      suspender_sx: false, levantar_sx: true,     // en el plazo / 1 µs antes
      suspender_sy: true,                         // la suspensión todavía rige
      pausar: false, reanudar: true,              // el último estado de la publicación
    });
    // El panel sigue mostrando el motivo del retiro de r2.
    assert.equal(sqlOk(`select (comunidad.ficha_version(v, r)->'retiro'->>'motivo') from comunidad.versiones v join comunidad.resenas r on r.id = v.resena_id where v.id = ${r2.version_id}`), MOTIVO);
    S.decR2 = r2; S.SY = SY;
  });

  // ===================================================================
  console.log("\n— Versiones reemplazadas: 30 días, salvo denuncia pendiente —");
  await prueba("reemplazadas: justo antes se conserva; en y después se borra (con sus votos y huellas; los tramos quedan); con denuncia abierta o cerrada sin vencer, se conserva", async () => {
    const A = await nueva("reem-autor"), D = await nueva("reem-den");
    const r = []; for (let i = 0; i < 5; i++) r.push(await publicar(A, menos(P, "60 days")));
    await votar(S.V[0], r[2], true, menos(P, "55 days"));
    await denunciar(D, r[3].version_id, menos(P, "50 days"));
    await denunciar(D, r[4].version_id, menos(P, "50 days"));
    const ed = [];
    ed.push(await editar(A, r[0], menos(P, "30 days")));
    ed.push(await editar(A, r[1], us(menos(P, "30 days"))));
    ed.push(await editar(A, r[2], menos(P, "31 days")));
    ed.push(await editar(A, r[3], menos(P, "45 days")));
    ed.push(await editar(A, r[4], menos(P, "45 days")));
    await decidir("cerrar", r[4].version_id, menos(P, "20 days"));   // cerrada, vence en P + 10 días
    const viejas = r.map((x) => x.version_id);
    assert.equal(cuenta(`comunidad.huellas where version_id = ${viejas[2]}`), 1);
    assert.equal(cuenta(`comunidad.evaluaciones where version_id = ${viejas[2]}`), 1);
    const e = purgar("reemplazadas", P);
    assert.deepEqual(viejas.map((v) => existe(`comunidad.versiones where id = ${v}`)), [false, true, false, true, true]);
    assert.equal(borrados(e, "reemplazadas"), 2);
    assert.equal(cuenta(`comunidad.huellas where version_id = ${viejas[2]}`), 0, "la huella cae con su versión");
    assert.equal(cuenta(`comunidad.evaluaciones where version_id = ${viejas[2]}`), 0);
    assert.equal(cuenta(`comunidad.tramos where version_id = ${viejas[2]}`), 1, "el tramo no tiene FK: queda para el mes");
    // Las vigentes siguen; la reseña sigue con su vigente y se puede volver a editar.
    assert.equal(cuenta(`comunidad.versiones where id in (${ed.map((x) => x.version_id).join(",")}) and estado = 'publicada'`), 5);
    const otra = await editar(A, ed[0], AHORA);
    assert.ok(existe(`comunidad.versiones where id = ${otra.version_id} and estado = 'publicada'`));
    // Cadena: la denuncia cerrada vence (P + 10 días ≤ hoy) → se purga → la versión ya se puede borrar.
    purgar("denuncias", AHORA);
    purgar("reemplazadas", AHORA);
    assert.ok(!existe(`comunidad.versiones where id = ${viejas[4]}`), "sin denuncia pendiente, se borra");
    assert.ok(existe(`comunidad.versiones where id = ${viejas[3]}`), "con la denuncia abierta, nunca");
  });

  // ===================================================================
  console.log("\n— Textos retirados por moderación: 30 días, salvo denuncia pendiente —");
  await prueba("retiradas: justo antes se conserva; en y después se borra la reseña entera; con una versión anterior denunciada, se conserva; restaurar sigue andando", async () => {
    const A = await nueva("ret-autor"), D = await nueva("ret-den");
    const r = []; for (let i = 0; i < 4; i++) r.push(await publicar(A, menos(P, "60 days")));
    await votar(S.V[1], r[0], true, menos(P, "50 days"));
    await denunciar(D, r[2].version_id, menos(P, "50 days"));
    const r2b = await editar(A, r[2], menos(P, "45 days"));          // la denunciada queda reemplazada, con su denuncia abierta
    await decidir("retirar", r[0].version_id, menos(P, "30 days"));
    await decidir("retirar", r[1].version_id, us(menos(P, "30 days")));
    await decidir("retirar", r2b.version_id, menos(P, "31 days"));
    await decidir("retirar", r[3].version_id, menos(P, "31 days"));
    purgar("retiradas", P);
    assert.deepEqual([r[0], r[1], r[2], r[3]].map((x) => existe(`comunidad.resenas where id = ${x.resena_id}`)), [false, true, true, false]);
    // La retirada hace 12 meses en la prueba de decisiones (r2) también venció: se borra en la misma corrida.
    assert.ok(!existe(`comunidad.resenas where id = ${S.decR2.resena_id}`));
    assert.equal(cuenta(`comunidad.versiones where resena_id = ${r[0].resena_id}`), 0, "sus versiones caen en cascada");
    assert.equal(cuenta(`comunidad.tramos where version_id = ${r[0].version_id}`), 1, "el tramo queda");
    assert.ok(existe(`comunidad.decisiones where version_id = ${r[0].version_id} and accion = 'retirar'`), "la decisión sin texto queda (12 meses)");
    // Restaurar la conservada (1 µs antes) sigue andando.
    await decidir("restaurar", r[1].version_id, AHORA);
    assert.ok(existe(`comunidad.versiones where id = ${r[1].version_id} and estado = 'publicada'`));
    S.retA = A;
  });

  await prueba("retiradas, concurrencia: una reseña tomada por un borrado en vuelo se saltea SIN esperar (nowait); al confirmar, ya no es candidata", async () => {
    const r = await publicar(S.retA, menos(P, "60 days"));
    await decidir("retirar", r.version_id, menos(P, "31 days"));
    reloj(menos(P, "1 day"));
    const b = new Sesion("borrado");
    b.enviar(`begin; select 'B|' || public.comunidad_borrar(${q(S.retA.uid)}, ${r.resena_id})::text;`);
    await esperar(`exists (select 1 from pg_stat_activity where application_name = '${b.app}' and state = 'idle in transaction')`, "borrado en vuelo");
    const t0 = Date.now();
    const e = purgar("retiradas", P);
    assert.ok(Date.now() - t0 < 4000, "no esperó");
    assert.equal(e.resumen.retiradas.omitidos, 1);
    assert.ok(existe(`comunidad.resenas where id = ${r.resena_id}`));
    b.enviar("commit;");
    const fin = await b.terminar();
    assert.match(fin.out, /"resultado": "borrada"/);
    purgar("retiradas", P);
    purgar("borradas", P);
    assert.ok(existe(`comunidad.resenas where id = ${r.resena_id} and borrada_en is not null`), "borrada hace 1 día: todavía no vence");
  });

  // ===================================================================
  console.log("\n— Textos borrados por el autor: 30 días (interpretación de «textos retirados») —");
  await prueba("borradas: justo antes se conserva; en y después se borra; retenida, rechazada o denunciada, se conserva; el autor puede volver a publicar", async () => {
    const A = await nueva("bor-autor"), D = await nueva("bor-den");
    const r = [await publicar(A, menos(P, "60 days")), await publicar(A, menos(P, "60 days")), await publicar(A, menos(P, "60 days"))];
    const ret = await publicar(A, menos(P, "60 days"), { retener: true });
    const rech = await publicar(A, menos(P, "60 days"), { retener: true });
    await decidir("rechazar", rech.version_id, menos(P, "55 days"));
    const den = await publicar(A, menos(P, "60 days"));
    await denunciar(D, den.version_id, menos(P, "50 days"));
    await borrar(A, r[0], menos(P, "30 days"));
    await borrar(A, r[1], us(menos(P, "30 days")));
    await borrar(A, r[2], menos(P, "31 days"));
    for (const x of [ret, rech, den]) await borrar(A, x, menos(P, "40 days"));
    const e = purgar("borradas", P);
    assert.deepEqual([...r, ret, rech, den].map((x) => existe(`comunidad.resenas where id = ${x.resena_id}`)), [false, true, false, true, true, true]);
    assert.equal(borrados(e, "borradas"), 2);
    const otra = await publicar(A, AHORA, { titulo: r[0].tmdb });
    assert.ok(existe(`comunidad.resenas where id = ${otra.resena_id} and borrada_en is null`));
    // Ni con el reloj de hoy: retenida y rechazada no tienen plazo; la denuncia sigue abierta.
    purgar("borradas", AHORA);
    assert.deepEqual([ret, rech, den].map((x) => existe(`comunidad.resenas where id = ${x.resena_id}`)), [true, true, true]);
  });

  // ===================================================================
  console.log("\n— Historial de puntos: tramos, mes consolidado + 30 días —");
  await prueba("tramos: mes sin margen → nada; en el margen → se borran los cerrados que no hacen falta y queda UNO por par vivo; mes sin consolidar → nada; votar, retirar y restaurar siguen con el mes original", async () => {
    const M = "2026-02-01", M2 = "2026-04-01", d = (dia) => `timestamptz '2026-02-${String(dia).padStart(2, "0")} 12:00:00-03'`;
    const A = await nueva("tr-autor", { sesion: true });
    const [E1, E2, E3, E4, E5, E6] = S.V;
    const E7 = await nueva("tr-e7");
    const R = await publicar(A, d(1)), R2 = await publicar(A, d(1)), R4 = await publicar(A, d(1));
    await votar(E1, R, true, d(2)); await retirarVoto(E1, R, d(3)); await votar(E1, R, true, d(4));     // cerrado + abierto
    await votar(E2, R, true, d(2)); await retirarVoto(E2, R, d(3));                                    // un cerrado (memoria)
    await votar(E3, R, true, d(2)); await retirarVoto(E3, R, d(3)); await votar(E3, R, true, d(4)); await retirarVoto(E3, R, d(5)); // dos cerrados
    await votar(E4, R4, true, d(2)); await decidir("retirar", R4.version_id, d(6));                    // versión oculta (memoria)
    await votar(E7, R, true, d(2));                                                                     // evaluador que se da de baja
    await votar(E5, R2, true, d(2)); await borrar(A, R2, d(7));                                         // reseña borrada
    // Mes sin consolidar (abril): un par cerrado.
    const dA = (dia) => `timestamptz '2026-04-${String(dia).padStart(2, "0")} 12:00:00-03'`;
    const RA = await publicar(A, dA(1));
    await votar(E6, RA, true, dA(2)); await retirarVoto(E6, RA, dA(3));
    await baja(E7);
    const tr = (ev, ver) => sqlOk(`select coalesce(string_agg(id || ':' || (vigente_hasta is null)::text || ':' || mes_primera_positiva, ',' order by id), '') from comunidad.tramos where evaluador_participante = ${q(ev.part)} and version_id = ${ver.version_id}`);
    const antes = { E1: tr(E1, R), E2: tr(E2, R), E3: tr(E3, R), E4: tr(E4, R4), E7: tr(E7, R), E5: tr(E5, R2), E6: tr(E6, RA) };
    // Consolidar febrero (real) y fijar cuándo: el 5/3 a las 00:00. Margen: hasta el 4/4 00:00.
    relojLibre();
    assert.equal(sqlOk(`select comunidad.consolidar_mes('${M}')::text`), "true");
    const consolidado = sqlOk(`select json_agg(json_build_object('p', participante_id, 'pts', puntos, 'pos', posicion) order by id)::text from comunidad.top_resultados where mes = '${M}'`);
    sqlOk(`update comunidad.top_meses set consolidado_en = timestamptz '2026-03-05 00:00:00-03' where mes = '${M}'`);
    const LIM = mas("timestamptz '2026-03-05 00:00:00-03'", "30 days");
    purgar("tramos", us(LIM, -1));
    assert.deepEqual({ E1: tr(E1, R), E2: tr(E2, R), E3: tr(E3, R), E4: tr(E4, R4), E7: tr(E7, R), E5: tr(E5, R2), E6: tr(E6, RA) }, antes, "1 µs antes del margen: nada");
    const ids = (s) => s.split(",").filter(Boolean).map((x) => x.split(":"));
    // En vuelo, mientras purga: E3 vuelve a votar (sesión real, sin confirmar).
    reloj("timestamptz '2026-10-20 12:00:00-03'");
    const v = new Sesion("voto");
    v.enviar(`begin; select 'V|' || public.comunidad_votar(${q(E3.uid)}, ${R.version_id}, true)::text;`);
    await esperar(`exists (select 1 from pg_stat_activity where application_name = '${v.app}' and state = 'idle in transaction')`, "voto en vuelo");
    const t0 = Date.now();
    purgar("tramos", LIM);
    assert.ok(Date.now() - t0 < 4000, "la purga no esperó al voto");
    v.enviar("commit;");
    assert.match((await v.terminar()).out, /voto_registrado/);
    const despues = { E1: ids(tr(E1, R)), E2: ids(tr(E2, R)), E3: ids(tr(E3, R)), E4: ids(tr(E4, R4)), E7: ids(tr(E7, R)), E5: ids(tr(E5, R2)), E6: ids(tr(E6, RA)) };
    assert.deepEqual(despues.E1.map((x) => x[1]), ["true"], "E1: se borra el cerrado; queda el abierto");
    assert.deepEqual(despues.E2, ids(antes.E2), "E2: el único cerrado es la memoria del par");
    assert.equal(despues.E3.filter((x) => x[1] === "false").length, 1, "E3: de dos cerrados queda uno");
    assert.equal(despues.E3.filter((x) => x[1] === "true").length, 1, "E3: el voto en vuelo abrió uno nuevo");
    assert.ok(despues.E3.every((x) => x[2] === M), "E3: con el MES ORIGINAL");
    assert.deepEqual(despues.E4, ids(antes.E4), "E4: versión oculta, la memoria queda");
    assert.deepEqual(despues.E7, [], "E7 se dio de baja: no hay memoria que guardar");
    assert.deepEqual(despues.E5, [], "E5: la reseña está borrada");
    assert.deepEqual(despues.E6, ids(antes.E6), "abril no está consolidado: nada");
    // Mes sin consolidar, ni con el reloj de hoy.
    purgar("tramos", AHORA);
    assert.deepEqual(ids(tr(E6, RA)), ids(antes.E6));
    // Lo consolidado no cambia.
    assert.equal(sqlOk(`select json_agg(json_build_object('p', participante_id, 'pts', puntos, 'pos', posicion) order by id)::text from comunidad.top_resultados where mes = '${M}'`), consolidado);
    // Futuras operaciones: votar, retirar y restaurar con el mes original.
    reloj("timestamptz '2026-10-21 12:00:00-03'");
    await votar(E2, R, true, "timestamptz '2026-10-21 12:00:00-03'");
    assert.ok(ids(tr(E2, R)).some((x) => x[1] === "true" && x[2] === M), "E2 vuelve a votar: tramo abierto con febrero");
    await retirarVoto(E2, R, "timestamptz '2026-10-21 13:00:00-03'");
    assert.ok(ids(tr(E2, R)).every((x) => x[1] === "false"));
    await decidir("restaurar", R4.version_id, "timestamptz '2026-10-21 14:00:00-03'");
    assert.ok(ids(tr(E4, R4)).some((x) => x[1] === "true" && x[2] === M), "restaurar reabre con febrero");
    // El Top de febrero se sigue leyendo igual (lo consolidado, no el historial).
    config({ top_yumpers_activo: true });
    try {
      const t = await rpcTop(A, M);
      assert.equal(t.status, 200, t.texto);
      const j = JSON.parse(t.texto);
      assert.equal(j.mes, "2026-02");
      assert.deepEqual(j.items.map((x) => [x.posicion, x.puntos]), JSON.parse(consolidado).map((x) => [x.pos, x.pts]));
    } finally { config({ top_yumpers_activo: false }); }
    S.trA = A;
  });

  // ===================================================================
  console.log("\n— Suspensiones: 12 meses desde su fin y meses del corte liberados —");
  await prueba("suspensiones: dentro de un mes, 12 meses desde el fin (antes/en/después); cruzando un corte, se conserva hasta consolidar + margen; abierta, nunca", async () => {
    const H = "timestamptz '2025-06-20 12:00:00-03'";
    const SA = await nueva("susp-a"), SB = await nueva("susp-b"), SO = await nueva("susp-abierta");
    await suspender(SA, "timestamptz '2025-06-01 12:00:00-03'"); await levantar(SA, menos(H, "1 day"));   // (c) después
    await suspender(SA, menos(H, "12 hours")); await levantar(SA, H);                                    // (a) en
    await suspender(SA, H); await levantar(SA, us(H));                                                   // (b) 1 µs antes
    await suspender(SO, "timestamptz '2025-03-01 12:00:00-03'");                                         // abierta
    const susp = (c) => sqlOk(`select coalesce(string_agg(to_char(hasta at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS.US'), ',' order by id), '') from comunidad.suspensiones where participante_id = ${q(c.part)}`);
    const antesA = susp(SA).split(",");
    purgar("suspensiones", mas(H, "12 months"));
    assert.deepEqual(susp(SA).split(","), [antesA[2]], "sólo queda la de 1 µs antes");
    assert.equal(cuenta(`comunidad.suspensiones where participante_id = ${q(SO.part)} and hasta is null`), 1);
    // Cruzando el corte de mayo de 2025 (1/6): mes sin consolidar → se conserva aunque pasaron 12 meses.
    purgaCfg({ plazo_rankings: "null" });    // sólo para esta prueba: mayo de 2025 sigue "en ventana"
    try {
      await suspender(SB, "timestamptz '2025-05-25 12:00:00-03'"); await levantar(SB, "timestamptz '2025-06-03 12:00:00-03'");
      purgar("suspensiones", AHORA);
      assert.equal(cuenta(`comunidad.suspensiones where participante_id = ${q(SB.part)}`), 1, "mayo sin consolidar: se conserva");
      relojLibre();
      assert.equal(sqlOk("select comunidad.consolidar_mes('2025-05-01')::text"), "true");
      sqlOk("update comunidad.top_meses set consolidado_en = timestamptz '2026-05-20 00:00:00-03' where mes = '2025-05-01'");
      const LIM = mas("timestamptz '2026-05-20 00:00:00-03'", "30 days");
      purgar("suspensiones", us(LIM, -1));
      assert.equal(cuenta(`comunidad.suspensiones where participante_id = ${q(SB.part)}`), 1, "1 µs antes del margen");
      purgar("suspensiones", LIM);
      assert.equal(cuenta(`comunidad.suspensiones where participante_id = ${q(SB.part)}`), 0, "en el margen (y pasados 12 meses del fin)");
    } finally { purgaCfg({ plazo_rankings: "interval '12 months'" }); }
    // Con la ventana de rankings del dueño: abril de 2025 venció → su historial ya no hace falta.
    await suspender(SB, "timestamptz '2025-04-25 12:00:00-03'"); await levantar(SB, "timestamptz '2025-05-03 12:00:00-03'");
    purgar("suspensiones", AHORA);
    assert.equal(cuenta(`comunidad.suspensiones where participante_id = ${q(SB.part)}`), 0, "abril de 2025 fuera de la conservación");
    assert.equal(cuenta(`comunidad.suspensiones where participante_id = ${q(SO.part)} and hasta is null`), 1, "la abierta, nunca");
  });

  // ===================================================================
  console.log("\n— Rankings: 12 meses desde el corte; la ventana de lectura —");
  await prueba("rankings: 1 µs antes del vencimiento se conserva; en y después se borra; un mes purgado NO se reconstruye vacío", async () => {
    const A = await nueva("rk-autor");
    const R = await publicar(A, "timestamptz '2025-07-10 12:00:00-03'");
    await votar(S.V[0], R, true, "timestamptz '2025-08-10 12:00:00-03'");
    await votar(S.V[1], R, true, "timestamptz '2025-09-10 12:00:00-03'");
    await votar(S.V[2], R, true, "timestamptz '2025-10-10 12:00:00-03'");
    await borrar(A, R, "timestamptz '2025-11-05 12:00:00-03'");   // cierra los tramos (después de los tres cortes) y no deja memoria
    relojLibre();
    purgaCfg({ plazo_rankings: "null" });
    try {
      for (const m of ["2025-08-01", "2025-09-01", "2025-10-01"]) assert.equal(sqlOk(`select comunidad.consolidar_mes('${m}')::text`), "true");
    } finally { purgaCfg({ plazo_rankings: "interval '12 months'" }); }
    assert.equal(cuenta("comunidad.top_resultados where mes in ('2025-08-01', '2025-09-01', '2025-10-01')"), 3);
    const VENCE = mas(T("2025-09-01"), "12 months");      // = P
    assert.equal(sqlOk(`select (${VENCE} = ${P})::text`), "true");
    purgar("rankings", us(VENCE, -1));
    const hay = () => ["2025-08-01", "2025-09-01", "2025-10-01"].map((m) => existe(`comunidad.top_meses where mes = '${m}'`));
    assert.deepEqual(hay(), [false, true, true], "agosto venció; septiembre, 1 µs antes");
    assert.equal(cuenta("comunidad.top_resultados where mes = '2025-08-01'"), 0, "con sus resultados");
    purgar("rankings", VENCE);
    assert.deepEqual(hay(), [false, false, true]);
    // El historial de septiembre se puede purgar (fuera de la conservación) y aun así no se reconstruye.
    purgar("tramos", AHORA);
    assert.equal(cuenta("comunidad.tramos where mes_primera_positiva = '2025-09-01'"), 0, "su historial ya no hace falta");
    const r = psql("select comunidad.consolidar_mes('2025-09-01');");
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /mes_invalido/);
    assert.ok(!existe("comunidad.top_meses where mes = '2025-09-01'"), "no se recreó vacío");
  });

  await prueba("ventana de lectura (Top Yumpers, JWT real): un mes fuera de la conservación da 400 y no se consolida; uno dentro, 200 (plazo acortado sólo en esta prueba)", async () => {
    config({ top_yumpers_activo: true });
    const L = await nueva("rk-lector", { sesion: true });
    purgaCfg({ plazo_rankings: "interval '8 months'" });   // T(2026-01) + 8 meses = 1/10/2026 < hoy
    try {
      const fuera = await rpcTop(L, "2026-01-01");
      assert.equal(fuera.status, 400, fuera.texto);
      assert.match(fuera.texto, /mes_invalido/);
      assert.ok(!existe("comunidad.top_meses where mes = '2026-01-01'"), "no se consolidó");
      const r = psql("select comunidad.consolidar_mes('2026-01-01');");
      assert.match(r.stderr, /mes_invalido/);
      const dentro = await rpcTop(L, "2026-08-01");
      assert.equal(dentro.status, 200, dentro.texto);
      assert.equal(JSON.parse(dentro.texto).mes, "2026-08");
    } finally {
      purgaCfg({ plazo_rankings: "interval '12 months'" });
      config({ top_yumpers_activo: false });
    }
  });

  await prueba("rankings, concurrencia: con K_CORTE exclusivo tomado (una consolidación), la purga espera el compartido y termina al soltarlo; si pasa lock_timeout, registra el SQLSTATE y sigue", async () => {
    // Un mes vencido para purgar: julio de 2025 (consolidado con la ventana abierta sólo para prepararlo).
    purgaCfg({ plazo_rankings: "null" });
    try { relojLibre(); assert.equal(sqlOk("select comunidad.consolidar_mes('2025-07-01')::text"), "true"); }
    finally { purgaCfg({ plazo_rankings: "interval '12 months'" }); }
    const c = new Sesion("consolidacion");
    c.enviar("begin; select pg_advisory_xact_lock(7301, 0); select 'X|1';");
    await esperar(`exists (select 1 from pg_locks l join pg_stat_activity a on a.pid = l.pid where a.application_name = '${c.app}' and l.classid = 7301 and l.granted)`, "exclusivo tomado");
    const p = new Sesion("purga");
    p.enviar("call comunidad.purgar('rankings'); select 'FIN|1';");
    await esperar(esperaLock(p, "advisory"), "la purga espera K_CORTE");
    assert.ok(existe("comunidad.top_meses where mes = '2025-07-01'"));
    c.enviar("commit;");
    await esperar(`exists (select 1 from pg_stat_activity where application_name = '${p.app}' and state = 'idle')`, "la purga terminó");
    assert.ok(!existe("comunidad.top_meses where mes = '2025-07-01'"));
    assert.equal(ultima().estado, "completa");
    await p.terminar();
    // Más de 5 s esperando: error registrado (sólo el código), estado con_errores.
    purgaCfg({ plazo_rankings: "null" });
    try { assert.equal(sqlOk("select comunidad.consolidar_mes('2025-07-01')::text"), "true"); }
    finally { purgaCfg({ plazo_rankings: "interval '12 months'" }); }
    c.enviar("begin; select pg_advisory_xact_lock(7301, 0); select 'X|2';");
    await esperar(`exists (select 1 from pg_locks l join pg_stat_activity a on a.pid = l.pid where a.application_name = '${c.app}' and l.classid = 7301 and l.granted)`, "exclusivo tomado otra vez");
    const e = purgar("rankings", AHORA, { estado: "con_errores" });
    c.enviar("commit;");
    await c.terminar();
    assert.equal(e.estado, "con_errores");
    assert.deepEqual(e.resumen.rankings, { borrados: 0, omitidos: 0, lotes: 0, error: "55P03" });
    assert.ok(existe("comunidad.top_meses where mes = '2025-07-01'"), "el lote se revirtió entero");
    purgar("rankings", AHORA);
    assert.ok(!existe("comunidad.top_meses where mes = '2025-07-01'"), "el reintento lo completa");
  });

  // ===================================================================
  console.log("\n— Participantes huérfanos —");
  await prueba("participantes: un desvinculado se borra sólo sin referencias (intentos, bloqueos de otros, tramos, suspensiones); los vinculados nunca", async () => {
    const O1 = await nueva("orf-intento"), O2 = await nueva("orf-bloqueado"), O3 = await nueva("orf-tramo"), O4 = await nueva("orf-susp");
    await publicar(O1, AHORA);
    const r2 = await publicar(O2, AHORA);
    reloj(AHORA); assert.equal((await ops.bloquear(S.V[3].uid, r2.version_id)).resultado, "bloqueado");
    const r3 = await publicar(O3, "timestamptz '2026-04-10 12:00:00-03'");
    await votar(S.V[4], r3, true, "timestamptz '2026-04-11 12:00:00-03'");   // abril: sin consolidar
    await suspender(O4, AHORA);
    for (const o of [O1, O2, O3, O4]) await baja(o);
    const vivos = (os) => os.map((o) => existe(`comunidad.participantes where id = ${q(o.part)}`));
    assert.deepEqual(vivos([O1, O2, O3, O4]), [true, true, true, true]);
    purgar("participantes", AHORA);
    assert.deepEqual(vivos([O1, O2, O3, O4]), [true, true, true, true], "todos tienen alguna referencia");
    sqlOk(`update comunidad.intentos set creado_en = ${menos(AHORA, "8 days")} where participante_id = ${q(O1.part)}`);
    purgar("intentos", AHORA);
    const e = purgar("participantes", AHORA);
    assert.deepEqual(vivos([O1, O2, O3, O4]), [false, true, true, true]);
    assert.equal(borrados(e, "participantes"), 1);
    assert.equal(cuenta(`comunidad.participantes where id in (${[...participantes].map(q).join(",")}) and user_id is not null`) > 0, true);
    for (const o of [O1, O2, O3, O4]) participantes.add(o.part);
  });

  // ===================================================================
  console.log("\n— Lotes, progreso, reintentos e interrupciones —");
  await prueba("lotes: con lote = 2, cinco intentos vencidos salen en 3 lotes confirmados; el registro lleva sólo cantidades", async () => {
    const a = await nueva("lotes");
    for (let i = 0; i < 5; i++) await publicar(a, AHORA);
    sqlOk(`update comunidad.intentos set creado_en = ${menos(AHORA, "10 days")} where participante_id = ${q(a.part)}`);
    purgaCfg({ lote: 2 });
    try {
      const e = purgar("intentos", AHORA);
      assert.deepEqual(e.resumen.intentos, { borrados: 5, omitidos: 0, lotes: 3, error: null });
      assert.equal(cuenta(`comunidad.intentos where participante_id = ${q(a.part)}`), 0);
      for (const v of Object.values(e.resumen)) for (const [k, x] of Object.entries(v)) assert.ok(x === null || typeof x === "number", `${k}: sólo números`);
    } finally { purgaCfg({ lote: purgaPrevia.lote }); }
  });

  await prueba("una corrida por vez: con otra en curso, la segunda queda registrada como `ocupada` y no borra nada", async () => {
    const a = await nueva("ocupada");
    await publicar(a, AHORA);
    sqlOk(`update comunidad.intentos set creado_en = ${menos(AHORA, "10 days")} where participante_id = ${q(a.part)}`);
    const o = new Sesion("otra-purga");
    o.enviar("select pg_advisory_lock(7320, 0); select 'L|1';");
    await esperar(`exists (select 1 from pg_locks l join pg_stat_activity x on x.pid = l.pid where x.application_name = '${o.app}' and l.classid = 7320 and l.granted)`, "otra corrida");
    const e = purgar("intentos", AHORA, { estado: "ocupada" });
    assert.deepEqual(e.resumen, {});
    assert.equal(cuenta(`comunidad.intentos where participante_id = ${q(a.part)}`), 1);
    await o.terminar();
    purgar("intentos", AHORA);
    assert.equal(cuenta(`comunidad.intentos where participante_id = ${q(a.part)}`), 0);
  });

  await prueba("interrupción: cancelada mientras espera en rankings, quedan confirmados SÓLO los lotes anteriores; el lote en curso no deja nada; reintentar completa; repetir no borra más", async () => {
    const a = await nueva("interrupcion");
    for (let i = 0; i < 3; i++) await publicar(a, AHORA);
    sqlOk(`update comunidad.intentos set creado_en = ${menos(AHORA, "10 days")} where participante_id = ${q(a.part)}`);
    purgaCfg({ plazo_rankings: "null" });
    try { relojLibre(); assert.equal(sqlOk("select comunidad.consolidar_mes('2025-07-01')::text"), "true"); }
    finally { purgaCfg({ plazo_rankings: "interval '12 months'" }); }
    const c = new Sesion("consolidacion2");
    c.enviar("begin; select pg_advisory_xact_lock(7301, 0); select 'X|1';");
    await esperar(`exists (select 1 from pg_locks l join pg_stat_activity x on x.pid = l.pid where x.application_name = '${c.app}' and l.classid = 7301 and l.granted)`, "exclusivo tomado");
    const p = new Sesion("purga-dia");
    p.enviar("call comunidad.purgar('dia'); select 'FIN|1';");
    await esperar(esperaLock(p, "advisory"), "la purga llega a rankings y espera");
    // Lo anterior ya está confirmado y visible desde otra sesión, con su progreso.
    assert.equal(cuenta(`comunidad.intentos where participante_id = ${q(a.part)}`), 0);
    const enCurso = ultima();
    assert.equal(enCurso.estado, "en_curso");
    assert.ok(enCurso.resumen.intentos && !enCurso.resumen.rankings && !enCurso.resumen.tramos, JSON.stringify(Object.keys(enCurso.resumen)));
    sqlOk(`select pg_cancel_backend(pid) from pg_stat_activity where application_name = '${p.app}'`);
    await esperar(`exists (select 1 from pg_stat_activity where application_name = '${p.app}' and state = 'idle')`, "cancelada");
    assert.match(p.err, /canceling statement/);
    assert.ok(existe("comunidad.top_meses where mes = '2025-07-01'"), "el lote cancelado no dejó nada");
    assert.equal(ultima().estado, "en_curso", "queda registrada como interrumpida (sin terminar)");
    c.enviar("commit;");
    await c.terminar();
    await p.terminar();          // al cerrar la sesión se libera el lock de corrida (7320)
    const e = purgar("dia", AHORA);
    assert.equal(e.estado, "completa", JSON.stringify(e.resumen));
    assert.ok(!existe("comunidad.top_meses where mes = '2025-07-01'"));
    const otra = purgar("dia", AHORA);
    assert.ok(Object.values(otra.resumen).every((x) => x.borrados === 0 && x.error === null), `idempotente: ${JSON.stringify(otra.resumen)}`);
  });

  await prueba("apagar en curso: la corrida termina el lote que estaba haciendo y no empieza otro (`apagada_en_curso`)", async () => {
    purgaCfg({ plazo_rankings: "null" });
    try { relojLibre(); assert.equal(sqlOk("select comunidad.consolidar_mes('2025-07-01')::text"), "true"); }
    finally { purgaCfg({ plazo_rankings: "interval '12 months'" }); }
    const c = new Sesion("consolidacion3");
    c.enviar("begin; select pg_advisory_xact_lock(7301, 0); select 'X|1';");
    await esperar(`exists (select 1 from pg_locks l join pg_stat_activity x on x.pid = l.pid where x.application_name = '${c.app}' and l.classid = 7301 and l.granted)`, "exclusivo tomado");
    const p = new Sesion("purga-apagar");
    p.enviar("call comunidad.purgar('dia'); select 'FIN|1';");
    await esperar(esperaLock(p, "advisory"), "esperando en rankings");
    purgaCfg({ purga_activa: false });
    c.enviar("commit;");
    await esperar(`exists (select 1 from pg_stat_activity where application_name = '${p.app}' and state = 'idle')`, "terminó");
    await c.terminar(); await p.terminar();
    const e = ultima();
    assert.equal(e.estado, "apagada_en_curso");
    assert.equal(e.resumen.rankings.borrados, 1, "el lote en curso terminó");
    assert.ok(!e.resumen.tramos && !e.resumen.participantes, "no empezó ninguno más");
    purgaCfg({ purga_activa: true });
  });

  // ===================================================================
  console.log("\n— Concurrencia con operaciones reales —");
  await prueba("edición en vuelo: la purga borra la reemplazada VIEJA de esa misma reseña sin esperar; la edición confirma y su anterior queda (recién reemplazada)", async () => {
    const A = await nueva("conc-edicion");
    const r = await publicar(A, menos(P, "60 days"));
    const v2 = await editar(A, r, menos(P, "40 days"));             // r.version_id: reemplazada hace 40 días
    reloj(menos(P, "1 day"));
    const t = texto(), id = randomUUID();
    const e = new Sesion("edicion");
    e.enviar(`begin; select 'E|' || public.comunidad_editar(${q(A.uid)}, ${v2.resena_id}, ${v2.version_id}, '${t}',
      '${JSON.stringify(decision(t))}'::jsonb, ${q(id)}, '${sha256(t)}')::text;`);
    await esperar(`exists (select 1 from pg_stat_activity where application_name = '${e.app}' and state = 'idle in transaction')`, "edición en vuelo");
    const t0 = Date.now();
    purgar("reemplazadas", P);
    assert.ok(Date.now() - t0 < 4000, "no esperó a la edición");
    assert.ok(!existe(`comunidad.versiones where id = ${r.version_id}`), "la vieja se borró");
    e.enviar("commit;");
    assert.match((await e.terminar()).out, /"resultado": "publicada"/);
    assert.ok(existe(`comunidad.versiones where id = ${v2.version_id} and estado = 'reemplazada'`), "la recién reemplazada no vence hasta dentro de 30 días");
    assert.equal(cuenta(`comunidad.versiones where resena_id = ${r.resena_id} and estado = 'publicada'`), 1);
  });

  await prueba("baja en vuelo: la corrida diaria completa termina sin esperar (saltea lo que la baja tiene tomado) y la baja confirma igual", async () => {
    const B = await nueva("conc-baja"), X = await nueva("conc-baja-autor");
    const rx = await publicar(X, menos(P, "70 days"));
    await denunciar(B, rx.version_id, menos(P, "65 days"));
    await decidir("descartar", rx.version_id, menos(P, "40 days"));   // cerrada y vencida: candidata a purga
    const rb = await publicar(B, menos(P, "70 days"));
    relojLibre();
    const b = new Sesion("baja");
    b.enviar(`begin; select 'B|' || public.comunidad_baja_comunitaria(${q(B.uid)})::text;`);
    await esperar(`exists (select 1 from pg_stat_activity where application_name = '${b.app}' and state = 'idle in transaction')`, "baja en vuelo");
    const den = `comunidad.denuncias where version_id = ${rx.version_id} and denunciante_participante = ${q(B.part)}`;
    assert.ok(existe(den), "desde afuera, la baja todavía no se ve");
    const t0 = Date.now();
    const e = purgar("dia", AHORA);
    assert.ok(Date.now() - t0 < 4000, `no esperó a la baja (${Date.now() - t0} ms)`);
    assert.ok(existe(den), "la denuncia tomada por la baja se salteó (skip locked)");
    b.enviar("commit;");
    assert.match((await b.terminar()).out, /B\|/);
    assert.equal(sqlOk(`select (user_id is null)::text from comunidad.participantes where id = ${q(B.part)}`), "true");
    assert.ok(!existe(den), "la baja borró sus denuncias");
    assert.ok(!existe(`comunidad.resenas where id = ${rb.resena_id}`));
    assert.ok(Object.values(e.resumen).every((x) => x.error === null));
  });

  // ===================================================================
  console.log("\n— Permisos —");
  await prueba("permisos: nadie de la API ejecuta la purga ni ve su configuración (SQL y REST)", async () => {
    for (const rol of ["anon", "authenticated", "service_role"]) {
      const r = psql(`set role ${rol}; call comunidad.purgar('dia');`);
      assert.match(r.stderr, /permission denied/, rol);
      const t = psql(`set role ${rol}; select * from comunidad.purga_config;`);
      assert.match(t.stderr, /permission denied/, rol);
    }
    const nuevas = "('mas_plazo','vencido','mes_conservado','historial_libre','par_con_memoria','version_protegida','resena_purgable','purga_tomar','purga_lote','purgar')";
    assert.equal(sqlOk(`select count(*) from pg_proc f, unnest(array['public','anon','authenticated','service_role']) r
      where f.pronamespace = 'comunidad'::regnamespace and f.proname in ${nuevas} and has_function_privilege(r, f.oid, 'EXECUTE')`), "0");
    for (const [quien, token] of [["anon", ANON], ["service_role", SRV]]) {
      for (const f of ["purgar", "purga_lote"]) {
        for (const perfil of [null, "comunidad"]) {
          const h = { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
          if (perfil) h["Content-Profile"] = perfil;
          const r = await fetch(`${URL_API}/rest/v1/rpc/${f}`, { method: "POST", headers: h, body: JSON.stringify({ p_alcance: "dia" }) });
          assert.equal(r.status, perfil ? 406 : 404, `${quien} ${f} ${perfil}`);
        }
      }
      const g = await fetch(`${URL_API}/rest/v1/purga_config`, { headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Accept-Profile": "comunidad" } });
      assert.equal(g.status, 406, quien);
    }
  });

  await prueba("ningún job programado: cron-comunidad.sql no se ejecutó (sólo `sala-barrido` en cron.job)", () => {
    assert.equal(sqlOk("select coalesce(string_agg(jobname, ',' order by jobname), '') from cron.job"), "sala-barrido");
  });

  await prueba("datos ajenos intactos después de todas las corridas", () => {
    assert.equal(ajenos(), S.ajenos);
  });
} finally {
  console.log("\n— Limpieza (base compartida): sólo lo de esta corrida —");
  try {
    await cerrarSesiones();
    try { relojLibre(); } catch { /* ya no está */ }
    aplicarArchivo("scripts/comunidad/solo-local-reloj-quitar.sql");
    const prev = configPrevia;
    config({ modulo_activo: prev.modulo_activo, publicacion_activa: prev.publicacion_activa, top_yumpers_activo: prev.top_yumpers_activo,
      muestreo_activo: prev.muestreo_activo ?? false, limite_resenas: prev.limite_resenas, limite_ediciones: prev.limite_ediciones,
      limite_denuncias: prev.limite_denuncias });
    const pp = purgaPrevia;
    const iv = (x) => (x === null ? "null" : `interval '${x}'`);
    purgaCfg({ purga_activa: pp.purga_activa, lote: pp.lote, plazo_intentos: iv(pp.plazo_intentos), plazo_reemplazadas: iv(pp.plazo_reemplazadas),
      plazo_retiradas: iv(pp.plazo_retiradas), plazo_borradas: iv(pp.plazo_borradas), plazo_denuncias_cerradas: iv(pp.plazo_denuncias_cerradas),
      plazo_decisiones: iv(pp.plazo_decisiones), plazo_rankings: iv(pp.plazo_rankings), margen_historial_puntos: iv(pp.margen_historial_puntos),
      plazo_huellas: iv(pp.plazo_huellas), actualizada_en: `'${pp.actualizada_en}'` });
    sqlOk(`delete from comunidad.purga_ejecuciones where id > ${ejecucionesAntes}`);
    for (const mes of MESES) {
      // Sólo meses que esta corrida verificó libres al empezar.
      sqlOk(`delete from comunidad.top_resultados where mes = '${mes}'; delete from comunidad.top_meses where mes = '${mes}'`);
    }
    if (tmdbs.size) sqlOk(`delete from comunidad.ordenes_utiles where tipo = 'movie' and tmdb_id in (${[...tmdbs].join(",")})`);
    const us_ = [...cuentas];
    const todos = [...participantes].map(q).join(",");
    if (us_.length) sqlOk(`delete from comunidad.decisiones where admin_id in (${us_.map(q).join(",")})${todos ? ` or participante_id in (${todos})` : ""}`);
    for (const u of us_) await srv.auth.admin.deleteUser(u, false);
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
    const lista = us_.map(q).join(",") || "null";
    console.log(`   cuentas: ${us_.length}; restos (cuentas|participantes|meses|órdenes|ejecuciones|locks|decisiones|reloj|proto_marca igual|interruptores|purga): ${sqlOk(`select
      (select count(*) from auth.users where id in (${lista}) or email like 'purga-%@comunidad.test') || '|' ||
      (select count(*) from comunidad.participantes where id in (${todos || "null"})) || '|' ||
      (select count(*) from comunidad.top_meses where mes in (${MESES.map((m) => `'${m}'`).join(",")})) || '|' ||
      (select count(*) from comunidad.ordenes_utiles where tmdb_id in (${[...tmdbs].join(",") || "null"})) || '|' ||
      (select count(*) from comunidad.purga_ejecuciones) || '|' ||
      (select count(*) from pg_locks where locktype = 'advisory') || '|' ||
      (select count(*) from comunidad.decisiones where admin_id in (${lista})) || '|' ||
      (select count(*) from pg_namespace where nspname = 'solo_local')`)}|${sqlOk(DEF_MARCA) === defMarcaAntes}|${sqlOk("select (modulo_activo or publicacion_activa or top_yumpers_activo or muestreo_activo)::text from comunidad.config")}|${sqlOk("select purga_activa::text from comunidad.purga_config")}`);
  } catch (e) {
    console.error("   ⚠️ la limpieza falló:", e.message);
    process.exitCode = 1;
  }
  cerrar();
}
