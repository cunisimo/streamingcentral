#!/usr/bin/env node
// E3a: escritura de reseñas, ediciones, borrado y votos con las FUNCIONES
// REALES de 014, contra `supabase start`. SÓLO LOCAL.
//
// Uso:
//   node scripts/sala/db-local.mjs
//   (servidor de la app con las claves locales en BASE, por defecto
//    http://localhost:3100, para la sección de rutas)
//   node --env-file=.env.comunidad-local scripts/comunidad/pruebas-escritura.mjs
//
// Qué es real: las funciones `public.comunidad_*` de 014 (llamadas con la
// clave de servicio, como la ruta), el núcleo de la ruta
// (lib/comunidad/escritura-nucleo.ts) con sus adaptadores reales
// (lib/comunidad/escritura-deps.ts), las reglas de E1, el Auth local y las
// sesiones psql concurrentes. Con esto se CIERRAN los gates de E3a (plan
// §5.0): casos 1–4 de §2.2.4, B3a/B3b y actores cruzados, con las funciones de
// producto. Lo que sigue preliminar (E3b/E4/E7) se marca en el nombre.
//
// Los interruptores del módulo se encienden SÓLO durante la corrida y se
// restauran al valor previo al final, pase lo que pase. Cuentas ficticias
// `@comunidad.test`; al final se borran ellas, sus participantes y todo lo
// que crearon. Termina con código 1 si algo falla.
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { arnes, contenedor, leerComo, psql, sqlOk, urlLocal } from "./local.mjs";
import { dockerVerificado } from "./docker-local.mjs";
import { Sesion, barrera, cerrarSesiones, consultar, esperaLock, esperar, BARRERA } from "./sesiones.mjs";
import { escribirResena, firmaPedido } from "../../lib/comunidad/escritura-nucleo.ts";
import { dependenciasEscritura, operacionesComunidad, sha256 } from "../../lib/comunidad/escritura-deps.ts";
import { normalizarTexto } from "../../lib/comunidad/texto.ts";
import { TERMINOS_VERSION } from "../../lib/comunidad/terminos.ts";
import { huella, secretoDuplicados } from "../../lib/comunidad/duplicados.ts";

const URL_API = urlLocal(process.env.NEXT_PUBLIC_SUPABASE_URL);
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SRV = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE = process.env.BASE || "http://localhost:3100";
if (!ANON || !SRV) { console.error("Faltan claves (¿--env-file=.env.comunidad-local?)"); process.exit(2); }
if (!["localhost", "127.0.0.1"].includes(new URL(BASE).hostname)) { console.error(`BASE no es local: ${BASE}`); process.exit(2); }
const docker = dockerVerificado();
console.log(`docker: ${docker.nombre} (${docker.origen}) → ${docker.host}`);
console.log(`base: ${contenedor()} · API ${URL_API} · app ${BASE}\n`);
if (sqlOk("select count(*) from pg_proc where proname = 'comunidad_publicar'") !== "1") {
  console.error("Falta 014_comunidad_escritura.sql (¿node scripts/sala/db-local.mjs?)"); process.exit(2);
}

// E3b (015): toda decisión que guarda lleva la huella de duplicados (HMAC con
// el secreto LOCAL de prueba de .env.comunidad-local). Los gates de abajo
// llaman a la función por SQL, así que la arman igual que la ruta.
const SECRETO = secretoDuplicados();
if (!SECRETO) { console.error("Falta COMUNIDAD_HMAC_DUPLICADOS (¿--env-file=.env.comunidad-local?)"); process.exit(2); }
const decSql = (texto) => JSON.stringify({ resultado: "publicar", version_reglas: "2026-10-24.2", reglas: [], huella: huella(normalizarTexto(texto), SECRETO) });

const opcionesCliente = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(URL_API, SRV, opcionesCliente);
const deps = dependenciasEscritura(admin);
const ops = operacionesComunidad(admin);
const SOLO = process.env.SOLO ?? "";
const { prueba: pruebaArnes, cerrar } = arnes();
const prueba = (n, fn) => (!SOLO || n.includes(SOLO) ? pruebaArnes(n, fn) : Promise.resolve());
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const q = (v) => { if (!UUID.test(v)) throw new Error(`uuid inesperado: ${v}`); return `'${v}'`; };

// Textos (resultado de las reglas de E1 comprobado en escritura.test.ts).
let n = 0;
const BIEN = () => `La vi el fin de semana y me sorprendió para bien (${++n}): buen ritmo, actuaciones creíbles y un final que no regala nada.`;
const TELEFONO = "La vi el fin de semana y me encantó. Si querés hablar de la peli llamame al 11 5566 7788 y lo charlamos tranquilos.";
const SPAM = "Gana plata gratis con cripto: invertí hoy y duplicá tus ganancias en una semana, sorteo exclusivo para los primeros.";
let tmdb = 800;

// ---------------------------------------------------------------------------
// Cuentas, interruptores y lecturas del dueño
// ---------------------------------------------------------------------------
const cuentas = new Set();
const participantes = new Set();   // creados por esta corrida (también los que una baja deja huérfanos)
async function cuenta(etiqueta, { confirmada = true, terminos = true } = {}) {
  const email = `escr-${etiqueta}-${Date.now()}-${randomBytes(3).toString("hex")}@comunidad.test`;
  const password = `Pe-${randomBytes(15).toString("base64url")}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: confirmada });
  if (error) throw error;
  cuentas.add(data.user.id);
  const c = { uid: data.user.id, email, password };
  if (terminos) {
    const r = await ops.aceptarTerminos(c.uid, TERMINOS_VERSION);
    assert.equal(r.resultado, "terminos_aceptados", JSON.stringify(r));
  }
  c.part = sqlOk(`select coalesce(id::text, '') from comunidad.participantes where user_id = ${q(c.uid)}`) || null;
  if (c.part) participantes.add(c.part);
  return c;
}

const config = (cols) => sqlOk(`update comunidad.config set ${Object.entries(cols).map(([k, v]) => `${k} = ${v}`).join(", ")}`);
const configPrevia = sqlOk("select row_to_json(c)::text from comunidad.config c");

const publicar = (c, texto, { tipo = "movie", tmdbId = tmdb++, idIntento = randomUUID() } = {}) =>
  escribirResena(deps, { uid: c.uid, idIntento, texto, accion: { tipo: "publicar", titulo: { tipo, tmdbId } } });
const editar = (c, resenaId, versionEsperada, texto, idIntento = randomUUID()) =>
  escribirResena(deps, { uid: c.uid, idIntento, texto, accion: { tipo: "editar", resenaId, versionEsperada } });

function estadoResena(resenaId) {
  return JSON.parse(sqlOk(`select json_build_object(
    'vigente', r.version_vigente_id, 'borrada', r.borrada_en is not null,
    'versiones', (select count(*) from comunidad.versiones where resena_id = r.id),
    'estados', (select json_object_agg(id, estado) from comunidad.versiones where resena_id = r.id),
    'votos_vigentes', (select count(*) from comunidad.evaluaciones e join comunidad.versiones v on v.id = e.version_id where v.resena_id = r.id and e.retirada_en is null),
    'votos_retirados', (select count(*) from comunidad.evaluaciones e join comunidad.versiones v on v.id = e.version_id where v.resena_id = r.id and e.retirada_en is not null),
    'marcas_reinicio', (select count(distinct e.retirada_en) from comunidad.evaluaciones e join comunidad.versiones v on v.id = e.version_id where v.resena_id = r.id and e.retirada_en is not null),
    'tramos_abiertos', (select count(*) from comunidad.tramos t join comunidad.versiones v on v.id = t.version_id where v.resena_id = r.id and t.vigente_hasta is null),
    'tramos_cerrados', (select count(*) from comunidad.tramos t join comunidad.versiones v on v.id = t.version_id where v.resena_id = r.id and t.vigente_hasta is not null)
  ) from comunidad.resenas r where r.id = ${Number(resenaId)}`));
}
const contador = (c, accion) => Number(sqlOk(`select coalesce(sum(cantidad), 0) from comunidad.contadores
  where participante_id = ${q(c.part)} and accion = '${accion}' and dia = comunidad.dia_ar(clock_timestamp())`));

/** Un autor con una reseña publicada y `nv` votos útiles de otras cuentas. */
async function conVotos(etiqueta, nv = 2) {
  const a = await cuenta(`${etiqueta}-autor`);
  const r = await publicar(a, BIEN());
  assert.equal(r.resultado, "publicada", JSON.stringify(r));
  const votantes = [];
  for (let i = 0; i < nv; i++) {
    const v = await cuenta(`${etiqueta}-v${i}`);
    assert.equal((await ops.votar(v.uid, r.version_id, true)).resultado, "voto_registrado");
    votantes.push(v);
  }
  return { a, r, votantes };
}

// ===========================================================================
config({ modulo_activo: true, publicacion_activa: true });
try {
  // =========================================================================
  console.log("— Matriz de autorización por operación (§2.1.2), con las funciones reales —");
  // Esperado escrito antes: fila A (publicar, editar, votar) bloqueada por
  // cada condición; fila B (borrar, retirar) permitida salvo baja en curso.
  const MATRIZ = {
    suspendido: { A: "suspendida", B: true },
    "correo pendiente": { A: "correo_pendiente", B: true },
    "términos nuevos": { A: "terminos_pendientes", B: true },
    "publicación pausada": { A: "publicacion_pausada", B: true },
    "módulo apagado": { A: "modulo_apagado", B: true },
  };
  for (const [cond, esperado] of Object.entries(MATRIZ)) {
    await prueba(`matriz · ${cond}: A → rechazo '${esperado.A}' sin escribir nada; B (borrar, retirar) → permitidas`, async () => {
      const otro = await cuenta(`m-otro`);
      const rOtro = await publicar(otro, BIEN());
      const c = await cuenta(`m-${cond.length}`);
      const propia = await publicar(c, BIEN());
      assert.equal((await ops.votar(c.uid, rOtro.version_id, true)).resultado, "voto_registrado");
      // La condición.
      if (cond === "suspendido") sqlOk(`insert into comunidad.suspensiones (participante_id, desde) values (${q(c.part)}, now() - interval '1 minute')`);
      if (cond === "correo pendiente") sqlOk(`update auth.users set email_confirmed_at = null where id = ${q(c.uid)}`);
      if (cond === "términos nuevos") sqlOk(`update comunidad.participantes set terminos_version = 'borrador-anterior' where id = ${q(c.part)}`);
      if (cond === "publicación pausada") config({ publicacion_activa: false });
      if (cond === "módulo apagado") config({ modulo_activo: false });
      try {
        const antes = estadoResena(propia.resena_id);
        const a1 = await publicar(c, BIEN());
        const a2 = await editar(c, propia.resena_id, propia.version_id, BIEN());
        const a3 = await ops.votar(c.uid, rOtro.version_id, false);
        for (const a of [a1, a2, a3]) assert.deepEqual([a.resultado, a.motivo], ["rechazo_cuenta", esperado.A], JSON.stringify(a));
        assert.deepEqual(estadoResena(propia.resena_id), antes, "A no escribió nada");
        const b1 = await ops.retirarVoto(c.uid, rOtro.version_id);
        const b2 = await ops.borrar(c.uid, propia.resena_id);
        assert.deepEqual([b1.resultado, b2.resultado], ["voto_retirado", "borrada"]);
      } finally {
        config({ modulo_activo: true, publicacion_activa: true });
      }
    });
  }

  await prueba("matriz · baja en curso: A y B rechazadas con CB001 (baja_en_curso); el paso 1 ya había borrado todo", async () => {
    const otro = await cuenta("mb-otro");
    const rOtro = await publicar(otro, BIEN());
    const c = await cuenta("mb");
    const propia = await publicar(c, BIEN());
    await ops.votar(c.uid, rOtro.version_id, true);
    const { data, error } = await admin.rpc("comunidad_baja_comunitaria", { p_uid: c.uid });
    assert.equal(error, null);
    assert.equal(data.resenas_borradas, 1);
    assert.equal((await publicar(c, BIEN())).resultado, "baja_en_curso");
    assert.equal((await editar(c, propia.resena_id, propia.version_id, BIEN())).resultado, "baja_en_curso");
    for (const f of [() => ops.votar(c.uid, rOtro.version_id, false), () => ops.retirarVoto(c.uid, rOtro.version_id), () => ops.borrar(c.uid, propia.resena_id)]) {
      await assert.rejects(f(), (e) => e.code === "CB001");
    }
  });

  await prueba("matriz · sin términos aceptados: no hay identidad comunitaria y nada se crea", async () => {
    const c = await cuenta("sin-terminos", { terminos: false });
    assert.equal(c.part, null);
    const r = await publicar(c, BIEN());
    assert.deepEqual([r.resultado, r.motivo], ["rechazo_cuenta", "terminos_pendientes"]);
    assert.equal(sqlOk(`select count(*) from comunidad.participantes where user_id = ${q(c.uid)}`), "0");
  });

  await prueba("términos: una versión distinta de la vigente no se acepta", async () => {
    const c = await cuenta("terminos-viejos", { terminos: false });
    const r = await ops.aceptarTerminos(c.uid, "otra-version");
    assert.deepEqual([r.resultado, r.motivo, r.vigente], ["rechazo_cuenta", "terminos_desactualizados", TERMINOS_VERSION]);
    assert.equal(sqlOk(`select count(*) from comunidad.participantes where user_id = ${q(c.uid)}`), "0");
  });

  await prueba("propiedad y reglas de la fila A: no se edita ni borra lo ajeno; no se evalúa la propia; una reseña viva por título", async () => {
    const a = await cuenta("prop-a"), b = await cuenta("prop-b");
    const r = await publicar(a, BIEN(), { tmdbId: 990001 });
    assert.deepEqual((await editar(b, r.resena_id, r.version_id, BIEN())).motivo, "no_encontrada");
    assert.deepEqual((await ops.borrar(b.uid, r.resena_id)).motivo, "no_encontrada");
    assert.deepEqual((await ops.votar(a.uid, r.version_id, true)).motivo, "propia");
    const otra = await publicar(a, BIEN(), { tmdbId: 990001 });
    assert.deepEqual([otra.resultado, otra.motivo, otra.resena_id], ["rechazo_cuenta", "resena_existente", r.resena_id]);
    assert.equal(estadoResena(r.resena_id).versiones, 1);
    // Borrada, se puede volver a escribir sobre el título.
    assert.equal((await ops.borrar(a.uid, r.resena_id)).resultado, "borrada");
    assert.equal((await ops.borrar(a.uid, r.resena_id)).repetido, true, "borrar es idempotente");
    assert.equal((await publicar(a, BIEN(), { tmdbId: 990001 })).resultado, "publicada");
  });

  // =========================================================================
  console.log("\n— Revisión §3.4.1: qué se conserva en cada resultado de una edición —");
  await prueba("§3.4.1 · texto idéntico tras normalizar → 'sin_cambios'; versión y votos intactos; no consume límite", async () => {
    const { a, r } = await conVotos("idem");
    const texto = sqlOk(`select texto from comunidad.versiones where id = ${r.version_id}`);
    const antes = estadoResena(r.resena_id), lim = contador(a, "edicion");
    const e = await editar(a, r.resena_id, r.version_id, `  ${texto}\r\n`);
    assert.equal(e.resultado, "sin_cambios");
    assert.deepEqual(estadoResena(r.resena_id), antes);
    assert.equal(contador(a, "edicion"), lim);
  });

  await prueba("§3.4.1 · rechazo de formato → anterior intacta y publicada, votos intactos, sin tocar la base", async () => {
    const { a, r } = await conVotos("fmt");
    const antes = estadoResena(r.resena_id), lim = contador(a, "edicion");
    for (const t of ["corta", BIEN().replace(" ", "\t")]) {
      assert.equal((await editar(a, r.resena_id, r.version_id, t)).resultado, "rechazo_formato");
    }
    assert.deepEqual(estadoResena(r.resena_id), antes);
    assert.equal(contador(a, "edicion"), lim, "formato no consume límite");
  });

  await prueba("§3.4.1 · rechazo por regla de contenido → anterior intacta, votos intactos; consume UNA edición; no guarda el texto", async () => {
    const { a, r } = await conVotos("cont");
    const antes = estadoResena(r.resena_id), lim = contador(a, "edicion");
    const e = await editar(a, r.resena_id, r.version_id, TELEFONO);
    assert.equal(e.resultado, "rechazo_contenido");
    assert.match(e.mensaje, /teléfono/);
    assert.deepEqual(estadoResena(r.resena_id), antes);
    assert.equal(contador(a, "edicion"), lim + 1);
    assert.equal(sqlOk(`select count(*) from comunidad.versiones where texto like '%5566 7788%'`), "0", "el texto rechazado no se guarda");
  });

  await prueba("§3.4.1 · versión esperada distinta de la vigente → 'conflicto' (version), intacta", async () => {
    const { a, r } = await conVotos("conf");
    const antes = estadoResena(r.resena_id);
    const e = await editar(a, r.resena_id, r.version_id + 1000, BIEN());
    assert.deepEqual([e.resultado, e.motivo, e.version_vigente], ["conflicto", "version", r.version_id]);
    assert.deepEqual(estadoResena(r.resena_id), antes);
  });

  await prueba("§3.4.1 · fallo técnico en la base (texto que el CHECK rechaza, llamado directo) → error; anterior, votos y límite intactos", async () => {
    const { a, r } = await conVotos("tec");
    const antes = estadoResena(r.resena_id), lim = contador(a, "edicion");
    const texto = BIEN().replace(" ", "\t");   // salteando la ruta: la base lo rechaza
    await assert.rejects(deps.editar({ uid: a.uid, resenaId: r.resena_id, versionEsperada: r.version_id, texto,
      decision: { resultado: "publicar", version_reglas: "x", reglas: [] }, idIntento: randomUUID(), hash: sha256(texto) }));
    assert.deepEqual(estadoResena(r.resena_id), antes);
    assert.equal(contador(a, "edicion"), lim, "el consumo de límite se revirtió con la transacción");
  });

  await prueba("§3.4.1 · lock_timeout (otra transacción retiene la reseña > 5 s) → error; anterior y votos intactos", async () => {
    const { a, r } = await conVotos("lt");
    const antes = estadoResena(r.resena_id);
    const H = new Sesion("lt-retiene");
    H.enviar(`begin; select 1 from comunidad.resenas where id = ${r.resena_id} for update; select pg_sleep(8); commit;`);
    await esperar(`exists (select 1 from pg_stat_activity where application_name = '${H.app}' and state = 'active' and query like '%pg_sleep%')`, "H retiene la reseña");
    const t0 = Date.now();
    const e = await editar(a, r.resena_id, r.version_id, BIEN());
    console.log(`   edición con la reseña retenida: ${e.resultado} en ${Date.now() - t0} ms`);
    await H.terminar();
    assert.equal(e.resultado, "error", "55P03 es un rechazo confirmado: se revirtió");
    assert.ok(Date.now() - t0 < 9000, "sin reintento: una sola espera de lock_timeout");
    assert.deepEqual(estadoResena(r.resena_id), antes);
    assert.equal(contador(a, "edicion"), 0, "cupo intacto");
  });

  await prueba("§3.4.1 · edición aceptada y publicada → anterior reemplazada, tramos cerrados, votos reiniciados UNA vez; la nueva en cero", async () => {
    const { a, r } = await conVotos("pub", 3);
    const e = await editar(a, r.resena_id, r.version_id, BIEN());
    assert.equal(e.resultado, "publicada");
    assert.equal(e.votos_reiniciados, 3);
    const s = estadoResena(r.resena_id);
    assert.equal(s.vigente, e.version_id);
    assert.deepEqual(s.estados, { [r.version_id]: "reemplazada", [e.version_id]: "publicada" });
    assert.deepEqual([s.votos_vigentes, s.votos_retirados, s.marcas_reinicio, s.tramos_abiertos, s.tramos_cerrados], [0, 3, 1, 0, 3]);
  });

  await prueba("§3.4.1 · edición aceptada y retenida → anterior reemplazada (deja de verse), votos reiniciados una vez, nueva 'retenida'", async () => {
    const { a, r, votantes } = await conVotos("ret", 2);
    const e = await editar(a, r.resena_id, r.version_id, SPAM);
    assert.equal(e.resultado, "retenida");
    const s = estadoResena(r.resena_id);
    assert.deepEqual(s.estados, { [r.version_id]: "reemplazada", [e.version_id]: "retenida" });
    assert.deepEqual([s.votos_vigentes, s.votos_retirados, s.marcas_reinicio], [0, 2, 1]);
    // E5a: la lectura real (`comunidad_resenas`) como cada cuenta.
    const lectura = leerComo(votantes[0].uid, "movie", Number(sqlOk(`select tmdb_id from comunidad.resenas where id = ${r.resena_id}`)));
    assert.equal(lectura.items.length, 0, "para otros ya no se ve");
    const propia = leerComo(a.uid, "movie", Number(sqlOk(`select tmdb_id from comunidad.resenas where id = ${r.resena_id}`)));
    assert.equal(propia.mia.estado, "retenida", "el autor la ve 'En revisión'");
  });

  await prueba("§3.4.1 · admisión cerrada (cola llena) → la anterior intacta, con sus votos, y 'admision_global' (E3b; el resto de la admisión, en pruebas-moderacion.mjs)", async () => {
    const { a, r } = await conVotos("admision", 1);
    const antes = estadoResena(r.resena_id);
    const prev = sqlOk("select admision_global from comunidad.config");
    config({ admision_global: 0 });
    try {
      const e = await editar(a, r.resena_id, r.version_id, SPAM);
      assert.deepEqual([e.resultado, e.motivo], ["rechazo_cuenta", "admision_global"]);
    } finally {
      config({ admision_global: prev });
    }
    assert.deepEqual(estadoResena(r.resena_id), antes);
  });

  // =========================================================================
  console.log("\n— Idempotencia: respuesta perdida y mismo id_intento —");
  await prueba("reintento tras confirmar (respuesta perdida): el mismo resultado, UNA versión y UN reinicio de votos", async () => {
    const { a, r } = await conVotos("idem-int", 2);
    const id = randomUUID(), texto = BIEN();
    const e1 = await editar(a, r.resena_id, r.version_id, texto, id);
    // La respuesta "se perdió": el cliente reintenta el mismo envío.
    const e2 = await editar(a, r.resena_id, r.version_id, texto, id);
    assert.equal(e1.resultado, "publicada");
    assert.deepEqual({ ...e2, repetido: undefined }, { ...e1, repetido: undefined });
    assert.equal(e2.repetido, true);
    const s = estadoResena(r.resena_id);
    assert.deepEqual([s.versiones, s.votos_retirados, s.marcas_reinicio], [2, 2, 1]);
    assert.equal(contador(a, "edicion"), 1, "una sola edición contada");
    // Lo mismo al crear.
    const idp = randomUUID(), tp = BIEN(), tid = tmdb++;
    const p1 = await publicar(a, tp, { tmdbId: tid, idIntento: idp });
    const p2 = await publicar(a, ` ${tp} `, { tmdbId: tid, idIntento: idp });
    assert.equal(p2.repetido, true);
    assert.equal(p2.resena_id, p1.resena_id);
    assert.equal(sqlOk(`select count(*) from comunidad.resenas where autor_participante = ${q(a.part)} and tmdb_id = ${tid}`), "1");
  });

  await prueba("mismo id_intento con OTRO contenido → conflicto genérico, sin datos del primero; nada cambia", async () => {
    const { a, r } = await conVotos("idem-dist", 1);
    const id = randomUUID();
    const e1 = await editar(a, r.resena_id, r.version_id, BIEN(), id);
    const antes = estadoResena(r.resena_id);
    const e2 = await editar(a, r.resena_id, r.version_id, BIEN(), id);
    assert.deepEqual(e2, { resultado: "conflicto", motivo: "intento" }, "no revela versión ni resultado del primero");
    assert.deepEqual(estadoResena(r.resena_id), antes);
    assert.equal(e1.resultado, "publicada");
    // Otra cuenta con el mismo id no ve ni pisa nada (la clave incluye al participante).
    const b = await cuenta("idem-otra");
    const p = await publicar(b, BIEN(), { idIntento: id });
    assert.equal(p.resultado, "publicada");
  });

  await prueba("reintento de un rechazo de contenido: el mismo rechazo, sin consumir otra edición", async () => {
    const { a, r } = await conVotos("idem-rech", 0);
    const id = randomUUID();
    const lim = contador(a, "edicion");
    assert.equal((await editar(a, r.resena_id, r.version_id, TELEFONO, id)).resultado, "rechazo_contenido");
    const e2 = await editar(a, r.resena_id, r.version_id, TELEFONO, id);
    assert.deepEqual([e2.resultado, e2.repetido], ["rechazo_contenido", true]);
    assert.equal(contador(a, "edicion"), lim + 1);
  });

  await prueba("el hash del intento es el del pedido normalizado (cliente y servidor firman lo mismo)", () => {
    const acc = { tipo: "publicar", titulo: { tipo: "movie", tmdbId: 1 } };
    assert.equal(sha256(firmaPedido(acc, normalizarTexto("  a \r\n"))), sha256(firmaPedido(acc, "a")));
  });

  // =========================================================================
  console.log("\n— A1 · confirmación perdida entre el servidor y Supabase (auditoría E3a) —");
  // El cliente de abajo hace el pedido REAL a PostgREST (la función corre y
  // confirma) y después descarta la respuesta: o lanza como un `fetch` caído
  // (status 0, code "") o la cambia por un 502 sin JSON de un proxy. Es lo que
  // ve el servidor de la app cuando la confirmación se pierde DESPUÉS del commit.
  function clientePerdedor(funciones, perdidas, modo = "red") {
    const estado = { llamadas: 0, perdidas: 0 };
    const f = async (input, init) => {
      const url = typeof input === "string" ? input : String(input.url ?? input);
      const r = await fetch(input, init);
      if (!funciones.some((x) => url.includes(`/rpc/${x}`))) return r;
      estado.llamadas++;
      if (estado.perdidas >= perdidas) return r;
      estado.perdidas++;
      await r.arrayBuffer();
      if (modo === "red") throw new TypeError("fetch failed (respuesta descartada por la prueba)");
      return new Response("<html>502 Bad Gateway</html>", { status: 502, headers: { "Content-Type": "text/html" } });
    };
    const cli = createClient(URL_API, SRV, { ...opcionesCliente, global: { fetch: f } });
    return { deps: dependenciasEscritura(cli), ops: operacionesComunidad(cli), estado };
  }
  const editarCon = (d, c, resenaId, versionEsperada, texto, idIntento = randomUUID()) =>
    escribirResena(d, { uid: c.uid, idIntento, texto, accion: { tipo: "editar", resenaId, versionEsperada } });

  await prueba("A1 · publicar: la respuesta se pierde tras el commit → se reconcilia con el mismo id_intento: 'publicada', UNA reseña, UN cupo", async () => {
    const c = await cuenta("a1-pub");
    const p = clientePerdedor(["comunidad_publicar"], 1);
    const tid = tmdb++;
    const r = await escribirResena(p.deps, { uid: c.uid, idIntento: randomUUID(), texto: BIEN(), accion: { tipo: "publicar", titulo: { tipo: "movie", tmdbId: tid } } });
    assert.deepEqual([r.resultado, r.repetido, p.estado.llamadas, p.estado.perdidas], ["publicada", true, 2, 1], JSON.stringify(r));
    assert.equal(sqlOk(`select count(*) from comunidad.resenas where autor_participante = ${q(c.part)} and tmdb_id = ${tid}`), "1");
    assert.equal(sqlOk(`select count(*) from comunidad.versiones v join comunidad.resenas r on r.id = v.resena_id where r.autor_participante = ${q(c.part)}`), "1");
    assert.equal(contador(c, "resena"), 1, "un solo cupo consumido");
  });

  await prueba("A1 · editar con votos: la respuesta se pierde tras el commit → 'publicada' recuperada; votos reiniciados UNA vez, UNA edición", async () => {
    const { a, r } = await conVotos("a1-ed", 2);
    const p = clientePerdedor(["comunidad_editar"], 1);
    const e = await editarCon(p.deps, a, r.resena_id, r.version_id, BIEN());
    assert.deepEqual([e.resultado, e.repetido, e.votos_reiniciados, p.estado.llamadas], ["publicada", true, 2, 2], JSON.stringify(e));
    const s = estadoResena(r.resena_id);
    assert.deepEqual([s.versiones, s.vigente, s.votos_vigentes, s.votos_retirados, s.marcas_reinicio], [2, e.version_id, 0, 2, 1]);
    assert.equal(contador(a, "edicion"), 1);
  });

  for (const modo of ["red", "502"]) {
    await prueba(`A1 · se pierden las DOS respuestas (${modo}) → 'sin_confirmar' (nunca 'error'); el reintento normal con el mismo id_intento recupera sin duplicar`, async () => {
      const { a, r } = await conVotos(`a1-dos-${modo}`, 2);
      const p = clientePerdedor(["comunidad_editar"], 2, modo);
      const id = randomUUID(), texto = BIEN();
      const e = await editarCon(p.deps, a, r.resena_id, r.version_id, texto, id);
      assert.deepEqual(e, { resultado: "sin_confirmar" });
      assert.equal(p.estado.llamadas, 2, "un solo reintento interno");
      const s1 = estadoResena(r.resena_id);
      assert.deepEqual([s1.versiones, s1.marcas_reinicio], [2, 1], "la edición SÍ había quedado: decir 'no se guardó' habría sido falso");
      // El usuario toca "Reintentar": el cliente reusa el id_intento.
      const e2 = await editar(a, r.resena_id, r.version_id, texto, id);
      assert.deepEqual([e2.resultado, e2.repetido, e2.version_id], ["publicada", true, s1.vigente]);
      assert.deepEqual(estadoResena(r.resena_id), s1, "nada se duplicó ni se reinició otra vez");
      assert.equal(contador(a, "edicion"), 1);
    });
  }

  await prueba("A1 · votar, retirar y borrar con la respuesta perdida tras el commit: se reconcilian sin duplicar", async () => {
    const { a, r } = await conVotos("a1-ops", 0);
    const v = await cuenta("a1-ops-v");
    const pv = clientePerdedor(["comunidad_votar"], 1);
    const rv = await pv.ops.votar(v.uid, r.version_id, true);
    assert.equal(rv.resultado, "sin_cambios", "el reintento ve el voto ya registrado");
    assert.equal(estadoResena(r.resena_id).votos_vigentes, 1);
    assert.equal(contador(v, "evaluacion"), 1);
    const pr = clientePerdedor(["comunidad_retirar_voto"], 1);
    assert.equal((await pr.ops.retirarVoto(v.uid, r.version_id)).resultado, "sin_efecto");
    assert.equal(estadoResena(r.resena_id).votos_vigentes, 0);
    const pb = clientePerdedor(["comunidad_borrar"], 1);
    const rb = await pb.ops.borrar(a.uid, r.resena_id);
    assert.deepEqual([rb.resultado, rb.repetido], ["borrada", true]);
    const todas = clientePerdedor(["comunidad_votar"], 2);
    const otra = await publicar(a, BIEN());
    assert.deepEqual(await todas.ops.votar(v.uid, otra.version_id, true), { resultado: "sin_confirmar" });
    assert.equal(sqlOk(`select count(*) from comunidad.evaluaciones where version_id = ${otra.version_id} and retirada_en is null`), "1", "el voto había quedado");
  });

  await prueba("A1 · un rechazo CONFIRMADO de la base no se reintenta ni se presenta como incierto: 'error', versión, votos y cupo intactos", async () => {
    const { a, r } = await conVotos("a1-conf", 2);
    const antes = estadoResena(r.resena_id), lim = contador(a, "edicion");
    // Un SQLSTATE real (check_violation) por el adaptador: confirmado.
    const texto = BIEN().replace(" ", "\t");
    const e = await deps.editar({ uid: a.uid, resenaId: r.resena_id, versionEsperada: r.version_id, texto,
      decision: { resultado: "publicar", version_reglas: "x", reglas: [] }, idIntento: randomUUID(), hash: sha256(texto) }).catch((x) => x);
    assert.equal(e.confirmado, true, `${e.code} ${e.message}`);
    assert.match(e.code, /^[0-9A-Z]{5}$/);
    // Por el núcleo: la base rechaza el pedido → "error", UNA sola llamada.
    const p = clientePerdedor(["comunidad_editar"], 0);
    const d = { ...p.deps, editar: (x) => p.deps.editar({ ...x, decision: { ...x.decision, resultado: "otra" } }) };
    const r2 = await editarCon(d, a, r.resena_id, r.version_id, BIEN());
    assert.equal(r2.resultado, "error", JSON.stringify(r2));
    assert.equal(p.estado.llamadas, 1, "sin reintento");
    assert.deepEqual(estadoResena(r.resena_id), antes);
    assert.equal(contador(a, "edicion"), lim);
  });

  // =========================================================================
  console.log("\n— Límites por día con carreras —");
  await prueba("límite de reseñas = 2 y 5 envíos simultáneos de la misma cuenta: exactamente 2 entran, nunca se supera", async () => {
    const c = await cuenta("lim");
    config({ limite_resenas: 2 });
    try {
      const rs = await Promise.all([0, 1, 2, 3, 4].map(() => publicar(c, BIEN())));
      const ok = rs.filter((r) => r.resultado === "publicada").length;
      const lim = rs.filter((r) => r.resultado === "rechazo_cuenta" && r.motivo === "limite_diario").length;
      assert.deepEqual([ok, lim], [2, 3], JSON.stringify(rs.map((r) => r.resultado)));
      assert.equal(contador(c, "resena"), 2);
      assert.equal(sqlOk(`select count(*) from comunidad.resenas where autor_participante = ${q(c.part)}`), "2");
    } finally {
      config({ limite_resenas: JSON.parse(configPrevia).limite_resenas });
    }
  });

  await prueba("límite de evaluaciones = 1: 4 votos simultáneos a reseñas distintas → 1 entra", async () => {
    const c = await cuenta("lim-ev");
    const autores = [];
    for (let i = 0; i < 4; i++) { const a = await cuenta(`lim-ev-a${i}`); autores.push(await publicar(a, BIEN())); }
    config({ limite_evaluaciones: 1 });
    try {
      const rs = await Promise.all(autores.map((r) => ops.votar(c.uid, r.version_id, true)));
      assert.equal(rs.filter((r) => r.resultado === "voto_registrado").length, 1, JSON.stringify(rs));
      assert.equal(contador(c, "evaluacion"), 1);
    } finally {
      config({ limite_evaluaciones: JSON.parse(configPrevia).limite_evaluaciones });
    }
  });

  // =========================================================================
  console.log("\n— Gates de integración (§5.0) con las FUNCIONES REALES y sesiones concurrentes —");
  // Técnica: X ejecuta la función real dentro de una transacción abierta (ya
  // tomó y retiene todos sus locks) y se para en una barrera antes de
  // confirmar; Y llama a la otra función real y se observa su espera. Al
  // soltar, X confirma e Y relee.
  const llamar = (f, args) => `select 'R|' || public.${f}(${args})::text;`;
  const enTx = (sql, n) => `begin;\nset local role service_role;\n${sql}\nreset role;\n${BARRERA(n)}\ncommit;`;
  const comoServicio = (sql) => `set role service_role;\n${sql}\nreset role;`;
  const res = (s) => s.out.split("\n").filter((l) => l.startsWith("R|")).map((l) => JSON.parse(l.slice(2)));

  await prueba("gate caso 1 · votar ‖ retirar del mismo evaluador: el segundo espera, relee y retira; igual al serial", async () => {
    const a = await cuenta("g1-a"), ev = await cuenta("g1-ev");
    const r = await publicar(a, BIEN());
    const b = await barrera(31);
    const X = new Sesion("g1-votar"), Y = new Sesion("g1-retirar");
    X.enviar(enTx(llamar("comunidad_votar", `${q(ev.uid)}, ${r.version_id}, true`), 31));
    await esperar(esperaLock(X, "advisory"), "X votó y retiene sus locks");
    Y.enviar(comoServicio(llamar("comunidad_retirar_voto", `${q(ev.uid)}, ${r.version_id}`)));
    await esperar(esperaLock(Y, "advisory"), "Y espera K_CUENTA");
    b.soltar();
    await X.terminar(); await Y.terminar();
    assert.deepEqual([res(X)[0].resultado, res(Y)[0].resultado], ["voto_registrado", "voto_retirado"]);
    const s = estadoResena(r.resena_id);
    assert.deepEqual([s.votos_vigentes, s.votos_retirados, s.tramos_abiertos, s.tramos_cerrados], [0, 1, 0, 1]);
    assert.equal(sqlOk(`select (vigente_hasta > vigente_desde)::text from comunidad.tramos t join comunidad.versiones v on v.id = t.version_id where v.resena_id = ${r.resena_id}`), "true");
  });

  await prueba("gate caso 2a · la edición confirma primero: el voto a la versión vieja espera, relee y se rechaza (version_no_disponible)", async () => {
    const a = await cuenta("g2a-a"), ev = await cuenta("g2a-ev");
    const r = await publicar(a, BIEN());
    const texto = BIEN();
    const b = await barrera(32);
    const X = new Sesion("g2a-editar"), Y = new Sesion("g2a-votar");
    X.enviar(enTx(llamar("comunidad_editar", `${q(a.uid)}, ${r.resena_id}, ${r.version_id}, '${texto}', '${decSql(texto)}'::jsonb, '${randomUUID()}', '${sha256(texto)}'`), 32));
    await esperar(esperaLock(X, "advisory"), "la edición retiene sus locks");
    Y.enviar(comoServicio(llamar("comunidad_votar", `${q(ev.uid)}, ${r.version_id}, true`)));
    await esperar(esperaLock(Y), "el voto espera");
    b.soltar();
    await X.terminar(); await Y.terminar();
    assert.equal(res(X)[0].resultado, "publicada");
    assert.deepEqual([res(Y)[0].resultado, res(Y)[0].motivo], ["rechazo_cuenta", "version_no_disponible"]);
    assert.equal(estadoResena(r.resena_id).votos_vigentes + estadoResena(r.resena_id).votos_retirados, 0, "el voto no escribió nada");
  });

  await prueba("gate caso 2b · el voto confirma primero: la edición espera y lo reinicia (votos_reiniciados = 1)", async () => {
    const a = await cuenta("g2b-a"), ev = await cuenta("g2b-ev");
    const r = await publicar(a, BIEN());
    const texto = BIEN();
    const b = await barrera(33);
    const X = new Sesion("g2b-votar"), Y = new Sesion("g2b-editar");
    X.enviar(enTx(llamar("comunidad_votar", `${q(ev.uid)}, ${r.version_id}, true`), 33));
    await esperar(esperaLock(X, "advisory"), "el voto retiene sus locks");
    Y.enviar(comoServicio(llamar("comunidad_editar", `${q(a.uid)}, ${r.resena_id}, ${r.version_id}, '${texto}', '${decSql(texto)}'::jsonb, '${randomUUID()}', '${sha256(texto)}'`)));
    await esperar(esperaLock(Y), "la edición espera");
    b.soltar();
    await X.terminar(); await Y.terminar();
    assert.equal(res(X)[0].resultado, "voto_registrado");
    assert.deepEqual([res(Y)[0].resultado, res(Y)[0].votos_reiniciados], ["publicada", 1]);
    const s = estadoResena(r.resena_id);
    assert.deepEqual([s.votos_vigentes, s.votos_retirados, s.tramos_abiertos, s.tramos_cerrados], [0, 1, 0, 1]);
  });

  await prueba("gate caso 3 · dos ediciones con la misma versión esperada: la segunda da conflicto; UNA versión nueva", async () => {
    const a = await cuenta("g3");
    const r = await publicar(a, BIEN());
    const t1 = BIEN(), t2 = BIEN();
    const b = await barrera(34);
    const X = new Sesion("g3-e1"), Y = new Sesion("g3-e2");
    X.enviar(enTx(llamar("comunidad_editar", `${q(a.uid)}, ${r.resena_id}, ${r.version_id}, '${t1}', '${decSql(t1)}'::jsonb, '${randomUUID()}', '${sha256(t1)}'`), 34));
    await esperar(esperaLock(X, "advisory"), "E1 retiene");
    Y.enviar(comoServicio(llamar("comunidad_editar", `${q(a.uid)}, ${r.resena_id}, ${r.version_id}, '${t2}', '${decSql(t2)}'::jsonb, '${randomUUID()}', '${sha256(t2)}'`)));
    await esperar(esperaLock(Y, "advisory"), "E2 espera K_CUENTA");
    b.soltar();
    await X.terminar(); await Y.terminar();
    assert.equal(res(X)[0].resultado, "publicada");
    assert.deepEqual([res(Y)[0].resultado, res(Y)[0].motivo], ["conflicto", "version"]);
    assert.equal(estadoResena(r.resena_id).versiones, 2);
  });

  await prueba("gate caso 4 · el mismo id_intento en dos sesiones a la vez: UNA versión, UN reinicio; la segunda devuelve el mismo resultado", async () => {
    const { a, r } = await conVotos("g4", 2);
    const t = BIEN(), id = randomUUID();
    const args = `${q(a.uid)}, ${r.resena_id}, ${r.version_id}, '${t}', '${decSql(t)}'::jsonb, '${id}', '${sha256(t)}'`;
    const b = await barrera(35);
    const X = new Sesion("g4-e1"), Y = new Sesion("g4-e2");
    X.enviar(enTx(llamar("comunidad_editar", args), 35));
    await esperar(esperaLock(X, "advisory"), "E1 retiene");
    Y.enviar(comoServicio(llamar("comunidad_editar", args)));
    await esperar(esperaLock(Y, "advisory"), "E2 espera");
    b.soltar();
    await X.terminar(); await Y.terminar();
    const [r1, r2] = [res(X)[0], res(Y)[0]];
    assert.equal(r1.resultado, "publicada");
    assert.deepEqual([r2.resultado, r2.version_id, r2.repetido], ["publicada", r1.version_id, true]);
    const s = estadoResena(r.resena_id);
    assert.deepEqual([s.versiones, s.votos_retirados, s.marcas_reinicio], [2, 2, 1]);
  });

  await prueba("gate B3a · voto real de U en vuelo con K_CUENTA tomado: la baja de U espera y después lo borra y cierra su tramo", async () => {
    const a = await cuenta("b3a-a"), u = await cuenta("b3a-u");
    const r = await publicar(a, BIEN());
    const b = await barrera(36);
    const X = new Sesion("b3a-votar"), Y = new Sesion("b3a-baja");
    X.enviar(enTx(llamar("comunidad_votar", `${q(u.uid)}, ${r.version_id}, true`), 36));
    await esperar(esperaLock(X, "advisory"), "el voto retiene");
    Y.enviar(comoServicio(llamar("comunidad_baja_comunitaria", q(u.uid))));
    await esperar(esperaLock(Y, "advisory"), "la baja espera K_CUENTA");
    b.soltar();
    await X.terminar(); await Y.terminar();
    assert.equal(res(X)[0].resultado, "voto_registrado");
    const baja = res(Y)[0];
    assert.deepEqual([baja.evaluaciones_borradas, baja.tramos_cerrados], [1, 1]);
  });

  await prueba("gate B3b · baja de U en vuelo: el voto real de U espera K_CUENTA, relee el marcador y se rechaza (CB001); nada escrito", async () => {
    const a = await cuenta("b3b-a"), u = await cuenta("b3b-u");
    const r = await publicar(a, BIEN());
    const b = await barrera(37);
    const X = new Sesion("b3b-baja"), Y = new Sesion("b3b-votar");
    X.enviar(enTx(llamar("comunidad_baja_comunitaria", q(u.uid)), 37));
    await esperar(esperaLock(X, "advisory"), "la baja retiene K_CUENTA");
    Y.enviar(comoServicio(llamar("comunidad_votar", `${q(u.uid)}, ${r.version_id}, true`)));
    await esperar(esperaLock(Y, "advisory"), "el voto espera K_CUENTA");
    b.soltar();
    await X.terminar(); await Y.terminar();
    assert.match(Y.err, /ERROR:\s+baja_en_curso/);
    assert.equal(estadoResena(r.resena_id).votos_vigentes, 0);
  });

  await prueba("gate actores cruzados · A evalúa la reseña de B y B la de A con las funciones reales: los dos confirman, sin deadlock", async () => {
    const a = await cuenta("cr-a"), bb = await cuenta("cr-b");
    const ra = await publicar(a, BIEN()), rb = await publicar(bb, BIEN());
    const ba = await barrera(38);
    const X = new Sesion("cr-a-vota"), Y = new Sesion("cr-b-vota");
    X.enviar(enTx(llamar("comunidad_votar", `${q(a.uid)}, ${rb.version_id}, true`), 38));
    await esperar(esperaLock(X, "advisory"), "A votó y retiene");
    Y.enviar(comoServicio(llamar("comunidad_votar", `${q(bb.uid)}, ${ra.version_id}, true`)));
    await esperar(esperaLock(Y), "B espera la fila que A tiene");
    ba.soltar();
    await X.terminar(); await Y.terminar();
    assert.doesNotMatch(X.err + Y.err, /deadlock|ERROR/);
    assert.deepEqual([res(X)[0].resultado, res(Y)[0].resultado], ["voto_registrado", "voto_registrado"]);
  });

  await prueba("gate actores cruzados (carga) · 10 rondas de pares cruzados simultáneos sin coordinar: 20 votos, 0 errores", async () => {
    const pares = [];
    for (let i = 0; i < 10; i++) {
      const a = await cuenta(`crc-a${i}`), bb = await cuenta(`crc-b${i}`);
      pares.push({ a, bb, ra: await publicar(a, BIEN()), rb: await publicar(bb, BIEN()) });
    }
    const rs = await Promise.all(pares.flatMap(({ a, bb, ra, rb }) => [ops.votar(a.uid, rb.version_id, true), ops.votar(bb.uid, ra.version_id, true)]));
    assert.equal(rs.filter((r) => r.resultado === "voto_registrado").length, 20, JSON.stringify(rs.filter((r) => r.resultado !== "voto_registrado")));
  });

  // =========================================================================
  console.log("\n— Rutas HTTP (servidor local) —");
  const tokenDe = async (c) => {
    const sb = createClient(URL_API, ANON, opcionesCliente);
    const { data, error } = await sb.auth.signInWithPassword({ email: c.email, password: c.password });
    if (error) throw error;
    return data.session.access_token;
  };
  const http = async (metodo, ruta, token, cuerpo) => {
    const r = await fetch(`${BASE}${ruta}`, {
      method: metodo, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    return { status: r.status, j: await r.json().catch(() => null), cache: r.headers.get("cache-control") ?? "" };
  };

  await prueba("rutas · sin sesión → 401 en las cinco; con sesión y cuerpo inválido → 400; sin caché", async () => {
    const rutas = [["POST", "/api/comunidad/resenas"], ["POST", "/api/comunidad/resenas/borrar"], ["POST", "/api/comunidad/votos"],
      ["POST", "/api/comunidad/terminos"], ["GET", "/api/comunidad/resenas/lista?tipo=movie&id=603"]];
    for (const [m, ruta] of rutas) {
      const r = await http(m, ruta, null, m === "POST" ? {} : undefined);
      assert.equal(r.status, 401, `${m} ${ruta}`);
      assert.match(r.cache, /no-store/);
    }
    const c = await cuenta("http-inv");
    const t = await tokenDe(c);
    for (const [ruta, cuerpo] of [["/api/comunidad/resenas", { accion: "x" }], ["/api/comunidad/votos", { version_id: "1", voto: "util" }],
      ["/api/comunidad/resenas/borrar", { resena_id: -1 }], ["/api/comunidad/terminos", { version: "" }]]) {
      assert.equal((await http("POST", ruta, t, cuerpo)).status, 400, ruta);
    }
    assert.equal((await http("GET", "/api/comunidad/resenas/lista?tipo=serie&id=1", t)).status, 400);
  });

  await prueba("rutas · publicar, rechazar, retener y editar de punta a punta con el JWT; el uid sale del token, no del cuerpo", async () => {
    const c = await cuenta("http"), otro = await cuenta("http-otro");
    const t = await tokenDe(c);
    const tid = tmdb++;
    const p = await http("POST", "/api/comunidad/resenas", t, { accion: "publicar", tipo: "movie", tmdb_id: tid, texto: BIEN(), id_intento: randomUUID(), p_uid: otro.uid, uid: otro.uid });
    assert.deepEqual([p.status, p.j.resultado], [200, "publicada"]);
    assert.equal(sqlOk(`select p.user_id from comunidad.resenas r join comunidad.participantes p on p.id = r.autor_participante where r.id = ${p.j.resena_id}`), c.uid, "autor = el del token");
    const rc = await http("POST", "/api/comunidad/resenas", t, { accion: "editar", resena_id: p.j.resena_id, version_esperada: p.j.version_id, texto: TELEFONO, id_intento: randomUUID() });
    assert.deepEqual([rc.j.resultado, /teléfono/.test(rc.j.mensaje)], ["rechazo_contenido", true]);
    const rt = await http("POST", "/api/comunidad/resenas", t, { accion: "editar", resena_id: p.j.resena_id, version_esperada: p.j.version_id, texto: SPAM, id_intento: randomUUID() });
    assert.equal(rt.j.resultado, "retenida");
    const f = await http("POST", "/api/comunidad/resenas", t, { accion: "publicar", tipo: "movie", tmdb_id: tmdb++, texto: "corta", id_intento: randomUUID() });
    assert.deepEqual([f.status, f.j.resultado], [200, "rechazo_formato"]);
    // E5a: la lectura protegida (con la sesión del lector).
    const lectura = await http("GET", `/api/comunidad/resenas/lista?tipo=movie&id=${tid}`, t);
    assert.deepEqual([lectura.status, lectura.j.activo, lectura.j.mia.estado], [200, true, "retenida"]);
    const b = await http("POST", "/api/comunidad/resenas/borrar", t, { resena_id: p.j.resena_id });
    assert.equal(b.j.resultado, "borrada");
  });

  await prueba("rutas · votar y retirar por HTTP; con el módulo apagado la lectura responde { activo: false } y nada más", async () => {
    const a = await cuenta("http-v-a"), ev = await cuenta("http-v-ev");
    const tid = tmdb++;
    const r = await publicar(a, BIEN(), { tmdbId: tid });
    const t = await tokenDe(ev);
    assert.equal((await http("POST", "/api/comunidad/votos", t, { version_id: r.version_id, voto: "util" })).j.resultado, "voto_registrado");
    const l = await http("GET", `/api/comunidad/resenas/lista?tipo=movie&id=${tid}`, t);
    assert.deepEqual([l.j.items[0].utiles, l.j.items[0].total, l.j.items[0].mi_voto], [1, 1, "util"]);
    assert.equal((await http("POST", "/api/comunidad/votos", t, { version_id: r.version_id, voto: "retirar" })).j.resultado, "voto_retirado");
    config({ modulo_activo: false });
    try {
      const off = await http("GET", `/api/comunidad/resenas/lista?tipo=movie&id=${tid}`, t);
      assert.deepEqual(off.j, { activo: false });
    } finally {
      config({ modulo_activo: true });
    }
  });

  await prueba("acceso directo · un JWT de usuario no lee ni escribe las tablas por REST ni ejecuta las funciones por RPC", async () => {
    const c = await cuenta("directo");
    const t = await tokenDe(c);
    const h = { apikey: ANON, Authorization: `Bearer ${t}`, "Content-Type": "application/json" };
    for (const tabla of ["resenas", "versiones", "evaluaciones", "intentos"]) {
      for (const perfil of [null, "comunidad"]) {
        const r = await fetch(`${URL_API}/rest/v1/${tabla}?select=*`, { headers: perfil ? { ...h, "Accept-Profile": perfil } : h });
        assert.ok(r.status >= 400, `${tabla} ${perfil}: ${r.status}`);
      }
    }
    for (const f of ["comunidad_publicar", "comunidad_editar", "comunidad_votar", "comunidad_borrar", "comunidad_retirar_voto", "comunidad_aceptar_terminos", "comunidad_leer_titulo"]) {
      const r = await fetch(`${URL_API}/rest/v1/rpc/${f}`, { method: "POST", headers: h, body: JSON.stringify({ p_uid: c.uid }) });
      const cuerpo = await r.text();
      assert.ok((r.status === 401 || r.status === 403 || r.status === 404) && /42501|permission denied|PGRST202/.test(cuerpo), `${f}: ${r.status} ${cuerpo.slice(0, 80)}`);
    }
  });
} finally {
  // =========================================================================
  console.log("\n— Limpieza (base compartida) —");
  await cerrarSesiones();
  try {
    const prev = JSON.parse(configPrevia);
    config({ modulo_activo: prev.modulo_activo, publicacion_activa: prev.publicacion_activa, top_yumpers_activo: prev.top_yumpers_activo,
      limite_resenas: prev.limite_resenas, limite_ediciones: prev.limite_ediciones, limite_evaluaciones: prev.limite_evaluaciones });
    const us = [...cuentas];
    // Los participantes vinculados a estas cuentas y los que registró la corrida
    // (una baja los deja sin user_id). Nada que no haya creado esta corrida.
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
        delete from comunidad.resenas where autor_participante in (${todos});
        delete from comunidad.bloqueos where bloqueador_participante in (${todos}) or bloqueado_participante in (${todos});
        delete from comunidad.contadores where participante_id in (${todos});
        delete from comunidad.suspensiones where participante_id in (${todos});
        delete from comunidad.participantes where id in (${todos});
        commit;`);
    }
    const restos = sqlOk(`select (select count(*) from auth.users where id in (${us.map(q).join(",") || "null::uuid"}))
      || '|' || (select count(*) from comunidad.participantes where id in (${todos || "null::uuid"}))
      || '|' || (select count(*) from pg_stat_activity where application_name like 'conc-%')
      || '|' || (select count(*) from pg_locks where locktype = 'advisory' and classid in (7301, 7302, 7399))
      || '|' || (select (modulo_activo or publicacion_activa or top_yumpers_activo)::text from comunidad.config)`);
    console.log(`   cuentas: ${cuentas.size}; restos (cuentas|participantes|sesiones|locks|interruptores encendidos): ${restos}`);
    if (restos !== `0|0|0|0|${prev.modulo_activo || prev.publicacion_activa || prev.top_yumpers_activo}`) { console.log("✖ quedaron restos"); process.exitCode = 1; }
  } catch (e) {
    console.log("✖ limpieza:", e.message); process.exitCode = 1;
  }
}
void consultar;
cerrar();
