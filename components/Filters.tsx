"use client";
import { useState, useRef, useEffect, useCallback } from "react";
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

// Cierra el desplegable al hacer click afuera. Lo comparten los dos filtros de
// esta fila; antes vivía duplicado dentro de CountryFilter.
function useCerrarAlClickearAfuera(cerrar: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) cerrar(); };
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, [cerrar]);
  return ref;
}

export function CountryFilter({ value, onChange }: { value: string | null; onChange: (c: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useCerrarAlClickearAfuera(useCallback(() => setOpen(false), []));
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

// Mismo desplegable que el de país. Las opciones las decide el llamador porque
// no son las mismas en películas que en series (ver DECADES en SearchView).
export function DecadeFilter({
  value, onChange, options,
}: { value: string | null; onChange: (d: string | null) => void; options: [string, string][] }) {
  const [open, setOpen] = useState(false);
  const ref = useCerrarAlClickearAfuera(useCallback(() => setOpen(false), []));
  const cur = options.find(([, v]) => v === value)?.[0] ?? "Todas";
  return (
    <div className="filterbar" ref={ref}>
      <button className="paisbtn" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>
        <span className="cap">Década:</span><b>{cur}</b>
        <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="panel panel-decada" onClick={(e) => e.stopPropagation()}>
          <h4>De qué época</h4>
          <div className="prow" onClick={() => { onChange(null); setOpen(false); }}>
            <div className="left">Todas las décadas</div>
          </div>
          {options.map(([label, val]) => (
            <div key={val} className="prow" onClick={() => { onChange(val); setOpen(false); }}>
              <div className="left">{label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
