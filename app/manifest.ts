import type { MetadataRoute } from "next";

// Metadata route de Next: genera /manifest.webmanifest tipado.
// iOS ignora casi todo esto (display, theme_color, shortcuts, screenshots,
// orientation) y usa las meta apple-* del layout; el manifest sirve sobre todo
// para Android y desktop. Ver docs/superpowers/specs/2026-07-21-pwa-design.md §2.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "StreamingCentral — Qué ver en tus plataformas",
    short_name: "StreamingCentral",
    description:
      "Qué ver en tus plataformas de streaming, sin perder 45 minutos buscando.",
    // id estable: sin esto, cambiar start_url haría que el navegador trate la
    // app como una instalación nueva.
    id: "/",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "es-AR",
    dir: "ltr",
    theme_color: "#F5F5F2",
    background_color: "#F5F5F2",
    categories: ["entertainment", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // form_factor es válido en el spec del manifest pero el tipo de Next 14 aún
    // no lo incluye; el cast mantiene la ficha rica de instalación en Android.
    screenshots: [
      { src: "/screenshots/sc-mobile-1.png", sizes: "1080x1920", type: "image/png", form_factor: "narrow" },
      { src: "/screenshots/sc-mobile-2.png", sizes: "1080x1920", type: "image/png", form_factor: "narrow" },
      { src: "/screenshots/sc-mobile-3.png", sizes: "1080x1920", type: "image/png", form_factor: "narrow" },
      { src: "/screenshots/sc-desktop-1.png", sizes: "1920x1080", type: "image/png", form_factor: "wide" },
    ] as unknown as MetadataRoute.Manifest["screenshots"],
    shortcuts: [
      {
        name: "Buscar",
        short_name: "Buscar",
        url: "/buscar?source=pwa-shortcut",
        icons: [{ src: "/icons/shortcut-buscar.png", sizes: "96x96", type: "image/png" }],
      },
      {
        name: "Mi lista",
        short_name: "Mi lista",
        url: "/cuenta/lista?source=pwa-shortcut",
        icons: [{ src: "/icons/shortcut-lista.png", sizes: "96x96", type: "image/png" }],
      },
      {
        name: "Qué veo hoy",
        short_name: "Qué veo hoy",
        url: "/?source=pwa-shortcut",
        icons: [{ src: "/icons/shortcut-indeciso.png", sizes: "96x96", type: "image/png" }],
      },
    ],
  };
}
