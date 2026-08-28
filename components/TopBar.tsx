"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePlatforms } from "./PlatformsContext";
import PlatformLogo from "./PlatformLogo";
import { PLATFORMS } from "@/lib/providers-ar";
import type { PlatformCode } from "@/lib/types";

// Lista de plataformas del panel: fuente única = /api/providers (la misma que el
// onboarding). Si el fetch falla, cae a las 9 de providers-ar para no dejar el
// panel vacío (el header se usa siempre, a diferencia del onboarding).
const FALLBACK = PLATFORMS.map((p) => ({ code: p.code, name: p.name }));

export default function TopBar() {
  const { platforms, has, toggle } = usePlatforms();
  const [open, setOpen] = useState(false);
  const [fecha, setFecha] = useState("");
  const [rows, setRows] = useState<{ code: PlatformCode; name: string }[]>(FALLBACK);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/providers")
      .then((r) => r.json())
      .then((j: { providers?: { code: PlatformCode | null; name: string }[] }) => {
        const list = (j.providers ?? [])
          .filter((p): p is { code: PlatformCode; name: string } => !!p.code)
          .map((p) => ({ code: p.code, name: p.name }));
        if (alive && list.length) setRows(list);
      })
      .catch(() => { /* se queda con el fallback */ });
    return () => { alive = false; };
  }, []);

  // Fecha del día. Se calcula tras el montaje para evitar mismatch de hidratación
  // (server y cliente podrían renderizar en husos/momentos distintos).
  useEffect(() => {
    const f = new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
    setFecha(f.charAt(0).toUpperCase() + f.slice(1));
  }, []);

  return (
    <header className="topbar">
      <div className="topbar-top">
        <span className="topdate">{fecha}</span>
        <span className="regionflag" role="img" aria-label="Región: Argentina" title="Argentina">🇦🇷</span>
      </div>
      <div className="topbar-in">
        <Link href="/" className="brand" aria-label="Yump — inicio">
          <img className="brand-wm brand-wm-light" src="/brand/yump-wordmark-black.png" alt="" />
          <img className="brand-wm brand-wm-dark" src="/brand/yump-wordmark-white.png" alt="" />
        </Link>
        <div ref={ref} style={{ position: "relative", marginLeft: "auto" }}>
          <button className="platbtn" style={{ margin: 0 }} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>
            <span className="cap">Plataformas</span>
            {/* Puntitos NEUTROS: antes cada uno iba pintado con el color exacto de
                la marca (`platformByCode(p).color`), que es identidad ajena en la
                interfaz. Ahora todos usan el acento de Yump: siguen diciendo
                cuántas plataformas hay activas, que es para lo que están. */}
            <span className="av">{platforms.map((p) => <span key={p} />)}</span>
            <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg>
          </button>
          {open && (
            <div className="panel" onClick={(e) => e.stopPropagation()}>
              <h4>Tus plataformas — elegí una o varias</h4>
              {rows.map((p) => {
                // Siempre tiene que quedar al menos una: destildar la última
                // dejaría el catálogo entero vacío. `toggle` ya lo impide, pero
                // en silencio; acá se muestra por qué no se puede.
                const ultima = has(p.code) && platforms.length === 1;
                return (
                  <div
                    key={p.code}
                    className={`prow ${ultima ? "locked" : ""}`}
                    onClick={() => { if (!ultima) toggle(p.code); }}
                    title={ultima ? "Tenés que dejar al menos una plataforma" : undefined}
                  >
                    <div className="left"><PlatformLogo code={p.code} /></div>
                    <span className={`check ${has(p.code) ? "on" : ""}`}>
                      <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>
                    </span>
                  </div>
                );
              })}
              {platforms.length === 1 && (
                <p className="panel-hint">Dejá al menos una plataforma elegida.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
