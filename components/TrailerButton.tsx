"use client";
import { forwardRef } from "react";

// forwardRef para que HeroTrailer pueda devolverle el foco al cerrar el player.
const TrailerButton = forwardRef<HTMLButtonElement, { onPlay: () => void }>(
  function TrailerButton({ onPlay }, ref) {
    return (
      <button ref={ref} className="htrailer-btn" onClick={onPlay} aria-label="Ver tráiler">
        <span className="play"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg></span>
        <span>Ver tráiler</span>
      </button>
    );
  },
);
export default TrailerButton;
