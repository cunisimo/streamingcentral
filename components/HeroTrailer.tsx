"use client";
import { CSSProperties, useEffect, useRef, useState } from "react";
import TrailerButton from "./TrailerButton";
import TrailerPlayer from "./TrailerPlayer";

export default function HeroTrailer(
  { heroStyle, onBack, trailerKey }:
  { heroStyle: CSSProperties; onBack: () => void; trailerKey: string | null },
) {
  const [playing, setPlaying] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const openedOnce = useRef(false);

  // Esc cierra el player, salvo que se esté saliendo de fullscreen (en ese caso
  // el navegador ya consume el Esc para cerrar el fullscreen, no el trailer).
  useEffect(() => {
    if (!playing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.fullscreenElement) setPlaying(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing]);

  // Al cerrar, devolver el foco al botón de play (sin robarlo en el montaje).
  useEffect(() => {
    if (playing) { openedOnce.current = true; return; }
    if (openedOnce.current) btnRef.current?.focus();
  }, [playing]);

  // El backdrop (heroStyle) queda siempre debajo: al cerrar, el hero vuelve
  // idéntico sin salto. El player hace fade-in por encima.
  return (
    <div className="dhero" style={heroStyle}>
      <button className="dback" onClick={onBack} aria-label="Volver">
        <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
      </button>
      {trailerKey && !playing && <TrailerButton ref={btnRef} onPlay={() => setPlaying(true)} />}
      {trailerKey && playing && (
        <TrailerPlayer youtubeKey={trailerKey} onClose={() => setPlaying(false)} />
      )}
    </div>
  );
}
