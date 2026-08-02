import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { PlatformsProvider } from "@/components/PlatformsContext";
import { ThemeProvider } from "@/components/ThemeContext";
import { AuthProvider } from "@/components/AuthContext";
import { MyListProvider } from "@/components/MyListContext";
import AppleSplashLinks from "@/components/pwa/AppleSplashLinks";
import PwaClient from "@/components/pwa/PwaClient";
import OnboardingGate from "@/components/onboarding/OnboardingGate";

const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("sc:theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });

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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAFAFD" },
    { media: "(prefers-color-scheme: dark)", color: "#0F0E13" },
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
              </PlatformsProvider>
            </MyListProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
