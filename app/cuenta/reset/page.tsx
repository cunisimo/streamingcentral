"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/components/AuthContext";
import PasswordInput from "@/components/PasswordInput";
import { leerEnlace, decidirPantalla, type RecuperacionAceptada } from "@/lib/recuperacion";

// A esta página se llega desde el enlace del mail de recuperación.
//
// ============================================================================
// 🔴 NI UNA SESIÓN ABIERTA NI LA URL SON PRUEBA DE RECUPERACIÓN
// ============================================================================
// La versión original decidía con `ready && !user`: cualquier sesión en el
// navegador habilitaba el formulario. Reproducido el 2026-09-10 con dos cuentas
// de prueba: con una sesión de A abierta y un enlace YA CONSUMIDO de B, la
// página ofrecía el formulario para A y le cambiaba la contraseña a A.
//
// La primera corrección decidía con `type=recovery` en la URL y con el `sub` de
// un JWT decodificado sin verificar. La auditoría lo desarmó:
// `#type=recovery&access_token=basura` con sesión abierta seguía habilitando el
// formulario.
//
// Ahora la única prueba es la ACEPTACIÓN de Supabase —el evento
// `PASSWORD_RECOVERY`, que llega sólo después de que el servidor validó el
// token— y la escritura va atada a esos tokens en un cliente aislado. Las reglas
// viven en `lib/recuperacion.ts`, que es puro y tiene tests; acá se cablean.
export default function ResetPassword() {
  const { ready, hayRecuperacionPendiente, reclamarRecuperacion, cambiarPasswordDeRecuperacion } = useAuth();
  const router = useRouter();

  // ⚠️ SE LEE EN EL RENDER, NO EN UN EFECTO: auth-js borra el fragmento apenas
  // acepta los tokens, y su arranque vive en un efecto del `AuthProvider`. El
  // inicializador de `useState` corre durante el render, antes de cualquier
  // efecto, así que ve la URL entera. Y lo que lee sólo sirve para dos cosas:
  // mostrar de inmediato un error que Supabase puso en la URL, y saber si vale
  // la pena esperar. NO habilita el formulario.
  const [enlace] = useState(() =>
    typeof window === "undefined"
      ? ({ tipo: "nada" } as const)
      : leerEnlace(window.location.hash, window.location.search));

  // La copia RECLAMADA por ESTA instancia. Muere con ella: al abandonar la
  // pantalla sin guardar no queda nada reutilizable. Y es inmune a lo que haga
  // el singleton después: si otra pestaña entra como otra cuenta, esta pantalla
  // sigue escribiendo sobre la cuenta del enlace.
  const [reclamada, setReclamada] = useState<RecuperacionAceptada | null>(null);
  useEffect(() => {
    // Se reclama UNA vez, cuando la pendiente exista: puede ser ya al montar, o
    // más tarde si este chunk cargó antes de que Supabase decidiera. Con una
    // URL en error, `reclamar` no devuelve nada y descarta la pendiente.
    if (reclamada || !hayRecuperacionPendiente) return;
    const r = reclamarRecuperacion(enlace);
    if (r) setReclamada(r);
  }, [hayRecuperacionPendiente, reclamada, enlace, reclamarRecuperacion]);

  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const pantalla = decidirPantalla({ ready, enlace, aceptada: reclamada });

  async function guardar() {
    setErr("");
    if (pass.length < 6) { setErr("La contraseña tiene que tener al menos 6 caracteres."); return; }
    if (pass !== pass2) { setErr("Las contraseñas no coinciden."); return; }
    setBusy(true);
    // Escribe con los tokens de la recuperación aceptada, y con nada más. Si no
    // hay recuperación aceptada, no escribe: ese es el contrato.
    const r = await cambiarPasswordDeRecuperacion(reclamada, pass);
    setBusy(false);
    if (!r.ok) {
      setErr(
        r.motivo === "sin-recuperacion"
          ? "Esta recuperación ya no está activa. Pedí un enlace nuevo desde tu cuenta."
          : r.motivo === "identidad"
            ? "No pudimos confirmar sobre qué cuenta se guardó el cambio. Por seguridad no lo damos por hecho: pedí la recuperación de nuevo."
            : (r.detalle ?? "No se pudo guardar la contraseña."),
      );
      return;
    }
    // Una recuperación se usa una vez: la copia local se suelta con el éxito.
    setReclamada(null);
    setOk(true);
    setTimeout(() => router.push("/cuenta"), 1600);
  }

  const aviso = (texto: string) => (
    <>
      <p className="section-sub">{texto}</p>
      <div style={{ marginTop: 20 }}>
        <Link href="/cuenta" className="btn">Ir a mi cuenta</Link>
      </div>
    </>
  );

  return (
    <>
      <TopBar />
      <main>
        <div className="admin" style={{ maxWidth: 420 }}>
          <h1>Nueva contraseña</h1>

          {ok ? (
            <p style={{ color: "var(--accent)", marginTop: 12, fontSize: 14 }}>
              Listo, tu contraseña se actualizó. Te llevamos a tu cuenta…
            </p>
          ) : pantalla.vista === "cargando" ? (
            <p className="loading">Cargando…</p>
          ) : pantalla.vista === "error" ? (
            aviso(pantalla.mensaje)
          ) : pantalla.vista === "sin-enlace" ? (
            aviso("Para elegir una contraseña nueva entrá desde el enlace que te "
              + "mandamos por mail. Si ya tenés la sesión abierta, podés cambiarla "
              + "desde la configuración de tu cuenta.")
          ) : (
            <>
              <p className="section-sub">
                Elegí una contraseña nueva para {pantalla.aceptada.email ?? "tu cuenta"}.
              </p>
              <PasswordInput
                label="Nueva contraseña"
                value={pass}
                onChange={setPass}
                autoComplete="new-password"
              />
              <PasswordInput
                label="Repetir contraseña"
                value={pass2}
                onChange={setPass2}
                onEnter={guardar}
                autoComplete="new-password"
              />
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
