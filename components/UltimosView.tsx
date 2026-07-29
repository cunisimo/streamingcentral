"use client";
import { useState, useEffect, useCallback } from "react";
import { usePlatforms } from "./PlatformsContext";
import TitleCard from "./TitleCard";
import OfflineState from "./pwa/OfflineState";
import { useOnline } from "@/hooks/useOnline";
import type { UITitle, MediaType } from "@/lib/types";

export default function UltimosView() {
  const { platforms } = usePlatforms();
  const [tipo, setTipo] = useState<MediaType>("movie");
  const [items, setItems] = useState<UITitle[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false); // una página vacía = fin
  const online = useOnline();
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (t: MediaType, p: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/latest?tipo=${t}&page=${p}&providers=${platforms.join(",")}`);
      const j = await res.json();
      const got: UITitle[] = j.items ?? [];
      setItems((prev) => (p === 1 ? got : [...prev, ...got]));
      setDone(got.length === 0);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [platforms]);

  // Carga inicial + al cambiar tipo o plataformas: reset a página 1.
  useEffect(() => { setPage(1); load(tipo, 1); }, [tipo, load]);

  function switchTipo(t: MediaType) { if (t !== tipo) { setItems([]); setDone(false); setTipo(t); } }
  function more() { const next = page + 1; setPage(next); load(tipo, next); }

  if ((!online || failed) && !items.length) {
    return <div className="wrap"><OfflineState onRetry={() => load(tipo, 1)} /></div>;
  }

  return (
    <div className="wrap">
      <div className="compact-head"><h1>Últimos lanzamientos</h1></div>
      <div className="tipo-toggle" role="tablist">
        <button role="tab" aria-selected={tipo === "movie"} className={`tt ${tipo === "movie" ? "on" : ""}`} onClick={() => switchTipo("movie")}>Películas</button>
        <button role="tab" aria-selected={tipo === "tv"} className={`tt ${tipo === "tv" ? "on" : ""}`} onClick={() => switchTipo("tv")}>Series</button>
      </div>
      <div className="grid">
        {items.map((t) => <TitleCard key={`${t.type}-${t.id}`} t={t} />)}
      </div>
      {loading && <p className="loading">Cargando…</p>}
      {!loading && !items.length && <p className="empty-note">Nada por acá con tus plataformas.</p>}
      {!done && !loading && items.length > 0 && (
        <div style={{ textAlign: "center", marginTop: 20 }}>
          <button className="btn ghost" onClick={more}>Cargar más</button>
        </div>
      )}
    </div>
  );
}
