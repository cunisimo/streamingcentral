"use client";
import type { Voto } from "@/lib/sala/estado";

// Los tres botones: No / Paso / Sí. SÓLO el ícono; el texto va en `aria-label`
// (con un lector de pantalla se anuncian "No", "Paso", "Sí"). Mismo trazo 1.8 y
// viewBox que `.act svg`. Mientras hay un `sala_votar` en vuelo llevan el
// atributo REAL `disabled`: es lo único que impide pulsaciones nuevas
// (`aria-disabled` puede acompañarlo, no reemplazarlo).
const ICO: Record<Voto, JSX.Element> = {
  no: <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>,
  pass: <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4l10 8-10 8V4zM19 5v14" /></svg>,
  yes: <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" /></svg>,
};
const ROTULO: Record<Voto, string> = { no: "No", pass: "Paso", yes: "Sí" };
const ORDEN: Voto[] = ["no", "pass", "yes"];

export default function BotonesVoto({ onVoto, disabled }: { onVoto: (v: Voto) => void; disabled: boolean }) {
  return (
    <div className="sala-votos" role="group" aria-label="Tu voto">
      {ORDEN.map((v) => (
        <button key={v} type="button" className={`act sala-act sala-act-${v}`} aria-label={ROTULO[v]}
          disabled={disabled} aria-disabled={disabled} onClick={() => onVoto(v)}>
          {ICO[v]}
        </button>
      ))}
    </div>
  );
}
