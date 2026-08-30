"use client";
import { useState } from "react";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { pwaActiva } from "@/lib/pwa-nativa";

// Fila "Instalar aplicación" para /cuenta/configuracion. Entrada permanente y no
// intrusiva para quien descartó el banner y después la quiere. Se adapta al
// dispositivo: botón directo en Android, instrucciones en iOS.
export default function InstallRow() {
  const { platform, canPrompt, installed, promptInstall } = useInstallPrompt();
  const [iosOpen, setIosOpen] = useState(false);

  // CP6 — la fila entera desaparece del APK.
  //
  // 🔴 Dejarla era peor que inútil: adentro de Capacitor `isStandalone()`
  // matchea `display-mode: standalone`, así que `installed` da true y el
  // usuario vería "Ya la estás usando como app instalada 🎉" sobre una
  // instalación de PWA que nunca hizo. Las otras dos ramas son peores todavía:
  // ofrecerían INSTALAR una app que ya está instalada.
  //
  // El guard va DESPUÉS de los hooks, no antes: `pwaActiva()` es una constante
  // de build y nunca cambia entre renders, así que un return anticipado sería
  // seguro — pero igual contradice las reglas de hooks de React, y ponerlo
  // acá no cuesta nada. (Este repo no tiene ESLint configurado, así que la
  // regla no la hace cumplir ninguna herramienta: se respeta a mano.)
  if (!pwaActiva()) return null;

  if (installed) {
    return (
      <div className="cfg-row off">
        <div className="cfg-info">
          <div className="cfg-lbl">Aplicación</div>
          <div className="cfg-sub">Ya la estás usando como app instalada. 🎉</div>
        </div>
        <span className="cfg-soon">Instalada</span>
      </div>
    );
  }

  return (
    <div className="cfg-row">
      <div className="cfg-info">
        <div className="cfg-lbl">Instalar aplicación</div>
        <div className="cfg-sub">
          {platform === "ios"
            ? "Abrila como app desde tu pantalla de inicio."
            : "Sin barra del navegador, más rápido, en tu pantalla de inicio."}
        </div>
        {platform === "ios" && iosOpen && (
          <div className="cfg-ios-steps">
            1. Tocá <b>Compartir</b> en la barra de Safari.<br />
            2. Elegí <b>Agregar a inicio</b>.<br />
            3. Confirmá con <b>Agregar</b>.
          </div>
        )}
      </div>
      {platform === "ios" ? (
        <button className="cfg-select" onClick={() => setIosOpen((o) => !o)}>
          {iosOpen ? "Ocultar" : "Cómo"}
        </button>
      ) : canPrompt ? (
        <button className="cfg-select" onClick={() => promptInstall()}>Instalar</button>
      ) : (
        <span className="cfg-soon">No disponible acá</span>
      )}
    </div>
  );
}
