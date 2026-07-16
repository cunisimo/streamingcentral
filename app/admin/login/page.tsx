"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase";
import { useAuth } from "@/components/AuthContext";

export default function Login() {
  const router = useRouter();
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [recuperar, setRecuperar] = useState(false);

  async function submit() {
    setBusy(true); setErr(""); setOk("");
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password: pass });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    router.push("/admin");
  }

  async function enviarReset() {
    setBusy(true); setErr(""); setOk("");
    if (!email.trim()) { setBusy(false); setErr("Poné tu email."); return; }
    const { error } = await resetPassword(email.trim());
    setBusy(false);
    if (error) { setErr(error); return; }
    setOk("Si el email está registrado, te llega un enlace para elegir una nueva contraseña.");
  }

  return (
    <div className="admin" style={{ maxWidth: 420 }}>
      <h1>{recuperar ? "Recuperar contraseña" : "Ingresar"}</h1>
      <p className="section-sub">Dashboard editorial de StreamingCentral</p>
      <div className="field"><label>Email</label><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" onKeyDown={(e) => e.key === "Enter" && recuperar && enviarReset()} /></div>
      {!recuperar && (
        <div className="field"><label>Contraseña</label><input value={pass} onChange={(e) => setPass(e.target.value)} type="password" onKeyDown={(e) => e.key === "Enter" && submit()} /></div>
      )}
      {err && <p style={{ color: "var(--editorial)", marginTop: 12, fontSize: 14 }}>{err}</p>}
      {ok && <p style={{ color: "var(--accent)", marginTop: 12, fontSize: 14 }}>{ok}</p>}
      <div style={{ marginTop: 20 }}>
        <button className="btn" onClick={recuperar ? enviarReset : submit} disabled={busy}>
          {busy ? "Un momento…" : recuperar ? "Enviar enlace" : "Ingresar"}
        </button>
      </div>
      <p style={{ marginTop: 16, fontSize: 13 }}>
        <button
          type="button"
          onClick={() => { setRecuperar((r) => !r); setErr(""); setOk(""); }}
          style={{ background: "none", border: "none", color: recuperar ? "var(--accent)" : "var(--dim)", cursor: "pointer", fontSize: 13, fontFamily: "inherit", padding: 0 }}
        >
          {recuperar ? "Volver a ingresar" : "¿Olvidaste tu contraseña?"}
        </button>
      </p>
    </div>
  );
}
