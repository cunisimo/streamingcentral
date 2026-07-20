"use client";
import { useState } from "react";
import DesempatePanel from "./DesempatePanel";

// Banner promocional en Home (debajo de "6 para hoy"). Al abrir NO navega:
// despliega el panel inline (acordeón).
export default function DesempateBanner() {
  const [open, setOpen] = useState(false);
  return (
    <div className="dsmp">
      <button className={`dsmp-banner ${open ? "open" : ""}`} onClick={() => setOpen((v) => !v)}>
        <span className="dsmp-banner-ico" aria-hidden>🍀</span>
        <span className="dsmp-banner-txt">
          <span className="dsmp-banner-title">Desempate</span>
          <span className="dsmp-banner-sub">¿No te decidís? Jugá Desempate y que la suerte elija.</span>
        </span>
        <span className="dsmp-banner-cta">
          {open ? "Cerrar" : "Jugar"}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
        </span>
      </button>
      {open && <DesempatePanel onClose={() => setOpen(false)} />}
    </div>
  );
}
