"use client";
import { useState, useCallback } from "react";
import ServiceWorkerRegister from "./ServiceWorkerRegister";
import InstallPrompt from "./InstallPrompt";
import UpdateToast from "./UpdateToast";
import StandaloneWelcome from "./StandaloneWelcome";

// Orquesta todo lo client de la PWA en un solo punto montado en el layout:
// registro del SW, aviso de actualización, banner de instalación y bienvenida de
// primer arranque en standalone.
export default function PwaClient() {
  const [updateReady, setUpdateReady] = useState(false);
  const onUpdate = useCallback(() => setUpdateReady(true), []);
  const reload = useCallback(() => {
    // Pedir al SW en espera que se active, y recargar cuando tome control.
    navigator.serviceWorker?.getRegistration().then((reg) => {
      reg?.waiting?.postMessage("SKIP_WAITING");
    });
    // Fallback: recargar igual tras un instante.
    setTimeout(() => window.location.reload(), 300);
  }, []);

  return (
    <>
      <ServiceWorkerRegister onUpdate={onUpdate} />
      <UpdateToast show={updateReady} onReload={reload} />
      <InstallPrompt />
      <StandaloneWelcome />
    </>
  );
}
