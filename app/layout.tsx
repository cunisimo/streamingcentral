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

// Corre ANTES del primer pintado, fija `data-theme` y CREA la meta theme-color.
//
// ============================================================================
// POR QUÉ LA META NO LA RENDEREA REACT
// ============================================================================
// La barra de estado de la PWA instalada se pinta con `theme-color`. Antes
// salía de `viewport.themeColor`, que emite dos metas con `media`: siguen a
// `prefers-color-scheme` y NO al tema que el usuario eligió en la app. Con el
// sistema en claro y la app en oscuro, la que aplicaba valía `#FAFAFD` —casi
// blanca— desde que se parsea el HTML hasta que corre el efecto de
// ThemeContext. Medido: 301 ms en escritorio con todo cacheado.
//
// 🔴 CORREGIRLAS DESDE ACÁ NO SE PUEDE, Y ESE FUE UN INTENTO FALLIDO. React
// administra las metas que renderiza como *hoistable resources*: si antes de
// hidratar les cambiás el `content`, al hidratar NO adopta el nodo, le agrega
// una copia con el valor original. Medido con el stack en el chunk de
// react-dom. Se probaron las dos formas —`viewport.themeColor` y una meta
// explícita en el JSX con `suppressHydrationWarning`— y las dos duplican, sin
// emitir ninguna advertencia. La copia queda viva y casi blanca.
//
// La salida es que React no renderee ninguna: la crea este script. Lo que
// React no rendereó, no lo repone. Por eso NO hay `themeColor` en `viewport`
// ni una etiqueta `theme-color` en el JSX, y hay un test que lo vigila.
const THEME_INIT_SCRIPT = `(function(){try{var c=${JSON.stringify(COLOR_FONDO)};var t=localStorage.getItem("sc:theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.setAttribute("data-theme",t);var m=document.querySelector('meta[name="theme-color"]');if(!m){m=document.createElement("meta");m.name="theme-color";document.head.appendChild(m);}m.content=c[t];}catch(e){}})();`;

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
  // 🔴 ACÁ NO VA EL COLOR DE LA BARRA. La meta `theme-color` la crea el script
  // de arranque (ver arriba): declararla desde React hace que React la duplique
  // al hidratar. Hay un test que falla si vuelve.
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
        {/* 🔴 ACÁ NO VA LA ETIQUETA DE `theme-color`, ni en `viewport`: la crea
            THEME_INIT_SCRIPT. Ver el comentario de arriba, y el test que falla
            si alguien la vuelve a declarar desde React. */}
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
