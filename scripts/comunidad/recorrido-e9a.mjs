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
//   - guarda en `.recorrido-e9a.local.json`, ANTES de cada cambio, lo
//     necesario para deshacerlo (configuración, permisos a conceder, marca de
//     la editorial, reloj);
//   - instala el REGISTRO DE PROPIEDAD (recorrido-e9a-registro.sql): toda
//     cuenta @recorrido.test que nazca mientras dure el recorrido —también
//     las que el dueño registre a mano—, el participante que nazca vinculado
//     a ella (queda registrado aunque una baja lo desvincule) y sus versiones;
//   - enciende módulo, publicación y Top Yumpers (muestreo y purga, NO);
//   - crea una cuenta B con reseña (para el cambio de cuenta), seis autores
//     con nombre comunitario, cuatro votantes y un admin con DOS factores TOTP;
//   - siete reseñas ajenas en "El club de la pelea" (movie 550) con votos
//     distintos para que "Más útiles" y "Recientes" difieran, una más en
//     "Matrix" (movie 603) y una denuncia abierta para el panel;
//   - votos en septiembre de 2026 con el reloj de solo-local-reloj.sql
//     (instalado y quitado acá mismo), para que el Top Yumpers tenga ranking;
//   - una reseña editorial ficticia en 550, marcada con el id de la corrida;
//   - concede temporalmente los permisos de API que la base de `supabase start`
//     no trae y la app necesita fuera de la comunidad (perfil, pulgares, listas,
//     plataformas, reseña editorial). Producción los tiene (no verificado: E0).
// `codigo`: el código TOTP vigente del admin, para entrar a /admin/moderacion.
// `limpiar` (auditoría E9a, A1): borra SÓLO lo registrado como propio y las
//   filas que lo referencian; nunca por fecha, por participante sin cuenta ni
//   por mes nuevo. Un ranking se borra sólo si todo lo que lo forma es propio.
//   Guarda los objetivos en el archivo ANTES de borrar: un reintento usa esos
//   y los del registro, nada más. Actividad ajena sobre lo propio (votos,
//   denuncias, bloqueos, decisiones de otro admin), en cualquier mes, la
//   detiene ANTES de borrar. Con cualquier discrepancia sale con 1 y
//   conserva el archivo y el registro para reintentar; repetirla es seguro.
//
// RECORRIDO_E9A_CORTE=<paso> corta a propósito en ese paso (sólo pruebas de
// interrupción: pruebas-recorrido-e9a.mjs).
//
// Las contraseñas y el secreto TOTP quedan en `.recorrido-e9a.local.json`
// (ignorado por Git). Son de cuentas ficticias locales; nada de esto sirve en
// Producción.
import { createClient } from "@supabase/supabase-js";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { aplicarArchivo, sqlOk, urlLocal } from "./local.mjs";
import { decidirActividadAjena, decidirMeses, evaluarVerificacion, sqlBorrarComunidad, sqlBorrarParticipantes, sqlActividadAjena, sqlMeses, sqlOrdenesMixtas, sqlResiduos, unirObjetivos } from "./recorrido-e9a-nucleo.mjs";
import { dependenciasEscritura, dependenciasNombre, operacionesComunidad } from "../../lib/comunidad/escritura-deps.ts";
import { escribirResena } from "../../lib/comunidad/escritura-nucleo.ts";
import { cambiarNombre } from "../../lib/comunidad/nombre-nucleo.ts";
import { TERMINOS_VERSION } from "../../lib/comunidad/terminos.ts";

const ARCHIVO = process.env.RECORRIDO_E9A_ARCHIVO ?? ".recorrido-e9a.local.json";
const DOMINIO = "recorrido.test";
const MES = "2026-09-01";
const T = `comunidad.corte_de_mes('${MES}')`;
const PRINCIPAL = 550, SECUNDARIO = 603;
const SWITCHES = ["modulo_activo", "publicacion_activa", "top_yumpers_activo", "muestreo_activo"];
// Tablas de la comunidad (conteos informativos: la actividad ajena los mueve).
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
const hayRegistro = () => sqlOk("select count(*) from pg_namespace where nspname = 'recorrido_e9a'") !== "0";
const hayReloj = () => sqlOk("select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'solo_local' and c.relname = 'reloj'") !== "0";
const lista = (sql) => JSON.parse(sqlOk(`select coalesce(json_agg(x), '[]')::text from (${sql}) t(x)`));
const leerRegistro = () => ({
  cuentas: lista("select user_id::text from recorrido_e9a.cuentas"),
  participantes: lista("select id::text from recorrido_e9a.participantes"),
  versiones: lista("select id::text from recorrido_e9a.versiones"),
});
function cortar(paso) {
  if (process.env.RECORRIDO_E9A_CORTE === paso) throw new Error(`CORTE DE PRUEBA en "${paso}"`);
}

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
  if (existsSync(ARCHIVO)) throw new Error(`Ya hay un recorrido preparado o a medio limpiar (${ARCHIVO}). Corré "limpiar" primero.`);
  if (hayRegistro()) throw new Error("El registro recorrido_e9a está instalado sin archivo de estado: revisalo a mano antes de preparar.");
  if (sqlOk(`select count(*) from auth.users where email like ${q(`%@${DOMINIO}`)}`) !== "0") throw new Error(`Hay cuentas @${DOMINIO} sin registro de propiedad: revisalas a mano.`);
  if (sqlOk(`select count(*) from comunidad.tramos where mes_primera_positiva = '${MES}'`) !== "0") throw new Error("septiembre tiene tramos ajenos");
  if (sqlOk(`select count(*) from comunidad.top_meses where mes = '${MES}'`) !== "0") throw new Error("septiembre ya está consolidado");
  if (sqlOk("select count(*) from pg_namespace where nspname = 'solo_local'") !== "0") throw new Error("el reloj solo_local está instalado: quitalo antes");

  // El registro de recuperación se escribe ANTES de cada cambio que deshace.
  const estado = {
    version: 2, corrida: randomUUID(), fase: "preparando", t0: sqlOk("select now()::text"),
    previa: JSON.parse(sqlOk("select row_to_json(c)::text from comunidad.config c")),
    purga: sqlOk("select purga_activa::text from comunidad.purga_config"),
    antes: conteos(),
    meses: JSON.parse(sqlOk("select coalesce(json_agg(mes::text), '[]')::text from comunidad.top_meses")),
    registro: "instalando", concedidos: [], editorial: null, reloj: "no", cuentas: {}, limpieza: null,
  };
  const guardar = () => writeFileSync(ARCHIVO, JSON.stringify(estado, null, 2));
  guardar();
  aplicarArchivo("scripts/comunidad/recorrido-e9a-registro.sql");
  estado.registro = "instalado"; guardar();

  const faltan = [];
  for (const [rol, tabla, privs] of PERMISOS) for (const p of privs.split(", ")) if (!permisoDe(rol, tabla, p)) faltan.push([rol, tabla, p]);
  estado.concedidos = faltan; guardar();
  for (const [rol, tabla, p] of faltan) sqlOk(`grant ${p} on ${tabla} to ${rol}`);

  if (sqlOk(`select count(*) from public.editorial_reviews where tmdb_id = ${PRINCIPAL} and tipo = 'movie'`) === "0") {
    estado.editorial = { marca: estado.corrida }; guardar();
    sqlOk(`insert into public.editorial_reviews (tmdb_id, tipo, titulo, texto, rating, publicado)
      values (${PRINCIPAL}, 'movie', 'El club de la pelea', ${q(`Reseña editorial FICTICIA del recorrido local de E9a (${estado.corrida}). No es un texto de Yump.`)}, 8.0, true)`);
  }
  sqlOk("update comunidad.config set modulo_activo = true, publicacion_activa = true, top_yumpers_activo = true where id");

  estado.reloj = "instalado"; guardar();
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
      estado.cuentas.autores = autores; guardar();
      if (i === 1) cortar("preparar-autores");
    }
    reloj(`${T} - interval '18 days'`);
    const b = await crear("cuenta-b", { nombre: "Butaca Crítica", avatar: "claqueta" });
    b.version = await publicar(b, PRINCIPAL, TEXTOS[6]);
    autores[0].version603 = await publicar(autores[0], SECUNDARIO, TEXTO_603);
    const votantes = [];
    for (let i = 0; i < 4; i++) votantes.push(await crear(`votante${i}`, { nombre: `Votante ${i + 1}` }));
    estado.cuentas = { b, autores, votantes }; guardar();
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
    estado.cuentas.admin = admin; guardar();
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
  } finally {
    aplicarArchivo("scripts/comunidad/solo-local-reloj-quitar.sql");
    estado.reloj = "quitado"; guardar();
  }
  estado.fase = "preparado"; guardar();
  console.log(`Preparado. Credenciales en ${ARCHIVO} (cuentas ficticias locales).`);
  console.log(`  ficha principal: http://localhost:3100/titulo/movie/${PRINCIPAL}  (7 reseñas ajenas + la editorial ficticia)`);
  console.log(`  segunda ficha:   http://localhost:3100/titulo/movie/${SECUNDARIO}`);
  console.log(`  Top Yumpers de septiembre de 2026, una denuncia abierta en /admin/moderacion`);
  console.log(`  registrá tu cuenta nueva con un correo que termine en @${DOMINIO} (queda registrada como propia del recorrido)`);
} else if (accion === "codigo") {
  const e = JSON.parse(readFileSync(ARCHIVO, "utf8"));
  console.log(totp(e.cuentas.admin.factores[0].secreto));
} else if (accion === "estado") {
  const reg = hayRegistro() ? sqlOk(`select json_build_object('cuentas', (select count(*) from recorrido_e9a.cuentas),
    'participantes', (select count(*) from recorrido_e9a.participantes), 'versiones', (select count(*) from recorrido_e9a.versiones))::text`) : "no instalado";
  console.log("archivo:", existsSync(ARCHIVO) ? JSON.parse(readFileSync(ARCHIVO, "utf8")).fase : "no hay", "| registro:", reg);
  console.log(sqlOk(`select json_build_object(
    'cuentas_dominio', (select count(*) from auth.users where email like ${q(`%@${DOMINIO}`)}),
    'interruptores', (select json_build_object('modulo', modulo_activo, 'publicacion', publicacion_activa, 'top', top_yumpers_activo, 'muestreo', muestreo_activo) from comunidad.config),
    'purga', (select purga_activa from comunidad.purga_config),
    'resenas_550', (select count(*) from comunidad.resenas where tipo = 'movie' and tmdb_id = ${PRINCIPAL} and borrada_en is null),
    'denuncias_abiertas', (select count(*) from comunidad.denuncias where estado = 'abierta'),
    'septiembre', (select count(*) from comunidad.top_resultados where mes = '${MES}'))::text`));
} else if (accion === "limpiar") {
  if (!existsSync(ARCHIVO)) {
    throw new Error(`No hay ${ARCHIVO}: no sé qué restaurar ni qué es propio.${hayRegistro() ? " El registro recorrido_e9a sigue instalado: revisalo a mano." : ""}`);
  }
  const e = JSON.parse(readFileSync(ARCHIVO, "utf8"));
  if (e.version !== 2) throw new Error(`${ARCHIVO} es de otra versión del script: revisalo a mano.`);
  const guardar = () => writeFileSync(ARCHIVO, JSON.stringify(e, null, 2));
  const registro = hayRegistro();
  e.limpieza ??= { intentos: 0, objetivos: null, resultado: null };
  e.limpieza.intentos++;

  if (e.limpieza.resultado !== "verificada") {
    if (!registro && !e.limpieza.objetivos && e.registro !== "instalando") {
      throw new Error("Falta el registro recorrido_e9a y no hay objetivos guardados: no sé qué es propio. Nada se borró.");
    }
    // 1. Objetivos: lo ya guardado ∪ el registro. Se guardan ANTES de borrar.
    const objetivos = unirObjetivos(e.limpieza.objetivos, registro ? leerRegistro() : { cuentas: [], participantes: [], versiones: [] });
    e.limpieza.objetivos = objetivos; e.limpieza.resultado = "en curso"; guardar();
    console.log(`objetivos: ${objetivos.cuentas.length} cuenta(s), ${objetivos.participantes.length} participante(s), ${objetivos.versiones.length} versión(es)`);
    cortar("tras-objetivos");

    // 2. Rankings: sólo los meses formados enteramente por datos propios.
    const meses = decidirMeses(JSON.parse(sqlOk(sqlMeses(objetivos))), e.meses);
    e.limpieza.mesesPropios = [...new Set([...(e.limpieza.mesesPropios ?? []), ...meses.borrar])];
    e.limpieza.discrepanciasMeses = meses.discrepancias; guardar();
    // Un ranking con datos ajenos, o actividad ajena (votos, denuncias,
    // bloqueos, decisiones) que el borrado de lo propio arrastraría en
    // cualquier mes, consolidado o no, es una discrepancia: no se borra NADA
    // hasta que alguien la resuelva.
    const ajena = decidirActividadAjena(JSON.parse(sqlOk(sqlActividadAjena(objetivos))));
    const detener = [...meses.discrepancias, ...ajena];
    if (detener.length) {
      e.limpieza.resultado = "discrepancia"; e.limpieza.problemas = detener; guardar();
      console.log("LIMPIEZA DETENIDA antes de borrar. Se conservan el archivo y el registro para reintentar:");
      for (const p of detener) console.log(`  - ${p}`);
      process.exit(1);
    }

    // 3. Comunidad, en una transacción; 4. cuentas propias; 5. participantes.
    sqlOk(sqlBorrarComunidad(objetivos, meses.borrar));
    cortar("tras-comunidad");
    for (const id of objetivos.cuentas) {
      if (sqlOk(`select count(*) from auth.users where id = ${q(id)}`) === "0") continue;
      const { error } = await srv.auth.admin.deleteUser(id, false);
      if (error) throw error;
    }
    sqlOk(sqlBorrarParticipantes(objetivos));
    cortar("tras-cuentas");

    // 6. Lo que preparar cambió fuera de la comunidad, según lo registrado.
    if (e.reloj === "instalado" && hayReloj()) aplicarArchivo("scripts/comunidad/solo-local-reloj-quitar.sql");
    const v = e.previa;
    sqlOk(`update comunidad.config set ${SWITCHES.map((k) => `${k} = ${v[k]}`).join(", ")} where id`);
    sqlOk(`update comunidad.purga_config set purga_activa = ${e.purga} where id`);
    if (e.editorial?.marca) sqlOk(`delete from public.editorial_reviews where tmdb_id = ${PRINCIPAL} and tipo = 'movie' and texto like ${q(`%(${e.editorial.marca})%`)}`);
    for (const [rol, tabla, p] of e.concedidos) sqlOk(`revoke ${p} on ${tabla} from ${rol}`);

    // 7. Verificación. Con cualquier problema, el archivo y el registro quedan.
    const configAhora = JSON.parse(sqlOk("select row_to_json(c)::text from comunidad.config c"));
    const problemas = evaluarVerificacion({
      residuos: JSON.parse(sqlOk(sqlResiduos(objetivos, meses.conservar))),
      sinRegistrar: lista(`select email from auth.users where email like ${q(`%@${DOMINIO}`)}${registro ? " and id not in (select user_id from recorrido_e9a.cuentas)" : ""}`),
      configIgual: SWITCHES.every((k) => configAhora[k] === v[k]),
      purgaIgual: sqlOk("select purga_activa::text from comunidad.purga_config") === e.purga,
      permisosPendientes: e.concedidos.filter(([r, t, p]) => permisoDe(r, t, p)).map((x) => x.join(" ")),
      editorialRestante: e.editorial?.marca ? sqlOk(`select count(*) from public.editorial_reviews where texto like ${q(`%(${e.editorial.marca})%`)}`) !== "0" : false,
      relojPropio: e.reloj === "instalado" && hayReloj(),
      discrepanciasMeses: meses.discrepancias,
    });
    const mixtas = sqlOk(sqlOrdenesMixtas(objetivos));
    if (mixtas !== "0") console.log(`AVISO: ${mixtas} orden(es) "Más útiles" mezclan versiones propias y ajenas; se conservan (caché con vencimiento).`);
    cortar("tras-verificar");
    if (problemas.length) {
      e.limpieza.resultado = "discrepancia"; e.limpieza.problemas = problemas; guardar();
      console.log("LIMPIEZA INCOMPLETA. Se conservan el archivo y el registro para reintentar:");
      for (const p of problemas) console.log(`  - ${p}`);
      process.exit(1);
    }
    e.limpieza.resultado = "verificada"; guardar();
  }
  // 8. Recién con la limpieza verificada: quitar el registro y el archivo.
  aplicarArchivo("scripts/comunidad/recorrido-e9a-registro-quitar.sql");
  const despues = conteos();
  const distintos = Object.keys(e.antes).filter((k) => e.antes[k] !== despues[k]);
  console.log(`limpieza verificada (intento ${e.limpieza.intentos}): ${e.limpieza.objetivos.cuentas.length} cuenta(s) y ${e.limpieza.objetivos.participantes.length} participante(s) propios, sin restos; meses propios borrados: ${(e.limpieza.mesesPropios ?? []).join(", ") || "ninguno"}`);
  console.log("conteos globales de la comunidad (informativo; la actividad ajena los mueve):", distintos.length ? distintos.map((k) => `${k} ${e.antes[k]}→${despues[k]}`).join(", ") : "iguales a los de antes");
  console.log("interruptores:", sqlOk("select modulo_activo || '/' || publicacion_activa || '/' || top_yumpers_activo || '/' || muestreo_activo from comunidad.config"),
    "| purga:", sqlOk("select purga_activa::text from comunidad.purga_config"), "| permisos restaurados: sí | registro quitado: sí");
  unlinkSync(ARCHIVO);
} else {
  console.log("uso: preparar | codigo | estado | limpiar");
  process.exitCode = 2;
}
