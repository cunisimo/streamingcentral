"use client";

// Aviso de versión nueva. Necesario por la decisión de skipWaiting() del SW:
// como el SW nuevo se activa de inmediato, una pestaña abierta puede quedar con
// JS viejo y HTML nuevo. Este toast le ofrece al usuario recargar para estrenar.
export default function UpdateToast({ show, onReload }: { show: boolean; onReload: () => void }) {
  if (!show) return null;
  return (
    <div className="pwa-update" role="status">
      <span>Hay una versión nueva de StreamingCentral.</span>
      <button className="pwa-update-btn" onClick={onReload}>Actualizar</button>
    </div>
  );
}
