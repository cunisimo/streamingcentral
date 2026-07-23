"use client";
import { useEffect } from "react";

// Registra el Service Worker y avisa cuando hay una versión nueva.
// NO registra en desarrollo: un SW cacheando bajo `next dev` produce horas de
// depuración fantasma (cambiás código y no se refleja).
export default function ServiceWorkerRegister({ onUpdate }: { onUpdate?: () => void }) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    // Recargar cuando el SW nuevo TOMA el control — pero sólo si la página ya
    // estaba controlada al cargar (= es una actualización). En la PRIMERA
    // instalación, clients.claim() también dispara controllerchange, y recargar
    // ahí hace que cada primera visita se recargue sola (Lighthouse lo cuenta
    // como redirect, +4.5s de LCP). El guard `wasControlled` distingue los casos.
    const wasControlled = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!wasControlled || reloaded) return;
      reloaded = true;
      window.location.reload();
    });

    navigator.serviceWorker.register("/sw.js").then((reg) => {
      // Si ya quedó un SW esperando de una sesión anterior (el usuario no
      // actualizó), mostrar el aviso ahora.
      if (reg.waiting && navigator.serviceWorker.controller) onUpdate?.();

      // Detectar una actualización que termina de instalarse en esta sesión.
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener("statechange", () => {
          // Instalado + ya había uno controlando = actualización lista y en espera.
          if (sw.state === "installed" && navigator.serviceWorker.controller) {
            onUpdate?.();
          }
        });
      });
    }).catch(() => { /* registro fallido: la app funciona igual, sin offline */ });
  }, [onUpdate]);

  return null;
}
