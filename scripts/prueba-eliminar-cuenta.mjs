#!/usr/bin/env node
// Prueba integral del borrado de cuenta.
//
//   node --env-file=.env.local scripts/prueba-eliminar-cuenta.mjs crear
//   node --env-file=.env.local scripts/prueba-eliminar-cuenta.mjs poblar <email> <password>
//   node --env-file=.env.local scripts/prueba-eliminar-cuenta.mjs endpoint <email> <password>
//
// USA UNA CUENTA DESCARTABLE Y NADA MÁS. El email lleva `prueba-borrado` para
// que sea inconfundible en cualquier listado. No toca ninguna cuenta existente:
// todas las operaciones van con la sesión de la cuenta creada acá, así que RLS
// (`auth.uid() = user_id`) impide físicamente escribir sobre otra.
//
// La contraseña se pasa por argumento y NO se imprime nunca.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anon) { console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY"); process.exit(1); }

const cliente = () => createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const [, , modo, email, password] = process.argv;

// Títulos reales de TMDB, para que las filas sean como las de un usuario normal.
const VOTOS = [[603, "movie", 3], [1396, "tv", 2], [27205, "movie", 1]];
const ITEMS = [[155, "movie", "list"], [1399, "tv", "watched"], [496243, "movie", "dismissed"]];
const VISTAS = [[603, "movie"], [1396, "tv"], [155, "movie"]];

if (modo === "crear") {
  const sufijo = process.env.SUFIJO || String(Date.now());
  const mail = `prueba-borrado-${sufijo}@example.com`;
  const pass = `Prueba-${sufijo}-Descartable!`;
  const sb = cliente();
  const { data, error } = await sb.auth.signUp({
    email: mail, password: pass,
    options: { data: { display_name: "CUENTA DE PRUEBA - BORRAR" } },
  });
  if (error) { console.error("error al crear:", error.message); process.exit(1); }
  console.log("email:", mail);
  console.log("id:   ", data.user?.id ?? "(sin id)");
  console.log("confirmada:", data.user?.email_confirmed_at ? "sí" : "NO — hay que confirmarla a mano");
  // La contraseña NO se imprime: se deriva del sufijo, que sí queda a la vista.
  console.log("sufijo (para reconstruir la clave):", sufijo);
  process.exit(0);
}

if (!email || !password) { console.error("faltan email y password"); process.exit(1); }

const sb = cliente();
const { data: sesion, error: errLogin } = await sb.auth.signInWithPassword({ email, password });
if (errLogin || !sesion.session) {
  console.error("no se pudo iniciar sesión:", errLogin?.message ?? "sin sesión");
  process.exit(1);
}
const uid = sesion.user.id;

if (modo === "poblar") {
  // Todo con la sesión de la cuenta de prueba: RLS garantiza que no se pueda
  // escribir sobre otro usuario ni por error.
  await sb.from("profiles").update({ display_name: "CUENTA DE PRUEBA - BORRAR", country_code: "AR", platforms: ["n", "d"] }).eq("id", uid);
  for (const [id, tipo, rating] of VOTOS) {
    await sb.from("votes").upsert({ user_id: uid, tmdb_id: id, tipo, rating }, { onConflict: "user_id,tmdb_id,tipo" });
  }
  for (const [id, tipo, kind] of ITEMS) {
    await sb.from("user_items").upsert({ user_id: uid, tmdb_id: id, tipo, kind }, { onConflict: "user_id,tmdb_id,tipo,kind" });
  }
  for (const [id, tipo] of VISTAS) {
    await sb.from("view_history").upsert({ user_id: uid, tmdb_id: id, tipo, viewed_at: new Date().toISOString() }, { onConflict: "user_id,tmdb_id,tipo" });
  }
  const { error: errRev } = await sb.from("user_reviews").insert({ user_id: uid, tmdb_id: 603, tipo: "movie", texto: "Reseña de prueba." });
  console.log("id de la cuenta:", uid);
  console.log("reseña:", errRev ? `no se pudo (${errRev.message})` : "ok");
  console.log("poblada.");
  process.exit(0);
}

if (modo === "endpoint") {
  const base = process.env.BASE || "http://localhost:3000";
  const token = sesion.session.access_token;
  const llamar = async (etiqueta, headers, body) => {
    const r = await fetch(`${base}/api/cuenta/eliminar`, {
      method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
    });
    let j = {}; try { j = await r.json(); } catch { /* sin cuerpo */ }
    console.log(`  ${etiqueta.padEnd(34)} ${r.status}  ${JSON.stringify(j)}  cache-control="${r.headers.get("cache-control") ?? ""}"`);
    return r.status;
  };
  console.log("\nCapas de seguridad del endpoint:");
  await llamar("sin token", {}, { password });
  await llamar("token invalido", { Authorization: "Bearer no-es-un-token" }, { password });
  await llamar("sin password", { Authorization: `Bearer ${token}` }, {});
  await llamar("password incorrecta", { Authorization: `Bearer ${token}` }, { password: "no-es-la-clave" });
  console.log("\nBorrado real:");
  const st = await llamar("token + password correcta", { Authorization: `Bearer ${token}` }, { password });
  if (st === 200) {
    const { error } = await cliente().auth.signInWithPassword({ email, password });
    console.log(`\n  ¿puede volver a entrar?  ${error ? "NO (" + error.message + ")" : "SÍ — MAL"}`);
  }
  process.exit(0);
}

console.error("modo desconocido:", modo);
process.exit(1);
