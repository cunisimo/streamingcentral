// El entorno del build nativo: qué llega al proceso hijo y qué NO.
//
// ⚠️ NINGÚN test toca el `.env.local` real. Todos usan un archivo dentro de un
// directorio temporal propio, que se borra al terminar. Por eso
// `entornoDelBuild` acepta una fuente inyectable.
//
// Se corre aparte: `node --test scripts/entorno.test.mjs`
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  entornoDelBuild, operativasDelSistema, APP_DESDE_ENV, APP_DEL_SCRIPT,
} from "./build-capacitor.mjs";

// Valores inventados. Ninguno es real.
const FIXTURE = [
  "NEXT_PUBLIC_SUPABASE_URL=https://ejemplo.supabase.co",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-de-prueba",
  "NEXT_PUBLIC_SITE_URL=https://app.yump.ar",
  "TMDB_READ_TOKEN=secreto-de-prueba",
  "SUPABASE_SERVICE_ROLE_KEY=secreto-de-prueba",
  "CRON_SECRET=secreto-de-prueba",
  "UPSTASH_REDIS_REST_TOKEN=secreto-de-prueba",
  "UPSTASH_REDIS_REST_URL=https://ejemplo.upstash.io",
  "SECRETO_FICTICIO_DE_PRUEBA=no-debe-viajar",
].join("\n");

// Un `process.env` falso: incluye un secreto para probar que tampoco pasa por
// ahí, y usa "Path" con esa capitalización para verificar que se preserva.
const SISTEMA_FALSO = {
  Path: "C:\\fake\\bin",
  SystemRoot: "C:\\Windows",
  ComSpec: "C:\\Windows\\cmd.exe",
  PATHEXT: ".EXE;.CMD",
  TEMP: "C:\\Temp",
  TMP: "C:\\Temp",
  USERPROFILE: "C:\\Users\\x",
  APPDATA: "C:\\Users\\x\\AppData\\Roaming",
  LOCALAPPDATA: "C:\\Users\\x\\AppData\\Local",
  TMDB_READ_TOKEN: "no-debe-viajar",
};

function conFixture(fn) {
  const dir = mkdtempSync(join(tmpdir(), "yump-env-"));
  const ruta = join(dir, ".env.local");
  writeFileSync(ruta, FIXTURE, "utf8");
  try { return fn(ruta); } finally { rmSync(dir, { recursive: true, force: true }); }
}

const armar = () => conFixture((f) =>
  entornoDelBuild("https://ejemplo.invalid", { fuente: f, sistema: SISTEMA_FALSO }));

// ============================================================================
// 1. Variables de APLICACIÓN permitidas
// ============================================================================

test("llegan las SEIS de aplicación, ni una más ni una menos", () => {
  const env = armar();
  const app = Object.keys(env).filter((k) => k === "CAPACITOR" || k.startsWith("NEXT_PUBLIC_"));
  assert.deepEqual(app.sort(), [
    "CAPACITOR",
    "NEXT_PUBLIC_SITE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_YUMP_API_BASE",
    "NEXT_PUBLIC_YUMP_NATIVO",
  ]);
});

test("la bandera nativa y CAPACITOR llegan en 1", () => {
  const env = armar();
  assert.equal(env.CAPACITOR, "1");
  assert.equal(env.NEXT_PUBLIC_YUMP_NATIVO, "1");
});

test("SITE_URL llega como https://app.yump.ar — comprobado en el ENTORNO", () => {
  // No por grep del bundle: esa URL ya está en SITIO_PUBLICO (lib/compartir.ts)
  // y aparecería igual aunque la variable no se hubiera inyectado.
  assert.equal(armar().NEXT_PUBLIC_SITE_URL, "https://app.yump.ar");
});

// ============================================================================
// 2. Variables OPERATIVAS del sistema — se evalúan APARTE
// ============================================================================

test("llegan las operativas, con su casing REAL", () => {
  const env = armar();
  assert.equal(env.Path, "C:\\fake\\bin", "debe conservar 'Path', no renombrarlo a 'PATH'");
  assert.equal(env.PATH, undefined, "no inventa una clave que el sistema no tenía");
  for (const k of ["SystemRoot", "ComSpec", "PATHEXT", "TEMP", "TMP",
                   "USERPROFILE", "APPDATA", "LOCALAPPDATA"]) {
    assert.ok(env[k], `falta la operativa ${k}`);
  }
});

test("una operativa ausente del sistema simplemente no se inventa", () => {
  const env = conFixture((f) =>
    entornoDelBuild("https://ejemplo.invalid", { fuente: f, sistema: { Path: "C:\\x" } }));
  assert.equal(env.Path, "C:\\x");
  assert.equal(env.SystemRoot, undefined);
});

// ============================================================================
// 3. Variables PROHIBIDAS
// ============================================================================

test("PRUEBA NEGATIVA: ningún secreto llega, ni del .env.local ni del sistema", () => {
  const env = armar();
  for (const k of ["TMDB_READ_TOKEN", "SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET",
                   "UPSTASH_REDIS_REST_TOKEN", "UPSTASH_REDIS_REST_URL",
                   "SECRETO_FICTICIO_DE_PRUEBA"]) {
    assert.equal(env[k], undefined, `se coló ${k}`);
  }
});

test("nada fuera de las dos allowlists", () => {
  const env = armar();
  const permitidas = new Set([
    ...APP_DESDE_ENV, ...APP_DEL_SCRIPT,
    ...Object.keys(operativasDelSistema(SISTEMA_FALSO)),
  ]);
  for (const k of Object.keys(env)) assert.ok(permitidas.has(k), `se coló ${k}`);
});

test("ningún VALOR secreto aparece en el entorno resultante", () => {
  const valores = Object.values(armar()).join("|");
  assert.doesNotMatch(valores, /secreto-de-prueba|no-debe-viajar/);
});

// ============================================================================
// 4. Errores sin valores
// ============================================================================

test("faltar una pública falla nombrándola, sin filtrar valores", () => {
  const parcial = [
    "NEXT_PUBLIC_SUPABASE_URL=https://ejemplo.supabase.co",
    "CRON_SECRET=secreto-de-prueba",
  ].join("\n");
  assert.throws(
    () => entornoDelBuild("https://ejemplo.invalid", { fuente: parcial, sistema: SISTEMA_FALSO }),
    (e) => {
      assert.match(e.message, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
      assert.match(e.message, /NEXT_PUBLIC_SITE_URL/);
      assert.doesNotMatch(e.message, /secreto-de-prueba|ejemplo\.supabase/);
      return true;
    },
  );
});

test("acepta la fuente como texto, como ruta y como función", () => {
  const texto = FIXTURE;
  const porTexto = entornoDelBuild("https://ejemplo.invalid", { fuente: texto, sistema: SISTEMA_FALSO });
  const porFn = entornoDelBuild("https://ejemplo.invalid", { fuente: () => texto, sistema: SISTEMA_FALSO });
  const porRuta = armar();
  assert.equal(porTexto.NEXT_PUBLIC_SITE_URL, "https://app.yump.ar");
  assert.equal(porFn.NEXT_PUBLIC_SITE_URL, "https://app.yump.ar");
  assert.equal(porRuta.NEXT_PUBLIC_SITE_URL, "https://app.yump.ar");
});
