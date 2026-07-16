"use client";
import { useState } from "react";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/components/AuthContext";

type Modo = "login" | "registro" | "recuperar";

export default function Cuenta() {
  const { user, profile, ready, signIn, signUp, signOut, updateDisplayName, resetPassword } = useAuth();

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
            <Acceso signIn={signIn} signUp={signUp} resetPassword={resetPassword} />
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
  resetPassword,
}: {
  signIn: (e: string, p: string) => Promise<{ error?: string }>;
  signUp: (e: string, p: string, n: string) => Promise<{ error?: string; needsConfirm?: boolean }>;
  resetPassword: (e: string) => Promise<{ error?: string }>;
}) {
  const [modo, setModo] = useState<Modo>("login");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  const esRegistro = modo === "registro";
  const esRecuperar = modo === "recuperar";

  function irA(m: Modo) { setModo(m); setErr(""); setOk(""); }

  async function submit() {
    setBusy(true); setErr(""); setOk("");
    if (esRecuperar) {
      if (!email.trim()) { setBusy(false); setErr("Poné tu email."); return; }
      const { error } = await resetPassword(email.trim());
      setBusy(false);
      if (error) { setErr(error); return; }
      setOk("Si el email está registrado, te llega un enlace para elegir una nueva contraseña. Revisá tu casilla.");
    } else if (esRegistro) {
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

  const titulo = esRegistro ? "Crear cuenta" : esRecuperar ? "Recuperar contraseña" : "Ingresar";

  return (
    <>
      <h1>{titulo}</h1>
      <p className="section-sub">
        {esRegistro
          ? "Para votar, guardar lo que viste y armar tu grupo familiar."
          : esRecuperar
          ? "Te mandamos un enlace al mail para elegir una nueva contraseña."
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
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          onKeyDown={(e) => e.key === "Enter" && esRecuperar && submit()}
        />
      </div>
      {!esRecuperar && (
        <div className="field">
          <label>Contraseña</label>
          <input
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            type="password"
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>
      )}

      {!esRegistro && !esRecuperar && (
        <p style={{ marginTop: 10, fontSize: 13 }}>
          <button
            type="button"
            onClick={() => irA("recuperar")}
            style={{ background: "none", border: "none", color: "var(--dim)", cursor: "pointer", fontSize: 13, fontFamily: "inherit", padding: 0 }}
          >
            ¿Olvidaste tu contraseña?
          </button>
        </p>
      )}

      {err && <p style={{ color: "var(--editorial)", marginTop: 12, fontSize: 14 }}>{err}</p>}
      {ok && <p style={{ color: "var(--accent)", marginTop: 12, fontSize: 14 }}>{ok}</p>}

      <div style={{ marginTop: 20 }}>
        <button className="btn" onClick={submit} disabled={busy}>
          {busy ? "Un momento…" : esRegistro ? "Crear cuenta" : esRecuperar ? "Enviar enlace" : "Ingresar"}
        </button>
      </div>

      <p style={{ marginTop: 18, fontSize: 14, color: "var(--dim)" }}>
        {esRecuperar ? (
          <>
            ¿Te acordaste?{" "}
            <button
              type="button"
              onClick={() => irA("login")}
              style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 14, fontFamily: "inherit", padding: 0 }}
            >
              Volver a ingresar
            </button>
          </>
        ) : (
          <>
            {esRegistro ? "¿Ya tenés cuenta? " : "¿No tenés cuenta? "}
            <button
              type="button"
              onClick={() => irA(esRegistro ? "login" : "registro")}
              style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 14, fontFamily: "inherit", padding: 0 }}
            >
              {esRegistro ? "Ingresá" : "Registrate"}
            </button>
          </>
        )}
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
