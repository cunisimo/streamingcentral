/* Service Worker — entry point.
 * StreamingCentral PWA. Ver docs/superpowers/specs/2026-07-21-pwa-design.md §3.4
 *
 * SW propio, sin librerías. Modularizado con importScripts (no ES modules: los
 * SW type:"module" no corren en Firefox y llegaron tarde a Safari).
 *
 * ⚠️ Al cambiar cualquier archivo del SW, subir CACHE_VERSION en sw/config.js.
 *
 * IIFE: importScripts comparte un único scope global entre todos los módulos.
 * Envolver también este archivo evita que sus locales colisionen con los de los
 * módulos importados.
 */
/* global self, caches, importScripts */

importScripts(
  "/sw/config.js",
  "/sw/strategies.js",
  "/sw/routes.js",
  "/sw/push.js",        // reservado (listeners comentados)
  "/sw/sync.js",        // reservado
  "/sw/share-target.js" // reservado
);

(function () {
  const { VALID_CACHES, CACHE, PRECACHE } = self.SC_CONFIG;

  // Install: precache mínimo + activar de inmediato (no esperar a que se cierren
  // las pestañas). El riesgo de JS viejo + HTML nuevo se cubre con el UpdateToast.
  self.addEventListener("install", (event) => {
    event.waitUntil(
      caches.open(CACHE.static).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
    );
  });

  // Activate: borrar caches de versiones anteriores y tomar control de las páginas.
  self.addEventListener("activate", (event) => {
    event.waitUntil(
      caches.keys()
        .then((keys) => Promise.all(keys.filter((k) => !VALID_CACHES.includes(k)).map((k) => caches.delete(k))))
        .then(() => self.clients.claim())
    );
  });

  // Fetch: delegar en el router. Si devuelve null, no interceptamos (red directa).
  self.addEventListener("fetch", (event) => {
    const handled = self.SC_ROUTE(event.request);
    if (handled) event.respondWith(handled);
  });

  // Permite que la app fuerce la activación del SW nuevo desde el UpdateToast.
  self.addEventListener("message", (event) => {
    if (event.data === "SKIP_WAITING") self.skipWaiting();
  });
})();
