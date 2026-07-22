/* Service Worker — configuración central.
 * Ver docs/superpowers/specs/2026-07-21-pwa-design.md §3.4
 *
 * ⚠️ CACHE_VERSION NO se define acá: viene de self.SC_CACHE_VERSION, declarada en
 * public/sw.js. Motivo: el navegador detecta un SW nuevo comparando los bytes del
 * script principal; cambiar un archivo de importScripts no dispara la
 * actualización de forma confiable. Si la versión viviera acá, subirla no
 * actualizaría nada. Ver el comentario en sw.js.
 *
 * activate borra todo cache cuyo nombre no coincida con la versión actual, así
 * que un bump limpio evita servir shells o assets viejos tras un deploy.
 *
 * IIFE obligatorio: importScripts comparte un único scope global entre todos los
 * módulos, así que un `const` en el top level colisionaría con el de otro módulo.
 * El IIFE aísla los locales; solo se expone self.SC_CONFIG.
 */
/* global self */

(function () {
  // Declarada en sw.js (script principal) para que un bump dispare el byte-diff.
  const CACHE_VERSION = self.SC_CACHE_VERSION || "v0";

  const CACHE = {
    static: `sc-static-${CACHE_VERSION}`, // /_next/static/* y assets propios
    pages: `sc-pages-${CACHE_VERSION}`,   // documentos HTML (Network First)
    images: `sc-images-${CACHE_VERSION}`, // pósters/backdrops de TMDB (Cache First)
  };

  self.SC_CONFIG = {
    CACHE_VERSION,
    CACHE,
    // Todos los nombres válidos de esta versión. Lo demás se borra en activate.
    VALID_CACHES: Object.values(CACHE),
    // Precache dividido en dos niveles (ver el handler de install en sw.js):
    //
    //   OFFLINE_URL      → CRÍTICO. Si no se puede cachear, install debe FALLAR.
    //                      La URL viene versionada por hash desde sw.js
    //                      (self.SC_OFFLINE_URL, estampada por scripts/stamp-sw.mjs).
    //   PRECACHE_OPTIONAL → best-effort. Un fallo acá no impide la activación.
    //
    // /offline.html es HTML estático a propósito: servir una ruta de Next bajo
    // otra URL rompe la hidratación (client-side exception). Ver public/offline.html.
    OFFLINE_URL: self.SC_OFFLINE_URL || "/offline.html",
    PRECACHE_OPTIONAL: ["/icons/icon-192.png"],
    // Carrera de networkFirst contra reloj, para documentos. En lie-fi el fetch
    // no rechaza: queda colgado. Sin esto el usuario ve pantalla en blanco
    // indefinidamente en vez del cache o del fallback offline.
    NETWORK_TIMEOUT_MS: 4000,
    // Cache de imágenes: LRU por cantidad + expiración.
    IMAGE_LIMIT: 300,
    IMAGE_MAX_AGE: 30 * 24 * 60 * 60 * 1000, // 30 días
    // Hosts de imágenes que sí cacheamos (URLs inmutables de TMDB).
    IMAGE_HOSTS: ["image.tmdb.org"],
  };
})();
