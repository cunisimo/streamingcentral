"use client";
import { useState } from "react";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/components/AuthContext";

type Modo = "login" | "registro";

export default function Cuenta() {
  const { user, profile, ready, signIn, signUp, signOut, updateDisplayName } = useAuth();

  if (!ready) {
    return (<><TopBar /><main><div className="admin"><p className="loading">Cargando…</p></div></main><BottomNav /></>);
  }

  return (
    <>
      <TopBar />
      <main>
        <div className="admin" style={{ maxWidth: 420 }}>
          {user ? (
            <Perfil
              email={user.email ?? ""}
              displayName={profile?.display_name ?? ""}
              onSave={updateDisplayName}
              onSignOut={signOut}
            />
          ) : (
            <Acceso signIn={signIn} signUp={signUp} />
          )}
        </div>
      </main>
      <BottomNav />
    </>
  );
}

function Acceso({
  signIn,
  signUp,
}: {
  signIn: (e: string, p: string) => Promise<{ error?: string }>;
  signUp: (e: string, p: string, n: string) => Promise<{ error?: string; needsConfirm?: boolean }>;
}) {
  const [modo, setModo] = useState<Modo>("login");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  const esRegistro = modo === "registro";

  async function submit() {
    setBusy(true); setErr(""); setOk("");
    if (esRegistro) {
      if (nombre.trim().length < 2) { setBusy(false); setErr("Poné un nombre para mostrar."); return; }
      const { error, needsConfirm } = await signUp(email, pass, nombre.trim());
      setBusy(false);
      if (error) { setErr(error); return; }
      if (needsConfirm) setOk("Te mandamos un mail para confirmar la cuenta. Revisá tu casilla.");
      // Si no requiere confirmación, onAuthStateChange ya te deja adentro.
    } else {
      const { error } = await signIn(email, pass);
      setBusy(false);
      if (error) { setErr(error); return; }
      // Al entrar, el provider actualiza la sesión y esta pantalla pasa a Perfil.
    }
  }

  return (
    <>
      <h1>{esRegistro ? "Crear cuenta" : "Ingresar"}</h1>
      <p className="section-sub">
        {esRegistro
          ? "Para votar, guardar lo que viste y armar tu grupo familiar."
          : "Entrá a tu cuenta de StreamingCentral."}
      </p>

      {esRegistro && (
        <div className="field">
          <label>Nombre para mostrar</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} type="text" />
        </div>
      )}
      <div className="field">
        <label>Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
      </div>
      <div className="field">
        <label>Contraseña</label>
        <input
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          type="password"
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      </div>

      {err && <p style={{ color: "var(--editorial)", marginTop: 12, fontSize: 14 }}>{err}</p>}
      {ok && <p style={{ color: "var(--accent)", marginTop: 12, fontSize: 14 }}>{ok}</p>}

      <div style={{ marginTop: 20 }}>
        <button className="btn" onClick={submit} disabled={busy}>
          {busy ? "Un momento…" : esRegistro ? "Crear cuenta" : "Ingresar"}
        </button>
      </div>

      <p style={{ marginTop: 18, fontSize: 14, color: "var(--dim)" }}>
        {esRegistro ? "¿Ya tenés cuenta? " : "¿No tenés cuenta? "}
        <button
          type="button"
          onClick={() => { setModo(esRegistro ? "login" : "registro"); setErr(""); setOk(""); }}
          style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 14, fontFamily: "inherit", padding: 0 }}
        >
          {esRegistro ? "Ingresá" : "Registrate"}
        </button>
      </p>
    </>
  );
}

function Perfil({
  email,
  displayName,
  onSave,
  onSignOut,
}: {
  email: string;
  displayName: string;
  onSave: (name: string) => Promise<{ error?: string }>;
  onSignOut: () => Promise<void>;
}) {
  const [nombre, setNombre] = useState(displayName);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  async function guardar() {
    setBusy(true); setErr(""); setOk("");
    const { error } = await onSave(nombre.trim());
    setBusy(false);
    if (error) { setErr(error); return; }
    setOk("Guardado.");
  }

  return (
    <>
      <h1>Mi cuenta</h1>
      <p className="section-sub">{email}</p>

      <div className="field">
        <label>Nombre para mostrar</label>
        <input value={nombre} onChange={(e) => { setNombre(e.target.value); setOk(""); }} type="text" />
      </div>

      {err && <p style={{ color: "var(--editorial)", marginTop: 12, fontSize: 14 }}>{err}</p>}
      {ok && <p style={{ color: "var(--accent)", marginTop: 12, fontSize: 14 }}>{ok}</p>}

      <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
        <button className="btn" onClick={guardar} disabled={busy || nombre.trim() === displayName}>
          {busy ? "Guardando…" : "Guardar"}
        </button>
        <button className="btn ghost" onClick={onSignOut}>Cerrar sesión</button>
      </div>
    </>
  );
}
