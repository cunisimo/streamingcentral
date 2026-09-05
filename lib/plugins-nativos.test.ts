// Los tres plugins de CP9, y por qué está cada uno.
//
// ============================================================================
// LO QUE CP8 MIDIÓ EN UN ANDROID FÍSICO, Y QUE ESTOS PLUGINS VIENEN A ARREGLAR
// ============================================================================
//   1. El botón Atrás salía al LAUNCHER en vez de volver, incluso con historial
//      interno (`history.length: 2`, Home → /top/).
//   2. Los iconos de la barra de estado eran blancos SIEMPRE. En tema oscuro se
//      leían; en claro quedaban casi invisibles sobre `#FAFAFD`.
//   3. `navigator.share` NO existe en esta WebView, así que Compartir caía a
//      `wa.me` por `window.open`: el usuario iba directo a WhatsApp sin poder
//      elegir a dónde.
//
// Ninguno de los tres se arregla desde la web, y por eso son plugins. Este test
// vigila que sigan siendo TRES y que no se cuele un cuarto.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { estiloDeBarra } from "./barra-estado.ts";

const leer = (rel: string) => readFileSync(new URL("../" + rel, import.meta.url), "utf8");
const codigo = (rel: string) =>
  leer(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

// --------------------------------------------------------------- inventario

const AUTORIZADOS = [
  "@capacitor/core",
  "@capacitor/android",
  "@capacitor/cli",
  "@capacitor/app",
  "@capacitor/status-bar",
  "@capacitor/share",
];

test("los plugins son exactamente los tres que CP8 justificó", () => {
  const pkg = JSON.parse(leer("package.json"));
  const todos = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]
    .filter((n) => n.startsWith("@capacitor/"));
  for (const n of todos) {
    assert.ok(AUTORIZADOS.includes(n), `paquete de Capacitor NO autorizado: ${n}`);
  }
  // Y los tres nuevos van en `dependencies`: son de runtime, no de build.
  for (const n of ["@capacitor/app", "@capacitor/status-bar", "@capacitor/share"]) {
    assert.ok(pkg.dependencies?.[n], `${n} tiene que estar en dependencies`);
    assert.ok(!pkg.devDependencies?.[n], `${n} no va en devDependencies`);
  }
});

// ------------------------------------------------------------- barra de estado

test("🔴 el estilo de barra NO se invierte: oscuro→DARK, claro→LIGHT", () => {
  // En `@capacitor/status-bar`, `Style` describe el TEXTO, no el fondo:
  //     Dark  = "Light text for dark backgrounds"
  //     Light = "Dark text for light backgrounds"
  // Invertirlo reproduce exactamente el bug que CP8 midió.
  assert.equal(estiloDeBarra("dark"), "DARK");
  assert.equal(estiloDeBarra("light"), "LIGHT");
});

test("la barra sólo toca setStyle, para no romper el edge-to-edge", () => {
  const src = codigo("lib/barra-estado.ts");
  assert.match(src, /setStyle/);
  assert.doesNotMatch(src, /setBackgroundColor/,
    "setBackgroundColor obliga a setOverlaysWebView(false) y mata el edge-to-edge");
  assert.doesNotMatch(src, /setOverlaysWebView/,
    "no está disponible en Android 15+, y el aparato corre Android 16");
});

test("el plugin de la barra no entra en el bundle web", () => {
  const src = codigo("lib/barra-estado.ts");
  assert.match(src, /if \(!ES_NATIVO\) return/, "no cortocircuita en web");
  assert.match(src, /await import\("@capacitor\/status-bar"\)/,
    "el import tiene que ser dinámico: estático arrastra el plugin al bundle web");
});

test("el tema y la barra se aplican en el mismo lugar", () => {
  // Si el cambio de tema y el de la barra vivieran separados, se desincronizan.
  const src = codigo("components/ThemeContext.tsx");
  assert.match(src, /aplicarBarraDeEstado/, "applyTheme no toca la barra de estado");
});

// -------------------------------------------------------------- botón Atrás

test("el botón Atrás vuelve si hay historial, y sólo sale en la raíz", () => {
  const src = codigo("components/nativo/AtrasNativo.tsx");
  assert.match(src, /backButton/, "no escucha el botón Atrás");
  assert.match(src, /history\.back\(\)/, "no vuelve atrás");
  assert.match(src, /exitApp/, "no declara qué hace en la raíz");
});

test("🔴 no se decide SÓLO por canGoBack: no ve las navegaciones SPA", () => {
  // `canGoBack` sale de `WebView.canGoBack()`, que mira el historial de
  // DOCUMENTOS. El router de Next navega con `pushState`, así que desde una
  // ficha reporta `false` igual — medido en el teléfono, con `history.length: 2`.
  // Confiar sólo en él reproduce el bug de CP8 por otra causa.
  const src = codigo("components/nativo/AtrasNativo.tsx");
  assert.match(src, /canGoBack \|\| window\.location\.pathname !== "\/"/,
    "falta la segunda señal: la ruta");
});

test("el listener de Atrás se limpia y no se duplica", () => {
  const src = codigo("components/nativo/AtrasNativo.tsx");
  assert.match(src, /useEffect/, "tiene que registrarse en un efecto");
  assert.match(src, /remove\(\)/, "el listener no se remueve: queda duplicado al remontar");
  assert.match(src, /\[\]\)/, "el efecto tiene que correr una sola vez");
});

test("Atrás no cambia nada en la web", () => {
  const src = codigo("components/nativo/AtrasNativo.tsx");
  assert.match(src, /ES_NATIVO/, "no consulta la bandera de build");
  assert.match(src, /await import\("@capacitor\/app"\)/, "el import tiene que ser dinámico");
});

// ---------------------------------------------------------------- compartir

test("compartir usa el selector nativo y NO duplica la lógica de la URL", () => {
  const src = codigo("components/DetailView.tsx");
  assert.match(src, /mensajeCompartir/, "dejó de usar el armador canónico");
  assert.match(src, /await import\("@capacitor\/share"\)/, "el import tiene que ser dinámico");
  // 🔴 Nada de armar la URL por otro lado: se reusa `m.url`, que sale de
  // `lib/compartir.ts` y por eso siempre es `https://app.yump.ar/titulo/...`.
  assert.doesNotMatch(src, /app\.yump\.ar/,
    "hay una URL escrita a mano: la canónica sale de lib/compartir.ts");
  assert.doesNotMatch(src, /location\.origin/,
    "usar el origen del contenedor compartiría https://localhost");
});

test("lib/compartir.ts no se tocó, y sigue dando el dominio público", () => {
  const src = leer("lib/compartir.ts");
  assert.match(src, /export const SITIO_PUBLICO = "https:\/\/app\.yump\.ar"/);
  assert.doesNotMatch(src, /@capacitor/, "el armador de mensajes no conoce plugins");
  assert.doesNotMatch(src, /ES_NATIVO/, "ni la plataforma");
});

// ------------------------------------------------------- la regla que no cambia

test("ningún plugin trajo detección dinámica de plataforma", () => {
  // Sigue siendo una bandera de BUILD. `Capacitor.isNativePlatform()` daría
  // `false` en el prerender y `true` después de hidratar. Ver lib/plataforma.ts.
  for (const f of [
    "lib/barra-estado.ts",
    "components/nativo/AtrasNativo.tsx",
    "components/DetailView.tsx",
    "components/ThemeContext.tsx",
  ]) {
    assert.doesNotMatch(codigo(f), /isNativePlatform|getPlatform\(\)/, `${f} usa detección dinámica`);
  }
});
