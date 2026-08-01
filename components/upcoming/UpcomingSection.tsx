"use client";
import { useRef } from "react";
import { useUpcoming } from "./useUpcoming";
import UpcomingCard from "./UpcomingCard";

// Riel "Próximamente" del Home. Toda la lógica de datos vive en useUpcoming;
// este componente solo orquesta el render y sus estados. Desacoplado del Home:
// se puede reubicar o reusar con otros filtros sin tocarlo.
export default function UpcomingSection({ limit = 15 }: { limit?: number }) {
  const track = useRef<HTMLDivElement>(null);
  const { items, loading, offline, retry } = useUpcoming({ limit });

  const scroll = (d: number) =>
    track.current?.scrollBy({ left: d * (track.current.clientWidth * 0.8), behavior: "smooth" });

  return (
    <div className="shelf">
      <div className="shelf-head">
        <h2>Próximamente</h2>
        <div className="arrows">
          <button className="arrow" onClick={() => scroll(-1)} aria-label="Anterior">
            <svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <button className="arrow" onClick={() => scroll(1)} aria-label="Siguiente">
            <svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        </div>
      </div>

      {offline ? (
        <p className="empty-note">
          No se pudieron cargar los estrenos.{" "}
          <button className="up-retry" onClick={retry}>Reintentar</button>
        </p>
      ) : loading ? (
        <div className="track" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card up-skel" aria-hidden="true">
              <div className="up-skel-poster sk" />
              <div className="meta">
                <div className="sk up-skel-t" />
                <div className="sk up-skel-d" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="empty-note">Todavía no hay estrenos próximos para mostrar.</p>
      ) : (
        <div className="track" ref={track}>
          {items.map((it) => <UpcomingCard key={`${it.type}-${it.id}`} item={it} />)}
        </div>
      )}
    </div>
  );
}
