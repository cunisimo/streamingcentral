"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase";
import { useAuth } from "@/components/AuthContext";
import PasswordInput from "@/components/PasswordInput";
import { destinoSeguro } from "@/lib/admin-acceso";

// A dónde volver: la sección que se pidió (`?destino=/admin/top`), validada.
// Se lee de la barra en el cliente; sin `useSearchParams`, que obligaría a un
// <Suspense> en una página que se prerenderiza.
function destinoPedido(): string {
  if (typeof window === "undefined") return "/admin";
  return destinoSeguro(new URLSearchParams(window.location.search).get("destino"));
}

export default function Login() {
  const router = useRouter();
  const { resetPassword, user, ready } = useAuth();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [recuperar, setRecuperar] = useState(false);
  const [destino] = useState(destinoPedido);

  // Se navega cuando el CONTEXTO ya tiene al usuario, no apenas vuelve
  // `signInWithPassword`: así el layout lo recibe con el perfil marcado como
  // pendiente y espera los permisos en vez de decidir sin ellos. Cubre también
  // entrar al login con una sesión ya abierta.
  useEffect(() => {
    if (ready && user) router.replace(destino);
  }, [ready, user, destino, router]);

  async function submit() {
    setBusy(true); setErr(""); setOk("");
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password: pass });
    if (error) { setBusy(false); setErr(error.message); return; }
    // Sigue "Un momento…" hasta que el efecto de arriba navega.
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
      <p className="section-sub">Dashboard editorial de Yump</p>
      <div className="field"><label>Email</label><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" onKeyDown={(e) => e.key === "Enter" && recuperar && enviarReset()} /></div>
      {!recuperar && (
        <PasswordInput label="Contraseña" value={pass} onChange={setPass} onEnter={submit} />
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
