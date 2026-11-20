#!/usr/bin/env node
// Batería de «¿Sabías que…?» contra Supabase LOCAL (`supabase start`), con las
// reglas REALES de la migración 025 (RLS, CHECK, trigger, `curiosidad_publicada`)
// y las rutas REALES de la app local (`/api/admin/curiosidades` con
// `adminDeToken`, y `/api/curiosidad/<tipo>/<id>`). SÓLO LOCAL: no conoce
// Producción.
//
// Uso (base armada con `node scripts/sala/db-local.mjs`, o con 025 aplicada, y
// la app corriendo contra esa base en APP_LOCAL, por defecto http://127.0.0.1:3140):
//   node --env-file=<archivo con las claves locales> scripts/sabias-que/pruebas-local.mjs
//
// FIXTURES: cuentas `sabias-que-*@banco.test` y títulos con ids 99xxxx
// inventados, textos marcados «[PRUEBA]». Exige que no haya filas con esos ids
// al empezar y las borra al terminar (como postgres: la app no borra). Borra las
// cuentas creadas. No toca otras filas de `curiosidades`.
//
// Entorno local (no son defectos): `supabase start` no concede SELECT de
// `public.profiles` a `authenticated` (adminDeToken lo lee). Se concede sólo
// mientras corre y se revoca al final, como en la batería del Top.
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { arnes, contenedor, psql, sqlOk, urlLocal } from "../comunidad/local.mjs";
import { urlFuenteValida } from "../../lib/curiosidades-nucleo.ts";
import { URLS } from "../../lib/curiosidades-urls-prueba.ts";

const URL_API = urlLocal(process.env.NEXT_PUBLIC_SUPABASE_URL);
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SRV = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = process.env.APP_LOCAL ?? "http://127.0.0.1:3140";
if (!ANON || !SRV) { console.error("Faltan las claves locales"); process.exit(2); }
if (!["127.0.0.1", "localhost"].includes(new URL(APP).hostname)) { console.error(`La app no es local: ${APP}`); process.exit(2); }
console.log(`base: ${contenedor()} · API ${URL_API} · app ${APP}\n`);

const opc = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const srv = createClient(URL_API, SRV, opc);
const { prueba, cerrar } = arnes();
const RANGO = "tmdb_id between 990000 and 999999";

// --- TOTP (RFC 6238) -----------------------------------------------------------
function base32(s) {
  const a = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of s.replace(/=+$/, "").toUpperCase()) bits += a.indexOf(c).toString(2).padStart(5, "0");
  const out = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}
function totp(secreto) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", base32(secreto)).update(b).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

// --- Cuentas -------------------------------------------------------------------
const cuentas = [];
async function cuenta(et, { admin = false, factores = 0 } = {}) {
  const email = `sabias-que-${et}-${Date.now()}-${randomBytes(3).toString("hex")}@banco.test`;
  const password = `Pa-${randomBytes(15).toString("base64url")}`;
  const { data, error } = await srv.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const uid = data.user.id;
  cuentas.push(uid);
  if (admin) sqlOk(`update public.profiles set is_admin = true where id = '${uid}'`);
  const cli = createClient(URL_API, ANON, opc);
  const s = await cli.auth.signInWithPassword({ email, password });
  if (s.error) throw s.error;
  const c = { uid, aal1: s.data.session.access_token, aal2: null };
  for (let i = 0; i < factores; i++) {
    const en = await cli.auth.mfa.enroll({ factorType: "totp", friendlyName: `f${i}-${randomBytes(2).toString("hex")}` });
    if (en.error) throw en.error;
    const ch = await cli.auth.mfa.challenge({ factorId: en.data.id });
    if (ch.error) throw ch.error;
    const v = await cli.auth.mfa.verify({ factorId: en.data.id, challengeId: ch.data.id, code: totp(en.data.totp.secret) });
    if (v.error) throw v.error;
  }
  if (factores) c.aal2 = (await cli.auth.getSession()).data.session.access_token;
  return c;
}
const directo = (tok) => createClient(URL_API, ANON, { ...opc, global: { headers: { Authorization: `Bearer ${tok}` } } });
const anon = createClient(URL_API, ANON, opc);

// --- Rutas reales ----------------------------------------------------------------
async function admin(tok, body, query = "") {
  const r = await fetch(`${APP}/api/admin/curiosidades${query}`, {
    method: body ? "POST" : "GET",
    headers: { ...(tok ? { Authorization: `Bearer ${tok}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let j = {};
  try { j = await r.json(); } catch { /* sin cuerpo */ }
  return { status: r.status, j };
}
async function publica(tipo, id, headers = {}) {
  const r = await fetch(`${APP}/api/curiosidad/${tipo}/${id}`, { headers });
  let j = {};
  try { j = await r.json(); } catch { /* sin cuerpo */ }
  return { status: r.status, j, h: r.headers };
}

const CAMPOS = (n, extra = {}) => ({
  texto: `[PRUEBA] Curiosidad ficticia ${n}.`, fuenteNombre: "Fuente de prueba",
  fuenteUrl: `https://es.wikipedia.org/wiki/Prueba_${n}`, spoiler: false, ...extra,
});
const ALTA = (tipo, id, extra = {}) => ({
  accion: "crear", tipo, tmdbId: id, titulo: `[PRUEBA] Título ${tipo} ${id}`, anio: 1999,
  poster: null, campos: { texto: "", fuenteNombre: "", fuenteUrl: "", spoiler: false }, publicar: false, ...extra,
});
const fila = (id) => sqlOk(`select estado || '|' || coalesce(pub_texto,'∅') || '|' || texto from curiosidades where tipo='movie' and tmdb_id=${id}`);

// =============================================================================
const previas = sqlOk(`select count(*) from curiosidades where ${RANGO}`);
if (previas !== "0") { console.error(`Hay ${previas} curiosidades con ids de prueba (99xxxx): no se corre para no pisarlas.`); process.exit(2); }
const profilesConcedido = sqlOk("select has_table_privilege('authenticated', 'public.profiles', 'select')") === "t";
if (!profilesConcedido) sqlOk("grant select on public.profiles to authenticated");

let adm2, adm1, usr, ID;
try {
  adm2 = await cuenta("admin2f", { admin: true, factores: 2 });
  adm1 = await cuenta("admin1f", { admin: true, factores: 1 });
  usr = await cuenta("usuario");

  console.log("— Permisos y segundo factor");
  await prueba("panel sin token: 401", async () => assert.equal((await admin(null)).status, 401));
  await prueba("usuario común: 403 (GET y POST)", async () => {
    assert.equal((await admin(usr.aal1)).status, 403);
    assert.equal((await admin(usr.aal1, ALTA("movie", 990001))).status, 403);
  });
  await prueba("admin con dos factores pero sesión aal1: 403", async () => {
    const r = await admin(adm2.aal1, ALTA("movie", 990001));
    assert.equal(r.status, 403); assert.match(r.j.error, /segundo factor/);
  });
  await prueba("admin con UN solo factor: 403 por falta del respaldo", async () => {
    const r = await admin(adm1.aal2, ALTA("movie", 990001));
    assert.equal(r.status, 403); assert.match(r.j.error, /respaldo/);
  });
  await prueba("PostgREST directo sin MFA completo: RLS rechaza crear, leer y editar", async () => {
    sqlOk("insert into curiosidades (tipo, tmdb_id, titulo, texto) values ('movie', 990099, '[PRUEBA] fila ajena', '[PRUEBA] borrador ajeno')");
    for (const tok of [usr.aal1, adm2.aal1, adm1.aal2]) {
      const c = directo(tok);
      const ins = await c.from("curiosidades").insert({ tipo: "movie", tmdb_id: 990098, titulo: "x" });
      assert.ok(ins.error, "el insert directo tenía que fallar");
      const sel = await c.from("curiosidades").select("id").eq("tmdb_id", 990099);
      assert.deepEqual(sel.data ?? [], [], "un borrador no se ve sin admin+MFA");
      await c.from("curiosidades").update({ texto: "pisado" }).eq("tmdb_id", 990099);
    }
    assert.equal(sqlOk("select texto from curiosidades where tmdb_id = 990099"), "[PRUEBA] borrador ajeno", "nadie lo editó");
    assert.equal(sqlOk("select count(*) from curiosidades where tmdb_id = 990098"), "0");
  });
  await prueba("anon: la tabla está cerrada (permission denied) y la función no muestra borradores", async () => {
    const sel = await anon.from("curiosidades").select("texto").limit(1);
    assert.ok(sel.error, "anon no puede leer la tabla");
    assert.match(sel.error.message, /permission denied/);
    const rpc = await anon.rpc("curiosidad_publicada", { p_tipo: "movie", p_tmdb_id: 990099 });
    assert.equal(rpc.error, null); assert.deepEqual(rpc.data, []);
  });
  await prueba("authenticated no puede borrar (sin DELETE), ni siquiera el admin con MFA", async () => {
    const del = await directo(adm2.aal2).from("curiosidades").delete().eq("tmdb_id", 990099);
    assert.ok(del.error, "delete tenía que fallar");
    assert.equal(sqlOk("select count(*) from curiosidades where tmdb_id = 990099"), "1");
  });

  console.log("\n— Crear, guardar, recargar, editar");
  await prueba("crear un borrador INCOMPLETO (sin texto ni fuente): 200, estado borrador", async () => {
    const r = await admin(adm2.aal2, ALTA("movie", 990001));
    assert.equal(r.status, 200, JSON.stringify(r.j));
    assert.equal(r.j.curiosidad.estado, "borrador");
    assert.equal(r.j.curiosidad.publicadaVersion, null);
    ID = r.j.curiosidad.id;
  });
  await prueba("recargar: GET por título devuelve lo guardado; un título sin curiosidad devuelve null", async () => {
    const r = await admin(adm2.aal2, null, "?tipo=movie&id=990001");
    assert.equal(r.status, 200); assert.equal(r.j.curiosidad.id, ID);
    assert.equal((await admin(adm2.aal2, null, "?tipo=movie&id=990002")).j.curiosidad, null);
  });
  await prueba("curiosidad sólo en borrador: la ficha pública no la ve", async () => {
    const r = await publica("movie", 990001);
    assert.equal(r.status, 200); assert.deepEqual(r.j.curiosidades, []);
  });
  await prueba("editar el borrador: guarda texto y fuente normalizados (texto plano)", async () => {
    const r = await admin(adm2.aal2, { accion: "guardar", id: ID, publicar: false,
      campos: { texto: "  [PRUEBA] Uno\r\n\n\n\ndos\u0007  ", fuenteNombre: " Fuente\nde prueba ", fuenteUrl: " https://es.wikipedia.org/wiki/P ", spoiler: false } });
    assert.equal(r.status, 200);
    assert.equal(r.j.curiosidad.borrador.texto, "[PRUEBA] Uno\n\ndos");
    assert.equal(r.j.curiosidad.borrador.fuenteNombre, "Fuente de prueba");
    assert.equal(fila(990001), "borrador|∅|[PRUEBA] Uno\n\ndos");
  });

  console.log("\n— Validación al publicar (API y base)");
  await prueba("publicar incompleto (sin texto): 400 con el campo, sin tocar la base", async () => {
    const antes = fila(990001);
    const r = await admin(adm2.aal2, { accion: "guardar", id: ID, publicar: true, campos: CAMPOS(1, { texto: "" }) });
    assert.equal(r.status, 400); assert.ok(r.j.errores.texto); assert.equal(r.j.errores.fuenteUrl, undefined);
    assert.equal(fila(990001), antes);
  });
  await prueba("publicar con URL insegura (javascript:, data:, credenciales): 400, con o sin nombre", async () => {
    for (const u of ["javascript:alert(1)", "data:text/html,x", "https://u:p@example.com/"]) {
      for (const fuenteNombre of ["Fuente de prueba", ""]) {
        const r = await admin(adm2.aal2, { accion: "guardar", id: ID, publicar: true, campos: CAMPOS(1, { fuenteUrl: u, fuenteNombre }) });
        assert.equal(r.status, 400, u); assert.ok(r.j.errores.fuenteUrl, u);
      }
    }
    assert.match(fila(990001), /^borrador\|∅\|/);
  });
  await prueba("la BASE también rechaza publicar una URL insegura aunque se saltee la API (admin+MFA directo)", async () => {
    const r = await directo(adm2.aal2).from("curiosidades").update({
      pub_texto: "x", pub_fuente_nombre: "F", pub_fuente_url: "javascript:alert(1)", pub_spoiler: false, publicada: true,
    }).eq("id", ID);
    assert.ok(r.error, "el CHECK tenía que rechazarlo"); assert.match(r.error.message, /curiosidades_publicacion_valida/);
    assert.match(fila(990001), /^borrador\|∅\|/);
  });
  await prueba("misma lista de URLs: la regla de la app y el CHECK de la base dan el mismo veredicto", async () => {
    const valores = URLS.map(([u]) => `('${u.replace(/'/g, "''")}')`).join(",");
    const out = sqlOk(`begin;
insert into curiosidades (tipo, tmdb_id, titulo) values ('movie', 990090, '[PRUEBA] urls');
create temp table r (u text, ok boolean);
do $$ declare x text; begin
  for x in select u from (values ${valores}) v(u) loop
    begin
      update curiosidades set pub_texto='t', pub_fuente_nombre='F', pub_fuente_url=x, pub_spoiler=false, publicada=true where tmdb_id=990090;
      insert into r values (x, true);
    exception when check_violation then insert into r values (x, false); end;
  end loop; end $$;
do $$ begin
  update curiosidades set pub_texto='t', pub_fuente_nombre='', pub_fuente_url='', pub_spoiler=false, publicada=true where tmdb_id=990090;
  insert into r values ('<vacía>', true);
exception when check_violation then insert into r values ('<vacía>', false); end $$;
select string_agg(u || '=>' || ok, E'\\n') from r;
rollback;`);
    const base = new Map(out.split("\n").filter((l) => l.includes("=>")).map((l) => { const i = l.lastIndexOf("=>"); return [l.slice(0, i), l.slice(i + 2) === "true"]; }));
    for (const [u, esperado] of URLS) {
      assert.equal(urlFuenteValida(u), esperado, `app: ${u}`);
      assert.equal(base.get(u), esperado, `base: ${u}`);
    }
    assert.equal(base.get("<vacía>"), true, "sin fuente (nombre y URL vacíos) la base acepta publicar");
  });

  console.log("\n— Publicar, editar como borrador, publicar cambios, retirar");
  await prueba("publicar: la ficha la ve con SÓLO texto, spoiler y fuente", async () => {
    const r = await admin(adm2.aal2, { accion: "guardar", id: ID, publicar: true, campos: CAMPOS(1) });
    assert.equal(r.status, 200); assert.equal(r.j.curiosidad.estado, "publicada");
    const p = await publica("movie", 990001);
    assert.equal(p.status, 200);
    assert.deepEqual(p.j.curiosidades, [{ texto: "[PRUEBA] Curiosidad ficticia 1.", spoiler: false,
      fuente: { nombre: "Fuente de prueba", url: "https://es.wikipedia.org/wiki/Prueba_1" } }]);
    const rpc = await anon.rpc("curiosidad_publicada", { p_tipo: "movie", p_tmdb_id: 990001 });
    assert.deepEqual(Object.keys(rpc.data[0]).sort(), ["fuente_nombre", "fuente_url", "spoiler", "texto"]);
  });
  await prueba("editar como borrador una publicada: estado «cambios» y la ficha sigue mostrando la versión anterior", async () => {
    const r = await admin(adm2.aal2, { accion: "guardar", id: ID, publicar: false, campos: CAMPOS(2) });
    assert.equal(r.j.curiosidad.estado, "cambios");
    assert.equal((await publica("movie", 990001)).j.curiosidades[0].texto, "[PRUEBA] Curiosidad ficticia 1.");
  });
  await prueba("guardar y publicar cambios: la ficha muestra la versión nueva en el pedido siguiente", async () => {
    const r = await admin(adm2.aal2, { accion: "guardar", id: ID, publicar: true, campos: CAMPOS(2) });
    assert.equal(r.j.curiosidad.estado, "publicada");
    assert.equal((await publica("movie", 990001)).j.curiosidades[0].texto, "[PRUEBA] Curiosidad ficticia 2.");
  });
  await prueba("retirar: desaparece de la ficha y se conserva el contenido", async () => {
    const r = await admin(adm2.aal2, { accion: "retirar", id: ID });
    assert.equal(r.status, 200); assert.equal(r.j.curiosidad.estado, "retirada");
    assert.equal(r.j.curiosidad.publicadaVersion.texto, "[PRUEBA] Curiosidad ficticia 2.");
    assert.deepEqual((await publica("movie", 990001)).j.curiosidades, []);
    assert.equal(fila(990001), "retirada|[PRUEBA] Curiosidad ficticia 2.|[PRUEBA] Curiosidad ficticia 2.");
  });
  await prueba("volver a publicar una retirada", async () => {
    const r = await admin(adm2.aal2, { accion: "guardar", id: ID, publicar: true, campos: CAMPOS(2) });
    assert.equal(r.j.curiosidad.estado, "publicada");
    assert.equal((await publica("movie", 990001)).j.curiosidades.length, 1);
  });

  console.log("\n— Fuente opcional (pedido del dueño, 20/11)");
  await prueba("crear y publicar SIN fuente: 200 y la ficha recibe fuente null", async () => {
    const r = await admin(adm2.aal2, ALTA("movie", 990010, { campos: CAMPOS(10, { fuenteNombre: "", fuenteUrl: "" }), publicar: true }));
    assert.equal(r.status, 200, JSON.stringify(r.j)); assert.equal(r.j.curiosidad.estado, "publicada");
    assert.deepEqual((await publica("movie", 990010)).j.curiosidades, [{ texto: "[PRUEBA] Curiosidad ficticia 10.", spoiler: false, fuente: null }]);
  });
  await prueba("guardar como borrador sin fuente y recargar: queda vacía, sin errores", async () => {
    const r = await admin(adm2.aal2, ALTA("movie", 990011, { campos: CAMPOS(11, { fuenteNombre: "", fuenteUrl: "" }) }));
    assert.equal(r.status, 200); assert.equal(r.j.curiosidad.estado, "borrador");
    const g = await admin(adm2.aal2, null, "?tipo=movie&id=990011");
    assert.equal(g.j.curiosidad.borrador.fuenteNombre, ""); assert.equal(g.j.curiosidad.borrador.fuenteUrl, "");
  });
  await prueba("sólo nombre: texto sin enlace; sólo URL: enlace con la URL", async () => {
    const id = (await admin(adm2.aal2, null, "?tipo=movie&id=990011")).j.curiosidad.id;
    await admin(adm2.aal2, { accion: "guardar", id, publicar: true, campos: CAMPOS(11, { fuenteUrl: "" }) });
    assert.deepEqual((await publica("movie", 990011)).j.curiosidades[0].fuente, { nombre: "Fuente de prueba", url: null });
    await admin(adm2.aal2, { accion: "guardar", id, publicar: true, campos: CAMPOS(11, { fuenteNombre: "" }) });
    assert.deepEqual((await publica("movie", 990011)).j.curiosidades[0].fuente, { nombre: "", url: "https://es.wikipedia.org/wiki/Prueba_11" });
  });
  await prueba("quitar la fuente de una publicada: como borrador la pública la conserva; al publicar desaparece", async () => {
    const r1 = await admin(adm2.aal2, { accion: "guardar", id: ID, publicar: false, campos: CAMPOS(2, { fuenteNombre: "", fuenteUrl: "" }) });
    assert.equal(r1.j.curiosidad.estado, "cambios");
    assert.deepEqual((await publica("movie", 990001)).j.curiosidades[0].fuente,
      { nombre: "Fuente de prueba", url: "https://es.wikipedia.org/wiki/Prueba_2" }, "el borrador no toca la pública");
    const r2 = await admin(adm2.aal2, { accion: "guardar", id: ID, publicar: true, campos: CAMPOS(2, { fuenteNombre: "", fuenteUrl: "" }) });
    assert.equal(r2.j.curiosidad.estado, "publicada");
    const p = (await publica("movie", 990001)).j.curiosidades[0];
    assert.equal(p.fuente, null); assert.equal(p.texto, "[PRUEBA] Curiosidad ficticia 2.");
    assert.equal(sqlOk("select pub_fuente_nombre || '|' || pub_fuente_url from curiosidades where tipo='movie' and tmdb_id=990001"), "|");
  });
  await prueba("volver a ponerle fuente a una publicada sin fuente", async () => {
    await admin(adm2.aal2, { accion: "guardar", id: ID, publicar: true, campos: CAMPOS(2) });
    assert.equal((await publica("movie", 990001)).j.curiosidades[0].fuente.nombre, "Fuente de prueba");
  });

  console.log("\n— Duplicados, serie, spoiler y listado");
  await prueba("duplicado (mismo tipo e id): 409 con la existente para editarla; la base no suma filas", async () => {
    const r = await admin(adm2.aal2, ALTA("movie", 990001, { campos: CAMPOS(9) }));
    assert.equal(r.status, 409); assert.equal(r.j.existente.id, ID);
    assert.equal(sqlOk("select count(*) from curiosidades where tipo='movie' and tmdb_id=990001"), "1");
  });
  await prueba("serie con el MISMO id de TMDB y spoiler, creada y publicada de una vez: no es duplicado", async () => {
    const r = await admin(adm2.aal2, ALTA("tv", 990001, { campos: CAMPOS(3, { spoiler: true }), publicar: true }));
    assert.equal(r.status, 200, JSON.stringify(r.j)); assert.equal(r.j.curiosidad.estado, "publicada");
    const p = await publica("tv", 990001);
    assert.equal(p.j.curiosidades[0].spoiler, true);
    assert.equal((await publica("movie", 990001)).j.curiosidades[0].spoiler, false, "la película no se mezcla con la serie");
  });
  await prueba("crear y publicar incompleto de una vez: 400 y no se crea nada", async () => {
    const r = await admin(adm2.aal2, ALTA("movie", 990003, { campos: CAMPOS(4, { texto: "" }), publicar: true }));
    assert.equal(r.status, 400);
    assert.equal(sqlOk("select count(*) from curiosidades where tmdb_id=990003"), "0");
  });
  await prueba("listado: filtros por estado y búsqueda por título", async () => {
    const todas = (await admin(adm2.aal2, null, "?estado=todas")).j.curiosidades.filter((c) => c.tmdbId >= 990000);
    assert.equal(todas.length, 5);
    const pub = (await admin(adm2.aal2, null, "?estado=publicada")).j.curiosidades.filter((c) => c.tmdbId >= 990000);
    assert.deepEqual(pub.map((c) => `${c.tipo}:${c.tmdbId}`).sort(), ["movie:990001", "movie:990010", "movie:990011", "tv:990001"]);
    const borr = (await admin(adm2.aal2, null, "?estado=borrador")).j.curiosidades.filter((c) => c.tmdbId >= 990000);
    assert.deepEqual(borr.map((c) => c.tmdbId), [990099]);
    const busq = (await admin(adm2.aal2, null, `?estado=todas&q=${encodeURIComponent("tv 990001")}`)).j.curiosidades;
    assert.deepEqual(busq.map((c) => `${c.tipo}:${c.tmdbId}`), ["tv:990001"]);
    assert.equal((await admin(adm2.aal2, null, "?estado=inventado")).status, 400);
  });

  console.log("\n— Lectura pública: contrato, CORS, caché y fallo");
  await prueba("título sin curiosidad: 200 y lista vacía; parámetros inválidos: 400", async () => {
    assert.deepEqual((await publica("movie", 990555)).j, { curiosidades: [] });
    assert.equal((await publica("persona", 1)).status, 400);
    assert.equal((await publica("movie", "abc")).status, 400);
  });
  await prueba("sin caché (no-store) y con CORS para el contenedor Android", async () => {
    const p = await publica("movie", 990001, { Origin: "https://localhost" });
    assert.equal(p.h.get("cache-control"), "no-store");
    assert.equal(p.h.get("access-control-allow-origin"), "https://localhost");
    assert.equal((await publica("movie", 990001, { Origin: "https://evil.example" })).h.get("access-control-allow-origin"), null);
  });
  await prueba("si Supabase falla, la ruta responde 503 (la ficha no muestra la sección) y se recupera sola", async () => {
    sqlOk("revoke execute on function curiosidad_publicada(text, integer) from anon");
    try {
      const p = await publica("movie", 990001);
      assert.equal(p.status, 503); assert.deepEqual(p.j.curiosidades, []);
    } finally {
      sqlOk("grant execute on function curiosidad_publicada(text, integer) to anon");
    }
    assert.equal((await publica("movie", 990001)).j.curiosidades.length, 1);
  });
} finally {
  const r = psql(`delete from curiosidades where ${RANGO}`);
  for (const uid of cuentas) await srv.auth.admin.deleteUser(uid).catch(() => {});
  if (!profilesConcedido) sqlOk("revoke select on public.profiles from authenticated");
  console.log(`\nlimpieza: filas de prueba + permiso de profiles = ${sqlOk(`select count(*) from curiosidades where ${RANGO}`)}|${sqlOk("select has_table_privilege('authenticated', 'public.profiles', 'select')")}${r.status ? " (delete falló)" : ""}`);
}
cerrar();
