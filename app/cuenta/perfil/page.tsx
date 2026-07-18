"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import AvatarPicker from "@/components/AvatarPicker";
import { useAuth } from "@/components/AuthContext";

export default function PerfilPage() {
  const { user, profile, ready, updateDisplayName, updateAvatarSeed, signOut } = useAuth();
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

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

  async function elegirAvatar(seed: string) {
    setOk(""); setErr("");
    const { error } = await updateAvatarSeed(seed);
    if (error) setErr(error);
  }

  return (
    <>
      <TopBar />
      <main>
        <div className="admin" style={{ maxWidth: 480 }}>
          <Link href="/cuenta" className="back"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>Volver</Link>
          <h1>Mi perfil</h1>
          <p className="section-sub">{user.email}</p>

          <AvatarPicker current={profile?.avatar_seed ?? user.id} onPick={elegirAvatar} />

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
    </>
  );
}
