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

test("🔴 ningún código de la app llama al SDK: no hay eventos propios", () => {
  // Lo declarado es instalación y aperturas, que el SDK registra solo. Un
  // logEvent o un AppEventsLogger en cualquier lado ya es un dato nuevo.
  const raiz = fileURLToPath(new URL("../", import.meta.url));
  const fuentes = ["android/app/src/main/java", "app", "components", "hooks", "lib"];
  const encontrados: string[] = [];
  const recorrer = (dir: string) => {
    for (const nombre of readdirSync(dir)) {
      const ruta = join(dir, nombre);
      if (statSync(ruta).isDirectory()) recorrer(ruta);
      else if (/\.(java|kt|ts|tsx|js|mjs)$/.test(nombre) && !nombre.endsWith(".test.ts")) {
        if (/AppEventsLogger|com\.facebook\.|logEvent\(/.test(readFileSync(ruta, "utf8"))) {
          encontrados.push(ruta);
        }
      }
    }
  };
  for (const f of fuentes) recorrer(join(raiz, f));
  assert.deepEqual(encontrados, [], "hay código que usa el SDK de Meta directamente");
});
