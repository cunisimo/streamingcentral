#!/usr/bin/env node
// E5a: lectura protegida y "Recientes" con las FUNCIONES REALES de 017 contra
// `supabase start`. SÓLO LOCAL.
//
// Uso:
//   node scripts/sala/db-local.mjs            (o 017 aplicada)
//   (servidor de la app con las claves locales en BASE, por defecto
//    http://localhost:3100, para la sección de la ruta; sin servidor, esa
//    sección se informa como NO CORRIDA y la batería falla)
//   node --env-file=.env.comunidad-local scripts/comunidad/pruebas-lectura.mjs
//
// Qué es real: `public.comunidad_resenas` llamada como la ruta (anon key +
// Bearer de una sesión real del Auth local, por PostgREST) y el adaptador de
// la ruta (lib/comunidad/lectura.ts); las funciones de producto de E3 para
// publicar, editar, borrar, bloquear; las de E4 para retirar y suspender, con
// un admin con DOS factores TOTP reales; la ruta /api/comunidad/resenas/lista
// del servidor local.
// Qué es fixture: el texto de las reseñas (ficticio, distinto entre sí) se
// publica y se edita con `comunidad_publicar` / `comunidad_editar` y una decisión "publicar" como la que arma
// la ruta tras las reglas (no se corren las reglas: E1 ya está probada); y los
// EMPATES de fecha se fuerzan con un UPDATE de `primera_publicacion_en` como
// postgres (la columna no es inmutable), porque dos publicaciones reales no
// caen en el mismo microsegundo.
//
// Resultados esperados escritos en cada prueba ANTES de correrla. Cuentas
// ficticias `@comunidad.test`; al final se borran ellas, sus participantes y lo
// que crearon. Configuración e interruptores vuelven a como estaban. Termina
// con 1 si algo falla.
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { arnes, contenedor, sqlOk, urlLocal } from "./local.mjs";
import { dockerVerificado } from "./docker-local.mjs";
import { dependenciasEscritura, operacionesComunidad, sha256 } from "../../lib/comunidad/escritura-deps.ts";
import { normalizarTexto } from "../../lib/comunidad/texto.ts";
import { huella, secretoDuplicados } from "../../lib/comunidad/duplicados.ts";
import { TERMINOS_VERSION } from "../../lib/comunidad/terminos.ts";
import { decodificarCursor, leerResenas, pedidoLectura } from "../../lib/comunidad/lectura.ts";

const URL_API = urlLocal(process.env.NEXT_PUBLIC_SUPABASE_URL);
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SRV = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE = process.env.BASE || "http://localhost:3100";
if (!ANON || !SRV) { console.error("Faltan claves (¿--env-file=.env.comunidad-local?)"); process.exit(2); }
if (!["localhost", "127.0.0.1"].includes(new URL(BASE).hostname)) { console.error(`BASE no es local: ${BASE}`); process.exit(2); }
const SECRETO = secretoDuplicados();
if (!SECRETO?.startsWith("local-prueba-")) { console.error("Falta el secreto HMAC LOCAL de prueba"); process.exit(2); }
const docker = dockerVerificado();
console.log(`docker: ${docker.nombre} (${docker.origen}) → ${docker.host}`);
console.log(`base: ${contenedor()} · API ${URL_API} · app ${BASE}\n`);
if (sqlOk("select count(*) from pg_proc where proname = 'comunidad_resenas'") !== "1") { console.error("Falta 017_comunidad_lectura.sql"); process.exit(2); }

const opc = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const srv = createClient(URL_API, SRV, opc);
const deps = dependenciasEscritura(srv);
const ops = operacionesComunidad(srv);
const SOLO = process.env.SOLO ?? "";
const { prueba: pruebaArnes, cerrar } = arnes();
const prueba = (n, fn) => (!SOLO || n.includes(SOLO) || n.startsWith("preparación") ? pruebaArnes(n, fn) : Promise.resolve());
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const q = (v) => { if (!UUID.test(v)) throw new Error(`uuid inesperado: ${v}`); return `'${v}'`; };
const MOTIVO = "Motivo de prueba local (E5a).";

// ---------------------------------------------------------------------------
// Textos ficticios distintos entre sí (la huella de duplicados no los junta).
// ---------------------------------------------------------------------------
const PALABRAS = ("fotografía guion ritmo final actuación música villano protagonista montaje diálogo escena giro humor drama " +
  "vestuario ambientación época familia domingo tarde noche invierno verano ciudad pueblo río montaña mar desierto bosque tren " +
  "barco avión casa escuela hospital oficina mercado plaza estadio teatro museo biblioteca cocina jardín terraza balcón sótano " +
  "amistad venganza secreto promesa mentira herencia viaje regreso despedida encuentro carta llamada mensaje fotografía recuerdo " +
  "sueño miedo risa llanto silencio ruido lluvia viento nieve sol luna estrella sombra fuego agua tierra aire color blanco negro").split(" ");
let nTexto = 0;
function texto() {
  const n = ++nTexto;
  const w = Array.from({ length: 24 }, () => PALABRAS[randomBytes(1)[0] % PALABRAS.length]);
  return `Reseña ficticia ${n} ${randomBytes(4).toString("hex")}: ${w.join(" ")}. La recomiendo con matices, número ${n}.`;
}
const decision = (t) => ({ resultado: "publicar", version_reglas: "prueba-e5a", reglas: [], huella: huella(normalizarTexto(t), SECRETO) });
let tmdb = 9_500_000 + Math.floor(Math.random() * 10_000) * 10;

// ---------------------------------------------------------------------------
// Cuentas y sesiones reales
// ---------------------------------------------------------------------------
const cuentas = new Set();
const participantes = new Set();
async function cuenta(etiqueta, { terminos = true } = {}) {
  const email = `lec-${etiqueta}-${Date.now()}-${randomBytes(3).toString("hex")}@comunidad.test`;
  const password = `Pa-${randomBytes(15).toString("base64url")}`;
  const { data, error } = await srv.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  cuentas.add(data.user.id);
  const c = { uid: data.user.id, email, password };
  if (terminos) {
    const r = await ops.aceptarTerminos(c.uid, TERMINOS_VERSION);
    assert.equal(r.resultado, "terminos_aceptados", JSON.stringify(r));
    c.part = sqlOk(`select id from comunidad.participantes where user_id = ${q(c.uid)}`);
    participantes.add(c.part);
  }
  return c;
}
async function sesion(c) {
  const cli = createClient(URL_API, ANON, opc);
  const { data, error } = await cli.auth.signInWithPassword({ email: c.email, password: c.password });
  if (error) throw error;
  return data.session.access_token;
}
const comoUsuario = (jwt) => createClient(URL_API, ANON, { ...opc, global: { headers: { Authorization: `Bearer ${jwt}` } } });

/** Publica con la función real; devuelve { resena_id, version_id }. */
async function publicar(c, tmdbId, tipo = "movie") {
  const t = texto();
  const r = await deps.publicar({ uid: c.uid, tipo, tmdbId, texto: t, decision: decision(t), idIntento: randomUUID(), hash: sha256(t) });
  assert.equal(r.resultado, "publicada", JSON.stringify(r));
  return r;
}
/** Edita con la función real y una decisión "publicar" (el texto ficticio no pasa por las reglas, como al publicar). */
async function editar(c, resenaId, versionEsperada) {
  const t = texto();
  return deps.editar({ uid: c.uid, resenaId, versionEsperada, texto: t, decision: decision(t), idIntento: randomUUID(), hash: sha256(t) });
}

/** Una página por PostgREST con la sesión del lector (el camino de la ruta). */
async function pagina(sb, tmdbId, cursor = null, limite = 5, tipo = "movie") {
  const { data, error } = await sb.rpc("comunidad_resenas", { p_tipo: tipo, p_tmdb_id: tmdbId, p_orden: "recientes", p_cursor: cursor, p_limite: limite });
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data;
}
/** Recorre todas las páginas; devuelve los ids en orden y cuántas páginas. */
async function recorrer(sb, tmdbId, { limite = 5, entrePaginas } = {}) {
  const ids = [];
  let cursor = null, paginas = 0;
  for (;;) {
    const p = await pagina(sb, tmdbId, cursor, limite);
    paginas++;
    assert.equal(p.items.length <= limite, true);
    ids.push(...p.items.map((x) => x.resena_id));
    if (!p.hay_mas) { assert.equal(p.cursor, null); break; }
    assert.ok(p.cursor && p.items.length === limite, "con más páginas, la tanda viene llena y con cursor");
    cursor = p.cursor;
    if (entrePaginas) await entrePaginas(paginas, ids);
    if (paginas > 500) throw new Error("demasiadas páginas");
  }
  return { ids, paginas };
}
/** Lo que DEBE ver el lector `part` de un título, en el orden del diseño, calculado en SQL aparte. */
const esperadoSql = (tmdbId, part) => sqlOk(`select coalesce(string_agg(r.id::text, ',' order by r.primera_publicacion_en desc, r.id desc), '')
  from comunidad.resenas r join comunidad.versiones v on v.id = r.version_vigente_id
 where r.tipo = 'movie' and r.tmdb_id = ${tmdbId} and r.borrada_en is null and r.primera_publicacion_en is not null
   and v.estado = 'publicada' and r.autor_participante <> ${q(part)}
   and not exists (select 1 from comunidad.bloqueos b where b.bloqueador_participante = ${q(part)} and b.bloqueado_participante = r.autor_participante)
   and not exists (select 1 from comunidad.suspensiones s where s.participante_id = r.autor_participante and s.desde <= now() and (s.hasta is null or s.hasta > now()))`)
  .split(",").filter(Boolean).map(Number);

// TOTP real para el admin de E4 (retirar y suspender con las funciones reales).
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
  a.jwt = (await cli.auth.getSession()).data.session.access_token;
  a.sb = comoUsuario(a.jwt);
  return a;
}

const config = (cols) => sqlOk(`update comunidad.config set ${Object.entries(cols).map(([k, v]) => `${k} = ${v}`).join(", ")} where id`);
const configPrevia = JSON.parse(sqlOk("select row_to_json(c)::text from comunidad.config c"));
const S = {};

// ===========================================================================
config({ modulo_activo: true, publicacion_activa: true });
try {
  console.log("— Preparación —");
  await prueba("preparación: un título con 213 visibles + 6 que no deben verse; lector, otro lector, admin con dos TOTP", async () => {
    S.T = tmdb++;
    S.lector = await cuenta("lector");
    S.otro = await cuenta("otro");
    S.jwtLector = await sesion(S.lector);
    S.jwtOtro = await sesion(S.otro);
    S.sbLector = comoUsuario(S.jwtLector);
    S.sbOtro = comoUsuario(S.jwtOtro);
    S.admin = await adminAal2();
    // 219 autores reales, de a 12 en paralelo.
    S.autores = [];
    for (let i = 0; i < 219; i += 12) {
      const tanda = await Promise.all(Array.from({ length: Math.min(12, 219 - i) }, (_, k) => cuenta(`au${i + k}`)));
      S.autores.push(...tanda);
    }
    S.resenas = [];
    for (const a of S.autores) S.resenas.push({ a, ...(await publicar(a, S.T)) });
    // La propia del lector (no va en la lista: va en `mia`).
    S.propia = await publicar(S.lector, S.T);
    // Seis que el lector NO debe ver: retenida, retirada, borrada, de un suspendido, de un bloqueado (sólo para él) y
    // la reseña propia. Las primeras cinco, de los primeros cinco autores.
    const [retenida, retirada, borrada, suspendida, bloqueada] = S.resenas.slice(0, 5);
    S.ocultas = { retenida, retirada, borrada, suspendida, bloqueada };
    assert.equal((await ops.retenerPorRegla(retenida.version_id, { resultado: "retener", version_reglas: "prueba-e5a", reglas: ["prueba"] })).resultado, "retenida_por_regla");
    const d = await S.admin.sb.rpc("comunidad_admin_decidir", { p_accion: "retirar", p_version: retirada.version_id, p_motivo: MOTIVO, p_id_intento: randomUUID() });
    assert.equal(d.data?.resultado, "aplicada", JSON.stringify(d));
    assert.equal((await ops.borrar(borrada.a.uid, borrada.resena_id)).resultado, "borrada");
    const s = await S.admin.sb.rpc("comunidad_admin_suspender", { p_participante: suspendida.a.part, p_motivo: MOTIVO, p_id_intento: randomUUID() });
    assert.equal(s.data?.resultado, "aplicada", JSON.stringify(s));
    assert.equal((await ops.bloquear(S.lector.uid, bloqueada.version_id)).resultado, "bloqueado");
    // EMPATES forzados: 12 reseñas consecutivas con la MISMA primera publicación, cruzando bordes de página.
    const empate = S.resenas.slice(100, 112).map((x) => x.resena_id);
    sqlOk(`update comunidad.resenas set primera_publicacion_en = (select primera_publicacion_en from comunidad.resenas where id = ${empate[0]})
      where id in (${empate.join(",")})`);
    S.empate = empate;
    assert.equal(esperadoSql(S.T, S.lector.part).length, 214, "219 − 5 ocultas = 214 visibles para el lector");
  });

  // =========================================================================
  console.log("\n— Permisos: sin sesión nada; con sesión, sólo como uno mismo —");
  await prueba("RPC directo: anon y service_role → 401/403 con 42501/permission denied; un JWT real → 200; no hay parámetro para leer como otro", async () => {
    const llamar = (token, args = { p_tipo: "movie", p_tmdb_id: S.T, p_orden: "recientes", p_cursor: null, p_limite: 5 }) =>
      fetch(`${URL_API}/rest/v1/rpc/comunidad_resenas`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(args) });
    for (const [quien, token] of [["anon", ANON], ["service_role", SRV]]) {
      const r = await llamar(token);
      const cuerpo = await r.text();
      assert.ok((r.status === 401 || r.status === 403) && /42501|permission denied/.test(cuerpo), `${quien}: ${r.status} ${cuerpo.slice(0, 120)}`);
      assert.doesNotMatch(cuerpo, /Reseña ficticia/);
    }
    const ok = await llamar(S.jwtLector);
    assert.equal(ok.status, 200);
    // Pasar un p_uid ajeno no existe en la firma: PostgREST no encuentra la función.
    const ajeno = await llamar(S.jwtLector, { p_uid: S.otro.uid, p_tipo: "movie", p_tmdb_id: S.T, p_orden: "recientes", p_cursor: null, p_limite: 5 });
    assert.ok(ajeno.status === 404 || ajeno.status === 400, `con p_uid: ${ajeno.status}`);
    // El interruptor para la ruta: sólo service_role.
    for (const token of [ANON, S.jwtLector]) {
      const r = await fetch(`${URL_API}/rest/v1/rpc/comunidad_modulo_activo`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}" });
      assert.ok(r.status === 401 || r.status === 403, `modulo_activo: ${r.status}`);
    }
    assert.equal((await srv.rpc("comunidad_modulo_activo")).data, true);
  });

  await prueba("catálogo: comunidad_resenas security definer, search_path vacío, EXECUTE sólo authenticated; modulo_activo sólo service_role; comunidad_leer_titulo ya no existe", () => {
    const fila = (f) => sqlOk(`select p.prosecdef || ':' || coalesce(array_to_string(p.proconfig, ','), '') || ':' ||
      has_function_privilege('public', p.oid, 'EXECUTE') || has_function_privilege('anon', p.oid, 'EXECUTE') ||
      has_function_privilege('authenticated', p.oid, 'EXECUTE') || has_function_privilege('service_role', p.oid, 'EXECUTE')
      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = '${f}'`);
    // E5b (018): la función genera el orden de "Más útiles" (escribe), así que lleva lock_timeout.
    assert.equal(fila("comunidad_resenas"), 'true:search_path="",lock_timeout=5s:falsefalsetruefalse');
    assert.equal(fila("comunidad_modulo_activo"), 'true:search_path="":falsefalsefalsetrue');
    assert.equal(sqlOk("select count(*) from pg_proc where proname = 'comunidad_leer_titulo'"), "0");
    assert.equal(sqlOk(`select count(*) from pg_proc f, unnest(array['public','anon','authenticated','service_role']) r
      where f.pronamespace = 'comunidad'::regnamespace and f.proname = 'item_lectura' and has_function_privilege(r, f.oid, 'EXECUTE')`), "0");
  });

  // =========================================================================
  console.log("\n— Recientes: recorrido completo —");
  await prueba("más de 200 reseñas: el lector recorre las 214 visibles de a 5, en el orden (primera publicación desc, id desc), sin repetir ni saltear, con un empate de 12 cruzando páginas", async () => {
    const primera = await pagina(S.sbLector, S.T);
    assert.deepEqual([primera.activo, primera.orden, primera.items.length, primera.hay_mas, primera.total], [true, "recientes", 5, true, 214]);
    assert.equal(primera.mia?.resena_id, S.propia.resena_id, "la propia va en `mia`");
    assert.equal(primera.terminos?.aceptada, true);
    const { ids, paginas } = await recorrer(S.sbLector, S.T);
    const esperado = esperadoSql(S.T, S.lector.part);
    assert.equal(ids.length, 214);
    assert.equal(new Set(ids).size, 214, "repitió");
    assert.deepEqual(ids, esperado, "el orden o el conjunto no coinciden con el cálculo aparte");
    assert.equal(paginas, 43);
    for (const o of Object.values(S.ocultas)) assert.equal(ids.includes(o.resena_id), false, `apareció una oculta (${o.resena_id})`);
    assert.equal(ids.includes(S.propia.resena_id), false);
    // El empate: las 12 juntas y por id desc.
    const pos = S.empate.map((id) => ids.indexOf(id)).sort((a, b) => a - b);
    assert.equal(pos[11] - pos[0], 11, "el empate quedó partido");
    assert.deepEqual(ids.slice(pos[0], pos[0] + 12), [...S.empate].sort((a, b) => b - a));
    console.log(`     214 reseñas en ${paginas} páginas; empate en las posiciones ${pos[0]}–${pos[11]}`);
  });

  await prueba("el mismo recorrido por el ADAPTADOR de la ruta (cursor opaco) y con tandas de 20: mismo conjunto y orden", async () => {
    const ids = [];
    let cursor = null;
    for (let i = 0; i < 100; i++) {
      const p = pedidoLectura(new URLSearchParams(`tipo=movie&id=${S.T}${cursor ? `&cursor=${cursor}` : ""}`));
      assert.ok(!("invalido" in p));
      const r = await leerResenas(S.sbLector, p);
      ids.push(...r.items.map((x) => x.resena_id));
      if (!r.hay_mas) break;
      assert.ok(decodificarCursor(r.cursor));
      cursor = r.cursor;
    }
    assert.deepEqual(ids, esperadoSql(S.T, S.lector.part));
    assert.deepEqual((await recorrer(S.sbLector, S.T, { limite: 20 })).ids, ids);
  });

  await prueba("bloqueo personal: la reseña bloqueada no la ve quien bloqueó, SÍ la ve otro lector; el suspendido no lo ve nadie", async () => {
    const delOtro = (await recorrer(S.sbOtro, S.T, { limite: 20 })).ids;
    assert.equal(delOtro.includes(S.ocultas.bloqueada.resena_id), true, "el bloqueo sólo oculta para quien bloquea");
    assert.equal(delOtro.includes(S.ocultas.suspendida.resena_id), false);
    assert.equal(delOtro.includes(S.ocultas.retirada.resena_id) || delOtro.includes(S.ocultas.borrada.resena_id) || delOtro.includes(S.ocultas.retenida.resena_id), false);
    // El otro lector ve también la del lector (no es suya) y la bloqueada: 214 − 1 (su propia no existe) + 1 + 1 = 216.
    assert.equal(delOtro.length, 216);
  });

  // =========================================================================
  console.log("\n— Cambios entre páginas (funciones reales) —");
  await prueba("entre páginas: retiro, borrado, edición, bloqueo y suspensión. Nada oculto reaparece por el cursor, nada se repite, nada visible se saltea", async () => {
    // Se fija ANTES qué se va a tocar, por posición en el recorrido sin cambios.
    const base = esperadoSql(S.T, S.lector.part);
    const porId = new Map(S.resenas.map((x) => [x.resena_id, x]));
    const aRetirar = porId.get(base[30]), aBorrar = porId.get(base[60]), aEditarVista = porId.get(base[2]), aEditarFutura = porId.get(base[90]);
    const aBloquear = porId.get(base[120]), aSuspender = porId.get(base[150]);
    const cambiados = new Set();
    const { ids } = await recorrer(S.sbLector, S.T, {
      entrePaginas: async (n) => {
        if (n === 1) {
          const r = await S.admin.sb.rpc("comunidad_admin_decidir", { p_accion: "retirar", p_version: aRetirar.version_id, p_motivo: MOTIVO, p_id_intento: randomUUID() });
          assert.equal(r.data?.resultado, "aplicada");
          assert.equal((await ops.borrar(aBorrar.a.uid, aBorrar.resena_id)).resultado, "borrada");
          const e1 = await editar(aEditarVista.a, aEditarVista.resena_id, aEditarVista.version_id);
          assert.equal(e1.resultado, "publicada", JSON.stringify(e1));
          const e2 = await editar(aEditarFutura.a, aEditarFutura.resena_id, aEditarFutura.version_id);
          assert.equal(e2.resultado, "publicada", JSON.stringify(e2));
          S.editadaFutura = e2.version_id;
          cambiados.add("1");
        }
        if (n === 20) {
          assert.equal((await ops.bloquear(S.lector.uid, aBloquear.version_id)).resultado, "bloqueado");
          const s = await S.admin.sb.rpc("comunidad_admin_suspender", { p_participante: aSuspender.a.part, p_motivo: MOTIVO, p_id_intento: randomUUID() });
          assert.equal(s.data?.resultado, "aplicada");
          cambiados.add("20");
        }
      },
    });
    assert.deepEqual([...cambiados], ["1", "20"]);
    assert.equal(new Set(ids).size, ids.length, "se repitió una reseña");
    for (const [nombre, x] of [["retirada", aRetirar], ["borrada", aBorrar]]) assert.equal(ids.includes(x.resena_id), false, `reapareció la ${nombre}`);
    assert.equal(ids.includes(aEditarVista.resena_id), true, "la editada ya vista quedó (una vez)");
    assert.equal(ids.filter((x) => x === aEditarFutura.resena_id).length, 1, "la editada futura aparece UNA vez");
    // Bloqueada y suspendida estaban más allá de la página 20 (posiciones 120 y 150): ya no aparecen.
    assert.equal(ids.includes(aBloquear.resena_id), false, "el bloqueado siguió apareciendo");
    assert.equal(ids.includes(aSuspender.resena_id), false, "el suspendido siguió apareciendo");
    // Nada visible se salteó: lo que se vio = lo que se ve ahora + lo que dejó de verse después de mostrarse.
    const ahora = esperadoSql(S.T, S.lector.part);
    const faltan = ahora.filter((x) => !ids.includes(x));
    assert.deepEqual(faltan, [], `salteó ${faltan.length}`);
    const sobran = ids.filter((x) => !ahora.includes(x));
    assert.deepEqual(sobran, [], "sólo puede sobrar lo que dejó de verse ANTES de mostrarse; acá nada se ocultó ya mostrado");
    // La editada futura llegó con el texto nuevo (la versión vigente).
    const p = await recorrer(S.sbLector, S.T, { limite: 20 });
    assert.equal(p.ids.includes(aEditarFutura.resena_id), true);
    console.log(`     recorrido con cambios: ${ids.length} reseñas, 0 repetidas, 0 salteadas`);
  });

  await prueba("levantar la suspensión vuelve a mostrar sus reseñas; desbloquear también", async () => {
    const r = await S.admin.sb.rpc("comunidad_admin_levantar_suspension", { p_participante: S.ocultas.suspendida.a.part, p_motivo: MOTIVO, p_id_intento: randomUUID() });
    assert.equal(r.data?.resultado, "aplicada", JSON.stringify(r.data));
    const ids = (await recorrer(S.sbLector, S.T, { limite: 20 })).ids;
    assert.equal(ids.includes(S.ocultas.suspendida.resena_id), true);
    const b = await ops.bloqueados(S.lector.uid);
    for (const x of b.bloqueados) assert.equal((await ops.desbloquear(S.lector.uid, x.bloqueo_id)).resultado, "desbloqueado");
    assert.equal((await recorrer(S.sbLector, S.T, { limite: 20 })).ids.includes(S.ocultas.bloqueada.resena_id), true);
  });

  // =========================================================================
  console.log("\n— Contrato de la función —");
  await prueba("pedidos inválidos: orden desconocido, cursor del otro orden, cursor mal formado y título inválido → 22023 sin datos; el límite se acota a 1–20", async () => {
    const mal = async (args) => {
      const { data, error } = await S.sbLector.rpc("comunidad_resenas", { p_tipo: "movie", p_tmdb_id: S.T, p_orden: "recientes", p_cursor: null, p_limite: 5, ...args });
      assert.equal(data, null);
      assert.equal(error?.code, "22023", JSON.stringify(error));
    };
    // E5b habilitó "utiles": lo inválido ahora es un orden desconocido y un cursor del otro orden.
    await mal({ p_orden: "otro" });
    await mal({ p_orden: "utiles", p_cursor: { t: "2026-10-26T00:00:00Z", id: 1 } });
    await mal({ p_cursor: { t: "no es fecha", id: 1 } });
    await mal({ p_cursor: { t: "2026-10-26T00:00:00Z" } });
    await mal({ p_tipo: "serie" });
    await mal({ p_tmdb_id: 0 });
    assert.equal((await pagina(S.sbLector, S.T, null, 500)).items.length, 20);
    assert.equal((await pagina(S.sbLector, S.T, null, 0)).items.length, 1);
  });

  await prueba("un título sin reseñas: lista vacía, total 0, sin cursor; con el módulo APAGADO, {activo:false} y nada más", async () => {
    const vacio = await pagina(S.sbLector, tmdb++);
    assert.deepEqual([vacio.items, vacio.total, vacio.hay_mas, vacio.cursor, vacio.mia], [[], 0, false, null, null]);
    config({ modulo_activo: false });
    try {
      assert.deepEqual(await pagina(S.sbLector, S.T), { activo: false });
      const r = await fetch(`${URL_API}/rest/v1/rpc/comunidad_resenas`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_tipo: "movie", p_tmdb_id: S.T, p_orden: "recientes", p_cursor: null, p_limite: 5 }) });
      assert.ok(r.status === 401 || r.status === 403);
    } finally {
      config({ modulo_activo: true });
    }
  });

  // =========================================================================
  console.log("\n— La ruta /api/comunidad/resenas/lista (servidor local) —");
  await prueba("ruta: sin token o con uno inválido 401 con SÓLO {resultado, activo}; con sesión 200 privado y sin caché; inválido 400; el cursor de la ruta recorre lo mismo", async () => {
    const vivo = await fetch(`${BASE}/api/comunidad/resenas/lista`).catch(() => null);
    if (!vivo) throw new Error(`NO CORRIDA: no hay servidor en ${BASE}`);
    const url = (extra = "") => `${BASE}/api/comunidad/resenas/lista?tipo=movie&id=${S.T}&orden=recientes${extra}`;
    for (const h of [{}, { Authorization: "Bearer no-es-un-token" }, { Authorization: `Bearer ${ANON}` }]) {
      const r = await fetch(url(), { headers: h });
      const j = await r.json();
      assert.equal(r.status, 401);
      assert.deepEqual(Object.keys(j).sort(), ["activo", "resultado"]);
      assert.deepEqual(j, { resultado: "sin_sesion", activo: true });
      assert.match(r.headers.get("cache-control") ?? "", /private/);
    }
    const auth = { Authorization: `Bearer ${S.jwtLector}` };
    const r = await fetch(url(), { headers: auth });
    assert.equal(r.status, 200);
    assert.match(r.headers.get("cache-control") ?? "", /private, no-store/);
    const ids = [];
    let j = await r.json();
    for (;;) {
      ids.push(...j.items.map((x) => x.resena_id));
      if (!j.hay_mas) break;
      const s = await fetch(url(`&cursor=${encodeURIComponent(j.cursor)}`), { headers: auth });
      assert.equal(s.status, 200);
      j = await s.json();
    }
    assert.deepEqual(ids, esperadoSql(S.T, S.lector.part));
    for (const q2 of ["tipo=x&id=1", "tipo=movie&id=1&orden=otro", "tipo=movie&id=1&cursor=basura"]) {
      const m = await fetch(`${BASE}/api/comunidad/resenas/lista?${q2}`, { headers: auth });
      assert.equal(m.status, 400, q2);
    }
    // Con el módulo apagado, la invitación no se muestra: activo:false.
    config({ modulo_activo: false });
    try {
      assert.deepEqual(await (await fetch(url())).json(), { resultado: "sin_sesion", activo: false });
    } finally {
      config({ modulo_activo: true });
    }
  });
} finally {
  // =========================================================================
  console.log("\n— Limpieza (base compartida): sólo lo de esta corrida —");
  try {
    const prev = configPrevia;
    config({ modulo_activo: prev.modulo_activo, publicacion_activa: prev.publicacion_activa, top_yumpers_activo: prev.top_yumpers_activo,
      muestreo_activo: prev.muestreo_activo ?? false });
    const us = [...cuentas];
    const todos = [...participantes].map(q).join(",");
    if (us.length) sqlOk(`delete from comunidad.decisiones where admin_id in (${us.map(q).join(",")})${todos ? ` or participante_id in (${todos})` : ""}`);
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
      || '|' || (select count(*) from pg_locks where locktype = 'advisory')
      || '|' || (select (modulo_activo or publicacion_activa or top_yumpers_activo or muestreo_activo)::text from comunidad.config)`);
    console.log(`   cuentas: ${cuentas.size}; restos (cuentas|participantes|decisiones|locks|interruptores): ${restos}`);
  } catch (e) {
    console.error("   ⚠️ la limpieza falló:", e.message);
    process.exitCode = 1;
  }
}
cerrar();
