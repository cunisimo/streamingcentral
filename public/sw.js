/* Service Worker — entry point.
 * StreamingCentral PWA. Ver docs/PWA.md
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
/* global self, caches, importScripts, Request */

// Revisioning del fallback offline. El `?v=` lo estampa scripts/stamp-sw.mjs con
// el hash de public/offline.html en cada build (npm run build → prebuild).
//
// Vive ACÁ y no en sw/config.js a propósito: el update del SW compara byte a
// byte el script principal. La comparación de los scripts de importScripts no es
// consistente entre motores, así que estampar acá garantiza que un cambio de
// offline.html dispare la reinstalación.
self.SC_OFFLINE_URL = "/offline.html?v=bed1ff07da";

importScripts(
  "/sw/config.js",
  "/sw/strategies.js",
  "/sw/routes.js",
  "/sw/push.js",        // reservado (listeners comentados)
  "/sw/sync.js",        // reservado
  "/sw/share-target.js" // reservado
);

(function () {
  const { VALID_CACHES, CACHE, OFFLINE_URL, PRECACHE_OPTIONAL } = self.SC_CONFIG;

  // Install. Dos niveles, y la distinción importa:
  //
  //   CRÍTICO  → cache.add SIN catch. Si /offline.html no se puede traer, la
  //              promesa rechaza, waitUntil falla y el SW NO se activa. Es lo
  //              correcto: un SW activo que no tiene el fallback anuncia soporte
  //              offline que no puede cumplir, y queda así hasta el próximo
  //              deploy. Mejor no activar y que la app funcione sin SW.
  //   OPCIONAL → allSettled. Un ícono que falla no debe impedir la activación.
  //
  // cache: "reload" fuerza copia fresca de red, ignorando el HTTP cache.
  self.addEventListener("install", (event) => {
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE.static);
      await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
      await Promise.allSettled(
        PRECACHE_OPTIONAL.map((url) => cache.add(new Request(url, { cache: "reload" })))
      );
      await self.skipWaiting();
    })());
  });

  // Activate: borrar caches de versiones anteriores, limpiar fallbacks offline
  // de revisiones viejas, y tomar control de las páginas.
  self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !VALID_CACHES.includes(k)).map((k) => caches.delete(k))
      );
      // El nombre del cache no cambia cuando solo cambia el hash de offline.html,
      // así que las revisiones viejas quedarían acumulándose acá.
      const cache = await caches.open(CACHE.static);
      const current = new URL(OFFLINE_URL, self.location.origin).href;
      for (const req of await cache.keys()) {
        if (req.url.includes("/offline.html") && req.url !== current) {
          await cache.delete(req);
        }
      }
      await self.clients.claim();
    })());
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
