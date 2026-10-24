#!/usr/bin/env node
// up → down → up de las migraciones de reseñas (E2a y E2b), en la base LOCAL, con
// comparación de `pg_dump --schema-only` (plan de reseñas, E2a).
//
// Uso:
//   node scripts/sala/db-local.mjs
//   node --env-file=.env.comunidad-local scripts/comunidad/up-down-up.mjs
//
// Qué fija:
//   - 011 no toca nada fuera del esquema `comunidad`: el volcado sin 011 es
//     IDÉNTICO al volcado con 011 excluyendo ese esquema;
//   - 011_down deja la base exactamente como sin 011, y 011 vuelve a dejarla
//     exactamente igual que antes (dos vueltas);
//   - 022_down es conservador: no cambia el volcado, `user_reviews` sigue con
//     sus filas y sin policies, y `anon`/`authenticated` siguen sin leerla
//     (SQL y REST).
// Los volcados se normalizan sólo en las líneas `\restrict`/`\unrestrict`, que
// pg_dump 17.6 genera con una clave aleatoria en cada corrida.
// Deja la base con 011, 012, 013 y 022 aplicadas, como db-local.mjs.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { aplicarArchivo, arnes, contenedor, docker, sqlOk, urlLocal } from "./local.mjs";

const URL_API = urlLocal(process.env.NEXT_PUBLIC_SUPABASE_URL);
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!ANON) { console.error("Falta NEXT_PUBLIC_SUPABASE_ANON_KEY (¿--env-file=.env.comunidad-local?)"); process.exit(2); }
console.log(`base: ${contenedor()}\n`);

const UP = "supabase/migrations/011_comunidad_esquema.sql";
const DOWN = "supabase/migrations/011_comunidad_esquema_down.sql";
const UP12 = "supabase/migrations/012_comunidad_baja.sql";
const DOWN12 = "supabase/migrations/012_comunidad_baja_down.sql";
const UP13 = "supabase/migrations/013_comunidad_protocolo.sql";
const DOWN13 = "supabase/migrations/013_comunidad_protocolo_down.sql";
const UP22 = "supabase/migrations/022_cerrar_user_reviews.sql";
const DOWN22 = "supabase/migrations/022_cerrar_user_reviews_down.sql";
const dirVolcados = join(tmpdir(), `comunidad-volcados-${Date.now()}`);
mkdirSync(dirVolcados, { recursive: true });

function volcar(nombre, { sinComunidad = false } = {}) {
  const args = ["exec", contenedor(), "pg_dump", "-U", "postgres", "-d", "postgres", "--schema-only"];
  if (sinComunidad) args.push("--exclude-schema=comunidad");
  const r = docker(args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`pg_dump: ${r.stderr}`);
  const texto = r.stdout.split("\n").filter((l) => !/^\\(un)?restrict /.test(l)).join("\n");
  writeFileSync(join(dirVolcados, `${nombre}.sql`), texto);
  const sha = createHash("sha256").update(texto).digest("hex").slice(0, 16);
  console.log(`   volcado ${nombre}: ${texto.split("\n").length} líneas, sha256 ${sha}…`);
  return texto;
}

/** Primeras diferencias de línea, para que un fallo diga qué cambió. */
function diferencias(a, b) {
  const la = a.split("\n"), lb = b.split("\n");
  const out = [];
  for (let i = 0; i < Math.max(la.length, lb.length) && out.length < 6; i++) {
    if (la[i] !== lb[i]) out.push(`línea ${i + 1}: «${la[i] ?? "∅"}» ≠ «${lb[i] ?? "∅"}»`);
  }
  return out.join("\n");
}
const iguales = (a, b, msg) => assert.ok(a === b, `${msg}\n${diferencias(a, b)}`);

const { prueba, cerrar } = arnes();
const v = {};

// 013 (E2c) depende de 012, y 012 (E2b) de 011: se bajan en orden inverso
// (013_down → 012_down → 011_down) y se suben en orden. Con 012 aplicada,
// bajar sólo 011 dejaría las cuatro `public.comunidad_*` apuntando a un
// esquema inexistente.
await prueba("013 (E2c): up → down → up da el mismo volcado; down quita sus funciones y sólo restaura la definición de 012; repetidas, inocuas", () => {
  aplicarArchivo(UP);
  aplicarArchivo(UP12);
  aplicarArchivo(UP13);
  const con13 = volcar("00-con-013");
  aplicarArchivo(DOWN13);
  const sin13 = volcar("00b-sin-013");
  v.sin13 = sin13;
  assert.equal(sqlOk(`select count(*) from pg_proc where pronamespace = 'comunidad'::regnamespace
    and (proname like 'proto\\_%' or proname in ('corte_de_mes', 'rige_antes_de', 'mes_ar'))`), "0");
  const cuenta = (t) => t.split("\n").reduce((m, l) => m.set(l, (m.get(l) ?? 0) + 1), new Map());
  const a = cuenta(con13), d = cuenta(sin13);
  // 013 REDEFINE resolver_participante (sin el FOR UPDATE de 012; auditoría
  // de E2c, A1), así que su down vuelve a poner la definición de 012: lo
  // único que puede "agregar" son líneas de esa definición.
  const de012 = new Set(readFileSync(UP12, "utf8").replace(/\r\n/g, "\n").split("\n").map((l) => l.trim()));
  const agregadas = [...d].filter(([l, n]) => n > (a.get(l) ?? 0)).map(([l]) => l);
  assert.deepEqual(agregadas.filter((l) => !de012.has(l.trim())), [], "013_down agregó algo que no es la definición de 012");
  assert.ok(agregadas.some((l) => /where user_id = p_uid for update/.test(l)), "013_down no restauró el FOR UPDATE de 012");
  // Que lo quitado sea SÓLO 013 lo fija la prueba siguiente: el volcado sin
  // 013 es idéntico al de 011 + 012.
  aplicarArchivo(DOWN13);
  iguales(volcar("00c-sin-013-otra-vez"), sin13, "repetir 013_down cambió algo");
  aplicarArchivo(UP13);
  iguales(volcar("00d-con-013"), con13, "subir 013 no reprodujo el volcado");
  aplicarArchivo(UP13);
  iguales(volcar("00e-con-013-repetida"), con13, "repetir 013 cambió el esquema");
  aplicarArchivo(DOWN13);
  iguales(volcar("00f-sin-013"), sin13, "la segunda bajada de 013 difiere");
});

await prueba("estado de partida: 011 y 012 aplicadas (repetibles)", () => {
  aplicarArchivo(UP);
  aplicarArchivo(UP12);
  assert.equal(sqlOk("select count(*) from pg_tables where schemaname = 'comunidad'"), "11");
  assert.equal(sqlOk("select count(*) from pg_proc where proname like 'comunidad\\_%'"), "4");
  v.con12 = volcar("0-con-011-y-012");
  iguales(v.con12, v.sin13, "013_down no dejó exactamente 011 + 012");
});

await prueba("012_down: quita sólo lo de 012 (funciones, triggers y columnas del marcador)", () => {
  aplicarArchivo(DOWN12);
  assert.equal(sqlOk("select count(*) from pg_proc where proname like 'comunidad\\_%'"), "0");
  v.con = volcar("1-con-011");
  // Sin la coma final: al quitar la última restricción del CREATE TABLE, la
  // línea anterior la pierde y no es un cambio. Las vueltas de abajo comparan
  // los volcados byte a byte.
  const cuenta = (t) => t.split("\n").map((l) => l.replace(/,$/, ""))
    .reduce((m, l) => m.set(l, (m.get(l) ?? 0) + 1), new Map());
  const a = cuenta(v.con12), d = cuenta(v.con);
  const agregadas = [...d].filter(([l, n]) => n > (a.get(l) ?? 0)).map(([l]) => l);
  assert.deepEqual(agregadas.filter((l) => l.trim() !== ""), [], "012_down agregó algo");
  const quitadas = [...a].filter(([l, n]) => n > (d.get(l) ?? 0)).map(([l]) => l).join("\n");
  for (const objeto of ["comunidad_baja_comunitaria", "comunidad_estado_baja", "comunidad_baja_registrar_fallo",
    "resolver_participante", "aplicar_baja", "limpiar_participante", "tomar_cuenta", "participantes_desvinculado",
    "participantes_vinculo", "sancion_hasta", "cancelada_en", "bajas_origen"]) {
    assert.ok(quitadas.includes(objeto), `012_down no quitó ${objeto}`);
  }
  v.conSinEsquema = volcar("1-con-011-sin-comunidad", { sinComunidad: true });
});

await prueba("012 up → down → up: mismos volcados; repetida, inocua", () => {
  aplicarArchivo(UP12);
  iguales(volcar("1b-con-012"), v.con12, "subir 012 no reprodujo el estado inicial");
  aplicarArchivo(UP12);
  iguales(volcar("1c-con-012-repetida"), v.con12, "repetir 012 cambió el esquema");
  aplicarArchivo(DOWN12);
  iguales(volcar("1d-sin-012"), v.con, "la segunda bajada de 012 difiere");
  aplicarArchivo(DOWN12);
  iguales(volcar("1e-sin-012-otra-vez"), v.con, "repetir 012_down cambió algo");
});

await prueba("down: el esquema desaparece y el resto queda idéntico a lo que había con 011", () => {
  aplicarArchivo(DOWN);
  assert.equal(sqlOk("select count(*) from pg_namespace where nspname = 'comunidad'"), "0");
  v.sin = volcar("2-sin-011");
  iguales(v.sin, v.conSinEsquema, "011 tocó algo fuera de su esquema");
  assert.ok(!/comunidad\./.test(v.sin), "quedó una referencia a comunidad");
});

await prueba("down repetido: inocuo", () => {
  aplicarArchivo(DOWN);
  iguales(volcar("2b-sin-011-otra-vez"), v.sin, "el segundo down cambió algo");
});

await prueba("up: vuelve exactamente al volcado con 011", () => {
  aplicarArchivo(UP);
  iguales(volcar("3-con-011"), v.con, "el segundo up no reprodujo el primero");
  assert.equal(sqlOk("select modulo_activo or publicacion_activa or top_yumpers_activo from comunidad.config"), "f");
});

await prueba("segunda vuelta down → up: mismos volcados", () => {
  aplicarArchivo(DOWN);
  iguales(volcar("4-sin-011"), v.sin, "la segunda bajada difiere");
  aplicarArchivo(UP);
  iguales(volcar("5-con-011"), v.con, "la segunda subida difiere");
});

await prueba("up repetido sobre sí mismo: no cambia el volcado", () => {
  aplicarArchivo(UP);
  iguales(volcar("6-con-011-repetida"), v.con, "repetir 011 cambió el esquema");
});

await prueba("vuelta a 012: 011 + 012 dan el mismo volcado del principio", () => {
  aplicarArchivo(UP12);
  iguales(volcar("6b-con-011-y-012"), v.con12, "011 + 012 no reprodujo el estado inicial");
  aplicarArchivo(UP13);
});

// ---------------------------------------------------------------------------
const estadoUserReviews = () => sqlOk(`
  select (select count(*) from public.user_reviews) || '|' ||
         (select count(*) from pg_policy where polrelid = 'public.user_reviews'::regclass) || '|' ||
         has_table_privilege('anon', 'public.user_reviews', 'SELECT') || '|' ||
         has_table_privilege('authenticated', 'public.user_reviews', 'SELECT') || '|' ||
         has_table_privilege('authenticated', 'public.user_reviews', 'INSERT') || '|' ||
         (select relrowsecurity from pg_class where oid = 'public.user_reviews'::regclass)`);

await prueba("022 sólo cambia policies y permisos de user_reviews (schema.sql re-crea las policies, como en db-local)", () => {
  aplicarArchivo("supabase/schema.sql");
  assert.equal(sqlOk("select count(*) from pg_policy where polrelid = 'public.user_reviews'::regclass"), "2");
  const antes = volcar("7a-antes-de-022");
  aplicarArchivo(UP22);
  const despues = volcar("7b-despues-de-022");
  // Diferencia como multiconjunto de líneas: lo agregado tiene que ser nada, y
  // lo quitado, sólo las policies, sus comentarios y los GRANT de user_reviews.
  const cuenta = (t) => t.split("\n").reduce((m, l) => m.set(l, (m.get(l) ?? 0) + 1), new Map());
  const a = cuenta(antes), d = cuenta(despues);
  const agregadas = [...d].filter(([l, n]) => n > (a.get(l) ?? 0)).map(([l]) => l);
  const quitadas = [...a].filter(([l, n]) => n > (d.get(l) ?? 0)).map(([l]) => l);
  assert.deepEqual(agregadas, []);
  const ajenas = quitadas.filter((l) => l !== "" && l !== "--" && !/user_reviews/.test(l));
  assert.deepEqual(ajenas, []);
  console.log("   quitado por 022:\n" + quitadas.filter((l) => /user_reviews/.test(l)).map((l) => "     " + l.slice(0, 150)).join("\n"));
});

await prueba("022 aplicada: user_reviews sin policies ni permisos para anon/authenticated, RLS activa", () => {
  aplicarArchivo(UP22);
  const [, pol, anonSel, authSel, authIns, rls] = estadoUserReviews().split("|");
  assert.deepEqual([pol, anonSel, authSel, authIns, rls], ["0", "false", "false", "false", "true"]);
  v.con22 = volcar("7-con-022");
});

await prueba("022_down conservador: no cambia el volcado ni reabre nada, y las filas siguen", () => {
  const antes = estadoUserReviews();
  aplicarArchivo(DOWN22);
  assert.equal(estadoUserReviews(), antes);
  iguales(volcar("8-tras-022-down"), v.con22, "el down de 022 cambió el esquema");
});

await prueba("tras 022_down, anon por REST sigue sin leer user_reviews (401/403, nunca 200)", async () => {
  const r = await fetch(`${URL_API}/rest/v1/user_reviews?select=*`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
  const cuerpo = await r.text();
  assert.ok(r.status === 401 || r.status === 403, `status ${r.status}: ${cuerpo.slice(0, 120)}`);
  assert.match(cuerpo, /42501|permission denied/);
});

await prueba("022 repetida: inocua", () => {
  aplicarArchivo(UP22);
  iguales(volcar("9-con-022-repetida"), v.con22, "repetir 022 cambió el esquema");
});

console.log(`\nvolcados en ${dirVolcados}`);
cerrar();
