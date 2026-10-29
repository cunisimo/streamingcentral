#!/usr/bin/env node
// E2c: orden de locks y concurrencia base, con varias sesiones REALES de
// PostgreSQL en `supabase start`. SÓLO LOCAL.
//
// Uso:
//   node scripts/sala/db-local.mjs
//   node --env-file=.env.comunidad-local scripts/comunidad/pruebas-concurrencia.mjs
//
// QUÉ ES REAL Y QUÉ ES FIXTURE (plan §5.0). Las primitivas del protocolo
// (013: proto_cuenta, proto_participantes … proto_marca, proto_corte_exclusivo,
// corte_de_mes, rige_antes_de, mes_ar) y resolver_participante (012) son las
// REALES. Las OPERACIONES que las usan —votar, retirar, editar, suspender y la
// consolidación— son FIXTURES de esta batería: siguen el orden del protocolo,
// pero no son `comunidad_votar` (E3a), la suspensión de E4 ni `consolidar_mes`
// (E7), que todavía no existen. Por eso todos los casos 1–7 y 11 son
// PRELIMINARES: prueban las primitivas y el orden, no las funciones de
// producto, y se repiten como gate con esas funciones (E3a: 1–4; E4: 5;
// E7: 6–11; todos otra vez en E9a). Ninguna fixture se presenta como
// validación de una función inexistente.
//
// Cada caso escribe ANTES su resultado esperado (en el nombre de la prueba y
// en sus aserciones). Las esperas se observan en pg_stat_activity; además
// cada sesión activa `log_lock_waits` y al final se juntan del log de
// Postgres las líneas de espera, deadlock y timeout de la corrida.
//
// La base es compartida: cuentas `@comunidad.test` creadas acá; al final se
// borran ellas y sus participantes. Termina con código 1 si algo falla.
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { arnes, contenedor, psql, resultados, sqlOk, urlLocal } from "./local.mjs";
import { dockerVerificado } from "./docker-local.mjs";
import { TEXTO_OK } from "./fixtures.mjs";
import { Sesion, barrera, cerrarSesiones, consultar, esperaLock, esperar, BARRERA } from "./sesiones.mjs";

const URL_API = urlLocal(process.env.NEXT_PUBLIC_SUPABASE_URL);
const SRV = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SRV) { console.error("Falta SUPABASE_SERVICE_ROLE_KEY (¿--env-file=.env.comunidad-local?)"); process.exit(2); }
const docker = dockerVerificado();
console.log(`docker: ${docker.nombre} (${docker.origen}) → ${docker.host}`);
console.log(`base: ${contenedor()} · API ${URL_API}`);
if (sqlOk("select count(*) from pg_proc where proname = 'proto_marca'") !== "1") {
  console.error("Falta 013_comunidad_protocolo.sql (¿node scripts/sala/db-local.mjs?)"); process.exit(2);
}
const inicioCorrida = sqlOk("select now()");
console.log(`inicio: ${inicioCorrida}\n`);

const admin = createClient(URL_API, SRV, { auth: { persistSession: false, autoRefreshToken: false } });
const { prueba: pruebaArnes, cerrar } = arnes();
// SOLO=<texto>: corre sólo las pruebas cuyo nombre lo contiene (para la
// evidencia antes/después de una corrección). Sin SOLO, corren todas.
const SOLO = process.env.SOLO ?? "";
const prueba = (nombre, fn) => (!SOLO || nombre.includes(SOLO) ? pruebaArnes(nombre, fn) : Promise.resolve());
if (SOLO) console.log(`(sólo las pruebas que contienen «${SOLO}»)\n`);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const q = (v) => { if (!UUID.test(v)) throw new Error(`uuid inesperado: ${v}`); return `'${v}'`; };

// ---------------------------------------------------------------------------
// Fixtures: cuentas reales del Auth local y filas puestas por el dueño.
// ---------------------------------------------------------------------------
const cuentasCreadas = new Set();
const participantesCreados = new Set();
let tmdb = 700;

async function cuenta(etiqueta) {
  const email = `conc-${etiqueta}-${Date.now()}-${randomBytes(3).toString("hex")}@comunidad.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: randomBytes(18).toString("base64url"), email_confirm: true });
  if (error) throw error;
  cuentasCreadas.add(data.user.id);
  return { uid: data.user.id };
}

/** Participante con una reseña publicada (dueño de la base, fuera de cualquier sesión de prueba). */
async function autor(etiqueta) {
  const c = await cuenta(etiqueta);
  const r = psql(`do $$
declare p uuid; r bigint; v bigint;
begin
  p := comunidad.resolver_participante(${q(c.uid)}, true);
  insert into comunidad.resenas (autor_participante, tipo, tmdb_id, primera_publicacion_en)
    values (p, 'movie', ${tmdb++}, now()) returning id into r;
  insert into comunidad.versiones (resena_id, autor_participante, texto, estado, version_reglas, id_intento)
    values (r, p, '${TEXTO_OK}', 'publicada', '2026-10-24.2', gen_random_uuid()) returning id into v;
  update comunidad.resenas set version_vigente_id = v where id = r;
  raise notice 'RES|%|%|%', p, r, v;
end $$;`);
  if (r.status !== 0) throw new Error(r.stderr.trim());
  const [p, resena, version] = resultados(r.stderr)[0];
  participantesCreados.add(p);
  return { ...c, part: p, resena: Number(resena), version: Number(version) };
}

/** Participante sin reseña. */
async function lector(etiqueta) {
  const c = await cuenta(etiqueta);
  const p = sqlOk(`select comunidad.resolver_participante(${q(c.uid)}, true)`);
  participantesCreados.add(p);
  return { ...c, part: p };
}

const partDe = (c) => `(select id from comunidad.participantes where user_id = ${q(c.uid)})`;

// ---------------------------------------------------------------------------
// Operaciones de FIXTURE. Todas siguen §2.2.4 con las primitivas reales:
//   proto_cuenta → proto_participantes → [proto_resena] → proto_versiones →
//   proto_votos → proto_suspensiones → relectura → proto_marca → escritura.
// `pausa` = número de barrera; `pausaEn` = después de qué paso se detiene.
// Cada una avisa su resultado con `RES|…` (raise notice) y nada más.
// ---------------------------------------------------------------------------
const pausar = (o, en) => (o.pausa && o.pausaEn === en ? BARRERA(o.pausa) : "");

function votar(o) {
  const { ev, au, util = true } = o;
  const V = o.version ?? au.version;
  return `begin;
${o.lockTimeout ? `set local lock_timeout = '${o.lockTimeout}';` : ""}
select 'OP|cuenta|' || comunidad.proto_cuenta(${q(ev.uid)}, true);
${pausar(o, 1)}
select 'OP|n2|' || count(*) from comunidad.proto_participantes(array[${partDe(ev)}, ${q(au.part)}]::uuid[]);
${pausar(o, 2)}
select 'OP|n4|' || count(*) from comunidad.proto_versiones(array[${V}]::bigint[]);
select 'OP|n5|' || count(*) from comunidad.proto_votos(array[${partDe(ev)}]::uuid[], array[${V}]::bigint[]);
select 'OP|n6|' || count(*) from comunidad.proto_suspensiones(array[${partDe(ev)}, ${q(au.part)}]::uuid[]);
${pausar(o, 6)}
do $$
declare m timestamptz; v_ev uuid; v_estado text; v_autor uuid; v_vig bigint;
begin
  select id into v_ev from comunidad.participantes where user_id = ${q(ev.uid)};
  -- 3. relectura de lo ya bloqueado
  select estado, autor_participante into v_estado, v_autor from comunidad.versiones where id = ${V};
  if v_estado is distinct from 'publicada' then
    raise exception 'conflicto_version' using errcode = 'CB003', detail = coalesce(v_estado, 'sin versión');
  end if;
  if exists (select 1 from comunidad.suspensiones s where s.participante_id in (v_ev, v_autor)
              and s.desde <= clock_timestamp() and (s.hasta is null or s.hasta > clock_timestamp())) then
    raise exception 'suspendido' using errcode = 'CB004';
  end if;
  -- 4. marca, 5. mutación
  m := comunidad.proto_marca();
  select id into v_vig from comunidad.evaluaciones
   where evaluador_participante = v_ev and version_id = ${V} and retirada_en is null;
  if v_vig is null then
    insert into comunidad.evaluaciones (version_id, autor_participante, evaluador_participante, util, creada_en, actualizada_en)
    values (${V}, v_autor, v_ev, ${util}, m, m);
  else
    update comunidad.evaluaciones set util = ${util}, actualizada_en = m where id = v_vig;
  end if;
  if ${util} then
    if not exists (select 1 from comunidad.tramos where evaluador_participante = v_ev and version_id = ${V} and vigente_hasta is null) then
      insert into comunidad.tramos (evaluador_participante, autor_participante, version_id, mes_primera_positiva, vigente_desde)
      values (v_ev, v_autor, ${V}, comunidad.mes_ar(m), m);
    end if;
  else
    update comunidad.tramos set vigente_hasta = m
     where evaluador_participante = v_ev and version_id = ${V} and vigente_hasta is null;
  end if;
  raise notice 'RES|voto|%', m;
end $$;
${pausar(o, "fin")}
commit;`;
}

function retirar(o) {
  const { ev, au } = o;
  const V = o.version ?? au.version;
  return `begin;
select 'OP|cuenta|' || comunidad.proto_cuenta(${q(ev.uid)}, false);
select 'OP|n2|' || count(*) from comunidad.proto_participantes(array[${partDe(ev)}, ${q(au.part)}]::uuid[]);
${pausar(o, 2)}
select 'OP|n4|' || count(*) from comunidad.proto_versiones(array[${V}]::bigint[]);
select 'OP|n5|' || count(*) from comunidad.proto_votos(array[${partDe(ev)}]::uuid[], array[${V}]::bigint[]);
do $$
declare m timestamptz; v_ev uuid; v_vig bigint;
begin
  select id into v_ev from comunidad.participantes where user_id = ${q(ev.uid)};
  select id into v_vig from comunidad.evaluaciones
   where evaluador_participante = v_ev and version_id = ${V} and retirada_en is null;
  if v_vig is null then
    raise notice 'RES|retiro|noop';
    return;
  end if;
  m := comunidad.proto_marca();
  update comunidad.evaluaciones set retirada_en = m, actualizada_en = m where id = v_vig;
  update comunidad.tramos set vigente_hasta = m
   where evaluador_participante = v_ev and version_id = ${V} and vigente_hasta is null;
  raise notice 'RES|retiro|%', m;
end $$;
${pausar(o, "fin")}
commit;`;
}

/** Edición: versión nueva, la anterior reemplazada, votos reiniciados y sus tramos cerrados. */
function editar(o) {
  const { au, esperada, intento, texto = `${TEXTO_OK} Editada.` } = o;
  return `begin;
select 'OP|cuenta|' || comunidad.proto_cuenta(${q(au.uid)}, false);
select 'OP|n2|' || count(*) from comunidad.proto_participantes(array[${q(au.part)}]::uuid[]);
${pausar(o, 2)}
select 'OP|n3|' || count(*) from comunidad.proto_resena(${au.resena});
select 'OP|n4|' || count(*) from comunidad.proto_versiones(array[${esperada}]::bigint[]);
select 'OP|n5|' || count(*) from comunidad.proto_votos(
  coalesce((select array_agg(distinct evaluador_participante) from comunidad.evaluaciones where version_id = ${esperada}), '{}'::uuid[]),
  array[${esperada}]::bigint[]);
select 'OP|n6|' || count(*) from comunidad.proto_suspensiones(array[${q(au.part)}]::uuid[]);
${pausar(o, 6)}
do $$
declare m timestamptz; v_vig bigint; v_nueva bigint; v_votos integer;
begin
  select id into v_nueva from comunidad.versiones where resena_id = ${au.resena} and id_intento = '${intento}';
  if found then
    raise notice 'RES|edicion|mismo-intento|%', v_nueva;
    return;
  end if;
  select version_vigente_id into v_vig from comunidad.resenas where id = ${au.resena};
  if v_vig is distinct from ${esperada} then
    raise exception 'conflicto_version' using errcode = 'CB003', detail = format('vigente %s, esperada %s', v_vig, ${esperada});
  end if;
  m := comunidad.proto_marca();
  update comunidad.versiones set estado = 'reemplazada', decidida_en = m where id = ${esperada};
  insert into comunidad.versiones (resena_id, autor_participante, texto, estado, version_reglas, id_intento, creada_en)
  values (${au.resena}, ${q(au.part)}, '${texto}', 'publicada', '2026-10-24.2', '${intento}', m) returning id into v_nueva;
  update comunidad.resenas set version_vigente_id = v_nueva where id = ${au.resena};
  update comunidad.evaluaciones set retirada_en = m, actualizada_en = m where version_id = ${esperada} and retirada_en is null;
  get diagnostics v_votos = row_count;
  update comunidad.tramos set vigente_hasta = m where version_id = ${esperada} and vigente_hasta is null;
  raise notice 'RES|edicion|%|%|%', v_nueva, m, v_votos;
end $$;
${pausar(o, "fin")}
commit;`;
}

function suspender(o) {
  const { admin: ad, objetivo } = o;
  return `begin;
select 'OP|cuenta|' || coalesce(comunidad.proto_cuenta(${q(ad.uid)}, false)::text, 'sin-participante');
select 'OP|n2|' || count(*) from comunidad.proto_participantes(array[${q(objetivo.part)}]::uuid[]);
${pausar(o, 2)}
select 'OP|n6|' || count(*) from comunidad.proto_suspensiones(array[${q(objetivo.part)}]::uuid[]);
do $$
declare m timestamptz;
begin
  if exists (select 1 from comunidad.suspensiones where participante_id = ${q(objetivo.part)} and hasta is null) then
    raise notice 'RES|suspension|noop';
    return;
  end if;
  m := comunidad.proto_marca();
  insert into comunidad.suspensiones (participante_id, desde) values (${q(objetivo.part)}, m);
  raise notice 'RES|suspension|%', m;
end $$;
${pausar(o, "fin")}
commit;`;
}

/** Consolidación de FIXTURE (E7 no existe): exclusivo y UNA sentencia de cómputo, con `corte` o con L. */
function consolidar(o) {
  return `begin;
select comunidad.proto_corte_exclusivo() as l \\gset
\\echo K|L|:l
${o.pausa ? BARRERA(o.pausa) : ""}
select 'K|cuenta|' || count(*) from comunidad.tramos t
 where t.autor_participante = ${q(o.autor.part)}
   and comunidad.rige_antes_de(t.vigente_desde, t.vigente_hasta, ${o.corte ? `'${o.corte}'::timestamptz` : ":'l'::timestamptz"});
commit;`;
}

/** Los `RES|…` de una sesión (vienen por stderr, como notices). */
const res = (s, tipo) => resultados(s.err).filter((r) => r[0] === tipo);
const errores = (s) => s.err.split("\n").filter((l) => /^(ERROR|psql:.*ERROR)/.test(l) || /\bERROR:/.test(l));
const sqlstate = (s) => (s.err.match(/ERROR:\s+(\S+)/) ?? [])[1] ?? null;
async function hasta(s, re, desc, ms = 20000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) { if (re.test(s.err) || re.test(s.out)) return; await new Promise((r) => setTimeout(r, 100)); }
  throw new Error(`no llegó: ${desc}\n${s.err.slice(-400)}`);
}
const despuesQue = async (a, b) => (await consultar(`'${a}'::timestamptz > '${b}'::timestamptz`)) === "true";

function estadoVoto(ev, version) {
  return JSON.parse(sqlOk(`select json_build_object(
    'vigentes', (select count(*) from comunidad.evaluaciones e join comunidad.participantes p on p.id = e.evaluador_participante
                  where p.user_id = ${q(ev.uid)} and e.version_id = ${version} and e.retirada_en is null),
    'retirados', (select count(*) from comunidad.evaluaciones e join comunidad.participantes p on p.id = e.evaluador_participante
                  where p.user_id = ${q(ev.uid)} and e.version_id = ${version} and e.retirada_en is not null),
    'tramos_abiertos', (select count(*) from comunidad.tramos t join comunidad.participantes p on p.id = t.evaluador_participante
                  where p.user_id = ${q(ev.uid)} and t.version_id = ${version} and t.vigente_hasta is null),
    'tramos_cerrados', (select count(*) from comunidad.tramos t join comunidad.participantes p on p.id = t.evaluador_participante
                  where p.user_id = ${q(ev.uid)} and t.version_id = ${version} and t.vigente_hasta is not null),
    'intervalos_ok', (select coalesce(bool_and(t.vigente_hasta is null or t.vigente_hasta > t.vigente_desde), true) from comunidad.tramos t
                  join comunidad.participantes p on p.id = t.evaluador_participante where p.user_id = ${q(ev.uid)} and t.version_id = ${version})
  )`));
}

// ===========================================================================
try {
  console.log("— Permisos de las primitivas (SQL con SET ROLE) —");
  await prueba("anon, authenticated y service_role no ejecutan ninguna primitiva de 013 (42501)", () => {
    const fns = ["comunidad.proto_cuenta(gen_random_uuid(), false)", "comunidad.proto_participantes('{}'::uuid[])",
      "comunidad.proto_marca()", "comunidad.proto_corte_exclusivo()", "comunidad.corte_de_mes(current_date)",
      "comunidad.rige_antes_de(now(), null, now())", "comunidad.mes_ar(now())", "comunidad.proto_nivel()"];
    const casos = ["anon", "authenticated", "service_role"].flatMap((rol) => fns.map((f) => [rol, f]));
    const bloques = casos.map(([rol, f], i) => `do $$ declare st text := 'ok'; m text := ''; begin
      begin execute 'set local role ${rol}'; perform ${f}; execute 'reset role';
      exception when others then st := sqlstate; m := sqlerrm; end;
      raise notice 'RES|${i}|%|%|%', st, m, current_user; end $$;`).join("\n");
    const r = psql(`begin;\n${bloques}\nrollback;`);
    const rs = resultados(r.stderr);
    assert.equal(rs.length, casos.length, r.stderr);
    const mal = rs.filter(([, st, m, quien]) => st !== "42501" || !/permission denied for (function|schema)/.test(m) || quien !== "postgres");
    assert.deepEqual(mal.map(([i, st, m]) => `${casos[i].join(" ")} → ${st} ${m}`), []);
  });
  await prueba("catálogo: ninguna función del esquema comunidad es ejecutable por PUBLIC ni por los roles de la API", () => {
    assert.equal(sqlOk(`select count(*) from pg_proc f, unnest(array['public','anon','authenticated','service_role']) r
      where f.pronamespace = 'comunidad'::regnamespace and has_function_privilege(r, f.oid, 'EXECUTE')`), "0");
  });

  // =========================================================================
  console.log("\n— El guardián del orden (nivel por transacción) —");
  await prueba("fuera de orden → CB002 en el acto, sin esperar ningún lock: sin paso 1, nivel repetido, retroceso, lock tras la marca, paso 1 dos veces", async () => {
    const u = await autor("guardian");
    const casos = {
      "sin paso 1": `select * from comunidad.proto_participantes(array[${q(u.part)}]::uuid[]);`,
      "nivel repetido": `select comunidad.proto_cuenta(${q(u.uid)}, false); select * from comunidad.proto_participantes(array[${q(u.part)}]::uuid[]); select * from comunidad.proto_participantes(array[${q(u.part)}]::uuid[]);`,
      "retroceso": `select comunidad.proto_cuenta(${q(u.uid)}, false); select * from comunidad.proto_versiones(array[${u.version}]::bigint[]); select * from comunidad.proto_participantes(array[${q(u.part)}]::uuid[]);`,
      "lock tras la marca": `select comunidad.proto_cuenta(${q(u.uid)}, false); select comunidad.proto_marca(); select * from comunidad.proto_suspensiones(array[${q(u.part)}]::uuid[]);`,
      "paso 1 dos veces": `select comunidad.proto_cuenta(${q(u.uid)}, false); select comunidad.proto_cuenta(${q(u.uid)}, false);`,
      "consolidación con otro lock": `select comunidad.proto_cuenta(${q(u.uid)}, false); select comunidad.proto_corte_exclusivo();`,
      "consolidación en REPEATABLE READ": `set transaction isolation level repeatable read; select comunidad.proto_corte_exclusivo();`,
    };
    for (const [nombre, sql] of Object.entries(casos)) {
      const r = psql(`begin;\n${sql}\nrollback;`, { detenerEnError: false });
      assert.match(r.stderr, /ERROR:\s+(orden_de_locks|la consolidación corre en READ COMMITTED)/, nombre);
      assert.equal((r.stderr.match(/ERROR:/g) ?? []).length >= 1, true, nombre);
    }
    // El orden correcto completo no lanza, y el nivel no sobrevive a la transacción.
    const ok = psql(`begin;
select comunidad.proto_cuenta(${q(u.uid)}, false);
select count(*) from comunidad.proto_participantes(array[${q(u.part)}]::uuid[]);
select count(*) from comunidad.proto_resena(${u.resena});
select count(*) from comunidad.proto_versiones(array[${u.version}]::bigint[]);
select count(*) from comunidad.proto_votos(array[${q(u.part)}]::uuid[], array[${u.version}]::bigint[]);
select count(*) from comunidad.proto_suspensiones(array[${q(u.part)}]::uuid[]);
select count(*) from comunidad.proto_contadores(${q(u.part)}, array['resena','edicion'], current_date);
select 'marca|' || comunidad.proto_marca();
rollback;
select 'nivel|' || comunidad.proto_nivel();`);
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /marca\|/);
    assert.match(ok.stdout, /nivel\|0/);
    assert.equal(sqlOk(`select count(*) from comunidad.contadores where participante_id = ${q(u.part)}`), "0", "los contadores creados se revirtieron");
  });

  await prueba("la marca se toma DESPUÉS de los locks: una operación que esperó un lock marca después de que lo soltó quien lo tenía", async () => {
    const au = await autor("marca-au"), ev = await lector("marca-ev");
    const b = await barrera(20);
    const a = new Sesion("marca-a"), c = new Sesion("marca-b");
    a.enviar(votar({ ev, au, pausa: 20, pausaEn: "fin" }));
    await hasta(a, /RES\|voto\|/, "A marcó");
    c.enviar(retirar({ ev, au }));
    await esperar(esperaLock(c, "advisory"), "B espera K_CUENTA");
    const soltadoEn = await consultar("clock_timestamp()");
    b.soltar();
    await a.terminar(); await c.terminar(); await b.terminar();
    const [, mA] = res(a, "voto")[0], [, mB] = res(c, "retiro")[0];
    assert.ok(await despuesQue(mB, soltadoEn), `la marca de B (${mB}) es posterior al momento en que A soltó (${soltadoEn})`);
    assert.ok(await despuesQue(mB, mA));
  });

  // =========================================================================
  // =========================================================================
  console.log("\n— Actores cruzados (auditoría de E2c, A1) —");
  // A evalúa la reseña de B mientras B evalúa la de A, los dos siguiendo las
  // primitivas en orden. Se coordinan DESPUÉS del paso de cuenta: los dos
  // pasaron proto_cuenta y recién entonces piden proto_participantes([A, B]).
  // Con el paso 1 bloqueando la fila del actor (013 original), cada uno ya
  // retenía la suya y el orden global llegaba tarde → 40P01. Esperado ahora:
  // uno espera al otro en el orden por id, los dos confirman, sin 40P01 ni
  // CB002, y el resultado es el de algún orden serial.
  await prueba("cruce · A evalúa la reseña de B y B la de A, coordinados después del paso de cuenta: los dos confirman, sin deadlock ni CB002", async () => {
    const a = await autor("cruce-a"), b = await autor("cruce-b");
    const ba = await barrera(21), bb = await barrera(22);
    const SA = new Sesion("cruce-a"), SB = new Sesion("cruce-b");
    SA.enviar(votar({ ev: a, au: b, pausa: 21, pausaEn: 1 }));
    SB.enviar(votar({ ev: b, au: a, pausa: 22, pausaEn: 1 }));
    await esperar(esperaLock(SA, "advisory"), "A pasó el paso de cuenta y espera");
    await esperar(esperaLock(SB, "advisory"), "B pasó el paso de cuenta y espera");
    // Qué filas de participante retiene cada sesión al terminar el paso 1. Un
    // FOR UPDATE concedido no figura en pg_locks (queda en la fila): se
    // comprueba desde un tercero con NOWAIT, sin esperar.
    const r = psql(`do $$ begin
      begin perform 1 from comunidad.participantes where id = ${q(a.part)} for update nowait; raise notice 'RES|A|libre';
      exception when lock_not_available then raise notice 'RES|A|bloqueada'; end;
      begin perform 1 from comunidad.participantes where id = ${q(b.part)} for update nowait; raise notice 'RES|B|libre';
      exception when lock_not_available then raise notice 'RES|B|bloqueada'; end;
    end $$;`);
    const filas = resultados(r.stderr).map(([quien, estado]) => `${quien}=${estado}`).join(", ");
    console.log(`   filas de participante tras el paso de cuenta: ${filas}`);
    ba.soltar(); bb.soltar();
    await SA.terminar(); await SB.terminar();
    const fallos = [SA, SB].map((s) => (s.err.match(/ERROR:\s+(.*)/) ?? [])[1]).filter(Boolean);
    assert.deepEqual(fallos, [], `errores: ${fallos.join(" | ")}`);
    const [, mA] = res(SA, "voto")[0], [, mB] = res(SB, "voto")[0];
    assert.notEqual(mA, mB);
    // Resultado válido: cada uno con su voto y su tramo, intervalos sanos.
    assert.deepEqual(estadoVoto(a, b.version), { vigentes: 1, retirados: 0, tramos_abiertos: 1, tramos_cerrados: 0, intervalos_ok: true });
    assert.deepEqual(estadoVoto(b, a.version), { vigentes: 1, retirados: 0, tramos_abiertos: 1, tramos_cerrados: 0, intervalos_ok: true });
    assert.equal(filas, "A=libre, B=libre", "el paso de cuenta no debe retener la fila del actor");
  });

  console.log("\n— Caso 1: dos sesiones sobre el mismo (evaluador, versión) (preliminar; gate en E3a) —");
  await prueba("1a · votar ‖ retirar, gana votar: B espera, relee el voto y lo retira; marcas monótonas; igual al serial votar→retirar", async () => {
    const au = await autor("c1a-au"), ev = await lector("c1a-ev");
    const b = await barrera(1);
    const A = new Sesion("c1a-votar"), B = new Sesion("c1a-retirar");
    A.enviar(votar({ ev, au, pausa: 1, pausaEn: 6 }));
    await esperar(esperaLock(A, "advisory"), "A retiene sus locks y espera la barrera");
    B.enviar(retirar({ ev, au }));
    await esperar(esperaLock(B, "advisory"), "B espera K_CUENTA del mismo evaluador");
    b.soltar();
    await A.terminar(); await B.terminar(); await b.terminar();
    assert.deepEqual([errores(A), errores(B)], [[], []]);
    const [, mA] = res(A, "voto")[0], [, mB] = res(B, "retiro")[0];
    assert.ok(await despuesQue(mB, mA), `marcas monótonas: ${mA} < ${mB}`);
    assert.deepEqual(estadoVoto(ev, au.version), { vigentes: 0, retirados: 1, tramos_abiertos: 0, tramos_cerrados: 1, intervalos_ok: true });
  });

  await prueba("1b · retirar ‖ votar, gana retirar (no hay voto: no-op); el voto entra después; igual al serial retirar→votar", async () => {
    const au = await autor("c1b-au"), ev = await lector("c1b-ev");
    const b = await barrera(2);
    const B = new Sesion("c1b-retirar"), A = new Sesion("c1b-votar");
    B.enviar(retirar({ ev, au, pausa: 2, pausaEn: 2 }));
    await esperar(esperaLock(B, "advisory"), "B retiene sus locks y espera la barrera");
    A.enviar(votar({ ev, au }));
    await esperar(esperaLock(A, "advisory"), "A espera K_CUENTA");
    b.soltar();
    await B.terminar(); await A.terminar(); await b.terminar();
    assert.deepEqual(res(B, "retiro")[0], ["retiro", "noop"]);
    assert.equal(res(A, "voto").length, 1);
    assert.deepEqual(estadoVoto(ev, au.version), { vigentes: 1, retirados: 0, tramos_abiertos: 1, tramos_cerrados: 0, intervalos_ok: true });
  });

  // =========================================================================
  console.log("\n— Caso 2: edición y voto sobre la misma versión (preliminar; gate en E3a) —");
  await prueba("2a · la edición confirma primero: el voto esperó la fila del autor, relee, ve la versión reemplazada y se rechaza (CB003); no escribe nada", async () => {
    const au = await autor("c2a-au"), ev = await lector("c2a-ev");
    const b = await barrera(3);
    const E = new Sesion("c2a-editar"), Vt = new Sesion("c2a-votar");
    E.enviar(editar({ au, esperada: au.version, intento: randomUUID(), pausa: 3, pausaEn: 6 }));
    await esperar(esperaLock(E, "advisory"), "la edición retiene sus locks");
    Vt.enviar(votar({ ev, au }));
    await esperar(esperaLock(Vt), "el voto espera la fila del participante autor");
    b.soltar();
    await E.terminar(); await Vt.terminar(); await b.terminar();
    assert.deepEqual(errores(E), []);
    assert.equal(sqlstate(Vt), "conflicto_version");
    assert.deepEqual(estadoVoto(ev, au.version), { vigentes: 0, retirados: 0, tramos_abiertos: 0, tramos_cerrados: 0, intervalos_ok: true });
    assert.equal(sqlOk(`select count(*) from comunidad.participantes where user_id = ${q(ev.uid)}`), "1");
  });

  await prueba("2b · el voto confirma primero: la edición espera, relee y lo reinicia con su marca (posterior); cierra su tramo", async () => {
    const au = await autor("c2b-au"), ev = await lector("c2b-ev");
    const b = await barrera(4);
    const Vt = new Sesion("c2b-votar"), E = new Sesion("c2b-editar");
    Vt.enviar(votar({ ev, au, pausa: 4, pausaEn: 6 }));
    await esperar(esperaLock(Vt, "advisory"), "el voto retiene sus locks");
    E.enviar(editar({ au, esperada: au.version, intento: randomUUID() }));
    await esperar(esperaLock(E), "la edición espera la fila del autor");
    b.soltar();
    await Vt.terminar(); await E.terminar(); await b.terminar();
    assert.deepEqual([errores(Vt), errores(E)], [[], []]);
    const [, mV] = res(Vt, "voto")[0];
    const [, , mE, reiniciados] = res(E, "edicion")[0];
    assert.ok(await despuesQue(mE, mV));
    assert.equal(reiniciados, "1");
    assert.deepEqual(estadoVoto(ev, au.version), { vigentes: 0, retirados: 1, tramos_abiertos: 0, tramos_cerrados: 1, intervalos_ok: true });
  });

  // =========================================================================
  console.log("\n— Caso 3: dos ediciones con la misma versión esperada (preliminar; gate en E3a) —");
  await prueba("3 · la segunda espera, relee la vigente y da conflicto (CB003); hay UNA versión nueva", async () => {
    const au = await autor("c3-au");
    const b = await barrera(5);
    const E1 = new Sesion("c3-e1"), E2 = new Sesion("c3-e2");
    E1.enviar(editar({ au, esperada: au.version, intento: randomUUID(), pausa: 5, pausaEn: 6 }));
    await esperar(esperaLock(E1, "advisory"), "E1 retiene sus locks");
    E2.enviar(editar({ au, esperada: au.version, intento: randomUUID(), texto: `${TEXTO_OK} Otra edición.` }));
    await esperar(esperaLock(E2, "advisory"), "E2 espera K_CUENTA");
    b.soltar();
    await E1.terminar(); await E2.terminar(); await b.terminar();
    assert.deepEqual(errores(E1), []);
    assert.equal(sqlstate(E2), "conflicto_version");
    assert.equal(sqlOk(`select count(*) from comunidad.versiones where resena_id = ${au.resena}`), "2");
    assert.equal(sqlOk(`select count(*) from comunidad.versiones where resena_id = ${au.resena} and estado = 'publicada'`), "1");
  });

  // =========================================================================
  console.log("\n— Caso 4: reintento con el mismo id_intento (preliminar; gate en E3a) —");
  await prueba("4 · dos envíos del mismo intento a la vez: UNA versión y UN reinicio de votos; el segundo devuelve la misma", async () => {
    const au = await autor("c4-au"), ev = await lector("c4-ev");
    sqlOk(votar({ ev, au }));   // un voto previo, que la edición tiene que reiniciar una sola vez
    const intento = randomUUID();
    const b = await barrera(6);
    const E1 = new Sesion("c4-e1"), E2 = new Sesion("c4-e2");
    E1.enviar(editar({ au, esperada: au.version, intento, pausa: 6, pausaEn: 6 }));
    await esperar(esperaLock(E1, "advisory"), "E1 retiene sus locks");
    E2.enviar(editar({ au, esperada: au.version, intento }));
    await esperar(esperaLock(E2, "advisory"), "E2 espera");
    b.soltar();
    await E1.terminar(); await E2.terminar(); await b.terminar();
    assert.deepEqual([errores(E1), errores(E2)], [[], []]);
    const [, nueva, , reiniciados] = res(E1, "edicion")[0];
    assert.equal(reiniciados, "1");
    assert.deepEqual(res(E2, "edicion")[0], ["edicion", "mismo-intento", nueva]);
    assert.equal(sqlOk(`select count(*) from comunidad.versiones where resena_id = ${au.resena}`), "2");
    assert.equal(sqlOk(`select count(distinct retirada_en) from comunidad.evaluaciones where version_id = ${au.version}`), "1");
  });

  // =========================================================================
  console.log("\n— Caso 5: suspensión y voto del suspendido (preliminar; gate en E4) —");
  await prueba("5a · la suspensión confirma primero: el voto espera la fila, relee la suspensión y se rechaza (CB004)", async () => {
    const au = await autor("c5a-au"), ev = await lector("c5a-ev"), ad = await cuenta("c5a-admin");
    const b = await barrera(7);
    const S = new Sesion("c5a-suspender"), Vt = new Sesion("c5a-votar");
    S.enviar(suspender({ admin: ad, objetivo: ev, pausa: 7, pausaEn: 2 }));
    await esperar(esperaLock(S, "advisory"), "la suspensión retiene la fila del evaluador");
    Vt.enviar(votar({ ev, au }));
    await esperar(esperaLock(Vt), "el voto espera la fila del evaluador");
    b.soltar();
    await S.terminar(); await Vt.terminar(); await b.terminar();
    assert.deepEqual(errores(S), []);
    assert.equal(sqlstate(Vt), "suspendido");
    assert.deepEqual(estadoVoto(ev, au.version), { vigentes: 0, retirados: 0, tramos_abiertos: 0, tramos_cerrados: 0, intervalos_ok: true });
  });

  await prueba("5b · el voto confirma primero: la suspensión espera y su desde es POSTERIOR a la marca del voto", async () => {
    const au = await autor("c5b-au"), ev = await lector("c5b-ev"), ad = await cuenta("c5b-admin");
    const b = await barrera(8);
    const Vt = new Sesion("c5b-votar"), S = new Sesion("c5b-suspender");
    Vt.enviar(votar({ ev, au, pausa: 8, pausaEn: 6 }));
    await esperar(esperaLock(Vt, "advisory"), "el voto retiene sus locks");
    S.enviar(suspender({ admin: ad, objetivo: ev }));
    await esperar(esperaLock(S), "la suspensión espera la fila del evaluador");
    b.soltar();
    await Vt.terminar(); await S.terminar(); await b.terminar();
    const [, mV] = res(Vt, "voto")[0], [, mS] = res(S, "suspension")[0];
    assert.ok(await despuesQue(mS, mV), `voto ${mV} < suspensión ${mS}`);
    assert.equal(sqlOk(`select (min(desde) > '${mV}'::timestamptz)::text from comunidad.suspensiones where participante_id = ${q(ev.part)}`), "true");
  });

  // =========================================================================
  console.log("\n— El orden importa: una sesión que lo viola produce el deadlock —");
  await prueba("una sesión fuera del protocolo (versión → participante) contra una en orden: deadlock 40P01; la abortada no deja nada", async () => {
    const au = await autor("dl-au"), ev = await lector("dl-ev"), otro = await lector("dl-otro");
    const ba = await barrera(9), bb = await barrera(10);
    const MAL = new Sesion("dl-fuera-de-orden"), BIEN = new Sesion("dl-en-orden");
    // Fuera de orden, a mano (sin las primitivas: el guardián lo impediría).
    MAL.enviar(`begin;
select pg_advisory_xact_lock_shared(7301, 0);
insert into comunidad.contadores (participante_id, accion, dia, cantidad) values (${q(otro.part)}, 'denuncia', current_date, 1);
select 1 from comunidad.versiones where id = ${au.version} for update;
${BARRERA(9)}
select 1 from comunidad.participantes where id = ${q(au.part)} for update;
commit;`);
    await esperar(esperaLock(MAL, "advisory"), "la sesión fuera de orden tiene la versión");
    BIEN.enviar(votar({ ev, au, pausa: 10, pausaEn: 2 }));
    await esperar(esperaLock(BIEN, "advisory"), "la sesión en orden tiene el participante");
    ba.soltar(); bb.soltar();
    await MAL.terminar(); await BIEN.terminar(); await ba.terminar(); await bb.terminar();
    const muertas = [MAL, BIEN].filter((s) => /deadlock detected/.test(s.err));
    assert.equal(muertas.length, 1, `exactamente una abortada: ${muertas.map((s) => s.nombre)}`);
    const contador = sqlOk(`select count(*) from comunidad.contadores where participante_id = ${q(otro.part)}`);
    const voto = estadoVoto(ev, au.version).vigentes;
    if (muertas[0] === MAL) assert.deepEqual([contador, voto], ["0", 1], "MAL abortada: su contador no quedó; el voto en orden confirmó");
    else assert.deepEqual([contador, voto], ["1", 0], "BIEN abortada: su voto no quedó");
    console.log(`   abortada: ${muertas[0].nombre}`);
  });

  // =========================================================================
  console.log("\n— Errores y tiempos de espera: nada a medias —");
  await prueba("lock_timeout: una cuenta nueva espera la fila del autor más de 1 s → 55P03; tampoco queda el participante que creó el paso 1", async () => {
    const au = await autor("to-au"), ev = await lector("to-ev"), nueva = await cuenta("to-nueva");
    const b = await barrera(11);
    const H = new Sesion("to-retiene"), T = new Sesion("to-espera");
    H.enviar(votar({ ev, au, pausa: 11, pausaEn: 2 }));
    await esperar(esperaLock(H, "advisory"), "H retiene la fila del autor");
    T.enviar(votar({ ev: nueva, au, lockTimeout: "1s" }));
    await hasta(T, /lock timeout/, "T vence su lock_timeout");
    b.soltar();
    await H.terminar(); await T.terminar(); await b.terminar();
    assert.match(T.err, /canceling statement due to lock timeout/);
    assert.equal(sqlOk(`select count(*) from comunidad.participantes where user_id = ${q(nueva.uid)}`), "0", "el participante creado en el paso 1 se revirtió");
    assert.deepEqual(estadoVoto(ev, au.version).vigentes, 1, "H confirmó");
  });

  await prueba("error después de la marca y de escrituras parciales (texto inválido): la edición se revierte entera", async () => {
    const au = await autor("err-au"), ev = await lector("err-ev");
    sqlOk(votar({ ev, au }));
    const r = psql(editar({ au, esperada: au.version, intento: randomUUID(), texto: "corto" }), { detenerEnError: false });
    assert.match(r.stderr, /versiones_texto_forma/);
    assert.equal(sqlOk(`select estado || '|' || (select version_vigente_id from comunidad.resenas where id = ${au.resena})
      from comunidad.versiones where id = ${au.version}`), `publicada|${au.version}`);
    assert.deepEqual(estadoVoto(ev, au.version), { vigentes: 1, retirados: 0, tramos_abiertos: 1, tramos_cerrados: 0, intervalos_ok: true });
  });

  // =========================================================================
  console.log("\n— Casos 6 y 7: frente a la consolidación (preliminar: consolidación de FIXTURE; gate en E7) —");
  await prueba("6 · operación con el compartido tomado y marca < T, que confirma DESPUÉS de T mientras la consolidación espera: la consolidación la ve y la cuenta", async () => {
    const au = await autor("c6-au"), ev = await lector("c6-ev");
    const b = await barrera(12);
    const Vt = new Sesion("c6-votar"), K = new Sesion("c6-consolidar");
    Vt.enviar(votar({ ev, au, pausa: 12, pausaEn: "fin" }));
    await hasta(Vt, /RES\|voto\|/, "el voto marcó");
    const [, m] = res(Vt, "voto")[0];
    const T = await consultar("clock_timestamp()");          // T(M) de fixture: posterior a la marca
    K.enviar(consolidar({ autor: au, corte: T }));
    await esperar(esperaLock(K, "advisory"), "la consolidación espera el exclusivo");
    b.soltar();
    await Vt.terminar(); await K.terminar(); await b.terminar();
    assert.deepEqual([errores(Vt), errores(K)], [[], []]);
    const [L] = K.lineas("K").filter((l) => l[0] === "L").map((l) => l[1]);
    assert.ok(await despuesQue(T, m) && await despuesQue(L, T), `m ${m} < T ${T} ≤ L ${L}`);
    assert.deepEqual(K.lineas("K").find((l) => l[0] === "cuenta"), ["cuenta", "1"]);
  });

  await prueba("7a · operación que llega con la consolidación CALCULANDO: espera; su marca es > L; el cómputo al corte L no la incluye", async () => {
    const au = await autor("c7a-au"), ev = await lector("c7a-ev");
    const b = await barrera(13);
    const K = new Sesion("c7a-consolidar"), Vt = new Sesion("c7a-votar");
    K.enviar(consolidar({ autor: au, pausa: 13 }));
    await esperar(esperaLock(K, "advisory"), "la consolidación tiene el exclusivo y espera la barrera");
    Vt.enviar(votar({ ev, au }));
    await esperar(esperaLock(Vt, "advisory"), "el voto espera K_CORTE compartido");
    b.soltar();
    await K.terminar(); await Vt.terminar(); await b.terminar();
    const [L] = K.lineas("K").filter((l) => l[0] === "L").map((l) => l[1]);
    const [, m] = res(Vt, "voto")[0];
    assert.ok(await despuesQue(m, L), `L ${L} < m ${m}`);
    assert.deepEqual(K.lineas("K").find((l) => l[0] === "cuenta"), ["cuenta", "0"]);
  });

  await prueba("7b · operación que llega con la consolidación ESPERANDO: no se cuela delante; marca > L; la anterior sí cuenta", async () => {
    const au = await autor("c7b-au"), ev1 = await lector("c7b-ev1"), ev2 = await lector("c7b-ev2");
    const b = await barrera(14);
    const X = new Sesion("c7b-x"), K = new Sesion("c7b-consolidar"), Y = new Sesion("c7b-y");
    X.enviar(votar({ ev: ev1, au, pausa: 14, pausaEn: 6 }));
    await esperar(esperaLock(X, "advisory"), "X retiene el compartido");
    K.enviar(consolidar({ autor: au }));
    await esperar(esperaLock(K, "advisory"), "la consolidación espera el exclusivo");
    Y.enviar(votar({ ev: ev2, au }));
    await esperar(esperaLock(Y, "advisory"), "Y espera detrás de la consolidación (compatible con X, pero no se cuela)");
    b.soltar();
    await X.terminar(); await K.terminar(); await Y.terminar(); await b.terminar();
    const [L] = K.lineas("K").filter((l) => l[0] === "L").map((l) => l[1]);
    const [, mX] = res(X, "voto")[0], [, mY] = res(Y, "voto")[0];
    assert.ok(await despuesQue(L, mX) && await despuesQue(mY, L), `mX ${mX} < L ${L} < mY ${mY}`);
    assert.deepEqual(K.lineas("K").find((l) => l[0] === "cuenta"), ["cuenta", "1"], "cuenta X y no Y");
  });

  // =========================================================================
  console.log("\n— Caso 11: igualdad exacta en T(M) (primitivas reales; cómputo de FIXTURE, gate en E7) —");
  await prueba("11 · corte_de_mes, mes_ar y rige_antes_de en T(M) y a 1 µs de cada lado", () => {
    const fila = sqlOk(`select
      comunidad.corte_de_mes('2026-09-01')::text,
      comunidad.corte_de_mes('2026-09-30')::text,
      comunidad.corte_de_mes('2026-12-01')::text,
      comunidad.mes_ar('2026-10-01 03:00:00+00'::timestamptz)::text,
      comunidad.mes_ar('2026-10-01 02:59:59.999999+00'::timestamptz)::text`);
    assert.equal(fila, "2026-10-01 03:00:00+00|2026-10-01 03:00:00+00|2027-01-01 03:00:00+00|2026-10-01|2026-09-01");
    const casos = sqlOk(`with c(t) as (select comunidad.corte_de_mes('2026-09-01'))
      select string_agg(nombre || '=' || comunidad.rige_antes_de(desde, hasta, t), ',' order by orden) from c, (values
        (1, 'tramo empieza en T',             (select t from c),                          null::timestamptz),
        (2, 'tramo empieza en T-1µs',         (select t from c) - interval '1 microsecond', null),
        (3, 'tramo empieza en T+1µs',         (select t from c) + interval '1 microsecond', null),
        (4, 'tramo termina en T',             (select t from c) - interval '1 day',       (select t from c)),
        (5, 'tramo termina en T-1µs',         (select t from c) - interval '1 day',       (select t from c) - interval '1 microsecond'),
        (6, 'tramo termina en T+1µs',         (select t from c) - interval '1 day',       (select t from c) + interval '1 microsecond'),
        (7, 'suspensión empieza en T',        (select t from c),                          null),
        (8, 'suspensión termina en T',        (select t from c) - interval '1 day',       (select t from c))
      ) v(orden, nombre, desde, hasta)`);
    assert.equal(casos, [
      "tramo empieza en T=false", "tramo empieza en T-1µs=true", "tramo empieza en T+1µs=false",
      "tramo termina en T=true", "tramo termina en T-1µs=false", "tramo termina en T+1µs=true",
      "suspensión empieza en T=false", "suspensión termina en T=true"].join(","));
  });

  await prueba("11 · cómputo de FIXTURE sobre filas con marcas exactas: cuentan los pares cuyo tramo rige antes de T, con primera positiva en [T(M-1), T(M)) y sin suspensión vigente", async () => {
    const au = await autor("c11-au");
    const evs = [];
    for (let i = 0; i < 7; i++) evs.push(await lector(`c11-ev${i}`));
    const T = "comunidad.corte_de_mes('2026-09-01')";
    const T0 = "comunidad.corte_de_mes('2026-08-01')";
    const us = (n) => `interval '${n} microsecond'`;
    // [evaluador, desde, hasta, suspensión(desde, hasta) | null, ¿cuenta?]
    const filas = [
      [0, `${T} - ${us(1)}`, "null", null, true],                         // primera positiva a 1 µs antes de T
      [1, `${T}`, "null", null, false],                                   // empieza en T: es del mes siguiente
      [2, `${T0}`, `${T}`, null, true],                                   // termina en T: todavía regía
      [3, `${T0}`, `${T} - ${us(1)}`, null, false],                       // termina 1 µs antes de T
      [4, `${T0} - ${us(1)}`, "null", null, false],                       // primera positiva en el mes anterior
      [5, `${T0} + interval '1 day'`, "null", [`${T}`, "null"], true],    // suspensión que empieza en T: no excluye
      [6, `${T0} + interval '1 day'`, "null", [`${T0}`, `${T}`], false],  // suspensión que termina en T: excluye
    ];
    const sql = filas.map(([i, desde, hasta, susp]) => `
      insert into comunidad.tramos (evaluador_participante, autor_participante, version_id, mes_primera_positiva, vigente_desde)
        values (${q(evs[i].part)}, ${q(au.part)}, ${au.version}, comunidad.mes_ar(${desde}), ${desde});
      ${hasta !== "null" ? `update comunidad.tramos set vigente_hasta = ${hasta} where evaluador_participante = ${q(evs[i].part)};` : ""}
      ${susp ? `insert into comunidad.suspensiones (participante_id, desde, hasta) values (${q(evs[i].part)}, ${susp[0]}, ${susp[1]});` : ""}`).join("\n");
    // Cómputo de fixture (NO es consolidar_mes): §2.2.2 con las primitivas.
    const r = psql(`begin;
${sql}
select 'C|' || string_agg(p.nombre_comunitario, ',' order by p.nombre_comunitario) from (
  select distinct t.evaluador_participante as ev from comunidad.tramos t
   where t.autor_participante = ${q(au.part)}
     and t.vigente_desde >= ${T0} and t.vigente_desde < ${T}
     and comunidad.mes_ar(t.vigente_desde) = '2026-09-01'
     and comunidad.rige_antes_de(t.vigente_desde, t.vigente_hasta, ${T})
     and not exists (select 1 from comunidad.suspensiones s
                      where s.participante_id in (t.evaluador_participante, t.autor_participante)
                        and comunidad.rige_antes_de(s.desde, s.hasta, ${T}))
) x join lateral (select 'ev' || array_position(array[${evs.map((e) => q(e.part)).join(",")}]::uuid[], x.ev) - 1 as nombre_comunitario) p on true;
rollback;`);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), "C|ev0,ev2,ev5");
  });
} finally {
  // =========================================================================
  console.log("\n— Limpieza (base compartida) —");
  await cerrarSesiones();
  try {
    const vivos = [...cuentasCreadas];
    if (vivos.length) {
      for (const p of sqlOk(`select id from comunidad.participantes where user_id in (${vivos.map(q).join(",")})`).split("\n").filter(Boolean)) participantesCreados.add(p);
    }
    for (const u of vivos) await admin.auth.admin.deleteUser(u, false);
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
    const restos = sqlOk(`select (select count(*) from auth.users where id in (${vivos.map(q).join(",") || "null::uuid"}))
      || '|' || (select count(*) from comunidad.participantes where id in (${ps || "null::uuid"}))
      || '|' || (select count(*) from pg_stat_activity where application_name like 'conc-%')
      || '|' || (select count(*) from pg_locks where locktype = 'advisory' and classid in (7301, 7302, 7399))`);
    console.log(`   cuentas: ${cuentasCreadas.size}, participantes: ${participantesCreados.size}; restos (cuentas|participantes|sesiones|locks consultivos): ${restos}`);
    if (restos !== "0|0|0|0") { console.log("✖ quedaron restos"); process.exitCode = 1; }
  } catch (e) {
    console.log("✖ limpieza:", e.message); process.exitCode = 1;
  }
  // Evidencia: lo que Postgres registró de esta corrida (esperas, deadlocks, timeouts).
  const log = spawnSync("docker", ["logs", "--since", "15m", contenedor()], { env: docker.env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const lineas = `${log.stdout}${log.stderr}`.split("\n")
    .filter((l) => /conc-|still waiting|acquired|deadlock detected|lock timeout/.test(l) && /still waiting|acquired|deadlock|lock timeout/.test(l));
  const desde = new Date(inicioCorrida.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00")).getTime();
  const propias = lineas.filter((l) => { const m = l.match(/(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d+) UTC/); return m && new Date(m[1].replace(" ", "T") + "Z").getTime() >= desde; });
  const cuenta = (re) => propias.filter((l) => re.test(l)).length;
  console.log(`   log de Postgres de esta corrida: ${cuenta(/still waiting/)} esperas registradas, ${cuenta(/acquired/)} adquiridas tras esperar, ${cuenta(/deadlock detected/)} deadlock, ${cuenta(/lock timeout/)} lock timeout`);
}

cerrar();
