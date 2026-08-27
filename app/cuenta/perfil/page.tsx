"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import AvatarPicker from "@/components/avatar/AvatarPicker";
import { useAuth } from "@/components/AuthContext";
import dynamic from "next/dynamic";

// PANEL DE DIAGNOSTICO TEMPORAL — issue #15. NO entra en el merge final: vive en
// la rama diag/panel. Entra por dynamic y con ssr:false, asi que su codigo NO
// viaja al navegador salvo que se pida con ?diagnostico=avatares.
const PanelTraza = dynamic(() => import("@/components/diagnostico/PanelTraza"), { ssr: false });

export default function PerfilPage() {
  const { user, profile, ready, updateDisplayName, signOut } = useAuth();
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  // Se lee de window y no con useSearchParams para no arrastrar un Suspense a
  // una pagina que hoy no lo necesita. Es temporal.
  const [diagnostico, setDiagnostico] = useState(false);

  useEffect(() => {
    setDiagnostico(new URLSearchParams(window.location.search).get("diagnostico") === "avatares");
  }, []);

  useEffect(() => { if (ready && profile) setNombre(profile.display_name ?? ""); }, [ready, profile]);
  useEffect(() => { if (ready && !user) router.replace("/cuenta"); }, [ready, user, router]);

  if (!ready || !user) {
    return (<><TopBar /><main><div className="admin"><p className="loading">Cargando…</p></div></main><BottomNav /></>);
  }

  async function guardarNombre() {
    setBusy(true); setErr(""); setOk("");
    const { error } = await updateDisplayName(nombre.trim());
    setBusy(false);
    if (error) { setErr(error); return; }
    setOk("Guardado.");
  }

  return (
    <>
      <TopBar />
      <main>
        <div className="admin" style={{ maxWidth: 480 }}>
          <Link href="/cuenta" className="back"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>Volver</Link>
          <h1>Mi perfil</h1>
          <p className="section-sub">{user.email}</p>

          <AvatarPicker />

          <div className="field">
            <label>Nombre para mostrar</label>
            <input value={nombre} onChange={(e) => { setNombre(e.target.value); setOk(""); }} type="text" />
          </div>

          {err && <p style={{ color: "var(--editorial)", marginTop: 12, fontSize: 14 }}>{err}</p>}
          {ok && <p style={{ color: "var(--accent)", marginTop: 12, fontSize: 14 }}>{ok}</p>}

          <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
            <button className="btn" onClick={guardarNombre} disabled={busy || nombre.trim() === (profile?.display_name ?? "")}>
              {busy ? "Guardando…" : "Guardar nombre"}
            </button>
            <button className="btn ghost" onClick={signOut}>Cerrar sesión</button>
          </div>
        </div>
      </main>
      <BottomNav />
      {diagnostico && <PanelTraza />}
    </>
  );
}
