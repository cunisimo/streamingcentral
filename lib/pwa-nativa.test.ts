// CP6 — la PWA no se monta dentro del contenedor nativo.
//
// Por qué este archivo prueba en CUATRO niveles distintos:
//
//   1. DECISIÓN pura (`pwa-nativa.ts`), en proceso y en los dos sentidos.
//   2. La bandera REAL, en procesos hijos con y sin `NEXT_PUBLIC_YUMP_NATIVO`.
//      Es el mismo patrón de `plataforma.test.ts` y `api-base.test.ts`: la
//      constante se resuelve al evaluar el módulo, así que un solo proceso no
//      puede ver los dos caminos.
//   3. ESTRUCTURA: que cada pieza consulte la decisión. Con canarios, porque un
//      test estructural sin canarios sólo prueba que el grep anda.
//   4. ARTEFACTO: el HTML y los archivos realmente exportados.
//
// ⚠️ El nivel 4 es el único que prueba el RESULTADO. Los otros tres prueban el
// mecanismo. Se necesitan los cuatro: el 4 no corre en un checkout limpio (no
// hay `out-capacitor/`) y los 1-3 no ven lo que Next termina emitiendo.
//
// 🔴 LO QUE ESTE ARCHIVO NO PUEDE PROBAR CON UN GREP: que las cadenas de la UI
// de instalación NO estén en el bundle nativo. El guard es una constante
// importada de OTRO módulo, así que el minificador no puede eliminar la rama
// muerta y los textos siguen en el `.js` aunque nunca se rendericen. Buscarlos y
// no encontrarlos sería suerte; encontrarlos NO sería un fallo. Por eso lo que
// se verifica es el comportamiento y el HTML emitido, no la ausencia del texto.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { metadataPwa, pwaActiva } from "./pwa-nativa.ts";

const raiz = path.resolve(import.meta.dirname, "..");
const leer = (p: string) => fs.readFileSync(path.join(raiz, p), "utf8");
const existe = (p: string) => fs.existsSync(path.join(raiz, p));

/**
 * El código sin comentarios.
 *
 * Hace falta porque varios de estos archivos EXPLICAN en prosa por qué no usan
 * `Capacitor.isNativePlatform()`, y un test que buscara esa cadena sobre el
 * archivo entero marcaría como infracción justamente al comentario que
 * documenta la decisión contraria.
 */
function codigo(rel: string): string {
  return leer(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ 	]*\/\/.*$/gm, "");
}

// ============================================================================
// 1. La decisión, pura
// ============================================================================

test("web: la PWA está activa", () => {
  assert.equal(pwaActiva(false), true);
});

test("contenedor: la PWA NO está activa", () => {
  assert.equal(pwaActiva(true), false);
});

test("web: la metadata trae manifest y appleWebApp", () => {
  const m = metadataPwa(false);
  assert.equal(m.manifest, "/manifest.webmanifest");
  assert.equal(m.appleWebApp?.capable, true);
  assert.equal(m.appleWebApp?.statusBarStyle, "black-translucent");
});

test("contenedor: la metadata no trae NINGUNA de las dos claves", () => {
  const m = metadataPwa(true);
  assert.deepEqual(Object.keys(m), []);
  // No alcanza con que sean undefined: una clave presente con valor undefined
  // también podría emitir el link. Se exige que la clave no exista.
  assert.equal("manifest" in m, false);
  assert.equal("appleWebApp" in m, false);
});

// ============================================================================
// 2. La bandera real, en procesos hijos
// ============================================================================

function enProceso(env: Record<string, string>): { activa: boolean; claves: string[] } {
  const codigo = [
    'const m = await import("./lib/pwa-nativa.ts");',
    "process.stdout.write(JSON.stringify({",
    "  activa: m.pwaActiva(),",
    "  claves: Object.keys(m.metadataPwa()).sort(),",
    "}));",
  ].join("\n");
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", codigo], {
    cwd: raiz,
    encoding: "utf8",
    env: { ...process.env, NEXT_PUBLIC_YUMP_NATIVO: "", ...env },
  });
  assert.equal(r.status, 0, "el hijo falló:\n" + r.stderr);
  return JSON.parse(r.stdout);
}

test("proceso SIN la bandera: es web, con metadata de PWA", () => {
  const r = enProceso({});
  assert.equal(r.activa, true);
  assert.deepEqual(r.claves, ["appleWebApp", "manifest"]);
});

test("proceso CON la bandera: es contenedor, sin metadata de PWA", () => {
  const r = enProceso({ NEXT_PUBLIC_YUMP_NATIVO: "1" });
  assert.equal(r.activa, false);
  assert.deepEqual(r.claves, []);
});

test("una ejecución no contamina a la otra, en los DOS órdenes", () => {
  assert.equal(enProceso({ NEXT_PUBLIC_YUMP_NATIVO: "1" }).activa, false);
  assert.equal(enProceso({}).activa, true);
  assert.equal(enProceso({}).activa, true);
  assert.equal(enProceso({ NEXT_PUBLIC_YUMP_NATIVO: "1" }).activa, false);
});

// ============================================================================
// 3. Estructura: cada pieza consulta la decisión
// ============================================================================

/** Las piezas que TIENEN que apagarse solas, sin depender de quién las monte. */
const APAGADAS = [
  "components/pwa/ServiceWorkerRegister.tsx",
  "components/pwa/UpdateToast.tsx",
  "components/pwa/InstallPrompt.tsx",
  "components/pwa/InstallRow.tsx",
];

/**
 * Las que NO llevan guard, cada una con su motivo. Una exclusión sin motivo
 * registrado es un olvido disfrazado de decisión.
 */
const SIN_GUARD: Record<string, string> = {
  "components/pwa/OfflineState.tsx":
    "no es PWA: es el estado sin conexión de 9 vistas y lo necesita CP8 #13",
  "components/pwa/StandaloneWelcome.tsx":
    "se conserva a propósito: su texto sirve al primer arranque nativo con almacenamiento nuevo",
  "components/pwa/AppleSplashLinks.tsx":
    "archivo GENERADO por scripts/generate-pwa-assets.mjs: el guard va en el punto de montaje, el layout",
};

test("las cuatro piezas apagables consultan pwaActiva", () => {
  for (const f of APAGADAS) {
    const src = leer(f);
    assert.match(src, /pwaActiva/, f + " no consulta pwaActiva");
    assert.match(src, /pwa-nativa/, f + " no importa el módulo de la decisión");
  }
});

test("las piezas sin guard tienen su motivo registrado, y no lo llevan", () => {
  for (const [f, motivo] of Object.entries(SIN_GUARD)) {
    assert.ok(motivo.length > 30, f + ": el motivo no explica nada");
    assert.doesNotMatch(leer(f), /pwaActiva/, f + " NO debería llevar guard");
  }
});

test("el inventario cubre los 8 archivos de components/pwa, sin sobras ni faltantes", () => {
  const enDisco = fs
    .readdirSync(path.join(raiz, "components/pwa"))
    .filter((f) => f.endsWith(".tsx"))
    .sort();
  const clasificados = [
    ...APAGADAS.map((f) => path.basename(f)),
    ...Object.keys(SIN_GUARD).map((f) => path.basename(f)),
    "PwaClient.tsx", // orquestador: tiene su propio test
  ].sort();
  assert.deepEqual(enDisco, clasificados);
  assert.equal(enDisco.length, 8);
});

test("PwaClient se conserva como orquestador y deja viva la bienvenida", () => {
  const src = leer("components/pwa/PwaClient.tsx");
  assert.match(src, /pwaActiva/, "PwaClient no consulta la decisión");
  assert.match(src, /StandaloneWelcome/, "PwaClient dejó de montar la bienvenida");
});

test("el layout omite la metadata de PWA y no monta los splash de Apple", () => {
  const src = leer("app/layout.tsx");
  assert.match(src, /metadataPwa\(\)/, "el layout no usa metadataPwa()");
  assert.doesNotMatch(src, /manifest:\s*"\/manifest\.webmanifest"/, "el manifest sigue fijo en el layout");
  assert.doesNotMatch(src, /appleWebApp:\s*\{/, "appleWebApp sigue fijo en el layout");
  assert.match(src, /pwaActiva\(\)\s*&&\s*<AppleSplashLinks/, "AppleSplashLinks no está guardado");
});

test("el layout conserva lo que NO es PWA", () => {
  const src = leer("app/layout.tsx");
  assert.match(src, /viewportFit:\s*"cover"/, "se perdió viewportFit");
  assert.match(src, /interactiveWidget:\s*"resizes-content"/, "se perdió interactiveWidget");
  assert.match(src, /formatDetection:/, "se perdió formatDetection");
  assert.match(src, /applicationName:\s*"Yump"/, "se perdió applicationName");
  // El color de la barra era `themeColor:` en el viewport y ahora NO está ahí a
  // propósito: React duplicaba la meta al hidratar si el script de arranque le
  // cambiaba el `content`, y la copia quedaba casi blanca sobre la app oscura.
  // Ahora la crea el script. El contrato que este test cuida no cambió —la
  // cirugía nativa toca `manifest` y `appleWebApp` y NADA más—, así que el
  // testigo pasa a ser el script, que es donde vive el color hoy.
  assert.match(src, /THEME_INIT_SCRIPT/, "se perdió el script de arranque del tema");
  assert.match(src, /COLOR_FONDO/, "el script dejó de leer la fuente única de color");
  assert.doesNotMatch(src, /themeColor:/,
    "volvió `themeColor` al viewport: React vuelve a duplicar la meta al hidratar");
});

test("OfflineState sigue intacto y con sus 9 llamadores", () => {
  const src = leer("components/pwa/OfflineState.tsx");
  assert.doesNotMatch(src, /pwaActiva|ES_NATIVO/, "OfflineState fue tocado: rompe CP8 #13");
  const vistas = [
    "components/CatalogView.tsx",
    "components/CategoryView.tsx",
    "components/DetailView.tsx",
    "components/ListaView.tsx",
    "components/MiniseriesView.tsx",
    "components/PersonView.tsx",
    "components/TopView.tsx",
    "components/UltimosView.tsx",
    "components/upcoming/UpcomingAllView.tsx",
  ];
  for (const v of vistas) assert.match(leer(v), /OfflineState/, v + " perdió OfflineState");
});

test("no se agregó ninguna dependencia ni detección dinámica de Capacitor", () => {
  const pkg = JSON.parse(leer("package.json"));
  const todas = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const nombre of Object.keys(todas)) {
    assert.doesNotMatch(nombre, /^@capacitor\//, "entró una dependencia de Capacitor: " + nombre);
  }
  const tocados = [...APAGADAS, "components/pwa/PwaClient.tsx", "app/layout.tsx", "lib/pwa-nativa.ts"];
  for (const f of tocados) {
    assert.doesNotMatch(codigo(f), /@capacitor\/core|isNativePlatform/, f + " usa detección dinámica");
  }
});

// --- canarios: el análisis estructural detecta de verdad ---

test("CANARIO: se detecta una pieza que perdió el guard", () => {
  const fingido = '"use client";\nexport default function X() { return null; }';
  assert.doesNotMatch(fingido, /pwaActiva/);
});

test("CANARIO: se detecta un layout que volvió a fijar el manifest", () => {
  const fingido = 'export const metadata = { manifest: "/manifest.webmanifest" };';
  assert.match(fingido, /manifest:\s*"\/manifest\.webmanifest"/);
});

test("CANARIO: se detecta detección dinámica de Capacitor", () => {
  const fingido = 'import { Capacitor } from "@capacitor/core";\nCapacitor.isNativePlatform();';
  assert.match(fingido, /@capacitor\/core|isNativePlatform/);
});

test("CANARIO: el filtro de comentarios no tapa código real", () => {
  // Un comentario que menciona la detección dinámica NO es una infracción...
  assert.doesNotMatch(codigo("lib/pwa-nativa.ts"), /isNativePlatform/);
  // ...pero el archivo SÍ la menciona en prosa, o este canario no probaría nada.
  assert.match(leer("lib/pwa-nativa.ts"), /isNativePlatform/);
});

test("CANARIO: se detecta un AppleSplashLinks montado sin guard", () => {
  const fingido = "<head><AppleSplashLinks /></head>";
  assert.doesNotMatch(fingido, /pwaActiva\(\)\s*&&\s*<AppleSplashLinks/);
});

// ============================================================================
// 4. Defensa de build y ARTEFACTO
// ============================================================================

test("el staging excluye el service worker por nombre", async () => {
  const mod = await import("../scripts/build-capacitor.mjs");
  assert.deepEqual([...mod.PUBLIC_FUERA].sort(), ["sw", "sw.js"]);
  // Y el filtro de la copia tiene que usar ESE conjunto, no una lista aparte
  // que pueda divergir en silencio.
  assert.match(leer("scripts/build-capacitor.mjs"), /PUBLIC_FUERA\.has\(/);
});

test("la web NO se tocó: manifest, sw.js y los módulos del SW siguen ahí", () => {
  assert.ok(existe("app/manifest.ts"), "se borró app/manifest.ts");
  assert.ok(existe("public/sw.js"), "se borró public/sw.js");
  assert.ok(existe("public/sw"), "se borró public/sw/");
  assert.match(leer("public/sw.js"), /self\.SC_CACHE_VERSION\s*=/);
});

// El artefacto sólo existe después de `npm run build:capacitor`. En un checkout
// limpio estos tests se saltan en vez de fallar — igual que el barrido de
// DiceBear con `.next`.
const HAY_ARTEFACTO = existe("out-capacitor");
const saltar = {
  skip: HAY_ARTEFACTO ? false : "sin out-capacitor: correr npm run build:capacitor",
};

test("ARTEFACTO: no viaja el service worker ni el manifest", saltar, () => {
  for (const p of ["out-capacitor/sw.js", "out-capacitor/sw", "out-capacitor/manifest.webmanifest"]) {
    assert.equal(existe(p), false, p + " viajó en el artefacto");
  }
});

function archivosDelArtefacto(filtro: RegExp): string[] {
  const out: string[] = [];
  const rec = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) rec(p);
      else if (filtro.test(e.name)) out.push(p);
    }
  };
  rec(path.join(raiz, "out-capacitor"));
  return out;
}

test("ARTEFACTO: ningún HTML trae rel=manifest, splash de Apple ni appleWebApp", saltar, () => {
  const htmls = archivosDelArtefacto(/\.html$/);
  assert.ok(htmls.length >= 30, "esperaba el export completo, hay " + htmls.length + " HTML");
  for (const f of htmls) {
    const h = fs.readFileSync(f, "utf8");
    const rel = path.relative(raiz, f);
    assert.doesNotMatch(h, /rel=["']manifest["']/, rel + ' trae <link rel="manifest">');
    assert.doesNotMatch(h, /apple-touch-startup-image/, rel + " trae splash de Apple");
    assert.doesNotMatch(h, /apple-mobile-web-app-capable/, rel + " trae metadata de appleWebApp");
  }
});

test("ARTEFACTO: lo de Gate A sigue en pie — /t/, /p/ y la base inlineada", saltar, () => {
  assert.ok(existe("out-capacitor/t/index.html"), "se perdió /t/");
  assert.ok(existe("out-capacitor/p/index.html"), "se perdió /p/");
  const js = archivosDelArtefacto(/\.js$/)
    .map((f) => fs.readFileSync(f, "utf8"))
    .join("\n");
  assert.match(js, /let [a-zA-Z$_]+=!0;/, "ES_NATIVO no quedó inlineado como true");
  assert.match(js, /"https:\/\/[a-z0-9.-]+"\.trim\(\)/, "la base HTTPS no quedó inlineada");
});

test("ARTEFACTO: el HTML conserva themeColor, viewport-fit y el resto", saltar, () => {
  const h = fs.readFileSync(path.join(raiz, "out-capacitor/index.html"), "utf8");
  assert.match(h, /name=["']theme-color["']/, "se perdió themeColor");
  assert.match(h, /viewport-fit=cover/, "se perdió viewportFit: cover");
  assert.match(h, /interactive-widget=resizes-content/, "se perdió interactiveWidget");
  assert.match(h, /<title>Yump<\/title>/, "se perdió el título");
});

// El build web prerenderiza HTML en `.next/server/app`. Igual que el artefacto,
// sólo existe después de `npm run build`, así que se salta en un checkout limpio.
//
// 🔴 Este bloque es la MITAD que falta: sin él, todo lo de arriba se cumpliría
// igual si el guard hubiera apagado la PWA en los DOS builds. Lo que prueba es
// que la web NO cambió.
const HTML_WEB = ".next/server/app/index.html";
const saltarWeb = {
  skip: existe(HTML_WEB) ? false : "sin build web: correr npm run build",
};

test("WEB: el HTML sigue trayendo manifest, splash de Apple y appleWebApp", saltarWeb, () => {
  const h = leer(HTML_WEB);
  assert.match(h, /rel="manifest"/, "la web perdió el <link rel=manifest>");
  assert.match(h, /apple-touch-startup-image/, "la web perdió los splash de Apple");
  assert.match(h, /apple-mobile-web-app-capable/, "la web perdió appleWebApp");
  // Los 18 splash del generador tienen que estar TODOS: uno por resolución.
  const splash = h.match(/apple-touch-startup-image/g) ?? [];
  assert.ok(splash.length >= 18, "faltan splash: hay " + splash.length + ", se esperaban 18 o más");
});

test("WEB: sigue conservando lo que no es PWA", saltarWeb, () => {
  const h = leer(HTML_WEB);
  assert.match(h, /name="theme-color"/);
  assert.match(h, /viewport-fit=cover/);
  assert.match(h, /interactive-widget=resizes-content/);
});

test("WEB: el manifest se sigue emitiendo como ruta propia", saltarWeb, () => {
  assert.ok(
    existe(".next/server/app/manifest.webmanifest.body"),
    "la metadata route del manifest dejó de emitirse",
  );
});

test("ARTEFACTO: sin secretos", saltar, () => {
  const prohibidos = ["TMDB_READ_TOKEN", "SUPABASE_SERVICE_ROLE", "CRON_SECRET", "service_role"];
  for (const f of archivosDelArtefacto(/\.(js|html|json|txt|css)$/)) {
    const c = fs.readFileSync(f, "utf8");
    for (const s of prohibidos) {
      assert.equal(c.includes(s), false, path.relative(raiz, f) + " contiene " + s);
    }
  }
});
