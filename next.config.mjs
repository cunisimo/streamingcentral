/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "image.tmdb.org" },
    ],
  },
  async headers() {
    return [
      {
        // Si el navegador cachea /sw.js, la app no se puede actualizar nunca:
        // seguiría sirviendo el SW viejo. no-cache obliga a revalidar siempre.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        // Los módulos del SW (importScripts) revalidan por el mismo motivo.
        source: "/sw/:path*",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};
export default nextConfig;
