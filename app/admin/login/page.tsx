"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true); setErr("");
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password: pass });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    router.push("/admin");
  }

  return (
    <div className="admin" style={{ maxWidth: 420 }}>
      <h1>Ingresar</h1>
      <p className="section-sub">Dashboard editorial de StreamingCentral</p>
      <div className="field"><label>Email</label><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" /></div>
      <div className="field"><label>Contraseña</label><input value={pass} onChange={(e) => setPass(e.target.value)} type="password" onKeyDown={(e) => e.key === "Enter" && submit()} /></div>
      {err && <p style={{ color: "var(--editorial)", marginTop: 12, fontSize: 14 }}>{err}</p>}
      <div style={{ marginTop: 20 }}><button className="btn" onClick={submit} disabled={busy}>{busy ? "Ingresando…" : "Ingresar"}</button></div>
    </div>
  );
}
