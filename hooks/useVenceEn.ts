"use client";
import { useEffect, useState } from "react";
import { venceEnSeg, type RespuestaEstado } from "@/lib/sala/estado";

// Segundos hasta el plazo vigente de la sala, actualizados cada segundo y
// corregidos por el desfase del reloj. Sólo presentación: el que vence es el
// servidor (useSala relee 1 s después del plazo).
export function useVenceEn(estado: RespuestaEstado | null, desfase: number): number | null {
  const [seg, setSeg] = useState<number | null>(() => (estado ? venceEnSeg(estado, Date.now(), desfase) : null));
  useEffect(() => {
    if (!estado) { setSeg(null); return; }
    const tick = () => setSeg(venceEnSeg(estado, Date.now(), desfase));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [estado, desfase]);
  return seg;
}

/** `m:ss` para contadores de minutos; sólo segundos si es menos de un minuto. */
export function formatoSeg(s: number): string {
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60), r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}
