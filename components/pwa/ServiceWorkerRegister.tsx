"use client";
import { useEffect } from "react";

// Registra el Service Worker y avisa cuando hay una versión nueva.
// NO registra en desarrollo: un SW cacheando bajo `next dev` produce horas de
// depuración fantasma (cambiás código y no se refleja).
export default function ServiceWorkerRegister({ onUpdate }: { onUpdate?: () => void }) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    let refreshing = false;
    // Cuando el SW nuevo toma control, recargar una vez para estrenar el shell.
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    navigator.serviceWorker.register("/sw.js").then((reg) => {
      // Detectar una actualización esperando para activarse.
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener("statechange", () => {
          // Hay un SW instalado y ya había uno controlando: es una actualización.
          if (sw.state === "installed" && navigator.serviceWorker.controller) {
            onUpdate?.();
          }
        });
      });
    }).catch(() => { /* registro fallido: la app funciona igual, sin offline */ });
  }, [onUpdate]);

  return null;
}
