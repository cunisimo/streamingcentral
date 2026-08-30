"use client";
import { useState, useCallback } from "react";
import ServiceWorkerRegister from "./ServiceWorkerRegister";
import InstallPrompt from "./InstallPrompt";
import UpdateToast from "./UpdateToast";
import StandaloneWelcome from "./StandaloneWelcome";
import { pwaActiva } from "@/lib/pwa-nativa";

// Orquesta todo lo client de la PWA en un solo punto montado en el layout:
// registro del SW, aviso de actualización, banner de instalación y bienvenida de
// primer arranque en standalone.
export default function PwaClient() {
  const [updateReady, setUpdateReady] = useState(false);
  const onUpdate = useCallback(() => setUpdateReady(true), []);
  const reload = useCallback(() => {
    navigator.serviceWorker?.getRegistration().then((reg) => {
      if (reg?.waiting) {
        // Activar el SW en espera. Cuando tome control, el listener de
        // controllerchange (en ServiceWorkerRegister) recarga la página. No
        // recargamos acá con un setTimeout: sería una carrera contra la
        // activación y podía recargar bajo el SW viejo, sin aplicar el cambio.
        reg.waiting.postMessage("SKIP_WAITING");
        // Red de seguridad por si controllerchange no llegara (raro).
        setTimeout(() => window.location.reload(), 2000);
      } else {
        // No hay SW en espera (ya activo o sin SW): recargar directo.
        window.location.reload();
      }
    });
  }, []);

  // CP6 — el orquestador se conserva, sus piezas de PWA no se montan.
  //
  // StandaloneWelcome SÍ sobrevive, y no es un olvido: su texto es "elegí tus
  // plataformas / si ya tenías cuenta, ingresá de nuevo", que es justo lo que
  // necesita el primer arranque del APK, con almacenamiento vacío. No dice nada
  // de instalar ni de PWA. Ver el inventario de CP6 en el plan.
  if (!pwaActiva()) return <StandaloneWelcome />;

  return (
    <>
      <ServiceWorkerRegister onUpdate={onUpdate} />
      <UpdateToast show={updateReady} onReload={reload} />
      <InstallPrompt />
      <StandaloneWelcome />
    </>
  );
}
