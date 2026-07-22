"use client";
import { useEffect, useState } from "react";
import { usePlatforms } from "@/components/PlatformsContext";
import { isStandalone } from "@/hooks/useInstallPrompt";

const SEEN_KEY = "sc:pwa:welcomed";

// Primer arranque de la app instalada. En iOS, instalar crea un contexto de
// almacenamiento nuevo: se pierden plataformas, tema y sesión de Safari. En vez
// de que el usuario lo viva como "se borró todo", lo presentamos como bienvenida
// y lo mandamos a elegir plataformas. Ver spec §4.3.
export default function StandaloneWelcome() {
  const { platforms } = usePlatforms();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isStandalone()) return;
    try {
      if (localStorage.getItem(SEEN_KEY)) return;
      // Solo si además no hay plataformas elegidas (primer arranque real).
      if (platforms.length > 0) { localStorage.setItem(SEEN_KEY, "1"); return; }
      setShow(true);
    } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!show) return null;

  function close() {
    setShow(false);
    try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* noop */ }
  }

  return (
    <div className="pwa-welcome-backdrop" role="dialog" aria-modal="true" aria-label="Bienvenido">
      <div className="pwa-welcome">
        <img src="/icons/icon-192.png" alt="" width={64} height={64} />
        <h2>¡Bienvenido a la app!</h2>
        <p>Para empezar, elegí tus plataformas de streaming desde el botón <b>Plataformas</b> arriba. Si ya tenías cuenta, ingresá de nuevo para ver tus listas.</p>
        <button className="btn" onClick={close}>Empezar</button>
      </div>
    </div>
  );
}
