"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/components/AuthContext";
import PasswordInput from "@/components/PasswordInput";
import { leerEnlace, decidirPantalla, sujetoDelToken } from "@/lib/recuperacion";

// A esta página se llega desde el enlace del mail de recuperación. Supabase
// (detectSessionInUrl) canjea el token del hash por una sesión de recovery al
// montar, y recién ahí se habilita el formulario.
//
// ============================================================================
// 🔴 UNA SESIÓN ABIERTA NO ES UNA PRUEBA DE RECUPERACIÓN
// ============================================================================
// La versión anterior decidía con `ready && !user`: si había CUALQUIER sesión en
// el navegador, mostraba el formulario. Reproducido el 2026-09-10 con dos
// cuentas de prueba: con una sesión de la cuenta A abierta y un enlace YA
// CONSUMIDO de la cuenta B, la página ignoraba el error del enlace, ofrecía el
// formulario para A, decía "Listo, tu contraseña se actualizó" y le cambiaba la
// contraseña a A. B quedaba intacta.
//
// Eso explica el síntoma reportado —"la web dijo que salió bien y después no
// puedo entrar"—: la contraseña sí cambió, pero en otra cuenta.
//
// Las reglas viven en `lib/recuperacion.ts`, que es puro y tiene tests. Acá sólo
// se cablean.
export default function ResetPassword() {
  const { user, ready, updatePassword } = useAuth();
  const router = useRouter();

  // ⚠️ SE LEE EN EL RENDER, NO EN UN EFECTO, y el orden importa: Supabase borra
  // el fragmento en cuanto lo procesa, y su arranque vive en un efecto del
  // `AuthProvider`. Los efectos corren después del render de los hijos, así que
  // este inicializador ve la URL entera; un `useEffect` acá llegaría tarde.
  const [enlace] = useState(() =>
    typeof window === "undefined"
      ? ({ tipo: "nada" } as const)
      : leerEnlace(window.location.hash, window.location.search));
  const [sujeto] = useState(() =>
    enlace.tipo === "recuperacion" ? sujetoDelToken(enlace.accessToken) : null);

  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const pantalla = decidirPantalla({
    ready, enlace, usuarioId: user?.id ?? null, sujetoDelEnlace: sujeto,
  });

  async function guardar() {
    setErr("");
    if (pass.length < 6) { setErr("La contraseña tiene que tener al menos 6 caracteres."); return; }
    if (pass !== pass2) { setErr("Las contraseñas no coinciden."); return; }
    setBusy(true);
    const { error, usuarioId } = await updatePassword(pass);
    setBusy(false);
    if (error) { setErr(error); return; }
    // 🔴 NO SE FESTEJA SIN CONFIRMAR SOBRE QUÉ CUENTA SE ESCRIBIÓ. El éxito
    // antes era "no hubo error", y eso es lo que hacía creíble un cambio hecho
    // en la cuenta equivocada. Supabase devuelve el usuario actualizado: si no
    // es el del enlace, esto no salió bien aunque no haya tirado error.
    const esperado = sujeto ?? user?.id ?? null;
    if (!usuarioId || (esperado && usuarioId !== esperado)) {
      setErr("No pudimos confirmar sobre qué cuenta se guardó el cambio. "
        + "Por seguridad no lo damos por hecho: pedí la recuperación de nuevo.");
      return;
    }
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
            // Antes acá se mostraba el formulario si había sesión. Ese era el bug.
            aviso("Para elegir una contraseña nueva entrá desde el enlace que te "
              + "mandamos por mail. Si ya tenés la sesión abierta, podés cambiarla "
              + "desde la configuración de tu cuenta.")
          ) : pantalla.vista === "identidad" ? (
            aviso("Este enlace es de otra cuenta distinta de la que tenés abierta en "
              + "este navegador. Cerrá la sesión y volvé a abrir el enlace del mail.")
          ) : (
            <>
              <p className="section-sub">Elegí una contraseña nueva para {user!.email}.</p>
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
