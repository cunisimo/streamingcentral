#!/usr/bin/env node
// Batería del editor del Top semanal contra Supabase LOCAL (`supabase start`),
// con las reglas y triggers REALES de la migración 007 y la ruta REAL
// `/api/admin/top` de la app local. SÓLO LOCAL: no conoce Producción.
//
// Uso (con la base armada por `node scripts/sala/db-local.mjs` y la app local
// corriendo contra esa base en APP_LOCAL, por defecto http://127.0.0.1:3130):
//   node --env-file=<archivo con las claves de `supabase status -o env`> \
//     scripts/top/pruebas-editor-local.mjs
//
// Qué es real: Auth local (cuentas, contraseña, DOS factores TOTP verificados y
// sesiones aal1/aal2), PostgREST, RLS, `is_admin_mfa()`, los triggers de 007,
// `reemplazar_entradas`, `publicar_top` y la ruta de la app con `adminDeToken`.
// Qué es FIXTURE: las cuentas y los títulos (ids 9xxxxx inventados). La ventana
// entre dos pestañas se MIDE con desfasajes reales, sin locks: con un lock de
// tabla las dos escrituras se liberan juntas y el resultado depende de cuál
// confirma primero (probado: no es determinístico, no prueba nada).
//
// Entorno local (no son defectos): `supabase start` no concede SELECT de
// `public.profiles` a `authenticated` (adminDeToken lo lee). Se concede sólo
// mientras corre la batería y se revoca al final, como en E4 (docs/ESTADO.md).
//
// Limpieza: exige las tablas del Top VACÍAS al empezar y las vacía al terminar
// (TRUNCATE como postgres: las publicaciones no se pueden borrar por la API, a
// propósito), y borra las cuentas creadas.
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { arnes, contenedor, sqlOk, urlLocal } from "../comunidad/local.mjs";

const URL_API = urlLocal(process.env.NEXT_PUBLIC_SUPABASE_URL);
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SRV = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = process.env.APP_LOCAL ?? "http://127.0.0.1:3130";
if (!ANON || !SRV) { console.error("Faltan las claves locales"); process.exit(2); }
if (!["127.0.0.1", "localhost"].includes(new URL(APP).hostname)) { console.error(`La app no es local: ${APP}`); process.exit(2); }
console.log(`base: ${contenedor()} · API ${URL_API} · app ${APP}\n`);

const opc = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const srv = createClient(URL_API, SRV, opc);
const { prueba, cerrar } = arnes();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const q = (v) => { if (!UUID.test(v)) throw new Error(`uuid inesperado: ${v}`); return `'${v}'`; };

// --- TOTP (RFC 6238), para los factores de las cuentas de prueba -------------
function base32(s) {
  const a = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of s.replace(/=+$/, "").toUpperCase()) bits += a.indexOf(c).toString(2).padStart(5, "0");
  const out = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}
function totp(secreto, t = Date.now()) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(BigInt(Math.floor(t / 30000)));
  const h = createHmac("sha1", base32(secreto)).update(b).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

// --- Cuentas -----------------------------------------------------------------
const cuentas = [];
async function cuenta(et, { admin = false, factores = 0 } = {}) {
  const email = `top-editor-${et}-${Date.now()}-${randomBytes(3).toString("hex")}@banco.test`;
  const password = `Pa-${randomBytes(15).toString("base64url")}`;
  const { data, error } = await srv.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const uid = data.user.id;
  cuentas.push(uid);
  if (admin) sqlOk(`update public.profiles set is_admin = true where id = ${q(uid)}`);
  const cli = createClient(URL_API, ANON, opc);
  const s = await cli.auth.signInWithPassword({ email, password });
  if (s.error) throw s.error;
  const c = { uid, email, password, aal1: s.data.session.access_token, aal2: null };
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
/** Cliente de PostgREST que actúa como el dueño del token (sin pasar por la app). */
const directo = (tok) => createClient(URL_API, ANON, { ...opc, global: { headers: { Authorization: `Bearer ${tok}` } } });

// --- Ruta real de la app -----------------------------------------------------
async function api(tok, body) {
  const r = await fetch(`${APP}/api/admin/top`, {
    method: body ? "POST" : "GET",
    headers: { ...(tok ? { Authorization: `Bearer ${tok}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let j = {};
  try { j = await r.json(); } catch { /* sin cuerpo */ }
  return { status: r.status, j };
}

// --- Lecturas de la base (como postgres, para comprobar lo que quedó) --------
const entradas = (id) => sqlOk(`select coalesce(string_agg(posicion || ':' || tmdb_id, ',' order by posicion), '') from top_ranking_entries where ranking_id = ${q(id)}`);
const titulos = (id) => sqlOk(`select coalesce(string_agg(posicion || ':' || titulo, ',' order by posicion), '') from top_ranking_entries where ranking_id = ${q(id)}`);
const revisado = (id) => sqlOk(`select revisado from top_rankings where id = ${q(id)}`) === "t";
const revisadoPor = (id) => sqlOk(`select coalesce(revisado_por::text, '') from top_rankings where id = ${q(id)}`);
const borrador = (p, t) => sqlOk(`select id from top_rankings where estado = 'borrador' and plataforma = '${p}' and tipo = '${t}'`);

const E = (posicion, n, tipo = "movie") => ({ posicion, tipo, tmdb_id: 900_000 + n, titulo: `Película de prueba ${n}` });
/** Igual que moverEnCasilleros (lib/top-editor-nucleo.ts) para un bloque completo. */
function mover(lista, desde, hasta) {
  const s = [...lista].sort((a, b) => a.posicion - b.posicion);
  const [m] = s.splice(desde - 1, 1);
  s.splice(hasta - 1, 0, m);
  return s.map((e, i) => ({ ...e, posicion: i + 1 }));
}
const ordenSinTitulos = (lista) => lista.map(({ posicion, tipo, tmdb_id }) => ({ posicion, tipo, tmdb_id }));
const leerLista = (id) => entradas(id).split(",").filter(Boolean).map((x) => { const [p, t] = x.split(":"); return { posicion: +p, tipo: "movie", tmdb_id: +t }; });

// =============================================================================
const vacias = sqlOk("select (select count(*) from top_rankings) + (select count(*) from top_ranking_entries)");
if (vacias !== "0") { console.error(`Las tablas del Top no están vacías (${vacias} filas): no se corre para no pisar otros datos locales.`); process.exit(2); }
const profilesConcedido = sqlOk("select has_table_privilege('authenticated', 'public.profiles', 'select')") === "t";
if (!profilesConcedido) sqlOk("grant select on public.profiles to authenticated");

let adm2, adm1, usr, NM, NT;
try {
  adm2 = await cuenta("admin2f", { admin: true, factores: 2 });
  adm1 = await cuenta("admin1f", { admin: true, factores: 1 });
  usr = await cuenta("usuario");

  console.log("— Permisos y segundo factor");
  await prueba("sin token: 401", async () => assert.equal((await api(null)).status, 401));
  await prueba("usuario común: 403", async () => assert.equal((await api(usr.aal1)).status, 403));
  await prueba("admin con dos factores pero sesión SIN elevar (aal1): 403", async () => {
    const r = await api(adm2.aal1);
    assert.equal(r.status, 403); assert.match(r.j.error, /segundo factor/);
  });
  await prueba("admin con UN solo factor (aal2): 403 por falta del respaldo", async () => {
    const r = await api(adm1.aal2);
    assert.equal(r.status, 403); assert.match(r.j.error, /respaldo/);
  });
  await prueba("admin con dos factores (aal2): 200 y los doce borradores", async () => {
    const r = await api(adm2.aal2);
    assert.equal(r.status, 200); assert.equal(r.j.borradores.length, 12);
    NM = borrador("n", "movie"); NT = borrador("n", "tv");
  });
  await prueba("PostgREST directo sin MFA completo: RLS rechaza escribir y reemplazar_entradas dice no autorizado", async () => {
    for (const tok of [usr.aal1, adm2.aal1, adm1.aal2]) {
      const c = directo(tok);
      const ins = await c.from("top_ranking_entries").insert({ ranking_id: NM, posicion: 1, tipo: "movie", tmdb_id: 1, titulo: "x" });
      assert.ok(ins.error, "el insert directo tenía que fallar");
      const rpc = await c.rpc("reemplazar_entradas", { p_ranking: NM, p_entradas: [] });
      assert.match(String(rpc.error?.message), /no autorizado/);
      const sel = await c.from("top_rankings").select("id").eq("estado", "borrador");
      assert.deepEqual(sel.data, [], "un borrador no se ve sin admin+MFA");
    }
    assert.equal(entradas(NM), "", "nada se escribió");
  });
  await prueba("anon no ve borradores", async () => {
    const sel = await createClient(URL_API, ANON, opc).from("top_rankings").select("id").eq("estado", "borrador");
    assert.deepEqual(sel.data ?? [], []);
  });

  console.log("\n— Guardado del orden");
  await prueba("agregar diez títulos en los puestos libres", async () => {
    for (let i = 1; i <= 10; i++) assert.equal((await api(adm2.aal2, { accion: "agregar", id: NM, entrada: E(i, i) })).status, 200);
    assert.equal(entradas(NM), Array.from({ length: 10 }, (_, i) => `${i + 1}:${900_001 + i}`).join(","));
  });
  await prueba("agregar en un puesto ocupado o un título repetido: 409 sin tocar nada", async () => {
    const antes = entradas(NM);
    assert.equal((await api(adm2.aal2, { accion: "agregar", id: NM, entrada: E(3, 77) })).status, 409);
    sqlOk(`delete from top_ranking_entries where ranking_id = ${q(NM)} and posicion = 10`);
    assert.equal((await api(adm2.aal2, { accion: "agregar", id: NM, entrada: E(10, 1) })).status, 409, "título 1 ya está en el puesto 1");
    sqlOk(`insert into top_ranking_entries (ranking_id, posicion, tipo, tmdb_id, titulo) values (${q(NM)}, 10, 'movie', 900010, 'Película de prueba 10')`);
    assert.equal(entradas(NM), antes);
  });
  await prueba("ordenar del 8 al 2: los intermedios se corren y los títulos salen de la base", async () => {
    const nuevo = mover(leerLista(NM), 8, 2);
    const r = await api(adm2.aal2, { accion: "ordenar", id: NM, entradas: ordenSinTitulos(nuevo) });
    assert.equal(r.status, 200);
    assert.equal(entradas(NM), nuevo.map((e) => `${e.posicion}:${e.tmdb_id}`).join(","));
    assert.match(titulos(NM), /^1:Película de prueba 1,2:Película de prueba 8,3:Película de prueba 2/);
  });
  await prueba("ordenar con un título de menos, uno ajeno o puestos repetidos: 409 y la base intacta", async () => {
    const antes = entradas(NM), base = leerLista(NM);
    const malos = [
      base.slice(0, 9),
      [...base.slice(0, 9), { posicion: 10, tipo: "movie", tmdb_id: 123 }],
      base.map((e) => (e.posicion === 10 ? { ...e, posicion: 1 } : e)),
      base.map((e) => (e.posicion === 10 ? { ...e, posicion: 11 } : e)),
    ];
    for (const m of malos) assert.equal((await api(adm2.aal2, { accion: "ordenar", id: NM, entradas: m })).status, 409);
    assert.equal(entradas(NM), antes);
  });
  await prueba("reemplazar condicionado: con el título esperado reemplaza; si el puesto cambió, 409", async () => {
    const enPuesto5 = leerLista(NM).find((e) => e.posicion === 5);
    assert.equal((await api(adm2.aal2, { accion: "reemplazar", id: NM, entrada: E(5, 50), reemplaza: { tipo: "movie", tmdb_id: enPuesto5.tmdb_id } })).status, 200);
    assert.match(entradas(NM), /5:900050/);
    const antes = entradas(NM);
    assert.equal((await api(adm2.aal2, { accion: "reemplazar", id: NM, entrada: E(5, 51), reemplaza: { tipo: "movie", tmdb_id: enPuesto5.tmdb_id } })).status, 409);
    assert.equal((await api(adm2.aal2, { accion: "reemplazar", id: NM, entrada: E(5, 1), reemplaza: { tipo: "movie", tmdb_id: 900_050 } })).status, 409, "el título 1 ya está en el bloque");
    assert.equal(entradas(NM), antes);
  });
  await prueba("trigger de tipo: una serie no entra en un bloque de películas", async () => {
    const r = await api(adm2.aal2, { accion: "agregar", id: NT, entrada: E(1, 300, "movie") });
    assert.ok(r.status >= 400, `status ${r.status}`);
    assert.equal(entradas(NT), "");
  });

  console.log("\n— Aprobación");
  await prueba("aprobar marca revisado y firma con el uid del TOKEN (trigger), no del cuerpo", async () => {
    assert.equal((await api(adm2.aal2, { accion: "revisar", id: NM, revisado: true, revisado_por: usr.uid })).status, 200);
    assert.equal(revisado(NM), true);
    assert.equal(revisadoPor(NM), adm2.uid);
  });
  for (const [nombre, cuerpo] of [
    ["ordenar", () => ({ accion: "ordenar", id: NM, entradas: ordenSinTitulos(mover(leerLista(NM), 1, 2)) })],
    ["reemplazar", () => { const e = leerLista(NM).find((x) => x.posicion === 9); return { accion: "reemplazar", id: NM, entrada: E(9, 90), reemplaza: { tipo: "movie", tmdb_id: e.tmdb_id } }; }],
    ["cambiar la fecha", () => ({ accion: "fecha", id: NM, fecha: "2026-11-12" })],
  ]) {
    await prueba(`${nombre} después de aprobar quita la aprobación`, async () => {
      assert.equal((await api(adm2.aal2, { accion: "revisar", id: NM, revisado: true })).status, 200);
      assert.equal(revisado(NM), true);
      assert.equal((await api(adm2.aal2, cuerpo())).status, 200);
      assert.equal(revisado(NM), false);
    });
  }
  await prueba("deshacer la aprobación", async () => {
    await api(adm2.aal2, { accion: "revisar", id: NM, revisado: true });
    assert.equal((await api(adm2.aal2, { accion: "revisar", id: NM, revisado: false })).status, 200);
    assert.equal(revisado(NM), false);
  });
  await prueba("sin MFA completo no se aprueba, ni por la app ni directo", async () => {
    assert.equal((await api(adm1.aal2, { accion: "revisar", id: NM, revisado: true })).status, 403);
    const d = await directo(adm1.aal2).from("top_rankings").update({ revisado_por: adm1.uid }).eq("id", NM).select("id");
    assert.ok(d.error || !d.data?.length, "el update directo no tenía que tocar filas");
    assert.equal(revisado(NM), false);
  });

  console.log("\n— Publicación y restauración");
  let PUB;
  await prueba("publicar exige aprobación", async () => {
    const r = await api(adm2.aal2, { accion: "publicar", ids: [NM] });
    assert.equal(r.j.resultados[0].publicado, false); assert.equal(r.j.resultados[0].motivo, "sin revisar");
  });
  await prueba("aprobado y completo se publica y nace el borrador siguiente con las mismas diez", async () => {
    const contenido = entradas(NM);
    await api(adm2.aal2, { accion: "revisar", id: NM, revisado: true });
    const r = await api(adm2.aal2, { accion: "publicar", ids: [NM] });
    assert.equal(r.j.resultados[0].publicado, true);
    assert.ok(r.j.publicados.includes("n:movie"));
    PUB = NM;
    NM = borrador("n", "movie");
    assert.notEqual(NM, PUB);
    assert.equal(entradas(NM), contenido);
    assert.equal(sqlOk(`select copiado_de from top_rankings where id = ${q(NM)}`), PUB);
  });
  await prueba("lo publicado no se edita ni se borra, ni siquiera con admin+MFA directo", async () => {
    const antes = entradas(PUB);
    const c = directo(adm2.aal2);
    const up = await c.from("top_ranking_entries").update({ titulo: "pisado" }).eq("ranking_id", PUB).eq("posicion", 1);
    const del = await c.from("top_rankings").delete().eq("id", PUB);
    const rpc = await c.rpc("reemplazar_entradas", { p_ranking: PUB, p_entradas: [] });
    assert.ok(up.error, "update de una entrada publicada"); assert.ok(del.error, "delete de una publicación");
    assert.match(String(rpc.error?.message), /sólo se editan borradores/);
    assert.equal(entradas(PUB), antes);
  });
  await prueba("restaurar: el borrador vuelve a la última publicación, sin aprobación, y la publicación no cambia", async () => {
    const pub = entradas(PUB), publicadas = sqlOk("select count(*) from top_rankings where estado = 'publicado'");
    await api(adm2.aal2, { accion: "ordenar", id: NM, entradas: ordenSinTitulos(mover(leerLista(NM), 10, 1)) });
    const e3 = leerLista(NM).find((x) => x.posicion === 3);
    await api(adm2.aal2, { accion: "reemplazar", id: NM, entrada: E(3, 333), reemplaza: { tipo: "movie", tmdb_id: e3.tmdb_id } });
    await api(adm2.aal2, { accion: "revisar", id: NM, revisado: true });
    assert.notEqual(entradas(NM), pub);
    assert.equal((await api(adm2.aal2, { accion: "restaurar", id: NM })).status, 200);
    assert.equal(entradas(NM), pub);
    assert.equal(revisado(NM), false);
    assert.equal(entradas(PUB), pub);
    assert.equal(sqlOk("select count(*) from top_rankings where estado = 'publicado'"), publicadas);
  });
  await prueba("un bloque sin publicación no figura en `publicados` (el botón queda deshabilitado)", async () => {
    const r = await api(adm2.aal2);
    assert.ok(!r.j.publicados.includes("n:tv"));
  });

  console.log("\n— Dos pestañas sobre el mismo bloque");
  // Netflix · Series con cinco títulos y lugares libres.
  for (let i = 1; i <= 5; i++) await api(adm2.aal2, { accion: "agregar", id: NT, entrada: E(i, 500 + i, "tv") });
  const leerTv = () => entradas(NT).split(",").filter(Boolean).map((x) => { const [p, t] = x.split(":"); return { posicion: +p, tipo: "tv", tmdb_id: +t }; });
  await prueba("B agrega y después A reordena con lo que tenía cargado: 409 y el título de B sigue", async () => {
    const vistaA = leerTv();
    assert.equal((await api(adm2.aal2, { accion: "agregar", id: NT, entrada: E(6, 506, "tv") })).status, 200);
    const s = [...vistaA]; const [m] = s.splice(4, 1); s.splice(0, 0, m);
    assert.equal((await api(adm2.aal2, { accion: "ordenar", id: NT, entradas: s.map((e, i) => ({ ...e, posicion: i + 1 })) })).status, 409);
    assert.match(entradas(NT), /6:900506/);
  });
  await prueba("A y B agregan en el mismo puesto libre a la vez: uno entra y el otro recibe 409", async () => {
    const [a, b] = await Promise.all([
      api(adm2.aal2, { accion: "agregar", id: NT, entrada: E(7, 507, "tv") }),
      api(adm2.aal2, { accion: "agregar", id: NT, entrada: E(7, 508, "tv") }),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
    assert.equal(sqlOk(`select count(*) from top_ranking_entries where ranking_id = ${q(NT)} and posicion = 7`), "1");
  });
  await prueba("A y B agregan el mismo título en puestos distintos a la vez: uno recibe 409", async () => {
    const [a, b] = await Promise.all([
      api(adm2.aal2, { accion: "agregar", id: NT, entrada: E(8, 600, "tv") }),
      api(adm2.aal2, { accion: "agregar", id: NT, entrada: E(9, 600, "tv") }),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
    assert.equal(sqlOk(`select count(*) from top_ranking_entries where ranking_id = ${q(NT)} and tmdb_id = 900600`), "1");
  });
  await prueba("A y B reordenan a la vez con los mismos títulos: queda uno de los dos órdenes, sin duplicar ni perder", async () => {
    const base = leerTv(), claves = base.map((e) => e.tmdb_id).sort().join(",");
    const ordenA = base.map((e, i, arr) => ({ ...arr[arr.length - 1 - i], posicion: e.posicion }));
    const ordenB = base.map((e, i, arr) => ({ ...arr[(i + 1) % arr.length], posicion: e.posicion }));
    const [a, b] = await Promise.all([
      api(adm2.aal2, { accion: "ordenar", id: NT, entradas: ordenA }),
      api(adm2.aal2, { accion: "ordenar", id: NT, entradas: ordenB }),
    ]);
    assert.ok([a.status, b.status].every((s) => s === 200 || s === 409), `${a.status}/${b.status}`);
    assert.ok([a.status, b.status].includes(200), "al menos uno se guarda");
    console.log(`     respuestas: ${a.status} y ${b.status}`);
    const fin = leerTv();
    assert.equal(fin.map((e) => e.tmdb_id).sort().join(","), claves, "mismos títulos");
    const huella = (l) => l.map((e) => `${e.posicion}:${e.tmdb_id}`).join(",");
    assert.ok([huella(ordenA), huella(ordenB)].includes(huella(fin)), "quedó uno de los dos órdenes");
  });

  console.log("\n— Riesgos residuales (se espera CONFIRMARLOS, no que pasen)");
  await prueba("RIESGO 1 (medición): alta de B y reordenamiento de A con desfasajes de 0 a 78 ms", async () => {
    // Sin locks: A y B por la ruta real, B disparado d ms después de A. Se
    // cuenta cuántas veces el alta de B termina borrada aunque B recibió 200.
    // No se exige un número: se mide. Sí se exige que nunca haya duplicados ni
    // se pierda un título de A.
    let perdidas = 0, conflictos = 0, intentos = 0;
    for (let d = 0; d <= 78; d += 3) {
      intentos++;
      sqlOk(`delete from top_ranking_entries where ranking_id = ${q(NT)};
insert into top_ranking_entries (ranking_id, posicion, tipo, tmdb_id, titulo)
select ${q(NT)}, g, 'tv', 900500 + g, 'Serie de prueba ' || g from generate_series(1, 5) g;`);
      const base = leerTv();
      const pA = api(adm2.aal2, { accion: "ordenar", id: NT, entradas: mover(base, 1, 2).map((e) => ({ ...e, tipo: "tv" })) });
      await new Promise((r) => setTimeout(r, d));
      const pB = api(adm2.aal2, { accion: "agregar", id: NT, entrada: E(6, 800 + d, "tv") });
      const [a, b] = await Promise.all([pA, pB]);
      const fin = leerTv();
      const ids = fin.map((e) => e.tmdb_id);
      assert.equal(new Set(ids).size, ids.length, "sin duplicados");
      assert.equal(new Set(fin.map((e) => e.posicion)).size, fin.length, "sin puestos repetidos");
      for (let g = 1; g <= 5; g++) assert.ok(ids.includes(900500 + g), `el título ${g} de A no se pierde`);
      if (a.status === 409 || b.status === 409) conflictos++;
      if (b.status === 200 && a.status === 200 && !ids.includes(900_800 + d)) perdidas++;
    }
    console.log(`     ${intentos} intentos: ${perdidas} altas perdidas en silencio, ${conflictos} con 409`);
  });
  await prueba("RIESGO 2: una aprobación sobre contenido que esa pestaña no vio queda aprobada", async () => {
    await api(adm2.aal2, { accion: "revisar", id: NT, revisado: false });
    const vistaDeA = entradas(NT);
    await api(adm2.aal2, { accion: "ordenar", id: NT, entradas: mover(leerTv(), 1, 3).map((e) => ({ ...e, tipo: "tv" })) });
    assert.equal((await api(adm2.aal2, { accion: "revisar", id: NT, revisado: true })).status, 200);
    assert.notEqual(entradas(NT), vistaDeA);
    assert.equal(revisado(NT), true, "se esperaba confirmar que la aprobación no está atada a una versión");
  });
} finally {
  // Limpieza local: las publicaciones no se borran por la API (a propósito), así
  // que se vacían con TRUNCATE como postgres. Sólo porque empezaron vacías.
  sqlOk("truncate top_ranking_entries, top_rankings");
  for (const uid of cuentas) await srv.auth.admin.deleteUser(uid).catch(() => {});
  if (!profilesConcedido) sqlOk("revoke select on public.profiles from authenticated");
  const resto = sqlOk("select (select count(*) from top_rankings) || '|' || (select has_table_privilege('authenticated', 'public.profiles', 'select'))");
  console.log(`\nlimpieza: filas del Top + permiso de profiles = ${resto}`);
}
cerrar();
