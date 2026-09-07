// Los dos caminos de `next.config.mjs`: el build web de siempre y el build para
// el contenedor Capacitor.
//
// ⚠️ CADA CAMINO SE CARGA EN UN PROCESO PROPIO, y no es un capricho: `import`
// cachea el módulo, así que un solo proceso no puede evaluar el config con la
// variable puesta y sin ella. Con un único proceso, el segundo test leería el
// resultado del primero y pasaría por el motivo equivocado.
//
// Este archivo NO lo levanta `npm test` (su glob es {lib,components,hooks}).
// Se corre aparte: `node --test scripts/config.test.mjs`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

/** Carga next.config.mjs en un proceso LIMPIO, con o sin CAPACITOR. */
function cargarConfig(capacitor) {
  const code =
    "import c from './next.config.mjs';" +
    "console.log(JSON.stringify({" +
    "output:c.output," +
    "tieneHeaders:typeof c.headers==='function'," +
    "distDir:c.distDir," +
    "pageExtensions:c.pageExtensions," +
    "trailingSlash:c.trailingSlash," +
    "unoptimized:c.images?.unoptimized," +
    "remotePatterns:!!c.images?.remotePatterns" +
    "}));";
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
    encoding: "utf8",
    shell: false,
    env: capacitor
      ? { ...process.env, CAPACITOR: "1" }
      : { ...process.env, CAPACITOR: "" },
  });
  assert.equal(r.status, 0, `el config no cargó:\n${r.stderr}`);
  return JSON.parse(r.stdout);
}

test("build WEB: sin output, con headers y con la optimización de imágenes actual", () => {
  const c = cargarConfig(false);
  assert.equal(c.output, undefined, "el build web no puede exportar");
  assert.equal(c.tieneHeaders, true, "headers() es lo que hace cacheable al service worker");
  assert.equal(c.remotePatterns, true, "la web conserva remotePatterns de TMDB");
  assert.equal(c.unoptimized, undefined, "la web no desactiva el optimizador");
});

test("build CAPACITOR: export, sin headers y sin optimizador", () => {
  const c = cargarConfig(true);
  assert.equal(c.output, "export");
  // distDir sale de CAPACITOR_DIST, con "out" por defecto: el diagnóstico de CP1
  // lo apunta a .capacitor-diagnostico para no dejar un `out/` ambiguo.
  assert.equal(c.distDir, "out");
  // El default de Next menos "ts". NO ["tsx"]: eso rompe los internos .js de
  // Next (ver el comentario de next.config.mjs).
  assert.deepEqual(c.pageExtensions, ["tsx", "jsx", "js"]);
  assert.ok(!c.pageExtensions.includes("ts"), "debe excluir .ts para dejar afuera route.ts");
  assert.equal(c.trailingSlash, true, "emite /ruta/index.html, no /ruta.html");
  assert.equal(c.unoptimized, true);
  assert.equal(c.tieneHeaders, false, "headers() es incompatible con output:'export'");
});

test("CAPACITOR_DIST redirige la salida del export", () => {
  const code =
    "import c from './next.config.mjs';console.log(c.distDir);";
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
    encoding: "utf8",
    shell: false,
    env: { ...process.env, CAPACITOR: "1", CAPACITOR_DIST: ".capacitor-diagnostico" },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), ".capacitor-diagnostico");
});
