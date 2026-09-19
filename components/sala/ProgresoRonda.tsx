"use client";
import { formatoSeg } from "@/hooks/useVenceEn";

// Arriba de la card: en qué película estoy, cuánto queda del plazo global de
// la ronda (el del servidor) y los segundos de ESTA card. Los dos contadores son
// de presentación: el que vence es el servidor y el pass automático lo manda la
// vista al llegar a 0 local.
export default function ProgresoRonda({ pos, size, segRonda, segCard }: { pos: number; size: number; segRonda: number | null; segCard: number | null }) {
  return (
    <div className="sala-progreso">
      <span className="sala-progreso-pos">Película <strong>{pos + 1}</strong> de {size}</span>
      {segRonda !== null && <span className="sala-progreso-ronda" aria-live="off">Ronda: {formatoSeg(segRonda)}</span>}
      {segCard !== null && (
        <span className={`sala-progreso-card ${segCard <= 3 ? "urgente" : ""}`} role="timer" aria-live="off" aria-label={`${segCard} segundos para esta película`}>
          {segCard}
        </span>
      )}
      <div className="sala-progreso-barra" aria-hidden>
        <span style={{ width: `${Math.round((pos / size) * 100)}%` }} />
      </div>
    </div>
  );
}
