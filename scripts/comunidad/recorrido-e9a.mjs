// Recorrido integrado de E9a (reseñas de la comunidad) en la base LOCAL, con
// datos ficticios. SÓLO LOCAL: exige la URL de `supabase start` y nunca lee
// `.env.local`.
//
//   node --env-file=.env.comunidad-local scripts/comunidad/recorrido-e9a.mjs preparar
//   node --env-file=.env.comunidad-local scripts/comunidad/recorrido-e9a.mjs codigo
//   node --env-file=.env.comunidad-local scripts/comunidad/recorrido-e9a.mjs estado
//   node --env-file=.env.comunidad-local scripts/comunidad/recorrido-e9a.mjs limpiar
//
// `preparar`:
//   - enciende módulo, publicación y Top Yumpers (muestreo y purga, NO);
//   - crea cuentas `@recorrido.test`: una cuenta B con reseña (para el cambio
//     de cuenta), seis autores con nombre comunitario, cuatro votantes y un
//     admin con DOS factores TOTP reales;
//   - siete reseñas ajenas en "El club de la pelea" (movie 550), con votos
//     distintos para que "Más útiles" y "Recientes" difieran, una más en "Matrix"
//     (movie 603) y una denuncia abierta para el panel;
//   - votos marcados en septiembre de 2026 con el reloj de solo-local-reloj.sql
//     (instalado y quitado acá mismo), para que el Top Yumpers tenga ranking;
//   - una reseña editorial ficticia en 550, para ver "Yump" primero;
//   - concede temporalmente los permisos de API que la base de `supabase start`
//     no trae y la app necesita fuera de la comunidad (perfil, pulgares, listas,
//     plataformas, reseña editorial). Producción los tiene (no verificado: E0).
// `codigo`: el código TOTP vigente del admin, para entrar a /admin/moderacion.
// `limpiar`: borra las cuentas `@recorrido.test` (también las que se hayan
//   registrado a mano durante la prueba) y todo lo comunitario que generaron,
//   restaura interruptores y permisos, y compara los conteos con los de antes.
//
// Las contraseñas y el secreto TOTP quedan en `.recorrido-e9a.local.json`
// (ignorado por Git). Son de cuentas ficticias locales; nada de esto sirve en
// Producción.
import { createClient } from "@supabase/supabase-js";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { aplicarArchivo, sqlOk, urlLocal } from "./local.mjs";
import { dependenciasEscritura, dependenciasNombre, operacionesComunidad } from "../../lib/comunidad/escritura-deps.ts";
import { escribirResena } from "../../lib/comunidad/escritura-nucleo.ts";
import { cambiarNombre } from "../../lib/comunidad/nombre-nucleo.ts";
import { TERMINOS_VERSION } from "../../lib/comunidad/terminos.ts";

const ARCHIVO = ".recorrido-e9a.local.json";
const DOMINIO = "recorrido.test";
const MES = "2026-09-01";
const T = `comunidad.corte_de_mes('${MES}')`;
const PRINCIPAL = 550, SECUNDARIO = 603;
// Tablas de la comunidad que se comparan antes y después (las de config, no).
const TABLAS = ["participantes", "resenas", "versiones", "evaluaciones", "tramos", "denuncias", "denuncias_cerradas",
  "denuncias_excedentes", "decisiones", "bloqueos", "suspensiones", "intentos", "contadores", "huellas", "corroboraciones",
  "bajas_en_curso", "ordenes_utiles", "ordenes_utiles_tramos", "top_meses", "top_resultados", "meses_sin_historial", "purga_ejecuciones"];
// Permisos de API que la base local no trae (Producción sí; sin verificar en E0).
const PERMISOS = [
  ["authenticated", "public.profiles", "select, insert, update"],
  ["authenticated", "public.votes", "select, insert, update, delete"],
  ["authenticated", "public.user_items", "select, insert, update, delete"],
  ["authenticated", "public.view_history", "select, insert, update, delete"],
  ["anon", "public.editorial_reviews", "select"],
  ["authenticated", "public.editorial_reviews", "select"],
  ["anon", "public.providers", "select"],
  ["authenticated", "public.providers", "select"],
];

const URL_API = urlLocal(process.env.NEXT_PUBLIC_SUPABASE_URL), ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const opc = { auth: { persistSession: false, autoRefreshToken: false } };
const srv = createClient(URL_API, process.env.SUPABASE_SERVICE_ROLE_KEY, opc);
const deps = dependenciasEscritura(srv), ops = operacionesComunidad(srv);
const q = (s) => `'${String(s).replaceAll("'", "''")}'`;

function totp(s) {
  const a = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let b = "";
  for (const c of s.replace(/=+$/, "").toUpperCase()) b += a.indexOf(c).toString(2).padStart(5, "0");
  const k = Buffer.from(b.match(/.{8}/g).map((x) => parseInt(x, 2))); const ct = Buffer.alloc(8);
  ct.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", k).update(ct).digest(); const o = h[h.length - 1] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, "0");
}
const reloj = (expr) => sqlOk(`insert into solo_local.reloj (id, fijo) values (true, ${expr}) on conflict (id) do update set fijo = excluded.fijo`);
const conteos = () => JSON.parse(sqlOk(`select json_build_object(${TABLAS.map((t) => `'${t}', (select count(*) from comunidad.${t})`).join(", ")})::text`));
const permisoDe = (rol, tabla, priv) => sqlOk(`select has_table_privilege(${q(rol)}, ${q(tabla)}, ${q(priv)})::text`) === "true";

async function crear(et, { terminos = true, nombre = null, avatar = null } = {}) {
  const email = `e9a-${et}-${randomBytes(2).toString("hex")}@${DOMINIO}`;
  const password = `Rm-${randomBytes(9).toString("base64url")}`;
  const { data, error } = await srv.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const uid = data.user.id;
  sqlOk(`update public.profiles set onboarding_completed = true${avatar ? `, avatar_seed = ${q(avatar)}` : ""} where id = ${q(uid)}`);
  if (terminos) await ops.aceptarTerminos(uid, TERMINOS_VERSION);
  if (nombre) {
    const r = await cambiarNombre(dependenciasNombre(srv), { uid, nombre, idIntento: randomUUID() });
    if (r.resultado !== "nombre_cambiado") throw new Error(`nombre ${nombre}: ${JSON.stringify(r)}`);
  }
  return { et, uid, email, password, nombre };
}

async function publicar(c, tmdbId, texto) {
  const r = await escribirResena(deps, { uid: c.uid, idIntento: randomUUID(), texto, accion: { tipo: "publicar", titulo: { tipo: "movie", tmdbId } } });
  if (r.resultado !== "publicada") throw new Error(`publicar ${c.et}: ${JSON.stringify(r)}`);
  return Number(sqlOk(`select v.id from comunidad.versiones v join comunidad.participantes p on p.id = v.autor_participante
    where p.user_id = ${q(c.uid)} and v.estado = 'publicada' order by v.id desc limit 1`));
}

const TEXTOS = [
  "La vi de nuevo después de muchos años y sigue funcionando. El ritmo del primer acto es impecable y las actuaciones sostienen todo.",
  "Me pareció más inteligente de lo que recordaba. El guion se toma su tiempo para construir a los personajes y después juega con eso.",
  "Visualmente es muy potente, pero el último tramo me resultó un poco largo. Igual la recomiendo para verla con atención y sin apuro.",
  "No es para cualquier momento: pide estar despierto y con ganas de pensar. La música acompaña muy bien y el montaje está buenísimo.",
  "La primera vez no me gustó tanto; ahora la disfruté mucho más. Tiene detalles que se descubren recién en la segunda vuelta, de verdad.",
  "Un clásico que envejeció bien. Algunas escenas se sienten de otra época, pero el conjunto es sólido y el final sigue sorprendiendo.",
  "Me gustó la fotografía y cómo usa la voz en off. No la pondría entre mis favoritas, pero entiendo perfecto por qué tanta gente la quiere.",
];
const TEXTO_B = "La recomiendo para una noche tranquila. Los diálogos son filosos, el reparto está muy bien elegido y la puesta tiene mucha personalidad.";
const TEXTO_603 = "Sigue siendo una película de acción muy bien pensada. Las escenas de pelea se entienden siempre y la idea central todavía da para charlar.";

const accion = process.argv[2];

if (accion === "preparar") {
  if (existsSync(ARCHIVO)) throw new Error(`Ya hay un recorrido preparado (${ARCHIVO}). Corré "limpiar" primero.`);
  if (sqlOk(`select count(*) from auth.users where email like ${q(`%@${DOMINIO}`)}`) !== "0") throw new Error(`Hay cuentas @${DOMINIO} de un recorrido anterior: corré "limpiar".`);
  if (sqlOk(`select count(*) from comunidad.tramos where mes_primera_positiva = '${MES}'`) !== "0") throw new Error("septiembre tiene tramos ajenos");
  if (sqlOk(`select count(*) from comunidad.top_meses where mes = '${MES}'`) !== "0") throw new Error("septiembre ya está consolidado");
  if (sqlOk("select count(*) from pg_namespace where nspname = 'solo_local'") !== "0") throw new Error("el reloj solo_local está instalado: quitalo antes");
  const t0 = sqlOk("select now()::text");
  const previa = JSON.parse(sqlOk("select row_to_json(c)::text from comunidad.config c"));
  const purga = sqlOk("select purga_activa::text from comunidad.purga_config");
  const antes = conteos();
  const meses = JSON.parse(sqlOk("select coalesce(json_agg(mes), '[]')::text from comunidad.top_meses"));
  const concedidos = [];
  for (const [rol, tabla, privs] of PERMISOS) {
    for (const p of privs.split(", ")) if (!permisoDe(rol, tabla, p)) { sqlOk(`grant ${p} on ${tabla} to ${rol}`); concedidos.push([rol, tabla, p]); }
  }
  const editorial = sqlOk(`select count(*) from public.editorial_reviews where tmdb_id = ${PRINCIPAL} and tipo = 'movie'`) === "0"
    ? sqlOk(`insert into public.editorial_reviews (tmdb_id, tipo, titulo, texto, rating, publicado)
        values (${PRINCIPAL}, 'movie', 'El club de la pelea', 'Reseña editorial FICTICIA del recorrido local de E9a. No es un texto de Yump.', 8.0, true) returning id`)
    : null;
  // Se guarda ANTES de crear nada: si algo falla a mitad, `limpiar` igual sabe qué restaurar.
  const estado = { t0, previa, purga, antes, meses, concedidos, editorial, cuentas: {} };
  const guardar = () => writeFileSync(ARCHIVO, JSON.stringify(estado, null, 2));
  guardar();
  sqlOk("update comunidad.config set modulo_activo = true, publicacion_activa = true, top_yumpers_activo = true where id");

  aplicarArchivo("scripts/comunidad/solo-local-reloj.sql");
  try {
    reloj(`${T} - interval '25 days'`);
    const nombres = [["Cinéfila del Sur", "lola"], ["Pochoclo Nocturno", "popcorn"], ["Claqueta Rota", "claqueta"],
      ["Mirada Lenta", "rico"], ["Segunda Vuelta", "monster"], ["Sala Vacía", "lola"]];
    const autores = [];
    for (const [i, [nombre, avatar]] of nombres.entries()) {
      reloj(`${T} - interval '${25 - i} days'`);
      const a = await crear(`autor${i}`, { nombre, avatar });
      a.version = await publicar(a, PRINCIPAL, TEXTOS[i]);
      autores.push(a);
    }
    reloj(`${T} - interval '18 days'`);
    const b = await crear("cuenta-b", { nombre: "Butaca Crítica", avatar: "claqueta" });
    b.version = await publicar(b, PRINCIPAL, TEXTOS[6]);
    autores[0].version603 = await publicar(autores[0], SECUNDARIO, TEXTO_603);
    const votantes = [];
    for (let i = 0; i < 4; i++) votantes.push(await crear(`votante${i}`, { nombre: `Votante ${i + 1}` }));
    // Votos: los más votados no son los más recientes, así los dos órdenes difieren.
    const plan = [[autores[0], 4], [autores[1], 3], [autores[2], 1], [b, 2], [autores[4], 1]];
    for (const [k, [a, n]] of plan.entries()) {
      for (let j = 0; j < n; j++) { reloj(`${T} - interval '${10 - j} days' + interval '${k} hours'`); await ops.votar(votantes[j].uid, a.version, true); }
    }
    reloj(`${T} - interval '3 days'`);
    await ops.votar(votantes[3].uid, autores[3].version, false);
    sqlOk("delete from solo_local.reloj");
    // Una denuncia abierta para que el panel no arranque vacío.
    await ops.denunciar(votantes[0].uid, autores[5].version, "spam", null);
    const admin = await crear("admin", { terminos: false });
    sqlOk(`update public.profiles set is_admin = true, display_name = 'Admin recorrido' where id = ${q(admin.uid)}`);
    const cli = createClient(URL_API, ANON, opc);
    const s = await cli.auth.signInWithPassword({ email: admin.email, password: admin.password });
    if (s.error) throw s.error;
    admin.factores = [];
    for (const n of ["principal", "respaldo"]) {
      const { data: f, error } = await cli.auth.mfa.enroll({ factorType: "totp", friendlyName: n });
      if (error) throw error;
      const { data: ch } = await cli.auth.mfa.challenge({ factorId: f.id });
      const r = await cli.auth.mfa.verify({ factorId: f.id, challengeId: ch.id, code: totp(f.totp.secret) });
      if (r.error) throw r.error;
      admin.factores.push({ id: f.id, secreto: f.totp.secret });
    }
    estado.cuentas = { b, autores, votantes, admin };
    guardar();
  } finally {
    aplicarArchivo("scripts/comunidad/solo-local-reloj-quitar.sql");
  }
  console.log(`Preparado. Credenciales en ${ARCHIVO} (cuentas ficticias locales).`);
  console.log(`  ficha principal: http://localhost:3100/titulo/movie/${PRINCIPAL}  (7 reseñas ajenas + la editorial ficticia)`);
  console.log(`  segunda ficha:   http://localhost:3100/titulo/movie/${SECUNDARIO}`);
  console.log(`  Top Yumpers de septiembre de 2026, una denuncia abierta en /admin/moderacion`);
  console.log(`  registrá tu cuenta nueva con un correo que termine en @${DOMINIO} (así la borra "limpiar")`);
} else if (accion === "codigo") {
  const e = JSON.parse(readFileSync(ARCHIVO, "utf8"));
  console.log(totp(e.cuentas.admin.factores[0].secreto));
} else if (accion === "estado") {
  console.log(sqlOk(`select json_build_object(
    'cuentas_recorrido', (select count(*) from auth.users where email like ${q(`%@${DOMINIO}`)}),
    'interruptores', (select json_build_object('modulo', modulo_activo, 'publicacion', publicacion_activa, 'top', top_yumpers_activo, 'muestreo', muestreo_activo) from comunidad.config),
    'purga', (select purga_activa from comunidad.purga_config),
    'resenas_550', (select count(*) from comunidad.resenas where tipo = 'movie' and tmdb_id = ${PRINCIPAL} and borrada_en is null),
    'denuncias_abiertas', (select count(*) from comunidad.denuncias where estado = 'abierta'),
    'septiembre', (select count(*) from comunidad.top_resultados where mes = '${MES}'))::text`));
} else if (accion === "limpiar") {
  const e = existsSync(ARCHIVO) ? JSON.parse(readFileSync(ARCHIVO, "utf8")) : null;
  if (!e) throw new Error(`No hay ${ARCHIVO}: no sé qué restaurar.`);
  if (sqlOk("select count(*) from pg_namespace where nspname = 'solo_local'") !== "0") aplicarArchivo("scripts/comunidad/solo-local-reloj-quitar.sql");
  const uids = sqlOk(`select coalesce(string_agg(quote_literal(id::text), ','), '') from auth.users where email like ${q(`%@${DOMINIO}`)}`);
  // Participantes del recorrido: los de esas cuentas y los que quedaron sin
  // cuenta (bajas) creados después de preparar.
  const ps = sqlOk(`select coalesce(string_agg(quote_literal(id::text), ','), '') from comunidad.participantes
    where ${uids ? `user_id in (${uids}) or ` : ""}(user_id is null and creado_en >= ${q(e.t0)})`);
  const P = ps || "null";
  const U = uids || "null";
  sqlOk(`begin;
    delete from comunidad.ordenes_utiles_tramos where orden_id in (select id from comunidad.ordenes_utiles where creado_en >= ${q(e.t0)} and tipo = 'movie' and tmdb_id in (${PRINCIPAL}, ${SECUNDARIO}));
    delete from comunidad.ordenes_utiles where creado_en >= ${q(e.t0)} and tipo = 'movie' and tmdb_id in (${PRINCIPAL}, ${SECUNDARIO});
    delete from comunidad.top_resultados where mes not in (select x::date from json_array_elements_text(${q(JSON.stringify(e.meses))}::json) x);
    delete from comunidad.top_meses where mes not in (select x::date from json_array_elements_text(${q(JSON.stringify(e.meses))}::json) x);
    delete from comunidad.decisiones where participante_id in (${P}) or admin_id in (${U}) or cuenta_id in (${U})
      or version_id in (select id from comunidad.versiones where autor_participante in (${P}));
    delete from comunidad.denuncias where autor_participante in (${P}) or denunciante_participante in (${P});
    delete from comunidad.denuncias_cerradas where denunciante_participante in (${P});
    delete from comunidad.denuncias_excedentes where autor_participante in (${P});
    delete from comunidad.corroboraciones where autor_participante in (${P});
    delete from comunidad.tramos where evaluador_participante in (${P}) or autor_participante in (${P});
    delete from comunidad.evaluaciones where evaluador_participante in (${P}) or autor_participante in (${P});
    delete from comunidad.huellas where autor_participante in (${P});
    delete from comunidad.intentos where participante_id in (${P});
    delete from comunidad.bloqueos where bloqueador_participante in (${P}) or bloqueado_participante in (${P});
    delete from comunidad.suspensiones where participante_id in (${P});
    delete from comunidad.contadores where participante_id in (${P});
    update comunidad.resenas set version_vigente_id = null where autor_participante in (${P});
    delete from comunidad.versiones where autor_participante in (${P});
    delete from comunidad.resenas where autor_participante in (${P});
    commit;`);
  for (const id of uids ? uids.split(",").map((x) => x.slice(1, -1)) : []) {
    const { error } = await srv.auth.admin.deleteUser(id, false);
    if (error) throw error;
  }
  sqlOk(`delete from comunidad.participantes where id in (${P}) or (user_id is null and creado_en >= ${q(e.t0)})`);
  sqlOk(`delete from comunidad.bajas_en_curso where user_id in (${U}) or (iniciada_en >= ${q(e.t0)} and user_id not in (select id from auth.users))`);
  const v = e.previa;
  sqlOk(`update comunidad.config set modulo_activo = ${v.modulo_activo}, publicacion_activa = ${v.publicacion_activa},
    top_yumpers_activo = ${v.top_yumpers_activo}, muestreo_activo = ${v.muestreo_activo} where id`);
  sqlOk(`update comunidad.purga_config set purga_activa = ${e.purga} where id`);
  if (e.editorial) sqlOk(`delete from public.editorial_reviews where id = ${q(e.editorial)}`);
  for (const [rol, tabla, p] of e.concedidos) sqlOk(`revoke ${p} on ${tabla} from ${rol}`);
  const despues = conteos();
  const distintos = Object.keys(e.antes).filter((k) => e.antes[k] !== despues[k]);
  const otros = sqlOk(`select count(*) from auth.users where created_at >= ${q(e.t0)}`);
  console.log("cuentas @recorrido.test borradas:", uids ? uids.split(",").length : 0);
  console.log("conteos de la comunidad iguales a los de antes:", distintos.length ? `NO (${distintos.map((k) => `${k} ${e.antes[k]}→${despues[k]}`).join(", ")})` : "sí");
  console.log("interruptores:", sqlOk("select modulo_activo || '/' || publicacion_activa || '/' || top_yumpers_activo || '/' || muestreo_activo from comunidad.config"),
    "| purga:", sqlOk("select purga_activa::text from comunidad.purga_config"),
    "| permisos restaurados:", e.concedidos.every(([r, t, p]) => !permisoDe(r, t, p)) ? "sí" : "NO");
  if (otros !== "0") console.log(`AVISO: hay ${otros} cuenta(s) creadas después de preparar con otro dominio; no se tocaron.`);
  unlinkSync(ARCHIVO);
} else {
  console.log("uso: preparar | codigo | estado | limpiar");
  process.exitCode = 2;
}
