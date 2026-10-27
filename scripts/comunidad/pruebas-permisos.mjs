#!/usr/bin/env node
// Matriz de permisos del esquema privado `comunidad` (reseñas, E2a), contra la
// base LOCAL de `supabase start`. Plan: docs/superpowers/plans/
// 2026-10-22-resenas-comunidad.md, §4 y E2a (auditoría `9450006`, A2 y A5).
//
// Uso:
//   node scripts/sala/db-local.mjs
//   node --env-file=.env.comunidad-local scripts/comunidad/pruebas-permisos.mjs
//
// TRES BARRERAS, PROBADAS POR SEPARADO. Un 404 de REST no prueba grants ni
// RLS, y un "permission denied for schema" no prueba los grants de tabla:
//   1. SQL con SET ROLE (anon, authenticated, service_role), en tres modos:
//      a. tal cual está: el esquema niega USAGE;
//      b. con USAGE del esquema concedido EN UNA TRANSACCIÓN QUE SE REVIERTE:
//         lo que frena es la falta de grants de tabla;
//      c. con USAGE y grants de tabla concedidos (también revertidos) y filas
//         de fixture: lo que frena a anon y authenticated es RLS sin policies.
//         service_role tiene BYPASSRLS: para él RLS no es barrera, y la prueba
//         lo deja escrito (su cierre son a y b).
//      Más el catálogo: has_*_privilege falso, RLS activada, cero policies.
//   2. REST con la anon key (y la service key) y JWT de autor, ajeno,
//      suspendido, admin AAL1 y admin AAL2: ninguna tabla nueva es alcanzable,
//      ni por `public` ni pidiendo el perfil `comunidad`. GraphQL tampoco las
//      ve.
//   3. RPC: las únicas `public.comunidad_*` son las cuatro de la baja (E2b,
//      012), security definer con search_path vacío y ejecutables SÓLO por
//      service_role (catálogo y llamada real por REST de cada credencial); y
//      ninguna función del esquema es ejecutable por los roles de la API.
// Además: `is_admin_mfa()` REAL (007) con dos factores TOTP enrolados y
// verificados contra el Auth local (RFC 6238 con node:crypto, sin stub).
//
// Los resultados esperados están escritos ANTES, en ESPERADO y en cada prueba.
// Termina con código 1 si algo no da lo esperado.
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { FX, fixturesSql } from "./fixtures.mjs";
import { arnes, contenedor, psql, resultados, sqlOk, urlLocal } from "./local.mjs";

const URL_API = urlLocal(process.env.NEXT_PUBLIC_SUPABASE_URL);
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SRV = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!ANON || !SRV) { console.error("Faltan ANON_KEY / SERVICE_ROLE_KEY (¿--env-file=.env.comunidad-local?)"); process.exit(2); }
console.log(`base: ${contenedor()} · API: ${URL_API}\n`);

const { prueba, cerrar } = arnes();

// 011 (E2a) creó once; 014 (E3a) suma `intentos` (idempotencia); 015 (E3b)
// suma `huellas`, `denuncias_excedentes` y `corroboraciones`; 016 (E4) suma
// `decisiones` (registro) y `denuncias_cerradas` (historial mínimo de la baja);
// 018 (E5b) las órdenes de "Más útiles"; 020 (E7) los meses consolidados; 021
// (E8) la configuración de la purga y su registro de ejecuciones.
const TABLAS = [
  "bajas_en_curso", "bloqueos", "config", "contadores", "corroboraciones", "decisiones", "denuncias", "denuncias_cerradas",
  "denuncias_excedentes", "evaluaciones", "huellas", "intentos", "ordenes_utiles", "ordenes_utiles_tramos", "participantes",
  "purga_config", "purga_ejecuciones", "resenas", "suspensiones", "top_meses", "top_resultados", "tramos", "versiones",
];
// El inventario exacto de `public.comunidad_*`: la baja (E2b, 012), la
// escritura (E3a, 014) y la moderación (E3b, 015). Una función nueva sin
// clasificar falla acá. Los argumentos son los de una llamada SIN EFECTOS con
// un uid inexistente: la función rechaza o no encuentra nada. Las de E3b
// reciben una versión que no existe (rechazan antes del paso 1) y retener por
// regla una decisión `publicar` (no hace nada).
const DECISION_PRUEBA = { resultado: "publicar", version_reglas: "prueba", reglas: [], huella: { texto: "a".repeat(64), shingles: ["0123456789abcdef"] } };
const VERSION_INEXISTENTE = 9007199254740991;
// Sin `p_uid`: la corroboración la llama la ruta sin actor.
const SIN_UID = new Set(["comunidad_retener_por_regla", "comunidad_modulo_activo", "comunidad_top_yumpers_activo"]);
const HASH_PRUEBA = "a".repeat(64);
const INTENTO_PRUEBA = "00000000-0000-4000-8000-0000000000ee";
const RPC_COMUNIDAD = {
  comunidad_aceptar_terminos: { p_version: "prueba-de-permisos" },
  comunidad_baja_comunitaria: {},
  comunidad_baja_comunitaria_admin: {},
  comunidad_baja_registrar_fallo: { p_error: "prueba de permisos" },
  comunidad_bloqueados: {},
  comunidad_bloquear: { p_version: VERSION_INEXISTENTE },
  comunidad_borrar: { p_resena: 1 },
  // E6 (019): cambiar el nombre comunitario, como publicar (la ruta pasa la decisión).
  comunidad_cambiar_nombre: { p_nombre: "Prueba de permisos", p_decision: DECISION_PRUEBA, p_id_intento: INTENTO_PRUEBA, p_hash: HASH_PRUEBA },
  comunidad_denunciar: { p_version: VERSION_INEXISTENTE, p_categoria: "spam", p_comentario: null },
  comunidad_desbloquear: { p_bloqueo: VERSION_INEXISTENTE },
  comunidad_editar: { p_resena: 1, p_version_esperada: 1, p_texto: "x", p_decision: DECISION_PRUEBA, p_id_intento: INTENTO_PRUEBA, p_hash: HASH_PRUEBA },
  comunidad_estado_baja: {},
  comunidad_modulo_activo: {},
  comunidad_publicar: { p_tipo: "movie", p_tmdb_id: 1, p_texto: "x", p_decision: DECISION_PRUEBA, p_id_intento: INTENTO_PRUEBA, p_hash: HASH_PRUEBA },
  comunidad_retener_por_regla: { p_version: VERSION_INEXISTENTE, p_decision: DECISION_PRUEBA },
  comunidad_retirar_voto: { p_version: 1 },
  comunidad_textos_recientes: {},
  // E7 (020): los interruptores del Top Yumpers, para la ruta sin sesión.
  comunidad_top_yumpers_activo: {},
  comunidad_votar: { p_version: 1, p_util: true },
};
// E4 (016): las de moderación NO son de service_role: las ejecuta
// `authenticated` y cada una exige `is_admin_mfa()` adentro (como el Top). Su
// batería propia (pruebas-admin.mjs) las prueba con admin AAL1/AAL2 y TOTP
// reales; acá se fija el catálogo y que nadie sin admin + MFA las ejecuta.
const RPC_ADMIN = {
  comunidad_admin_cuentas: {},
  comunidad_admin_decidir: { p_accion: "publicar", p_version: VERSION_INEXISTENTE, p_motivo: "prueba de permisos", p_id_intento: INTENTO_PRUEBA },
  comunidad_admin_denuncias: { p_limite: 1, p_despues: null },
  comunidad_admin_levantar_suspension: { p_participante: "00000000-0000-4000-8000-00000000dead", p_motivo: "prueba de permisos", p_id_intento: INTENTO_PRUEBA },
  comunidad_admin_muestreo: {},
  comunidad_admin_publicacion: { p_activa: true, p_motivo: "prueba de permisos", p_id_intento: INTENTO_PRUEBA },
  comunidad_admin_registro: { p_limite: 1, p_antes: null },
  comunidad_admin_resumen: {},
  comunidad_admin_retenidos: { p_limite: 1, p_despues: null },
  comunidad_admin_retiradas: { p_limite: 1, p_despues: null },
  comunidad_admin_suspender: { p_participante: "00000000-0000-4000-8000-00000000dead", p_motivo: "prueba de permisos", p_id_intento: INTENTO_PRUEBA },
  comunidad_admin_version: { p_version: VERSION_INEXISTENTE },
  comunidad_quitar_marcador_baja: { p_user: "00000000-0000-4000-8000-00000000dead", p_motivo: "prueba de permisos", p_id_intento: INTENTO_PRUEBA },
};
// E5a (017): la LECTURA tampoco es de service_role: la ejecuta `authenticated`
// y toma al lector de `auth.uid()` (sin p_uid). anon y service_role, no.
const RPC_LECTURA = {
  comunidad_resenas: { p_tipo: "movie", p_tmdb_id: 1, p_orden: "recientes", p_cursor: null, p_limite: 5 },
  // E6 (019): el perfil comunitario, con la sesión de quien mira (null = el propio).
  comunidad_perfil: { p_participante: null, p_cursor: null, p_limite: 5 },
  // E7 (020): el Top Yumpers (mes cerrado; apagado responde {activo:false} sin consolidar).
  comunidad_top_yumpers: { p_mes: "2026-09-01" },
};
// lock_timeout de las lecturas: sólo la de reseñas (E5b genera el orden).
const LOCK_LECTURA = { comunidad_resenas: "5s", comunidad_top_yumpers: "10s" };
const ESCRIBE_ADMIN = new Set(["comunidad_admin_decidir", "comunidad_admin_levantar_suspension", "comunidad_admin_publicacion",
  "comunidad_admin_suspender", "comunidad_quitar_marcador_baja"]);
// lock_timeout de cada una (vacío = sin): 10 s la baja, 5 s las escrituras de E3a, E3b y E4.
const LOCK_TIMEOUT = {
  comunidad_baja_comunitaria: "10s", comunidad_baja_comunitaria_admin: "10s",
  comunidad_aceptar_terminos: "5s", comunidad_publicar: "5s", comunidad_editar: "5s", comunidad_cambiar_nombre: "5s",
  comunidad_borrar: "5s", comunidad_votar: "5s", comunidad_retirar_voto: "5s",
  comunidad_denunciar: "5s", comunidad_retener_por_regla: "5s", comunidad_bloquear: "5s", comunidad_desbloquear: "5s",
};

const ROLES_API = ["anon", "authenticated", "service_role"];
const OPS = ["select", "insert", "update", "delete", "truncate"];
// Una columna por tabla para el `update … set c = c`.
const COLUMNA = {
  bajas_en_curso: "intentos", bloqueos: "creado_en", config: "modulo_activo", contadores: "cantidad",
  corroboraciones: "reglas", decisiones: "motivo", denuncias: "estado", denuncias_cerradas: "estado",
  denuncias_excedentes: "cantidad", evaluaciones: "util", huellas: "creada_en",
  intentos: "resultado", ordenes_utiles: "total", ordenes_utiles_tramos: "ids", participantes: "nombre_comunitario", resenas: "borrada_en",
  purga_config: "purga_activa", purga_ejecuciones: "resumen",
  suspensiones: "hasta", top_meses: "autores", top_resultados: "puntos", tramos: "vigente_hasta", versiones: "decidida_en",
};

// ---------------------------------------------------------------------------
// Resultados ESPERADOS (escritos antes de correr).
//   modo a (esquema): todo 42501.
//   modo b (tabla):   todo 42501.
//   modo c (RLS), anon y authenticated:
//     select → 0 filas visibles; update y delete → 0 filas afectadas;
//     insert → 42501 (RLS), salvo `tramos`: su trigger BEFORE INSERT corre
//       antes que RLS, no ve la versión (RLS la oculta) y rechaza con 23503;
//     truncate → no se concede en el modo c (no lo filtra RLS): su cierre es b.
//   modo c, service_role: ve TODAS las filas de fixture (BYPASSRLS). Se
//     registra como "RLS no es barrera para service_role".
// ---------------------------------------------------------------------------
const ESPERADO_C_INSERT = (t) => (t === "tramos" ? "23503" : "42501");

const sentencia = (t, op) => ({
  select: `select count(*) from comunidad.${t}`,
  insert: `insert into comunidad.${t} default values`,
  update: `update comunidad.${t} set ${COLUMNA[t]} = ${COLUMNA[t]}`,
  delete: `delete from comunidad.${t}`,
  truncate: `truncate comunidad.${t}`,
})[op];

/** Un bloque DO que intenta `op` como `rol` y emite `RES|modo|rol|tabla|op|estado|filas`. */
function intento(modo, rol, t, op) {
  const s = sentencia(t, op).replace(/'/g, "''");
  const ejecutar = op === "select" ? `execute '${s}' into n;` : `execute '${s}'; get diagnostics n = row_count;`;
  return `do $$ declare st text := 'ok'; n bigint; begin
  begin
    execute 'set local role ${rol}';
    ${ejecutar}
  exception when others then st := sqlstate;
  end;
  execute 'reset role';
  raise notice 'RES|${modo}|${rol}|${t}|${op}|%|%', st, coalesce(n::text, '');
end $$;`;
}

function correrModo(modo, preparar, casos) {
  const sql = `begin;\n${preparar}\n${casos.map(([r, t, op]) => intento(modo, r, t, op)).join("\n")}\nrollback;\n`;
  const r = psql(sql);
  if (r.status !== 0) throw new Error(r.stderr);
  return resultados(r.stderr);
}

// ===========================================================================
// 1. SQL
// ===========================================================================
console.log("— 1. SQL (SET ROLE) —");

await prueba("el esquema tiene exactamente las veintitrés tablas previstas (11 de E2a + intentos de E3a + 3 de E3b + 2 de E4 + 2 de E5b + 2 de E7 + 2 de E8)", () => {
  const t = sqlOk("select string_agg(tablename, ',' order by tablename) from pg_tables where schemaname = 'comunidad'");
  assert.equal(t, TABLAS.join(","));
});

await prueba("catálogo: ningún privilegio de tabla para PUBLIC, anon, authenticated ni service_role", () => {
  const out = sqlOk(`
    select r || ':' || c.relname || ':' || p
      from unnest(array['public','anon','authenticated','service_role']) r,
           pg_class c,
           unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
     where c.relnamespace = 'comunidad'::regnamespace and c.relkind = 'r'
       and has_table_privilege(r, c.oid, p)`);
  assert.equal(out, "", `privilegios concedidos:\n${out}`);
});

await prueba("catálogo: ningún privilegio de columna para esos roles", () => {
  const out = sqlOk(`
    select r || ':' || c.relname || '.' || a.attname || ':' || p
      from unnest(array['public','anon','authenticated','service_role']) r,
           pg_class c join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped,
           unnest(array['SELECT','INSERT','UPDATE','REFERENCES']) p
     where c.relnamespace = 'comunidad'::regnamespace and c.relkind = 'r'
       and has_column_privilege(r, c.oid, a.attnum, p)`);
  assert.equal(out, "", `privilegios de columna:\n${out}`);
});

await prueba("catálogo: el esquema niega USAGE y CREATE; secuencias y funciones cerradas", () => {
  const out = sqlOk(`
    select r || ':esquema:' || p from unnest(array['public','anon','authenticated','service_role']) r,
           unnest(array['USAGE','CREATE']) p where has_schema_privilege(r, 'comunidad', p)
    union all
    select r || ':' || c.relname || ':' || p from unnest(array['public','anon','authenticated','service_role']) r,
           pg_class c, unnest(array['USAGE','SELECT','UPDATE']) p
     where c.relnamespace = 'comunidad'::regnamespace and c.relkind = 'S' and has_sequence_privilege(r, c.oid, p)
    union all
    select r || ':' || f.oid::regprocedure::text || ':EXECUTE' from unnest(array['public','anon','authenticated','service_role']) r,
           pg_proc f where f.pronamespace = 'comunidad'::regnamespace and has_function_privilege(r, f.oid, 'EXECUTE')`);
  assert.equal(out, "", `concedido:\n${out}`);
});

await prueba("control: una función nueva en el esquema SIN su revoke queda ejecutable por PUBLIC (default de PostgreSQL); la frena sólo el esquema", () => {
  // Por qué cada entrega repite su revoke: el default por esquema no lo evita
  // (ver el final de 011). Se crea y se revierte; nada queda.
  const out = sqlOk(`begin;
    create function comunidad.sin_revoke() returns int language sql as 'select 1';
    select has_function_privilege('public', 'comunidad.sin_revoke()', 'EXECUTE');
    rollback;`);
  assert.equal(out, "t");
  const r = psql(`begin; create function comunidad.sin_revoke() returns int language sql as 'select 1';
    do $$ declare st text := 'ok'; begin
      begin execute 'set local role anon'; perform comunidad.sin_revoke(); exception when others then st := sqlstate; end;
      execute 'reset role'; raise notice 'RES|x|%', st; end $$; rollback;`);
  assert.deepEqual(resultados(r.stderr), [["x", "42501"]]);
});

await prueba("catálogo: RLS activada en las quince y ninguna policy", () => {
  const sin = sqlOk("select string_agg(relname, ',') from pg_class where relnamespace = 'comunidad'::regnamespace and relkind = 'r' and not relrowsecurity");
  assert.equal(sin, "", `sin RLS: ${sin}`);
  const pol = sqlOk("select count(*) from pg_policy p join pg_class c on c.oid = p.polrelid where c.relnamespace = 'comunidad'::regnamespace");
  assert.equal(pol, "0");
});

await prueba("control positivo: el dueño (postgres) sí lee las quince tablas", () => {
  const out = sqlOk(TABLAS.map((t) => `select '${t}', count(*) from comunidad.${t};`).join("\n"));
  assert.equal(out.split("\n").length, TABLAS.length);
});

await prueba("control positivo: SET ROLE cambia de verdad el rol (current_user = anon)", () => {
  const out = sqlOk("begin; set local role anon; select current_user; rollback;");
  assert.equal(out, "anon");
});

const todos = ROLES_API.flatMap((r) => TABLAS.flatMap((t) => OPS.map((op) => [r, t, op])));

await prueba(`1a · esquema: ${todos.length} intentos reales → 42501`, () => {
  const res = correrModo("a", "", todos);
  assert.equal(res.length, todos.length);
  const mal = res.filter(([, , , , st]) => st !== "42501");
  assert.deepEqual(mal, []);
});

await prueba(`1b · grants de tabla (USAGE concedido y revertido): ${todos.length} intentos → 42501`, () => {
  const res = correrModo("b", "grant usage on schema comunidad to anon, authenticated, service_role;", todos);
  assert.equal(res.length, todos.length);
  const mal = res.filter(([, , , , st]) => st !== "42501");
  assert.deepEqual(mal, []);
});

const casosC = ["anon", "authenticated"].flatMap((r) => TABLAS.flatMap((t) => ["select", "insert", "update", "delete"].map((op) => [r, t, op])))
  .concat(TABLAS.map((t) => ["service_role", t, "select"]));
let resC;

await prueba("1c · RLS sin policies (grants concedidos y revertidos, con fixtures): anon y authenticated no ven ni tocan nada", () => {
  resC = correrModo("c", `
    grant usage on schema comunidad to anon, authenticated, service_role;
    grant select, insert, update, delete on all tables in schema comunidad to anon, authenticated, service_role;
    ${fixturesSql()}`, casosC);
  const mal = [];
  for (const [, rol, t, op, st, n] of resC.filter(([, rol]) => rol !== "service_role")) {
    const esperado = op === "insert" ? [ESPERADO_C_INSERT(t), ""] : ["ok", "0"];
    if (st !== esperado[0] || n !== esperado[1]) mal.push(`${rol} ${op} ${t}: ${st}/${n}, esperado ${esperado.join("/")}`);
  }
  assert.deepEqual(mal, []);
});

await prueba("1c · service_role tiene BYPASSRLS: con grants vería todo (por eso su cierre son 1a y 1b)", () => {
  const sr = resC.filter(([, rol]) => rol === "service_role");
  assert.equal(sr.length, TABLAS.length);
  for (const [, , t, , st, n] of sr) assert.ok(st === "ok" && Number(n) >= 1, `${t}: ${st}/${n}`);
  assert.equal(sqlOk("select rolbypassrls from pg_roles where rolname = 'service_role'"), "t");
});

await prueba("1c · después de revertir, los grants de prueba no quedaron", () => {
  const out = sqlOk("select count(*) from information_schema.role_table_grants where table_schema = 'comunidad' and grantee in ('anon','authenticated','service_role','PUBLIC')");
  assert.equal(out, "0");
});

// ===========================================================================
// Usuarios reales del Auth local: autor, ajeno, suspendido, admin (AAL1/AAL2).
// ===========================================================================
const admin = createClient(URL_API, SRV, { auth: { persistSession: false, autoRefreshToken: false } });
const nuevoCliente = () => createClient(URL_API, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

// Las cuentas que crea ESTA corrida: se borran al final con lo que colgaba de
// ellas (E3b: antes quedaban en la base compartida, cuatro por corrida).
const creados = [];
async function usuario(prefijo) {
  const email = `${prefijo}-${Date.now()}-${randomBytes(3).toString("hex")}@comunidad.test`;
  const password = randomBytes(18).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  creados.push(data.user.id);
  const cliente = nuevoCliente();
  const { data: s, error: e2 } = await cliente.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { id: data.user.id, email, password, cliente, jwt: s.session.access_token };
}

/** RFC 6238 (TOTP, SHA-1, 30 s, 6 dígitos) con node:crypto. */
export function totp(secretoBase32, ahora = Date.now()) {
  const alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secretoBase32.replace(/=+$/, "").toUpperCase()) {
    const v = alfabeto.indexOf(c);
    if (v < 0) throw new Error(`base32 inválido: ${c}`);
    bits += v.toString(2).padStart(5, "0");
  }
  const clave = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(Math.floor(ahora / 1000 / 30)));
  const h = createHmac("sha1", clave).update(contador).digest();
  const o = h[h.length - 1] & 0xf;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

async function enrolarYVerificar(cliente, nombre) {
  const { data: f, error } = await cliente.auth.mfa.enroll({ factorType: "totp", friendlyName: nombre });
  if (error) throw new Error(`enroll: ${error.message}`);
  const { data: ch, error: e2 } = await cliente.auth.mfa.challenge({ factorId: f.id });
  if (e2) throw new Error(`challenge: ${e2.message}`);
  const { error: e3 } = await cliente.auth.mfa.verify({ factorId: f.id, challengeId: ch.id, code: totp(f.totp.secret) });
  if (e3) throw new Error(`verify: ${e3.message}`);
  return f.id;
}

const jwtDe = async (cliente) => (await cliente.auth.getSession()).data.session.access_token;
const aalDe = (jwt) => JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()).aal;

console.log("\n— Usuarios del Auth local —");
const sesiones = {};
let adminUsuario;
await prueba("crear autor, ajeno, suspendido y admin; participantes, reseña y suspensión puestas por el dueño", async () => {
  const autor = await usuario("autor"), ajeno = await usuario("ajeno"), susp = await usuario("suspendido");
  adminUsuario = await usuario("admin");
  sqlOk(`
    update public.profiles set is_admin = true where id = '${adminUsuario.id}';
    insert into comunidad.participantes (user_id) values ('${autor.id}'), ('${ajeno.id}'), ('${susp.id}');
    begin;
    do $$ declare p uuid; r bigint; v bigint; begin
      select id into p from comunidad.participantes where user_id = '${autor.id}';
      insert into comunidad.resenas (autor_participante, tipo, tmdb_id) values (p, 'movie', 603) returning id into r;
      insert into comunidad.versiones (resena_id, autor_participante, texto, estado, version_reglas, id_intento)
        values (r, p, repeat('Texto de prueba local, sin datos reales. ', 3), 'publicada', '2026-10-24.2', gen_random_uuid())
        returning id into v;
      update comunidad.resenas set version_vigente_id = v, primera_publicacion_en = now() where id = r;
    end $$;
    commit;
    insert into comunidad.suspensiones (participante_id, desde)
      select id, now() from comunidad.participantes where user_id = '${susp.id}';`);
  Object.assign(sesiones, { autor: autor.jwt, ajeno: ajeno.jwt, suspendido: susp.jwt });
});

await prueba("is_admin_mfa(): admin AAL1 → false", async () => {
  sesiones.adminAAL1 = adminUsuario.jwt;
  assert.equal(aalDe(sesiones.adminAAL1), "aal1");
  const { data, error } = await adminUsuario.cliente.rpc("is_admin_mfa");
  assert.ifError(error);
  assert.equal(data, false);
});

await prueba("is_admin_mfa(): admin AAL2 con UN factor verificado → false", async () => {
  await enrolarYVerificar(adminUsuario.cliente, "principal");
  const jwt = await jwtDe(adminUsuario.cliente);
  assert.equal(aalDe(jwt), "aal2");
  const { data, error } = await adminUsuario.cliente.rpc("is_admin_mfa");
  assert.ifError(error);
  assert.equal(data, false);
});

await prueba("is_admin_mfa(): admin AAL2 con DOS factores TOTP verificados → true", async () => {
  await enrolarYVerificar(adminUsuario.cliente, "respaldo");
  const n = sqlOk(`select count(*) from auth.mfa_factors where user_id = '${adminUsuario.id}' and factor_type = 'totp' and status = 'verified'`);
  assert.equal(n, "2");
  sesiones.adminAAL2 = await jwtDe(adminUsuario.cliente);
  assert.equal(aalDe(sesiones.adminAAL2), "aal2");
  const { data, error } = await adminUsuario.cliente.rpc("is_admin_mfa");
  assert.ifError(error);
  assert.equal(data, true);
});

await prueba("is_admin_mfa(): el mismo admin con dos factores pero sesión nueva AAL1 → false", async () => {
  const c = nuevoCliente();
  const { data: s, error } = await c.auth.signInWithPassword({ email: adminUsuario.email, password: adminUsuario.password });
  assert.ifError(error);
  assert.equal(aalDe(s.session.access_token), "aal1");
  const { data, error: e2 } = await c.rpc("is_admin_mfa");
  assert.ifError(e2);
  assert.equal(data, false);
});

await prueba("is_admin_mfa(): usuario común (sin is_admin) → false", async () => {
  const r = await fetch(`${URL_API}/rest/v1/rpc/is_admin_mfa`, {
    method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${sesiones.ajeno}`, "Content-Type": "application/json" }, body: "{}",
  });
  assert.equal(r.status, 200);
  assert.equal(await r.json(), false);
});

// ===========================================================================
// 2. REST
// ===========================================================================
console.log("\n— 2. REST —");
const QUIENES = () => ({
  anon: ANON, autor: sesiones.autor, ajeno: sesiones.ajeno, suspendido: sesiones.suspendido,
  adminAAL1: sesiones.adminAAL1, adminAAL2: sesiones.adminAAL2, service_role: SRV,
});

// Esperado: por el perfil por defecto (`public`) la tabla no existe para
// PostgREST → 404 PGRST205. Pidiendo el perfil `comunidad` → 406 PGRST106
// (esquema no expuesto). Ningún 2xx, para ningún rol ni método.
async function pedir(metodo, tabla, token, perfil) {
  const h = { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  if (perfil) h[metodo === "GET" ? "Accept-Profile" : "Content-Profile"] = perfil;
  const q = metodo === "GET" ? "?select=*" : metodo === "POST" ? "" : `?id=eq.${FX.resena}`;
  const r = await fetch(`${URL_API}/rest/v1/${tabla}${q}`, {
    method: metodo, headers: h, body: metodo === "GET" || metodo === "DELETE" ? undefined : "{}",
  });
  const cuerpo = await r.text();
  let codigo = "";
  try { codigo = JSON.parse(cuerpo).code ?? ""; } catch {}
  return { status: r.status, codigo };
}

await prueba(`REST: 7 credenciales × ${TABLAS.length} tablas × 4 métodos × 2 perfiles → nunca 2xx; 404 PGRST205 / 406 PGRST106`, async () => {
  const mal = [];
  let n = 0;
  for (const [quien, token] of Object.entries(QUIENES())) {
    for (const t of TABLAS) {
      for (const m of ["GET", "POST", "PATCH", "DELETE"]) {
        for (const perfil of [null, "comunidad"]) {
          const r = await pedir(m, t, token, perfil);
          n++;
          const esperado = perfil ? [406, "PGRST106"] : [404, "PGRST205"];
          if (r.status !== esperado[0] || r.codigo !== esperado[1]) mal.push(`${quien} ${m} ${perfil ?? "public"}/${t}: ${r.status} ${r.codigo}`);
        }
      }
    }
  }
  assert.equal(n, 7 * TABLAS.length * 4 * 2);
  assert.deepEqual(mal.slice(0, 10), [], `${mal.length} desvíos`);
});

await prueba("REST: el OpenAPI no menciona ninguna tabla de comunidad; de las RPC (E2b, E3a y E3b), anon no ve ninguna y service_role ve exactamente las del inventario", async () => {
  for (const [quien, token] of [["anon", ANON], ["service_role", SRV]]) {
    const r = await fetch(`${URL_API}/rest/v1/`, { headers: { apikey: ANON, Authorization: `Bearer ${token}` } });
    const doc = await r.json();
    const rutas = Object.keys(doc.paths ?? {});
    assert.ok(rutas.length > 0, "el OpenAPI vino vacío: la prueba no prueba nada");
    assert.deepEqual(rutas.filter((p) => TABLAS.some((t) => p === `/${t}`)), [], `${quien}: tablas`);
    const rpcs = rutas.filter((p) => p.includes("comunidad")).sort();
    assert.deepEqual(rpcs, quien === "anon" ? [] : Object.keys(RPC_COMUNIDAD).map((f) => `/rpc/${f}`).sort(), quien);
  }
});

await prueba("GraphQL: pg_graphql no está habilitada en la base local; el endpoint lo informa y no expone nada", async () => {
  // Si en Producción estuviera habilitada, pg_graphql sólo refleja lo que el rol
  // puede usar (USAGE del esquema y SELECT de tabla): lo cubren 1a y 1b. [E0]
  assert.equal(sqlOk("select count(*) from pg_extension where extname = 'pg_graphql'"), "0");
  for (const token of [ANON, sesiones.autor, SRV]) {
    const r = await fetch(`${URL_API}/graphql/v1`, {
      method: "POST",
      headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: "{ __schema { types { name } } }" }),
    });
    const j = await r.json();
    assert.equal(j.data, undefined);
    assert.match(JSON.stringify(j.errors), /pg_graphql extension is not enabled/);
  }
});

// ===========================================================================
// 3. RPC
// ===========================================================================
console.log("\n— 3. RPC —");



await prueba("las únicas public.comunidad_* son las del inventario (E2b, E3a, E3b, E4, E5a, E5b, E6 y E7), security definer y search_path vacío", () => {
  const out = sqlOk(`select proname || ':' || prosecdef || ':' || coalesce(array_to_string(proconfig, ','), '')
    from pg_proc where pronamespace = 'public'::regnamespace and proname like 'comunidad\\_%' order by 1`);
  const esperadas = [
    ...Object.keys(RPC_COMUNIDAD).map((f) => `${f}:true:search_path=""${LOCK_TIMEOUT[f] ? `,lock_timeout=${LOCK_TIMEOUT[f]}` : ""}`),
    ...Object.keys(RPC_ADMIN).map((f) => `${f}:true:search_path=""${ESCRIBE_ADMIN.has(f) ? ",lock_timeout=5s" : ""}`),
    // E5b (018): la lectura genera el orden de "Más útiles" y lleva lock_timeout; el perfil (E6), no.
    ...Object.keys(RPC_LECTURA).map((f) => `${f}:true:search_path=""${LOCK_LECTURA[f] ? `,lock_timeout=${LOCK_LECTURA[f]}` : ""}`),
  ].sort();
  assert.deepEqual(out.split("\n"), esperadas);
});

await prueba("catálogo: EXECUTE sólo service_role en las de E2b–E3b, y sólo authenticated en las de moderación (E4) y en la lectura (E5a) y el perfil (E6)", () => {
  const out = sqlOk(`select f.proname || ':' || r || ':' || has_function_privilege(r, f.oid, 'EXECUTE')
    from pg_proc f, unnest(array['public','anon','authenticated','service_role']) r
    where f.pronamespace = 'public'::regnamespace and f.proname like 'comunidad\\_%' order by 1`);
  const filas = out.split("\n");
  assert.equal(filas.length, (Object.keys(RPC_COMUNIDAD).length + Object.keys(RPC_ADMIN).length + Object.keys(RPC_LECTURA).length) * 4);
  const mal = filas.filter((l) => {
    const [f, rol] = l.split(":");
    const debe = f in RPC_ADMIN || f in RPC_LECTURA ? rol === "authenticated" : rol === "service_role";
    return !l.endsWith(debe ? ":true" : ":false");
  });
  assert.deepEqual(mal, []);
});

await prueba("RPC real por REST: anon y cada JWT reciben 401/403 en todas; service_role ejecuta (uid inexistente: sin efectos)", async () => {
  const mal = [];
  const nadie = "00000000-0000-4000-8000-00000000dead";
  for (const [quien, token] of Object.entries(QUIENES())) {
    for (const [f, args] of Object.entries(RPC_COMUNIDAD)) {
      const r = await fetch(`${URL_API}/rest/v1/rpc/${f}`, {
        method: "POST",
        headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(SIN_UID.has(f) ? args : { ...args, p_uid: nadie }),
      });
      const cuerpo = await r.text();
      if (quien === "service_role") {
        if (r.status !== 200) mal.push(`${quien} ${f}: ${r.status} ${cuerpo.slice(0, 80)}`);
      } else if (!((r.status === 401 || r.status === 403) && /42501|permission denied/.test(cuerpo))) {
        mal.push(`${quien} ${f}: ${r.status} ${cuerpo.slice(0, 80)}`);
      }
    }
  }
  assert.deepEqual(mal, []);
  assert.equal(sqlOk(`select count(*) from comunidad.bajas_en_curso where user_id = '${nadie}'`), "0");
  assert.equal(sqlOk(`select count(*) from comunidad.participantes where user_id = '${nadie}'`), "0");
});

await prueba("RPC real por REST a la lectura (E5a): anon y service_role → 401/403 sin datos; cada JWT real (autor, ajeno, suspendido, admin AAL1 y AAL2) → 200 como sí mismo", async () => {
  const mal = [];
  for (const [quien, token] of Object.entries(QUIENES())) {
    for (const [f, args] of Object.entries(RPC_LECTURA)) {
      const r = await fetch(`${URL_API}/rest/v1/rpc/${f}`, {
        method: "POST",
        headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      const cuerpo = await r.text();
      if (quien === "anon" || quien === "service_role") {
        if (!((r.status === 401 || r.status === 403) && /42501|permission denied/.test(cuerpo))) mal.push(`${quien} ${f}: ${r.status} ${cuerpo.slice(0, 80)}`);
      } else if (r.status !== 200) {
        mal.push(`${quien} ${f}: ${r.status} ${cuerpo.slice(0, 80)}`);
      }
    }
  }
  assert.deepEqual(mal, []);
});

await prueba("RPC real por REST a las de moderación (E4): anon, autor, ajeno, suspendido, admin AAL1 y service_role → 401/403 con 42501; el admin AAL2 con dos factores → 200 (pedidos sin efecto); nada se registra", async () => {
  const mal = [];
  const antes = sqlOk("select count(*) || '|' || (select publicacion_activa from comunidad.config) from comunidad.decisiones");
  // Pausar/reanudar al valor que YA tiene: para el admin AAL2 es `sin_efecto`.
  RPC_ADMIN.comunidad_admin_publicacion.p_activa = sqlOk("select publicacion_activa::text from comunidad.config") === "true";
  for (const [quien, token] of Object.entries(QUIENES())) {
    for (const [f, args] of Object.entries(RPC_ADMIN)) {
      const r = await fetch(`${URL_API}/rest/v1/rpc/${f}`, {
        method: "POST",
        headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      const cuerpo = await r.text();
      if (quien === "adminAAL2") {
        if (r.status !== 200) mal.push(`${quien} ${f}: ${r.status} ${cuerpo.slice(0, 80)}`);
      } else if (!((r.status === 401 || r.status === 403) && /42501/.test(cuerpo))) {
        mal.push(`${quien} ${f}: ${r.status} ${cuerpo.slice(0, 80)}`);
      }
    }
  }
  assert.deepEqual(mal, []);
  assert.equal(sqlOk("select count(*) || '|' || (select publicacion_activa from comunidad.config) from comunidad.decisiones"), antes);
});

await prueba("ninguna función del esquema comunidad es ejecutable por PUBLIC ni por los roles de la API", () => {
  const out = sqlOk(`select f.proname || ':' || r from pg_proc f, unnest(array['public','anon','authenticated','service_role']) r
    where f.pronamespace = 'comunidad'::regnamespace and has_function_privilege(r, f.oid, 'EXECUTE')`);
  assert.equal(out, "");
  assert.ok(Number(sqlOk("select count(*) from pg_proc where pronamespace = 'comunidad'::regnamespace")) >= 1, "no hay funciones: la prueba no prueba nada");
});

await prueba("RPC por REST a una función del esquema: 406 PGRST106 con el perfil, 404 sin él, para cada credencial", async () => {
  const mal = [];
  for (const [quien, token] of Object.entries(QUIENES())) {
    for (const perfil of [null, "comunidad"]) {
      const h = { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
      if (perfil) h["Content-Profile"] = perfil;
      const r = await fetch(`${URL_API}/rest/v1/rpc/resena_vigencia_coherente`, { method: "POST", headers: h, body: JSON.stringify({ p_resena: FX.resena }) });
      const esperado = perfil ? 406 : 404;
      if (r.status !== esperado) mal.push(`${quien} ${perfil ?? "public"}: ${r.status}`);
    }
  }
  assert.deepEqual(mal, []);
});

// ---------------------------------------------------------------------------
console.log("\n— Evidencia: ACL efectivas del esquema —");
console.log(sqlOk(`select 'esquema comunidad: ' || coalesce(nspacl::text, '(sin ACL)') from pg_namespace where nspname = 'comunidad'
  union all
  select c.relname || ': ' || coalesce(c.relacl::text, '(sin ACL)') from pg_class c
   where c.relnamespace = 'comunidad'::regnamespace and c.relkind in ('r', 'S') order by 1`));

// ---------------------------------------------------------------------------
console.log("\n— Limpieza (base compartida): sólo lo que creó esta corrida —");
{
  const us = creados.map((u) => `'${u}'`).join(",");
  if (us) {
    const ps = sqlOk(`select coalesce(string_agg(quote_literal(id), ','), '') from comunidad.participantes where user_id in (${us})`);
    if (ps) sqlOk(`begin;
      delete from comunidad.resenas where autor_participante in (${ps});
      delete from comunidad.suspensiones where participante_id in (${ps});
      delete from comunidad.contadores where participante_id in (${ps});
      delete from comunidad.participantes where id in (${ps});
      commit;`);
    for (const u of creados) await admin.auth.admin.deleteUser(u, false);
  }
  const restos = sqlOk(`select (select count(*) from auth.users where id in (${us || "null::uuid"}))
    || '|' || (select count(*) from comunidad.participantes where user_id in (${us || "null::uuid"}))`);
  console.log(`   cuentas: ${creados.length}; restos (cuentas|participantes): ${restos}`);
  if (restos !== "0|0") { console.log("✖ quedaron restos"); process.exitCode = 1; }
}
cerrar();
