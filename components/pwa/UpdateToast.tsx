"use client";
import { pwaActiva } from "@/lib/pwa-nativa";

// Aviso de versión nueva. Necesario por la decisión de skipWaiting() del SW:
// como el SW nuevo se activa de inmediato, una pestaña abierta puede quedar con
// JS viejo y HTML nuevo. Este toast le ofrece al usuario recargar para estrenar.
export default function UpdateToast({ show, onReload }: { show: boolean; onReload: () => void }) {
  // CP6 — adentro del APK no hay nada que actualizar por esta vía: la app se
  // actualiza por la tienda. El guard va acá y no sólo en PwaClient para que
  // la pieza esté apagada la monte quien la monte.
  if (!pwaActiva()) return null;
  if (!show) return null;
  return (
    <div className="pwa-update" role="status">
      <span>Hay una versión nueva de Yump.</span>
      <button className="pwa-update-btn" onClick={onReload}>Actualizar</button>
    </div>
  );
}
