#!/usr/bin/env node
// E5b: "Más útiles" con las FUNCIONES REALES de 018 contra `supabase start`.
// SÓLO LOCAL.
//
// Uso:
//   node scripts/sala/db-local.mjs            (o 018 aplicada)
//   node --env-file=.env.comunidad-local scripts/comunidad/pruebas-utiles.mjs
//
// Qué es real: `comunidad_resenas` (orden congelado, Wilson, 50 posiciones,
// vencimiento) leída con la sesión REAL de cada lector por PostgREST y por el
// adaptador de la ruta (lib/comunidad/lectura.ts); los votos con la función de
// producto (`comunidad_votar`); retiro y suspensión con un admin de dos TOTP
// reales; bloqueo, borrado y edición con las funciones de producto; el núcleo
// de la lista (lib/comunidad/lista-nucleo.ts) aplicado a las respuestas
// reales.
// Qué es fixture: (1) las reseñas SINTÉTICAS de los conjuntos grandes se
// insertan por SQL como postgres (participantes sin cuenta, reseñas,
// versiones publicadas y votos), porque crear cientos de cuentas reales no
// agrega nada a lo que se prueba (el orden y la lectura); (2) el paso del
// tiempo (10 minutos, 2 horas) se simula moviendo `creado_en`/`vence_en` del
// orden; (3) "muchas ocultas" se arma pasando versiones a `oculta` por SQL
// (transición válida), después de generar el orden. Cada caso lo dice.
//
// Resultados esperados escritos en cada prueba ANTES de correrla. Cuentas
// ficticias `@comunidad.test`; al final se borran ellas, los participantes
// sintéticos y lo que crearon. Configuración e interruptores vuelven a como
// estaban. Termina con 1 si algo falla.
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { arnes, contenedor, sqlOk, urlLocal } from "./local.mjs";
import { dependenciasEscritura, operacionesComunidad, sha256 } from "../../lib/comunidad/escritura-deps.ts";
import { normalizarTexto } from "../../lib/comunidad/texto.ts";
import { huella, secretoDuplicados } from "../../lib/comunidad/duplicados.ts";
import { TERMINOS_VERSION } from "../../lib/comunidad/terminos.ts";
import { decodificarCursor, leerResenas, pedidoLectura } from "../../lib/comunidad/lectura.ts";
import { compararUtiles } from "../../lib/comunidad/wilson.ts";
import {
  alLlegarMas, alLlegarReinicio, claveLista, conPrimeraPagina, listaVacia, pedirMas, pedirReinicio, puedeReiniciar, tandaValida,
} from "../../lib/comunidad/lista-nucleo.ts";

const URL_API = urlLocal(process.env.NEXT_PUBLIC_SUPABASE_URL);
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SRV = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!ANON || !SRV) { console.error("Faltan claves (¿--env-file=.env.comunidad-local?)"); process.exit(2); }
const SECRETO = secretoDuplicados();
if (!SECRETO?.startsWith("local-prueba-")) { console.error("Falta el secreto HMAC LOCAL de prueba"); process.exit(2); }
console.log(`base: ${contenedor()} · API ${URL_API}\n`);
if (sqlOk("select count(*) from pg_proc where proname = 'orden_utiles'") !== "1") { console.error("Falta 018_comunidad_utilidad.sql"); process.exit(2); }

const opc = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const srv = createClient(URL_API, SRV, opc);
const deps = dependenciasEscritura(srv);
const ops = operacionesComunidad(srv);
const SOLO = process.env.SOLO ?? "";
const { prueba: pruebaArnes, cerrar } = arnes();
const prueba = (n, fn) => (!SOLO || n.includes(SOLO) || n.startsWith("preparación") ? pruebaArnes(n, fn) : Promise.resolve());
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const q = (v) => { if (!UUID.test(v)) throw new Error(`uuid inesperado: ${v}`); return `'${v}'`; };
const MOTIVO = "Motivo de prueba local (E5b).";
const RUN = `e5b-${Date.now()}-${randomBytes(3).toString("hex")}`;
let tmdb = 9_700_000 + Math.floor(Math.random() * 10_000) * 10;
const titulos = [];
const nuevoTitulo = () => { const t = tmdb++; titulos.push(t); return t; };

// [positivos, total] → Wilson calculado APARTE con Python 3 (`math.sqrt`), no con este código.
const W = new Map([
  ["0/0", 0.0], ["0/1", 0.0], ["1/1", 0.20654329147389294], ["1/2", 0.09452865480086611], ["2/2", 0.3423719528896193],
  ["3/4", 0.30063605244263664], ["5/10", 0.2365895936154873], ["9/10", 0.5958436145024278], ["10/10", 0.7224598312333834],
  ["50/100", 0.40382982859014716], ["90/100", 0.8256326956323347], ["285/481", 0.548038148888899], ["1/3", 0.061490315276160515],
  ["2/6", 0.09676933255921684], ["100/100", 0.963005192523998], ["0/50", 0.0], ["2/4", 0.15003570882017145], ["0/3", 0.0],
]);

// ---------------------------------------------------------------------------
// Cuentas, sesiones y reseñas reales
// ---------------------------------------------------------------------------
const cuentas = new Set(), participantes = new Set();
async function cuenta(et, { terminos = true } = {}) {
  const email = `util-${et}-${Date.now()}-${randomBytes(3).toString("hex")}@comunidad.test`;
  const password = `Pa-${randomBytes(15).toString("base64url")}`;
  const { data, error } = await srv.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  cuentas.add(data.user.id);
  const c = { uid: data.user.id, email, password };
  if (terminos) {
    assert.equal((await ops.aceptarTerminos(c.uid, TERMINOS_VERSION)).resultado, "terminos_aceptados");
    c.part = sqlOk(`select id from comunidad.participantes where user_id = ${q(c.uid)}`);
    participantes.add(c.part);
  }
  return c;
}
async function sesion(c) {
  const cli = createClient(URL_API, ANON, opc);
  const { data, error } = await cli.auth.signInWithPassword({ email: c.email, password: c.password });
  if (error) throw error;
  c.jwt = data.session.access_token;
  c.sb = createClient(URL_API, ANON, { ...opc, global: { headers: { Authorization: `Bearer ${c.jwt}` } } });
  return c;
}
const ORD = ["primera", "segunda", "tercera", "cuarta", "quinta", "sexta", "séptima", "octava", "novena", "décima"];
let nTexto = 0;
const texto = () => `Reseña ficticia ${ORD[nTexto % 10]} de la serie ${Math.floor(nTexto++ / 10)} para la prueba del orden por utilidad. La fotografía es preciosa y el guion se toma su tiempo.`;
const decision = (t) => ({ resultado: "publicar", version_reglas: "prueba-e5b", reglas: [], huella: huella(normalizarTexto(t), SECRETO) });
async function publicar(c, tmdbId) {
  const t = texto();
  const r = await deps.publicar({ uid: c.uid, tipo: "movie", tmdbId, texto: t, decision: decision(t), idIntento: randomUUID(), hash: sha256(t) });
  assert.equal(r.resultado, "publicada", JSON.stringify(r));
  return r;
}
async function editar(c, resenaId, versionEsperada) {
  const t = texto();
  return deps.editar({ uid: c.uid, resenaId, versionEsperada, texto: t, decision: decision(t), idIntento: randomUUID(), hash: sha256(t) });
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

// ---------------------------------------------------------------------------
// Reseñas SINTÉTICAS (fixture): participantes sin cuenta con ids derivados de
// RUN (para borrarlos exactos), reseñas publicadas y votos variados.
// ---------------------------------------------------------------------------
function sinteticas(tmdbId, n, { votantes = 30, maxVotos = 12, desde = 0 } = {}) {
  sqlOk(`begin;
    insert into comunidad.participantes (id)
      select md5('${RUN}-a-' || g)::uuid from generate_series(${desde + 1}, ${desde + n}) g on conflict do nothing;
    insert into comunidad.participantes (id)
      select md5('${RUN}-v-' || g)::uuid from generate_series(1, ${votantes}) g on conflict do nothing;
    insert into comunidad.resenas (autor_participante, tipo, tmdb_id, primera_publicacion_en)
      select md5('${RUN}-a-' || g)::uuid, 'movie', ${tmdbId}, clock_timestamp() - (g || ' seconds')::interval
        from generate_series(${desde + 1}, ${desde + n}) g;
    insert into comunidad.versiones (resena_id, autor_participante, texto, estado, version_reglas, id_intento)
      select r.id, r.autor_participante,
             'Reseña sintética número ' || r.id || ' para medir el orden por utilidad de la comunidad; no es contenido real ni de nadie.',
             'publicada', 'sintetica-e5b', gen_random_uuid()
        from comunidad.resenas r where r.tipo = 'movie' and r.tmdb_id = ${tmdbId} and r.version_vigente_id is null
         and r.autor_participante in (select md5('${RUN}-a-' || g)::uuid from generate_series(${desde + 1}, ${desde + n}) g);
    update comunidad.resenas r set version_vigente_id = v.id
      from comunidad.versiones v where v.resena_id = r.id and r.tipo = 'movie' and r.tmdb_id = ${tmdbId} and r.version_vigente_id is null;
    insert into comunidad.evaluaciones (version_id, autor_participante, evaluador_participante, util)
      select v.id, v.autor_participante, md5('${RUN}-v-' || j)::uuid, (abs(hashtext(v.id || ':' || j)) % 3) > 0
        from comunidad.resenas r join comunidad.versiones v on v.id = r.version_vigente_id
        cross join lateral generate_series(1, abs(hashtext(v.id::text)) % ${maxVotos + 1}) j
       where r.tipo = 'movie' and r.tmdb_id = ${tmdbId} and v.version_reglas = 'sintetica-e5b' and j <= ${votantes};
    commit;`);
}

/** El orden esperado del título, calculado APARTE: datos de la base y comparación en JS (Wilson + desempates). */
function ordenEsperado(tmdbId) {
  const filas = sqlOk(`select r.id || '|' || (select count(*) filter (where e.util) from comunidad.evaluaciones e where e.version_id = v.id and e.retirada_en is null)
      || '|' || (select count(*) from comunidad.evaluaciones e where e.version_id = v.id and e.retirada_en is null)
      || '|' || (extract(epoch from r.primera_publicacion_en) * 1000000)::bigint
    from comunidad.resenas r join comunidad.versiones v on v.id = r.version_vigente_id
   where r.tipo = 'movie' and r.tmdb_id = ${tmdbId} and r.borrada_en is null and r.primera_publicacion_en is not null and v.estado = 'publicada'`)
    .split("\n").filter(Boolean).map((l) => { const [id, p, t, pub] = l.split("|").map(Number); return { id, positivos: p, total: t, publicada: pub }; });
  return filas.sort(compararUtiles).map((x) => x.id);
}
/** Los ids del orden congelado, en orden. */
const idsDelOrden = (o) => sqlOk(`select coalesce(string_agg(x::text, ',' order by t.tramo_no, u.ord), '')
  from comunidad.ordenes_utiles_tramos t cross join lateral unnest(t.ids) with ordinality u(x, ord) where t.orden_id = ${Number(o)}`)
  .split(",").filter(Boolean).map(Number);
const ordenesDe = (tmdbId) => Number(sqlOk(`select count(*) from comunidad.ordenes_utiles where tipo = 'movie' and tmdb_id = ${tmdbId}`));

/** Una página por el ADAPTADOR de la ruta (cursor opaco), con la sesión del lector. */
async function pagina(c, tmdbId, cursor = null, orden = "utiles") {
  const p = pedidoLectura(new URLSearchParams(`tipo=movie&id=${tmdbId}&orden=${orden}${cursor ? `&cursor=${cursor}` : ""}`));
  assert.ok(!("invalido" in p), JSON.stringify(p));
  const r = await leerResenas(c.sb, p);
  assert.equal(r.resultado, undefined, JSON.stringify(r).slice(0, 200));
  return r;
}
/** Recorre "Más útiles" entero. `entrePaginas(n)` corre después de la página n. */
async function recorrer(c, tmdbId, { entrePaginas } = {}) {
  const ids = [], avances = [], tandas = [];
  let cursor = null, n = 0, orden = null, desde = 0;
  for (;;) {
    const r = await pagina(c, tmdbId, cursor);
    n++;
    if (r.orden_actualizado) return { ids, avances, tandas, orden, vencido: true, paginas: n };
    ids.push(...r.items.map((x) => x.resena_id));
    tandas.push(r.items.length);
    if (!r.hay_mas) { assert.equal(r.cursor, null); break; }
    const cur = decodificarCursor(r.cursor);
    orden ??= cur.o;
    assert.equal(cur.o, orden, "la paginación no cambia de orden");
    avances.push(cur.p - desde);
    desde = cur.p;
    cursor = r.cursor;
    if (entrePaginas) await entrePaginas(n, ids);
    if (n > 3000) throw new Error("demasiadas páginas");
  }
  return { ids, avances, tandas, orden, vencido: false, paginas: n };
}

const config = (cols) => sqlOk(`update comunidad.config set ${Object.entries(cols).map(([k, v]) => `${k} = ${v}`).join(", ")} where id`);
const configPrevia = JSON.parse(sqlOk("select row_to_json(c)::text from comunidad.config c"));
const S = {};

config({ modulo_activo: true, publicacion_activa: true });
try {
  console.log("— Preparación —");
  await prueba("preparación: lector, otro lector y un admin con dos TOTP reales", async () => {
    S.lector = await sesion(await cuenta("lector"));
    S.otro = await sesion(await cuenta("otro"));
    S.admin = await adminAal2();
  });

  // =========================================================================
  console.log("\n— Wilson y desempates —");
  await prueba("Wilson en la base = valores calculados aparte (Python) en 18 casos, |error| < 1e-12; sin votos, 0", () => {
    const mal = [];
    for (const [k, e] of W) {
      const [p, n] = k.split("/").map(Number);
      const v = Number(sqlOk(`select comunidad.wilson(${p}, ${n})::text`));
      if (!(Math.abs(v - e) < 1e-12)) mal.push(`${k}: ${v} ≠ ${e}`);
    }
    assert.deepEqual(mal, []);
  });

  await prueba("Wilson de la base = lib/comunidad/wilson.ts BIT A BIT en los 1890 pares con total ≤ 60; con 0 positivos, exactamente 0 (antes de la corrección, 0/1 daba ~4.6e-17)", async () => {
    const { wilson } = await import("../../lib/comunidad/wilson.ts");
    const filas = sqlOk(`set extra_float_digits = 3; select n || '|' || p || '|' || comunidad.wilson(p, n)::text
      from generate_series(1, 60) n, generate_series(0, 60) p where p <= n`).split("\n").filter((l) => l.includes("|"));
    assert.equal(filas.length, 1890);
    const mal = filas.filter((f) => { const [n, p, v] = f.split("|").map(Number); return v !== wilson(p, n) || (p === 0 && v !== 0); });
    assert.deepEqual(mal.slice(0, 5), []);
  });

  await prueba("orden real con votos REALES: 9/10, 1/1, 2/4, empate 1/2 ×3 (fecha desc y, con la misma fecha, id desc), 0/3 y 0/0 (fecha desc)", async () => {
    const T = nuevoTitulo();
    const votantes = [];
    for (let i = 0; i < 10; i++) votantes.push(await cuenta(`vt${i}`));
    const autores = [];
    for (let i = 0; i < 8; i++) autores.push(await cuenta(`ra${i}`));
    // Publicadas en este orden: r0 (la más vieja) … r7 (la más nueva).
    const r = [];
    for (const a of autores) r.push(await publicar(a, T));
    const votar = async (ri, positivos, negativos) => {
      for (let i = 0; i < positivos; i++) assert.equal((await ops.votar(votantes[i].uid, r[ri].version_id, true)).resultado, "voto_registrado");
      for (let i = positivos; i < positivos + negativos; i++) assert.equal((await ops.votar(votantes[i].uid, r[ri].version_id, false)).resultado, "voto_registrado");
    };
    await votar(1, 1, 0);   // 1/1
    await votar(2, 1, 1);   // 1/2
    await votar(3, 2, 2);   // 2/4
    await votar(4, 9, 1);   // 9/10
    await votar(5, 1, 1);   // 1/2
    await votar(6, 0, 3);   // 0/3
    await votar(7, 1, 1);   // 1/2
    // r7 con la MISMA primera publicación que r5 (fixture de tiempo): desempata el id (r7 > r5).
    sqlOk(`update comunidad.resenas set primera_publicacion_en = (select primera_publicacion_en from comunidad.resenas where id = ${r[5].resena_id}) where id = ${r[7].resena_id}`);
    // Esperado a mano, con la tabla W: 9/10 (0.596) > 1/1 (0.207) > 2/4 (0.150) > 1/2 (0.0945: r7, r5 por id con igual fecha; después r2, más vieja)
    // > 0/3 y 0/0 (0): r6 (más nueva) antes que r0.
    const esperado = [4, 1, 3, 7, 5, 2, 6, 0].map((i) => r[i].resena_id);
    assert.ok(W.get("9/10") > W.get("1/1") && W.get("1/1") > W.get("2/4") && W.get("2/4") > W.get("1/2") && W.get("1/2") > W.get("0/3"));
    assert.deepEqual(ordenEsperado(T), esperado, "la comparación en JS coincide con lo esperado a mano");
    const { ids } = await recorrer(S.lector, T);
    assert.deepEqual(ids, esperado);
    S.T_votos = { T, r, votantes };
  });

  // =========================================================================
  console.log("\n— Un orden por título —");
  await prueba("20 lectores CONCURRENTES (sesiones reales, PostgREST) piden la primera página de un título sin orden → UN solo orden generado, el mismo para los 20", async () => {
    const T = nuevoTitulo();
    sinteticas(T, 60);
    const lectores = [];
    for (let i = 0; i < 20; i += 5) lectores.push(...await Promise.all(Array.from({ length: 5 }, async (_, k) => sesion(await cuenta(`conc${i + k}`)))));
    assert.equal(ordenesDe(T), 0);
    const rs = await Promise.all(lectores.map((c) => pagina(c, T)));
    const os = new Set(rs.map((x) => decodificarCursor(x.cursor).o));
    assert.equal(os.size, 1, `órdenes distintos en las respuestas: ${[...os]}`);
    assert.equal(ordenesDe(T), 1, "un solo orden en la tabla");
    assert.deepEqual(new Set(rs.map((x) => JSON.stringify(x.items.map((i) => i.resena_id)))).size, 1, "la misma primera página para todos");
    console.log(`     20 lectores → 1 orden (${[...os][0]})`);
  });

  await prueba("reutilización y vigencia (tiempo simulado): < 10 min se reutiliza; > 10 min se genera otro y el anterior sigue valiendo hasta vencer; al generar se borran los VENCIDOS del título", async () => {
    const T = nuevoTitulo();
    sinteticas(T, 12, { desde: 1000 });
    const o1 = decodificarCursor((await pagina(S.lector, T)).cursor).o;
    assert.equal(decodificarCursor((await pagina(S.otro, T)).cursor).o, o1, "reutilizado");
    sqlOk(`update comunidad.ordenes_utiles set creado_en = creado_en - interval '11 minutes' where id = ${o1}`);
    const o2 = decodificarCursor((await pagina(S.lector, T)).cursor).o;
    assert.notEqual(o2, o1);
    assert.equal(ordenesDe(T), 2, "el anterior todavía vigente queda");
    // El viejo vence (2 h) y el nuevo también envejece: el próximo borra el vencido.
    sqlOk(`update comunidad.ordenes_utiles set creado_en = creado_en - interval '3 hours', vence_en = now() - interval '1 minute' where id = ${o1}`);
    sqlOk(`update comunidad.ordenes_utiles set creado_en = creado_en - interval '11 minutes' where id = ${o2}`);
    const o3 = decodificarCursor((await pagina(S.lector, T)).cursor).o;
    assert.ok(o3 !== o1 && o3 !== o2);
    assert.equal(sqlOk(`select coalesce(string_agg(id::text, ',' order by id), '') from comunidad.ordenes_utiles where tipo = 'movie' and tmdb_id = ${T}`), `${o2},${o3}`);
    assert.equal(sqlOk(`select count(*) from comunidad.ordenes_utiles_tramos where orden_id = ${o1}`), "0", "sus filas de ids también");
    assert.equal(sqlOk(`select (vence_en - creado_en)::text from comunidad.ordenes_utiles where id = ${o3}`), "02:00:00");
  });

  // =========================================================================
  console.log("\n— Recorrido y revalidación —");
  await prueba("conjunto estable de 237 reseñas: el recorrido de a 5 sigue EXACTAMENTE el orden (Wilson + desempates), sin duplicar ni saltear; filas de 100 ids", async () => {
    const T = nuevoTitulo();
    sinteticas(T, 237, { desde: 2000 });
    const esperado = ordenEsperado(T);
    const { ids, orden, tandas } = await recorrer(S.lector, T);
    assert.equal(ids.length, 237);
    assert.equal(new Set(ids).size, 237);
    assert.deepEqual(ids, esperado);
    assert.deepEqual(idsDelOrden(orden), esperado, "el orden guardado es el esperado");
    assert.equal(sqlOk(`select string_agg(cardinality(ids)::text, ',' order by tramo_no) from comunidad.ordenes_utiles_tramos where orden_id = ${orden}`), "100,100,37");
    assert.ok(tandas.every((n) => n === 5 || n === tandas.at(-1)));
    S.T_estable = T;
  });

  await prueba("cambios ENTRE páginas (funciones reales): retiro, suspensión, bloqueo, borrado y edición. Lo oculto no reaparece, lo editado sale una vez, nada visible se saltea", async () => {
    const T = nuevoTitulo();
    sinteticas(T, 40, { desde: 3000 });
    const reales = [];
    for (let i = 0; i < 6; i++) { const a = await cuenta(`cb${i}`); reales.push({ a, ...(await publicar(a, T)) }); }
    // El orden se fija con la primera página; lo que se toca está más adelante.
    const p1 = await pagina(S.lector, T);
    const o = decodificarCursor(p1.cursor).o;
    const orden = idsDelOrden(o);
    const pos = (resenaId) => orden.indexOf(resenaId);
    const sint = (k) => sqlOk(`select r.id || '|' || r.version_vigente_id || '|' || r.autor_participante from comunidad.resenas r where r.tipo = 'movie' and r.tmdb_id = ${T} and r.id = ${orden[k]}`).split("|");
    const [retId, retVer] = sint(12), [bloId, bloVer] = sint(28);
    // Suspender, borrar y editar exigen la cuenta del autor: se usan autores REALES que estén después de la primera página.
    const tarde = reales.filter((x) => pos(x.resena_id) >= 5);
    assert.ok(tarde.length >= 3, "al menos tres reseñas reales después de la primera página");
    const [aBorrar, aEditar, aSuspender] = tarde;
    const susId = String(aSuspender.resena_id), susPart = aSuspender.a.part;
    const cambios = async () => {
      assert.equal((await S.admin.sb.rpc("comunidad_admin_decidir", { p_accion: "retirar", p_version: Number(retVer), p_motivo: MOTIVO, p_id_intento: randomUUID() })).data?.resultado, "aplicada");
      assert.equal((await S.admin.sb.rpc("comunidad_admin_suspender", { p_participante: susPart, p_motivo: MOTIVO, p_id_intento: randomUUID() })).data?.resultado, "aplicada");
      assert.equal((await ops.bloquear(S.lector.uid, Number(bloVer))).resultado, "bloqueado");
      assert.equal((await ops.borrar(aBorrar.a.uid, aBorrar.resena_id)).resultado, "borrada");
      const e = await editar(aEditar.a, aEditar.resena_id, aEditar.version_id);
      assert.equal(e.resultado, "publicada", JSON.stringify(e));
    };
    await cambios();
    const ids = [...p1.items.map((x) => x.resena_id)];
    let cursor = p1.cursor;
    while (cursor) {
      const r = await pagina(S.lector, T, cursor);
      ids.push(...r.items.map((x) => x.resena_id));
      cursor = r.cursor;
    }
    assert.equal(new Set(ids).size, ids.length, "repitió");
    for (const x of [Number(retId), Number(susId), Number(bloId), aBorrar.resena_id]) assert.equal(ids.includes(x), false, `reapareció ${x}`);
    assert.equal(ids.filter((x) => x === aEditar.resena_id).length, 1, "la editada, una vez");
    const ocultas = new Set([Number(retId), Number(susId), Number(bloId), aBorrar.resena_id]);
    assert.deepEqual(ids, orden.filter((x) => !ocultas.has(x)), "lo visible, en el orden congelado, sin saltear");
    // Otro lector (no bloqueó) sí ve la del bloqueado; nadie ve la del suspendido.
    const delOtro = (await recorrer(S.otro, T)).ids;
    assert.equal(delOtro.includes(Number(bloId)), true);
    assert.equal(delOtro.includes(Number(susId)), false);
    S.levantar = susPart;
  });

  await prueba("página con MUCHAS ocultas (fixture: 120 versiones pasadas a oculta después de generar el orden): devuelve menos o ninguna, el cursor avanza exactamente 50 y nunca revisa más de 50", async () => {
    const T = nuevoTitulo();
    sinteticas(T, 150, { desde: 4000 });
    const p1 = await pagina(S.lector, T);
    const o = decodificarCursor(p1.cursor).o;
    const orden = idsDelOrden(o);
    // Posiciones 5..124 → ocultas.
    sqlOk(`update comunidad.versiones v set estado = 'oculta' from comunidad.resenas r
            where r.version_vigente_id = v.id and r.id in (${orden.slice(5, 125).join(",")})`);
    const tandas = [p1.items.length], avances = [decodificarCursor(p1.cursor).p];
    let cursor = p1.cursor, desde = decodificarCursor(p1.cursor).p;
    const ids = [...p1.items.map((x) => x.resena_id)];
    while (cursor) {
      const r = await pagina(S.lector, T, cursor);
      tandas.push(r.items.length);
      ids.push(...r.items.map((x) => x.resena_id));
      if (r.cursor) { const p = decodificarCursor(r.cursor).p; avances.push(p - desde); desde = p; }
      cursor = r.cursor;
    }
    console.log(`     tandas ${JSON.stringify(tandas)} · avances del cursor ${JSON.stringify(avances)}`);
    assert.deepEqual(tandas.slice(0, 4), [5, 0, 0, 5], "5 visibles; 50 ocultas; 50 ocultas; empiezan las visibles (125…)");
    assert.deepEqual(avances.slice(0, 3), [5, 50, 50]);
    assert.ok(avances.every((a) => a >= 1 && a <= 50), "nunca más de 50 posiciones por página");
    assert.deepEqual(ids, [...orden.slice(0, 5), ...orden.slice(125)]);
  });

  // =========================================================================
  console.log("\n— Vencimiento —");
  await prueba("vencimiento a mitad de lectura (tiempo simulado): `orden_actualizado` sin reseñas; UN reinicio con el núcleo real agrega sin repetir y llega al final; un segundo vencimiento ya no ofrece otro", async () => {
    const T = S.T_estable;
    const clave = claveLista(S.lector.uid, "movie", T, "utiles");
    const primera = await pagina(S.lector, T);
    let e = conPrimeraPagina(listaVacia(clave), tandaValida(primera, "utiles"));
    for (let i = 0; i < 3; i++) {
      const p = pedirMas(e);
      e = alLlegarMas(p.estado, p.pedido.n, p.pedido.clave, tandaValida(await pagina(S.lector, T, p.pedido.cursor), "utiles"));
    }
    assert.equal(e.items.length, 20);
    const o1 = decodificarCursor(e.cursor).o;
    sqlOk(`update comunidad.ordenes_utiles set creado_en = creado_en - interval '3 hours', vence_en = now() - interval '1 second' where id = ${o1}`);
    let p = pedirMas(e);
    const vencida = await pagina(S.lector, T, p.pedido.cursor);
    assert.deepEqual([vencida.orden_actualizado, vencida.items.length, vencida.hay_mas, vencida.cursor], [true, 0, false, null]);
    e = alLlegarMas(p.estado, p.pedido.n, p.pedido.clave, tandaValida(vencida, "utiles"));
    assert.deepEqual([e.vencido, e.items.length, puedeReiniciar(e)], [true, 20, true]);
    // Volver a empezar: orden nuevo (el vencido no se reutiliza), sin repetir lo visible.
    const r = pedirReinicio(e);
    const nueva = await pagina(S.lector, T);
    const o2 = decodificarCursor(nueva.cursor).o;
    assert.notEqual(o2, o1);
    e = alLlegarReinicio(r.estado, r.pedido.n, r.pedido.clave, tandaValida(nueva, "utiles"));
    while (e.hayMas) {
      p = pedirMas(e);
      e = alLlegarMas(p.estado, p.pedido.n, p.pedido.clave, tandaValida(await pagina(S.lector, T, p.pedido.cursor), "utiles"));
    }
    const ids = e.items.map((x) => x.resena_id);
    assert.equal(new Set(ids).size, ids.length, "repitió tras el reinicio");
    assert.equal(ids.length, 237, "llegó al final: todo lo visible, una vez");
    assert.deepEqual([e.reiniciado, e.vencido], [true, false]);
    // Un segundo vencimiento: aviso sin otro reinicio.
    const otra = conPrimeraPagina(listaVacia(clave), tandaValida(await pagina(S.lector, T), "utiles"));
    const conReinicio = { ...otra, reiniciado: true };
    sqlOk(`update comunidad.ordenes_utiles set vence_en = now() - interval '1 second', creado_en = creado_en - interval '3 hours' where id = ${decodificarCursor(otra.cursor).o}`);
    p = pedirMas(conReinicio);
    const e2 = alLlegarMas(p.estado, p.pedido.n, p.pedido.clave, tandaValida(await pagina(S.lector, T, p.pedido.cursor), "utiles"));
    assert.deepEqual([e2.vencido, puedeReiniciar(e2), pedirReinicio(e2)], [true, false, null]);
  });

  await prueba("un cursor de OTRO título o de un orden borrado responde orden_actualizado, nunca mezcla; un cursor de «Más útiles» en «Recientes» es inválido", async () => {
    const otroT = nuevoTitulo();
    sinteticas(otroT, 8, { desde: 5000 });
    const o = decodificarCursor((await pagina(S.lector, S.T_estable)).cursor).o;
    const cursorAjeno = Buffer.from(JSON.stringify({ o, p: 5 })).toString("base64url");
    const r = await pagina(S.lector, otroT, cursorAjeno);
    assert.deepEqual([r.orden_actualizado, r.items.length], [true, 0]);
    const { data, error } = await S.lector.sb.rpc("comunidad_resenas", { p_tipo: "movie", p_tmdb_id: otroT, p_orden: "recientes", p_cursor: { o, p: 5 }, p_limite: 5 });
    assert.equal(data, null);
    assert.equal(error?.code, "22023");
  });

  // =========================================================================
  console.log("\n— Votos dentro del orden congelado —");
  await prueba("votar dentro del orden congelado cambia el CONTEO que se lee, no el lugar; el orden siguiente (> 10 min, simulado) sí lo refleja", async () => {
    const { T, r, votantes } = S.T_votos;
    const antes = await pagina(S.lector, T);
    const o = decodificarCursor(antes.cursor).o;
    const ultimo = r[0]; // 0/0, último
    for (const v of votantes) assert.equal((await ops.votar(v.uid, ultimo.version_id, true)).resultado, "voto_registrado");
    // Mismo orden (< 10 min): el último sigue último, pero su conteo dice 10/10.
    const { ids, orden } = await recorrer(S.lector, T);
    assert.equal(orden, o);
    assert.equal(ids.at(-1), ultimo.resena_id);
    const pag2 = await pagina(S.lector, T, antes.cursor);
    const item = pag2.items.find((x) => x.resena_id === ultimo.resena_id);
    assert.deepEqual([item.utiles, item.total], [10, 10]);
    // Pasado el tiempo de reutilización, el orden nuevo lo sube primero (10/10 = 0.722 > 9/10 = 0.596).
    sqlOk(`update comunidad.ordenes_utiles set creado_en = creado_en - interval '11 minutes' where id = ${o}`);
    const nuevo = await recorrer(S.lector, T);
    assert.notEqual(nuevo.orden, o);
    assert.equal(nuevo.ids[0], ultimo.resena_id);
  });

  // =========================================================================
  console.log("\n— Permisos y privacidad —");
  await prueba("las tablas del orden: sin grants, RLS sin policies, sin columnas del lector; wilson y orden_utiles sin EXECUTE; anon y service_role no leen «Más útiles»", async () => {
    assert.equal(sqlOk(`select count(*) from information_schema.role_table_grants where table_schema = 'comunidad'
      and table_name in ('ordenes_utiles', 'ordenes_utiles_tramos') and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')`), "0");
    assert.equal(sqlOk(`select string_agg(relname || ':' || relrowsecurity, ',' order by relname) from pg_class
      where relnamespace = 'comunidad'::regnamespace and relname in ('ordenes_utiles', 'ordenes_utiles_tramos')`), "ordenes_utiles:true,ordenes_utiles_tramos:true");
    assert.equal(sqlOk(`select count(*) from pg_policies where schemaname = 'comunidad' and tablename like 'ordenes_utiles%'`), "0");
    assert.equal(sqlOk(`select string_agg(column_name, ',' order by table_name, ordinal_position) from information_schema.columns
      where table_schema = 'comunidad' and table_name in ('ordenes_utiles', 'ordenes_utiles_tramos')`), "id,tipo,tmdb_id,creado_en,vence_en,total,orden_id,tramo_no,ids");
    assert.equal(sqlOk(`select count(*) from pg_proc f, unnest(array['public','anon','authenticated','service_role']) r
      where f.pronamespace = 'comunidad'::regnamespace and f.proname in ('wilson', 'orden_utiles') and has_function_privilege(r, f.oid, 'EXECUTE')`), "0");
    for (const token of [ANON, SRV]) {
      const r = await fetch(`${URL_API}/rest/v1/rpc/comunidad_resenas`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_tipo: "movie", p_tmdb_id: S.T_estable, p_orden: "utiles", p_cursor: null, p_limite: 5 }) });
      const cuerpo = await r.text();
      assert.ok((r.status === 401 || r.status === 403) && /42501|permission denied/.test(cuerpo), `${r.status} ${cuerpo.slice(0, 100)}`);
    }
  });

  await prueba("«Recientes» no cambió: el mismo título recorre por fecha, sin tocar el orden congelado", async () => {
    const antes = ordenesDe(S.T_estable);
    const ids = [];
    let cursor = null;
    for (;;) {
      const r = await pagina(S.lector, S.T_estable, cursor, "recientes");
      ids.push(...r.items.map((x) => x.resena_id));
      if (!r.hay_mas) break;
      cursor = r.cursor;
    }
    const esperado = sqlOk(`select string_agg(r.id::text, ',' order by r.primera_publicacion_en desc, r.id desc) from comunidad.resenas r
      join comunidad.versiones v on v.id = r.version_vigente_id where r.tipo = 'movie' and r.tmdb_id = ${S.T_estable} and r.borrada_en is null and v.estado = 'publicada'`).split(",").map(Number);
    assert.deepEqual(ids, esperado);
    assert.equal(ordenesDe(S.T_estable), antes);
  });
} finally {
  console.log("\n— Limpieza (base compartida): sólo lo de esta corrida —");
  try {
    if (S.levantar) await S.admin.sb.rpc("comunidad_admin_levantar_suspension", { p_participante: S.levantar, p_motivo: MOTIVO, p_id_intento: randomUUID() });
    const prev = configPrevia;
    config({ modulo_activo: prev.modulo_activo, publicacion_activa: prev.publicacion_activa, top_yumpers_activo: prev.top_yumpers_activo, muestreo_activo: prev.muestreo_activo ?? false });
    const us = [...cuentas];
    // Participantes sintéticos de esta corrida: ids derivados de RUN.
    const sint = `select md5('${RUN}-a-' || g)::uuid from generate_series(1, 6000) g union all select md5('${RUN}-v-' || g)::uuid from generate_series(1, 30) g`;
    for (const id of sqlOk(`select id from comunidad.participantes where id in (${sint})`).split("\n").filter(Boolean)) participantes.add(id);
    const todos = [...participantes].map(q).join(",");
    if (us.length) sqlOk(`delete from comunidad.decisiones where admin_id in (${us.map(q).join(",")})${todos ? ` or participante_id in (${todos})` : ""}`);
    for (const u of us) await srv.auth.admin.deleteUser(u, false);
    sqlOk(`delete from comunidad.ordenes_utiles where tipo = 'movie' and tmdb_id in (${titulos.join(",") || "0"})`);
    if (todos) sqlOk(`begin;
      delete from comunidad.intentos where participante_id in (${todos});
      delete from comunidad.tramos where evaluador_participante in (${todos}) or autor_participante in (${todos});
      delete from comunidad.evaluaciones where evaluador_participante in (${todos}) or autor_participante in (${todos});
      delete from comunidad.denuncias where denunciante_participante in (${todos}) or autor_participante in (${todos});
      delete from comunidad.huellas where autor_participante in (${todos});
      delete from comunidad.resenas where autor_participante in (${todos});
      delete from comunidad.bloqueos where bloqueador_participante in (${todos}) or bloqueado_participante in (${todos});
      delete from comunidad.contadores where participante_id in (${todos});
      delete from comunidad.suspensiones where participante_id in (${todos});
      delete from comunidad.participantes where id in (${todos});
      commit;`);
    const restos = sqlOk(`select (select count(*) from auth.users where id in (${us.map(q).join(",") || "null::uuid"}))
      || '|' || (select count(*) from comunidad.participantes where id in (${todos || "null::uuid"}))
      || '|' || (select count(*) from comunidad.resenas where tipo = 'movie' and tmdb_id in (${titulos.join(",") || "0"}))
      || '|' || (select count(*) from comunidad.ordenes_utiles where tipo = 'movie' and tmdb_id in (${titulos.join(",") || "0"}))
      || '|' || (select count(*) from comunidad.decisiones)
      || '|' || (select count(*) from pg_locks where locktype = 'advisory')
      || '|' || (select (modulo_activo or publicacion_activa or top_yumpers_activo or muestreo_activo)::text from comunidad.config)`);
    console.log(`   cuentas: ${us.length}; restos (cuentas|participantes|reseñas|órdenes|decisiones|locks|interruptores): ${restos}`);
  } catch (e) {
    console.error("   ⚠️ la limpieza falló:", e.message);
    process.exitCode = 1;
  }
}
cerrar();
