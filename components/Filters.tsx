"use client";
import { useState, useRef, useEffect } from "react";
import { GENRES, COUNTRIES } from "./data";

export function GenreSlider({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  return (
    <div className="chip-slider">
      {GENRES.map(([s, l]) => (
        <button key={s} className={`chip ${s === value ? "active" : ""}`} onClick={() => onChange(s)}>{l}</button>
      ))}
    </div>
  );
}

export function CountryFilter({ value, onChange }: { value: string | null; onChange: (c: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, []);
  const cur = value ? `${COUNTRIES[value]?.flag} ${COUNTRIES[value]?.name}` : "Todos";
  return (
    <div className="filterbar" ref={ref}>
      <button className="paisbtn" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>
        <span className="cap">País:</span><b>{cur}</b>
        <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="panel panel-pais" onClick={(e) => e.stopPropagation()}>
          <h4>De qué país</h4>
          <div className="prow" onClick={() => { onChange(null); setOpen(false); }}>
            <div className="left"><span className="flag">🌐</span>Todos los países</div>
          </div>
          {Object.entries(COUNTRIES).map(([c, v]) => (
            <div key={c} className="prow" onClick={() => { onChange(c); setOpen(false); }}>
              <div className="left"><span className="flag">{v.flag}</span>{v.name}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
