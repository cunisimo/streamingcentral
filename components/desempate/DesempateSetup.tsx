"use client";
import type { UITitle } from "@/lib/types";
import { MAX_PICKS, MIN_PICKS } from "./useDesempate";
import DesempateManualSearch from "./DesempateManualSearch";

// Un solo camino: buscás y cargás títulos a mano.
//
// El modo "Desde filtros" se sacó (19/08). Eran dos formas de llenar la misma
// bandeja y el selector obligaba a elegir antes de entender qué se estaba
// eligiendo. `DesempateFilterForm` se borró con él; si alguna vez vuelve, está
// en la historia de git.
export default function DesempateSetup({
  selected, add, remove, spin, keyOf,
}: {
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
      <DesempateManualSearch onAdd={add} isSelected={isSelected} full={full} />

      {/* La ayuda va acá, pegada al campo, y no abajo junto al botón: es una
          instrucción de lo que hay que HACER, y allá abajo aparecía a un scroll
          de distancia de la única acción que la resuelve. Desaparece sola
          cuando ya cargaste las dos. */}
      {!canSpin && <p className="dsmp-hint dsmp-hint-search">Cargá al menos {MIN_PICKS} títulos</p>}

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
      </div>
    </div>
  );
}
