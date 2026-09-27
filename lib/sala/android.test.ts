// Yumpeá dentro de la app Android (decisión del dueño, 27/09). Tres cosas:
// la ruta compatible con el paquete, el enlace público de invitación y la
// traducción de un App Link. Lo que se puede comprobar sin teléfono.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { hrefSala, parseParamsSala } from "../rutas.ts";
import { urlDeSala, SITIO_PUBLICO } from "../compartir.ts";
import { rutaDeEnlace, HOST_PUBLICO } from "./enlace-nativo.ts";
import { excluidaDeApp, APP_DESDE_ENV, APP_DEL_SCRIPT, motivoParaNoConstruirRelease } from "../../scripts/build-capacitor.mjs";

const leer = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");
/**
 * El código SIN comentarios. Varios de estos archivos nombran en un comentario
 * justo lo que se comprueba que ya no se usa —`location.origin`, `ES_NATIVO`,
 * `"use client"`— porque explican el cambio; mirar el archivo entero daría
 * falsos positivos.
 */
const codigo = (p: string) => leer(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const UUID = "3d749c9c-ef7f-4496-bfc5-49f515bfb6f3";

// ── La ruta ────────────────────────────────────────────────────────────────

test("hrefSala: la web conserva /sala/<uuid> y el contenedor usa /s/?id=", () => {
  assert.equal(hrefSala(UUID, { nativo: false }), `/sala/${UUID}`);
  assert.equal(hrefSala(UUID, { nativo: true }), `/s/?id=${UUID}`);
});

test("🔴 del paquete se excluye SÓLO el segmento dinámico: /sala/nueva sigue viajando", () => {
  // Era lo que rompía el build: `Page "/sala/[id]" is missing
  // "generateStaticParams()"`. Excluir "sala" entero se habría llevado puesta
  // la pantalla de crear.
  assert.equal(excluidaDeApp("sala/[id]"), true);
  assert.equal(excluidaDeApp("sala/[id]/page.tsx"), true);
  assert.equal(excluidaDeApp("sala/nueva"), false);
  assert.equal(excluidaDeApp("sala/nueva/page.tsx"), false);
  assert.equal(excluidaDeApp("sala"), false, "la carpeta se recorre: si no, no se llega a nueva");
  assert.equal(excluidaDeApp("s/page.tsx"), false, "la ruta por query sí viaja");
  assert.equal(excluidaDeApp(""), false, "app/ misma");
  // Las cuatro de siempre no cambiaron.
  for (const d of ["api", "admin", "titulo", "persona"]) {
    assert.equal(excluidaDeApp(`${d}/page.tsx`), true, d);
  }
  // Un nombre que EMPIEZA igual no se excluye por accidente.
  assert.equal(excluidaDeApp("salas-viejas/page.tsx"), false);
  assert.equal(excluidaDeApp("apixyz/page.tsx"), false);
});

test("parseParamsSala: sólo uuid, y se normaliza a minúsculas", () => {
  assert.deepEqual(parseParamsSala(new URLSearchParams(`id=${UUID}`)), { id: UUID });
  assert.deepEqual(parseParamsSala(new URLSearchParams(`id=${UUID.toUpperCase()}`)), { id: UUID });
  for (const malo of ["", "id=", "id=123", "id=../../etc", `id=${UUID}x`, "otro=1"]) {
    assert.equal(parseParamsSala(new URLSearchParams(malo)), null, malo);
  }
});

test("la ruta /s existe, es estática y lleva noindex, como /t y /p", () => {
  const pagina = codigo("app/s/page.tsx");
  assert.doesNotMatch(pagina, /"use client"/, "la metadata exige que sea de servidor");
  assert.match(pagina, /robots: \{ index: false, follow: false \}/);
  assert.match(leer("components/nativo/SalaDesdeQuery.tsx"), /<Suspense/, "useSearchParams lo exige al prerenderizar");
});

// ── El enlace de invitación ────────────────────────────────────────────────

test("🔴 el enlace que se reparte es SIEMPRE el público, nunca location.origin", () => {
  assert.equal(urlDeSala(UUID), `${SITIO_PUBLICO}/sala/${UUID}`);
  assert.equal(SITIO_PUBLICO, "https://app.yump.ar");
  const lobby = codigo("components/sala/Lobby.tsx");
  assert.match(lobby, /const enlace = urlDeSala\(roomId\)/);
  // Adentro del contenedor `location.origin` es `https://localhost`: el
  // organizador copiaba un enlace que no le servía a nadie, ni a él.
  assert.doesNotMatch(lobby, /location\.origin/, "volvió el origen del navegador");
});

// ── El App Link ────────────────────────────────────────────────────────────

test("rutaDeEnlace traduce el enlace público a la ruta interna del contenedor", () => {
  assert.equal(HOST_PUBLICO, "app.yump.ar");
  assert.equal(rutaDeEnlace(`https://app.yump.ar/sala/${UUID}`), `/s/?id=${UUID}`);
  assert.equal(rutaDeEnlace(`https://app.yump.ar/sala/${UUID.toUpperCase()}`), `/s/?id=${UUID}`);
  // WhatsApp y los clientes de correo agregan parámetros: sólo se lee el path.
  assert.equal(rutaDeEnlace(`https://app.yump.ar/sala/${UUID}?utm_source=whatsapp`), `/s/?id=${UUID}`);
  assert.equal(rutaDeEnlace(`https://app.yump.ar/sala/${UUID}#x`), `/s/?id=${UUID}`);
});

test("🔴 es lista blanca: un intent puede traer cualquier cosa", () => {
  const rechazados = [
    `http://app.yump.ar/sala/${UUID}`,                 // sin TLS
    `https://app.yump.ar.evil.com/sala/${UUID}`,       // host que lo contiene
    `https://evil.com/sala/${UUID}`,
    `https://sub.app.yump.ar/sala/${UUID}`,            // subdominio
    "https://app.yump.ar/sala/",                       // sin id
    "https://app.yump.ar/sala/no-es-uuid",
    `https://app.yump.ar/sala/${UUID}/extra`,          // segmento de más
    `https://app.yump.ar/titulo/movie/278`,            // otra sección
    `javascript:alert(1)`,
    "no es una url",
    "",
  ];
  for (const u of rechazados) assert.equal(rutaDeEnlace(u), null, u);
});

test("el contenedor atiende los DOS casos: app cerrada y en segundo plano", () => {
  const src = codigo("components/nativo/EnlacesDeSala.tsx");
  // Con la app cerrada el intent llega en el arranque y `appUrlOpen` no se
  // dispara nunca: el listener se registra después. Atender uno solo deja la
  // mitad de los casos sin abrir la sala.
  assert.match(src, /App\.getLaunchUrl\(\)/, "falta el arranque en frío");
  assert.match(src, /addListener\("appUrlOpen"/, "falta la app en segundo plano");
  assert.match(src, /router\.replace\(ruta\)/, "con push, Atrás volvería a una pantalla que nadie pidió");
  assert.match(src, /if \(!ES_NATIVO\) return;/, "el plugin no debe entrar al bundle web");
  assert.match(leer("app/layout.tsx"), /<EnlacesDeSala \/>/, "no está montado");
});

test("el intent-filter está ACOTADO a las salas y pide verificación", () => {
  const manifest = leer("android/app/src/main/AndroidManifest.xml");
  assert.match(manifest, /<intent-filter android:autoVerify="true">/);
  assert.match(manifest, /android:scheme="https"/);
  assert.match(manifest, /android:host="app\.yump\.ar"/);
  // Con pathPrefix el resto del sitio sigue abriendo en el navegador. Verificar
  // el dominio entero le sacaría a Chrome toda la navegación de app.yump.ar.
  assert.match(manifest, /android:pathPrefix="\/sala\/"/);
  assert.doesNotMatch(manifest, /android:pathPattern/, "no hace falta y es más fácil de equivocar");
  // singleTask evita que el enlace abra una instancia nueva encima de la viva.
  assert.match(manifest, /android:launchMode="singleTask"/);
});

test("el identificador del paquete es el mismo en las tres declaraciones", () => {
  const ID = "ar.yump.app";
  assert.match(leer("capacitor.config.ts"), new RegExp(`appId: '${ID}'`));
  assert.match(leer("android/app/build.gradle"), new RegExp(`applicationId "${ID}"`));
  assert.match(leer("android/app/build.gradle"), new RegExp(`namespace = "${ID}"`));
  // El mismo id es el de la ficha de Play a la que apunta la invitación.
  assert.match(leer("lib/sala/invitacion-instalar.ts"), new RegExp(`details\\?id=${ID.replace(/\./g, "\\.")}`));
});

test("la entrada a Yumpeá ya NO se oculta en Android", () => {
  const entrada = codigo("lib/sala/entrada.ts");
  assert.doesNotMatch(entrada, /ES_NATIVO/, "la entrada ya no depende del contenedor");
  assert.match(entrada, /process\.env\.NEXT_PUBLIC_SALAS_ACTIVAS !== "0"/, "el kill switch sigue");
});

test("⏳ assetlinks.json: si algún día aparece, no puede llevar el marcador de plantilla", () => {
  // Hoy NO existe a propósito: falta la huella SHA-256 de Play App Signing y el
  // dueño pidió no desplegarlo todavía. Publicarlo con una huella equivocada es
  // PEOR que no publicarlo, porque Android cachea el resultado de la
  // verificación. Este test no exige que exista; exige que, cuando exista, sea
  // de verdad. Ver docs/ANDROID-APP-LINKS.md.
  const ruta = join(process.cwd(), "public/.well-known/assetlinks.json");
  if (!existsSync(ruta)) return;
  const j = JSON.parse(readFileSync(ruta, "utf8"));
  assert.ok(Array.isArray(j) && j.length >= 1);
  const t = j[0].target;
  assert.equal(t.namespace, "android_app");
  assert.equal(t.package_name, "ar.yump.app");
  for (const h of t.sha256_cert_fingerprints) {
    assert.doesNotMatch(h, /AQUI_VA|PLACEHOLDER|XX:XX/i, "quedó el marcador de la plantilla");
    assert.match(h, /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/, `huella con forma inválida: ${h}`);
  }
});

test("🔴 el kill switch de la WEB no viaja al paquete: NEXT_PUBLIC_SALAS_ACTIVAS no está en la allowlist", () => {
  // Es la propiedad que permite deployar la web con la entrada OCULTA
  // (`NEXT_PUBLIC_SALAS_ACTIVAS=0` en Vercel) mientras la app de la prueba
  // cerrada SÍ la muestra: `entornoDelBuild` arma el entorno desde cero, sin
  // heredar `process.env`, y sólo pasa lo que está en las dos allowlists. La
  // variable llega `undefined` al bundle nativo, y `undefined !== "0"`.
  assert.deepEqual(APP_DESDE_ENV, [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SITE_URL",
  ]);
  assert.deepEqual(APP_DEL_SCRIPT, ["CAPACITOR", "NEXT_PUBLIC_YUMP_NATIVO", "NEXT_PUBLIC_YUMP_API_BASE"]);
  for (const v of ["NEXT_PUBLIC_SALAS_ACTIVAS", "NEXT_PUBLIC_YUMP_PLAY_PUBLICA", "SALAS_ACTIVAS"]) {
    assert.ok(!APP_DESDE_ENV.includes(v) && !APP_DEL_SCRIPT.includes(v), v);
  }
  // Y el entorno se construye de cero: si heredara process.env, la variable de
  // la máquina que compila se colaría en el artefacto de Play.
  const script = readFileSync(join(process.cwd(), "scripts/build-capacitor.mjs"), "utf8");
  assert.match(script, /NO se hereda `process\.env`/);
});

test("el guard de la release sigue exigiendo la base de Producción exacta", () => {
  // Apuntar el AAB a otro servidor "para probar" es justo el error que este
  // guard existe para impedir: una Preview responde 302 al SSO de Vercel y la
  // app lo muestra como "sin conexión", recién en el teléfono de un tester.
  assert.equal(motivoParaNoConstruirRelease("https://app.yump.ar", true), null);
  for (const base of ["https://app.yump.ar/", "https://yump.ar", "https://x.vercel.app", "http://app.yump.ar"]) {
    assert.match(String(motivoParaNoConstruirRelease(base, true)), /sólo puede apuntar a https:\/\/app\.yump\.ar/);
  }
  // Sin --release se puede usar cualquier base: eso no cambió.
  assert.equal(motivoParaNoConstruirRelease("https://ejemplo.invalid", false), null);
});
