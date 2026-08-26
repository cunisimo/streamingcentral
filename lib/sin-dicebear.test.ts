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
import { RAICES_FUENTE, barrer } from "../scripts/barrido-dicebear.mjs";

test("cero rastros de DiceBear en código ejecutable y archivos públicos", () => {
  const hallazgos = barrer(RAICES_FUENTE);
  const detalle = hallazgos.map((h) => `${h.archivo}:${h.linea}  ${h.texto}`).join("\n");
  assert.deepEqual(hallazgos, [], `quedaron rastros de DiceBear:\n${detalle}`);
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
