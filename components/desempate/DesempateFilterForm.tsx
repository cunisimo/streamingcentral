"use client";
import { useState } from "react";
import { usePlatforms } from "../PlatformsContext";
import { GENRES } from "../data";
import type { MediaType, UITitle } from "@/lib/types";

const RUNTIMES: [string, string][] = [
  ["", "Cualquier duración"], ["short", "Cortas (< 90 min)"],
  ["mid", "Medias (90–150 min)"], ["long", "Largas (> 150 min)"],
];

const YEARS: string[] = (() => {
  const now = new Date().getFullYear();
  const arr: string[] = [];
  for (let y = now; y >= 1980; y--) arr.push(String(y));
  return arr;
})();

export default function DesempateFilterForm({
  onAdd, isSelected, full,
}: {
  onAdd: (t: UITitle) => void;
  isSelected: (t: UITitle) => boolean;
  full: boolean;
}) {
  const { platforms } = usePlatforms();
  const [tipo, setTipo] = useState<MediaType>("movie");
  const [genre, setGenre] = useState("todos");
  const [runtime, setRuntime] = useState("");
  const [year, setYear] = useState("");
  const [items, setItems] = useState<UITitle[] | null>(null);
  const [loading, setLoading] = useState(false);

  function generar() {
    if (!platforms.length) { setItems([]); return; }
    let url = `/api/discover?tipo=${tipo}&genre=${genre}&providers=${platforms.join(",")}`;
    if (runtime) url += `&runtime=${runtime}`;
    if (year) url += `&year=${year}`;
    setLoading(true);
    fetch(url)
      .then((r) => r.json())
      .then((j) => { setItems(j.items ?? []); setLoading(false); })
      .catch(() => { setItems([]); setLoading(false); });
  }

  return (
    <div className="dsmp-filters">
      <div className="dsmp-filter-row">
        <div className="dsmp-seg">
          <button className={tipo === "movie" ? "on" : ""} onClick={() => setTipo("movie")}>Películas</button>
          <button className={tipo === "tv" ? "on" : ""} onClick={() => setTipo("tv")}>Series</button>
        </div>
        <select className="cfg-select" value={genre} onChange={(e) => setGenre(e.target.value)}>
          {GENRES.map(([s, l]) => <option key={s} value={s}>{l}</option>)}
        </select>
        <select className="cfg-select" value={runtime} onChange={(e) => setRuntime(e.target.value)}>
          {RUNTIMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select className="cfg-select" value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="">Cualquier año</option>
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <button className="btn" onClick={generar} disabled={loading}>{loading ? "Generando…" : "Generar"}</button>
      </div>

      {!platforms.length && (
        <p className="empty-note">Activá al menos una plataforma (botón de arriba) para generar candidatos.</p>
      )}
      {items && !loading && items.length === 0 && platforms.length > 0 && (
        <p className="empty-note">Nada con esta combinación. Probá otro filtro.</p>
      )}
      {items && items.length > 0 && (
        <div className="dsmp-picks">
          {items.map((t) => {
            const sel = isSelected(t);
            const disabled = sel || full;
            return (
              <button
                key={`${t.type}-${t.id}`}
                className={`dsmp-pick ${sel ? "is-sel" : ""}`}
                disabled={disabled}
                onClick={() => onAdd(t)}
                title={t.title}
              >
                <span
                  className="dsmp-pick-poster"
                  style={t.poster ? { backgroundImage: `url(${t.poster})` } : { background: "#3A3A42" }}
                >
                  {!t.poster && <span className="dsmp-pick-txt">{t.title}</span>}
                  {sel && <span className="dsmp-pick-check">✓</span>}
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
