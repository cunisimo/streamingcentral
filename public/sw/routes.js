/* Service Worker — router: decide qué estrategia aplica a cada request.
 * Ver docs/superpowers/specs/2026-07-21-pwa-design.md §3.4
 *
 * Regla de oro: interceptar SOLO lo declarado. Todo lo no contemplado se deja
 * pasar a la red sin tocar (return null). Y solo GET: las escrituras nunca se
 * interceptan.
 *
 * IIFE obligatorio (ver nota en config.js). Solo se expone self.SC_ROUTE.
 */
/* global self, URL */

(function () {
  const { CACHE, IMAGE_HOSTS } = self.SC_CONFIG;
  const { cacheFirst, networkFirst, networkOnly, cacheFirstImage } = self.SC_STRATEGIES;

  // Devuelve una Promise<Response> según el request, o null si no hay que
  // interceptar (la red se encarga).
  function route(request) {
    if (request.method !== "GET") return null;

    const url = new URL(request.url);
    const sameOrigin = url.origin === self.location.origin;

    // 1. Imágenes de TMDB → Cache First con expiración/LRU.
    if (IMAGE_HOSTS.includes(url.hostname)) {
      return cacheFirstImage(request);
    }

    // A partir de acá solo nos interesa el mismo origen. El resto de hosts
    // externos (Supabase, YouTube, TMDB API) NO se interceptan.
    if (!sameOrigin) return null;

    // 2. API propia → Network Only. Nunca cache: la UI maneja el fallo.
    if (url.pathname.startsWith("/api/")) {
      return networkOnly(request);
    }

    // 3. Assets de Next con hash de contenido → Cache First permanente.
    if (url.pathname.startsWith("/_next/static/")) {
      return cacheFirst(request, CACHE.static);
    }

    // 4. Assets propios estáticos (íconos, splash, screenshots, manifest).
    if (
      url.pathname.startsWith("/icons/") ||
      url.pathname.startsWith("/splash/") ||
      url.pathname.startsWith("/screenshots/") ||
      url.pathname === "/manifest.webmanifest"
    ) {
      return cacheFirst(request, CACHE.static);
    }

    // 5. Documentos de navegación → Network First, con /offline de fallback.
    if (request.mode === "navigate" || request.destination === "document") {
      return networkFirst(request, CACHE.pages, "/offline");
    }

    // 6. Cualquier otro GET same-origin → no interceptar.
    return null;
  }

  self.SC_ROUTE = route;
})();
