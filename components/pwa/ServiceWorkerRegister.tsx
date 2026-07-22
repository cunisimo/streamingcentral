"use client";
import { useEffect } from "react";

// Registra el Service Worker y avisa cuando hay una versión nueva.
// NO registra en desarrollo: un SW cacheando bajo `next dev` produce horas de
// depuración fantasma (cambiás código y no se refleja).
export default function ServiceWorkerRegister({ onUpdate }: { onUpdate?: () => void }) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    // OJO: NO recargar automáticamente en "controllerchange". El SW hace
    // skipWaiting()+clients.claim() en la primera instalación, y eso dispara un
    // controllerchange en la carga inicial. Recargar ahí hace que CADA primera
    // visita se recargue sola (Lighthouse lo cuenta como redirect: ~4.5s de LCP).
    // La recarga tras una actualización la maneja el usuario desde el UpdateToast
    // (PwaClient: postMessage SKIP_WAITING + reload). Ver spec §3.6.
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
