#!/usr/bin/env node
// E4: moderación administrativa con las FUNCIONES REALES de 016 contra
// `supabase start`. SÓLO LOCAL.
//
// Uso:
//   node scripts/sala/db-local.mjs            (o 016 aplicada)
//   (servidor de la app con las claves locales en BASE, por defecto
//    http://localhost:3100, para la sección de la ruta)
//   node --env-file=.env.comunidad-local scripts/comunidad/pruebas-admin.mjs
//
// Qué es real: las funciones `public.comunidad_admin_*` y
// `comunidad_quitar_marcador_baja` (llamadas con la SESIÓN DEL ADMIN, como la
// ruta: anon key + Bearer), `is_admin_mfa()` con DOS factores TOTP reales
// enrolados y verificados en el Auth local (RFC 6238 con node:crypto), el
// adaptador de la ruta (lib/comunidad/admin-moderacion.ts), las funciones de
// producto de E3 para escribir, votar, denunciar, borrar y dar de baja (con la
// clave de servicio, como sus rutas), PostgREST, sesiones psql concurrentes y
// la ruta /api/admin/moderacion del servidor local.
// En las sesiones psql el admin llama a las MISMAS funciones con
// `role authenticated` y los claims de su JWT (sub y aal2); sus dos factores
// son los reales del Auth local.
//
// Resultados esperados escritos en cada prueba ANTES de correrla. Cuentas
// ficticias `@comunidad.test`; al final se borran ellas, sus participantes, lo
// que crearon y SUS decisiones. Configuración e interruptores vuelven a como
// estaban. Termina con 1 si algo falla.
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { arnes, contenedor, psql, sqlOk, urlLocal } from "./local.mjs";
import { dockerVerificado } from "./docker-local.mjs";
import { Sesion, barrera, cerrarSesiones, esperar, esperaLock, BARRERA } from "./sesiones.mjs";
import { escribirResena } from "../../lib/comunidad/escritura-nucleo.ts";
import { dependenciasEscritura, operacionesComunidad } from "../../lib/comunidad/escritura-deps.ts";
import { secretoDuplicados } from "../../lib/comunidad/duplicados.ts";
import { TERMINOS_VERSION } from "../../lib/comunidad/terminos.ts";
import { moderar } from "../../lib/comunidad/admin-moderacion.ts";
import { pedidoModeracion } from "../../lib/comunidad/admin-nucleo.ts";

const URL_API = urlLocal(process.env.NEXT_PUBLIC_SUPABASE_URL);
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SRV = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE = process.env.BASE || "http://localhost:3100";
if (!ANON || !SRV) { console.error("Faltan claves (¿--env-file=.env.comunidad-local?)"); process.exit(2); }
if (!["localhost", "127.0.0.1"].includes(new URL(BASE).hostname)) { console.error(`BASE no es local: ${BASE}`); process.exit(2); }
if (!secretoDuplicados()?.startsWith("local-prueba-")) { console.error("Falta el secreto HMAC LOCAL de prueba"); process.exit(2); }
const docker = dockerVerificado();
console.log(`docker: ${docker.nombre} (${docker.origen}) → ${docker.host}`);
console.log(`base: ${contenedor()} · API ${URL_API} · app ${BASE}\n`);
if (sqlOk("select count(*) from pg_proc where proname = 'comunidad_admin_decidir'") !== "1") {
  console.error("Falta 016_comunidad_admin.sql"); process.exit(2);
}

const opc = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const srv = createClient(URL_API, SRV, opc);
const deps = dependenciasEscritura(srv);
const ops = operacionesComunidad(srv);
const SOLO = process.env.SOLO ?? "";
const { prueba: pruebaArnes, cerrar } = arnes();
// La preparación de cuentas corre siempre: las demás dependen de ella.
const prueba = (n, fn) => (!SOLO || n.includes(SOLO) || n.startsWith("admin con DOS") ? pruebaArnes(n, fn) : Promise.resolve());
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const q = (v) => { if (!UUID.test(v)) throw new Error(`uuid inesperado: ${v}`); return `'${v}'`; };
const MOTIVO = "Motivo de prueba local (E4).";

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------
const FRASES = [
  "La fotografía es preciosa y cada plano parece pensado con cuidado.", "El guion se toma su tiempo pero nunca aburre.",
  "Las actuaciones sostienen la historia incluso en los momentos flojos.", "La música acompaña sin subrayar lo que ya se ve.",
  "El final me dejó pensando un buen rato.", "Hay un giro a mitad de camino que cambia todo lo anterior.",
  "Los diálogos suenan naturales y tienen humor.", "Se nota el presupuesto en los efectos y en el vestuario.",
  "El ritmo decae un poco en la segunda hora.", "La protagonista carga la película sobre sus hombros.",
  "Es ideal para ver en familia un domingo a la tarde.", "Tiene escenas de acción muy bien coreografiadas.",
  "El villano es de lo mejor que vi en años.", "La ambientación de época está muy lograda.",
  "Me reí más de lo que esperaba.", "El montaje es nervioso y le queda bien al tono.",
];
let nTexto = 0;
const BIEN = () => {
  const i = [...FRASES.keys()].sort(() => Math.random() - 0.5).slice(0, 3);
  return `${i.map((x) => FRASES[x]).join(" ")} Nota de la prueba de moderación número ${++nTexto}.`;
};
const SPAM = () => `Gana plata gratis con cripto: invertí hoy y duplicá tus ganancias en una semana, sorteo exclusivo para los primeros ${++nTexto}.`;
const TELEFONO = () => `La vi el fin de semana y me encantó. Si querés hablar de la peli llamame al 11 5566 77${10 + (++nTexto % 80)} y lo charlamos.`;
let tmdb = 9_400_000 + Math.floor(Math.random() * 10_000) * 10;

// ---------------------------------------------------------------------------
// Cuentas reales del Auth local
// ---------------------------------------------------------------------------
const cuentas = new Set();
const participantes = new Set();
async function cuenta(etiqueta, { terminos = true } = {}) {
  const email = `adm-${etiqueta}-${Date.now()}-${randomBytes(3).toString("hex")}@comunidad.test`;
  const password = `Pa-${randomBytes(15).toString("base64url")}`;
  const { data, error } = await srv.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  cuentas.add(data.user.id);
  const c = { uid: data.user.id, email, password };
  if (terminos) {
    const r = await ops.aceptarTerminos(c.uid, TERMINOS_VERSION);
    assert.equal(r.resultado, "terminos_aceptados", JSON.stringify(r));
    c.part = partDe(c);
  }
  return c;
}
function partDe(c) {
  const p = sqlOk(`select coalesce(id::text, '') from comunidad.participantes where user_id = ${q(c.uid)}`) || null;
  if (p) participantes.add(p);
  return p;
}
async function iniciarSesion(c) {
  const cli = createClient(URL_API, ANON, opc);
  const { data, error } = await cli.auth.signInWithPassword({ email: c.email, password: c.password });
  if (error) throw error;
  return { cli, jwt: data.session.access_token };
}

/** RFC 6238 (TOTP, SHA-1, 30 s, 6 dígitos). */
function totp(secretoBase32, ahora = Date.now()) {
  const alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secretoBase32.replace(/=+$/, "").toUpperCase()) bits += alfabeto.indexOf(ch).toString(2).padStart(5, "0");
  const clave = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const cont = Buffer.alloc(8);
  cont.writeBigUInt64BE(BigInt(Math.floor(ahora / 1000 / 30)));
  const h = createHmac("sha1", clave).update(cont).digest();
  const o = h[h.length - 1] & 0xf;
  return String((((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1_000_000).padStart(6, "0");
}
async function enrolarYVerificar(cli, nombre) {
  const { data: f, error } = await cli.auth.mfa.enroll({ factorType: "totp", friendlyName: nombre });
  if (error) throw new Error(`enroll: ${error.message}`);
  const { data: ch, error: e2 } = await cli.auth.mfa.challenge({ factorId: f.id });
  if (e2) throw new Error(`challenge: ${e2.message}`);
  const { error: e3 } = await cli.auth.mfa.verify({ factorId: f.id, challengeId: ch.id, code: totp(f.totp.secret) });
  if (e3) throw new Error(`verify: ${e3.message}`);
}
const aalDe = (jwt) => JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()).aal;
/** El cliente que usa la ruta: anon key + el Bearer del usuario (como `supabaseComoUsuario`). */
const comoUsuario = (jwt, fetchPropio) => createClient(URL_API, ANON, {
  ...opc, global: { headers: { Authorization: `Bearer ${jwt}` }, ...(fetchPropio ? { fetch: fetchPropio } : {}) },
});

// ---------------------------------------------------------------------------
// Operaciones
// ---------------------------------------------------------------------------
const publicar = (c, texto, { tmdbId = tmdb++, revision } = {}) =>
  escribirResena(deps, { uid: c.uid, idIntento: randomUUID(), texto, revision, accion: { tipo: "publicar", titulo: { tipo: "movie", tmdbId } } });
const editar = (c, resenaId, versionEsperada, texto, extra = {}) =>
  escribirResena(deps, { uid: c.uid, idIntento: randomUUID(), texto, ...extra, accion: { tipo: "editar", resenaId, versionEsperada } });
let sbAdmin = null;   // cliente con la sesión AAL2 del admin
/** Una acción por el MISMO camino que la ruta: pedidoModeracion → moderar. */
async function mod(cuerpo, sb = sbAdmin) {
  const p = pedidoModeracion(cuerpo);
  if ("invalido" in p) throw new Error(`pedido inválido: ${p.invalido}`);
  return moderar(sb, p);
}
const decidir = (decision, version, intento = randomUUID(), sb) => mod({ accion: "decidir", decision, version, motivo: MOTIVO, intento }, sb);
const estado = (id) => sqlOk(`select coalesce((select estado from comunidad.versiones where id = ${Number(id)}), 'eliminada')`);
const decisiones = (intento) => Number(sqlOk(`select count(*) from comunidad.decisiones where id_intento = ${q(intento)}`));
const decisionesDeVersion = (v) => Number(sqlOk(`select count(*) from comunidad.decisiones where version_id = ${Number(v)}`));
const tramos = (v) => sqlOk(`select count(*) filter (where vigente_hasta is null) || '|' || count(*) filter (where vigente_hasta is not null)
  from comunidad.tramos where version_id = ${Number(v)}`);
const visiblesPara = async (c, tmdbId) => ((await ops.leerTitulo(c.uid, "movie", tmdbId)).otras ?? []).map((o) => o.version_id);

/** Autor con una reseña RETENIDA por las reglas reales (spam). */
async function retenida(etiqueta) {
  const a = await cuenta(etiqueta);
  const tmdbId = tmdb++;
  const r = await publicar(a, SPAM(), { tmdbId });
  assert.equal(r.resultado, "retenida", JSON.stringify(r));
  return { a, r, tmdbId };
}
async function publicada(etiqueta) {
  const a = await cuenta(etiqueta);
  const tmdbId = tmdb++;
  const r = await publicar(a, BIEN(), { tmdbId });
  assert.equal(r.resultado, "publicada", JSON.stringify(r));
  return { a, r, tmdbId };
}

const config = (cols) => sqlOk(`update comunidad.config set ${Object.entries(cols).map(([k, v]) => `${k} = ${v}`).join(", ")}`);
const configPrevia = JSON.parse(sqlOk("select row_to_json(c)::text from comunidad.config c"));

const FUNCIONES_ADMIN = {
  comunidad_admin_decidir: { p_accion: "publicar", p_version: 9007199254740991, p_motivo: MOTIVO, p_id_intento: "00000000-0000-4000-8000-0000000000e4" },
  comunidad_admin_suspender: { p_participante: "00000000-0000-4000-8000-00000000dead", p_motivo: MOTIVO, p_id_intento: "00000000-0000-4000-8000-0000000000e5" },
  comunidad_admin_levantar_suspension: { p_participante: "00000000-0000-4000-8000-00000000dead", p_motivo: MOTIVO, p_id_intento: "00000000-0000-4000-8000-0000000000e6" },
  comunidad_quitar_marcador_baja: { p_user: "00000000-0000-4000-8000-00000000dead", p_motivo: MOTIVO, p_id_intento: "00000000-0000-4000-8000-0000000000e7" },
  comunidad_admin_publicacion: { p_activa: true, p_motivo: MOTIVO, p_id_intento: "00000000-0000-4000-8000-0000000000e8" },
  comunidad_admin_resumen: {},
  comunidad_admin_retenidos: { p_limite: 1, p_despues: null },
  comunidad_admin_denuncias: { p_limite: 1, p_despues: null },
  comunidad_admin_cuentas: {},
  comunidad_admin_registro: { p_limite: 1, p_antes: null },
  comunidad_admin_muestreo: {},
  comunidad_admin_retiradas: { p_limite: 1, p_despues: null },
  comunidad_admin_version: { p_version: 9007199254740991 },
};

// ⚠️ ENTORNO LOCAL: la base de `supabase start` no le da SELECT de
// `public.profiles` a `authenticated` (privilegios por defecto del CLI), así
// que `adminDeToken` no puede leer `is_admin` y la ruta responde 503 — al
// panel del Top le pasa lo mismo en local. Producción lo tiene (el dashboard
// funciona; sin verificar en E0). Sólo para esta corrida se concede y al final
// se revoca, si no estaba. No toca ninguna migración.
const grantPerfil = sqlOk("select has_table_privilege('authenticated', 'public.profiles', 'SELECT')::text") === "false";
if (grantPerfil) sqlOk("grant select on public.profiles to authenticated");

// ===========================================================================
config({ modulo_activo: true, publicacion_activa: true });
const S = {};
try {
  console.log("— Cuentas y sesiones reales —");
  await prueba("admin con DOS factores TOTP reales (aal2), el mismo admin en aal1 y un usuario común", async () => {
    S.admin = await cuenta("admin", { terminos: false });
    sqlOk(`update public.profiles set is_admin = true where id = ${q(S.admin.uid)}`);
    const { cli } = await iniciarSesion(S.admin);
    await enrolarYVerificar(cli, "principal");
    await enrolarYVerificar(cli, "respaldo");
    S.jwtAal2 = (await cli.auth.getSession()).data.session.access_token;
    assert.equal(aalDe(S.jwtAal2), "aal2");
    assert.equal(sqlOk(`select count(*) from auth.mfa_factors where user_id = ${q(S.admin.uid)} and status = 'verified'`), "2");
    S.jwtAal1 = (await iniciarSesion(S.admin)).jwt;
    assert.equal(aalDe(S.jwtAal1), "aal1");
    S.comun = await cuenta("comun");
    S.jwtComun = (await iniciarSesion(S.comun)).jwt;
    sbAdmin = comoUsuario(S.jwtAal2);
    const { data, error } = await sbAdmin.rpc("is_admin_mfa");
    assert.ifError(error);
    assert.equal(data, true);
  });

  // =========================================================================
  console.log("\n— Permisos: catálogo y RPC directo —");
  await prueba("catálogo: las 13 funciones del admin son security definer, search_path vacío, lock_timeout en las que escriben, EXECUTE SÓLO para authenticated", () => {
    const out = sqlOk(`select f.proname || ':' || f.prosecdef || ':' || coalesce(array_to_string(f.proconfig, ','), '') || ':' ||
        has_function_privilege('public', f.oid, 'EXECUTE') || has_function_privilege('anon', f.oid, 'EXECUTE')
        || has_function_privilege('authenticated', f.oid, 'EXECUTE') || has_function_privilege('service_role', f.oid, 'EXECUTE')
      from pg_proc f where f.pronamespace = 'public'::regnamespace
       and f.proname in (${Object.keys(FUNCIONES_ADMIN).map((x) => `'${x}'`).join(",")}) order by 1`);
    const escriben = new Set(["comunidad_admin_decidir", "comunidad_admin_suspender", "comunidad_admin_levantar_suspension",
      "comunidad_quitar_marcador_baja", "comunidad_admin_publicacion"]);
    assert.deepEqual(out.split("\n"), Object.keys(FUNCIONES_ADMIN).sort().map((f) =>
      `${f}:true:search_path=""${escriben.has(f) ? ",lock_timeout=5s" : ""}:falsefalsetruefalse`));
    assert.equal(sqlOk(`select count(*) from information_schema.role_table_grants where table_schema = 'comunidad'
      and table_name in ('decisiones', 'denuncias_cerradas') and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')`), "0");
  });

  await prueba("RPC directo por REST: anon, usuario común, admin AAL1 y service_role → 401/403 con 42501 en las 13; admin AAL2 → 200; nada cambia", async () => {
    const antes = sqlOk("select (select count(*) from comunidad.decisiones) || '|' || (select publicacion_activa from comunidad.config)");
    const quienes = { anon: ANON, comun: S.jwtComun, adminAal1: S.jwtAal1, service_role: SRV, adminAal2: S.jwtAal2 };
    const mal = [];
    for (const [quien, token] of Object.entries(quienes)) {
      for (const [f, args] of Object.entries(FUNCIONES_ADMIN)) {
        const r = await fetch(`${URL_API}/rest/v1/rpc/${f}`, {
          method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(args),
        });
        const cuerpo = await r.text();
        if (quien === "adminAal2") {
          if (r.status !== 200) mal.push(`${quien} ${f}: ${r.status} ${cuerpo.slice(0, 100)}`);
        } else if (!((r.status === 401 || r.status === 403) && /42501/.test(cuerpo))) {
          mal.push(`${quien} ${f}: ${r.status} ${cuerpo.slice(0, 100)}`);
        }
      }
    }
    assert.deepEqual(mal, []);
    // El admin AAL2 recibió `sin_efecto` (publicación ya activa) o `no_disponible`: ninguna decisión registrada.
    assert.equal(sqlOk("select (select count(*) from comunidad.decisiones) || '|' || (select publicacion_activa from comunidad.config)"), antes);
  });

  await prueba("adaptador de la ruta con la sesión AAL1 del admin y con un usuario común → `no_autorizado`; con AAL2 lee el resumen", async () => {
    for (const jwt of [S.jwtAal1, S.jwtComun]) {
      assert.deepEqual(await mod({ accion: "leer", vista: "resumen" }, comoUsuario(jwt)), { resultado: "no_autorizado" });
      assert.deepEqual(await decidir("publicar", 1, randomUUID(), comoUsuario(jwt)), { resultado: "no_autorizado" });
    }
    const r = await mod({ accion: "leer", vista: "resumen" });
    assert.equal(r.publicacion_activa, true);
    assert.equal(typeof r.retenidos, "number");
    assert.equal(r.muestreo_activo, false);
  });

  // =========================================================================
  console.log("\n— Decisiones atadas a versión —");
  await prueba("publicar un retenido: visible para otros, primera publicación fijada, sin votos ni tramos inventados, registrado con admin, motivo y versión", async () => {
    const { r, tmdbId } = await retenida("pub");
    const otro = await cuenta("pub-lector");
    assert.deepEqual(await visiblesPara(otro, tmdbId), []);
    const intento = randomUUID();
    const d = await decidir("publicar", r.version_id, intento);
    assert.equal(d.resultado, "aplicada", JSON.stringify(d));
    assert.deepEqual([d.estado, d.tramos, d.votos_vigentes], ["publicada", 0, 0]);
    assert.deepEqual(await visiblesPara(otro, tmdbId), [r.version_id]);
    assert.equal(sqlOk(`select (primera_publicacion_en is not null)::text from comunidad.resenas where id = ${r.resena_id}`), "true");
    assert.equal(tramos(r.version_id), "0|0");
    const log = JSON.parse(sqlOk(`select row_to_json(d)::text from (select admin_id, accion, version_id, motivo, detalle->>'estado_previo' as previo,
      (participante_id = (select autor_participante from comunidad.versiones where id = ${r.version_id}))::text as autor
      from comunidad.decisiones where id_intento = ${q(intento)}) d`));
    assert.deepEqual(log, { admin_id: S.admin.uid, accion: "publicar", version_id: r.version_id, motivo: MOTIVO, previo: "retenida", autor: "true" });
  });

  await prueba("rechazar un retenido: el autor lo ve rechazado y PUEDE corregirlo (rechazada → reemplazada); una edición limpia se publica", async () => {
    const { a, r } = await retenida("rech");
    const d = await decidir("rechazar", r.version_id);
    assert.deepEqual([d.resultado, d.estado], ["aplicada", "rechazada"]);
    const mia = (await ops.leerTitulo(a.uid, "movie", Number(sqlOk(`select tmdb_id from comunidad.resenas where id = ${r.resena_id}`)))).mia;
    assert.equal(mia.estado, "rechazada");
    const e = await editar(a, r.resena_id, r.version_id, BIEN());
    assert.equal(e.resultado, "publicada", JSON.stringify(e));
    assert.equal(estado(r.version_id), "reemplazada");
    // Una rechazada nunca vuelve a publicada.
    const d2 = await decidir("publicar", r.version_id);
    assert.equal(d2.resultado, "conflicto");
  });

  await prueba("revisión pedida (rechazo de contenido enviado a revisión): prioridad 1 en la cola; publicarla queda como falso positivo", async () => {
    const a = await cuenta("rev");
    const r = await publicar(a, TELEFONO(), { revision: true });
    assert.equal(r.resultado, "revision_solicitada", JSON.stringify(r));
    let item = null;
    for (let despues = null; ;) {
      const l = await mod({ accion: "leer", vista: "retenidos", despues });
      item = l.items.find((x) => x.version_id === r.version_id) ?? null;
      if (item || !l.hay_mas) break;
      despues = l.items.at(-1).cursor;
    }
    assert.ok(item, "la revisión está en la cola");
    assert.deepEqual([item.prioridad, item.estado], [1, "revision_solicitada"]);
    const intento = randomUUID();
    assert.equal((await decidir("publicar", r.version_id, intento)).resultado, "aplicada");
    assert.equal(sqlOk(`select detalle->>'falso_positivo' from comunidad.decisiones where id_intento = ${q(intento)}`), "true");
  });

  await prueba("retirar una publicada con votos: oculta, tramos cerrados, votos intactos, denuncias resueltas; restaurar: los MISMOS votos vuelven y los tramos se reabren con su mes original, sin duplicar", async () => {
    const { a, r, tmdbId } = await publicada("ret");
    const e1 = await cuenta("ret-ev1"), e2 = await cuenta("ret-ev2"), den = await cuenta("ret-den");
    assert.equal((await ops.votar(e1.uid, r.version_id, true)).resultado, "voto_registrado");
    assert.equal((await ops.votar(e2.uid, r.version_id, true)).resultado, "voto_registrado");
    assert.equal((await ops.denunciar(den.uid, r.version_id, "spam", null)).resultado, "denuncia_registrada");
    assert.equal(tramos(r.version_id), "2|0");
    const mesAntes = sqlOk(`select string_agg(mes_primera_positiva::text, ',' order by evaluador_participante) from comunidad.tramos where version_id = ${r.version_id}`);
    const d = await decidir("retirar", r.version_id);
    assert.deepEqual([d.resultado, d.estado, d.tramos, d.denuncias, d.votos_vigentes], ["aplicada", "oculta", 2, 1, 2]);
    assert.equal(tramos(r.version_id), "0|2");
    assert.deepEqual(await visiblesPara(den, tmdbId), []);
    assert.equal(sqlOk(`select estado from comunidad.denuncias where version_id = ${r.version_id}`), "resuelta");
    assert.equal((await ops.leerTitulo(a.uid, "movie", tmdbId)).mia.estado, "oculta");
    const d2 = await decidir("restaurar", r.version_id);
    assert.deepEqual([d2.resultado, d2.estado, d2.tramos, d2.votos_vigentes], ["aplicada", "publicada", 2, 2]);
    assert.equal(tramos(r.version_id), "2|2");
    assert.equal(sqlOk(`select string_agg(distinct mes_primera_positiva::text, ',') from comunidad.tramos where version_id = ${r.version_id}`), [...new Set(mesAntes.split(","))].join(","));
    assert.deepEqual(await visiblesPara(den, tmdbId), [r.version_id]);
    // Restaurar otra vez: conflicto (ya visible), ningún tramo ni registro de más.
    const n = decisionesDeVersion(r.version_id);
    assert.equal((await decidir("restaurar", r.version_id)).resultado, "conflicto");
    assert.deepEqual([tramos(r.version_id), decisionesDeVersion(r.version_id)], ["2|2", n]);
  });

  // A1 (auditoría de E4 sobre 9340da9): el recorrido del panel para restaurar.
  const retiradas = async (despues = null, sb = sbAdmin) => mod({ accion: "leer", vista: "retiradas", despues }, sb);
  const situacionDe = async (version, sb = sbAdmin) => mod({ accion: "leer", vista: "version", version }, sb);
  const enCola = async (vista, v) => ((await mod({ accion: "leer", vista })).items ?? []).some((x) => x.version_id === v);
  await prueba("A1 · retirar → sale de las dos colas → la encuentran Retiradas y la situación del Registro (votos que vuelven) → restaurar desde ahí: mismos votos, mes original, sin duplicar; ya no figura", async () => {
    const { r, tmdbId } = await publicada("a1-ret");
    const e1 = await cuenta("a1-ev1"), e2 = await cuenta("a1-ev2"), e3 = await cuenta("a1-ev3"), den = await cuenta("a1-den");
    assert.equal((await ops.votar(e1.uid, r.version_id, true)).resultado, "voto_registrado");
    assert.equal((await ops.votar(e2.uid, r.version_id, true)).resultado, "voto_registrado");
    assert.equal((await ops.votar(e3.uid, r.version_id, false)).resultado, "voto_registrado");
    assert.equal((await ops.denunciar(den.uid, r.version_id, "spam", null)).resultado, "denuncia_registrada");
    assert.equal(await enCola("denuncias", r.version_id), true);
    const mesAntes = sqlOk(`select string_agg(distinct mes_primera_positiva::text, ',') from comunidad.tramos where version_id = ${r.version_id}`);
    assert.equal((await decidir("retirar", r.version_id)).resultado, "aplicada");
    // Fuera de las dos colas (el retiro resolvió la denuncia).
    assert.deepEqual([await enCola("denuncias", r.version_id), await enCola("retenidos", r.version_id)], [false, false]);
    // Retiradas: la encuentra con lo que el aviso necesita.
    const l = await retiradas();
    const it = l.items.find((x) => x.version_id === r.version_id);
    assert.ok(it, "la retirada no aparece en Retiradas");
    assert.deepEqual([it.situacion, it.votos_vigentes, it.votos_recuperables, it.retiro.motivo, it.retiro.admin_propio, typeof it.texto],
      ["oculta", 3, 2, MOTIVO, true, "string"]);
    // El Registro: la decisión de retiro lleva a la situación ACTUAL de la versión.
    const reg = (await mod({ accion: "leer", vista: "registro" })).items.find((d) => d.version_id === r.version_id && d.accion === "retirar");
    assert.ok(reg);
    const s = await situacionDe(reg.version_id);
    assert.deepEqual([s.situacion, s.votos_recuperables], ["oculta", 2]);
    // Restaurar con el mismo camino que el diálogo del panel.
    const d2 = await decidir("restaurar", r.version_id);
    assert.deepEqual([d2.resultado, d2.estado, d2.tramos], ["aplicada", "publicada", 2]);
    assert.equal(tramos(r.version_id), "2|2");
    assert.equal(sqlOk(`select string_agg(distinct mes_primera_positiva::text, ',') from comunidad.tramos where version_id = ${r.version_id}`), mesAntes);
    assert.deepEqual(await visiblesPara(den, tmdbId), [r.version_id]);
    assert.equal((await retiradas()).items.some((x) => x.version_id === r.version_id), false);
    assert.deepEqual([(await situacionDe(r.version_id)).situacion, (await situacionDe(r.version_id)).votos_recuperables], ["visible", 0]);
    const n = decisionesDeVersion(r.version_id);
    assert.equal((await decidir("restaurar", r.version_id)).resultado, "conflicto");
    assert.deepEqual([tramos(r.version_id), decisionesDeVersion(r.version_id)], ["2|2", n]);
  });

  await prueba("A1 · Retiradas pagina por cursor sin repetir; con AAL1 o usuario común, Retiradas y la situación son `no_autorizado`", async () => {
    const vs = [];
    for (const k of [1, 2, 3]) {
      const { r } = await publicada(`a1-pag${k}`);
      assert.equal((await decidir("retirar", r.version_id)).resultado, "aplicada");
      vs.push(r.version_id);
    }
    const vistos = [];
    let despues = null;
    for (let i = 0; i < 50; i++) {
      const { data, error } = await sbAdmin.rpc("comunidad_admin_retiradas", { p_limite: 1, p_despues: despues });
      assert.ifError(error);
      vistos.push(...data.items.map((x) => x.version_id));
      if (!data.hay_mas) break;
      despues = data.items[0].cursor;
    }
    assert.equal(new Set(vistos).size, vistos.length, "repitió una retirada");
    assert.deepEqual(vs.filter((v) => vistos.includes(v)).sort(), [...vs].sort());
    assert.deepEqual(vistos.slice(0, 3), [...vs].reverse(), "la más reciente primero");
    for (const jwt of [S.jwtAal1, S.jwtComun]) {
      assert.deepEqual(await retiradas(null, comoUsuario(jwt)), { resultado: "no_autorizado" });
      assert.deepEqual(await situacionDe(vs[0], comoUsuario(jwt)), { resultado: "no_autorizado" });
    }
  });

  await prueba("A1 · retirada y después REEMPLAZADA, BORRADA o de una cuenta en BAJA: no figura en Retiradas, la situación lo dice y restaurar no resucita nada", async () => {
    // Reemplazada: el autor editó la retirada.
    const { a: a1, r: r1 } = await publicada("a1-reemp");
    assert.equal((await decidir("retirar", r1.version_id)).resultado, "aplicada");
    const e = await editar(a1, r1.resena_id, r1.version_id, BIEN());
    assert.equal(e.resultado, "publicada", JSON.stringify(e));
    // Borrada: el autor borró la reseña retirada.
    const { a: a2, r: r2 } = await publicada("a1-borr");
    assert.equal((await decidir("retirar", r2.version_id)).resultado, "aplicada");
    assert.equal((await ops.borrar(a2.uid, r2.resena_id)).resultado, "borrada");
    // Baja: la cuenta del autor se dio de baja.
    const { a: a3, r: r3 } = await publicada("a1-baja");
    assert.equal((await decidir("retirar", r3.version_id)).resultado, "aplicada");
    assert.ifError((await srv.rpc("comunidad_baja_comunitaria", { p_uid: a3.uid })).error);

    const lista = (await retiradas()).items.map((x) => x.version_id);
    for (const v of [r1.version_id, r2.version_id, r3.version_id]) assert.equal(lista.includes(v), false, `la versión ${v} sigue en Retiradas`);
    const s1 = await situacionDe(r1.version_id), s2 = await situacionDe(r2.version_id), s3 = await situacionDe(r3.version_id);
    assert.deepEqual([s1.situacion, s2.situacion, s2.texto, s3.situacion], ["reemplazada", "borrada", null, "eliminada"]);

    const n1 = decisionesDeVersion(r1.version_id), n2 = decisionesDeVersion(r2.version_id);
    const d1 = await decidir("restaurar", r1.version_id), d2 = await decidir("restaurar", r2.version_id), d3 = await decidir("restaurar", r3.version_id);
    assert.deepEqual([d1.resultado, d1.situacion, d2.resultado, d2.situacion, d3.resultado, d3.situacion],
      ["conflicto", "reemplazada", "conflicto", "borrada", "no_disponible", "eliminada"]);
    assert.deepEqual([estado(r1.version_id), estado(e.version_id), estado(r2.version_id), estado(r3.version_id)],
      ["reemplazada", "publicada", "oculta", "eliminada"]);
    assert.equal(sqlOk(`select (borrada_en is not null)::text from comunidad.resenas where id = ${r2.resena_id}`), "true");
    assert.deepEqual([decisionesDeVersion(r1.version_id), decisionesDeVersion(r2.version_id)], [n1, n2]);
    assert.equal(sqlOk(`select (select count(*) from comunidad.bajas_en_curso where user_id = ${q(a3.uid)} and cancelada_en is null)
      || '|' || (select count(*) from comunidad.participantes where user_id = ${q(a3.uid)})`), "1|0");
  });

  await prueba("decisión sobre una versión VIEJA: el autor editó → publicar la anterior es conflicto y la nueva no se toca", async () => {
    const { a, r } = await retenida("vieja");
    const e = await editar(a, r.resena_id, r.version_id, BIEN());
    assert.equal(e.resultado, "publicada");
    const d = await decidir("publicar", r.version_id);
    assert.deepEqual([d.resultado, d.situacion], ["conflicto", "reemplazada"]);
    assert.deepEqual([estado(r.version_id), estado(e.version_id)], ["reemplazada", "publicada"]);
    assert.equal(decisionesDeVersion(r.version_id), 0);
  });

  await prueba("reseña BORRADA por el autor: publicar su retenido es conflicto; la reseña sigue borrada (no resucita)", async () => {
    const { a, r, tmdbId } = await retenida("borrada");
    assert.equal((await ops.borrar(a.uid, r.resena_id)).resultado, "borrada");
    const d = await decidir("publicar", r.version_id);
    assert.deepEqual([d.resultado, d.situacion], ["conflicto", "borrada"]);
    assert.equal(sqlOk(`select (borrada_en is not null)::text || '|' || (select estado from comunidad.versiones where id = ${r.version_id})
      from comunidad.resenas where id = ${r.resena_id}`), "true|retenida");
    assert.deepEqual(await visiblesPara(await cuenta("borrada-lector"), tmdbId), []);
  });

  await prueba("cuenta en BAJA: la decisión tardía no encuentra nada (no_disponible) y la baja queda intacta", async () => {
    const { a, r } = await retenida("baja-tardia");
    const b = await srv.rpc("comunidad_baja_comunitaria", { p_uid: a.uid });
    assert.ifError(b.error);
    const d = await decidir("publicar", r.version_id);
    assert.deepEqual([d.resultado, d.situacion], ["no_disponible", "eliminada"]);
    assert.equal(sqlOk(`select (select count(*) from comunidad.bajas_en_curso where user_id = ${q(a.uid)} and cancelada_en is null)
      || '|' || (select count(*) from comunidad.participantes where user_id = ${q(a.uid)})`), "1|0");
  });

  await prueba("decisiones SIMULTÁNEAS sobre la misma versión (publicar y rechazar, intentos distintos): una se aplica, la otra es conflicto; un solo registro", async () => {
    const { r } = await retenida("simul");
    const [x, y] = await Promise.all([decidir("publicar", r.version_id), decidir("rechazar", r.version_id)]);
    const res = [x.resultado, y.resultado].sort();
    assert.deepEqual(res, ["aplicada", "conflicto"], JSON.stringify([x, y]));
    assert.equal(decisionesDeVersion(r.version_id), 1);
    assert.ok(["publicada", "rechazada"].includes(estado(r.version_id)));
  });

  await prueba("reintento con el MISMO intento: devuelve lo registrado (repetido) sin otra fila; el mismo intento sobre OTRA versión es conflicto", async () => {
    const { r } = await retenida("reint");
    const { r: r2 } = await retenida("reint-2");
    const intento = randomUUID();
    const d1 = await decidir("publicar", r.version_id, intento);
    const d2 = await decidir("publicar", r.version_id, intento);
    assert.equal(d1.resultado, "aplicada");
    assert.deepEqual([d2.resultado, d2.repetido], ["aplicada", true]);
    assert.equal(decisiones(intento), 1);
    const d3 = await decidir("publicar", r2.version_id, intento);
    assert.deepEqual([d3.resultado, d3.motivo], ["conflicto", "intento"]);
    assert.equal(estado(r2.version_id), "retenida");
  });

  await prueba("respuesta PERDIDA después del commit: el adaptador repite UNA vez con el mismo intento y recupera `aplicada`; un solo registro", async () => {
    const { r } = await retenida("perdida");
    let perdidas = 0, llamadas = 0;
    const f = async (input, init) => {
      const resp = await fetch(input, init);
      if (!String(input.url ?? input).includes("/rpc/comunidad_admin_decidir")) return resp;
      llamadas++;
      if (perdidas++ === 0) { await resp.arrayBuffer(); throw new TypeError("fetch failed (respuesta descartada por la prueba)"); }
      return resp;
    };
    const intento = randomUUID();
    const d = await decidir("publicar", r.version_id, intento, comoUsuario(S.jwtAal2, f));
    assert.deepEqual([d.resultado, d.repetido, llamadas], ["aplicada", true, 2]);
    assert.equal(decisiones(intento), 1);
  });

  await prueba("descartar: la reseña sigue visible, las denuncias quedan descartadas y la próxima denuncia de esas cuentas pesa la mitad", async () => {
    const { r, tmdbId } = await publicada("desc");
    const d1 = await cuenta("desc-d1"), d2 = await cuenta("desc-d2");
    for (const d of [d1, d2]) assert.equal((await ops.denunciar(d.uid, r.version_id, "otro", null)).resultado, "denuncia_registrada");
    const d = await decidir("descartar", r.version_id);
    assert.deepEqual([d.resultado, d.denuncias, d.estado], ["aplicada", 2, "publicada"]);
    assert.deepEqual(await visiblesPara(d1, tmdbId), [r.version_id]);
    const { r: otra } = await publicada("desc-otra");
    assert.equal((await ops.denunciar(d1.uid, otra.version_id, "otro", null)).resultado, "denuncia_registrada");
    assert.equal(Number(sqlOk(`select peso from comunidad.cola_denuncias() where version_id = ${otra.version_id}`)), 0.5);
  });

  await prueba("cerrar: con la reseña visible es conflicto (hay que decidir); borrada por el autor, el caso se archiva como resuelto", async () => {
    const { a, r } = await publicada("cerrar");
    const den = await cuenta("cerrar-den");
    await ops.denunciar(den.uid, r.version_id, "acoso_amenazas", null);
    assert.deepEqual([(await decidir("cerrar", r.version_id)).motivo], ["visible"]);
    await ops.borrar(a.uid, r.resena_id);
    const d = await decidir("cerrar", r.version_id);
    assert.deepEqual([d.resultado, d.denuncias], ["aplicada", 1]);
    assert.equal(sqlOk(`select estado from comunidad.denuncias where version_id = ${r.version_id}`), "resuelta");
  });

  await prueba("ataque de denuncias graves sobre una reseña legítima: sigue visible, sube a la cabeza de la cola; 'No me sirvió' masivo no cambia nada", async () => {
    const { r, tmdbId } = await publicada("ataque");
    const atacantes = [];
    for (let i = 0; i < 5; i++) atacantes.push(await cuenta(`ataque-${i}`));
    for (const x of atacantes) assert.equal((await ops.denunciar(x.uid, r.version_id, "sexual_explotacion", null)).resultado, "denuncia_registrada");
    assert.equal(estado(r.version_id), "publicada");
    assert.deepEqual(await visiblesPara(atacantes[0], tmdbId), [r.version_id]);
    const cola = await mod({ accion: "leer", vista: "denuncias" });
    const caso = cola.items.find((x) => x.version_id === r.version_id);
    assert.ok(caso && caso.grave === true && caso.denunciantes === 5 && caso.situacion === "visible");
    const i = cola.items.findIndex((x) => x.version_id === r.version_id);
    assert.ok(cola.items.slice(0, i).every((x) => x.grave), "delante sólo hay casos graves");
    const { r: otra } = await publicada("nomesirvio");
    const antes = sqlOk("select count(*) from comunidad.cola_denuncias()") + "|" + sqlOk("select comunidad.retenidos_sin_resolver(null, null)");
    for (const x of atacantes) assert.equal((await ops.votar(x.uid, otra.version_id, false)).resultado, "voto_registrado");
    assert.equal(estado(otra.version_id), "publicada");
    assert.equal(sqlOk("select count(*) from comunidad.cola_denuncias()") + "|" + sqlOk("select comunidad.retenidos_sin_resolver(null, null)"), antes);
  });

  // =========================================================================
  console.log("\n— Suspensión —");
  await prueba("suspender: no publica ni vota; SÍ borra, denuncia, bloquea y retira votos (filas B–D). Levantar: vuelve a votar. Dos registros", async () => {
    const s = await cuenta("susp");
    const { r: suya } = await publicada("susp-propia-autor");
    const { r: ajena, a: autorAjeno } = await publicada("susp-ajena");
    assert.equal((await ops.votar(s.uid, ajena.version_id, true)).resultado, "voto_registrado");
    const propia = await publicar(s, BIEN());
    assert.equal(propia.resultado, "publicada");
    const i1 = randomUUID();
    const d = await mod({ accion: "suspender", participante: s.part, motivo: MOTIVO, intento: i1 });
    assert.equal(d.resultado, "aplicada", JSON.stringify(d));
    assert.deepEqual(await ops.votar(s.uid, suya.version_id, true), { resultado: "rechazo_cuenta", motivo: "suspendida" });
    assert.equal((await publicar(s, BIEN())).resultado, "rechazo_cuenta");
    assert.equal((await ops.retirarVoto(s.uid, ajena.version_id)).resultado, "voto_retirado");
    assert.equal((await ops.denunciar(s.uid, ajena.version_id, "spam", null)).resultado, "denuncia_registrada");
    assert.equal((await ops.bloquear(s.uid, suya.version_id)).resultado, "bloqueado");
    assert.equal((await ops.borrar(s.uid, propia.resena_id)).resultado, "borrada");
    assert.equal((await mod({ accion: "suspender", participante: s.part, motivo: MOTIVO, intento: randomUUID() })).situacion, "ya_suspendida");
    const i2 = randomUUID();
    assert.equal((await mod({ accion: "levantar", participante: s.part, motivo: MOTIVO, intento: i2 })).resultado, "aplicada");
    assert.equal((await ops.votar(s.uid, ajena.version_id, true)).resultado, "voto_registrado");
    assert.equal((await mod({ accion: "levantar", participante: s.part, motivo: MOTIVO, intento: randomUUID() })).situacion, "sin_suspension");
    assert.equal(decisiones(i1) + decisiones(i2), 2);
    assert.ok(autorAjeno);
  });

  await prueba("suspender a una cuenta dada de baja: no_disponible (cuenta eliminada), nada se escribe", async () => {
    const x = await cuenta("susp-baja");
    const part = x.part;
    assert.ifError((await srv.rpc("comunidad_baja_comunitaria", { p_uid: x.uid })).error);
    const intento = randomUUID();
    const d = await mod({ accion: "suspender", participante: part, motivo: MOTIVO, intento });
    assert.deepEqual([d.resultado, d.situacion], ["no_disponible", "cuenta_eliminada"]);
    assert.equal(decisiones(intento), 0);
    assert.equal(sqlOk(`select count(*) from comunidad.suspensiones where participante_id = ${q(part)}`), "0");
  });

  // Caso 5 de §2.2.4 con las funciones de PRODUCTO (gate de E4).
  const comoAdminSql = (sql) => `begin;
set local role authenticated;
select set_config('request.jwt.claims', '${JSON.stringify({ sub: S.admin.uid, role: "authenticated", aal: "aal2" })}', true);
${sql}
reset role;`;
  await prueba("caso 5a · la suspensión (real) confirma primero: el voto (real) espera la fila del evaluador, relee y se rechaza (suspendida)", async () => {
    const { r } = await publicada("c5a-au");
    const ev = await cuenta("c5a-ev");
    const b = await barrera(41);
    const Su = new Sesion("e4-c5a-suspender"), Vo = new Sesion("e4-c5a-votar");
    Su.enviar(comoAdminSql(`select 'RES|' || public.comunidad_admin_suspender(${q(ev.part)}, '${MOTIVO}', '${randomUUID()}')::text;`)
      + `\n${BARRERA(41)}\ncommit;`);
    await esperar(esperaLock(Su, "advisory"), "la suspensión aplicada retiene sus locks");
    Vo.enviar(`begin;\nselect 'RES|' || public.comunidad_votar(${q(ev.uid)}, ${r.version_id}, true)::text;\ncommit;`);
    await esperar(esperaLock(Vo), "el voto espera la fila del evaluador");
    b.soltar();
    await Su.terminar(); await Vo.terminar();
    assert.equal(JSON.parse(Su.lineas("RES")[0][0]).resultado, "aplicada");
    assert.deepEqual(JSON.parse(Vo.lineas("RES")[0][0]), { resultado: "rechazo_cuenta", motivo: "suspendida" });
    assert.equal(sqlOk(`select count(*) from comunidad.evaluaciones where version_id = ${r.version_id}`), "0");
  });

  await prueba("caso 5b · el voto (real) confirma primero: la suspensión (real) espera y su `desde` es POSTERIOR a la marca del voto", async () => {
    const { r } = await publicada("c5b-au");
    const ev = await cuenta("c5b-ev");
    const b = await barrera(42);
    const Vo = new Sesion("e4-c5b-votar"), Su = new Sesion("e4-c5b-suspender");
    Vo.enviar(`begin;\nselect 'RES|' || public.comunidad_votar(${q(ev.uid)}, ${r.version_id}, true)::text;\n${BARRERA(42)}\ncommit;`);
    await esperar(esperaLock(Vo, "advisory"), "el voto aplicado retiene sus locks");
    Su.enviar(comoAdminSql(`select 'RES|' || public.comunidad_admin_suspender(${q(ev.part)}, '${MOTIVO}', '${randomUUID()}')::text;`) + "\ncommit;");
    await esperar(esperaLock(Su), "la suspensión espera la fila del evaluador");
    b.soltar();
    await Vo.terminar(); await Su.terminar();
    assert.equal(JSON.parse(Vo.lineas("RES")[0][0]).resultado, "voto_registrado");
    assert.equal(JSON.parse(Su.lineas("RES")[0][0]).resultado, "aplicada");
    assert.equal(sqlOk(`select ((select min(desde) from comunidad.suspensiones where participante_id = ${q(ev.part)})
      > (select creada_en from comunidad.evaluaciones where version_id = ${r.version_id}))::text`), "true");
  });

  await prueba("decisión del admin y edición del autor en paralelo (sesiones): la edición espera la reseña; al confirmar la decisión, la edición reemplaza la versión ya decidida", async () => {
    const { a, r } = await retenida("par-edit");
    const b = await barrera(43);
    const Ad = new Sesion("e4-par-decidir");
    Ad.enviar(comoAdminSql(`select 'RES|' || public.comunidad_admin_decidir('rechazar', ${r.version_id}, '${MOTIVO}', '${randomUUID()}')::text;`)
      + `\n${BARRERA(43)}\ncommit;`);
    await esperar(esperaLock(Ad, "advisory"), "la decisión retiene sus locks");
    const ed = editar(a, r.resena_id, r.version_id, BIEN());
    await esperar(`exists (select 1 from pg_stat_activity where wait_event_type = 'Lock' and query like '%comunidad_editar%')`, "la edición espera");
    b.soltar();
    await Ad.terminar();
    const e = await ed;
    assert.equal(JSON.parse(Ad.lineas("RES")[0][0]).resultado, "aplicada");
    assert.equal(e.resultado, "publicada", JSON.stringify(e));
    assert.deepEqual([estado(r.version_id), estado(e.version_id)], ["reemplazada", "publicada"]);
  });

  // =========================================================================
  console.log("\n— Baja: cancelación (B10, B14), denuncias recibidas y concurrencia —");
  await prueba("B10 · quitar el marcador (real): nada se restaura; el participante viejo sigue huérfano; la próxima identidad nace nueva y publica", async () => {
    const { a, r } = await publicada("b10");
    const viejo = a.part;
    assert.ifError((await srv.rpc("comunidad_baja_comunitaria", { p_uid: a.uid })).error);
    const intento = randomUUID();
    const d = await mod({ accion: "quitar_marcador", cuenta: a.uid, motivo: MOTIVO, intento });
    assert.equal(d.resultado, "aplicada", JSON.stringify(d));
    assert.equal(sqlOk(`select (cancelada_en is not null)::text from comunidad.bajas_en_curso where user_id = ${q(a.uid)}`), "true");
    assert.equal(sqlOk(`select count(*) from comunidad.resenas where id = ${r.resena_id}`), "0");
    assert.equal(sqlOk(`select coalesce(user_id::text, 'null') from comunidad.participantes where id = ${q(viejo)}`), "null");
    assert.equal((await ops.aceptarTerminos(a.uid, TERMINOS_VERSION)).resultado, "terminos_aceptados");
    const nuevo = partDe(a);
    assert.ok(nuevo && nuevo !== viejo);
    assert.equal((await publicar(a, BIEN())).resultado, "publicada");
    assert.equal(sqlOk(`select cuenta_id::text from comunidad.decisiones where id_intento = ${q(intento)}`), a.uid);
    // Repetir: sin efecto; el mismo intento: lo registrado.
    assert.equal((await mod({ accion: "quitar_marcador", cuenta: a.uid, motivo: MOTIVO, intento: randomUUID() })).situacion, "ya_cancelado");
    assert.equal((await mod({ accion: "quitar_marcador", cuenta: a.uid, motivo: MOTIVO, intento })).repetido, true);
    assert.equal(decisiones(intento), 1);
  });

  await prueba("B14 · suspendida → baja → quitar el marcador con la sanción vigente: nace suspendida; no publica ni vota; sí bloquea, borra y vuelve a pedir la baja (reactiva)", async () => {
    const a = await cuenta("b14");
    const { r: ajena } = await publicada("b14-ajena");
    assert.equal((await mod({ accion: "suspender", participante: a.part, motivo: MOTIVO, intento: randomUUID() })).resultado, "aplicada");
    assert.ifError((await srv.rpc("comunidad_baja_comunitaria", { p_uid: a.uid })).error);
    assert.equal(sqlOk(`select (sancion_hasta = 'infinity')::text from comunidad.bajas_en_curso where user_id = ${q(a.uid)}`), "true");
    assert.equal((await mod({ accion: "quitar_marcador", cuenta: a.uid, motivo: MOTIVO, intento: randomUUID() })).resultado, "aplicada");
    assert.equal((await ops.aceptarTerminos(a.uid, TERMINOS_VERSION)).resultado, "terminos_aceptados");
    const nuevo = partDe(a);
    assert.equal(sqlOk(`select count(*) from comunidad.suspensiones where participante_id = ${q(nuevo)} and hasta is null`), "1");
    assert.deepEqual(await publicar(a, BIEN()), { resultado: "rechazo_cuenta", motivo: "suspendida" });
    assert.deepEqual(await ops.votar(a.uid, ajena.version_id, true), { resultado: "rechazo_cuenta", motivo: "suspendida" });
    assert.equal((await ops.bloquear(a.uid, ajena.version_id)).resultado, "bloqueado");
    const b = await srv.rpc("comunidad_baja_comunitaria", { p_uid: a.uid });
    assert.ifError(b.error);
    assert.equal(b.data.marcador, "reactivado");
  });

  await prueba("levantar una sanción CON plazo (copiada por B14 con fin futuro): se acorta a ahora; nunca se reescribe el pasado", async () => {
    const a = await cuenta("plazo");
    sqlOk(`insert into comunidad.suspensiones (participante_id, desde, hasta) values (${q(a.part)}, now() - interval '1 hour', now() + interval '10 days')`);
    const d = await mod({ accion: "levantar", participante: a.part, motivo: MOTIVO, intento: randomUUID() });
    assert.equal(d.resultado, "aplicada");
    assert.equal(sqlOk(`select (hasta <= now() + interval '1 second' and hasta > now() - interval '1 minute')::text from comunidad.suspensiones where participante_id = ${q(a.part)}`), "true");
    // El trigger no deja mover el pasado ni alargar.
    const r = psql(`do $$ begin
      begin update comunidad.suspensiones set hasta = now() - interval '2 hours' where participante_id = ${q(a.part)}; raise notice 'MAL';
      exception when check_violation then raise notice 'BIEN'; end; end $$;`);
    assert.match(r.stderr, /BIEN/);
    assert.doesNotMatch(r.stderr, /MAL/);
  });

  await prueba("denuncias RECIBIDAS en la baja del autor: se cierran en el historial mínimo (sin texto, sin comentario, sin el autor); el peso de quien denunció se conserva; su propia baja las borra", async () => {
    const { a, r } = await publicada("hist-autor");
    const d1 = await cuenta("hist-d1"), d2 = await cuenta("hist-d2");
    // d2 ya tenía una descartada sobre otra reseña de este autor.
    const otra = await publicar(a, BIEN());
    await ops.denunciar(d2.uid, otra.version_id, "otro", "comentario de prueba sobre la reseña");
    assert.equal((await decidir("descartar", otra.version_id)).resultado, "aplicada");
    await ops.denunciar(d1.uid, r.version_id, "acoso_amenazas", "otro comentario de prueba");
    assert.ifError((await srv.rpc("comunidad_baja_comunitaria", { p_uid: a.uid })).error);
    assert.equal(sqlOk(`select count(*) from comunidad.denuncias where version_id in (${r.version_id}, ${otra.version_id})`), "0");
    const h = sqlOk(`select string_agg(categoria || ':' || estado, ',' order by estado) from comunidad.denuncias_cerradas
      where denunciante_participante in (${q(d1.part)}, ${q(d2.part)})`);
    assert.equal(h, "acoso_amenazas:cerrada_por_baja,otro:descartada");
    assert.equal(sqlOk(`select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns
      where table_schema = 'comunidad' and table_name = 'denuncias_cerradas'`), "id,denunciante_participante,categoria,estado,creada_en,cerrada_en");
    const { r: nueva } = await publicada("hist-nueva");
    await ops.denunciar(d2.uid, nueva.version_id, "otro", null);
    assert.equal(Number(sqlOk(`select peso from comunidad.cola_denuncias() where version_id = ${nueva.version_id}`)), 0.5);
    // El registro de decisiones sobre las versiones borradas sobrevive, con el autor seudónimo sin cuenta.
    assert.equal(sqlOk(`select count(*) from comunidad.decisiones d join comunidad.participantes p on p.id = d.participante_id
      where d.version_id = ${otra.version_id} and p.user_id is null`), "1");
    assert.ifError((await srv.rpc("comunidad_baja_comunitaria", { p_uid: d2.uid })).error);
    assert.equal(sqlOk(`select count(*) from comunidad.denuncias_cerradas where denunciante_participante = ${q(d2.part)}`), "0");
  });

  // A2 (auditoría de E4 sobre 9340da9): dos bajas simultáneas, la del autor y
  // la de quien lo denunció. El historial de quien denunció NO puede
  // reaparecer después de su baja, en ninguno de los dos órdenes de
  // confirmación, y la denuncia de una cuenta ACTIVA (c) se conserva.
  // Determinista: la primera baja termina su función y queda retenida por una
  // barrera; la segunda se observa ESPERANDO un lock de fila (no consultivo)
  // antes de soltar la primera.
  const esperaFila = (s) => `exists (select 1 from pg_stat_activity where application_name = '${s.app}'
    and wait_event_type = 'Lock' and wait_event <> 'advisory')`;
  async function dosBajas(primero, nb) {
    const { a, r } = await publicada(`a2-autor-${primero}`);
    const b = await cuenta(`a2-denun-${primero}`), c = await cuenta(`a2-activa-${primero}`);
    assert.equal((await ops.denunciar(b.uid, r.version_id, "spam", "comentario de prueba de b")).resultado, "denuncia_registrada");
    assert.equal((await ops.denunciar(c.uid, r.version_id, "otro", null)).resultado, "denuncia_registrada");
    const [x, y] = primero === "denunciante" ? [b, a] : [a, b];
    const bx = await barrera(nb), by = await barrera(nb + 1);
    const Sx = new Sesion(`a2-${primero}-1`), Sy = new Sesion(`a2-${primero}-2`);
    Sx.enviar(`begin;\nselect 'RES|' || public.comunidad_baja_comunitaria(${q(x.uid)})::text;\n${BARRERA(nb)}\ncommit;`);
    await esperar(esperaLock(Sx, "advisory"), "la primera baja terminó su función y espera la barrera sin confirmar");
    Sy.enviar(`begin;\nselect 'RES|' || public.comunidad_baja_comunitaria(${q(y.uid)})::text;\n${BARRERA(nb + 1)}\ncommit;`);
    await esperar(esperaFila(Sy), "la segunda baja espera una fila retenida por la primera");
    bx.soltar();
    await esperar(esperaLock(Sy, "advisory"), "la segunda baja terminó su función");
    by.soltar();
    const ox = await Sx.terminar(), oy = await Sy.terminar();
    assert.doesNotMatch(ox.err + oy.err, /ERROR|deadlock/i, ox.err + oy.err);
    assert.equal(Sx.lineas("RES").length, 1); assert.equal(Sy.lineas("RES").length, 1);
    assert.equal(sqlOk(`select count(*) from comunidad.participantes where id in (${q(a.part)}, ${q(b.part)}) and user_id is null`), "2");
    const hb = sqlOk(`select count(*) from comunidad.denuncias_cerradas where denunciante_participante = ${q(b.part)}`);
    const hc = sqlOk(`select coalesce(string_agg(categoria || ':' || estado, ','), '') from comunidad.denuncias_cerradas
      where denunciante_participante = ${q(c.part)}`);
    console.log(`     historial de b (dado de baja): ${hb}; de c (activa): ${hc}; resultado y: ${JSON.stringify(JSON.parse(Sy.lineas("RES")[0][0]))}`);
    assert.equal(hb, "0", "el historial de quien denunció reapareció después de su baja");
    assert.equal(hc, "otro:cerrada_por_baja");
    assert.equal(sqlOk(`select count(*) from comunidad.denuncias where version_id = ${r.version_id}`), "0");
  }
  await prueba("A2 · bajas simultáneas, confirma primero quien DENUNCIÓ (secuencia de la auditoría): su historial no reaparece; la denuncia de una cuenta activa queda en el historial", () => dosBajas("denunciante", 61));
  await prueba("A2 · bajas simultáneas, confirma primero el AUTOR: la baja de quien denunció espera, relee y borra el historial recién creado; la de la cuenta activa queda", () => dosBajas("autor", 63));

  await prueba("A2 · denuncias CRUZADAS (cada uno denunció al otro) y bajas simultáneas: sin deadlock, la segunda espera y ningún historial de los dos queda", async () => {
    const { a, r: ra } = await publicada("a2-cruz-a");
    const { a: b, r: rb } = await publicada("a2-cruz-b");
    assert.equal((await ops.denunciar(a.uid, rb.version_id, "spam", null)).resultado, "denuncia_registrada");
    assert.equal((await ops.denunciar(b.uid, ra.version_id, "odio", "comentario cruzado")).resultado, "denuncia_registrada");
    const bx = await barrera(65), by = await barrera(66);
    const Sx = new Sesion("a2-cruz-1"), Sy = new Sesion("a2-cruz-2");
    Sx.enviar(`begin;\nselect 'RES|' || public.comunidad_baja_comunitaria(${q(a.uid)})::text;\n${BARRERA(65)}\ncommit;`);
    await esperar(esperaLock(Sx, "advisory"), "la baja de a espera la barrera sin confirmar");
    Sy.enviar(`begin;\nselect 'RES|' || public.comunidad_baja_comunitaria(${q(b.uid)})::text;\n${BARRERA(66)}\ncommit;`);
    await esperar(esperaFila(Sy), "la baja de b espera las denuncias que retiene la de a");
    bx.soltar();
    await esperar(esperaLock(Sy, "advisory"), "la baja de b terminó su función");
    by.soltar();
    const ox = await Sx.terminar(), oy = await Sy.terminar();
    assert.doesNotMatch(ox.err + oy.err, /ERROR|deadlock/i, ox.err + oy.err);
    assert.equal(sqlOk(`select count(*) from comunidad.denuncias_cerradas where denunciante_participante in (${q(a.part)}, ${q(b.part)})`), "0");
    assert.equal(sqlOk(`select count(*) from comunidad.participantes where id in (${q(a.part)}, ${q(b.part)}) and user_id is null`), "2");
  });

  await prueba("quitar el marcador mientras la baja de esa cuenta confirma (sesiones): espera su K_CUENTA y después cancela el marcador recién creado", async () => {
    const a = await cuenta("conc-baja");
    const b = await barrera(44);
    const Ba = new Sesion("e4-baja"), Ad = new Sesion("e4-quitar");
    Ba.enviar(`begin;\nselect 'RES|' || public.comunidad_baja_comunitaria(${q(a.uid)})::text;\n${BARRERA(44)}\ncommit;`);
    await esperar(esperaLock(Ba, "advisory"), "la baja retiene K_CUENTA");
    Ad.enviar(comoAdminSql(`select 'RES|' || public.comunidad_quitar_marcador_baja(${q(a.uid)}, '${MOTIVO}', '${randomUUID()}')::text;`) + "\ncommit;");
    await esperar(esperaLock(Ad, "advisory"), "la cancelación espera K_CUENTA");
    b.soltar();
    await Ba.terminar(); await Ad.terminar();
    assert.equal(JSON.parse(Ba.lineas("RES")[0][0]).marcador, "nuevo");
    assert.equal(JSON.parse(Ad.lineas("RES")[0][0]).resultado, "aplicada");
    assert.equal(sqlOk(`select (cancelada_en is not null)::text from comunidad.bajas_en_curso where user_id = ${q(a.uid)}`), "true");
  });

  // =========================================================================
  console.log("\n— Publicación (T4) —");
  await prueba("pausar: nadie publica ni edita; leer, borrar, denunciar y bloquear siguen; reanudar: se publica. Registrado; repetir es sin efecto", async () => {
    const { a, r } = await publicada("pausa-a");
    const x = await cuenta("pausa-x");
    const i1 = randomUUID();
    assert.equal((await mod({ accion: "publicacion", activa: false, motivo: MOTIVO, intento: i1 })).resultado, "aplicada");
    assert.deepEqual(await publicar(x, BIEN()), { resultado: "rechazo_cuenta", motivo: "publicacion_pausada" });
    assert.equal((await ops.denunciar(x.uid, r.version_id, "spam", null)).resultado, "denuncia_registrada");
    assert.equal((await ops.bloquear(x.uid, r.version_id)).resultado, "bloqueado");
    assert.equal((await ops.borrar(a.uid, r.resena_id)).resultado, "borrada");
    assert.equal((await mod({ accion: "publicacion", activa: false, motivo: MOTIVO, intento: randomUUID() })).resultado, "sin_efecto");
    assert.equal((await mod({ accion: "publicacion", activa: true, motivo: MOTIVO, intento: randomUUID() })).resultado, "aplicada");
    assert.equal((await publicar(x, BIEN())).resultado, "publicada");
    assert.equal(decisiones(i1), 1);
  });

  // =========================================================================
  console.log("\n— Lecturas del panel —");
  await prueba("cola de retenidos por prioridad (corroborada, revisión, retenida) y paginación por cursor sin repetir ni saltear", async () => {
    // Una corroborada: publicada, denunciada y retenida por la regla (como lo hace la ruta).
    const { r: cor } = await publicada("prio-cor");
    assert.equal((await ops.retenerPorRegla(cor.version_id, { resultado: "retener", version_reglas: "prueba-e4", reglas: ["spam_promocion"] })).resultado, "retenida_por_regla");
    const todos = [];
    for (let despues = null; ;) {
      const { data, error } = await sbAdmin.rpc("comunidad_admin_retenidos", { p_limite: 2, p_despues: despues });
      assert.ifError(error);
      todos.push(...data.items);
      if (!data.hay_mas) { assert.equal(todos.length, data.total); break; }
      despues = data.items.at(-1).cursor;
    }
    const ids = todos.map((x) => x.version_id);
    assert.equal(new Set(ids).size, ids.length, "sin repetidos");
    const prios = todos.map((x) => x.prioridad);
    assert.deepEqual(prios, [...prios].sort((a, b) => a - b), "ordenadas por prioridad");
    assert.equal(todos.find((x) => x.version_id === cor.version_id)?.prioridad, 0);
    assert.ok(todos.every((x) => typeof x.texto === "string" && x.autor && typeof x.autor.participante === "string"));
  });

  await prueba("cola de denuncias y registro paginados sin repetir; cuentas lista suspensiones y bajas pendientes", async () => {
    const vistos = [];
    for (let despues = null; ;) {
      const { data, error } = await sbAdmin.rpc("comunidad_admin_denuncias", { p_limite: 2, p_despues: despues });
      assert.ifError(error);
      vistos.push(...data.items.map((x) => x.version_id));
      if (!data.hay_mas) { assert.equal(vistos.length, data.total); break; }
      despues = data.items.at(-1).cursor;
    }
    assert.equal(new Set(vistos).size, vistos.length);
    const reg = [];
    for (let antes = null; ;) {
      const { data, error } = await sbAdmin.rpc("comunidad_admin_registro", { p_limite: 3, p_antes: antes });
      assert.ifError(error);
      reg.push(...data.items.map((x) => x.id));
      if (!data.hay_mas) break;
      antes = data.items.at(-1).id;
    }
    assert.equal(new Set(reg).size, reg.length);
    assert.equal(reg.length, Number(sqlOk("select count(*) from comunidad.decisiones")));
    const c = await mod({ accion: "leer", vista: "cuentas" });
    assert.ok(Array.isArray(c.suspensiones) && Array.isArray(c.bajas));
  });

  await prueba("muestreo: APAGADO devuelve nada; encendido sólo durante la prueba, como mucho 5 publicadas; vuelve a apagado", async () => {
    assert.deepEqual(await mod({ accion: "leer", vista: "muestreo" }), { activo: false, items: [] });
    config({ muestreo_activo: true });
    try {
      const m = await mod({ accion: "leer", vista: "muestreo" });
      assert.equal(m.activo, true);
      assert.ok(m.items.length >= 1 && m.items.length <= 5);
    } finally { config({ muestreo_activo: false }); }
    assert.equal(sqlOk("select muestreo_activo::text from comunidad.config"), "false");
  });

  // =========================================================================
  console.log("\n— La ruta /api/admin/moderacion (servidor local) —");
  await prueba("ruta: sin token 401; usuario común y admin AAL1 403; admin AAL2 200 con `private, no-store`; cuerpo inválido 400; decide con la sesión del admin", async () => {
    const llamar = (token, cuerpo) => fetch(`${BASE}/api/admin/moderacion`, {
      method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(cuerpo),
    });
    const leerR = { accion: "leer", vista: "resumen" };
    assert.equal((await llamar(null, leerR)).status, 401);
    assert.equal((await llamar(S.jwtComun, leerR)).status, 403);
    assert.equal((await llamar(S.jwtAal1, leerR)).status, 403);
    const ok = await llamar(S.jwtAal2, leerR);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("cache-control"), "private, no-store");
    assert.equal(typeof (await ok.json()).retenidos, "number");
    assert.equal((await llamar(S.jwtAal2, { accion: "decidir", decision: "publicar", version: 1, motivo: "x", intento: randomUUID() })).status, 400);
    // El admin que decide sale del token: un `admin_id` en el cuerpo no cambia nada.
    const { r } = await retenida("ruta");
    const intento = randomUUID();
    const res = await llamar(S.jwtAal2, { accion: "decidir", decision: "publicar", version: r.version_id, motivo: MOTIVO, intento, admin_id: S.comun.uid });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).resultado, "aplicada");
    assert.equal(sqlOk(`select admin_id::text from comunidad.decisiones where id_intento = ${q(intento)}`), S.admin.uid);
  });
} finally {
  // =========================================================================
  console.log("\n— Limpieza (base compartida): sólo lo de esta corrida —");
  await cerrarSesiones();
  if (grantPerfil) sqlOk("revoke select on public.profiles from authenticated");
  console.log(`   SELECT de profiles para authenticated (local): ${grantPerfil ? "concedido para la corrida y revocado" : "ya estaba; no se tocó"}`);
  try {
    const prev = configPrevia;
    config({ modulo_activo: prev.modulo_activo, publicacion_activa: prev.publicacion_activa, top_yumpers_activo: prev.top_yumpers_activo,
      muestreo_activo: prev.muestreo_activo ?? false, limite_resenas: prev.limite_resenas, limite_ediciones: prev.limite_ediciones,
      limite_evaluaciones: prev.limite_evaluaciones, limite_denuncias: prev.limite_denuncias, limite_bloqueos: prev.limite_bloqueos,
      admision_por_autor: prev.admision_por_autor, admision_global: prev.admision_global,
      denuncias_filas_por_version: prev.denuncias_filas_por_version, denuncias_por_hora: prev.denuncias_por_hora });
    const us = [...cuentas];
    if (us.length) {
      for (const id of sqlOk(`select id from comunidad.participantes where user_id in (${us.map(q).join(",")})`).split("\n").filter(Boolean)) participantes.add(id);
    }
    const todos = [...participantes].map(q).join(",");
    // Las decisiones de esta corrida: las del admin creado acá y las que tocan a sus participantes y cuentas.
    if (us.length) {
      sqlOk(`delete from comunidad.decisiones where admin_id in (${us.map(q).join(",")})
        ${todos ? `or participante_id in (${todos})` : ""} or cuenta_id in (${us.map(q).join(",")})`);
    }
    for (const u of us) await srv.auth.admin.deleteUser(u, false);
    if (todos) {
      sqlOk(`begin;
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
    }
    const restos = sqlOk(`select (select count(*) from auth.users where id in (${us.map(q).join(",") || "null::uuid"}))
      || '|' || (select count(*) from comunidad.participantes where id in (${todos || "null::uuid"}))
      || '|' || (select count(*) from comunidad.decisiones)
      || '|' || (select count(*) from comunidad.denuncias_cerradas)
      || '|' || (select count(*) from pg_locks where locktype = 'advisory' and classid in (7301, 7302, 7303, 7304, 7399))
      || '|' || (select (modulo_activo or publicacion_activa or top_yumpers_activo or muestreo_activo)::text from comunidad.config)`);
    console.log(`   cuentas: ${cuentas.size}; restos (cuentas|participantes|decisiones|denuncias_cerradas|locks|interruptores): ${restos}`);
  } catch (e) {
    console.error("   ⚠️ la limpieza falló:", e.message);
    process.exitCode = 1;
  }
}
cerrar();
