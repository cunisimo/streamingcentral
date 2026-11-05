// SDK de Meta en Android: qué se integra, qué NO, y qué permisos quedan.
//
// ============================================================================
// POR QUÉ EXISTE ESTE ARCHIVO
// ============================================================================
//
// La integración es a propósito MÍNIMA (decisión del dueño, 21/10/2026): sólo
// el módulo de eventos (facebook-core), que registra solo la instalación y las
// aperturas para atribuir las campañas de Facebook/Instagram. Lo declarado en
// yump.ar/privacidad y en Data Safety describe exactamente eso. Si alguien suma
// otro módulo del SDK, eventos propios o el ID de publicidad deja de estar,
// las declaraciones dejan de ser verdad sin que nada avise: este test avisa.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const leer = (rel: string) => readFileSync(new URL("../" + rel, import.meta.url), "utf8");
const sinComentariosXml = (s: string) => s.replace(/<!--[\s\S]*?-->/g, "");
const sinComentariosGradle = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const GRADLE = sinComentariosGradle(leer("android/app/build.gradle"));
const MANIFEST = sinComentariosXml(leer("android/app/src/main/AndroidManifest.xml"));
const STRINGS = sinComentariosXml(leer("android/app/src/main/res/values/strings.xml"));
const JAVA = "android/app/src/main/java/ar/yump/app/";
const sinComentariosJava = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");
const MEDICION = sinComentariosJava(leer(JAVA + "MedicionMeta.java"));
const YUMP_APP = sinComentariosJava(leer(JAVA + "YumpApp.java"));
const MAIN = sinComentariosJava(leer(JAVA + "MainActivity.java"));
const PLUGIN = sinComentariosJava(leer(JAVA + "MedicionMetaPlugin.java"));

test("sólo facebook-core, con versión fija", () => {
  assert.match(GRADLE, /implementation "com\.facebook\.android:facebook-core:18\.3\.0"/,
    "cambió la dependencia o la versión del SDK de Meta sin decidirlo");
  const modulos = GRADLE.match(/com\.facebook\.android:[a-z-]+/g) ?? [];
  assert.deepEqual(modulos, ["com.facebook.android:facebook-core"],
    "entró otro módulo del SDK de Meta: login, share o el SDK completo no están declarados");
  assert.doesNotMatch(GRADLE, /latest\.release/, "una versión flotante cambia el SDK sin aviso");
});

test("la app de Meta y su token de cliente están en strings.xml", () => {
  assert.match(STRINGS, /name="facebook_app_id"[^>]*>1114281058003052</);
  assert.match(STRINGS, /name="facebook_client_token"[^>]*>[0-9a-f]{32}</);
  assert.match(MANIFEST, /"com\.facebook\.sdk\.ApplicationId"\s+android:value="@string\/facebook_app_id"/);
  assert.match(MANIFEST, /"com\.facebook\.sdk\.ClientToken"\s+android:value="@string\/facebook_client_token"/);
});

test("🔴 AD_ID se conserva: la declaración 'Sí' de Play Console depende de él", () => {
  // Con "Sí" en Contenido de la app > ID de publicidad, Play bloquea una
  // release que apunte a Android 13+ sin este permiso.
  assert.match(MANIFEST, /<uses-permission android:name="com\.google\.android\.gms\.permission\.AD_ID" \/>/);
  assert.doesNotMatch(MANIFEST, /permission\.AD_ID"\s+tools:node="remove"/,
    "se quitó AD_ID: hay que cambiar la declaración de Play Console y la de Data Safety");
});

test("los permisos de Privacy Sandbox se quitan del manifest fusionado", () => {
  for (const p of ["ATTRIBUTION", "AD_ID", "CUSTOM_AUDIENCE", "TOPICS"]) {
    assert.match(MANIFEST,
      new RegExp(`ACCESS_ADSERVICES_${p}"\\s+tools:node="remove"`),
      `ACCESS_ADSERVICES_${p} no se está quitando`);
  }
});

test("los metadatos extra de la app no se envían", () => {
  assert.match(MANIFEST,
    /"com\.facebook\.sdk\.AutoLogAppMetadataEnabled"\s+android:value="false"/);
});

test("🔴 sólo MedicionMeta toca el SDK, y nunca para registrar eventos propios", () => {
  // Lo declarado es instalación y aperturas, que el SDK registra solo. Un
  // logEvent o un AppEventsLogger en cualquier lado ya es un dato nuevo. El
  // único archivo que puede nombrar al SDK es MedicionMeta.java, y sólo para
  // inicializarlo y prender o apagar sus dos banderas.
  const raiz = fileURLToPath(new URL("../", import.meta.url));
  const fuentes = ["android/app/src/main/java", "app", "components", "hooks", "lib"];
  const tocan: string[] = [];
  const eventos: string[] = [];
  const recorrer = (dir: string) => {
    for (const nombre of readdirSync(dir)) {
      const ruta = join(dir, nombre);
      if (statSync(ruta).isDirectory()) recorrer(ruta);
      else if (/\.(java|kt|ts|tsx|js|mjs)$/.test(nombre) && !nombre.endsWith(".test.ts")) {
        const texto = readFileSync(ruta, "utf8");
        if (/com\.facebook\./.test(texto)) tocan.push(nombre);
        if (/AppEventsLogger|logEvent\(|logPurchase|setUserData|setUserID/.test(texto)) eventos.push(ruta);
      }
    }
  };
  for (const f of fuentes) recorrer(join(raiz, f));
  assert.deepEqual(tocan, ["MedicionMeta.java"], "otro archivo usa el SDK de Meta directamente");
  assert.deepEqual(eventos, [], "hay código que registra eventos propios o datos de la persona en Meta");
  const permitidos = [
    "isInitialized", "sdkInitialize",
    "getAutoLogAppEventsEnabled", "setAutoLogAppEventsEnabled",
    "getAdvertiserIDCollectionEnabled", "setAdvertiserIDCollectionEnabled",
  ];
  for (const m of MEDICION.matchAll(/FacebookSdk\.(\w+)/g)) {
    assert.ok(permitidos.includes(m[1]), `MedicionMeta usa FacebookSdk.${m[1]}, que no está justificado`);
  }
});

// ------------------------------------------- activada por defecto, desactivable
//
// Decisión del dueño (30/10/2026): sin ventanas ni pedidos de permiso; la
// medición está activa salvo que la persona la desactive en Sobre Yump.

test("🔴 el SDK NO arranca solo: el manifest quita su inicializador y lo arranca YumpApp", () => {
  // Con el FacebookInitProvider, sdkInitialize corre antes que cualquier código
  // nuestro y consulta a Meta aunque la persona haya desactivado la medición.
  assert.match(MANIFEST,
    /<provider\s+android:name="com\.facebook\.internal\.FacebookInitProvider"\s+android:authorities="\$\{applicationId\}\.FacebookInitProvider"\s+tools:node="remove"\s*\/>/);
  assert.match(MANIFEST, /<application\s+android:name="\.YumpApp"/);
  assert.match(YUMP_APP, /MedicionMeta\.alArrancar\(this\)/);
  assert.doesNotMatch(MANIFEST, /AutoInitEnabled/);
});

test("🔴 la elección: activada sin elección guardada, persistente y aplicada en el acto", () => {
  // Sin elección guardada, true: es lo único que hace "activada por defecto".
  // Una actualización no borra las SharedPreferences, así que no reactiva una
  // elección desactivada.
  assert.match(MEDICION, /getBoolean\(CLAVE, true\)/);
  assert.match(MEDICION, /putBoolean\(CLAVE, activar\)\.commit\(\)/);
  assert.match(MEDICION, /static void alArrancar\(Application app\) \{\s*if \(activa\(app\)\) encender\(app\);\s*\}/);
  // Apagar = eventos automáticos e ID de publicidad en false, sin reiniciar, y
  // sin inicializar el SDK sólo para apagarlo.
  const apagar = MEDICION.slice(MEDICION.indexOf("private static void apagar()"),
    MEDICION.indexOf("private static SharedPreferences"));
  assert.match(apagar, /if \(!FacebookSdk\.isInitialized\(\)\) return;/);
  assert.match(apagar, /setAutoLogAppEventsEnabled\(false\)/);
  assert.match(apagar, /setAdvertiserIDCollectionEnabled\(false\)/);
  assert.doesNotMatch(apagar, /sdkInitialize/);
});

test("el plugin local se registra antes de que arranque el bridge", () => {
  assert.match(MAIN, /registerPlugin\(MedicionMetaPlugin\.class\);\s*super\.onCreate\(savedInstanceState\);/);
  assert.match(PLUGIN, /@CapacitorPlugin\(name = "MedicionMeta"\)/);
});
