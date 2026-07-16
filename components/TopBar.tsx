"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePlatforms } from "./PlatformsContext";
import { useAuth } from "./AuthContext";
import PlatformLogo from "./PlatformLogo";
import { PLATFORMS, platformByCode } from "@/lib/providers-ar";

export default function TopBar() {
  const { platforms, has, toggle } = usePlatforms();
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, []);

  return (
    <header className="topbar">
      <div className="topbar-top">
        <Link href="/cuenta" className="acct-link" aria-label="Mi cuenta">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
          </svg>
          <span>{user ? (profile?.display_name || "Mi cuenta") : "Ingresar"}</span>
        </Link>
      </div>
      <div className="topbar-in">
        <Link href="/" className="brand">
          <span className="mk"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg></span>
          Streaming<span>Central</span>
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
