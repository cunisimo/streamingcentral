/* Service Worker — configuración central.
 * Ver docs/superpowers/specs/2026-07-21-pwa-design.md §3.4
 *
 * ⚠️ SUBIR CACHE_VERSION en cada cambio del SW o de las estrategias.
 * activate borra todo cache cuyo nombre no coincida con la versión actual, así
 * que un bump limpio evita servir shells o assets viejos tras un deploy.
 *
 * IIFE obligatorio: importScripts comparte un único scope global entre todos los
 * módulos, así que un `const` en el top level colisionaría con el de otro módulo.
 * El IIFE aísla los locales; solo se expone self.SC_CONFIG.
 */
/* global self */

(function () {
  const CACHE_VERSION = "v1";

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
    // Se precachea en install. Mínimo: la página offline y su ícono. El resto se
    // puebla solo en runtime (los assets de Next tienen hash de contenido).
    PRECACHE: ["/offline", "/icons/icon-192.png"],
    // Cache de imágenes: LRU por cantidad + expiración.
    IMAGE_LIMIT: 300,
    IMAGE_MAX_AGE: 30 * 24 * 60 * 60 * 1000, // 30 días
    // Hosts de imágenes que sí cacheamos (URLs inmutables de TMDB).
    IMAGE_HOSTS: ["image.tmdb.org"],
  };
})();
