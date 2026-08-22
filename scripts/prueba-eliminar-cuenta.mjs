#!/usr/bin/env node
// Prueba integral del borrado de cuenta, de punta a punta.
//
//   node --env-file=.env.local scripts/prueba-eliminar-cuenta.mjs
//
// Crea una cuenta descartable, la puebla con TODOS los tipos de dato, la borra
// atravesando el endpoint real y verifica que no quedó nada. Un solo comando: la
// cuenta nace y muere dentro de esta corrida.
//
// LA CONTRASEÑA ES ALEATORIA Y NO SE IMPRIME NUNCA. Vive en memoria mientras
// corre el script y se va con el proceso: no queda en el repositorio, ni en un
// informe, ni en el historial de la terminal. Una contraseña predecible en una
// cuenta que existe unos segundos igual es una contraseña publicada.
//
// NO TOCA NINGUNA CUENTA EXISTENTE. Todo lo que escribe va con la sesión de la
// cuenta que acaba de crear, así que RLS (`auth.uid() = user_id`) lo impide
// físicamente. Lo único que mira de otras es un CONTEO de filas del usuario de
// control, para probar que no cambió.
//
// La SERVICE ROLE KEY no la usa este script: la usa el servidor. Acá no se lee,
// no se imprime y no se pasa por ningún lado.
import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const BASE = process.env.BASE || "http://localhost:3000";
if (!url || !anon) { console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY"); process.exit(1); }

const cliente = () => createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

// Títulos reales de TMDB, para que las filas se parezcan a las de un usuario.
const VOTOS = [[603, "movie", 3], [1396, "tv", 2], [27205, "movie", 1]];
const ITEMS = [[155, "movie", "list"], [1399, "tv", "watched"], [496243, "movie", "dismissed"]];
const VISTAS = [[603, "movie"], [1396, "tv"], [155, "movie"]];

const ok = (b) => (b ? "OK" : "FALLA");
let fallas = 0;
const chequear = (etiqueta, cond, detalle = "") => {
  if (!cond) fallas++;
  console.log(`  [${ok(cond)}] ${etiqueta}${detalle ? "  " + detalle : ""}`);
};

// --- 1. Crear ---------------------------------------------------------------
const marca = randomUUID().slice(0, 8);
const email = `prueba-borrado-${marca}@example.com`;
const password = `Pb-${randomBytes(18).toString("base64url")}-!9`;

const sb = cliente();
const { data: alta, error: errAlta } = await sb.auth.signUp({
  email, password, options: { data: { display_name: "CUENTA DE PRUEBA - BORRAR" } },
});
if (errAlta || !alta.user) { console.error("no se pudo crear la cuenta:", errAlta?.message); process.exit(1); }
const uid = alta.user.id;
console.log(`\nCuenta descartable: ${email}`);
console.log(`id: ${uid}\n`);

const { data: sesion, error: errLogin } = await sb.auth.signInWithPassword({ email, password });
if (errLogin || !sesion.session) { console.error("no se pudo iniciar sesión:", errLogin?.message); process.exit(1); }
const token = sesion.session.access_token;

// --- 2. Poblar --------------------------------------------------------------
await sb.from("profiles").update({ display_name: "CUENTA DE PRUEBA - BORRAR", country_code: "AR", platforms: ["n", "d"] }).eq("id", uid);
for (const [id, tipo, rating] of VOTOS) await sb.from("votes").upsert({ user_id: uid, tmdb_id: id, tipo, rating }, { onConflict: "user_id,tmdb_id,tipo" });
for (const [id, tipo, kind] of ITEMS) await sb.from("user_items").upsert({ user_id: uid, tmdb_id: id, tipo, kind }, { onConflict: "user_id,tmdb_id,tipo,kind" });
for (const [id, tipo] of VISTAS) await sb.from("view_history").upsert({ user_id: uid, tmdb_id: id, tipo, viewed_at: new Date().toISOString() }, { onConflict: "user_id,tmdb_id,tipo" });
await sb.from("user_reviews").insert({ user_id: uid, tmdb_id: 603, tipo: "movie", texto: "Reseña de prueba." });

// Las cuentas se leen con la sesión de la propia cuenta: RLS solo deja ver lo
// suyo, así que un conteo distinto de cero prueba que las filas son de ella.
const contar = async (tabla, col = "user_id") =>
  (await sb.from(tabla).select("id", { count: "exact", head: true }).eq(col, uid)).count ?? 0;
const antes = {
  profiles: await contar("profiles", "id"),
  votes: await contar("votes"),
  user_items: await contar("user_items"),
  view_history: await contar("view_history"),
  user_reviews: await contar("user_reviews"),
};
console.log("Poblada:", JSON.stringify(antes));

const kinds = (await sb.from("user_items").select("kind").eq("user_id", uid)).data?.map((r) => r.kind).sort() ?? [];
chequear("están los tres kinds de user_items", kinds.join(",") === "dismissed,list,watched", kinds.join(","));

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
chequear("la cuenta sigue existiendo", (await contar("votes")) === antes.votes);
chequear("el token sigue sirviendo", !!(await sb.auth.getUser(token)).data.user);

console.log("\nBorrado real (admin.deleteUser):");
const bien = await llamar({ Authorization: `Bearer ${token}` }, { password });
chequear("→ 200", bien.status === 200, JSON.stringify(bien.j));
chequear("Cache-Control: no-store", bien.cache.includes("no-store"), bien.cache);
if (bien.status === 503) console.log("     ↑ falta SUPABASE_SERVICE_ROLE_KEY en el entorno del servidor");

// --- 4. Verificar -----------------------------------------------------------
console.log("\nDespués del borrado:");
const reintento = await cliente().auth.signInWithPassword({ email, password });
chequear("la cuenta ya no puede iniciar sesión", !reintento.data.session, reintento.error?.message ?? "");
const tokenMuerto = await sb.auth.getUser(token);
chequear("el token viejo ya no vale", !tokenMuerto.data.user);

console.log(`\nfallas: ${fallas}`);
console.log("Los CASCADE y el usuario de control se verifican con SQL (ver el informe).\n");
process.exit(fallas === 0 ? 0 : 1);
