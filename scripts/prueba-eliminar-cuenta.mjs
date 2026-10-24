#!/usr/bin/env node
// Prueba integral del borrado de cuenta, de punta a punta. SÓLO LOCAL.
//
//   node scripts/sala/db-local.mjs
//   npm run dev        (con las variables de .env.comunidad-local, ver abajo)
//   node --env-file=.env.comunidad-local scripts/prueba-eliminar-cuenta.mjs
//
// Crea una cuenta descartable, la puebla con TODOS los tipos de dato, la borra
// atravesando el endpoint real y verifica que no quedó nada. La cuenta nace y
// muere dentro de esta corrida.
//
// 🔴 SÓLO CONTRA `supabase start` (auditoría de E2a, A1). Desde 022,
// `user_reviews` no se puede escribir ni leer con la sesión del usuario, y en
// la base local los roles de la API tampoco tienen permisos de fila sobre
// las demás tablas heredadas. No se reabren policies ni permisos para que
// esta prueba pase: TODAS las fixtures heredadas las prepara y las cuenta el
// DUEÑO de la base local por `psql` en el contenedor verificado
// (scripts/comunidad/local.mjs). Eso sólo existe en local, así que con una
// URL o un BASE que no sean locales el script se niega a empezar, antes de
// crear nada. Lo que se prueba de punta a punta es el ENDPOINT: sesión,
// contraseña, los dos pasos del borrado y las cascadas.
//
// 🔴 NINGÚN ERROR SE CONVIERTE EN CERO. Cada paso de la preparación y cada
// lectura comprueba su error y corta; los conteos iniciales tienen que ser
// EXACTAMENTE los esperados. Antes, un insert rechazado y un conteo `null`
// (permiso denegado) se leían como "0 filas" y la prueba pasaba sin haber
// preparado ni comprobado nada.
//
// El servidor (BASE, por defecto http://localhost:3000) tiene que correr con
// las claves LOCALES: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY y
// SUPABASE_SERVICE_ROLE_KEY de .env.comunidad-local. Este script comprueba que
// BASE sea local, pero no puede ver con qué variables arrancó el servidor: si
// el servidor apunta a otra base, el login de la cuenta recién creada falla y
// el borrado responde 401, y la prueba falla.
//
// LA CONTRASEÑA ES ALEATORIA Y NO SE IMPRIME NUNCA. La SERVICE ROLE KEY no la
// usa este script: la usa el servidor.
import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import { sqlOk, urlLocal } from "./comunidad/local.mjs";

const url = urlLocal(process.env.NEXT_PUBLIC_SUPABASE_URL);
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const BASE = process.env.BASE || "http://localhost:3000";
if (!anon) { console.error("Falta NEXT_PUBLIC_SUPABASE_ANON_KEY (¿--env-file=.env.comunidad-local?)"); process.exit(2); }
if (!["localhost", "127.0.0.1"].includes(new URL(BASE).hostname)) {
  console.error(`BASE no es local: ${BASE}`); process.exit(2);
}

const cliente = () => createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

/** Corta la corrida: un paso de preparación o de lectura falló. */
function abortar(paso, detalle) {
  console.error(`\n✖ ${paso}: ${detalle}\nLa prueba NO es válida: no se llegó a comprobar el borrado.`);
  process.exit(1);
}
/** El resultado de supabase-js sin error, o abortar. */
function sinError(paso, { data, error, count, status }) {
  if (error) abortar(paso, `${error.code ?? status ?? ""} ${error.message}`);
  return { data, count };
}

// Títulos reales de TMDB, para que las filas se parezcan a las de un usuario.
const VOTOS = [[603, "movie", 3], [1396, "tv", 2], [27205, "movie", 1]];
const ITEMS = [[155, "movie", "list"], [1399, "tv", "watched"], [496243, "movie", "dismissed"]];
const VISTAS = [[603, "movie"], [1396, "tv"], [155, "movie"]];
const ESPERADO = { profiles: 1, votes: 3, user_items: 3, view_history: 3, user_reviews: 1 };
const TABLAS = Object.keys(ESPERADO);
const COLUMNA = { profiles: "id" };

const ok = (b) => (b ? "OK" : "FALLA");
let fallas = 0;
const chequear = (etiqueta, cond, detalle = "") => {
  if (!cond) fallas++;
  console.log(`  [${ok(cond)}] ${etiqueta}${detalle ? "  " + detalle : ""}`);
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Filas de cada tabla: las de `uid` y las de todos los demás (rol dueño, local). */
function conteoDueno(uid) {
  if (!UUID.test(uid)) abortar("conteo", `uid con forma inesperada: ${uid}`);
  const partes = TABLAS.map((t) =>
    `(select count(*) filter (where ${COLUMNA[t] ?? "user_id"} = '${uid}') || ':' || count(*) filter (where ${COLUMNA[t] ?? "user_id"} <> '${uid}') from public.${t})`);
  const extra = [
    `(select count(*) from auth.users where id = '${uid}')`,
    `(select count(*) from comunidad.participantes where user_id = '${uid}')`,
    `(select count(*) from comunidad.bajas_en_curso where user_id = '${uid}')`,
  ];
  let fila;
  try { fila = sqlOk(`select ${[...partes, ...extra].join(" || '|' || ")}`); }
  catch (e) { abortar("conteo con el dueño de la base local", e.message); }
  const v = fila.split("|");
  const r = { propias: {}, ajenas: {} };
  TABLAS.forEach((t, i) => { const [p, a] = v[i].split(":").map(Number); r.propias[t] = p; r.ajenas[t] = a; });
  [r.auth, r.participantes, r.marcadores] = v.slice(TABLAS.length).map(Number);
  return r;
}

// --- 1. Crear ---------------------------------------------------------------
const marca = randomUUID().slice(0, 8);
const email = `prueba-borrado-${marca}@comunidad.test`;
const password = `Pb-${randomBytes(18).toString("base64url")}-!9`;

const sb = cliente();
const { data: alta } = sinError("alta de la cuenta", await sb.auth.signUp({
  email, password, options: { data: { display_name: "CUENTA DE PRUEBA - BORRAR" } },
}));
if (!alta.user) abortar("alta de la cuenta", "sin usuario");
const uid = alta.user.id;
console.log(`\nCuenta descartable: ${email}`);
console.log(`id: ${uid}\n`);

const { data: sesion } = sinError("inicio de sesión", await sb.auth.signInWithPassword({ email, password }));
if (!sesion.session) abortar("inicio de sesión", "sin sesión");
const token = sesion.session.access_token;

// --- 2. Poblar --------------------------------------------------------------
// TODO con el DUEÑO de la base local, en una transacción. `platforms` es
// integer[] (ids de TMDB, como guarda la app); la versión anterior mandaba
// ['n', 'd'], fallaba siempre y el error se ignoraba. En `supabase start`
// los roles de la API no tienen SELECT/INSERT/UPDATE sobre estas tablas (el
// ACL por defecto local les deja sólo `Dxtm`; ver el informe de E2a), así que
// la sesión del usuario no puede prepararlas, y no se abren permisos para que
// pueda. La versión anterior "poblaba" con la sesión, ignoraba el 42501 y
// seguía como si nada.
const valores = (filas) => filas.map((f) => `(${f.join(", ")})`).join(", ");
try {
  sqlOk(`begin;
update public.profiles set display_name = 'CUENTA DE PRUEBA - BORRAR', country_code = 'AR', platforms = array[8, 337] where id = '${uid}';
insert into public.votes (user_id, tmdb_id, tipo, rating) values ${valores(VOTOS.map(([id, tipo, r]) => [`'${uid}'`, id, `'${tipo}'`, r]))};
insert into public.user_items (user_id, tmdb_id, tipo, kind) values ${valores(ITEMS.map(([id, tipo, k]) => [`'${uid}'`, id, `'${tipo}'`, `'${k}'`]))};
insert into public.view_history (user_id, tmdb_id, tipo, viewed_at) values ${valores(VISTAS.map(([id, tipo]) => [`'${uid}'`, id, `'${tipo}'`, "now()"]))};
insert into public.user_reviews (user_id, tmdb_id, tipo, texto) values ('${uid}', 603, 'movie', 'Reseña de prueba.');
commit;`);
} catch (e) { abortar("fixtures heredadas (dueño de la base local)", e.message); }

// Una lectura denegada es un ERROR, no "0 filas". Es justo lo que la versión
// anterior convertía en cero (`count ?? 0`): se comprueba que la respuesta
// trae el error y ningún conteo.
const lecturaDenegada = await sb.from("user_reviews").select("*", { count: "exact", head: true }).eq("user_id", uid);
chequear("la lectura denegada de user_reviews llega como error, no como conteo",
  !!lecturaDenegada.error && lecturaDenegada.count === null,
  lecturaDenegada.error ? `${lecturaDenegada.error.code ?? lecturaDenegada.status}` : `count=${lecturaDenegada.count}`);

const antes = conteoDueno(uid);
console.log("Poblada (dueño):", JSON.stringify(antes.propias));
for (const t of TABLAS) {
  if (antes.propias[t] !== ESPERADO[t]) abortar("cantidades iniciales", `${t}: ${antes.propias[t]}, se esperaba ${ESPERADO[t]}`);
}
if (antes.auth !== 1) abortar("cantidades iniciales", `auth.users: ${antes.auth}`);
chequear("cantidades iniciales exactas", true, JSON.stringify(ESPERADO));
let kinds;
try { kinds = sqlOk(`select string_agg(kind, ',' order by kind) from public.user_items where user_id = '${uid}'`); }
catch (e) { abortar("lectura de kinds", e.message); }
chequear("están los tres kinds de user_items", kinds === "dismissed,list,watched", kinds);

// --- 3. El endpoint real ----------------------------------------------------
const llamar = async (headers, body) => {
  const r = await fetch(`${BASE}/api/cuenta/eliminar`, {
    method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
  });
  let j = {}; try { j = await r.json(); } catch { /* sin cuerpo */ }
  return { status: r.status, j, cache: r.headers.get("cache-control") ?? "" };
};

console.log("\nCapas de seguridad:");
const sinToken = await llamar({}, { password });
chequear("sin token → 401", sinToken.status === 401, JSON.stringify(sinToken.j));
const tokenMalo = await llamar({ Authorization: "Bearer no-es-un-token" }, { password });
chequear("token inválido → 401", tokenMalo.status === 401, JSON.stringify(tokenMalo.j));
const sinPass = await llamar({ Authorization: `Bearer ${token}` }, {});
chequear("sin contraseña → 400", sinPass.status === 400, JSON.stringify(sinPass.j));
chequear("Cache-Control: no-store en los errores", sinToken.cache.includes("no-store"), sinToken.cache);

console.log("\nContraseña incorrecta: no borra y la sesión sigue viva");
const mala = await llamar({ Authorization: `Bearer ${token}` }, { password: "no-es-la-clave" });
chequear("→ 401 password-invalida", mala.status === 401 && mala.j?.error === "password-invalida", JSON.stringify(mala.j));
const trasMala = conteoDueno(uid);
chequear("nada cambió, ni siquiera el marcador de baja", JSON.stringify(trasMala.propias) === JSON.stringify(antes.propias) && trasMala.marcadores === 0 && trasMala.auth === 1);
chequear("el token sigue sirviendo", !!(await sb.auth.getUser(token)).data.user);

console.log("\nBorrado real:");
const bien = await llamar({ Authorization: `Bearer ${token}` }, { password });
chequear("→ 200 { ok: true }", bien.status === 200 && bien.j?.ok === true, JSON.stringify(bien.j));
chequear("Cache-Control: no-store", bien.cache.includes("no-store"), bien.cache);
if (bien.status === 503) console.log("     ↑ falta SUPABASE_SERVICE_ROLE_KEY en el entorno del servidor");

// --- 4. Verificar -----------------------------------------------------------
console.log("\nDespués del borrado:");
const reintento = await cliente().auth.signInWithPassword({ email, password });
chequear("la cuenta ya no puede iniciar sesión", !reintento.data.session, reintento.error?.message ?? "");
const tokenMuerto = await sb.auth.getUser(token);
chequear("el token viejo ya no vale", !tokenMuerto.data.user);

const despues = conteoDueno(uid);
chequear("auth.users sin la cuenta", despues.auth === 0);
for (const t of TABLAS) {
  chequear(`${t}: 0 filas de la cuenta (cascada)`, despues.propias[t] === 0, String(despues.propias[t]));
  chequear(`${t}: las filas ajenas no cambiaron`, despues.ajenas[t] === antes.ajenas[t], `${antes.ajenas[t]} → ${despues.ajenas[t]}`);
}
chequear("sin participante comunitario con ese user_id", despues.participantes === 0);
chequear("sin marcador de baja (cayó con la cuenta)", despues.marcadores === 0);

console.log(`\nfallas: ${fallas}\n`);
process.exit(fallas === 0 ? 0 : 1);
