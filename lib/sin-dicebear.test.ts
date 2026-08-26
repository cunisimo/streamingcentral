// Que DiceBear no vuelva por la ventana.
//
// El escáner es el MISMO que usa `node scripts/barrido-dicebear.mjs`: acá se le
// pasan las raíces que existen siempre (fuente y archivos públicos) y el script
// agrega los bundles de `.next`, que sólo hay después de un build. Un test que
// dependiera de `.next` fallaría en un checkout limpio.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import os from "node:os";
import { EXTENSIONES, RAICES_FUENTE, barrer } from "../scripts/barrido-dicebear.mjs";
import {
  SENTENCIAS_AUTORIZADAS, barrerSchema, normalizar, sentencias, sentenciasProhibidas,
} from "../scripts/barrido-sql-avatar.mjs";

test("cero rastros de DiceBear en código ejecutable y archivos públicos", () => {
  const hallazgos = barrer(RAICES_FUENTE);
  const detalle = hallazgos.map((h) => `${h.archivo}:${h.linea}  ${h.texto}`).join("\n");
  assert.deepEqual(hallazgos, [], `quedaron rastros de DiceBear:\n${detalle}`);
});

// ============================================================================
// El escáner detecta de verdad — con canarios, no por confianza
// ============================================================================

// Los dos agujeros que tuvo este barrido y que un test tenía que haber cazado:
//
//   1. `.sql` no estaba en EXTENSIONES, así que decía revisar `supabase/` y se
//      saltaba todos los `.sql`. No vio que `schema.sql` seguía imponiendo
//      `avatar_style = 'adventurer-neutral'` en sentencias ACTIVAS.
//   2. La guarda del CLI nunca daba true: el comando salía con 0 sin barrer
//      nada, y un `exit 0` vacío se lee igual que uno limpio.
//
// Los canarios de abajo son la red para los dos.

/** Escribe un archivo temporal y lo barre. Devuelve los hallazgos. */
function canario(nombre: string, contenido: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "canario-"));
  const sub = path.join(dir, "lib");
  fs.mkdirSync(sub);
  fs.writeFileSync(path.join(sub, nombre), contenido, "utf8");
  try { return barrer(["lib"], dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test("EXTENSIONES incluye .sql: sin eso el barrido no mira el schema", () => {
  assert.ok([...EXTENSIONES].includes(".sql"), "el barrido se saltearía todos los .sql");
});

test("CANARIO SQL: una SENTENCIA con la cadena prohibida se detecta", () => {
  const h = canario("migracion.sql", [
    "-- este comentario menciona adventurer-neutral y NO cuenta",
    "alter table profiles alter column avatar_style set default 'adventurer-neutral';",
    "update profiles set avatar_style = 'adventurer-neutral' where avatar_style is null;",
  ].join("\n"));
  assert.equal(h.length, 2, `esperaba 2 sentencias detectadas, hubo ${h.length}: ${JSON.stringify(h)}`);
  assert.ok(h.every((x) => x.archivo.endsWith("migracion.sql")));
  // La línea 1 es el comentario: no puede estar entre los hallazgos.
  assert.deepEqual(h.map((x) => x.linea), [2, 3]);
});

test("CANARIO JS: código sí, comentario no", () => {
  const h = canario("malo.ts", [
    "const u = `https://api.dicebear.com/10.x/adventurer-neutral/svg?seed=${x}`;",
    "// este comentario menciona api.dicebear.com y NO cuenta",
  ].join("\n"));
  assert.equal(h.length, 1);
  assert.equal(h[0].linea, 1);
});

test("CANARIO del CLI: ejecutar el script de verdad DEVUELVE 1 ante un hallazgo", () => {
  // El agujero #2: la guarda del CLI no disparaba y el script salía con 0 sin
  // hacer nada. Acá se ejecuta el comando real contra un directorio sembrado.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "canario-cli-"));
  fs.mkdirSync(path.join(dir, "lib"));
  fs.writeFileSync(
    path.join(dir, "lib", "malo.sql"),
    "update profiles set avatar_style = 'adventurer-neutral';\n",
  );
  try {
    const script = path.join(process.cwd(), "scripts", "barrido-dicebear.mjs");
    const r = spawnSync(process.execPath, [script], { cwd: dir, encoding: "utf8" });
    assert.equal(r.status, 1, `el CLI salió con ${r.status}; salida: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /malo\.sql/);
    // Y tiene que HABLAR: un barrido mudo no se distingue de uno que no corrió.
    assert.match(r.stdout, /Barriendo/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("CANARIO del CLI: sin hallazgos sale con 0 y lo dice", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "canario-limpio-"));
  fs.mkdirSync(path.join(dir, "lib"));
  fs.writeFileSync(path.join(dir, "lib", "bien.ts"), "export const x = 1;\n");
  try {
    const script = path.join(process.cwd(), "scripts", "barrido-dicebear.mjs");
    const r = spawnSync(process.execPath, [script], { cwd: dir, encoding: "utf8" });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /LIMPIO/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ============================================================================
// El SQL ejecutable de `supabase/schema.sql` que toca `avatar_style`
// ============================================================================

// ⚠️ ALCANCE: estos tests miran UN archivo, `supabase/schema.sql`. NO recorren
// `supabase/migrations/` ni ningún otro `.sql` del repositorio.
//
// POR QUÉ ALLOWLIST. La versión anterior enumeraba las operaciones peligrosas
// con expresiones regulares, y aceptaba sintaxis válida de PostgreSQL que viola
// la misma regla: `COLUMN` es opcional en `alter column`, `update` admite `only`
// y alias, y el default se puede declarar dentro del `create table`. Perseguir
// cada forma con otra regex es una carrera perdida.
//
// Ahora se enumera lo PERMITIDO: hay exactamente una sentencia autorizada que
// mencione `avatar_style`, y cualquier otra es un hallazgo por no estar en la
// lista — incluido un DDL que todavía no existe.

test("supabase/schema.sql: ninguna sentencia no autorizada toca avatar_style", () => {
  const hallazgos = barrerSchema();
  assert.deepEqual(hallazgos, [], `sentencias sin autorizar:\n${hallazgos.join("\n")}`);
});

test("la única sentencia autorizada es la que crea la columna sin default", () => {
  // Si esto cambia, cambió una decisión de producto y tiene que verse en el diff.
  assert.deepEqual(
    [...SENTENCIAS_AUTORIZADAS],
    ["alter table profiles add column if not exists avatar_style text;"],
  );
});

test("el schema menciona avatar_style en UNA sola sentencia ejecutable", () => {
  const conLaColumna = sentencias(leerRaiz("supabase/schema.sql"))
    .filter((s) => s.includes("avatar_style"));
  assert.deepEqual(conLaColumna, [...SENTENCIAS_AUTORIZADAS]);
});

// --- Canarios: los cuatro falsos negativos que tenía la versión anterior -----

const FALSOS_NEGATIVOS = [
  // El default declarado dentro del CREATE TABLE.
  "create table profiles (avatar_style text default null);",
  // `COLUMN` es opcional en `ALTER [COLUMN]`.
  "alter table profiles alter avatar_style drop default;",
  // UPDATE con alias de tabla.
  "update profiles p set avatar_style = null;",
  // UPDATE con ONLY.
  "update only profiles set avatar_style = null;",
];

for (const sql of FALSOS_NEGATIVOS) {
  test(`CANARIO SQL: se detecta -> ${sql}`, () => {
    const h = sentenciasProhibidas(sql);
    assert.equal(h.length, 1, `no lo detectó: ${JSON.stringify(h)}`);
  });
}

test("CANARIO SQL: la sentencia AUTORIZADA sigue pasando", () => {
  assert.deepEqual(
    sentenciasProhibidas("alter table profiles add column if not exists avatar_style text;"),
    [],
  );
});

test("CANARIO SQL: la autorizada pasa aunque venga con otro formato", () => {
  // Mayúsculas, saltos y espacios de más: la normalización los borra, así que un
  // reformateo inocente no rompe el build.
  const sql = ["ALTER TABLE   profiles", "  ADD COLUMN IF NOT EXISTS", "  avatar_style    text;"].join("\n");
  assert.deepEqual(sentenciasProhibidas(sql), []);
});

// --- Canarios: las variantes que ya se detectaban, para que no se pierdan ----

test("CANARIO SQL: DROP DEFAULT en tres líneas y calificado por esquema", () => {
  const sql = ["alter table public.profiles", "  alter column avatar_style", "  drop default;"].join("\n");
  assert.equal(sentenciasProhibidas(sql).length, 1);
});

test("CANARIO SQL: SET DEFAULT multilínea", () => {
  const sql = ["alter table profiles", "  alter column avatar_style", "  set default 'adventurer-neutral';"].join("\n");
  assert.equal(sentenciasProhibidas(sql).length, 1);
});

test("CANARIO SQL: UPDATE que toca avatar_style junto con otra columna", () => {
  assert.equal(
    sentenciasProhibidas("update profiles set display_name = 'x', avatar_style = 'y';").length,
    1,
  );
});

// --- Lo que NO tiene que dar hallazgo ---------------------------------------

test("CANARIO SQL: un COMENTARIO que menciona la operación NO cuenta", () => {
  // El schema explica en prosa por qué el `drop default` no está. Si el barrido
  // contara eso, el archivo no podría documentarse a sí mismo.
  const sql = [
    "-- alter table profiles alter column avatar_style drop default;",
    "/* update profiles set avatar_style = 'x'; */",
    "alter table profiles add column if not exists avatar_style text;",
  ].join("\n");
  assert.deepEqual(sentenciasProhibidas(sql), []);
});

test("CANARIO SQL: otras columnas de profiles no son asunto de este barrido", () => {
  const sql = [
    "alter table profiles add column if not exists avatar_seed text;",
    "update profiles set avatar_seed = id::text where avatar_seed is null;",
  ].join("\n");
  assert.deepEqual(sentenciasProhibidas(sql), []);
});

// --- El troceo, que es de lo que depende todo lo anterior -------------------

test("trocear respeta los bloques $$ de las funciones", () => {
  // Sin esto, `create function ... $$ ... ; ... $$` se partiría en pedazos y el
  // barrido leería fragmentos que no son sentencias.
  const sql = [
    "create function f() returns trigger as $$",
    "begin",
    "  insert into profiles (id) values (new.id);",
    "  return new;",
    "end;",
    "$$ language plpgsql;",
    "alter table profiles add column if not exists avatar_style text;",
  ].join("\n");
  const trozos = sentencias(sql);
  assert.equal(trozos.length, 2, `troceó mal: ${JSON.stringify(trozos)}`);
  assert.equal(trozos[1], "alter table profiles add column if not exists avatar_style text;");
});

test("trocear no parte una sentencia por un `;` dentro de una cadena", () => {
  const trozos = sentencias("update t set c = 'a;b'; select 1;");
  assert.deepEqual(trozos, ["update t set c = 'a;b';", "select 1;"]);
});

test("normalizar aplana saltos y espacios, y baja a minúsculas", () => {
  assert.equal(
    normalizar(["ALTER TABLE", "   profiles", "  ADD   COLUMN x"].join("\n")),
    "alter table profiles add column x;",
  );
});


test("lib/avatar.ts, el helper que armaba la URL remota, ya no existe", () => {
  assert.equal(
    fs.existsSync(path.join(process.cwd(), "lib", "avatar.ts")),
    false,
    "volvió el helper viejo",
  );
});

// ============================================================================
// Service worker
// ============================================================================

const leer = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const leerRaiz = leer;

test("el service worker ya no cachea ningún host de imágenes externo salvo TMDB", () => {
  const config = leer("public/sw/config.js");
  const m = config.match(/IMAGE_HOSTS:\s*\[([^\]]*)\]/);
  assert.ok(m, "no se encontró IMAGE_HOSTS en sw/config.js");
  const hosts = m[1].split(",").map((h) => h.trim().replace(/["']/g, "")).filter(Boolean);
  assert.deepEqual(hosts, ["image.tmdb.org"]);
});

test("el service worker cachea /avatars/ como asset propio", () => {
  // Es lo que hace que el avatar siga viéndose sin conexión.
  assert.match(leer("public/sw/routes.js"), /url\.pathname\.startsWith\("\/avatars\/"\)/);
});

test("SC_CACHE_VERSION subió: sin eso, activate no borra los caches viejos", () => {
  // El cache de imágenes viejo (`sc-images-v6`) es el que tiene guardados los
  // SVG de DiceBear. `activate` borra todo cache cuyo nombre no esté en
  // VALID_CACHES, y los nombres llevan la versión adentro — así que el bump ES
  // el mecanismo de limpieza. Este test fija que se haya hecho.
  const sw = leer("public/sw.js");
  const m = sw.match(/SC_CACHE_VERSION\s*=\s*"v(\d+)"/);
  assert.ok(m, "no se encontró SC_CACHE_VERSION");
  assert.ok(Number(m[1]) >= 7, `la versión es v${m[1]}, tenía que subir a v7 o más`);
});

test("la versión vive en sw.js y NO en sw/config.js", () => {
  // El navegador compara los bytes del script principal; un cambio en un
  // importScripts no dispara la actualización de forma confiable.
  assert.match(leer("public/sw.js"), /self\.SC_CACHE_VERSION\s*=/);
  assert.doesNotMatch(leer("public/sw/config.js"), /SC_CACHE_VERSION\s*=\s*"/);
});

test("activate borra sólo caches del service worker, no datos del usuario", () => {
  // La limpieza tiene que seguir siendo `caches.delete`, nunca localStorage ni
  // IndexedDB: ahí viven las plataformas elegidas y la sesión.
  const sw = leer("public/sw.js");
  assert.match(sw, /caches\.delete/);
  assert.doesNotMatch(sw, /localStorage|indexedDB|sessionStorage/);
});
