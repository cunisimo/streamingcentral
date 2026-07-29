"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePlatforms } from "./PlatformsContext";
import PlatformLogo from "./PlatformLogo";
import { PLATFORMS, platformByCode } from "@/lib/providers-ar";

export default function TopBar() {
  const { platforms, has, toggle } = usePlatforms();
  const [open, setOpen] = useState(false);
  const [fecha, setFecha] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
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
        <Link href="/buscar" className="acct-link" aria-label="Buscar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
          </svg>
        </Link>
      </div>
      <div className="topbar-in">
        <Link href="/" className="brand" aria-label="Yump — inicio">
          <img className="brand-wm brand-wm-light" src="/brand/yump-wordmark-black.png" alt="" />
          <img className="brand-wm brand-wm-dark" src="/brand/yump-wordmark-white.png" alt="" />
        </Link>
        <div ref={ref} style={{ position: "relative", marginLeft: "auto" }}>
          <button className="platbtn" style={{ margin: 0 }} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>
            <span className="cap">Plataformas</span>
            <span className="av">{platforms.map((p) => <span key={p} style={{ background: platformByCode(p)?.color }} />)}</span>
            <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg>
          </button>
          {open && (
            <div className="panel" onClick={(e) => e.stopPropagation()}>
              <h4>Tus plataformas — elegí una o varias</h4>
              {PLATFORMS.map((p) => (
                <div key={p.code} className="prow" onClick={() => toggle(p.code)}>
                  <div className="left"><PlatformLogo code={p.code} /></div>
                  <span className={`check ${has(p.code) ? "on" : ""}`}>
                    <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
