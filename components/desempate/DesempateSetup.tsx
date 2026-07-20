"use client";
import type { UITitle } from "@/lib/types";
import type { Mode } from "./useDesempate";
import { MAX_PICKS, MIN_PICKS } from "./useDesempate";
import DesempateManualSearch from "./DesempateManualSearch";
import DesempateFilterForm from "./DesempateFilterForm";

export default function DesempateSetup({
  mode, setMode, selected, add, remove, spin, keyOf,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
  selected: UITitle[];
  add: (t: UITitle) => void;
  remove: (key: string) => void;
  spin: () => void;
  keyOf: (t: { type: string; id: number }) => string;
}) {
  const full = selected.length >= MAX_PICKS;
  const canSpin = selected.length >= MIN_PICKS;
  const isSelected = (t: UITitle) => selected.some((s) => keyOf(s) === keyOf(t));

  return (
    <div className="dsmp-setup">
      <div className="dsmp-modes">
        <button className={`dsmp-mode ${mode === "manual" ? "on" : ""}`} onClick={() => setMode("manual")}>Manual</button>
        <button className={`dsmp-mode ${mode === "filtros" ? "on" : ""}`} onClick={() => setMode("filtros")}>Desde filtros</button>
      </div>

      {mode === "manual"
        ? <DesempateManualSearch onAdd={add} isSelected={isSelected} full={full} />
        : <DesempateFilterForm onAdd={add} isSelected={isSelected} full={full} />}

      <div className="dsmp-tray-head">Tu selección ({selected.length}/{MAX_PICKS})</div>
      <div className="dsmp-tray">
        {Array.from({ length: MAX_PICKS }).map((_, i) => {
          const t = selected[i];
          if (!t) return <div key={i} className="dsmp-slot-empty"><span>+</span></div>;
          return (
            <div key={keyOf(t)} className="dsmp-tray-item" style={t.poster ? { backgroundImage: `url(${t.poster})` } : { background: "#3A3A42" }}>
              {!t.poster && <span className="dsmp-tray-txt">{t.title}</span>}
              <button className="dsmp-tray-x" onClick={() => remove(keyOf(t))} aria-label={`Quitar ${t.title}`}>✕</button>
            </div>
          );
        })}
      </div>

      <div className="dsmp-actions">
        <button className="dsmp-spin-btn" onClick={spin} disabled={!canSpin}>
          🍀 ¡Tirar!
        </button>
        {!canSpin && <p className="dsmp-hint">Cargá al menos {MIN_PICKS} títulos para desempatar.</p>}
      </div>
    </div>
  );
}
