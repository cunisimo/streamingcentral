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
import {
  AUTORIZADO, EXTENSIONES, MANIFIESTOS, PROHIBIDO, PROHIBIDO_DEPENDENCIA, RAICES_FUENTE,
  barrer, revisarAutorizadas,
} from "../scripts/barrido-dicebear.mjs";
import {
  COLUMNA, LINEA_AUTORIZADA, normalizar, revisar, revisarSchema,
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
  // El CLI también corre la cuenta de la allowlist, así que un directorio
  // "limpio" tiene que traer la línea autorizada: si falta, falta la constante
  // del estilo persistido, y eso ES un problema.
  fs.writeFileSync(
    path.join(dir, "lib", "avatares.ts"),
    'export const ESTILO_PERSISTIDO = "adventurer-neutral";\n',
  );
  try {
    const script = path.join(process.cwd(), "scripts", "barrido-dicebear.mjs");
    const r = spawnSync(process.execPath, [script], { cwd: dir, encoding: "utf8" });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /LIMPIO/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ============================================================================
// El guard textual sobre la columna de estilo en `supabase/schema.sql`
// ============================================================================

// ⚠️ ALCANCE REAL, sin adornos: `scripts/barrido-sql-avatar.mjs` **cuenta
// apariciones de un identificador en UN archivo**. No es un parser de SQL, no
// recorre `supabase/migrations/` ni ningún otro `.sql`, y no protege contra SQL
// deliberadamente ofuscado. Protege contra una regresión accidental, que es lo
// que de verdad puede pasar.
//
// POR QUÉ SE ABANDONÓ EL PARSER. Las dos versiones anteriores intentaron
// entender el SQL y las dos tuvieron falsos negativos demostrados. La que
// troceaba respetando comentarios y cadenas dejaba pasar un `--` metido en una
// cadena con escape (`E'x\'-- texto'`) y otro en un identificador entre comillas
// (`as "--"`). La salida no es otro estado en el parser: para proteger UNA línea
// no hace falta el lexer de PostgreSQL.

test("supabase/schema.sql pasa el guard", () => {
  const problemas = revisarSchema();
  assert.deepEqual(problemas, [], problemas.join("\n"));
});

test("el schema tiene EXACTAMENTE una aparición del identificador", () => {
  // SIN distinguir mayúsculas: PostgreSQL pliega los identificadores no citados,
  // así que `AVATAR_STYLE` es la misma columna y tiene que contarse igual.
  const sql = leerRaiz("supabase/schema.sql").toLowerCase();
  const n = sql.split(COLUMNA).length - 1;
  assert.equal(n, 1, `aparece ${n} veces; los comentarios deben decir "la columna de estilo"`);
});

test("la línea autorizada es la que crea la columna sin default", () => {
  // Si esto cambia, cambió una decisión de producto y tiene que verse en el diff.
  assert.equal(
    LINEA_AUTORIZADA,
    "alter table profiles add column if not exists avatar_style text;",
  );
});

// --- Canarios ---------------------------------------------------------------

test("CANARIO: la única línea autorizada pasa", () => {
  assert.deepEqual(revisar("alter table profiles add column if not exists avatar_style text;"), []);
});

test("CANARIO: la autorizada pasa aunque venga con otro formato", () => {
  // Mayúsculas y espacios de más: la normalización los borra.
  assert.deepEqual(revisar("ALTER TABLE   profiles ADD COLUMN IF NOT EXISTS  avatar_style   text;"), []);
});

test("CANARIO: una segunda aparición en otra sentencia FALLA", () => {
  const sql = [
    "alter table profiles add column if not exists avatar_style text;",
    "update profiles set avatar_style = null;",
  ].join("\n");
  const p = revisar(sql);
  assert.ok(p.length > 0, "no detectó la segunda sentencia");
  assert.ok(p.some((x: string) => x.includes("update profiles set avatar_style = null;")));
});

test("CANARIO: una aparición dentro de un COMENTARIO también falla", () => {
  // Falla del lado conservador: contar texto no distingue un comentario de una
  // sentencia, y esa es justamente la propiedad que lo hace a prueba de trucos.
  const sql = [
    "-- ojo con avatar_style",
    "alter table profiles add column if not exists avatar_style text;",
  ].join("\n");
  assert.ok(revisar(sql).length > 0, "un comentario con el identificador debería fallar");
});

test("CANARIO: el E-string con `--` adentro FALLA", () => {
  // El primer falso negativo del parser anterior. Ahora falla por lo único que
  // importa: contiene textualmente el identificador.
  const sql = [
    "alter table profiles add column if not exists avatar_style text;",
    "update profiles",
    "set display_name = E'x\\'-- texto', avatar_style = null;",
  ].join("\n");
  assert.ok(revisar(sql).length > 0, "no detectó el UPDATE con el E-string");
});

test('CANARIO: el alias `as "--"` FALLA', () => {
  // El segundo falso negativo del parser anterior.
  const sql = [
    "alter table profiles add column if not exists avatar_style text;",
    'update profiles as "--"',
    "set avatar_style = null;",
  ].join("\n");
  assert.ok(revisar(sql).length > 0, "no detectó el UPDATE con el alias raro");
});

test("CANARIO: COMENTAR la línea autorizada hace fallar el guard", () => {
  // Comentarla deja la aparición, pero la línea ya no es la autorizada.
  const p = revisar("-- alter table profiles add column if not exists avatar_style text;");
  assert.ok(p.length > 0, "comentar la sentencia debería fallar");
  assert.ok(p[0].includes("no es la sentencia autorizada"));
});

test("CANARIO: BORRAR la línea autorizada hace fallar el guard", () => {
  const p = revisar("alter table profiles add column if not exists avatar_seed text;");
  assert.ok(p.length > 0, "borrar la sentencia debería fallar");
  assert.ok(p[0].includes("no aparece"));
});

test("CANARIO: cambiar la sentencia para que traiga un default FALLA", () => {
  const p = revisar("alter table profiles add column if not exists avatar_style text default 'x';");
  assert.ok(p.length > 0);
  assert.ok(p[0].includes("no es la sentencia autorizada"));
});

// --- Mayúsculas: PostgreSQL pliega los identificadores no citados ------------

test("CANARIO: la sentencia autorizada TODA EN MAYÚSCULAS pasa", () => {
  // `normalizar` baja a minúsculas, así que es la misma sentencia. Antes fallaba
  // por partida doble: no la contaba, y encima reportaba "no aparece".
  assert.deepEqual(
    revisar("ALTER TABLE PROFILES ADD COLUMN IF NOT EXISTS AVATAR_STYLE TEXT;"),
    [],
  );
});

test("CANARIO: una segunda aparición como AVATAR_STYLE FALLA", () => {
  // El falso negativo que bloqueaba el push: `update profiles set AVATAR_STYLE`
  // toca exactamente la misma columna y pasaba entero.
  const sql = [
    "alter table profiles add column if not exists avatar_style text;",
    "update profiles set AVATAR_STYLE = null;",
  ].join("\n");
  const p = revisar(sql);
  assert.ok(p.length > 0, "no detectó la segunda aparición en mayúsculas");
  assert.ok(p.some((x: string) => x.includes("AVATAR_STYLE")), "el diagnóstico no muestra la línea original");
});

test("CANARIO: una segunda aparición como Avatar_Style FALLA", () => {
  const sql = [
    "alter table profiles add column if not exists avatar_style text;",
    "update profiles set Avatar_Style = null;",
  ].join("\n");
  assert.ok(revisar(sql).length > 0, "no detectó la variante en capitalización mixta");
});

test("CANARIO: una aparición EN MAYÚSCULAS dentro de un comentario también falla", () => {
  // Mismo criterio conservador que con minúsculas: contar texto no distingue un
  // comentario de una sentencia, y esa es la propiedad que lo hace confiable.
  const sql = [
    "-- ojo con AVATAR_STYLE",
    "alter table profiles add column if not exists avatar_style text;",
  ].join("\n");
  assert.ok(revisar(sql).length > 0, "un comentario en mayúsculas debería fallar");
});

test("CANARIO: el diagnóstico muestra la línea TAL CUAL está en el archivo", () => {
  // Se cuenta en minúsculas pero se reporta el original: un mensaje que dijera
  // la línea en minúsculas no se parecería a lo que hay que ir a buscar.
  const sql = [
    "alter table profiles add column if not exists avatar_style text;",
    "UPDATE Profiles SET Avatar_Style = NULL;",
  ].join("\n");
  const p = revisar(sql);
  assert.ok(p.some((x: string) => x.includes("UPDATE Profiles SET Avatar_Style = NULL;")));
});

test("CANARIO: otras columnas de profiles no son asunto de este guard", () => {
  const sql = [
    "alter table profiles add column if not exists avatar_style text;",
    "alter table profiles add column if not exists avatar_seed text;",
    "update profiles set avatar_seed = id::text where avatar_seed is null;",
  ].join("\n");
  assert.deepEqual(revisar(sql), []);
});

test("normalizar aplana espacios y baja a minúsculas", () => {
  assert.equal(
    normalizar(["  ALTER   TABLE", "profiles  ADD COLUMN x;  "].join(" ")),
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

// ============================================================================
// La ÚNICA aparición autorizada: el estilo que se persiste
// ============================================================================

// POR QUÉ EXISTE ESTA EXCEPCIÓN. El contrato de persistencia guarda
// `avatar_style = "adventurer-neutral"` para que un rollback muestre un avatar
// válido en vez de una imagen rota (ver `lib/avatares-persistencia.test.ts`).
// Esa cadena es uno de los patrones del barrido, así que la constante que la
// declara tiene que estar declarada como excepción — con la MISMA forma que el
// guard del SQL: una allowlist textual, exacta, de UNA línea.
//
// Lo que NO se hizo: sacar el patrón de PROHIBIDO (dejaría de detectar
// cualquier regreso del estilo viejo), ni armar la cadena por pedazos (eso es
// ofuscación: pasaría el barrido sin que nadie se entere).
//
// Y NO es una dependencia de DiceBear: es una etiqueta de compatibilidad que se
// escribe en una columna. Los patrones que sí marcan dependencia —
// `api.dicebear.com` y `@dicebear/`— no tienen ninguna excepción.

test("la allowlist tiene UNA sola entrada, y es la constante del estilo", () => {
  assert.equal(AUTORIZADO.length, 1);
  assert.equal(AUTORIZADO[0].archivo, path.join("lib", "avatares.ts"));
  assert.equal(
    AUTORIZADO[0].linea,
    'export const ESTILO_PERSISTIDO = "adventurer-neutral";',
  );
});

test("lib/avatares.ts declara esa línea EXACTAMENTE una vez", () => {
  assert.deepEqual(revisarAutorizadas(), []);
});

test("CANARIO: la línea autorizada, en su archivo, NO se reporta", () => {
  const h = canario("avatares.ts", [
    "export const ESTILO_YUMP = \"yump\";",
    'export const ESTILO_PERSISTIDO = "adventurer-neutral";',
  ].join("\n"));
  assert.deepEqual(h, []);
});

test("CANARIO: la línea autorizada pasa aunque venga con otra indentación", () => {
  const h = canario("avatares.ts", '  export const ESTILO_PERSISTIDO = "adventurer-neutral";  ');
  assert.deepEqual(h, []);
});

test("CANARIO: la MISMA línea en OTRO archivo sí se reporta", () => {
  // La excepción es por archivo y por línea: copiar la constante a otro módulo
  // crea una segunda fuente de verdad y tiene que verse.
  const h = canario("otro.ts", 'export const ESTILO_PERSISTIDO = "adventurer-neutral";');
  assert.equal(h.length, 1, `esperaba 1 hallazgo, hubo ${h.length}`);
  assert.ok(h[0].archivo.endsWith("otro.ts"));
});

test("CANARIO: OTRA línea con la cadena, en el archivo autorizado, sí se reporta", () => {
  const h = canario("avatares.ts", [
    'export const ESTILO_PERSISTIDO = "adventurer-neutral";',
    'const url = `https://api.dicebear.com/10.x/adventurer-neutral/svg`;',
    'const otro = "adventurer-neutral";',
  ].join("\n"));
  assert.deepEqual(h.map((x) => x.linea), [2, 3]);
});

test("CANARIO: los patrones de dependencia real NO tienen excepción", () => {
  // `api.dicebear.com` y `@dicebear/` se reportan siempre, en cualquier archivo.
  const h = canario("avatares.ts", [
    'const u = "https://api.dicebear.com/10.x/x/svg";',
    'import x from "@dicebear/core";',
  ].join("\n"));
  assert.equal(h.length, 2);
});

test("CANARIO: DUPLICAR la línea autorizada hace fallar `revisarAutorizadas`", () => {
  // El barrido salta las dos apariciones porque las dos son textualmente la
  // autorizada. La cuenta es lo que caza la duplicación.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "canario-dup-"));
  fs.mkdirSync(path.join(dir, "lib"));
  fs.writeFileSync(
    path.join(dir, "lib", "avatares.ts"),
    'export const ESTILO_PERSISTIDO = "adventurer-neutral";\n'.repeat(2),
  );
  try {
    const p = revisarAutorizadas(dir);
    assert.ok(p.length > 0, "no detectó la línea duplicada");
    assert.ok(p[0].includes("2 veces"), p[0]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("CANARIO: BORRAR la línea autorizada hace fallar `revisarAutorizadas`", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "canario-falta-"));
  fs.mkdirSync(path.join(dir, "lib"));
  fs.writeFileSync(path.join(dir, "lib", "avatares.ts"), "export const x = 1;\n");
  try {
    const p = revisarAutorizadas(dir);
    assert.ok(p.length > 0, "no detectó que falta la línea");
    assert.ok(p[0].includes("no aparece"), p[0]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("CANARIO del CLI: la línea autorizada duplicada DEVUELVE 1", () => {
  // El barrido por sí solo no la ve (las dos apariciones son la autorizada), así
  // que si el CLI no corriera la cuenta, saldría con 0 y en silencio.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "canario-cli-dup-"));
  fs.mkdirSync(path.join(dir, "lib"));
  fs.writeFileSync(
    path.join(dir, "lib", "avatares.ts"),
    'export const ESTILO_PERSISTIDO = "adventurer-neutral";\n'.repeat(2),
  );
  try {
    const script = path.join(process.cwd(), "scripts", "barrido-dicebear.mjs");
    const r = spawnSync(process.execPath, [script], { cwd: dir, encoding: "utf8" });
    assert.equal(r.status, 1, `el CLI salió con ${r.status}; salida: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /avatares\.ts/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ============================================================================
// Los bundles: qué se revisa ahí, y por qué NO es lo mismo
// ============================================================================

// El contrato de persistencia hace que la cadena `adventurer-neutral` VIAJE AL
// NAVEGADOR: es el valor que el selector escribe en la base, así que queda
// inlineada en los chunks de `.next`. Verificado en un build real — tres chunks
// la traen y **ninguno contiene `dicebear`**:
//
//   avatar_seed:e.id,avatar_style:"adventurer-neutral"
//
// La allowlist no puede cubrir eso: es por archivo y línea exactos, y un bundle
// minificado es una sola línea con nombre hasheado que cambia en cada build.
//
// La respuesta NO es dejar de revisar los bundles. Es revisar ahí **lo que de
// verdad no puede estar**: la URL del generador y el paquete. Un bundle con
// `api.dicebear.com` sigue siendo un fallo, y sobre la FUENTE se siguen
// aplicando los tres patrones, el nombre del estilo incluido.

const semilla = (contenido: string, ruta: string[]) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "canario-bundle-"));
  fs.mkdirSync(path.join(dir, ...ruta.slice(0, -1)), { recursive: true });
  fs.writeFileSync(path.join(dir, ...ruta), contenido);
  return dir;
};

test("PROHIBIDO_DEPENDENCIA es un subconjunto: las dos de dependencia real", () => {
  assert.equal(PROHIBIDO_DEPENDENCIA.length, 2);
  assert.ok(PROHIBIDO_DEPENDENCIA.every((re) => PROHIBIDO.some((o) => o.source === re.source)));
  assert.ok(
    !PROHIBIDO_DEPENDENCIA.some((re) => re.test("adventurer-neutral")),
    "el nombre del estilo no puede estar entre los patrones de dependencia",
  );
  // Y el conjunto completo SÍ lo tiene: sobre la fuente se sigue aplicando.
  assert.ok(PROHIBIDO.some((re) => re.test("adventurer-neutral")));
});

test("CANARIO de bundles: el nombre del estilo inlineado NO se reporta", () => {
  const dir = semilla(
    'a.push([[4],{3313:function(){return{avatar_seed:e.id,avatar_style:"adventurer-neutral"}}}]);',
    [".next", "static", "chunk-abc123.js"],
  );
  try {
    assert.deepEqual(barrer([".next/static"], dir, PROHIBIDO_DEPENDENCIA), []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("CANARIO de bundles: la URL del generador SÍ se reporta", () => {
  const dir = semilla(
    'a.push([[4],{3313:function(){return"https://api.dicebear.com/10.x/x/svg"}}]);',
    [".next", "static", "chunk-abc123.js"],
  );
  try {
    const h = barrer([".next/static"], dir, PROHIBIDO_DEPENDENCIA);
    assert.equal(h.length, 1, `esperaba 1 hallazgo, hubo ${h.length}`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("CANARIO de bundles: el paquete de DiceBear SÍ se reporta", () => {
  const dir = semilla('t("@dicebear/core")', [".next", "server", "x.js"]);
  try {
    assert.equal(barrer([".next/server"], dir, PROHIBIDO_DEPENDENCIA).length, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("sobre la FUENTE se siguen aplicando los tres patrones", () => {
  // Sin esto, el subconjunto de los bundles se podría filtrar a la fuente y el
  // estilo viejo volvería a aparecer donde no corresponde.
  const h = canario("cualquiera.ts", 'const x = "adventurer-neutral";');
  assert.equal(h.length, 1, "el nombre del estilo dejó de detectarse en la fuente");
});

test("CANARIO del CLI: un bundle con el estilo inlineado sale con 0", () => {
  // El caso REAL de esta tanda: un build limpio no puede dar rojo.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "canario-cli-bundle-"));
  fs.mkdirSync(path.join(dir, "lib"));
  fs.mkdirSync(path.join(dir, ".next", "static"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "lib", "avatares.ts"),
    'export const ESTILO_PERSISTIDO = "adventurer-neutral";\n',
  );
  fs.writeFileSync(
    path.join(dir, ".next", "static", "chunk-abc.js"),
    'x({avatar_style:"adventurer-neutral"});',
  );
  try {
    const script = path.join(process.cwd(), "scripts", "barrido-dicebear.mjs");
    const r = spawnSync(process.execPath, [script], { cwd: dir, encoding: "utf8" });
    assert.equal(r.status, 0, `el CLI salió con ${r.status}; salida: ${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /bundles/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("CANARIO del CLI: un bundle con la URL del generador sale con 1", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "canario-cli-bundle-malo-"));
  fs.mkdirSync(path.join(dir, "lib"));
  fs.mkdirSync(path.join(dir, ".next", "static"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "lib", "avatares.ts"),
    'export const ESTILO_PERSISTIDO = "adventurer-neutral";\n',
  );
  fs.writeFileSync(
    path.join(dir, ".next", "static", "chunk-abc.js"),
    'x("https://api.dicebear.com/10.x/adventurer-neutral/svg");',
  );
  try {
    const script = path.join(process.cwd(), "scripts", "barrido-dicebear.mjs");
    const r = spawnSync(process.execPath, [script], { cwd: dir, encoding: "utf8" });
    assert.equal(r.status, 1, `el CLI salió con ${r.status}; salida: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /chunk-abc\.js/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ============================================================================
// FALSOS NEGATIVOS del criterio de comentario — auditoría del 27/08
// ============================================================================

// El criterio era: si la línea, después de `trim`, empieza con `//`, `*`, `/*`
// o `--`, no ejecuta nada. **Es falso en CSS y falso para el bloque cerrado en
// la misma línea**, y no era teórico: en `app/globals.css` hay una línea
// `*{box-sizing:border-box}` y varias `--bg:#FAFAFD;…` que el barrido estaba
// descartando como si fueran comentarios.
//
// El criterio nuevo es CONSERVADOR: ante la duda, reporta. Un comentario de
// bloque en CSS cuya línea del medio empiece con `*` se va a marcar aunque sea
// inofensivo, y está bien que así sea — el costo de un falso positivo es leerlo,
// el de un falso negativo es publicar la conexión.

const URL_PROHIBIDA = "https://api.dicebear.com/10.x/adventurer-neutral/svg?seed=x";

test("CANARIO CSS: el selector universal NO es un comentario", () => {
  const h = canario("estilos.css", `*{background-image:url("${URL_PROHIBIDA}")}`);
  assert.equal(h.length, 1, "el barrido tomó `*{…}` por un comentario");
});

test("CANARIO CSS: el selector universal CON espacio tampoco", () => {
  // `* {…}` es CSS válido y se parece a una continuación de JSDoc. En un `.css`
  // no se exime ninguna línea que empiece con `*`.
  const h = canario("estilos.css", `* {background-image:url("${URL_PROHIBIDA}")}`);
  assert.equal(h.length, 1, "el barrido tomó `* {…}` por una continuación de bloque");
});

test("CANARIO: código DESPUÉS de un bloque cerrado en la misma línea", () => {
  const h = canario("estilos.css", `/* comentario */ a{background:url("${URL_PROHIBIDA}")}`);
  assert.equal(h.length, 1, "el barrido descartó la línea entera por el `/*` del principio");
});

test("CANARIO: código después de CERRAR un bloque abierto antes", () => {
  const h = canario("estilos.css", `*/ a{background:url("${URL_PROHIBIDA}")}`);
  assert.equal(h.length, 1, "el barrido descartó una línea que cierra y sigue con código");
});

test("CANARIO CSS: una propiedad personalizada empieza con `--` y ES código", () => {
  const h = canario("estilos.css", `--fondo: url("${URL_PROHIBIDA}");`);
  assert.equal(h.length, 1, "el barrido tomó una custom property por un comentario de SQL");
});

test("en SQL, `--` SIGUE siendo comentario", () => {
  // La exención no se elimina: se acota al lenguaje donde `--` comenta de verdad.
  assert.deepEqual(canario("m.sql", "-- menciona api.dicebear.com y no cuenta"), []);
});

test("en JS/TS, la continuación de JSDoc SIGUE exenta", () => {
  assert.deepEqual(canario("x.ts", " * menciona api.dicebear.com en un JSDoc"), []);
  assert.deepEqual(canario("x.ts", " *"), []);
  assert.deepEqual(canario("x.ts", "// menciona api.dicebear.com"), []);
  assert.deepEqual(canario("x.ts", "/* menciona api.dicebear.com */"), []);
  assert.deepEqual(canario("x.ts", "/* abre un bloque con api.dicebear.com"), []);
});

test("en JS/TS, `*{` NO es una continuación de JSDoc", () => {
  const h = canario("x.ts", `const css = "*{background:url('${URL_PROHIBIDA}')}";`);
  assert.equal(h.length, 1);
});

test("app/globals.css tiene las formas que disparaban el falso negativo", () => {
  // Para que el canario no quede como un caso de laboratorio: estas líneas
  // existen HOY en el proyecto, y hasta esta corrección el barrido las salteaba.
  const css = leerRaiz("app/globals.css").split(/\r?\n/);
  assert.ok(css.some((l) => l.trim().startsWith("*{")), "ya no está el selector universal");
  assert.ok(css.some((l) => l.trim().startsWith("--")), "ya no están las custom properties");
});

// ============================================================================
// Manifiestos y locks de dependencias
// ============================================================================

// Un `@dicebear/core` agregado a `package.json` es una dependencia REAL y el
// barrido no lo veía: `.json` estaba en EXTENSIONES, pero ninguna raíz llegaba a
// la raíz del repositorio. Se agregan los manifiestos **por archivo**, nunca
// recorriendo el directorio raíz: ahí viven los cuatro archivos ajenos
// (`avatares/`, los dos `prompts/` y la migración) que no pertenecen a esta rama.

/** Siembra archivos en la raíz de un directorio temporal y barre `raices`. */
function canarioRaiz(archivos: Record<string, string>, raices = RAICES_FUENTE) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "canario-raiz-"));
  for (const [nombre, contenido] of Object.entries(archivos)) {
    fs.writeFileSync(path.join(dir, nombre), contenido, "utf8");
  }
  try { return barrer(raices, dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test("MANIFIESTOS incluye package.json y package-lock.json", () => {
  assert.ok(MANIFIESTOS.includes("package.json"));
  assert.ok(MANIFIESTOS.includes("package-lock.json"));
  // Y los locks alternativos, para que agregar uno mañana no abra el agujero.
  for (const lock of ["pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb"]) {
    assert.ok(MANIFIESTOS.includes(lock), `falta ${lock}`);
  }
});

test("los manifiestos son parte de las raíces de fuente", () => {
  for (const m of MANIFIESTOS) assert.ok(RAICES_FUENTE.includes(m), `${m} no se barre`);
});

test("CANARIO: `@dicebear/core` en package.json se detecta", () => {
  const h = canarioRaiz({
    "package.json": JSON.stringify({ dependencies: { "@dicebear/core": "^9.0.0" } }, null, 2),
  });
  assert.equal(h.length, 1, "una dependencia de DiceBear pasó desapercibida");
  assert.equal(h[0].archivo, "package.json");
});

test("CANARIO: `@dicebear/core` en package-lock.json se detecta", () => {
  const h = canarioRaiz({
    "package-lock.json": '{"packages":{"node_modules/@dicebear/core":{"version":"9.0.0"}}}',
  });
  assert.equal(h.length, 1, "el lock pasó desapercibido");
  assert.equal(h[0].archivo, "package-lock.json");
});

test("CANARIO: un lock alternativo también se barre", () => {
  const h = canarioRaiz({ "pnpm-lock.yaml": "  '@dicebear/core@9.0.0':\n    resolution: {}" });
  assert.equal(h.length, 1, "el lock alternativo no se revisó");
});

test("la raíz del repositorio NO se recorre entera", () => {
  // Los cuatro archivos ajenos viven ahí y no pertenecen a esta rama. Se agregan
  // archivos nombrados, no el directorio.
  assert.ok(!RAICES_FUENTE.includes("."), "se agregó la raíz entera");
  const h = canarioRaiz({
    "package.json": "{}",
    "ajeno.json": `{"x":"${URL_PROHIBIDA}"}`,
  });
  assert.deepEqual(h, [], "se barrió un archivo suelto de la raíz que no es manifiesto");
});
