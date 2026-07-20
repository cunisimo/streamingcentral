"use client";
import { useEffect, useRef, useState } from "react";
import { usePlatforms } from "../PlatformsContext";
import type { UITitle } from "@/lib/types";

// Mismo patrón de debounce que SearchView (250ms, desde 2 caracteres). Usa
// /api/search (multi, sin filtrar por plataforma), pero acá sólo se puede
// AGREGAR un título si está en alguna de tus plataformas: no tiene sentido
// desempatar entre algo que no podés ver. Los no disponibles se muestran
// atenuados y bloqueados.
export default function DesempateManualSearch({
  onAdd, isSelected, full,
}: {
  onAdd: (t: UITitle) => void;
  isSelected: (t: UITitle) => boolean;
  full: boolean;
}) {
  const { platforms } = usePlatforms();
  const [q, setQ] = useState("");
  const [titles, setTitles] = useState<UITitle[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const available = (t: UITitle) => t.platforms.some((p) => platforms.includes(p));

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setTitles([]); setLoading(false); return; }
    if (timer.current) clearTimeout(timer.current);
    setLoading(true);
    timer.current = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}`)
        .then((r) => r.json())
        .then((j) => { setTitles(j.titles ?? []); setLoading(false); })
        .catch(() => setLoading(false));
    }, 250);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q]);

  return (
    <div className="dsmp-manual">
      <div className="dsmp-search">
        <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscá una película o serie…"
          autoFocus
        />
      </div>
      {!platforms.length && (
        <p className="empty-note">Activá al menos una plataforma (botón de arriba) para poder cargar títulos.</p>
      )}
      {loading && <p className="loading">Buscando…</p>}
      {!loading && q.trim().length >= 2 && titles.length === 0 && (
        <p className="empty-note">Sin resultados para “{q}”.</p>
      )}
      {titles.length > 0 && (
        <div className="dsmp-picks">
          {titles.map((t) => {
            const sel = isSelected(t);
            const avail = available(t);
            const disabled = sel || full || !avail;
            return (
              <button
                key={`${t.type}-${t.id}`}
                className={`dsmp-pick ${sel ? "is-sel" : ""} ${!avail ? "is-off" : ""}`}
                disabled={disabled}
                onClick={() => onAdd(t)}
                title={avail ? t.title : `${t.title} — no está en tus plataformas`}
              >
                <span
                  className="dsmp-pick-poster"
                  style={t.poster ? { backgroundImage: `url(${t.poster})` } : { background: "#3A3A42" }}
                >
                  {!t.poster && <span className="dsmp-pick-txt">{t.title}</span>}
                  {sel && <span className="dsmp-pick-check">✓</span>}
                  {!avail && <span className="dsmp-pick-off">No en tus plataformas</span>}
                </span>
                <span className="dsmp-pick-name">{t.title}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
