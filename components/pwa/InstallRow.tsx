"use client";
import { useState } from "react";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

// Fila "Instalar aplicación" para /cuenta/configuracion. Entrada permanente y no
// intrusiva para quien descartó el banner y después la quiere. Se adapta al
// dispositivo: botón directo en Android, instrucciones en iOS.
export default function InstallRow() {
  const { platform, canPrompt, installed, promptInstall } = useInstallPrompt();
  const [iosOpen, setIosOpen] = useState(false);

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
