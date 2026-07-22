"use client";
import { useEffect, useState, useCallback } from "react";

// Evento beforeinstallprompt (solo Chrome/Edge; el tipo no está en lib.dom).
interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallPlatform = "android" | "ios" | "none";

interface InstallState {
  platform: InstallPlatform; // cómo se instala en este dispositivo
  canPrompt: boolean;        // hay un beforeinstallprompt capturado (Android)
  installed: boolean;        // ya corre en standalone
  promptInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS expone navigator.standalone en vez de display-mode.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function detectIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ se hace pasar por Mac: se detecta por touch.
  const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return iOS || iPadOS;
}

// Estado de instalabilidad multiplataforma. En iOS no existe beforeinstallprompt
// (Safari no lo soporta): ahí platform === "ios" y la UI muestra instrucciones.
export function useInstallPrompt(): InstallState {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState<InstallPlatform>("none");

  useEffect(() => {
    setInstalled(isStandalone());
    if (detectIOS()) setPlatform("ios");

    const onBIP = (e: Event) => {
      e.preventDefault(); // evita el mini-infobar nativo; usamos banner propio
      setDeferred(e as BIPEvent);
      setPlatform("android");
    };
    const onInstalled = () => { setInstalled(true); setDeferred(null); };

    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferred) return "unavailable" as const;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    return outcome;
  }, [deferred]);

  return { platform, canPrompt: !!deferred, installed, promptInstall };
}

export { isStandalone };
