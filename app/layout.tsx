import type { Metadata, Viewport } from "next";
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

const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("sc:theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;

// `optional` en vez de `swap`: con swap, el kicker del hero se pinta con la
// fuente de respaldo en DOS renglones (39px) y al llegar Jakarta pasa a UNO
// (20px), subiendo 19px todo lo que estÃ¡ abajo. Medido, era el 29% del CLS.
// `optional` elimina el intercambio en vez de contenerlo: si la fuente no llegÃ³
// en ~100ms, esa carga entera usa el respaldo y nunca hay reflow. El costo es
// que la primera visita puede verse con la tipografÃ­a de respaldo.
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
  // El toggle manual de ThemeContext ademÃ¡s reescribe estas etiquetas en runtime,
  // para el caso de sistema claro + app en oscuro (o viceversa).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAFAFD" },
    { media: "(prefers-color-scheme: dark)", color: "#0F0E13" },
  ],
};

export const metadata: Metadata = {
  title: "Yump",
  description: "QuÃ© ver en tus plataformas de streaming, sin perder 45 minutos buscando.",
  applicationName: "Yump",
  // Next inyecta <link rel="manifest"> apuntando a la metadata route app/manifest.ts.
  manifest: "/manifest.webmanifest",
  // iOS ignora el manifest: estas son las que hacen que se abra en standalone,
  // con la barra de estado translÃºcida y el tÃ­tulo correcto bajo el Ã­cono.
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
        {/* MediciÃ³n de uso real. Van FUERA de los providers a propÃ³sito: no
            dependen de ningÃºn contexto y asÃ­ no re-renderizan con ellos.
            Analytics es sin cookies, asÃ­ que no obliga a un banner de consentimiento.
            Los dos se auto-desactivan fuera de Vercel, asÃ­ que en `next dev`
            no mandan nada. */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
