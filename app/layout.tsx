import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import "./globals.css";
import { PlatformsProvider } from "@/components/PlatformsContext";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const body = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F5F5F2",
};

export const metadata: Metadata = {
  title: "StreamingCentral",
  description: "Qué ver en tus plataformas de streaming, sin perder 45 minutos buscando.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${display.variable} ${body.variable}`}>
      <body>
        <PlatformsProvider>{children}</PlatformsProvider>
      </body>
    </html>
  );
}
