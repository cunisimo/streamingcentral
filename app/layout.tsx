import type { Metadata, Viewport } from "next";
import { COLOR_FONDO } from "@/lib/tema-colores";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { PlatformsProvider } from "@/components/PlatformsContext";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ThemeProvider } from "@/components/ThemeContext";
import { AuthProvider } from "@/components/AuthContext";
import { MyListProvider } from "@/components/MyListContext";
import AppleSplashLinks from "@/components/pwa/AppleSplashLinks";
import PwaClient from "@/components/pwa/PwaClient";
import OnboardingGate from "@/components/onboarding/OnboardingGate";
import NavHistorial from "@/components/NavHistorial";

// Corre ANTES del primer pintado y hace DOS cosas.
//
// La primera es la de siempre: fijar `data-theme` para que no haya un
// parpadeo claro/oscuro al hidratar.
//
// 🔴 LA SEGUNDA ES EL ARREGLO DE LA FRANJA. Las metas `theme-color` llevan
// `media`, así que siguen a `prefers-color-scheme` y NO al tema elegido a mano.
// Con el sistema en oscuro y la app en claro, la barra de estado de la PWA
// arrancaba negra sobre una app blanca en CADA arranque en frío, y recién se
// corregía cuando hidrataba React. Acá se corrige antes de pintar.
//
// Puede hacerlo porque Next emite las metas antes que este script (verificado
// en el HTML servido). Sólo se muta `content`: ver la advertencia de
// ThemeContext sobre no sacar estos nodos del DOM.
const THEME_INIT_SCRIPT = `(function(){try{var c=${JSON.stringify(COLOR_FONDO)};var t=localStorage.getItem("sc:theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.setAttribute("data-theme",t);var m=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<m.length;i++){m[i].content=c[t];}}catch(e){}})();`;

// `optional` en vez de `swap`: con swap, el kicker del hero se pinta con la
// fuente de respaldo en DOS renglones (39px) y al llegar Jakarta pasa a UNO
// (20px), subiendo 19px todo lo que está abajo. Medido, era el 29% del CLS.
// `optional` elimina el intercambio en vez de contenerlo: si la fuente no llegó
// en ~100ms, esa carga entera usa el respaldo y nunca hay reflow. El costo es
// que la primera visita puede verse con la tipografía de respaldo.
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "optional" });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // viewportFit "cover" es lo que hace que env(safe-area-inset-*) devuelva algo
  // distinto de 0 en iPhone. Sin esto, todo el CSS de safe areas es inerte y la
  // barra inferior queda tapada por el home indicator.
  viewportFit: "cover",
  // El teclado virtual achica el viewport en vez de taparlo: el input enfocado
  // y la barra inferior quedan visibles sin necesidad de JS.
  interactiveWidget: "resizes-content",
  // Dos entradas con media: la barra de estado sigue al tema del sistema.
  // El toggle manual de ThemeContext además reescribe estas etiquetas en runtime,
  // para el caso de sistema claro + app en oscuro (o viceversa).
  // Los colores salen de `lib/tema-colores.ts`, que es la única copia y está
  // atada al `--bg` de globals.css por un test. Escribirlos a mano acá fue
  // parte de cómo se desincronizaron.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: COLOR_FONDO.light },
    { media: "(prefers-color-scheme: dark)", color: COLOR_FONDO.dark },
  ],
};

export const metadata: Metadata = {
  title: "Yump",
  description: "Qué ver en tus plataformas de streaming, sin perder 45 minutos buscando.",
  applicationName: "Yump",
  // Next inyecta <link rel="manifest"> apuntando a la metadata route app/manifest.ts.
  manifest: "/manifest.webmanifest",
  // iOS ignora el manifest: estas son las que hacen que se abra en standalone,
  // con la barra de estado translúcida y el título correcto bajo el ícono.
  appleWebApp: {
    capable: true,
    title: "Yump",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={jakarta.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <AppleSplashLinks />
      </head>
      <body>
        <ThemeProvider>
          <AuthProvider>
            <MyListProvider>
              <PlatformsProvider>
                {children}
                {/* Dentro de PlatformsProvider: StandaloneWelcome usa usePlatforms. */}
                <PwaClient />
                <OnboardingGate />
                <NavHistorial />
              </PlatformsProvider>
            </MyListProvider>
          </AuthProvider>
        </ThemeProvider>
        {/* Medición de uso real. Van FUERA de los providers a propósito: no
            dependen de ningún contexto y así no re-renderizan con ellos.
            Analytics es sin cookies, así que no obliga a un banner de consentimiento.
            Los dos se auto-desactivan fuera de Vercel, así que en `next dev`
            no mandan nada. */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
