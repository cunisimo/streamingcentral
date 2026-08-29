/** @type {import('next').NextConfig} */

// DOS builds distintos desde un solo config, y la variable es lo único que los
// separa. Ver docs/superpowers/plans/2026-08-30-etapa2-prototipo-android-capacitor.md
//
//   sin CAPACITOR  → el build web de siempre. Nada cambia.
//   CAPACITOR=1    → la cáscara estática que empaqueta el contenedor Android.
//
// La variable NUNCA vive en `.env.local`: la inyecta `scripts/build-capacitor.mjs`
// en el entorno del proceso hijo y muere con él. Así un `npm run build` posterior
// no puede heredarla ni por accidente.
const esCapacitor = process.env.CAPACITOR === "1";

// Las tres opciones del camino Capacitor que NO son obvias:
//
// `pageExtensions` es lo que saca del export las 25 rutas de `app/api`. La doc
// de Static Exports dice que sólo soporta el verbo GET y que las rutas que
// dependen del Request no van; las 25 son `force-dynamic` y dos son POST, así
// que ninguna entra. Funciona porque en este repo la separación por extensión
// es perfecta: TODAS las páginas y layouts son `.tsx` y TODOS los route
// handlers son `.ts`. De paso excluye `app/manifest.ts`, que es deseable: el
// manifest no tiene sentido adentro de un APK.
//
// ⚠️ EL VALOR ES EL DEFAULT DE NEXT MENOS "ts", NO ["tsx"] a secas. Con
// ["tsx"] el build muere con `pageExtensions.map is not a function` sobre
// `next/dist/client/components/not-found-error` y sobre CADA página: los
// componentes internos de Next son `.js`, y al sacarlos de la lista deja de
// poder resolverlos. Medido en la primera corrida del diagnóstico de CP1.
// El default de Next 14 es ["tsx","ts","jsx","js"]; quitar sólo "ts" es el
// cambio quirúrgico que excluye `route.ts` y `manifest.ts` sin romper nada.
//
// `trailingSlash: true` hace que el export emita `/ruta/index.html` en vez de
// `/ruta.html`. Un servidor de archivos resuelve un directorio con `index.html`
// naturalmente; `/ruta.html` exige que pruebe `$uri.html`, y eso no está
// garantizado en el servidor interno de Capacitor.
//
// `images.unoptimized` es un seguro, no una necesidad: hoy el proyecto no usa
// `next/image` en ningún lado. Cuesta una línea y evita que el día que alguien
// agregue un `<Image>` el build nativo se rompa sin explicación.
const nextConfig = esCapacitor
  ? {
      output: "export",
      // Sale de una variable para que el diagnóstico de CP1 pueda escribir en un
      // directorio propio y aislado en vez de dejar un `out/` ambiguo en la raíz.
      distDir: process.env.CAPACITOR_DIST ?? "out",
      pageExtensions: ["tsx", "jsx", "js"],   // el default menos "ts"
      trailingSlash: true,
      images: { unoptimized: true },
    }
  : {
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
