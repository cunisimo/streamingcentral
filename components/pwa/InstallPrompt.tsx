"use client";
import { useEffect, useState } from "react";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

const DISMISS_KEY = "sc:pwa:dismissed"; // timestamp del último descarte
const VISITS_KEY = "sc:visits";          // conteo de sesiones
const DISMISS_DAYS = 30;
const SESSION_FLAG = "sc:pwa:counted";   // ya se contó esta sesión
const SHOWN_FLAG = "sc:pwa:shown";        // ya se evaluó/mostró el banner esta sesión

// Banner propio de instalación. No depende solo del banner del navegador.
// - Android/Chrome/Edge: usa el beforeinstallprompt capturado.
// - iOS/Safari: muestra instrucciones (no existe beforeinstallprompt).
// Reglas: nunca en la 1ª visita, nunca si ya está instalada, silencio 30 días
// al descartar, una vez por sesión.
export default function InstallPrompt() {
  const { platform, canPrompt, installed, promptInstall } = useInstallPrompt();
  const [show, setShow] = useState(false);

  // Efecto 1 — contar SESIONES, no cargas de página. SESSION_FLAG persiste en
  // sessionStorage toda la sesión (sobrevive recargas, incluida la que dispara
  // el SW al tomar control), así que se incrementa una sola vez por sesión.
  useEffect(() => {
    try {
      if (!sessionStorage.getItem(SESSION_FLAG)) {
        const visits = Number(localStorage.getItem(VISITS_KEY) || "0") + 1;
        localStorage.setItem(VISITS_KEY, String(visits));
        sessionStorage.setItem(SESSION_FLAG, "1");
      }
    } catch { /* noop */ }
  }, []);

  // Efecto 2 — evaluar si mostrar el banner. Se re-ejecuta cuando cambia la
  // instalabilidad, porque beforeinstallprompt llega asincrónicamente después
  // del load (canPrompt pasa a true más tarde).
  useEffect(() => {
    if (installed) return;
    // Solo hay forma de instalar si es iOS (instrucciones) o hay prompt (Android).
    if (platform !== "ios" && !canPrompt) return;
    try {
      // Nunca en la primera visita (sesión).
      if (Number(localStorage.getItem(VISITS_KEY) || "0") < 2) return;
      // Silencio tras descarte reciente.
      const d = Number(localStorage.getItem(DISMISS_KEY) || "0");
      if (d && Date.now() - d < DISMISS_DAYS * 864e5) return;
      // Una vez por sesión: si ya se mostró/descartó en esta sesión, no repetir.
      if (sessionStorage.getItem(SHOWN_FLAG)) return;
      sessionStorage.setItem(SHOWN_FLAG, "1");
    } catch { /* noop */ }
    setShow(true);
  }, [installed, platform, canPrompt]);

  if (!show || installed) return null;

  function dismiss() {
    setShow(false);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* noop */ }
  }

  async function install() {
    const outcome = await promptInstall();
    if (outcome !== "unavailable") setShow(false);
  }

  return (
    <div className="pwa-install" role="dialog" aria-label="Instalar StreamingCentral">
      <button className="pwa-install-x" onClick={dismiss} aria-label="Cerrar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
      <img className="pwa-install-ico" src="/icons/icon-192.png" alt="" width={48} height={48} />
      {platform === "ios" ? (
        <div className="pwa-install-body">
          <strong>Instalá StreamingCentral</strong>
          <p>
            Tocá <span className="pwa-share" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M8 8l4-4 4 4" /><path d="M4 12v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" /></svg>
            </span> Compartir y después <b>Agregar a inicio</b>.
          </p>
        </div>
      ) : (
        <div className="pwa-install-body">
          <strong>Instalá StreamingCentral</strong>
          <p>Abrila como app: sin barra del navegador, más rápido, en tu pantalla de inicio.</p>
          <button className="btn pwa-install-cta" onClick={install}>Instalar</button>
        </div>
      )}
    </div>
  );
}
