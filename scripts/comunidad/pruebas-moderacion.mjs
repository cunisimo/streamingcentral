#!/usr/bin/env node
// E3b: admisión a la cola de retenidos, duplicados, denuncias, bloqueos y
// "Pedir revisión", con las FUNCIONES REALES de 015 contra `supabase start`.
// SÓLO LOCAL.
//
// Uso:
//   node scripts/sala/db-local.mjs
//   (servidor de la app con las claves locales en BASE, por defecto
//    http://localhost:3100, para la sección de rutas)
//   node --env-file=.env.comunidad-local scripts/comunidad/pruebas-moderacion.mjs
//
// Qué es real: las funciones `public.comunidad_*` de 014/015 (llamadas con la
// clave de servicio, como las rutas), los núcleos de las rutas
// (escritura-nucleo, moderacion-nucleo) con sus adaptadores reales
// (escritura-deps), las reglas de E1, la huella HMAC con el secreto LOCAL de
// prueba (`.env.comunidad-local`), el Auth local y la concurrencia real de
// PostgREST (pedidos simultáneos con Promise.all, cada uno su transacción).
//
// Los resultados esperados están escritos en cada prueba ANTES de correrla.
// Los límites se cambian SÓLO durante la prueba que los necesita y se
// restauran al valor previo al final, pase lo que pase (también los
// interruptores). Cuentas ficticias `@comunidad.test`; al final se borran
// ellas, sus participantes y todo lo que crearon. Termina con 1 si algo falla.
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { arnes, contenedor, psql, sqlOk, urlLocal, leerComo } from "./local.mjs";
import { dockerVerificado } from "./docker-local.mjs";
import { Sesion, barrera, cerrarSesiones, esperar, esperaLock, BARRERA } from "./sesiones.mjs";
import { escribirResena } from "../../lib/comunidad/escritura-nucleo.ts";
import { dependenciasEscritura, operacionesComunidad } from "../../lib/comunidad/escritura-deps.ts";
import { denunciarVersion } from "../../lib/comunidad/moderacion-nucleo.ts";
import { evaluarResena } from "../../lib/comunidad/reglas/decision.ts";
import { huella, palabras, secretoDuplicados } from "../../lib/comunidad/duplicados.ts";
import { normalizarTexto } from "../../lib/comunidad/texto.ts";
import { sha256 } from "../../lib/comunidad/escritura-deps.ts";
import { TERMINOS_VERSION } from "../../lib/comunidad/terminos.ts";

const URL_API = urlLocal(process.env.NEXT_PUBLIC_SUPABASE_URL);
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SRV = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE = process.env.BASE || "http://localhost:3100";
if (!ANON || !SRV) { console.error("Faltan claves (¿--env-file=.env.comunidad-local?)"); process.exit(2); }
if (!["localhost", "127.0.0.1"].includes(new URL(BASE).hostname)) { console.error(`BASE no es local: ${BASE}`); process.exit(2); }
const SECRETO = secretoDuplicados();
if (!SECRETO || !SECRETO.startsWith("local-prueba-")) { console.error("Falta el secreto HMAC LOCAL de prueba (COMUNIDAD_HMAC_DUPLICADOS en .env.comunidad-local)"); process.exit(2); }
const docker = dockerVerificado();
console.log(`docker: ${docker.nombre} (${docker.origen}) → ${docker.host}`);
console.log(`base: ${contenedor()} · API ${URL_API} · app ${BASE}\n`);
if (sqlOk("select count(*) from pg_proc where proname = 'comunidad_denunciar'") !== "1") {
  console.error("Falta 015_comunidad_moderacion_datos.sql (¿node scripts/sala/db-local.mjs?)"); process.exit(2);
}

const opcionesCliente = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(URL_API, SRV, opcionesCliente);
const deps = dependenciasEscritura(admin);
const ops = operacionesComunidad(admin);
const depsDenuncia = (o = ops) => ({
  denunciar: o.denunciar, retenerPorRegla: o.retenerPorRegla, bloquear: o.bloquear,
  evaluar: (texto) => evaluarResena(texto, { textosRecientes: [] }),
});
const SOLO = process.env.SOLO ?? "";
const { prueba: pruebaArnes, cerrar } = arnes();
const prueba = (n, fn) => (!SOLO || n.includes(SOLO) ? pruebaArnes(n, fn) : Promise.resolve());
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const q = (v) => { if (!UUID.test(v)) throw new Error(`uuid inesperado: ${v}`); return `'${v}'`; };

// ---------------------------------------------------------------------------
// Textos. Cada BIEN() arma una reseña distinta con 3 de 24 frases y un número:
// dos de la misma cuenta no son casi duplicados (Jaccard de shingles < 0,8).
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
  "Algunos personajes secundarios merecían más espacio.", "La recomiendo a quien disfrute del cine lento.",
  "La adaptación respeta el espíritu del libro.", "Los primeros minutos enganchan enseguida.",
  "El sonido está trabajado con mucho detalle.", "La química entre la pareja central es creíble.",
  "No es perfecta pero tiene mucho corazón.", "Volvería a verla para descubrir detalles.",
];
let n = 0;
function BIEN() {
  const i = [...FRASES.keys()].sort(() => Math.random() - 0.5).slice(0, 3);
  return `${i.map((x) => FRASES[x]).join(" ")} Nota personal número ${++n} de esta prueba.`;
}
const TELEFONO = "La vi el fin de semana y me encantó. Si querés hablar de la peli llamame al 11 5566 7788 y lo charlamos tranquilos.";
const SPAM = () => `Gana plata gratis con cripto: invertí hoy y duplicá tus ganancias en una semana, sorteo exclusivo para los primeros ${++n}.`;
let tmdb = 9_300_000 + Math.floor(Math.random() * 10_000) * 10;

// ---------------------------------------------------------------------------
// Cuentas, interruptores y lecturas del dueño
// ---------------------------------------------------------------------------
const cuentas = new Set();
const participantes = new Set();
async function cuenta(etiqueta, { confirmada = true, terminos = true } = {}) {
  const email = `mod-${etiqueta}-${Date.now()}-${randomBytes(3).toString("hex")}@comunidad.test`;
  const password = `Pm-${randomBytes(15).toString("base64url")}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: confirmada });
  if (error) throw error;
  cuentas.add(data.user.id);
  const c = { uid: data.user.id, email, password };
  if (terminos) {
    const r = await ops.aceptarTerminos(c.uid, TERMINOS_VERSION);
    assert.equal(r.resultado, "terminos_aceptados", JSON.stringify(r));
  }
  c.part = partDe(c);
  return c;
}
function partDe(c) {
  const p = sqlOk(`select coalesce(id::text, '') from comunidad.participantes where user_id = ${q(c.uid)}`) || null;
  if (p) { participantes.add(p); c.part = p; }
  return p;
}

const config = (cols) => sqlOk(`update comunidad.config set ${Object.entries(cols).map(([k, v]) => `${k} = ${v}`).join(", ")}`);
const configPrevia = JSON.parse(sqlOk("select row_to_json(c)::text from comunidad.config c"));
/** Corre `fn` con esos límites y los devuelve a como estaban. */
async function conConfig(cols, fn) {
  const prev = JSON.parse(sqlOk("select row_to_json(c)::text from comunidad.config c"));
  config(cols);
  try { return await fn(); } finally { config(Object.fromEntries(Object.keys(cols).map((k) => [k, prev[k]]))); }
}

const publicar = (c, texto, { tipo = "movie", tmdbId = tmdb++, idIntento = randomUUID(), revision, d = deps } = {}) =>
  escribirResena(d, { uid: c.uid, idIntento, texto, revision, accion: { tipo: "publicar", titulo: { tipo, tmdbId } } });
const editar = (c, resenaId, versionEsperada, texto, { idIntento = randomUUID(), revision, confirmarOculta, d = deps } = {}) =>
  escribirResena(d, { uid: c.uid, idIntento, texto, revision, confirmarOculta, accion: { tipo: "editar", resenaId, versionEsperada } });
const denunciar = (c, versionId, categoria = "spam", extra = {}, d = depsDenuncia()) =>
  denunciarVersion(d, { uid: c.uid, versionId, categoria, ...extra });

const estadoVersion = (id) => sqlOk(`select estado || '|' || coalesce(regla, '') from comunidad.versiones where id = ${Number(id)}`);
const contador = (c, accion) => Number(sqlOk(`select coalesce(sum(cantidad), 0) from comunidad.contadores
  where participante_id = ${q(c.part)} and accion = '${accion}' and dia = comunidad.dia_ar(clock_timestamp())`));
const enCola = () => Number(sqlOk("select comunidad.retenidos_sin_resolver(null, null)"));
const ingresoHora = () => Number(sqlOk(`select (select count(*) from comunidad.denuncias where creada_en > clock_timestamp() - interval '1 hour')
  + (select coalesce(sum(cantidad), 0) from comunidad.denuncias_excedentes where hora >= date_trunc('hour', clock_timestamp()) - interval '1 hour')`));
// E5a: la lectura real (`comunidad_resenas`, como la cuenta, por psql con role authenticated);
// `otras` = la primera página de `items` (hasta 20), el nombre que usaban estas pruebas.
const leer = async (c, tmdbId, tipo = "movie") => { const r = leerComo(c.uid, tipo, tmdbId); return { ...r, otras: r.items ?? [] }; };
const idsVisibles = async (c, tmdbId) => (await leer(c, tmdbId)).otras.map((o) => o.version_id);

/** Autor con una reseña publicada en un título propio. */
async function autorCon(etiqueta) {
  const a = await cuenta(etiqueta);
  const tmdbId = tmdb++;
  const r = await publicar(a, BIEN(), { tmdbId });
  assert.equal(r.resultado, "publicada", JSON.stringify(r));
  return { a, r, tmdbId };
}

// El cliente que pierde la respuesta DESPUÉS del commit (como en E3a, A1).
function clientePerdedor(funciones, perdidas) {
  const estado = { llamadas: 0, perdidas: 0 };
  const f = async (input, init) => {
    const url = typeof input === "string" ? input : String(input.url ?? input);
    const r = await fetch(input, init);
    if (!funciones.some((x) => url.includes(`/rpc/${x}`))) return r;
    estado.llamadas++;
    if (estado.perdidas >= perdidas) return r;
    estado.perdidas++;
    await r.arrayBuffer();
    throw new TypeError("fetch failed (respuesta descartada por la prueba)");
  };
  const cli = createClient(URL_API, SRV, { ...opcionesCliente, global: { fetch: f } });
  return { deps: dependenciasEscritura(cli), ops: operacionesComunidad(cli), estado };
}

// ===========================================================================
config({ modulo_activo: true, publicacion_activa: true });
try {
  // =========================================================================
  console.log("— Duplicados (§3.3.1): huella HMAC, sin texto en claro —");
  await prueba("duplicados · el mismo texto en otro título de la misma cuenta → 'retenida' (sin revelar la regla); otro texto → 'publicada'", async () => {
    const a = await cuenta("dup-propio");
    const t = BIEN();
    assert.equal((await publicar(a, t)).resultado, "publicada");
    const r2 = await publicar(a, t);
    assert.deepEqual(Object.keys(r2).sort(), ["resena_id", "resultado", "version_id"], "la respuesta no nombra la regla");
    assert.equal(r2.resultado, "retenida");
    assert.equal(estadoVersion(r2.version_id), "retenida|duplicado_propio");
    assert.equal((await publicar(a, BIEN())).resultado, "publicada");
  });

  await prueba("duplicados · casi duplicado propio (una palabra cambiada, Jaccard ≥ 0,8) → retenida, también como edición de OTRA reseña; editar la MISMA reseña con un cambio chico → publicada", async () => {
    const a = await cuenta("dup-casi");
    const t = `${FRASES.slice(0, 6).join(" ")} Así la recuerdo.`;
    const r1 = await publicar(a, t);
    assert.equal(r1.resultado, "publicada");
    const r2 = await publicar(a, t.replace("Así la recuerdo", "Así la vi"));
    assert.deepEqual([r2.resultado, estadoVersion(r2.version_id)], ["retenida", "retenida|casi_duplicado_propio"]);
    // Con r2 en la cuenta, una edición de r1 parecida a r2 también es casi duplicado (de OTRA reseña).
    const e1 = await editar(a, r1.resena_id, r1.version_id, t.replace("Así la recuerdo", "Así la guardo"));
    assert.equal(e1.resultado, "retenida");
    // Sin otra reseña parecida, editar la misma reseña con un cambio chico se publica.
    const b = await cuenta("dup-casi-b");
    const s1 = await publicar(b, t);
    const e2 = await editar(b, s1.resena_id, s1.version_id, t.replace("Así la recuerdo", "Así la guardo"));
    assert.equal(e2.resultado, "publicada", "una edición de la misma reseña no es duplicado de sí misma");
  });

  await prueba("duplicados · el mismo texto en 3 cuentas → la 4.ª cuenta queda 'retenida' (duplicado_coordinado); las 3 primeras, publicadas", async () => {
    const t = BIEN();
    const rs = [];
    for (let i = 0; i < 4; i++) rs.push(await publicar(await cuenta(`dup-coord-${i}`), t));
    assert.deepEqual(rs.map((r) => r.resultado), ["publicada", "publicada", "publicada", "retenida"]);
    assert.equal(estadoVersion(rs[3].version_id), "retenida|duplicado_coordinado");
  });

  await prueba("duplicados · CONCURRENCIA: 7 cuentas publican el mismo texto a la vez → exactamente 3 publicadas y 4 retenidas (lock por hash, nivel 8)", async () => {
    const t = BIEN();
    const cs = [];
    for (let i = 0; i < 7; i++) cs.push(await cuenta(`dup-conc-${i}`));
    const rs = await Promise.all(cs.map((c) => publicar(c, t)));
    const cuenta_ = (x) => rs.filter((r) => r.resultado === x).length;
    assert.deepEqual([cuenta_("publicada"), cuenta_("retenida")], [3, 4], JSON.stringify(rs.map((r) => r.resultado)));
  });

  await prueba("duplicados · la tabla de huellas NO contiene texto: sólo hex (64 y 16); ninguna palabra del texto aparece; un shingle en claro lo rechaza el CHECK", async () => {
    const a = await cuenta("dup-inspeccion");
    const t = BIEN();
    const r = await publicar(a, t);
    const fila = JSON.parse(sqlOk(`select row_to_json(h)::text from comunidad.huellas h where version_id = ${r.version_id}`));
    assert.match(fila.hash_texto, /^[0-9a-f]{64}$/);
    assert.ok(fila.shingles.length >= 10 && fila.shingles.every((s) => /^[0-9a-f]{16}$/.test(s)));
    const volcado = JSON.stringify(fila);
    for (const w of palabras(t).filter((w) => w.length >= 4)) assert.ok(!volcado.includes(w), `aparece "${w}"`);
    const todas = sqlOk(`select count(*) from comunidad.huellas where hash_texto !~ '^[0-9a-f]{64}$' or not comunidad.shingles_forma(shingles)`);
    assert.equal(todas, "0", "ninguna fila de la tabla tiene otra forma");
    const x = psql(`insert into comunidad.huellas (version_id, resena_id, autor_participante, hash_texto, shingles, creada_en)
      select id, resena_id, autor_participante, repeat('a', 64), array['la vi el'], now() from comunidad.versiones where id = ${r.version_id} on conflict do nothing;`);
    assert.match(x.stderr, /23514|violates check constraint/);
  });

  await prueba("duplicados · borrar la reseña borra sus huellas; volver a publicar el mismo texto ya no es duplicado", async () => {
    const a = await cuenta("dup-borrar");
    const t = BIEN();
    const r = await publicar(a, t);
    assert.equal((await ops.borrar(a.uid, r.resena_id)).resultado, "borrada");
    assert.equal(sqlOk(`select count(*) from comunidad.huellas where version_id = ${r.version_id}`), "0");
    assert.equal((await publicar(a, t)).resultado, "publicada");
  });

  await prueba("duplicados · sin secreto HMAC la escritura responde 'error' y no toca la base (una regla que no corre nunca aprueba)", async () => {
    const a = await cuenta("dup-sin-secreto");
    const sin = dependenciasEscritura(admin, null);
    const tmdbId = tmdb++;
    assert.equal((await publicar(a, BIEN(), { tmdbId, d: sin })).resultado, "error");
    assert.equal(sqlOk(`select count(*) from comunidad.resenas where autor_participante = ${q(a.part)}`), "0");
    assert.equal(contador(a, "resena"), 0);
    // Y la base rechaza una decisión que guardaría sin huella.
    const { error } = await admin.rpc("comunidad_publicar", { p_uid: a.uid, p_tipo: "movie", p_tmdb_id: tmdbId, p_texto: BIEN(),
      p_decision: { resultado: "publicar", version_reglas: "x", reglas: [] }, p_id_intento: randomUUID(), p_hash: "a".repeat(64) });
    assert.equal(error?.code, "22023");
  });

  // =========================================================================
  console.log("\n— Admisión a la cola de retenidos (§3.3) —");
  await prueba("admisión · por autor: con 2 retenidos, el 3.º que sería retenido NO se guarda ('admision_autor', sin cupo); lo limpio se publica", async () => {
    const a = await cuenta("adm-autor");
    assert.equal((await publicar(a, SPAM())).resultado, "retenida");
    assert.equal((await publicar(a, SPAM())).resultado, "retenida");
    const cupo = contador(a, "resena");
    const tmdbId = tmdb++;
    const r3 = await publicar(a, SPAM(), { tmdbId });
    assert.deepEqual([r3.resultado, r3.motivo], ["rechazo_cuenta", "admision_autor"]);
    assert.equal(sqlOk(`select count(*) from comunidad.resenas where autor_participante = ${q(a.part)} and tmdb_id = ${tmdbId}`), "0");
    assert.equal(contador(a, "resena"), cupo, "no consume límite");
    assert.equal((await publicar(a, BIEN())).resultado, "publicada");
  });

  await prueba("admisión · por autor: editar uno de SUS 2 retenidos con otro texto retenido se admite (la vigente reemplazada sale de la cola)", async () => {
    const a = await cuenta("adm-editar");
    const r1 = await publicar(a, SPAM());
    await publicar(a, SPAM());
    const e = await editar(a, r1.resena_id, r1.version_id, SPAM());
    assert.equal(e.resultado, "retenida", JSON.stringify(e));
    assert.equal(Number(sqlOk(`select comunidad.retenidos_sin_resolver(${q(a.part)}, null)`)), 2);
  });

  await prueba("admisión · por autor, CONCURRENCIA: 5 envíos retenibles simultáneos de la misma cuenta → exactamente 2 retenidos y 3 'admision_autor'", async () => {
    const a = await cuenta("adm-autor-conc");
    const rs = await Promise.all([0, 1, 2, 3, 4].map(() => publicar(a, SPAM())));
    assert.deepEqual([rs.filter((r) => r.resultado === "retenida").length, rs.filter((r) => r.motivo === "admision_autor").length], [2, 3],
      JSON.stringify(rs.map((r) => r.motivo ?? r.resultado)));
  });

  await prueba("admisión · global, CONCURRENCIA (ataque que llena la cola): tope = cola + 3; 10 cuentas envían spam a la vez → exactamente 3 entran y 7 reciben 'admision_global'; lo limpio se sigue publicando", async () => {
    const cs = [];
    for (let i = 0; i < 11; i++) cs.push(await cuenta(`adm-global-${i}`));
    await conConfig({ admision_global: enCola() + 3 }, async () => {
      const rs = await Promise.all(cs.slice(0, 10).map((c) => publicar(c, SPAM())));
      const ret = rs.filter((r) => r.resultado === "retenida").length;
      const glob = rs.filter((r) => r.motivo === "admision_global").length;
      assert.deepEqual([ret, glob], [3, 7], JSON.stringify(rs.map((r) => r.motivo ?? r.resultado)));
      // Los 7 rechazados no dejaron nada.
      const sinNada = cs.slice(0, 10).filter((c, i) => rs[i].motivo === "admision_global")
        .every((c) => sqlOk(`select count(*) from comunidad.resenas where autor_participante = ${q(c.part)}`) === "0");
      assert.ok(sinNada, "un rechazo de admisión no guarda nada");
      // Con la cola llena: lo que pasa las reglas se publica; lo retenible, no.
      assert.equal((await publicar(cs[10], BIEN())).resultado, "publicada");
      assert.equal((await publicar(cs[10], SPAM())).motivo, "admision_global");
    });
  });

  await prueba("admisión · lo retenido NO se publica por vencimiento: no hay job que lo haga (pg_cron no programa nada sobre comunidad)", async () => {
    const hayCron = sqlOk("select count(*) from pg_extension where extname = 'pg_cron'");
    if (hayCron !== "0") assert.equal(sqlOk("select count(*) from cron.job where command ilike '%comunidad%'"), "0");
    const funcs = sqlOk(`select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('comunidad', 'public') and p.prosrc ilike '%retenida%' and p.prosrc ilike '%''publicada''%'
        and p.prosrc ilike '%interval%' and p.proname not in ('comunidad_denunciar')`);
    assert.equal(funcs, "0", "ninguna función publica lo retenido por tiempo");
  });

  // =========================================================================
  console.log("\n— Pedir revisión de un rechazo por contenido (§3.3.3, §3.4.1) —");
  await prueba("revisión · publicar con teléfono → rechazo_contenido (nada guardado); pedir revisión (id nuevo) → 'revision_solicitada', invisible para otros, cuenta para el límite", async () => {
    const a = await cuenta("rev-publicar"), b = await cuenta("rev-lector");
    const tmdbId = tmdb++;
    const r = await publicar(a, TELEFONO, { tmdbId });
    assert.equal(r.resultado, "rechazo_contenido");
    assert.equal(sqlOk(`select count(*) from comunidad.resenas where autor_participante = ${q(a.part)}`), "0");
    const rv = await publicar(a, TELEFONO, { tmdbId, revision: true });
    assert.equal(rv.resultado, "revision_solicitada", JSON.stringify(rv));
    assert.match(estadoVersion(rv.version_id), /^revision_solicitada\|.+/, "guarda la regla disparada");
    assert.equal(contador(a, "resena"), 2);
    assert.deepEqual(await idsVisibles(b, tmdbId), []);
    assert.equal((await leer(a, tmdbId)).mia.estado, "revision_solicitada");
  });

  await prueba("revisión · si las reglas vigentes ya no rechazan el texto, es un envío normal ('publicada')", async () => {
    const a = await cuenta("rev-normal");
    assert.equal((await publicar(a, BIEN(), { revision: true })).resultado, "publicada");
  });

  await prueba("revisión · edición: sin confirmar → 'requiere_confirmacion' sin tocar nada; confirmada → la publicada se reemplaza (deja de verse), votos reiniciados UNA vez", async () => {
    const { a, r, tmdbId } = await autorCon("rev-editar");
    const v = await cuenta("rev-editar-v");
    assert.equal((await ops.votar(v.uid, r.version_id, true)).resultado, "voto_registrado");
    const sin = await editar(a, r.resena_id, r.version_id, TELEFONO, { revision: true });
    assert.equal(sin.resultado, "requiere_confirmacion");
    assert.equal(estadoVersion(r.version_id), "publicada|");
    assert.deepEqual(await idsVisibles(v, tmdbId), [r.version_id]);
    const con = await editar(a, r.resena_id, r.version_id, TELEFONO, { revision: true, confirmarOculta: true });
    assert.deepEqual([con.resultado, con.votos_reiniciados], ["revision_solicitada", 1], JSON.stringify(con));
    assert.equal(estadoVersion(r.version_id), "reemplazada|");
    assert.deepEqual(await idsVisibles(v, tmdbId), [], "la publicada dejó de verse");
  });

  await prueba("revisión · pasa por la admisión: con 2 retenidos propios → 'admision_autor' y nada guardado", async () => {
    const a = await cuenta("rev-admision");
    await publicar(a, SPAM()); await publicar(a, SPAM());
    const r = await publicar(a, TELEFONO, { revision: true });
    assert.deepEqual([r.resultado, r.motivo], ["rechazo_cuenta", "admision_autor"]);
  });

  await prueba("revisión · idempotencia: respuesta perdida tras el commit → el reintento con el mismo id devuelve lo guardado (UNA versión); el mismo id sin revisión → conflicto", async () => {
    const a = await cuenta("rev-idem");
    const p = clientePerdedor(["comunidad_publicar"], 1);
    const id = randomUUID();
    const tmdbId = tmdb++;
    const r = await publicar(a, TELEFONO, { tmdbId, revision: true, idIntento: id, d: p.deps });
    assert.deepEqual([r.resultado, r.repetido, p.estado.perdidas], ["revision_solicitada", true, 1], JSON.stringify(r));
    assert.equal(sqlOk(`select count(*) from comunidad.versiones where autor_participante = ${q(a.part)}`), "1");
    const c = await publicar(a, TELEFONO, { tmdbId, idIntento: id });
    assert.deepEqual([c.resultado, c.motivo], ["conflicto", "intento"]);
  });

  // =========================================================================
  console.log("\n— Denuncias (§3.3.2) —");
  await prueba("denuncia · se registra, la reseña SIGUE VISIBLE; repetirla da el mismo resultado sin otra fila ni otro cupo; quien denuncia la ve marcada", async () => {
    const { r, tmdbId } = await autorCon("den-basica");
    const d = await cuenta("den-basica-d"), otro = await cuenta("den-basica-o");
    const x1 = await denunciar(d, r.version_id, "spam", { comentario: "  Me parece publicidad.  " });
    assert.deepEqual(x1, { resultado: "denuncia_registrada" }, "sin texto ni detalles internos");
    const x2 = await denunciar(d, r.version_id, "odio");
    assert.deepEqual(x2, { resultado: "denuncia_registrada", repetido: true });
    assert.equal(sqlOk(`select count(*) || '|' || min(comentario) from comunidad.denuncias where version_id = ${r.version_id}`), "1|Me parece publicidad.");
    assert.equal(contador(d, "denuncia"), 1);
    assert.equal(estadoVersion(r.version_id), "publicada|");
    assert.deepEqual(await idsVisibles(otro, tmdbId), [r.version_id]);
    assert.equal((await leer(d, tmdbId)).otras[0].denunciada, true);
  });

  await prueba("denuncia · no la propia ('propia'); no lo invisible (retenida → 'version_no_disponible'); motivo fuera del diseño → 'invalido' sin tocar la base", async () => {
    const { a, r } = await autorCon("den-propia");
    assert.equal((await denunciar(a, r.version_id)).motivo, "propia");
    const b = await cuenta("den-retenida");
    const ret = await publicar(b, SPAM());
    assert.equal((await denunciar(a, ret.version_id)).motivo, "version_no_disponible");
    assert.equal((await denunciar(b, r.version_id, "me_cae_mal")).resultado, "invalido");
    assert.equal((await denunciar(b, r.version_id, "spam", { comentario: "x".repeat(301) })).resultado, "invalido");
    assert.equal(sqlOk(`select count(*) from comunidad.denuncias where version_id in (${r.version_id}, ${ret.version_id})`), "0");
  });

  await prueba("denuncia · ATAQUE: 8 cuentas denuncian como grave una reseña legítima → sigue publicada y visible, y queda PRIMERA en la cola (la cantidad ordena, no oculta)", async () => {
    const { r, tmdbId } = await autorCon("den-ataque");
    const otra = await autorCon("den-ataque-otra");
    const rs = await Promise.all([...Array(8)].map(async (_, i) => denunciar(await cuenta(`den-ataque-${i}`), r.version_id, "phishing_estafa")));
    assert.ok(rs.every((x) => x.resultado === "denuncia_registrada"), JSON.stringify(rs));
    assert.equal((await denunciar(await cuenta("den-ataque-x"), otra.r.version_id, "otro")).resultado, "denuncia_registrada");
    assert.equal(estadoVersion(r.version_id), "publicada|");
    assert.deepEqual(await idsVisibles(await cuenta("den-ataque-lector"), tmdbId), [r.version_id]);
    const cola = sqlOk("select version_id from comunidad.cola_denuncias()").split("\n").map(Number);
    assert.ok(cola.indexOf(r.version_id) >= 0 && cola.indexOf(r.version_id) < cola.indexOf(otra.r.version_id), "sube por encima de la otra");
  });

  await prueba("denuncia · cota por versión, CONCURRENCIA: tope 3 filas; 7 denuncias simultáneas → 3 filas + excedente 4, todas 'denuncia_registrada'; sigue publicada", async () => {
    const { r } = await autorCon("den-cota");
    const ds = [];
    for (let i = 0; i < 7; i++) ds.push(await cuenta(`den-cota-${i}`));
    await conConfig({ denuncias_filas_por_version: 3 }, async () => {
      const rs = await Promise.all(ds.map((d) => denunciar(d, r.version_id, i_grave(d) ? "acoso_amenazas" : "spam")));
      assert.ok(rs.every((x) => x.resultado === "denuncia_registrada"), JSON.stringify(rs));
    });
    assert.equal(sqlOk(`select count(*) from comunidad.denuncias where version_id = ${r.version_id}`), "3");
    assert.equal(sqlOk(`select sum(cantidad) from comunidad.denuncias_excedentes where version_id = ${r.version_id}`), "4");
    assert.equal(estadoVersion(r.version_id), "publicada|");
  });
  function i_grave(d) { return d.uid.charCodeAt(0) % 2 === 0; }

  await prueba("denuncia · tope global por hora, CONCURRENCIA: tope = ingreso + 4; 9 cuentas denuncian a la vez → exactamente 4 recibidas y 5 'cola_denuncias_llena'; con bloquear, el bloqueo se hace igual", async () => {
    const vs = [];
    for (let i = 0; i < 9; i++) vs.push((await autorCon(`den-hora-a${i}`)).r.version_id);
    const ds = [];
    for (let i = 0; i < 9; i++) ds.push(await cuenta(`den-hora-d${i}`));
    await conConfig({ denuncias_por_hora: ingresoHora() + 4 }, async () => {
      const rs = await Promise.all(ds.map((d, i) => denunciar(d, vs[i], "spam", { bloquear: true })));
      const ok = rs.filter((x) => x.resultado === "denuncia_registrada").length;
      const llenas = rs.filter((x) => x.motivo === "cola_denuncias_llena");
      assert.deepEqual([ok, llenas.length], [4, 5], JSON.stringify(rs));
      assert.ok(rs.every((x) => x.bloqueo?.resultado === "bloqueado"), "bloquear siempre está disponible");
    });
  });

  await prueba("denuncia · límite diario propio (tope 2): la 3.ª → 'limite_diario'", async () => {
    const d = await cuenta("den-limite");
    const vs = [];
    for (let i = 0; i < 3; i++) vs.push((await autorCon(`den-limite-a${i}`)).r.version_id);
    await conConfig({ limite_denuncias: 2 }, async () => {
      const rs = [];
      for (const v of vs) rs.push(await denunciar(d, v));
      assert.deepEqual(rs.map((x) => x.motivo ?? x.resultado), ["denuncia_registrada", "denuncia_registrada", "limite_diario"]);
    });
  });

  await prueba("denuncia · CORROBORACIÓN: una versión publicada con reglas viejas que las vigentes retendrían pasa a 'retenida' POR LA REGLA; una legítima denunciada, no", async () => {
    const a = await cuenta("den-corrob");
    // Fixture: una publicada con una versión de reglas anterior (como si la
    // lista se hubiera actualizado después). Se inserta con el dueño.
    const tmdbId = tmdb++;
    const vid = Number(sqlOk(`begin;
      insert into comunidad.resenas (autor_participante, tipo, tmdb_id, primera_publicacion_en) values (${q(a.part)}, 'movie', ${tmdbId}, now());
      insert into comunidad.versiones (resena_id, autor_participante, texto, estado, version_reglas, id_intento)
        select id, ${q(a.part)}, '${SPAM().replace(/'/g, "''")}', 'publicada', 'reglas-anteriores', gen_random_uuid()
          from comunidad.resenas where autor_participante = ${q(a.part)} and tmdb_id = ${tmdbId};
      update comunidad.resenas r set version_vigente_id = v.id from comunidad.versiones v where v.resena_id = r.id and r.tmdb_id = ${tmdbId} and r.autor_participante = ${q(a.part)};
      commit;
      select v.id from comunidad.versiones v join comunidad.resenas r on r.id = v.resena_id where r.tmdb_id = ${tmdbId} and r.autor_participante = ${q(a.part)};`));
    const legit = await autorCon("den-corrob-legit");
    const d = await cuenta("den-corrob-d");
    assert.equal((await denunciar(d, vid, "spam")).resultado, "denuncia_registrada");
    assert.match(estadoVersion(vid), /^retenida\|corroboracion:/);
    assert.equal(sqlOk(`select version_reglas from comunidad.corroboraciones where version_id = ${vid}`), evaluarResena("x".repeat(90), { textosRecientes: [] }).versionReglas);
    assert.equal((await denunciar(d, legit.r.version_id, "spam")).resultado, "denuncia_registrada");
    assert.equal(estadoVersion(legit.r.version_id), "publicada|");
    assert.equal(sqlOk(`select count(*) from comunidad.corroboraciones where version_id = ${legit.r.version_id}`), "0");
  });

  await prueba("denuncia · 'No me sirvió' masivo (12 cuentas) → ningún efecto de moderación: publicada, sin denuncias, fuera de la cola", async () => {
    const { r } = await autorCon("den-nosirvio");
    const rs = await Promise.all([...Array(12)].map(async (_, i) => ops.votar((await cuenta(`den-ns-${i}`)).uid, r.version_id, false)));
    assert.ok(rs.every((x) => x.resultado === "voto_registrado"));
    assert.equal(estadoVersion(r.version_id), "publicada|");
    assert.equal(sqlOk(`select count(*) from comunidad.denuncias where version_id = ${r.version_id}`), "0");
    assert.equal(sqlOk(`select count(*) from comunidad.cola_denuncias() where version_id = ${r.version_id}`), "0");
  });

  await prueba("denuncia · respuesta perdida tras el commit → se reconcilia: 'denuncia_registrada' repetida, UNA fila, UN cupo; perdidas las dos → 'sin_confirmar' y el reintento no duplica", async () => {
    const { r } = await autorCon("den-perdida");
    const d = await cuenta("den-perdida-d");
    const p = clientePerdedor(["comunidad_denunciar"], 1);
    const x = await denunciar(d, r.version_id, "spam", {}, depsDenuncia(p.ops));
    assert.deepEqual(x, { resultado: "denuncia_registrada", repetido: true });
    assert.equal(sqlOk(`select count(*) from comunidad.denuncias where version_id = ${r.version_id}`), "1");
    assert.equal(contador(d, "denuncia"), 1);
    const otra = await autorCon("den-perdida2");
    const p2 = clientePerdedor(["comunidad_denunciar"], 2);
    assert.deepEqual(await denunciar(d, otra.r.version_id, "spam", {}, depsDenuncia(p2.ops)), { resultado: "sin_confirmar" });
    assert.deepEqual(await denunciar(d, otra.r.version_id), { resultado: "denuncia_registrada", repetido: true });
    assert.equal(sqlOk(`select count(*) from comunidad.denuncias where version_id = ${otra.r.version_id}`), "1");
  });

  // =========================================================================
  console.log("\n— Bloqueos (§3.3.4) —");
  await prueba("bloqueo · oculta TODAS las reseñas del autor sólo para quien bloquea; los demás las siguen viendo; su estado no cambia", async () => {
    const { a, r, tmdbId } = await autorCon("blq-autor");
    const t2 = tmdb++;
    const r2 = await publicar(a, BIEN(), { tmdbId: t2 });
    const yo = await cuenta("blq-yo"), otro = await cuenta("blq-otro");
    const b = await ops.bloquear(yo.uid, r.version_id);
    assert.equal(b.resultado, "bloqueado");
    assert.deepEqual([await idsVisibles(yo, tmdbId), await idsVisibles(yo, t2)], [[], []]);
    assert.deepEqual([await idsVisibles(otro, tmdbId), await idsVisibles(otro, t2)], [[r.version_id], [r2.version_id]]);
    assert.equal(estadoVersion(r.version_id), "publicada|");
    const lista = await ops.bloqueados(yo.uid);
    assert.deepEqual(lista.bloqueados.map((x) => [x.bloqueo_id, x.origen_tipo, x.origen_tmdb_id]), [[b.bloqueo_id, "movie", tmdbId]]);
  });

  await prueba("bloqueo · idempotente; no a sí mismo ('propio'); límite diario (tope 1 → el 2.º 'limite_diario'); se puede denunciar después de bloquear", async () => {
    const { r } = await autorCon("blq-idem");
    const otro = await autorCon("blq-idem-2");
    const yo = await cuenta("blq-idem-yo");
    await conConfig({ limite_bloqueos: 1 }, async () => {
      const b1 = await ops.bloquear(yo.uid, r.version_id);
      const b2 = await ops.bloquear(yo.uid, r.version_id);
      assert.deepEqual([b1.resultado, b2.resultado, b2.repetido, b2.bloqueo_id], ["bloqueado", "bloqueado", true, b1.bloqueo_id]);
      assert.equal((await ops.bloquear(yo.uid, otro.r.version_id)).motivo, "limite_diario");
    });
    assert.equal((await ops.bloquear(otro.a.uid, otro.r.version_id)).motivo, "propio");
    assert.equal((await denunciar(yo, r.version_id, "acoso_amenazas")).resultado, "denuncia_registrada");
  });

  await prueba("desbloqueo · por id: vuelve a verse; el bloqueo de OTRA cuenta no se toca ('sin_efecto', la fila sigue); repetirlo es 'sin_efecto'", async () => {
    const { r, tmdbId } = await autorCon("dbq");
    const yo = await cuenta("dbq-yo"), ajeno = await cuenta("dbq-ajeno");
    const b = await ops.bloquear(yo.uid, r.version_id);
    assert.equal((await ops.desbloquear(ajeno.uid, b.bloqueo_id)).resultado, "sin_efecto");
    assert.equal(sqlOk(`select count(*) from comunidad.bloqueos where id = ${b.bloqueo_id}`), "1");
    assert.equal((await ops.desbloquear(yo.uid, b.bloqueo_id)).resultado, "desbloqueado");
    assert.deepEqual(await idsVisibles(yo, tmdbId), [r.version_id]);
    assert.equal((await ops.desbloquear(yo.uid, b.bloqueo_id)).resultado, "sin_efecto");
  });

  await prueba("bloqueo y desbloqueo · respuesta perdida tras el commit → reconciliados sin duplicar ni fallar", async () => {
    const { r } = await autorCon("blq-perdida");
    const yo = await cuenta("blq-perdida-yo");
    const p = clientePerdedor(["comunidad_bloquear"], 1);
    const b = await p.ops.bloquear(yo.uid, r.version_id);
    assert.deepEqual([b.resultado, b.repetido, p.estado.perdidas], ["bloqueado", true, 1]);
    const p2 = clientePerdedor(["comunidad_desbloquear"], 1);
    const d = await p2.ops.desbloquear(yo.uid, b.bloqueo_id);
    assert.equal(d.resultado, "sin_efecto", "el primero se aplicó; el reintento lo encuentra hecho");
    assert.equal(sqlOk(`select count(*) from comunidad.bloqueos b join comunidad.participantes p on p.id = b.bloqueador_participante where p.user_id = ${q(yo.uid)}`), "0");
  });

  // =========================================================================
  console.log("\n— Matriz filas C (denunciar) y D (bloquear, desbloquear) (§2.1.2) —");
  // Esperado escrito antes. C: suspensión, pausa, términos y cola de
  // retenidos llena NO impiden; módulo apagado y correo pendiente sí; baja en
  // curso, CB001; cola de denuncias llena, 'cola_denuncias_llena'.
  // D: nada impide salvo la baja en curso.
  const MATRIZ = {
    suspendido: { C: "denuncia_registrada", D: true },
    "correo pendiente": { C: "correo_pendiente", D: true },
    "términos sin aceptar": { C: "denuncia_registrada", D: true },
    "publicación pausada": { C: "denuncia_registrada", D: true },
    "módulo apagado": { C: "modulo_apagado", D: true },
    "cola de retenidos llena": { C: "denuncia_registrada", D: true },
    "cola de denuncias llena": { C: "cola_denuncias_llena", D: true },
    "baja en curso": { C: "baja_en_curso", D: "baja_en_curso" },
  };
  for (const [cond, esperado] of Object.entries(MATRIZ)) {
    await prueba(`matriz · ${cond}: C → '${esperado.C}'; D → ${esperado.D === true ? "permitidas" : `'${esperado.D}'`}`, async () => {
      const { r } = await autorCon(`mz-a-${cond.length}`);
      const c = await cuenta(`mz-${cond.length}`, { terminos: cond !== "términos sin aceptar" });
      const extra = {};
      if (cond === "suspendido") sqlOk(`insert into comunidad.suspensiones (participante_id, desde) values (${q(c.part)}, now() - interval '1 minute')`);
      if (cond === "correo pendiente") sqlOk(`update auth.users set email_confirmed_at = null where id = ${q(c.uid)}`);
      if (cond === "publicación pausada") extra.publicacion_activa = false;
      if (cond === "módulo apagado") extra.modulo_activo = false;
      if (cond === "cola de retenidos llena") extra.admision_global = 0;
      if (cond === "cola de denuncias llena") extra.denuncias_por_hora = 0;
      if (cond === "baja en curso") {
        const { error } = await admin.rpc("comunidad_baja_comunitaria", { p_uid: c.uid });
        assert.equal(error, null);
      }
      await conConfig(Object.keys(extra).length ? extra : { limite_denuncias: configPrevia.limite_denuncias }, async () => {
        const x = await denunciar(c, r.version_id, "spam");
        assert.equal(x.motivo ?? x.resultado, esperado.C, JSON.stringify(x));
        if (esperado.D === true) {
          const b = await ops.bloquear(c.uid, r.version_id);
          assert.equal(b.resultado, "bloqueado", JSON.stringify(b));
          assert.equal((await ops.desbloquear(c.uid, b.bloqueo_id)).resultado, "desbloqueado");
        } else {
          await assert.rejects(ops.bloquear(c.uid, r.version_id), (e) => e.code === "CB001");
          await assert.rejects(ops.desbloquear(c.uid, 1), (e) => e.code === "CB001");
        }
      });
      partDe(c);
      if (cond === "términos sin aceptar") assert.ok(c.part, "C y D crean la identidad comunitaria sin exigir términos");
    });
  }

  // =========================================================================
  console.log("\n— Protocolo: niveles 8 (huella) y 9 (cola) —");
  await prueba("protocolo · fuera de orden → CB002: cola antes que huella, huella o cola después de la marca, cola repetida; saltear la huella vale", async () => {
    const u = await cuenta("proto");
    const casos = {
      "cola antes que huella": `select comunidad.proto_cuenta(${q(u.uid)}, false); select comunidad.proto_cola('retenidos'); select comunidad.proto_huella('x');`,
      "huella tras la marca": `select comunidad.proto_cuenta(${q(u.uid)}, false); select comunidad.proto_marca(); select comunidad.proto_huella('x');`,
      "cola tras la marca": `select comunidad.proto_cuenta(${q(u.uid)}, false); select comunidad.proto_marca(); select comunidad.proto_cola('denuncias');`,
      "cola repetida": `select comunidad.proto_cuenta(${q(u.uid)}, false); select comunidad.proto_cola('retenidos'); select comunidad.proto_cola('denuncias');`,
    };
    for (const [nombre, sql] of Object.entries(casos)) {
      const r = psql(`begin; ${sql} rollback;`);
      assert.match(r.stderr, /ERROR:\s+orden_de_locks/, nombre);
    }
    const ok = psql(`begin; select comunidad.proto_cuenta(${q(u.uid)}, false); select comunidad.proto_cola('retenidos'); select comunidad.proto_marca(); rollback;`);
    assert.equal(ok.status, 0, ok.stderr);
  });

  // =========================================================================
  console.log("\n— Compuertas con sesiones psql: el segundo ESPERA el lock del nivel 8/9 y relee —");
  // Técnica de E3a: X corre la función real en una transacción abierta (ya
  // tomó sus locks) y se para en una barrera antes de confirmar; Y llama a la
  // función real y se OBSERVA en pg_locks esperando exactamente el lock
  // consultivo de la cola (7304) o del hash (7303). Al soltar, X confirma e Y
  // relee: sin ese lock, Y habría leído el estado viejo y pasado el tope.
  const llamar = (f, args) => `select 'R|' || public.${f}(${args})::text;`;
  const enTx = (sql, num) => `begin;\nset local role service_role;\n${sql}\nreset role;\n${BARRERA(num)}\ncommit;`;
  const comoServicio = (sql) => `set role service_role;\n${sql}\nreset role;`;
  const res = (x) => x.out.split("\n").filter((l) => l.startsWith("R|")).map((l) => JSON.parse(l.slice(2)));
  const esperaConsultivo = (x, clase, objid) => `exists (select 1 from pg_locks l join pg_stat_activity a on a.pid = l.pid
    where a.application_name = '${x.app}' and l.locktype = 'advisory' and l.classid = ${clase}${objid ? ` and l.objid = ${objid}` : ""} and not l.granted)`;
  const decSql = (texto, resultado = "publicar") => JSON.stringify({ resultado, version_reglas: "2026-10-24.2",
    reglas: resultado === "publicar" ? [] : ["prueba.retencion"], huella: huella(normalizarTexto(texto), SECRETO) });
  const publicarSql = (c, texto, resultado) => {
    const t = normalizarTexto(texto);
    return llamar("comunidad_publicar", `${q(c.uid)}, 'movie', ${tmdb++}, '${t.replace(/'/g, "''")}', '${decSql(t, resultado)}'::jsonb, '${randomUUID()}', '${sha256(t)}'`);
  };

  await prueba("compuerta · admisión global: X entra a la cola (tope = cola + 1) y retiene; Y espera el lock 7304, relee y recibe 'admision_global'", async () => {
    const x = await cuenta("g-adm-x"), y = await cuenta("g-adm-y");
    await conConfig({ admision_global: enCola() + 1 }, async () => {
      const b = await barrera(61);
      const X = new Sesion("g-adm-x"), Y = new Sesion("g-adm-y");
      X.enviar(enTx(publicarSql(x, SPAM(), "retener"), 61));
      await esperar(esperaLock(X, "advisory"), "X retiene sus locks");
      Y.enviar(comoServicio(publicarSql(y, SPAM(), "retener")));
      await esperar(esperaConsultivo(Y, 7304, 1), "Y espera la cola de retenidos");
      b.soltar();
      await X.terminar(); await Y.terminar();
      assert.equal(res(X)[0].resultado, "retenida");
      assert.deepEqual([res(Y)[0].resultado, res(Y)[0].motivo], ["rechazo_cuenta", "admision_global"]);
    });
  });

  await prueba("compuerta · denuncias por hora: X recibe la última (tope = ingreso + 1) y retiene; Y espera el lock 7304, relee y recibe 'cola_denuncias_llena'", async () => {
    const v1 = (await autorCon("g-den-a1")).r.version_id, v2 = (await autorCon("g-den-a2")).r.version_id;
    const x = await cuenta("g-den-x"), y = await cuenta("g-den-y");
    await conConfig({ denuncias_por_hora: ingresoHora() + 1 }, async () => {
      const b = await barrera(62);
      const X = new Sesion("g-den-x"), Y = new Sesion("g-den-y");
      X.enviar(enTx(llamar("comunidad_denunciar", `${q(x.uid)}, ${v1}, 'spam', null`), 62));
      await esperar(esperaLock(X, "advisory"), "X retiene sus locks");
      Y.enviar(comoServicio(llamar("comunidad_denunciar", `${q(y.uid)}, ${v2}, 'spam', null`)));
      await esperar(esperaConsultivo(Y, 7304, 2), "Y espera la cola de denuncias");
      b.soltar();
      await X.terminar(); await Y.terminar();
      assert.equal(res(X)[0].resultado, "denuncia_registrada");
      assert.deepEqual([res(Y)[0].resultado, res(Y)[0].motivo], ["rechazo_cuenta", "cola_denuncias_llena"]);
    });
  });

  await prueba("compuerta · duplicado entre cuentas: con el texto en 2 cuentas, X (3.ª) publica y retiene el hash; Y (4.ª) espera el lock 7303, relee y queda 'retenida'", async () => {
    const t = normalizarTexto(BIEN());
    for (let i = 0; i < 2; i++) assert.equal((await publicar(await cuenta(`g-dup-${i}`), t)).resultado, "publicada");
    const x = await cuenta("g-dup-x"), y = await cuenta("g-dup-y");
    const b = await barrera(63);
    const X = new Sesion("g-dup-x"), Y = new Sesion("g-dup-y");
    X.enviar(enTx(publicarSql(x, t, "publicar"), 63));
    await esperar(esperaLock(X, "advisory"), "X retiene sus locks");
    Y.enviar(comoServicio(publicarSql(y, t, "publicar")));
    await esperar(esperaConsultivo(Y, 7303), "Y espera el hash");
    b.soltar();
    await X.terminar(); await Y.terminar();
    assert.equal(res(X)[0].resultado, "publicada");
    assert.equal(res(Y)[0].resultado, "retenida");
    assert.equal(estadoVersion(res(Y)[0].version_id), "retenida|duplicado_coordinado");
  });

  // =========================================================================
  console.log("\n— Acceso directo —");
  const tokenDe = async (c) => {
    const sb = createClient(URL_API, ANON, opcionesCliente);
    const { data, error } = await sb.auth.signInWithPassword({ email: c.email, password: c.password });
    if (error) throw error;
    return data.session.access_token;
  };
  await prueba("acceso directo · un JWT de usuario (y anon) no lee ni escribe las tablas nuevas ni ejecuta las funciones de E3b", async () => {
    const c = await cuenta("directo");
    const t = await tokenDe(c);
    for (const [quien, token] of [["usuario", t], ["anon", ANON]]) {
      const h = { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
      for (const tabla of ["huellas", "denuncias_excedentes", "corroboraciones", "denuncias", "bloqueos"]) {
        for (const perfil of [null, "comunidad"]) {
          const r = await fetch(`${URL_API}/rest/v1/${tabla}?select=*`, { headers: perfil ? { ...h, "Accept-Profile": perfil } : h });
          assert.ok(r.status >= 400, `${quien} ${tabla} ${perfil}: ${r.status}`);
          const w = await fetch(`${URL_API}/rest/v1/${tabla}`, { method: "POST", headers: perfil ? { ...h, "Content-Profile": perfil } : h, body: "{}" });
          assert.ok(w.status >= 400, `${quien} escribe ${tabla} ${perfil}: ${w.status}`);
        }
      }
      for (const f of ["comunidad_denunciar", "comunidad_retener_por_regla", "comunidad_bloquear", "comunidad_desbloquear", "comunidad_bloqueados"]) {
        const r = await fetch(`${URL_API}/rest/v1/rpc/${f}`, { method: "POST", headers: h, body: JSON.stringify({ p_uid: c.uid }) });
        const cuerpo = await r.text();
        assert.ok((r.status === 401 || r.status === 403 || r.status === 404) && /42501|permission denied|PGRST202/.test(cuerpo), `${quien} ${f}: ${r.status} ${cuerpo.slice(0, 80)}`);
      }
    }
    const internas = sqlOk(`select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'comunidad' and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute')
        or has_function_privilege('service_role', p.oid, 'execute'))`);
    assert.equal(internas, "0", "ninguna función interna de comunidad es ejecutable desde la API");
  });

  // =========================================================================
  console.log("\n— Rutas HTTP (servidor local) —");
  const http = async (ruta, token, cuerpo) => {
    const r = await fetch(`${BASE}${ruta}`, {
      method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(cuerpo ?? {}),
    });
    return { status: r.status, j: await r.json().catch(() => null), cache: r.headers.get("cache-control") ?? "" };
  };
  await prueba("rutas · sin sesión → 401; cuerpo inválido → 400; sin caché", async () => {
    for (const ruta of ["/api/comunidad/denuncias", "/api/comunidad/bloqueos", "/api/comunidad/revision"]) {
      assert.equal((await http(ruta, null, {})).status, 401, ruta);
    }
    const t = await tokenDe(await cuenta("http-inv"));
    for (const [ruta, cuerpo] of [["/api/comunidad/denuncias", { version_id: 1, categoria: "nada" }], ["/api/comunidad/bloqueos", { accion: "otra" }],
      ["/api/comunidad/revision", { accion: "otra" }]]) {
      const r = await http(ruta, t, cuerpo);
      assert.deepEqual([r.status, r.j?.resultado], [400, "invalido"], ruta);
      assert.match(r.cache, /no-store/);
    }
  });

  await prueba("rutas · denunciar + bloquear en un paso por HTTP: la respuesta no trae el texto; la reseña desaparece para quien bloquea; listar y desbloquear por HTTP", async () => {
    const { r, tmdbId } = await autorCon("http-den");
    const yo = await cuenta("http-den-yo");
    const t = await tokenDe(yo);
    const d = await http("/api/comunidad/denuncias", t, { version_id: r.version_id, categoria: "datos_personales", comentario: "Publica un DNI.", bloquear: true });
    assert.equal(d.status, 200);
    assert.deepEqual(d.j, { resultado: "denuncia_registrada", bloqueo: { resultado: "bloqueado", bloqueo_id: d.j.bloqueo.bloqueo_id } });
    assert.deepEqual(await idsVisibles(yo, tmdbId), []);
    const l = await http("/api/comunidad/bloqueos", t, { accion: "listar" });
    assert.deepEqual(l.j.bloqueados.map((x) => x.bloqueo_id), [d.j.bloqueo.bloqueo_id]);
    const u = await http("/api/comunidad/bloqueos", t, { accion: "desbloquear", bloqueo_id: d.j.bloqueo.bloqueo_id });
    assert.equal(u.j.resultado, "desbloqueado");
    assert.deepEqual(await idsVisibles(yo, tmdbId), [r.version_id]);
  });

  await prueba("rutas · pedir revisión por HTTP: edición sin confirmar → 'requiere_confirmacion'; publicar → 'revision_solicitada'", async () => {
    const { a, r } = await autorCon("http-rev");
    const t = await tokenDe(a);
    const e = await http("/api/comunidad/revision", t, { accion: "editar", resena_id: r.resena_id, version_esperada: r.version_id, texto: TELEFONO, id_intento: randomUUID() });
    assert.equal(e.j.resultado, "requiere_confirmacion");
    const p = await http("/api/comunidad/revision", t, { accion: "publicar", tipo: "movie", tmdb_id: tmdb++, texto: TELEFONO, id_intento: randomUUID() });
    assert.equal(p.j.resultado, "revision_solicitada");
  });
} finally {
  // =========================================================================
  console.log("\n— Limpieza (base compartida) —");
  await cerrarSesiones();
  try {
    const prev = configPrevia;
    config({ modulo_activo: prev.modulo_activo, publicacion_activa: prev.publicacion_activa, top_yumpers_activo: prev.top_yumpers_activo,
      limite_resenas: prev.limite_resenas, limite_ediciones: prev.limite_ediciones, limite_evaluaciones: prev.limite_evaluaciones,
      limite_denuncias: prev.limite_denuncias, limite_bloqueos: prev.limite_bloqueos, admision_por_autor: prev.admision_por_autor,
      admision_global: prev.admision_global, denuncias_filas_por_version: prev.denuncias_filas_por_version, denuncias_por_hora: prev.denuncias_por_hora });
    const us = [...cuentas];
    if (us.length) {
      for (const id of sqlOk(`select id from comunidad.participantes where user_id in (${us.map(q).join(",")})`).split("\n").filter(Boolean)) {
        participantes.add(id);
      }
    }
    for (const u of us) await admin.auth.admin.deleteUser(u, false);
    const todos = [...participantes].map(q).join(",");
    if (todos) {
      sqlOk(`begin;
        delete from comunidad.intentos where participante_id in (${todos});
        delete from comunidad.tramos where evaluador_participante in (${todos}) or autor_participante in (${todos});
        delete from comunidad.evaluaciones where evaluador_participante in (${todos}) or autor_participante in (${todos});
        delete from comunidad.denuncias where denunciante_participante in (${todos}) or autor_participante in (${todos});
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
      || '|' || (select count(*) from pg_locks where locktype = 'advisory' and classid in (7301, 7302, 7303, 7304, 7399))
      || '|' || (select (modulo_activo or publicacion_activa or top_yumpers_activo)::text from comunidad.config)
      || '|' || (select row_to_json(x)::text from (select limite_resenas, limite_ediciones, limite_evaluaciones, limite_denuncias, limite_bloqueos,
           admision_por_autor, admision_global, denuncias_filas_por_version, denuncias_por_hora from comunidad.config) x)`);
    console.log(`   cuentas: ${cuentas.size}; restos (cuentas|participantes|locks|interruptores encendidos|límites): ${restos}`);
    const esperado = `0|0|0|${prev.modulo_activo || prev.publicacion_activa || prev.top_yumpers_activo}|` + JSON.stringify({
      limite_resenas: prev.limite_resenas, limite_ediciones: prev.limite_ediciones, limite_evaluaciones: prev.limite_evaluaciones,
      limite_denuncias: prev.limite_denuncias, limite_bloqueos: prev.limite_bloqueos, admision_por_autor: prev.admision_por_autor,
      admision_global: prev.admision_global, denuncias_filas_por_version: prev.denuncias_filas_por_version, denuncias_por_hora: prev.denuncias_por_hora });
    if (restos !== esperado) { console.log("✖ quedaron restos"); process.exitCode = 1; }
  } catch (e) {
    console.log("✖ limpieza:", e.message); process.exitCode = 1;
  }
}
cerrar();
