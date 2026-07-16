"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/components/AuthContext";

// A esta página se llega desde el enlace del mail de recuperación. Supabase
// (detectSessionInUrl) canjea el token del hash por una sesión temporal de
// recovery al montar; ahí el AuthProvider ya expone `user`, y con eso se
// habilita el form para elegir la clave nueva.
export default function ResetPassword() {
  const { user, ready, updatePassword } = useAuth();
  const router = useRouter();
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function guardar() {
    setErr("");
    if (pass.length < 6) { setErr("La contraseña tiene que tener al menos 6 caracteres."); return; }
    if (pass !== pass2) { setErr("Las contraseñas no coinciden."); return; }
    setBusy(true);
    const { error } = await updatePassword(pass);
    setBusy(false);
    if (error) { setErr(error); return; }
    setOk(true);
    setTimeout(() => router.push("/cuenta"), 1600);
  }

  return (
    <>
      <TopBar />
      <main>
        <div className="admin" style={{ maxWidth: 420 }}>
          <h1>Nueva contraseña</h1>

          {!ready ? (
            <p className="loading">Cargando…</p>
          ) : ok ? (
            <p style={{ color: "var(--accent)", marginTop: 12, fontSize: 14 }}>
              Listo, tu contraseña se actualizó. Te llevamos a tu cuenta…
            </p>
          ) : !user ? (
            <>
              <p className="section-sub">
                El enlace no es válido o ya venció. Volvé a pedir la recuperación desde tu cuenta.
              </p>
              <div style={{ marginTop: 20 }}>
                <Link href="/cuenta" className="btn">Ir a mi cuenta</Link>
              </div>
            </>
          ) : (
            <>
              <p className="section-sub">Elegí una contraseña nueva para {user.email}.</p>
              <div className="field">
                <label>Nueva contraseña</label>
                <input value={pass} onChange={(e) => setPass(e.target.value)} type="password" />
              </div>
              <div className="field">
                <label>Repetir contraseña</label>
                <input
                  value={pass2}
                  onChange={(e) => setPass2(e.target.value)}
                  type="password"
                  onKeyDown={(e) => e.key === "Enter" && guardar()}
                />
              </div>
              {err && <p style={{ color: "var(--editorial)", marginTop: 12, fontSize: 14 }}>{err}</p>}
              <div style={{ marginTop: 20 }}>
                <button className="btn" onClick={guardar} disabled={busy}>
                  {busy ? "Guardando…" : "Guardar contraseña"}
                </button>
              </div>
            </>
          )}
        </div>
      </main>
      <BottomNav />
    </>
  );
}
