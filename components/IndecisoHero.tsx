"use client";
import { useState, useRef } from "react";
import { useApi } from "./useApi";
import { usePlatforms } from "./PlatformsContext";
import TitleCard from "./TitleCard";
import type { UITitle } from "@/lib/types";

export default function IndecisoHero() {
  const { platforms } = usePlatforms();
  const [offset, setOffset] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const { data, loading } = useApi<{ items: UITitle[] }>(
    () => `/api/recomendaciones?tipo=all&genre=todos&offset=${offset}&providers=${platforms.join(",")}`,
    [offset],
  );
  const picks = data?.items ?? [];
  return (
    <section className="hero">
      <div className="wrap">
        <p className="kicker">No sabés qué ver</p>
        <h1>¿Qué tenés ganas de ver hoy?</h1>
        <p className="sub">Seis, no seiscientos. Solo lo que está en tus plataformas.</p>
      </div>
      <div className="wrap">
        <div className="shelf">
          <div className="shelf-head">
            <h2>{picks.length || 6} para hoy</h2>
            <button className="reshuffle" onClick={() => setOffset((o) => o + 1)}>
              <svg viewBox="0 0 24 24" fill="none"><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></svg>
              Mostrame otras
            </button>
          </div>
          <div className="track" ref={track}>
            {loading ? <span className="loading">Cargando…</span>
              : picks.length ? picks.map((t) => <TitleCard key={`${t.type}-${t.id}`} t={t} />)
              : <p className="empty-note">Nada en tus plataformas. Activá alguna en el botón de arriba.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
