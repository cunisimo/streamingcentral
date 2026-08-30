// Construye la cáscara estática que empaqueta el contenedor Capacitor.
//
//   node scripts/build-capacitor.mjs --api-base=https://ejemplo.invalid
//   node scripts/build-capacitor.mjs --diagnostico        (CP1: sin staging)
//   node scripts/build-capacitor.mjs --api-base=... --keep-staging   (canarios)
//
// EL PRINCIPIO QUE ORDENA TODO: nunca se mueve ni se borra nada del árbol
// original. Se construye desde una COPIA. Si el proceso se interrumpe a mitad,
// lo único dañado es `.capacitor-build/`, que se borra y se rehace.
//
// Tres decisiones que parecen detalles y no lo son:
//
// 1. NO se usa `npx`: puede intentar descargar. El CLI de Next se resuelve por
//    ruta absoluta dentro de node_modules.
// 2. NO se usa `shell: true`: mete un intérprete con sus propias reglas de
//    escapado. Se ejecuta con el mismo Node que corre este script.
// 3. NO se hereda `process.env`. Si se heredara, `TMDB_READ_TOKEN`,
//    `SUPABASE_SERVICE_ROLE_KEY` y `CRON_SECRET` llegarían al build. Se pasan
//    dos allowlists separadas: las públicas de la aplicación y las operativas
//    del sistema.
import { spawnSync } from "node:child_process";
import { resolve, join, basename, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import ts from "typescript";
import {
  existsSync, readFileSync, writeFileSync, rmSync, mkdirSync, cpSync,
  symlinkSync, lstatSync, readlinkSync, unlinkSync,
} from "node:fs";

// ============================================================================
// Directorios. Son los ÚNICOS tres que este script puede escribir o borrar.
// ============================================================================

export const STAGING = ".capacitor-build";
export const SALIDA_INTERNA = "out";          // distDir, relativo al cwd del staging
export const ARTEFACTO = "out-capacitor";     // canónico: el webDir del contenedor
export const DIR_DIAGNOSTICO = ".capacitor-diagnostico";

const BORRABLES = new Set([STAGING, ARTEFACTO, DIR_DIAGNOSTICO]);

/**
 * Borrado recursivo con tres guardas. Cualquiera que falle aborta.
 * Nunca se le pasa un nombre calculado sin verificar.
 */
export function borrarSeguro(nombre) {
  const raiz = resolve(".");
  const objetivo = resolve(nombre);
  if (!objetivo.startsWith(raiz + sep)) throw new Error(`fuera del worktree: ${nombre}`);
  if (!BORRABLES.has(basename(objetivo))) throw new Error(`nombre no autorizado: ${nombre}`);
  if (!existsSync(objetivo)) return false;
  // ⚠️ La junction de node_modules se quita ANTES del borrado recursivo. Si no,
  // el `rm -r` la seguiría y borraría node_modules de verdad.
  quitarJunction(join(objetivo, "node_modules"));
  rmSync(objetivo, { recursive: true, force: true });
  return true;
}

// ============================================================================
// node_modules por junction. En Windows `mklink` es un comando interno de
// `cmd`, no un ejecutable: se usa la API del filesystem, con tipo "junction",
// que NO requiere elevación (a diferencia de un symlink).
// ============================================================================

function quitarJunction(enlace) {
  if (!existsSync(enlace)) return;
  const st = lstatSync(enlace);
  if (!st.isSymbolicLink()) return;   // no es nuestra: no se toca
  unlinkSync(enlace);                 // borra el ENLACE, no el destino
}

export function enlazarNodeModules(dirStaging) {
  const destino = resolve("node_modules");
  const enlace = resolve(dirStaging, "node_modules");
  if (existsSync(enlace)) {
    const st = lstatSync(enlace);
    if (!st.isSymbolicLink()) throw new Error("existe y NO es junction: revisar a mano");
    if (resolve(readlinkSync(enlace)) === destino) return "ya existía";
    unlinkSync(enlace);
  }
  symlinkSync(destino, enlace, "junction");
  return "creada";
}

// ============================================================================
// Entorno del build: DOS allowlists separadas.
// ============================================================================

/** Públicas de la aplicación que se leen del .env.local. */
export const APP_DESDE_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SITE_URL",
];
/** Públicas de la aplicación que arma este script. */
export const APP_DEL_SCRIPT = ["CAPACITOR", "NEXT_PUBLIC_YUMP_NATIVO", "NEXT_PUBLIC_YUMP_API_BASE"];

/**
 * Operativas del sistema. Sin ellas Next no arranca en Windows.
 * Se copian preservando el NOMBRE Y EL CASING REAL: la variable puede llamarse
 * "Path" o "PATH" según cómo se haya iniciado el proceso, y buscar sólo una la
 * perdería.
 */
export const OPERATIVAS = [
  "PATH", "SystemRoot", "ComSpec", "PATHEXT",
  "TEMP", "TMP", "USERPROFILE", "APPDATA", "LOCALAPPDATA",
];

export function operativasDelSistema(fuente = process.env) {
  const out = {};
  for (const querida of OPERATIVAS) {
    const real = Object.keys(fuente).find((k) => k.toLowerCase() === querida.toLowerCase());
    if (real) out[real] = fuente[real];
  }
  return out;
}

/**
 * Arma el entorno del proceso hijo desde cero.
 * `fuente` es inyectable para las pruebas: texto, ruta, o función lectora.
 * Los tests NUNCA tocan el `.env.local` real.
 */
export function entornoDelBuild(apiBase, opts = {}) {
  const { fuente = resolve(".env.local"), sistema = process.env } = opts;

  let texto;
  if (typeof fuente === "function") texto = fuente();
  else if (typeof fuente === "string" && fuente.includes("=")) texto = fuente;
  else {
    if (!existsSync(fuente)) throw new Error(`no existe el archivo de entorno: ${fuente}`);
    texto = readFileSync(fuente, "utf8");
  }
  const leido = parseEnv(texto);   // no toca process.env

  const env = {
    ...operativasDelSistema(sistema),
    CAPACITOR: "1",
    NEXT_PUBLIC_YUMP_NATIVO: "1",
    NEXT_PUBLIC_YUMP_API_BASE: apiBase,
  };
  const faltan = [];
  for (const k of APP_DESDE_ENV) {
    if (!leido[k]) { faltan.push(k); continue; }   // sólo el NOMBRE, nunca el valor
    env[k] = leido[k];
  }
  if (faltan.length) throw new Error(`faltan variables públicas: ${faltan.join(", ")}`);
  return env;
}

// ============================================================================
// tsconfig derivado
// ============================================================================

/**
 * Escribe `<staging>/tsconfig.json` a partir del original, excluyendo los
 * tests. El original NO se toca y NO se usa `ignoreBuildErrors`.
 *
 * Hace falta porque el staging copia `lib/`, `components/` y `hooks/` con sus
 * archivos de prueba, pero NO copia `scripts/` ni `supabase/` — y dos tests
 * importan de ahí (`sin-dicebear` y `sync-reparar`). Sin excluirlos, el
 * typecheck del build fallaría por dependencias que el artefacto no necesita.
 */
export function escribirTsconfigDerivado(dirStaging) {
  const origen = resolve("tsconfig.json");
  const { config, error } = ts.readConfigFile(origen, ts.sys.readFile);   // lee JSONC
  if (error) {
    throw new Error(
      `no se pudo parsear tsconfig.json: ${ts.flattenDiagnosticMessageText(error.messageText, " ")}`,
    );
  }
  const derivado = {
    ...config,
    exclude: ["node_modules", "supabase/functions", "**/*.test.ts", "**/*.test.tsx"],
  };
  const destino = join(dirStaging, "tsconfig.json");
  writeFileSync(destino, JSON.stringify(derivado, null, 2) + "\n", "utf8");
  return destino;
}

// ============================================================================
// La copia
// ============================================================================

/** Directorios que se copian enteros. */
const DIRS = ["components", "lib", "hooks", "assets"];
/** Archivos sueltos que Next necesita para construir. */
const ARCHIVOS = [
  "next.config.mjs", "tsconfig.json", "postcss.config.mjs",
  "tailwind.config.ts", "next-env.d.ts", "package.json", "package-lock.json",
];
/** Rutas de `app/` que NO viajan. */
const APP_FUERA = new Set(["api", "admin", "titulo", "persona"]);
/** De `public/`, lo que NO viaja: el service worker (defensa de build, CP6). */
export const PUBLIC_FUERA = new Set(["sw.js", "sw"]);

/**
 * El núcleo de idioma que la app COMPARTE con la Edge Function.
 *
 * No es un artefacto de pruebas: `lib/idioma.ts` —código de aplicación— lo
 * importa, así que sin esto el typecheck del staging falla con "Cannot find
 * module '../supabase/functions/_shared/idioma-nucleo.ts'". Se copia sólo
 * `_shared/`, no todo `supabase/`: es la única parte de la que depende `lib/`.
 *
 * Se descubrió corriendo el export de CP2. La auditoría previa sólo había
 * mirado los archivos `*.test.ts` y este import está en código de producción.
 */
const COMPARTIDO_SUPABASE = join("supabase", "functions", "_shared");

export function copiarAlStaging(dirStaging) {
  mkdirSync(dirStaging, { recursive: true });

  for (const d of DIRS) cpSync(d, join(dirStaging, d), { recursive: true });
  for (const f of ARCHIVOS) cpSync(f, join(dirStaging, f));

  mkdirSync(join(dirStaging, COMPARTIDO_SUPABASE), { recursive: true });
  cpSync(COMPARTIDO_SUPABASE, join(dirStaging, COMPARTIDO_SUPABASE), { recursive: true });

  // `app/` sin las cuatro rutas excluidas. `app/t` y `app/p` SÍ viajan: no
  // están en la lista, y son las que reemplazan a titulo y persona.
  cpSync("app", join(dirStaging, "app"), {
    recursive: true,
    filter: (src) => {
      const rel = resolve(src).slice(resolve("app").length + 1).split(sep)[0];
      return !rel || !APP_FUERA.has(rel);
    },
  });

  // `public/` sin el service worker.
  cpSync("public", join(dirStaging, "public"), {
    recursive: true,
    filter: (src) => {
      const rel = resolve(src).slice(resolve("public").length + 1).split(sep)[0];
      return !rel || !PUBLIC_FUERA.has(rel);
    },
  });
  // `.env.local` NUNCA se copia: sus valores viajan por allowlist, no por archivo.
}

// ============================================================================
// Orquestación
// ============================================================================

function argumento(nombre) {
  const arg = process.argv.find((a) => a.startsWith(`--${nombre}=`));
  return arg ? arg.slice(nombre.length + 3) : null;
}

function correrNext(cwd, env) {
  const cliNext = resolve("node_modules", "next", "dist", "bin", "next");
  if (!existsSync(cliNext)) throw new Error("no se encontró el CLI de Next en node_modules");
  return spawnSync(process.execPath, [cliNext, "build"], {
    cwd, stdio: "inherit", shell: false, env,
  });
}

function main() {
  // CP1: diagnóstico sin staging, para ver por qué falla el export.
  if (process.argv.includes("--diagnostico")) {
    const r = correrNext(resolve("."), {
      ...operativasDelSistema(),
      CAPACITOR: "1",
      CAPACITOR_DIST: DIR_DIAGNOSTICO,
    });
    process.exit(r.status ?? 1);
  }

  const apiBase = argumento("api-base");
  if (!apiBase) {
    console.error("falta --api-base=<url>");
    process.exit(1);
  }
  const conservar = process.argv.includes("--keep-staging");

  console.log("· limpiando");
  borrarSeguro(STAGING);
  borrarSeguro(ARTEFACTO);

  console.log("· copiando al staging");
  copiarAlStaging(STAGING);

  console.log("· node_modules:", enlazarNodeModules(STAGING));
  console.log("· tsconfig derivado:", escribirTsconfigDerivado(STAGING));

  console.log("· build");
  const r = correrNext(resolve(STAGING), entornoDelBuild(apiBase));
  if (r.status !== 0) {
    console.error("el build falló; el staging queda para inspección");
    process.exit(r.status ?? 1);
  }

  const salida = resolve(STAGING, SALIDA_INTERNA);
  if (!existsSync(join(salida, "index.html"))) {
    console.error("el build terminó pero no hay index.html en la salida");
    process.exit(1);
  }

  console.log("· publicando el artefacto en", ARTEFACTO);
  cpSync(salida, resolve(ARTEFACTO), { recursive: true });

  if (!conservar) borrarSeguro(STAGING);
  else console.log("· staging conservado (--keep-staging)");
  console.log("listo");
}

// ⚠️ `pathToFileURL`, no un `file://${argv[1]}` armado a mano: en Windows
// `import.meta.url` es `file:///D:/...` con TRES barras y la comparación manual
// nunca coincide — el script se importaba, no ejecutaba nada y salía con 0.
//
// Y el guard de `argv[1]` no sobra: al importar este módulo desde `node -e`
// —que es como lo usan los canarios— `process.argv[1]` viene `undefined` y
// `pathToFileURL` tira `ERR_INVALID_ARG_TYPE`. Sin esto, importar el módulo
// para reusar sus funciones explota antes de poder llamarlas.
const invocadoDirecto =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (invocadoDirecto) main();
