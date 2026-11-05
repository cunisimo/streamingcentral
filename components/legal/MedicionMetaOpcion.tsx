"use client";
import { useEffect, useState } from "react";
import { cambiarMedicionMeta, hayMedicionMeta, leerMedicionMeta, MEDICION_META } from "@/lib/medicion-meta";

// La opción de Sobre Yump que apaga o prende la medición de Meta. Va dentro de
// SobreYump, así que se ve con y sin cuenta. Sólo en la app Android: en la web
// no hay SDK de Meta que controlar. Ver lib/medicion-meta.ts.
export default function MedicionMetaOpcion() {
  // null mientras se lee la elección del teléfono: el interruptor no se dibuja
  // en un estado que todavía no se sabe.
  const [activa, setActiva] = useState<boolean | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!hayMedicionMeta()) return;
    let vigente = true;
    leerMedicionMeta().then((v) => {
      if (!vigente) return;
      if (v === null) setError(true);
      else setActiva(v);
    });
    return () => { vigente = false; };
  }, []);

  if (!hayMedicionMeta()) return null;

  async function alternar() {
    if (activa === null || ocupado) return;
    setOcupado(true);
    setError(false);
    const quedo = await cambiarMedicionMeta(!activa);
    setOcupado(false);
    if (quedo === null) setError(true);
    else setActiva(quedo);
  }

  return (
    <div className="cfg-row sy-meta">
      <div className="cfg-info">
        <div className="cfg-lbl" id="sy-meta-lbl">{MEDICION_META.TITULO}</div>
        <div className="cfg-sub" id="sy-meta-sub">{MEDICION_META.EXPLICACION}</div>
        {error && <div className="cfg-sub sy-meta-err">No pudimos cambiar la opción. Probá de nuevo.</div>}
      </div>
      {activa !== null && (
        <button
          type="button"
          className={`cfg-switch ${activa ? "on" : ""}`}
          onClick={alternar}
          disabled={ocupado}
          role="switch"
          aria-checked={activa}
          aria-labelledby="sy-meta-lbl"
          aria-describedby="sy-meta-sub"
        >
          <span className="knob" />
          <span className="cfg-switch-lbl">{activa ? "Activada" : "Desactivada"}</span>
        </button>
      )}
    </div>
  );
}
