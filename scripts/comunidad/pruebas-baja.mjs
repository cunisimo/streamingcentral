#!/usr/bin/env node
// Contrato de baja de cuenta (E2b): casos B1–B14 del plan contra `supabase
// start`, con las funciones de 012 y el borrado REAL de Auth (API admin del
// GoTrue local). SÓLO LOCAL.
//
// Uso:
//   node scripts/sala/db-local.mjs
//   (servidor de la app con las claves locales en BASE, por defecto
//    http://localhost:3100; ver docs/medidas/2026-10-24-informe-claude-e2b.md)
//   node --env-file=.env.comunidad-local scripts/comunidad/pruebas-baja.mjs
//
// Qué es real y qué no:
//   - el flujo es `correrFlujo` (lib/eliminar-cuenta-flujo.ts) con los
//     adaptadores REALES de la app (lib/eliminar-cuenta-deps.ts): contraseña
//     contra el Auth local, `comunidad_baja_comunitaria` por RPC con la clave
//     de servicio local, `deleteUser` y `getUserById` del GoTrue local;
//   - las fallas también son reales: `deleteUser` falla porque un trigger
//     SÓLO LOCAL (solo-local.sql) aborta el borrado en la base; `getUserById`
//     falla porque su cliente apunta a un puerto cerrado. Lo único envuelto
//     es B5 ("la respuesta se perdió"): el borrado real ocurre y el adaptador
//     descarta su respuesta;
//   - concurrencia con sesiones `psql` reales en el contenedor, coordinadas
//     con un lock consultivo de barrera (7399, n) y esperas observadas en
//     pg_stat_activity, sin `sleep` a ciegas;
//   - PRELIMINARES (plan §5.0): B2, B3a, B3b y B8 usan `resolver_participante`
//     y filas de fixture porque las escrituras comunitarias (E3a) y la
//     consolidación (E7) todavía no existen; B10 y B14 cancelan el marcador
//     con el dueño de la base porque `comunidad_quitar_marcador_baja` es de
//     E4. Se repiten como gate en esas entregas.
//
// La base es compartida: cuentas `@comunidad.test` creadas acá, y al final se
// borran ellas, sus participantes huérfanos y las ayudas sólo locales. Nada
// más se toca. Termina con código 1 si algo no da lo esperado.
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { aplicarArchivo, arnes, contenedor, psql, resultados, sqlOk, urlLocal } from "./local.mjs";
import { dockerVerificado } from "./docker-local.mjs";
import { TEXTO_OK } from "./fixtures.mjs";
import { correrFlujo } from "../../lib/eliminar-cuenta-flujo.ts";
import { dependenciasReales } from "../../lib/eliminar-cuenta-deps.ts";
import { mensajeEliminar } from "../../lib/cuenta/estado-baja-nucleo.ts";

const URL_API = urlLocal(process.env.NEXT_PUBLIC_SUPABASE_URL);
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SRV = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE = process.env.BASE || "http://localhost:3100";
if (!ANON || !SRV) { console.error("Faltan ANON_KEY / SERVICE_ROLE_KEY (¿--env-file=.env.comunidad-local?)"); process.exit(2); }
if (!["localhost", "127.0.0.1"].includes(new URL(BASE).hostname)) { console.error(`BASE no es local: ${BASE}`); process.exit(2); }
const docker = dockerVerificado();
console.log(`docker: ${docker.nombre} (${docker.origen}) → ${docker.host}`);
console.log(`base: ${contenedor()} · API ${URL_API} · app ${BASE}\n`);
if (sqlOk("select count(*) from pg_proc where proname = 'comunidad_baja_comunitaria'") !== "1") {
  console.error("Falta 012_comunidad_baja.sql (¿node scripts/sala/db-local.mjs?)"); process.exit(2);
}

const opcionesCliente = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(URL_API, SRV, opcionesCliente);
// Un puerto cerrado: getUserById falla por red de verdad (B12).
const adminSinRed = createClient("http://127.0.0.1:59999", SRV, opcionesCliente);

const { prueba, cerrar } = arnes();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const q = (v) => { if (!UUID.test(v)) throw new Error(`uuid inesperado: ${v}`); return `'${v}'`; };

// ---------------------------------------------------------------------------
// Cuentas, fixtures y estado
// ---------------------------------------------------------------------------
const cuentasCreadas = new Set();
const participantesCreados = new Set();

async function cuenta(etiqueta) {
  const email = `baja-${etiqueta}-${Date.now()}-${randomBytes(3).toString("hex")}@comunidad.test`;
  const password = `Pb-${randomBytes(18).toString("base64url")}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  cuentasCreadas.add(data.user.id);
  return { uid: data.user.id, email, password };
}

async function token(c) {
  const sb = createClient(URL_API, ANON, opcionesCliente);
  const { data, error } = await sb.auth.signInWithPassword({ email: c.email, password: c.password });
  if (error) throw error;
  return data.session.access_token;
}

/** Participante + reseña publicada para una cuenta (dueño de la base). */
function participanteConResena(c, nombre, tmdb) {
  const r = psql(`do $$
declare p uuid; r bigint; v bigint;
begin
  p := comunidad.resolver_participante(${q(c.uid)}, true);
  update comunidad.participantes set nombre_comunitario = '${nombre}', nombre_cambiado_en = now() where id = p;
  insert into comunidad.resenas (autor_participante, tipo, tmdb_id, primera_publicacion_en)
    values (p, 'movie', ${tmdb}, now()) returning id into r;
  insert into comunidad.versiones (resena_id, autor_participante, texto, estado, version_reglas, id_intento)
    values (r, p, '${TEXTO_OK}', 'publicada', '2026-10-24.2', gen_random_uuid()) returning id into v;
  update comunidad.resenas set version_vigente_id = v where id = r;
  raise notice 'RES|%|%|%', p, r, v;
end $$;`);
  if (r.status !== 0) throw new Error(r.stderr.trim());
  const [p, resena, version] = resultados(r.stderr)[0];
  participantesCreados.add(p);
  c.part = p; c.resena = Number(resena); c.version = Number(version);
  return c;
}

/** Voto positivo con su tramo abierto, de `ev` sobre la versión de `autor`. */
const sqlVoto = (ev, autor) => `
  insert into comunidad.evaluaciones (version_id, autor_participante, evaluador_participante, util)
    values (${autor.version}, ${q(autor.part)}, ${q(ev.part)}, true);
  insert into comunidad.tramos (evaluador_participante, autor_participante, version_id, mes_primera_positiva, vigente_desde)
    values (${q(ev.part)}, ${q(autor.part)}, ${autor.version}, date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires')::date, now());`;

/** El cruce completo entre U y E: votos y tramos en los dos sentidos, denuncias, bloqueos, contador. */
function cruce(u, e) {
  sqlOk(`begin;
${sqlVoto(u, e)}
${sqlVoto(e, u)}
insert into comunidad.denuncias (version_id, autor_participante, denunciante_participante, categoria)
  values (${e.version}, ${q(e.part)}, ${q(u.part)}, 'spam'), (${u.version}, ${q(u.part)}, ${q(e.part)}, 'otro');
insert into comunidad.bloqueos (bloqueador_participante, bloqueado_participante)
  values (${q(u.part)}, ${q(e.part)}), (${q(e.part)}, ${q(u.part)});
insert into comunidad.contadores (participante_id, accion, dia, cantidad)
  values (${q(u.part)}, 'evaluacion', (now() at time zone 'America/Argentina/Buenos_Aires')::date, 1);
commit;`);
}

/** Todo lo que importa de una cuenta y su participante, leído por el dueño. */
function estado(c) {
  const p = c.part ? q(c.part) : "null::uuid";
  return JSON.parse(sqlOk(`select json_build_object(
    'auth', (select count(*) from auth.users where id = ${q(c.uid)}),
    'marcador', (select json_build_object('origen', origen, 'intentos', intentos, 'ultimo_error', ultimo_error,
                   'sancion_hasta', sancion_hasta, 'cancelada', cancelada_en is not null)
                   from comunidad.bajas_en_curso where user_id = ${q(c.uid)}),
    'vinculados', (select count(*) from comunidad.participantes where user_id = ${q(c.uid)}),
    'part_user', (select user_id from comunidad.participantes where id = ${p}),
    'nombre', (select nombre_comunitario from comunidad.participantes where id = ${p}),
    'resenas', (select count(*) from comunidad.resenas where autor_participante = ${p}),
    'versiones', (select count(*) from comunidad.versiones where autor_participante = ${p}),
    'evals_hechas', (select count(*) from comunidad.evaluaciones where evaluador_participante = ${p}),
    'evals_recibidas', (select count(*) from comunidad.evaluaciones where autor_participante = ${p}),
    'tramos_abiertos', (select count(*) from comunidad.tramos where vigente_hasta is null and ${p} in (evaluador_participante, autor_participante)),
    'tramos_cerrados', (select count(*) from comunidad.tramos where vigente_hasta is not null and ${p} in (evaluador_participante, autor_participante)),
    'marcas_cierre', (select count(distinct vigente_hasta) from comunidad.tramos where vigente_hasta is not null and ${p} in (evaluador_participante, autor_participante)),
    'denuncias_hechas', (select count(*) from comunidad.denuncias where denunciante_participante = ${p}),
    'denuncias_recibidas', (select count(*) from comunidad.denuncias where autor_participante = ${p}),
    'bloqueos_hechos', (select count(*) from comunidad.bloqueos where bloqueador_participante = ${p}),
    'bloqueos_recibidos', (select count(*) from comunidad.bloqueos where bloqueado_participante = ${p}),
    'contadores', (select count(*) from comunidad.contadores where participante_id = ${p}),
    'suspensiones', (select count(*) from comunidad.suspensiones where participante_id = ${p}),
    'suspensiones_abiertas', (select count(*) from comunidad.suspensiones where participante_id = ${p} and hasta is null)
  )`));
}

/** El flujo de la app con los adaptadores reales. `envolver` sólo para B4/B5. */
function flujo(c, { adminExistencia, envolver } = {}) {
  let deps = dependenciasReales({ admin, url: URL_API, anon: ANON, adminExistencia });
  if (envolver) deps = envolver(deps);
  return correrFlujo(deps, { userId: c.uid, email: c.email, password: c.password });
}

const fallaBorrado = (c, si) => sqlOk(si
  ? `insert into solo_local.borrado_falla values (${q(c.uid)}) on conflict do nothing`
  : `delete from solo_local.borrado_falla where user_id = ${q(c.uid)}`);

/** resolver_participante como lo llamaría una escritura: SQLSTATE o el id. */
function resolver(c, crear = true) {
  const r = psql(`do $$ begin
  raise notice 'RES|ok|%', comunidad.resolver_participante(${q(c.uid)}, ${crear});
exception when others then raise notice 'RES|%|%', sqlstate, sqlerrm;
end $$;`);
  if (r.status !== 0) throw new Error(r.stderr.trim());
  return resultados(r.stderr)[0];
}

async function rpc(f, args, clave = SRV) {
  const r = await fetch(`${URL_API}/rest/v1/rpc/${f}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${clave}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  return { status: r.status, cuerpo: await r.json().catch(() => null) };
}

// ---------------------------------------------------------------------------
// Sesiones psql concurrentes
// ---------------------------------------------------------------------------
let sesionesAbiertas = [];
class Sesion {
  constructor(nombre) {
    this.nombre = nombre;
    this.out = ""; this.err = "";
    this.p = spawn("docker", ["exec", "-i", contenedor(), "psql", "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=0",
      "-U", "postgres", "-d", "postgres"], { env: docker.env });
    this.p.stdout.on("data", (d) => { this.out += d; });
    this.p.stderr.on("data", (d) => { this.err += d; });
    this.fin = new Promise((r) => this.p.on("close", r));
    this.enviar(`set application_name = 'baja-prueba-${nombre}';`);
    sesionesAbiertas.push(this);
  }
  enviar(sql) { this.p.stdin.write(sql + "\n"); }
  async terminar() {
    this.p.stdin.end();
    await this.fin;
    sesionesAbiertas = sesionesAbiertas.filter((s) => s !== this);
    return { out: this.out.trim(), err: this.err };
  }
}

/** Espera a que la condición SQL dé 't'. Lanza con el estado si no llega. */
async function esperar(condicion, descripcion, ms = 20000) {
  const hasta = Date.now() + ms;
  while (Date.now() < hasta) {
    if (sqlOk(`select (${condicion})::text`) === "true") return;
    await new Promise((r) => setTimeout(r, 150));
  }
  const actividad = sqlOk(`select string_agg(application_name || ':' || coalesce(wait_event_type, '-') || '/' || coalesce(wait_event, '-') || ':' || state, ' | ')
    from pg_stat_activity where application_name like 'baja-prueba-%' or usename = 'supabase_auth_admin'`);
  throw new Error(`no llegó: ${descripcion}. Actividad: ${actividad}`);
}
const esperaLock = (app) => `exists (select 1 from pg_stat_activity where application_name = 'baja-prueba-${app}'
  and wait_event_type = 'Lock' and wait_event = 'advisory')`;
const BARRERA = (n) => `pg_advisory_lock(7399, ${n})`;
const SOLTAR = (n) => `pg_advisory_unlock(7399, ${n})`;

// ===========================================================================
aplicarArchivo("scripts/comunidad/solo-local.sql");
const C = {};

try {
  // =========================================================================
  console.log("— Permisos de las funciones nuevas (SQL con SET ROLE) —");
  await prueba("anon y authenticated no ejecutan las cuatro; service_role no ejecuta las internas", () => {
    const casos = [
      ...["anon", "authenticated"].flatMap((rol) => [
        [rol, "public.comunidad_baja_comunitaria(gen_random_uuid())"],
        [rol, "public.comunidad_baja_comunitaria_admin(gen_random_uuid())"],
        [rol, "public.comunidad_estado_baja(gen_random_uuid())"],
        [rol, "public.comunidad_baja_registrar_fallo(gen_random_uuid(), 'x')"],
      ]),
      ["service_role", "comunidad.resolver_participante(gen_random_uuid(), true)"],
      ["service_role", "comunidad.aplicar_baja(gen_random_uuid(), 'app')"],
      ["service_role", "comunidad.tomar_cuenta(gen_random_uuid())"],
      ["authenticated", "comunidad.resolver_participante(gen_random_uuid(), true)"],
    ];
    // Cada bloque vuelve al rol del dueño: si el intento no falla, `reset
    // role`; si falla, la subtransacción revierte el SET LOCAL. Se exige el
    // mensaje, para que un SET ROLE rechazado no pase por denegación.
    const bloques = casos.map(([rol, f], i) => `do $$ declare st text := 'ok'; m text := ''; begin
      begin execute 'set local role ${rol}'; perform ${f}; execute 'reset role';
      exception when others then st := sqlstate; m := sqlerrm; end;
      raise notice 'RES|${i}|%|%|%', st, m, current_user; end $$;`).join("\n");
    const r = psql(`begin;\n${bloques}\nrollback;`);
    const res = resultados(r.stderr);
    assert.equal(res.length, casos.length, r.stderr);
    const mal = res.filter(([, st, m, quien]) => st !== "42501" || !/permission denied for (function|schema)/.test(m) || quien !== "postgres");
    assert.deepEqual(mal.map(([i, st, m]) => `${casos[i].join(" ")} → ${st} ${m}`), []);
  });
  await prueba("service_role SÍ ejecuta las cuatro (uid inexistente: sin efectos)", () => {
    const r = psql(`begin; set local role service_role;
      select public.comunidad_estado_baja('00000000-0000-4000-8000-00000000dead')::text;
      select public.comunidad_baja_comunitaria('00000000-0000-4000-8000-00000000dead')::text;
      rollback;`);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /"pendiente": false/);
    assert.match(r.stdout, /"cuenta": "inexistente"/);
  });

  // =========================================================================
  console.log("\n— B6: cuenta sin participante —");
  await prueba("B6 · sólo marcador; después deleteUser → completa; el marcador cae con la cuenta", async () => {
    const c = await cuenta("b6");
    let trasPaso1 = null;
    const r = await flujo(c, { envolver: (d) => ({ ...d, bajaComunitaria: async (u) => { const ok = await d.bajaComunitaria(u); trasPaso1 = estado(c); return ok; } }) });
    assert.deepEqual(r, { ok: true });
    assert.equal(trasPaso1.marcador?.origen, "app");
    assert.equal(trasPaso1.vinculados, 0, "no se creó participante");
    const fin = estado(c);
    assert.deepEqual([fin.auth, fin.marcador], [0, null]);
  });

  // =========================================================================
  console.log("\n— B1, B2, B13, B7: baja parcial, ventana, aviso y reintento —");
  C.u = participanteConResena(await cuenta("b1-autor"), "Autora B1", 603);
  C.e = participanteConResena(await cuenta("b1-otro"), "Otro B1", 604);
  cruce(C.u, C.e);
  const antesE = estado(C.e);

  await prueba("B1 · paso 1 confirma y deleteUser FALLA (trigger real) → baja-parcial con el texto del contrato", async () => {
    fallaBorrado(C.u, true);
    const r = await flujo(C.u);
    assert.deepEqual(r, { ok: false, motivo: "baja-parcial" });
    assert.equal(mensajeEliminar(r.motivo), "Borramos tus datos de comunidad, pero no pudimos eliminar la cuenta. Probá de nuevo.");
    const s = estado(C.u);
    assert.equal(s.auth, 1, "la cuenta sigue viva");
    assert.equal(s.marcador?.intentos, 1, "el fallo quedó registrado");
    assert.match(s.marcador?.ultimo_error ?? "", /deleteUser/);
    assert.equal(s.vinculados, 0);
    assert.equal(s.part_user, null, "participante desvinculado");
    assert.equal(s.nombre, null);
    assert.deepEqual([s.resenas, s.versiones, s.evals_hechas, s.evals_recibidas, s.denuncias_hechas, s.denuncias_recibidas, s.bloqueos_hechos, s.contadores],
      [0, 0, 0, 0, 0, 0, 0, 0], "borrado lo comunitario propio");
    assert.deepEqual([s.tramos_abiertos, s.tramos_cerrados, s.marcas_cierre], [0, 2, 1], "dos tramos cerrados con UNA marca");
    assert.equal(s.bloqueos_recibidos, 1, "el bloqueo que le hizo otro no es de esta cuenta: queda");
  });

  await prueba("B1 · lo de la otra cuenta queda: su reseña, su bloqueo; sólo cae lo que colgaba de lo borrado", () => {
    const s = estado(C.e);
    assert.equal(s.resenas, antesE.resenas);
    assert.equal(s.evals_hechas, 0, "su voto era sobre la reseña borrada: cae en cascada");
    assert.equal(s.evals_recibidas, 0, "el voto que recibió era de la cuenta dada de baja");
    assert.equal(s.denuncias_hechas, 0, "su denuncia era sobre la versión borrada");
    assert.equal(s.bloqueos_hechos, 1, "su bloqueo (a un seudónimo) es dato suyo y queda");
    assert.equal(s.tramos_abiertos, 0);
    assert.equal(s.nombre, "Otro B1");
  });

  await prueba("B2 · durante la ventana, otra sesión que quiera escribir (resolver_participante) → baja_en_curso; no se crea participante", () => {
    assert.deepEqual(resolver(C.u, true), ["CB001", "baja_en_curso"]);
    assert.deepEqual(resolver(C.u, false), ["CB001", "baja_en_curso"]);
    assert.equal(estado(C.u).vinculados, 0);
  });

  await prueba("B13 · login nuevo con marcador: GET /api/cuenta/estado-baja → pendiente; otra cuenta no lo ve; sin sesión → 401", async () => {
    const pedir = async (t) => {
      const r = await fetch(`${BASE}/api/cuenta/estado-baja`, { headers: t ? { Authorization: `Bearer ${t}` } : {} });
      return { status: r.status, j: await r.json().catch(() => null), cache: r.headers.get("cache-control") ?? "" };
    };
    const propia = await pedir(await token(C.u));
    assert.equal(propia.status, 200, JSON.stringify(propia.j));
    assert.equal(propia.j.pendiente, true);
    assert.equal(propia.j.intentos, 1);
    assert.match(propia.cache, /no-store/);
    const otra = await pedir(await token(C.e));
    assert.deepEqual([otra.status, otra.j], [200, { pendiente: false }]);
    const sin = await pedir(null);
    assert.equal(sin.status, 401);
    const basura = await pedir("no-es-un-token");
    assert.equal(basura.status, 401);
  });

  await prueba("B7 · reingreso con marcador y reintento: completa; no queda marcador ni vínculo", async () => {
    fallaBorrado(C.u, false);
    const r = await flujo(C.u);
    assert.deepEqual(r, { ok: true });
    const s = estado(C.u);
    assert.deepEqual([s.auth, s.marcador, s.vinculados], [0, null, 0]);
    assert.deepEqual([s.tramos_abiertos, s.tramos_cerrados, s.marcas_cierre], [0, 2, 1], "el reintento no reabrió ni recerró nada");
  });

  // =========================================================================
  console.log("\n— B3a, B3b: escrituras en vuelo (preliminar, §5.0) —");
  await prueba("B3a · escritura que tomó K_CUENTA antes: confirma; la baja espera y después la borra y cierra su tramo", async () => {
    const u = participanteConResena(await cuenta("b3a"), "B3a", 605);
    const e = participanteConResena(await cuenta("b3a-otro"), "B3a otro", 606);
    const ctl = new Sesion("b3a-ctl"), a = new Sesion("b3a-escritura"), b = new Sesion("b3a-baja");
    ctl.enviar(`select ${BARRERA(1)};`);
    await esperar(`exists (select 1 from pg_locks where locktype = 'advisory' and classid = 7399 and objid = 1 and granted)`, "barrera tomada");
    a.enviar(`begin;
select 'A|resolver|' || comunidad.resolver_participante(${q(u.uid)}, true);
${sqlVoto(u, e)}
select 'A|voto|' || clock_timestamp();
select ${BARRERA(1)};
commit;
select 'A|confirmo';`);
    await esperar(esperaLock("b3a-escritura"), "la escritura retiene K_CUENTA y espera la barrera");
    b.enviar(`set role service_role; select 'B|' || public.comunidad_baja_comunitaria(${q(u.uid)})::text;`);
    await esperar(esperaLock("b3a-baja"), "la baja espera K_CUENTA");
    ctl.enviar(`select ${SOLTAR(1)};`);
    const ra = await a.terminar(), rb = await b.terminar(); await ctl.terminar();
    assert.match(ra.out, /A\|confirmo/, ra.err);
    assert.doesNotMatch(ra.err, /ERROR/);
    const baja = JSON.parse(rb.out.match(/B\|(.*)/)[1]);
    assert.equal(baja.marcador, "nuevo");
    assert.equal(baja.evaluaciones_borradas, 1, "borró el voto que confirmó mientras esperaba");
    assert.equal(baja.tramos_cerrados, 1, "y cerró su tramo");
    const s = estado(u);
    assert.deepEqual([s.evals_hechas, s.tramos_abiertos, s.tramos_cerrados], [0, 0, 1]);
    const orden = sqlOk(`select (vigente_hasta > vigente_desde)::text from comunidad.tramos where evaluador_participante = ${q(u.part)}`);
    assert.equal(orden, "true", "el cierre es posterior al voto");
    C.b3a = u;
  });

  await prueba("B3b · escritura que verificó el Bearer antes pero llega después (secuencial): baja_en_curso, nada escrito", () => {
    assert.deepEqual(resolver(C.b3a, true), ["CB001", "baja_en_curso"]);
    assert.equal(estado(C.b3a).vinculados, 0);
  });

  await prueba("B3b · la misma, esperando K_CUENTA mientras la baja confirma: relee el marcador y se rechaza", async () => {
    const u = participanteConResena(await cuenta("b3b"), "B3b", 607);
    const e = participanteConResena(await cuenta("b3b-otro"), "B3b otro", 608);
    const ctl = new Sesion("b3b-ctl"), b = new Sesion("b3b-baja"), a = new Sesion("b3b-escritura");
    ctl.enviar(`select ${BARRERA(2)};`);
    await esperar(`exists (select 1 from pg_locks where locktype = 'advisory' and classid = 7399 and objid = 2 and granted)`, "barrera tomada");
    b.enviar(`begin; set local role service_role;
select 'B|' || public.comunidad_baja_comunitaria(${q(u.uid)})::text;
reset role;
select ${BARRERA(2)};
commit;`);
    await esperar(esperaLock("b3b-baja"), "la baja retiene K_CUENTA sin confirmar");
    a.enviar(`begin;
select 'A|resolver|' || comunidad.resolver_participante(${q(u.uid)}, true);
${sqlVoto(u, e)}
commit;`);
    await esperar(esperaLock("b3b-escritura"), "la escritura espera K_CUENTA");
    ctl.enviar(`select ${SOLTAR(2)};`);
    const rb = await b.terminar(), ra = await a.terminar(); await ctl.terminar();
    assert.match(rb.out, /B\|/);
    assert.match(ra.err, /ERROR:\s+baja_en_curso/);
    assert.doesNotMatch(ra.out, /A\|resolver/);
    const s = estado(u);
    assert.deepEqual([s.vinculados, s.evals_hechas, s.tramos_abiertos], [0, 0, 0]);
  });

  // =========================================================================
  console.log("\n— B4, B5: pedidos simultáneos y respuesta perdida —");
  await prueba("B4 · dos baja_comunitaria a la vez: se serializan; la segunda no cambia nada", async () => {
    const u = participanteConResena(await cuenta("b4-sql"), "B4", 609);
    const e = participanteConResena(await cuenta("b4-sql-otro"), "B4 otro", 610);
    cruce(u, e);
    const ctl = new Sesion("b4-ctl"), x = new Sesion("b4-x"), y = new Sesion("b4-y");
    ctl.enviar(`select ${BARRERA(3)};`);
    await esperar(`exists (select 1 from pg_locks where locktype = 'advisory' and classid = 7399 and objid = 3 and granted)`, "barrera tomada");
    x.enviar(`begin; set local role service_role; select 'X|' || public.comunidad_baja_comunitaria(${q(u.uid)})::text; reset role; select ${BARRERA(3)}; commit;`);
    await esperar(esperaLock("b4-x"), "la primera retiene K_CUENTA");
    y.enviar(`set role service_role; select 'Y|' || public.comunidad_baja_comunitaria(${q(u.uid)})::text;`);
    await esperar(esperaLock("b4-y"), "la segunda espera");
    ctl.enviar(`select ${SOLTAR(3)};`);
    const rx = await x.terminar(), ry = await y.terminar(); await ctl.terminar();
    const bx = JSON.parse(rx.out.match(/X\|(.*)/)[1]), by = JSON.parse(ry.out.match(/Y\|(.*)/)[1]);
    assert.equal(bx.marcador, "nuevo");
    assert.equal(bx.tramos_cerrados, 2);
    assert.equal(by.marcador, "existente");
    assert.equal(by.participante, false, "la segunda ya no encuentra participante vinculado");
    assert.equal(by.tramos_cerrados, undefined);
    C.b4sql = u;
  });

  await prueba("B4 · dos flujos completos a la vez: los dos responden ok (eliminación completa)", async () => {
    const c = C.b4sql;
    let llegaron = 0, abrir; const todos = new Promise((r) => { abrir = r; });
    const juntos = async () => { if (++llegaron === 2) abrir(); await todos; };
    let llegaronB = 0, abrirB; const todosB = new Promise((r) => { abrirB = r; });
    const juntosB = async () => { if (++llegaronB === 2) abrirB(); await todosB; };
    const borrados = [];
    const envolver = (d) => ({
      ...d,
      bajaComunitaria: async (u) => { await juntos(); return d.bajaComunitaria(u); },
      borrar: async (u) => { await juntosB(); const ok = await d.borrar(u); borrados.push(ok); return ok; },
    });
    const [r1, r2] = await Promise.all([flujo(c, { envolver }), flujo(c, { envolver })]);
    assert.deepEqual([r1, r2], [{ ok: true }, { ok: true }]);
    // Observado en el GoTrue local: con los dos realmente simultáneos, los dos
    // pueden responder 200 (el segundo no comprueba que la fila siga). Lo que
    // exige el contrato es la respuesta de los flujos; el caso "uno falla y
    // reconcilia" se fuerza en la prueba siguiente.
    console.log(`   deleteUser simultáneos: ${borrados.join(", ")}`);
    assert.ok(borrados.length === 2 && borrados.includes(true), `deleteUser: ${borrados}`);
    const s = estado(c);
    assert.deepEqual([s.auth, s.marcador, s.vinculados], [0, null, 0]);
  });

  await prueba("B4 · el segundo deleteUser llega cuando el primero ya borró: falla (404) y reconcilia → los dos responden ok", async () => {
    const c = participanteConResena(await cuenta("b4-seq"), "B4 seq", 640);
    // Los dos validan la contraseña y pasan el paso 1 antes de que se borre
    // nada; después, el segundo espera a que el primero termine su borrado.
    let llegaron = 0, abrir; const todos = new Promise((r) => { abrir = r; });
    let primeroBorro; const primero = new Promise((r) => { primeroBorro = r; });
    const borrados = [];
    const envolver = (orden) => (d) => ({
      ...d,
      bajaComunitaria: async (u) => { const ok = await d.bajaComunitaria(u); if (++llegaron === 2) abrir(); await todos; return ok; },
      borrar: async (u) => {
        if (orden === 2) await primero;
        const ok = await d.borrar(u);
        borrados.push(`${orden}:${ok}`);
        if (orden === 1) primeroBorro();
        return ok;
      },
    });
    const [r1, r2] = await Promise.all([flujo(c, { envolver: envolver(1) }), flujo(c, { envolver: envolver(2) })]);
    assert.deepEqual([r1, r2], [{ ok: true }, { ok: true }]);
    assert.deepEqual(borrados, ["1:true", "2:false"]);
    const s = estado(c);
    assert.deepEqual([s.auth, s.marcador, s.vinculados], [0, null, 0]);
  });

  await prueba("B5 · Auth borró pero la respuesta se perdió: reconcilia → completa; sin marcador (cascada)", async () => {
    const c = participanteConResena(await cuenta("b5"), "B5", 611);
    let borroDeVerdad = null;
    const r = await flujo(c, { envolver: (d) => ({ ...d, borrar: async (u) => { borroDeVerdad = await d.borrar(u); throw new Error("respuesta perdida"); } }) });
    assert.equal(borroDeVerdad, true, "el borrado real ocurrió");
    assert.deepEqual(r, { ok: true });
    const s = estado(c);
    assert.deepEqual([s.auth, s.marcador, s.vinculados, s.resenas], [0, null, 0, 0]);
  });

  // =========================================================================
  console.log("\n— B12: no se puede verificar —");
  await prueba("B12 · deleteUser falla y getUserById falla por red → baja-sin-verificar; nunca ok; el marcador sigue", async () => {
    const c = participanteConResena(await cuenta("b12"), "B12", 612);
    C.b12 = c;
    fallaBorrado(c, true);
    const r = await flujo(c, { adminExistencia: adminSinRed });
    assert.deepEqual(r, { ok: false, motivo: "baja-sin-verificar" });
    assert.equal(mensajeEliminar(r.motivo), "No pudimos verificar si tu cuenta se eliminó. Probá de nuevo.");
    const s = estado(c);
    assert.equal(s.auth, 1);
    assert.equal(s.marcador?.intentos, 0, "sin verificar no se registra nada");
    assert.equal(s.vinculados, 0);
  });
  await prueba("B12 · sin configuración para verificar (cliente ausente) → también baja-sin-verificar", async () => {
    assert.deepEqual(await flujo(C.b12, { adminExistencia: null }), { ok: false, motivo: "baja-sin-verificar" });
  });
  await prueba("B12 · el reintento vuelve a reconciliar: con red → baja-parcial; sin la falla → completa", async () => {
    assert.deepEqual(await flujo(C.b12), { ok: false, motivo: "baja-parcial" });
    assert.equal(estado(C.b12).marcador?.intentos, 1);
    fallaBorrado(C.b12, false);
    assert.deepEqual(await flujo(C.b12), { ok: true });
    const s = estado(C.b12);
    assert.deepEqual([s.auth, s.marcador], [0, null]);
  });

  // =========================================================================
  console.log("\n— B9: runbook (baja pedida fuera de la app) —");
  await prueba("B9 · comunidad_baja_comunitaria_admin y después borrado en Auth → completa; la consulta del runbook da 0", async () => {
    const c = participanteConResena(await cuenta("b9"), "B9", 613);
    const e = participanteConResena(await cuenta("b9-otro"), "B9 otro", 614);
    cruce(c, e);
    const r = await rpc("comunidad_baja_comunitaria_admin", { p_uid: c.uid });
    assert.equal(r.status, 200);
    assert.equal(r.cuerpo.origen, "admin");
    assert.equal(r.cuerpo.participantes_vinculados, 0);
    assert.equal(r.cuerpo.tramos_cerrados, 2);
    const { error } = await admin.auth.admin.deleteUser(c.uid, false);
    assert.equal(error, null);
    // La consulta de verificación del runbook (docs/MANTENIMIENTO.md):
    assert.equal(sqlOk(`select count(*) from comunidad.participantes where user_id = ${q(c.uid)}`), "0");
    assert.equal(sqlOk(`select count(*) from comunidad.bajas_en_curso where user_id = ${q(c.uid)}`), "0");
    const s = estado(c);
    assert.deepEqual([s.auth, s.tramos_abiertos, s.tramos_cerrados], [0, 0, 2]);
  });

  // =========================================================================
  console.log("\n— B10, B11, B14: cancelación y suspensiones —");
  await prueba("B10 · el admin cancela el marcador (preliminar: dueño de la base): nada se restaura; la próxima escritura crea OTRO participante", async () => {
    const c = participanteConResena(await cuenta("b10"), "B10", 615);
    const e = participanteConResena(await cuenta("b10-otro"), "B10 otro", 616);
    cruce(c, e);
    const viejo = c.part;
    assert.equal((await rpc("comunidad_baja_comunitaria", { p_uid: c.uid })).status, 200);
    sqlOk(`update comunidad.bajas_en_curso set cancelada_en = now() where user_id = ${q(c.uid)}`);
    assert.deepEqual((await rpc("comunidad_estado_baja", { p_uid: c.uid })).cuerpo, { pendiente: false });
    const [st, nuevo] = resolver(c, true);
    assert.equal(st, "ok");
    assert.notEqual(nuevo, viejo);
    participantesCreados.add(nuevo);
    const sViejo = estado(c);
    assert.equal(sViejo.part_user, null, "el viejo sigue huérfano");
    assert.deepEqual([sViejo.resenas, sViejo.evals_hechas, sViejo.tramos_abiertos, sViejo.nombre], [0, 0, 0, null]);
    c.part = nuevo;
    const sNuevo = estado(c);
    assert.deepEqual([sNuevo.resenas, sNuevo.evals_hechas, sNuevo.tramos_abiertos, sNuevo.tramos_cerrados, sNuevo.suspensiones, sNuevo.nombre],
      [0, 0, 0, 0, 0, null], "sin historial");
    const r = psql(`update comunidad.participantes set user_id = ${q(c.uid)} where id = ${q(viejo)}`);
    assert.match(r.stderr, /no se vuelve a vincular|duplicate key/, "el viejo no se puede volver a vincular");
    C.b10 = c;
  });

  await prueba("B11 · cuenta suspendida pide la baja: se permite; la suspensión no se toca; el marcador impide recrear identidad", async () => {
    const c = participanteConResena(await cuenta("b11"), "B11", 617);
    sqlOk(`insert into comunidad.suspensiones (participante_id, desde) values (${q(c.part)}, now() - interval '1 day')`);
    fallaBorrado(c, true);
    const r = await flujo(c);
    assert.deepEqual(r, { ok: false, motivo: "baja-parcial" }, "paso 1 corrió con la suspensión vigente");
    const s = estado(c);
    assert.equal(s.marcador.sancion_hasta, "infinity");
    assert.deepEqual([s.suspensiones, s.suspensiones_abiertas, s.resenas, s.vinculados], [1, 1, 0, 0]);
    assert.deepEqual(resolver(c, true), ["CB001", "baja_en_curso"], "no nace otro participante sin la suspensión");
    fallaBorrado(c, false);
    assert.deepEqual(await flujo(c), { ok: true });
    assert.equal(estado(c).suspensiones, 1, "la suspensión del seudónimo queda para la reconstrucción");
  });

  await prueba("B14 · suspendida → paso 1 → el admin cancela con la sanción vigente: el participante nuevo nace suspendido hasta sancion_hasta", async () => {
    const c = participanteConResena(await cuenta("b14"), "B14", 618);
    const fin = sqlOk(`insert into comunidad.suspensiones (participante_id, desde, hasta)
      values (${q(c.part)}, now() - interval '1 day', now() + interval '30 days') returning hasta`);
    const b = await rpc("comunidad_baja_comunitaria", { p_uid: c.uid });
    assert.equal(new Date(b.cuerpo.sancion_hasta).getTime(), new Date(fin).getTime());
    sqlOk(`update comunidad.bajas_en_curso set cancelada_en = now() where user_id = ${q(c.uid)}`);
    const [st, nuevo] = resolver(c, true);
    assert.equal(st, "ok");
    participantesCreados.add(nuevo);
    const susp = sqlOk(`select (desde <= now())::text || '|' || hasta::text from comunidad.suspensiones where participante_id = ${q(nuevo)}`);
    const [rige, hasta] = susp.split("|");
    assert.equal(rige, "true");
    assert.equal(new Date(hasta).getTime(), new Date(fin).getTime(), "suspendido hasta la misma fecha");
    // "No publica ni vota": las escrituras llegan en E3a y comprueban esta
    // suspensión (gate en E4). "Sí elimina la cuenta": la baja se reactiva.
    c.part = nuevo;
    const r = await flujo(c);
    assert.deepEqual(r, { ok: true });
    assert.deepEqual([estado(c).auth, estado(c).marcador], [0, null]);
  });

  await prueba("B10/B14 · una baja con marcador cancelado lo REACTIVA (no crea otro)", async () => {
    const c = C.b10;
    const r = await rpc("comunidad_baja_comunitaria", { p_uid: c.uid });
    assert.equal(r.cuerpo.marcador, "reactivado");
    assert.equal(r.cuerpo.participante, true);
    assert.deepEqual((await rpc("comunidad_estado_baja", { p_uid: c.uid })).cuerpo.pendiente, true);
    assert.deepEqual(await flujo(c), { ok: true });
  });

  // =========================================================================
  console.log("\n— B8: borrado por Auth SIN paso 1, con voto concurrente y consolidación esperando (preliminar) —");
  /**
   * Un borrado de Auth real (sin paso 1) mientras una escritura retiene
   * K_CORTE compartido y el K_CUENTA de `quien`, y una consolidación de
   * fixture espera el exclusivo. Devuelve lo observado; las invariantes las
   * comprueba `invariantesB8`.
   */
  async function b8(etiqueta, n, { quienEscribe, despues, consolidacion = true, soltarTardeMs = 0 }) {
    const u = participanteConResena(await cuenta(`b8${etiqueta}`), `B8${etiqueta}`, 619 + n);
    const e = participanteConResena(await cuenta(`b8${etiqueta}-otro`), `B8${etiqueta} otro`, 629 + n);
    cruce(u, e);
    const quien = quienEscribe === "propia" ? u : e;
    const app = `b8${etiqueta}-escritura`;
    const ctl = new Sesion(`b8${etiqueta}-ctl`), esc = new Sesion(app);
    ctl.enviar(`select ${BARRERA(n)};`);
    await esperar(`exists (select 1 from pg_locks where locktype = 'advisory' and classid = 7399 and objid = ${n} and granted)`, "barrera tomada");
    esc.enviar(`begin;
select comunidad.tomar_cuenta(${q(quien.uid)});
select ${BARRERA(n)};
${despues(u, e)}
commit;
select 'V|confirmo';`);
    await esperar(esperaLock(app), "la escritura retiene sus locks y espera la barrera");
    let cons = null;
    if (consolidacion) {
      cons = new Sesion(`b8${etiqueta}-consolidacion`);
      cons.enviar(`begin; select pg_advisory_xact_lock(7301, 0); select 'K|tramos|' || count(*) from comunidad.tramos; commit; select 'K|confirmo';`);
      await esperar(esperaLock(`b8${etiqueta}-consolidacion`), "la consolidación espera el exclusivo");
    }
    const t0 = Date.now();
    const borrado = admin.auth.admin.deleteUser(u.uid, false);
    await esperar(`exists (select 1 from pg_stat_activity where usename = 'supabase_auth_admin' and wait_event_type = 'Lock' and wait_event = 'advisory')`,
      "la transacción de Auth (red de seguridad) espera un lock consultivo");
    const antesDeSoltar = estado(u);
    if (soltarTardeMs) await new Promise((r) => setTimeout(r, soltarTardeMs));
    ctl.enviar(`select ${SOLTAR(n)};`);
    const { error } = await borrado;
    const ms = Date.now() - t0;
    const rv = await esc.terminar();
    const rk = cons ? await cons.terminar() : { out: "K|confirmo", err: "" };
    await ctl.terminar();
    const motivo = (t) => (/deadlock detected/.test(t) ? "deadlock" : /lock timeout/.test(t) ? "lock_timeout" : null);
    const abortada = motivo(rv.err) ? `escritura (${motivo(rv.err)})` : motivo(rk.err) ? `consolidación (${motivo(rk.err)})`
      : error ? `auth (${error.status} ${error.message?.slice(0, 60)})` : "ninguna";
    console.log(`   deleteUser: ${error ? `error ${error.status}` : "ok"} en ${ms} ms · abortada: ${abortada} · escritura ${/V\|confirmo/.test(rv.out) ? "confirmó" : "no confirmó"}`);
    return { u, error, rv, rk, abortada, antesDeSoltar };
  }

  /** Las invariantes del contrato después de B8, con el reintento si Auth se revirtió. */
  async function invariantesB8({ u, error, rk }) {
    assert.match(rk.out, /K\|confirmo/, "la consolidación termina");
    let s = estado(u);
    if (error) {
      assert.deepEqual([s.auth, s.vinculados, s.tramos_abiertos, s.tramos_cerrados, s.resenas], [1, 1, 2, 0, 1],
        "Auth se revirtió ENTERA: cuenta, vínculo, tramos y reseña intactos");
      const { error: e2 } = await admin.auth.admin.deleteUser(u.uid, false);
      assert.equal(e2, null, "el reintento termina");
      s = estado(u);
    }
    assert.deepEqual([s.auth, s.vinculados, s.part_user, s.tramos_abiertos, s.tramos_cerrados, s.marcas_cierre], [0, 0, null, 0, 2, 1],
      "tramos cerrados con UNA marca, participante sin user_id");
    assert.deepEqual([s.resenas, s.evals_hechas, s.bloqueos_hechos, s.nombre], [0, 0, 0, null]);
  }

  // Después de la barrera, la escritura pide las filas de participante (la
  // del autor y la propia, en orden de id, §2.2.4), como haría un voto real.
  const pideFilas = (u, e) => `select 'V|filas|' || count(*) from (select 1 from comunidad.participantes where id in (${q(u.part)}, ${q(e.part)}) order by id for update) t;`;

  await prueba("B8a · voto de OTRA cuenta en vuelo + consolidación esperando: ciclo de colas; la baja termina o se revierte entera", async () => {
    await invariantesB8(await b8("a", 4, { quienEscribe: "otra", despues: pideFilas }));
  });

  await prueba("B8b · escritura de la PROPIA cuenta en vuelo (retiene su K_CUENTA) + consolidación: deadlock real; se aborta una; nunca a medio cerrar", async () => {
    const r = await b8("b", 5, { quienEscribe: "propia", despues: pideFilas });
    assert.notEqual(r.abortada, "ninguna", "un ciclo duro (K_CUENTA ↔ fila) tiene que abortar una transacción");
    await invariantesB8(r);
  });

  await prueba("B8c · escritura de la propia cuenta que retiene K_CUENTA más que lock_timeout (5 s): Auth se revierte ENTERA y el reintento termina", async () => {
    const r = await b8("c", 6, { quienEscribe: "propia", despues: () => "", consolidacion: false, soltarTardeMs: 7000 });
    assert.ok(r.error, "deleteUser tenía que fallar por lock_timeout");
    assert.equal(r.antesDeSoltar.vinculados, 1);
    await invariantesB8(r);
  });
} finally {
  // =========================================================================
  console.log("\n— Limpieza (base compartida) —");
  for (const s of sesionesAbiertas) { try { s.p.kill(); } catch { /* ya cerró */ } }
  try {
    const vivos = [...cuentasCreadas].filter((u) => sqlOk(`select count(*) from auth.users where id = ${q(u)}`) === "1");
    if (vivos.length) {
      for (const p of sqlOk(`select id from comunidad.participantes where user_id in (${vivos.map(q).join(",")})`).split("\n").filter(Boolean)) participantesCreados.add(p);
      sqlOk(`delete from solo_local.borrado_falla`);
      for (const u of vivos) await admin.auth.admin.deleteUser(u, false);
    }
    aplicarArchivo("scripts/comunidad/solo-local-quitar.sql");
    const ps = [...participantesCreados].map(q).join(",");
    if (ps) {
      sqlOk(`begin;
        delete from comunidad.tramos where evaluador_participante in (${ps}) or autor_participante in (${ps});
        delete from comunidad.evaluaciones where evaluador_participante in (${ps}) or autor_participante in (${ps});
        delete from comunidad.denuncias where denunciante_participante in (${ps}) or autor_participante in (${ps});
        delete from comunidad.resenas where autor_participante in (${ps});
        delete from comunidad.bloqueos where bloqueador_participante in (${ps}) or bloqueado_participante in (${ps});
        delete from comunidad.contadores where participante_id in (${ps});
        delete from comunidad.suspensiones where participante_id in (${ps});
        delete from comunidad.participantes where id in (${ps});
        commit;`);
    }
    const restos = sqlOk(`select (select count(*) from auth.users where id in (${[...cuentasCreadas].map(q).join(",") || "null::uuid"}))
      || '|' || (select count(*) from comunidad.participantes where id in (${ps || "null::uuid"}))
      || '|' || (select count(*) from pg_namespace where nspname = 'solo_local')
      || '|' || (select count(*) from pg_trigger where tgname = 'solo_local_falla_borrado')`);
    console.log(`   cuentas creadas: ${cuentasCreadas.size}, participantes: ${participantesCreados.size}; restos (cuentas|participantes|solo_local|trigger): ${restos}`);
    if (restos !== "0|0|0|0") { console.log("✖ quedaron restos"); process.exitCode = 1; }
  } catch (e) {
    console.log("✖ limpieza:", e.message); process.exitCode = 1;
  }
}

cerrar();
