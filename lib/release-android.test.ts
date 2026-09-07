// La release de Google Play: que apunte a Producción y que esté firmada.
//
// ============================================================================
// LOS DOS ERRORES QUE ESTE ARCHIVO EXISTE PARA IMPEDIR
// ============================================================================
//
// 1. SUBIR UNA PREVIEW A PLAY. El mismo comando arma el artefacto de desarrollo
//    y el de publicación, y lo único que cambia es una URL en la línea de
//    comandos. Un AAB construido contra una Preview de Vercel compila igual, se
//    sube igual y falla recién en el teléfono de un tester: la Preview responde
//    302 al SSO de Vercel y la app lo muestra como "sin conexión". Nada en el
//    camino avisa, porque para Gradle `assets/public` es una carpeta de archivos.
//
// 2. FIRMAR CON LA CLAVE DE DEPURACIÓN. Es el respaldo silencioso clásico: falta
//    el `keystore.properties`, el build sigue y sale un artefacto que no sirve.
//    Acá la ausencia del archivo es un error con el motivo escrito.
//
// Los dos guards son de BUILD, no de runtime: tienen que fallar antes de que
// exista un archivo para subir, no después.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BASE_PRODUCCION,
  motivoParaNoConstruirRelease,
} from "../scripts/build-capacitor.mjs";
import { API_BASE, apiUrl } from "./api-base.ts";

const leer = (rel: string) => readFileSync(new URL("../" + rel, import.meta.url), "utf8");
const codigo = (rel: string) =>
  leer(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const GRADLE = codigo("android/app/build.gradle");

// ============================================================================
// 1. QUÉ API VIAJA ADENTRO DEL ARTEFACTO
// ============================================================================

test("la base de Producción es exactamente https://app.yump.ar", () => {
  // Escrita una sola vez del lado del script; el Gradle la repite y hay un test
  // más abajo que ata las dos copias.
  assert.equal(BASE_PRODUCCION, "https://app.yump.ar");
  // Y cumple lo que `baseValida` exige del lado nativo: HTTPS, con host y sin
  // path, query ni fragmento. Si no, el build nativo lanzaría al evaluarse.
  const u = new URL(BASE_PRODUCCION);
  assert.equal(u.protocol, "https:");
  assert.equal(u.pathname, "/");
  assert.equal(u.search + u.hash, "");
});

test("🔴 --release rechaza cualquier base que no sea la de Producción", () => {
  const rechazadas = [
    "https://streamingcentral-mcqohbn99-jfgalindez-gmailcoms-projects.vercel.app",
    "https://yump.ar",              // el sitio, no la API
    "https://app.yump.ar/",         // barra final: mismo host, otra cadena
    "https://app.yump.ar/api",      // con ruta
    "https://app-yump.ar",          // parecida
    "https://app.yump.ar.evil.com", // sufijo
    "http://app.yump.ar",           // sin TLS
    "https://APP.YUMP.AR",          // otra capitalización
  ];
  for (const base of rechazadas) {
    const motivo = motivoParaNoConstruirRelease(base, true);
    assert.ok(motivo, `--release aceptó "${base}"`);
    assert.match(motivo, /app\.yump\.ar/, "el error no dice cuál es la base correcta");
  }
});

test("--release acepta la base de Producción", () => {
  assert.equal(motivoParaNoConstruirRelease(BASE_PRODUCCION, true), null);
});

test("sin --release el build sigue aceptando cualquier base: la web no cambia", () => {
  // El guard es de la release, no del desarrollo. Las Previews y los canarios
  // se siguen construyendo igual que siempre.
  for (const base of ["https://una-preview.vercel.app", "https://ejemplo.invalid"]) {
    assert.equal(motivoParaNoConstruirRelease(base, false), null);
  }
});

test("el script declara --release y corta antes de construir", () => {
  const src = codigo("scripts/build-capacitor.mjs");
  assert.match(src, /--release/, "el script no reconoce --release");
  // El chequeo va antes de copiar el staging: no se paga un build para enterarse.
  const iGuard = src.indexOf("motivoParaNoConstruirRelease(apiBase");
  const iCopia = src.indexOf("copiarAlStaging(STAGING)");
  assert.ok(iGuard > 0 && iCopia > iGuard, "el guard corre después de armar el staging");
  assert.match(src.slice(iGuard, iCopia), /process\.exit\(1\)/, "el guard no corta el proceso");
});

// ============================================================================
// 2. EL MISMO CONTROL, DEL LADO DE GRADLE
// ============================================================================
// El script sólo puede vigilar el build que él corre. `bundleRelease` empaqueta
// lo que encuentre en `assets/public`, venga de donde venga — de un
// `cap sync` viejo, de otra rama, de una copia a mano. Por eso el segundo guard
// mira el RESULTADO y no la intención.

test("🔴 bundleRelease depende de los dos guards", () => {
  assert.match(GRADLE, /tasks\.register\("verificarBaseDeApi"\)/, "falta el guard de la API");
  assert.match(GRADLE, /tasks\.register\("verificarFirmaDeCarga"\)/, "falta el guard de la firma");
  const enganche = GRADLE.slice(GRADLE.indexOf("afterEvaluate"));
  assert.match(enganche, /bundleRelease/, "el AAB no depende de los guards");
  assert.match(enganche, /assembleRelease/, "el APK de release no depende de los guards");
  assert.match(enganche, /dependsOn\("verificarFirmaDeCarga", "verificarBaseDeApi"\)/,
    "el enganche no declara los dos guards");
});

test("🔴 el guard de Gradle usa la MISMA base que el script", () => {
  // Dos copias de la URL en dos lenguajes distintos: si divergen, uno de los dos
  // guards deja de proteger y nadie se entera.
  assert.match(GRADLE, new RegExp(`def BASE_PRODUCCION = "${BASE_PRODUCCION}"`),
    "el build.gradle no declara la misma base que el script");
});

test("🔴 el guard rechaza un paquete de Preview y exige el de Producción", () => {
  const tarea = GRADLE.slice(GRADLE.indexOf('tasks.register("verificarBaseDeApi")'),
    GRADLE.indexOf('tasks.register("verificarFirmaDeCarga")'));
  assert.match(tarea, /vercel\.app/, "no detecta un paquete de Preview");
  assert.match(tarea, /contains\(BASE_PRODUCCION\)/, "no exige la base de Producción");
  // Las tres salidas son excepciones, no avisos: un `logger.warn` dejaría pasar.
  assert.equal((tarea.match(/throw new GradleException/g) ?? []).length, 3,
    "alguna condición dejó de cortar el build");
  assert.match(tarea, /src\/main\/assets\/public/, "no mira el paquete web empaquetado");
});

// ============================================================================
// 3. LA FIRMA: SIN CLAVE NO HAY RELEASE, Y NUNCA SE FIRMA CON DEBUG
// ============================================================================

test("🔴 la release NUNCA usa la firma de depuración", () => {
  assert.doesNotMatch(GRADLE, /signingConfigs\.debug/,
    "el build de release puede caer a la clave de depuración");
  const release = GRADLE.slice(GRADLE.indexOf("buildTypes"), GRADLE.indexOf("repositories"));
  assert.match(release, /signingConfig signingConfigs\.release/, "la release no declara su firma");
  assert.match(release, /if \(hayFirmaDeCarga\)/,
    "la firma se asigna sin comprobar que exista: el error sería de Gradle, no nuestro");
});

test("🔴 sin keystore.properties la release falla con el motivo escrito", () => {
  const tarea = GRADLE.slice(GRADLE.indexOf('tasks.register("verificarFirmaDeCarga")'));
  assert.match(tarea, /throw new GradleException/, "la falta de clave no corta el build");
  assert.match(tarea, /keystore\.properties/, "el error no nombra el archivo que falta");
  assert.match(tarea, /storeFile/, "no verifica que el keystore exista en disco");
});

test("🔴 las credenciales salen del archivo y no tienen valor por defecto", () => {
  assert.match(GRADLE, /rootProject\.file\("keystore\.properties"\)/,
    "las credenciales no salen del archivo esperado");
  for (const clave of ["storeFile", "storePassword", "keyAlias", "keyPassword"]) {
    assert.match(GRADLE, new RegExp(`getProperty\\("${clave}"\\)`), `no lee ${clave}`);
  }
  // Ni una contraseña, ni un alias, ni una ruta escritos en el repositorio.
  assert.doesNotMatch(GRADLE, /(store|key)Password\s+"/, "hay una contraseña literal en el build");
  assert.doesNotMatch(GRADLE, /\.jks/, "hay una ruta de keystore literal en el build");
});

test("🔴 keystore.properties y los keystores están fuera de Git", () => {
  const ignore = leer("android/.gitignore");
  for (const patron of ["keystore.properties", "*.jks", "*.keystore"]) {
    const linea = new RegExp(`^${patron.replace(/[.*]/g, "\\$&")}$`, "m");
    assert.match(ignore, linea, `${patron} no está ignorado`);
  }
});

// ============================================================================
// 4. LA CONFIGURACIÓN DE RELEASE
// ============================================================================

test("versionCode 1, versionName 1.0.0 y release no depurable", () => {
  assert.match(GRADLE, /versionCode 1\b/, "cambió el versionCode del primer envío");
  assert.match(GRADLE, /versionName "1\.0\.0"/, "el versionName no es 1.0.0");
  assert.match(GRADLE, /debuggable false/, "la release no declara debuggable false");
  assert.match(GRADLE, /minifyEnabled false/, "cambió minifyEnabled sin decidirlo");
  assert.match(GRADLE, /applicationId "ar\.yump\.app"/, "cambió el package definitivo");
  assert.match(GRADLE, /namespace = "ar\.yump\.app"/, "el namespace dejó de coincidir");
});

// ============================================================================
// 5. LA WEB NO CAMBIA
// ============================================================================
// `apiUrl` es lo único que decide a dónde va un pedido, y en la web tiene que
// seguir devolviendo la ruta relativa: mismo origen, cero preflight, cero CORS.

test("🔴 en la web la base es vacía y apiUrl no reescribe nada", () => {
  // Este test corre sin `NEXT_PUBLIC_YUMP_NATIVO`, o sea en las condiciones de
  // la web: `resolverBase` sale por `if (!ES_NATIVO) return ""` sin siquiera
  // mirar la variable. Que la base de Producción esté configurada en Vercel no
  // cambia una sola URL del sitio.
  assert.equal(API_BASE, "", "la web dejó de pedir a su propio origen");
  for (const ruta of ["/api/home?providers=n", "/api/upcoming?page=2", "/titulo/movie/1"]) {
    assert.equal(apiUrl(ruta), ruta);
  }
});

test("en el contenedor apiUrl antepone la base SÓLO a /api/", () => {
  assert.equal(apiUrl("/api/home", BASE_PRODUCCION), `${BASE_PRODUCCION}/api/home`);
  assert.equal(apiUrl("/titulo/movie/1", BASE_PRODUCCION), "/titulo/movie/1");
});

test("la base sigue sin tener un valor por defecto de ejecución", () => {
  const src = codigo("lib/api-base.ts");
  // Next reemplaza `process.env.NEXT_PUBLIC_*` sólo si está escrito completo:
  // armarlo con una variable deja `undefined` en el bundle.
  assert.match(src, /process\.env\.NEXT_PUBLIC_YUMP_API_BASE/);
  // Y la base de Producción NO está escrita acá: si estuviera, un build nativo
  // mal configurado apuntaría a Producción sin que nadie lo hubiera decidido.
  assert.doesNotMatch(src, /app\.yump\.ar/,
    "hay un fallback a Producción: un error de configuración dejaría de fallar");
  assert.match(src, /throw new Error/, "el build nativo dejó de fallar sin base");
});
