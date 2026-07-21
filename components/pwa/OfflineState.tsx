"use client";
import { useEffect } from "react";
import { useOnline } from "@/hooks/useOnline";

// Estado offline reusable para dentro de una vista: se muestra cuando el HTML
// cargó pero /api/* falló por falta de conexión. Mismo lenguaje visual que la
// página /offline. Si vuelve la conexión, reintenta solo.
export default function OfflineState({ onRetry }: { onRetry: () => void }) {
  const online = useOnline();

  // Al recuperar conexión, reintentar automáticamente sin que el usuario toque nada.
  useEffect(() => {
    if (online) onRetry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  return (
    <div className="offline-state" role="status">
      <div className="offline-ico" aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 1l22 22" />
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
          <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>
      </div>
      <h3>Sin conexión</h3>
      <p>No pudimos cargar esto. Revisá tu conexión y volvé a intentar.</p>
      <button className="btn" onClick={onRetry}>Reintentar</button>
    </div>
  );
}
