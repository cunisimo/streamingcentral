"use client";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase";
import { clavesABorrar } from "@/lib/limpieza-local";

// "Eliminar cuenta" — la acción irreversible de Cuenta → Configuración.
//
// El nombre es literal a propósito: no dice "desactivar" ni "dar de baja". Lo
// que hace es borrar, y la palabra tiene que decir lo mismo que el efecto.
//
// EL ORDEN IMPORTA Y ES EL PUNTO DELICADO: primero el servidor, y recién si
// respondió 200 se cierra la sesión y se limpia el dispositivo. Al revés —o en
// paralelo— un fallo del servidor dejaría a la persona deslogueada, con el
// dispositivo limpio y la cuenta intacta: creyendo que se borró algo que sigue
// existiendo.
export default function EliminarCuenta({ email }: { email: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [password, setPassword] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cerrar = useCallback(() => {
    if (enviando) return;   // no se puede cancelar a mitad de camino
    setAbierto(false);
    setPassword("");
    setError(null);
  }, [enviando]);

  async function eliminar() {
    // Doble envío: el guard va PRIMERO, antes de cualquier await. El botón ya
    // está deshabilitado, pero un Enter repetido en el campo llega igual.
    if (enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const sb = supabaseBrowser();
      const { data } = await sb.auth.getSession();
      const token = data.session?.access_token;
      if (!token) { setError("Se cerró tu sesión. Volvé a entrar e intentá de nuevo."); setEnviando(false); return; }

      const r = await fetch("/api/cuenta/eliminar", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password }),
      });

      if (!r.ok) {
        // La cuenta y la sesión se quedan como estaban. Solo se muestra el
        // motivo, con un texto que diga qué hacer.
        const j = await r.json().catch(() => ({}));
        setError(mensaje(j?.error, j?.minutos));
        setEnviando(false);
        return;
      }

      // A partir de acá la cuenta YA no existe. Recién ahora se toca el
      // dispositivo.
      await sb.auth.signOut().catch(() => { /* la cuenta ya no está: el token no sirve */ });
      limpiarEstadoPersonal();
      router.replace("/");
    } catch {
      setError("No pudimos conectarnos. Revisá tu conexión e intentá de nuevo.");
      setEnviando(false);
    }
  }

  return (
    <>
      <div className="cfg-peligro">
        <div className="cfg-peligro-h">Zona de riesgo</div>
        <div className="cfg-row" style={{ borderBottom: "none" }}>
          <div className="cfg-info">
            <div className="cfg-lbl">Eliminar cuenta</div>
            <div className="cfg-sub">Se borra tu cuenta y todo lo tuyo. No se puede deshacer.</div>
          </div>
          <button className="cfg-danger-btn" onClick={() => setAbierto(true)}>Eliminar cuenta</button>
        </div>
      </div>

      {abierto && (
        <div className="dlg-backdrop" onClick={cerrar} role="presentation">
          <div className="dlg" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="dlg-elim-t">
            <h2 id="dlg-elim-t">Eliminar tu cuenta</h2>
            {/* Concreto y en el lenguaje de la app: no "sus datos asociados". */}
            <p className="dlg-sub">Se va a borrar para siempre:</p>
            <ul className="dlg-lista">
              <li>Tu cuenta y tu forma de entrar ({email})</li>
              <li>Tu nombre y tu avatar</li>
              <li>Tus votos</li>
              <li>Mi lista, Ya la vi y lo que descartaste</li>
              <li>Tu historial de fichas vistas</li>
            </ul>
            <p className="dlg-sub">
              <strong>Esto no se puede deshacer.</strong> Vas a poder seguir usando Yump sin
              cuenta, y tus plataformas elegidas se conservan en este dispositivo.
            </p>

            <label className="dlg-lbl" htmlFor="dlg-pass">Escribí tu contraseña para confirmar</label>
            <input
              id="dlg-pass"
              className="dlg-input"
              type="password"
              autoComplete="current-password"
              value={password}
              disabled={enviando}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && password && !enviando) void eliminar(); }}
            />
            {error && <p className="dlg-error" role="alert">{error}</p>}

            <div className="dlg-acciones">
              <button className="btn ghost" onClick={cerrar} disabled={enviando}>Cancelar</button>
              <button className="cfg-danger-btn" onClick={() => void eliminar()} disabled={enviando || !password}>
                {enviando ? "Eliminando…" : "Eliminar definitivamente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function mensaje(codigo: unknown, minutos: unknown): string {
  if (codigo === "password-invalida") return "La contraseña no es correcta.";
  if (codigo === "demasiados-intentos") {
    const m = typeof minutos === "number" ? minutos : 15;
    return `Demasiados intentos. Probá de nuevo en ${m} minuto${m === 1 ? "" : "s"}.`;
  }
  if (codigo === "sin-sesion") return "Se cerró tu sesión. Volvé a entrar e intentá de nuevo.";
  return "No pudimos eliminar la cuenta. Probá de nuevo en un rato.";
}

// Se borra lo PERSONAL y se conservan las preferencias del dispositivo — sobre
// todo las plataformas, para que la persona pueda seguir como invitada sin
// volver a configurar nada. Qué cae de cada lado vive en `lib/limpieza-local`,
// que es puro y tiene tests.
function limpiarEstadoPersonal() {
  for (const store of [localStorage, sessionStorage]) {
    try {
      for (const k of clavesABorrar(Object.keys(store))) store.removeItem(k);
    } catch { /* storage bloqueado: no rompe el flujo */ }
  }
}
