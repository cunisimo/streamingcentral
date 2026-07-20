"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/components/AuthContext";
import { useTheme } from "@/components/ThemeContext";
import { COUNTRIES } from "@/components/data";

const PAIS_KEY = "sc:pais";
const PAISES = [
  { code: "AR", flag: "🇦🇷", name: "Argentina" },
  ...Object.entries(COUNTRIES).map(([code, c]) => ({ code, flag: c.flag, name: c.name })),
];

export default function ConfiguracionPage() {
  const { user, ready } = useAuth();
  const { theme, toggle } = useTheme();
  const router = useRouter();
  const [pais, setPais] = useState("AR");

  useEffect(() => { if (ready && !user) router.replace("/cuenta"); }, [ready, user, router]);
  useEffect(() => {
    try { const p = localStorage.getItem(PAIS_KEY); if (p) setPais(p); } catch { /* noop */ }
  }, []);

  function elegirPais(code: string) {
    setPais(code);
    try { localStorage.setItem(PAIS_KEY, code); } catch { /* noop */ }
  }

  if (!ready || !user) {
    return (<><TopBar /><main><div className="admin"><p className="loading">Cargando…</p></div></main><BottomNav /></>);
  }

  const dark = theme === "dark";

  return (
    <>
      <TopBar />
      <main>
        <div className="admin" style={{ maxWidth: 480 }}>
          <Link href="/cuenta" className="back"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>Volver</Link>
          <h1>Configuración</h1>

          <div className="cfg-row">
            <div className="cfg-info">
              <div className="cfg-lbl">Tema</div>
              <div className="cfg-sub">Claro u oscuro</div>
            </div>
            <button className={`cfg-switch ${dark ? "on" : ""}`} onClick={toggle} role="switch" aria-checked={dark}>
              <span className="knob" />
              <span className="cfg-switch-lbl">{dark ? "Oscuro" : "Claro"}</span>
            </button>
          </div>

          <div className="cfg-row">
            <div className="cfg-info">
              <div className="cfg-lbl">País</div>
              <div className="cfg-sub">Por ahora se guarda tu preferencia; el catálogo sigue siendo Argentina.</div>
            </div>
            <select className="cfg-select" value={pais} onChange={(e) => elegirPais(e.target.value)}>
              {PAISES.map((p) => <option key={p.code} value={p.code}>{p.flag} {p.name}</option>)}
            </select>
          </div>

          <div className="cfg-row off">
            <div className="cfg-info">
              <div className="cfg-lbl">Idioma</div>
              <div className="cfg-sub">Español rioplatense. Más idiomas cuando esté el sistema de traducciones.</div>
            </div>
            <span className="cfg-soon">Próximamente</span>
          </div>
        </div>
      </main>
      <BottomNav />
    </>
  );
}
