#!/usr/bin/env node
// E6: nombre comunitario y perfil mínimo del autor. FUNCIONES REALES contra
// `supabase start` y RUTAS REALES contra el servidor local. SÓLO LOCAL.
//
// Uso:
//   node --env-file=.env.comunidad-local scripts/comunidad/pruebas-perfiles.mjs
//   (servidor de la app con las claves locales en BASE, por defecto
//    http://localhost:3100, para las rutas)
//
// Qué es real: cuentas de Auth con sesión (contraseña), aceptar términos,
// publicar, votar, borrar y bloquear con los adaptadores de las rutas; el
// cambio de nombre con el núcleo y el adaptador de la ruta
// (lib/comunidad/nombre-nucleo.ts + escritura-deps) y por HTTP; el perfil por
// HTTP (Bearer) y por PostgREST con el JWT de cada cuenta; la eliminación de
// cuenta con el flujo de la app (correrFlujo + adaptadores reales).
// Por SQL: `display_name` y el avatar en `profiles` (el SELECT local de
// `profiles` está revocado y PostgREST no puede filtrar la fila propia).
// Retiro y suspensión: con las funciones de E4 y un admin con dos TOTP reales.
// Lo único que se toca por SQL es la configuración: el límite de reseñas del
// día sube mientras corre (A publica 9) y vuelve a su valor al terminar.
//
// Cuentas ficticias `@comunidad.test`; al final se borran ellas y lo que
// crearon. Configuración e interruptores vuelven a como estaban.
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { arnes, contenedor, leerComo, sqlOk, urlLocal } from "./local.mjs";
import { dependenciasEscritura, dependenciasNombre, operacionesComunidad, sha256 } from "../../lib/comunidad/escritura-deps.ts";
import { cambiarNombre } from "../../lib/comunidad/nombre-nucleo.ts";
import { normalizarTexto } from "../../lib/comunidad/texto.ts";
import { huella, secretoDuplicados } from "../../lib/comunidad/duplicados.ts";
import { TERMINOS_VERSION } from "../../lib/comunidad/terminos.ts";
import { alLlegarMas, conPrimeraPagina, listaVacia, pedirMas, tandaValida } from "../../lib/comunidad/lista-nucleo.ts";
import { alCargarPerfil, alLlegarMasPerfil, cabeceraValida, clavePerfil, ORDEN_PERFIL, vistaTerminal, vistaVacia } from "../../lib/comunidad/perfil-nucleo.ts";
import { eleccionAvatar, resolverAvatar } from "../../lib/avatares.ts";
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
const S = {};

async function cuenta(et, { terminos = true } = {}) {
  const email = `perf-${et}-${Date.now()}-${randomBytes(3).toString("hex")}@comunidad.test`;
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
// TOTP real para el admin (retiro y suspensión con las funciones de E4).
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
  for (const n of ["principal", "respaldo"]) {
    const { data: f } = await cli.auth.mfa.enroll({ factorType: "totp", friendlyName: n });
    const { data: ch } = await cli.auth.mfa.challenge({ factorId: f.id });
    const r = await cli.auth.mfa.verify({ factorId: f.id, challengeId: ch.id, code: totp(f.totp.secret) });
    if (r.error) throw r.error;
  }
  a.sb = createClient(URL_API, ANON, { ...opc, global: { headers: { Authorization: `Bearer ${(await cli.auth.getSession()).data.session.access_token}` } } });
  return a;
}
const MOTIVO = "Prueba local de E6 (perfiles).";
async function retirar(versionId) {
  const r = await S.admin.sb.rpc("comunidad_admin_decidir", { p_accion: "retirar", p_version: versionId, p_motivo: MOTIVO, p_id_intento: randomUUID() });
  assert.equal(r.data?.resultado, "aplicada", JSON.stringify(r.error ?? r.data));
}
async function suspender(part) {
  const r = await S.admin.sb.rpc("comunidad_admin_suspender", { p_participante: part, p_motivo: MOTIVO, p_id_intento: randomUUID() });
  assert.equal(r.data?.resultado, "aplicada", JSON.stringify(r.error ?? r.data));
}
let n = 0;
async function publicar(c, tmdbId, tipo = "movie") {
  const t = `Reseña ficticia número ${++n} para el perfil comunitario. La fotografía es preciosa y el guion se toma su tiempo sin aburrir nunca.`;
  const r = await deps.publicar({ uid: c.uid, tipo, tmdbId, texto: t, idIntento: randomUUID(), hash: sha256(t),
    decision: { resultado: "publicar", version_reglas: "prueba-e6", reglas: [], huella: huella(normalizarTexto(t), SECRETO) } });
  assert.equal(r.resultado, "publicada", JSON.stringify(r));
  return r;
}
const config = (cols) => sqlOk(`update comunidad.config set ${Object.entries(cols).map(([k, v]) => `${k} = ${v}`).join(", ")} where id`);
const configPrevia = JSON.parse(sqlOk("select row_to_json(c)::text from comunidad.config c"));
const nombreEnBase = (c) => sqlOk(`select coalesce(nombre_comunitario, '∅') from comunidad.participantes where id = ${q(c.part)}`);
const contadorNombre = (c) => sqlOk(`select coalesce(sum(cantidad), 0) from comunidad.contadores where participante_id = ${q(c.part)} and accion = 'nombre'`);
const nombrar = (c, nombre) => cambiarNombre(depsNombre, { uid: c.uid, nombre, idIntento: randomUUID() });

/** El perfil por la RUTA, con el Bearer de `c` (o sin token). */
async function rutaPerfil(c, query) {
  const r = await fetch(`${BASE}/api/comunidad/perfil?${query}`, { headers: c ? { Authorization: `Bearer ${c.jwt}` } : {} });
  return { status: r.status, cache: r.headers.get("cache-control"), j: await r.json().catch(() => null) };
}
/** El perfil por PostgREST con un token cualquiera (RPC directo). */
async function rpcPerfil(token, args) {
  const r = await fetch(`${URL_API}/rest/v1/rpc/comunidad_perfil`, {
    method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(args),
  });
  return { status: r.status, texto: await r.text() };
}
/** Todas las páginas del perfil por la ruta, con el núcleo de la lista del cliente. */
async function recorrer(c, id) {
  const clave = clavePerfil(c.uid, id);
  const p1 = await rutaPerfil(c, `id=${id}`);
  assert.equal(p1.status, 200, JSON.stringify(p1.j));
  let l = conPrimeraPagina(listaVacia(clave), tandaValida(p1.j, ORDEN_PERFIL));
  const tandas = [l.items.length];
  while (l.hayMas) {
    const m = pedirMas(l);
    const p = await rutaPerfil(c, `id=${id}&cursor=${encodeURIComponent(m.pedido.cursor)}`);
    l = alLlegarMas(m.estado, m.pedido.n, m.pedido.clave, tandaValida(p.j, ORDEN_PERFIL));
    tandas.push(l.items.length - tandas.reduce((a, b) => a + b, 0));
  }
  return { cab: cabeceraValida(p1.j), crudo: p1.j, lista: l, tandas };
}
// A2: lo que hace la pantalla con la respuesta de "Cargar más". PANTALLA=antes
// usa la transcripción literal del manejador de 8cbe0cd
// (components/comunidad/PerfilComunitario.tsx: tandaValida → alLlegarMas, sin
// mirar la cabecera) para verla fallar.
const PANTALLA = process.env.PANTALLA === "antes"
  ? (v, n, clave, r) => ({ ...v, lista: alLlegarMas(v.lista, n, clave, r?.status === 200 ? tandaValida(r.j, ORDEN_PERFIL) : null) })
  : alLlegarMasPerfil;
const PERMITIDAS = new Set(["activo", "estado", "orden", "id", "propio", "nombre", "avatar", "resenas", "utiles_recibidos", "items", "hay_mas", "cursor"]);
const ITEM = new Set(["resena_id", "version_id", "texto", "publicada_en", "editada", "utiles", "total", "mi_voto", "denunciada", "autor", "tipo", "tmdb_id"]);

config({ modulo_activo: true, publicacion_activa: true, limite_resenas: 20 });
try {
  await prueba("preparación: autor A con 9 reseñas (7 visibles: una retirada y una borrada), otros autores, lectores con sesión real y votos", async () => {
    const vivo = await fetch(`${BASE}/api/comunidad/perfil`).catch(() => null);
    if (!vivo) throw new Error(`NO CORRIDA: no hay servidor en ${BASE}`);
    S.T = 9_700_000 + Math.floor(Math.random() * 10_000) * 20;
    S.admin = await adminAal2();
    S.A = await cuenta("autorA");
    S.B = await cuenta("autorB");
    S.L = await cuenta("lector");
    S.L2 = await cuenta("lector2", { terminos: false });
    S.X = await cuenta("suspendido");
    S.Y = await cuenta("baja");
    S.Z = await cuenta("bloqueado");
    S.rA = [];
    for (let i = 0; i < 9; i++) S.rA.push(await publicar(S.A, S.T + i, i % 2 ? "tv" : "movie"));
    await retirar(S.rA[1].version_id);
    assert.equal((await ops.borrar(S.A.uid, S.rA[3].resena_id)).resultado, "borrada");
    S.rX = await publicar(S.X, S.T);
    S.rY = await publicar(S.Y, S.T);
    S.rZ = await publicar(S.Z, S.T);
    S.rB = await publicar(S.B, S.T);
    for (const i of [0, 8]) assert.equal((await ops.votar(S.L.uid, S.rA[i].version_id, true)).resultado, "voto_registrado");
    assert.equal((await ops.votar(S.B.uid, S.rA[8].version_id, false)).resultado, "voto_registrado");
  });

  console.log("\n— Nombre comunitario (núcleo y adaptador de la ruta, base real) —");
  await prueba("aceptado: se guarda NORMALIZADO en participantes; repetirlo es sin_cambios y no consume límite", async () => {
    assert.equal(nombreEnBase(S.A), "∅");
    const r = await nombrar(S.A, "  Cinéfila   de Prueba ");
    assert.deepEqual([r.resultado, r.nombre], ["nombre_cambiado", "Cinéfila de Prueba"]);
    assert.equal(nombreEnBase(S.A), "Cinéfila de Prueba");
    assert.equal(contadorNombre(S.A), "1");
    assert.equal((await nombrar(S.A, "Cinéfila de Prueba")).resultado, "sin_cambios");
    assert.equal(contadorNombre(S.A), "1");
  });

  await prueba("rechazos: contacto ofuscado → rechazo_contenido con motivo; odio → nombre_no_admitido; formato → sin tocar la base. Nada se guarda", async () => {
    const r = await nombrar(S.A, "juan arroba gmail");
    assert.equal(r.resultado, "rechazo_contenido");
    assert.match(String(r.mensaje), /correo/);
    assert.equal((await nombrar(S.A, "FueraBolitas")).resultado, "nombre_no_admitido");
    assert.equal(contadorNombre(S.A), "3", "los dos rechazos de contenido cuentan para el límite");
    for (const mal of ["x", "a".repeat(25), "Ana​Beta"]) assert.equal((await nombrar(S.A, mal)).resultado, "rechazo_formato", mal);
    assert.equal(contadorNombre(S.A), "3", "el formato no llega a la base");
    assert.equal(nombreEnBase(S.A), "Cinéfila de Prueba");
  });

  await prueba("límite del día (3): el cuarto intento es rechazo_cuenta limite_diario y no cambia nada", async () => {
    const r = await nombrar(S.A, "Otro Nombre");
    assert.deepEqual([r.resultado, r.motivo], ["rechazo_cuenta", "limite_diario"]);
    assert.equal(nombreEnBase(S.A), "Cinéfila de Prueba");
  });

  await prueba("fila A: publicación pausada, sin términos y suspensión rechazan; nada se escribe", async () => {
    config({ publicacion_activa: false });
    try {
      const r = await nombrar(S.B, "Nombre Pausado");
      assert.deepEqual([r.resultado, r.motivo], ["rechazo_cuenta", "publicacion_pausada"]);
    } finally { config({ publicacion_activa: true }); }
    const t = await nombrar(S.L2, "Sin Terminos");
    assert.deepEqual([t.resultado, t.motivo], ["rechazo_cuenta", "terminos_pendientes"]);
    assert.equal(sqlOk(`select count(*) from comunidad.participantes where user_id = ${q(S.L2.uid)}`), "0", "no crea identidad comunitaria");
    await suspender(S.X.part);
    const s = await nombrar(S.X, "Nombre Suspendido");
    assert.deepEqual([s.resultado, s.motivo], ["rechazo_cuenta", "suspendida"]);
    assert.equal(nombreEnBase(S.X), "∅");
  });

  await prueba("ningún camino salta la validación: authenticated no ejecuta la función; el esquema no se expone; la base rechaza forma y decisiones inválidas aunque llame service_role", async () => {
    const r = await fetch(`${URL_API}/rest/v1/rpc/comunidad_cambiar_nombre`, {
      method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${S.B.jwt}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_uid: S.B.uid, p_nombre: "Hackeado", p_decision: { resultado: "publicar", version_reglas: "x", reglas: [] },
        p_id_intento: randomUUID(), p_hash: "a".repeat(64) }),
    });
    assert.ok((r.status === 401 || r.status === 403) && /42501|permission denied/.test(await r.text()), String(r.status));
    for (const token of [ANON, S.B.jwt]) {
      const u = await fetch(`${URL_API}/rest/v1/participantes?id=eq.${S.B.part}`, {
        method: "PATCH", headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Content-Profile": "comunidad" },
        body: JSON.stringify({ nombre_comunitario: "Hackeado" }),
      });
      assert.ok(u.status >= 400, `PATCH directo: ${u.status}`);
    }
    // service_role (sólo servidor) con una forma inválida: el CHECK de 011 revierte todo, contador incluido.
    const antes = contadorNombre(S.B);
    const f = await srv.rpc("comunidad_cambiar_nombre", { p_uid: S.B.uid, p_nombre: "Ana​Beta", p_decision: { resultado: "publicar", version_reglas: "x", reglas: [] },
      p_id_intento: randomUUID(), p_hash: "a".repeat(64) });
    assert.equal(f.error?.code, "23514", JSON.stringify(f.error));
    const d = await srv.rpc("comunidad_cambiar_nombre", { p_uid: S.B.uid, p_nombre: "Ana Beta", p_decision: { resultado: "aprobar", version_reglas: "x", reglas: [] },
      p_id_intento: randomUUID(), p_hash: "a".repeat(64) });
    assert.equal(d.error?.code, "22023");
    assert.equal(contadorNombre(S.B), antes);
    assert.equal(nombreEnBase(S.B), "∅");
  });

  await prueba("profiles.display_name por update DIRECTO en la base NO cambia el nombre comunitario ni aparece en lo comunitario", async () => {
    // Por SQL y no por PostgREST con la sesión: en esta base local el SELECT de
    // `profiles` está revocado (estado de base que se conserva) y un PATCH con
    // filtro por id no afecta filas. El update directo es el caso más fuerte.
    sqlOk(`update public.profiles set display_name = 'Nombre Privado Secreto' where id = ${q(S.A.uid)}`);
    assert.equal(sqlOk(`select display_name from public.profiles where id = ${q(S.A.uid)}`), "Nombre Privado Secreto");
    assert.equal(nombreEnBase(S.A), "Cinéfila de Prueba");
    const p = await rutaPerfil(S.L, `id=${S.A.part}`);
    assert.equal(p.j.nombre, "Cinéfila de Prueba");
    assert.doesNotMatch(JSON.stringify(p.j), /Nombre Privado Secreto/);
    const f = leerComo(S.L.uid, "movie", S.T, { limite: 20 });
    assert.doesNotMatch(JSON.stringify(f), /Nombre Privado Secreto/);
  });

  await prueba("por la RUTA: sin sesión 401; con sesión, el contacto se rechaza con motivo y uno válido se acepta (B)", async () => {
    const sin = await fetch(`${BASE}/api/comunidad/nombre`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre: "Ana", id_intento: randomUUID() }) });
    assert.equal(sin.status, 401);
    const post = (nombre) => fetch(`${BASE}/api/comunidad/nombre`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${S.B.jwt}` }, body: JSON.stringify({ nombre, id_intento: randomUUID() }),
    }).then(async (r) => ({ status: r.status, j: await r.json() }));
    const sinIntento = await fetch(`${BASE}/api/comunidad/nombre`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${S.B.jwt}` }, body: JSON.stringify({ nombre: "Ana" }),
    });
    assert.equal(sinIntento.status, 400, "sin id_intento no se acepta");
    const c = await post("wsp 11 5555 4444");
    assert.deepEqual([c.status, c.j.resultado], [200, "rechazo_contenido"]);
    assert.match(c.j.mensaje, /número/);
    // Un `uid` en el cuerpo se ignora: el actor sale del token.
    const o = await fetch(`${BASE}/api/comunidad/nombre`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${S.B.jwt}` },
      body: JSON.stringify({ nombre: "Lector Verde", id_intento: randomUUID(), uid: S.A.uid, p_uid: S.A.uid }),
    }).then(async (r) => ({ status: r.status, j: await r.json() }));
    assert.deepEqual([o.status, o.j.resultado, o.j.nombre], [200, "nombre_cambiado", "Lector Verde"]);
    assert.deepEqual([nombreEnBase(S.B), nombreEnBase(S.A)], ["Lector Verde", "Cinéfila de Prueba"]);
    const inv = await post(42);
    assert.equal(inv.status, 400);
  });

  console.log("\n— Perfil comunitario —");
  await prueba("acceso: sin sesión, anon y service_role no leen (ruta 401 sólo con {resultado}; RPC 401/403 42501); id inválido 400; inexistente no_existe", async () => {
    const sin = await rutaPerfil(null, `id=${S.A.part}`);
    assert.deepEqual([sin.status, sin.j], [401, { resultado: "sin_sesion" }]);
    for (const token of [ANON, SRV]) {
      const r = await rpcPerfil(token, { p_participante: S.A.part, p_cursor: null, p_limite: 5 });
      assert.ok((r.status === 401 || r.status === 403) && /42501|permission denied/.test(r.texto), `${r.status} ${r.texto.slice(0, 80)}`);
    }
    assert.equal((await rutaPerfil(S.L, "id=123")).status, 400);
    assert.equal((await rutaPerfil(S.L, `id=${S.A.part}&yo=1`)).status, 400);
    const ne = await rutaPerfil(S.L, `id=${randomUUID()}`);
    assert.deepEqual([ne.status, ne.j.estado], [200, "no_existe"]);
    const ok = await rutaPerfil(S.L, `id=${S.A.part}`);
    assert.match(ok.cache ?? "", /private, no-store/);
  });

  await prueba("proyección: sólo los campos permitidos; avatar ELEGIDO (escrito como lo guarda la app) sale como id del catálogo; ni correo, ni user_id, ni display_name, ni semilla", async () => {
    // Lo que escribe la app al elegir (`eleccionAvatar`), por SQL por el mismo motivo que arriba.
    const e = eleccionAvatar("coco");
    sqlOk(`update public.profiles set avatar_seed = '${e.avatar_seed}', avatar_style = '${e.avatar_style}' where id = ${q(S.A.uid)}`);
    const p = await rutaPerfil(S.L, `id=${S.A.part}`);
    assert.deepEqual(Object.keys(p.j).filter((k) => !PERMITIDAS.has(k)), []);
    for (const it of p.j.items) assert.deepEqual(Object.keys(it).filter((k) => !ITEM.has(k)), []);
    assert.deepEqual([p.j.estado, p.j.nombre, p.j.avatar, p.j.propio], ["activo", "Cinéfila de Prueba", "coco", false]);
    const texto = JSON.stringify(p.j);
    for (const prohibido of [S.A.email, S.A.uid, "Nombre Privado Secreto", e.avatar_style]) assert.ok(!texto.includes(prohibido), prohibido);
    // B tiene la semilla heredada (uuid del trigger): sale MAPEADA, nunca la semilla.
    const semillaB = sqlOk(`select avatar_seed from public.profiles where id = ${q(S.B.uid)}`);
    assert.match(semillaB, UUID);
    const pb = await rutaPerfil(S.L, `id=${S.B.part}`);
    assert.equal(pb.j.avatar, resolverAvatar({ avatar_seed: semillaB }).id);
    assert.ok(!JSON.stringify(pb.j).includes(semillaB));
  });

  await prueba("paginación: 5 + 2 por la ruta con el núcleo del cliente, sin repetir ni saltear; retirada y borrada no aparecen; agregados = visibles", async () => {
    const r = await recorrer(S.L, S.A.part);
    const visibles = S.rA.filter((_, i) => i !== 1 && i !== 3).map((x) => x.resena_id).sort((a, b) => b - a);
    assert.deepEqual(r.tandas, [5, 2]);
    assert.deepEqual(r.lista.items.map((x) => x.resena_id), visibles, "orden: primera publicación desc");
    assert.equal(new Set(r.lista.items.map((x) => x.resena_id)).size, 7);
    assert.deepEqual([r.cab.resenas, r.cab.utilesRecibidos], [7, 2]);
    assert.deepEqual(r.lista.items.find((x) => x.resena_id === S.rA[8].resena_id)?.titulo, { tipo: "movie", tmdbId: S.T + 8 });
    assert.ok(r.lista.items.every((x) => x.autor?.id === S.A.part && x.autor?.nombre === "Cinéfila de Prueba"));
    const votada = r.lista.items.find((x) => x.resena_id === S.rA[0].resena_id);
    assert.deepEqual([votada.mi_voto, votada.utiles, votada.total], ["util", 1, 1]);
  });

  await prueba("cambios ENTRE páginas (retiro por E4 y borrado real): lo oculto no reaparece; nada se repite", async () => {
    const clave = clavePerfil(S.L.uid, S.A.part);
    const p1 = await rutaPerfil(S.L, `id=${S.A.part}`);
    let l = conPrimeraPagina(listaVacia(clave), tandaValida(p1.j, ORDEN_PERFIL));
    // Las dos de la página 2 (las más viejas visibles): 2 y 0.
    await retirar(S.rA[2].version_id);
    assert.equal((await ops.borrar(S.A.uid, S.rA[0].resena_id)).resultado, "borrada");
    const m = pedirMas(l);
    const p2 = await rutaPerfil(S.L, `id=${S.A.part}&cursor=${encodeURIComponent(m.pedido.cursor)}`);
    l = alLlegarMas(m.estado, m.pedido.n, m.pedido.clave, tandaValida(p2.j, ORDEN_PERFIL));
    assert.deepEqual([l.items.length, l.hayMas], [5, false]);
    assert.ok(!l.items.some((x) => [S.rA[0].resena_id, S.rA[2].resena_id].includes(x.resena_id)));
    assert.equal((await rutaPerfil(S.L, `id=${S.A.part}`)).j.resenas, 5);
  });

  await prueba("cambio de cuenta y respuestas tardías: la tanda de OTRA cuenta (otro bloqueo, otro voto) no se aplica a esta lista", async () => {
    const claveL = clavePerfil(S.L.uid, S.A.part);
    const pL = await rutaPerfil(S.L, `id=${S.A.part}`);
    const l = conPrimeraPagina(listaVacia(claveL), tandaValida(pL.j, ORDEN_PERFIL));
    // L2 sin participante también ve el perfil (leer no exige términos), pero sin sus votos.
    const pL2 = await rutaPerfil(S.L2, `id=${S.A.part}`);
    assert.deepEqual([pL2.status, pL2.j.estado, pL2.j.propio], [200, "activo", false]);
    const tardia = tandaValida(pL2.j, ORDEN_PERFIL);
    const m = pedirMas({ ...l, hayMas: true, cursor: l.cursor ?? "x" });
    assert.equal(alLlegarMas(m.estado, m.pedido.n, clavePerfil(S.L2.uid, S.A.part), tardia), m.estado, "otra cuenta: descartada");
    assert.equal(alLlegarMas(m.estado, m.pedido.n, clavePerfil(S.L.uid, S.B.part), tardia), m.estado, "otro perfil: descartada");
  });

  await prueba("propio: ?yo=1 devuelve el perfil propio (propio, con sus reseñas); sin identidad comunitaria, sin_participante", async () => {
    const yo = await rutaPerfil(S.A, "yo=1");
    assert.deepEqual([yo.j.estado, yo.j.id, yo.j.propio, yo.j.resenas], ["activo", S.A.part, true, 5]);
    const sinp = await rutaPerfil(S.L2, "yo=1");
    assert.deepEqual(sinp.j, { activo: true, estado: "sin_participante" });
  });

  await prueba("bloqueo: quien bloqueó ve «Usuario bloqueado» sin nombre, avatar ni reseñas; otro lector lo ve normal; desbloquear lo devuelve", async () => {
    assert.equal((await nombrar(S.Z, "Autor Bloqueable")).resultado, "nombre_cambiado");
    const b = await ops.bloquear(S.L.uid, S.rZ.version_id);
    assert.equal(b.resultado, "bloqueado", JSON.stringify(b));
    const p = await rutaPerfil(S.L, `id=${S.Z.part}`);
    assert.deepEqual(p.j, { activo: true, estado: "bloqueado", id: S.Z.part });
    const otro = await rutaPerfil(S.B, `id=${S.Z.part}`);
    assert.deepEqual([otro.j.estado, otro.j.nombre, otro.j.items.length], ["activo", "Autor Bloqueable", 1]);
    const lista = await ops.bloqueados(S.L.uid);
    for (const x of lista.bloqueados) assert.equal((await ops.desbloquear(S.L.uid, x.bloqueo_id)).resultado, "desbloqueado");
    assert.equal((await rutaPerfil(S.L, `id=${S.Z.part}`)).j.estado, "activo");
  });

  await prueba("suspensión: los demás ven el perfil sin reseñas y con agregados en 0 (no se informa la suspensión); el suspendido ve las suyas", async () => {
    const p = await rutaPerfil(S.L, `id=${S.X.part}`);
    assert.deepEqual([p.j.estado, p.j.resenas, p.j.utiles_recibidos, p.j.items.length], ["activo", 0, 0, 0]);
    assert.doesNotMatch(JSON.stringify(p.j), /suspend/);
    const yo = await rutaPerfil(S.X, "yo=1");
    assert.deepEqual([yo.j.propio, yo.j.items.length], [true, 1]);
  });

  await prueba("cuenta eliminada (flujo real de la app): el perfil queda «Cuenta eliminada», sin nombre, avatar ni reseñas", async () => {
    assert.equal((await nombrar(S.Y, "Se Va Pronto")).resultado, "nombre_cambiado");
    assert.equal((await rutaPerfil(S.L, `id=${S.Y.part}`)).j.nombre, "Se Va Pronto");
    const admin = createClient(URL_API, SRV, opc);
    const r = await correrFlujo(dependenciasReales({ admin, url: URL_API, anon: ANON }), { userId: S.Y.uid, email: S.Y.email, password: S.Y.password });
    assert.deepEqual(r, { ok: true });
    cuentas.delete(S.Y.uid);
    const p = await rutaPerfil(S.L, `id=${S.Y.part}`);
    assert.deepEqual(p.j, { activo: true, estado: "eliminada", id: S.Y.part });
    assert.equal(sqlOk(`select coalesce(nombre_comunitario, '∅') || '|' || coalesce(user_id::text, '∅') from comunidad.participantes where id = ${q(S.Y.part)}`), "∅|∅");
  });

  await prueba("la ficha (lectura de E5a/E5b, ruta real) trae el autor: id de participante y nombre comunitario; nada más del autor", async () => {
    const r = await fetch(`${BASE}/api/comunidad/resenas/lista?tipo=movie&id=${S.T}&orden=recientes`, { headers: { Authorization: `Bearer ${S.L.jwt}` } });
    const j = await r.json();
    assert.equal(r.status, 200);
    const porAutor = Object.fromEntries(j.items.map((x) => [x.autor.id, x.autor]));
    assert.deepEqual(porAutor[S.B.part], { id: S.B.part, nombre: "Lector Verde" });
    assert.deepEqual(porAutor[S.Z.part], { id: S.Z.part, nombre: "Autor Bloqueable" });
    for (const x of j.items) assert.deepEqual(Object.keys(x.autor).sort(), ["id", "nombre"]);
    assert.ok(!j.items.some((x) => x.autor.id === S.Y.part), "la reseña de la cuenta eliminada no se ve");
  });

  console.log("\n— A2: cambios de disponibilidad al «Cargar más» (respuestas reales de la ruta, reductor de la pantalla) —");
  /** La primera página como la aplica la pantalla. */
  async function primera(c, id) {
    const v = alCargarPerfil(vistaVacia(clavePerfil(c.uid, id)), await rutaPerfil(c, `id=${id}`));
    assert.ok(v && v.cab?.estado === "activo" && v.lista.items.length === 5 && v.lista.hayMas, "primera página activa de 5 con más");
    return v;
  }
  /** "Cargar más": el pedido sale y su respuesta se aplica con la función de la pantalla. */
  async function mas(c, id, v, { antesDeResponder = null, perderRed = false } = {}) {
    const p = pedirMas(v.lista);
    const enCurso = { ...v, lista: p.estado };
    if (antesDeResponder) await antesDeResponder();
    const r = perderRed ? null : await rutaPerfil(c, `id=${id}&cursor=${encodeURIComponent(p.pedido.cursor)}`);
    return { v: PANTALLA(enCurso, p.pedido.n, p.pedido.clave, r), p, r, enCurso };
  }
  const sinIdentidad = (v) => [v.cab?.nombre ?? null, v.cab?.avatar ?? null, v.lista.items.length, v.lista.errorMas];

  await prueba("A2 · preparación: dos autores con 6 reseñas visibles cada uno (dos páginas)", async () => {
    S.D = await cuenta("autorD");
    S.E = await cuenta("autorE");
    assert.equal((await nombrar(S.D, "Autora Disponible")).resultado, "nombre_cambiado");
    assert.equal((await nombrar(S.E, "Autor Que Se Va")).resultado, "nombre_cambiado");
    S.rD = [];
    for (let i = 0; i < 6; i++) S.rD.push(await publicar(S.D, S.T + 100 + i));
    for (let i = 0; i < 6; i++) await publicar(S.E, S.T + 200 + i);
  });

  await prueba("A2 · bloqueo desde OTRA sesión entre páginas: «Cargar más» aplica «Usuario bloqueado» sin nombre, avatar ni reseñas; no es un error de red", async () => {
    const v = await primera(S.L, S.D.part);
    const { v: d, r } = await mas(S.L, S.D.part, v, { antesDeResponder: async () => assert.equal((await ops.bloquear(S.L.uid, S.rD[0].version_id)).resultado, "bloqueado") });
    assert.deepEqual(r.j, { activo: true, estado: "bloqueado", id: S.D.part }, "la base ya informa el bloqueo");
    assert.equal(d.cab?.estado, "bloqueado");
    assert.deepEqual(sinIdentidad(d), [null, null, 0, false]);
    assert.ok(vistaTerminal(d));
  });

  await prueba("A2 · respuesta tardía: una página activa pedida ANTES del bloqueo no restaura nada después de que se aplicó el bloqueo", async () => {
    for (const x of (await ops.bloqueados(S.L.uid)).bloqueados) assert.equal((await ops.desbloquear(S.L.uid, x.bloqueo_id)).resultado, "desbloqueado");
    const v = await primera(S.L, S.D.part);
    const p = pedirMas(v.lista);
    const enCurso = { ...v, lista: p.estado };
    const tardia = await rutaPerfil(S.L, `id=${S.D.part}&cursor=${encodeURIComponent(p.pedido.cursor)}`);
    assert.equal(tardia.j.estado, "activo", "la respuesta tardía trae la reseña restante");
    assert.equal((await ops.bloquear(S.L.uid, S.rD[0].version_id)).resultado, "bloqueado");
    // La pantalla recarga (p. ej. tras bloquear desde el menú) y aplica el bloqueo.
    const bloqueada = alCargarPerfil(enCurso, await rutaPerfil(S.L, `id=${S.D.part}`));
    assert.equal(bloqueada.cab?.estado, "bloqueado");
    const despues = PANTALLA(bloqueada, p.pedido.n, p.pedido.clave, tardia);
    assert.equal(despues.cab?.estado, "bloqueado");
    assert.deepEqual(sinIdentidad(despues), [null, null, 0, false], "la respuesta superada no restaura reseñas");
    for (const x of (await ops.bloqueados(S.L.uid)).bloqueados) assert.equal((await ops.desbloquear(S.L.uid, x.bloqueo_id)).resultado, "desbloqueado");
  });

  await prueba("A2 · baja del autor entre páginas (flujo real de la app): «Cargar más» aplica «Cuenta eliminada» y retira lo anterior", async () => {
    const v = await primera(S.L, S.E.part);
    const { v: d, r } = await mas(S.L, S.E.part, v, {
      antesDeResponder: async () => {
        const res = await correrFlujo(dependenciasReales({ admin: createClient(URL_API, SRV, opc), url: URL_API, anon: ANON }), { userId: S.E.uid, email: S.E.email, password: S.E.password });
        assert.deepEqual(res, { ok: true });
        cuentas.delete(S.E.uid);
      },
    });
    assert.deepEqual(r.j, { activo: true, estado: "eliminada", id: S.E.part });
    assert.equal(d.cab?.estado, "eliminada");
    assert.deepEqual(sinIdentidad(d), [null, null, 0, false]);
  });

  await prueba("A2 · módulo apagado entre páginas: «Cargar más» aplica «no disponible» y retira todo", async () => {
    const v = await primera(S.L, S.D.part);
    let d;
    try {
      ({ v: d } = await mas(S.L, S.D.part, v, { antesDeResponder: async () => config({ modulo_activo: false }) }));
    } finally { config({ modulo_activo: true }); }
    assert.equal(d.apagado, true);
    assert.deepEqual(sinIdentidad(d), [null, null, 0, false]);
  });

  await prueba("A2 · falla REAL de red: se conservan cabecera y páginas; el reintento desde el mismo cursor completa sin repetir", async () => {
    const v = await primera(S.L, S.D.part);
    const { v: d } = await mas(S.L, S.D.part, v, { perderRed: true });
    assert.deepEqual([d.cab?.nombre, d.cab?.estado, d.lista.items.length, d.lista.errorMas], ["Autora Disponible", "activo", 5, true]);
    assert.equal(d.cab?.avatar, v.cab?.avatar, "la cabecera queda como estaba");
    assert.equal(vistaTerminal(d), false);
    const { v: e } = await mas(S.L, S.D.part, { ...d, lista: { ...d.lista, errorMas: false } });
    assert.deepEqual([e.lista.items.length, new Set(e.lista.items.map((x) => x.resena_id)).size, e.lista.hayMas, e.lista.errorMas], [6, 6, false, false]);
  });

  await prueba("módulo apagado: el perfil y el nombre responden sin datos", async () => {
    config({ modulo_activo: false });
    try {
      assert.deepEqual((await rutaPerfil(S.L, `id=${S.A.part}`)).j, { activo: false });
      const r = await nombrar(S.B, "Apagado Nombre");
      assert.deepEqual([r.resultado, r.motivo], ["rechazo_cuenta", "modulo_apagado"]);
    } finally { config({ modulo_activo: true }); }
  });
} finally {
  console.log("\n— Limpieza (base compartida): sólo lo de esta corrida —");
  try {
    const prev = configPrevia;
    config({ modulo_activo: prev.modulo_activo, publicacion_activa: prev.publicacion_activa, top_yumpers_activo: prev.top_yumpers_activo,
      muestreo_activo: prev.muestreo_activo ?? false, limite_resenas: prev.limite_resenas });
    const us = [...cuentas];
    const todos = [...participantes].map(q).join(",");
    // Las decisiones del admin de esta corrida (retiros, suspensión) y las que nombran a sus participantes.
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
    const lista = [...new Set([...cuentas, S.Y?.uid].filter(Boolean))].map(q).join(",");
    console.log(`   cuentas: ${cuentas.size + (S.Y ? 1 : 0)}; restos (cuentas|participantes|bajas|locks|decisiones|limite_resenas|interruptores): ${sqlOk(`select
      (select count(*) from auth.users where id in (${lista || "null"})) || '|' ||
      (select count(*) from comunidad.participantes where id in (${todos || "null"})) || '|' ||
      (select count(*) from comunidad.bajas_en_curso where user_id in (${lista || "null"})) || '|' ||
      (select count(*) from pg_locks where locktype = 'advisory') || '|' ||
      (select count(*) from comunidad.decisiones where admin_id in (${lista || "null"})) || '|' ||
      (select limite_resenas from comunidad.config) || '|' ||
      (select (modulo_activo or publicacion_activa or top_yumpers_activo or muestreo_activo)::text from comunidad.config)`)}`);
  } catch (e) {
    console.error("   ⚠️ la limpieza falló:", e.message);
    process.exitCode = 1;
  }
  cerrar();
}
