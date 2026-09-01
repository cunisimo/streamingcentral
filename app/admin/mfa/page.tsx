"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase";
import { useAdminSesion } from "@/components/admin/useAdminSesion";

// Alta y verificación del segundo factor del administrador.
//
// ============================================================================
// DOS FACTORES, NO UNO
// ============================================================================
// El plan exige un TOTP **de respaldo**, y no es burocracia: si el único
// teléfono con el autenticador se pierde, sin segundo factor la cuenta queda
// sin poder escribir NADA —ni siquiera para arreglarlo—, porque las policies de
// RLS exigen `aal2` y no hay forma de saltearlas desde la app.
//
// El respaldo se registra en otro dispositivo, o en el gestor de contraseñas.
//
// ⚠️ El QR lo genera Supabase y viene como un `data:` URI en la respuesta: no
// hay ninguna petición a un tercero para dibujarlo. Es el mismo criterio que
// los avatares propios (ver docs/AVATARES.md).
export default function MfaPage() {
  const router = useRouter();
  const { estado, factores, refrescar } = useAdminSesion();
  const [qr, setQr] = useState<string | null>(null);
  const [secreto, setSecreto] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // --- alta de un factor nuevo ---
  const inscribir = useCallback(async () => {
    setError(null); setOcupado(true);
    try {
      const sb = supabaseBrowser();
      const { data, error } = await sb.auth.mfa.enroll({
        factorType: "totp",
        // El nombre distingue el principal del respaldo en la lista de factores.
        friendlyName: `Yump admin ${factores + 1} · ${new Date().toISOString().slice(0, 10)}`,
      });
      if (error) throw error;
      setQr(data.totp.qr_code);
      setSecreto(data.totp.secret);
      setFactorId(data.id);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally { setOcupado(false); }
  }, [factores]);

  // --- verificación del código ---
  const verificar = useCallback(async () => {
    setError(null); setOcupado(true);
    try {
      const sb = supabaseBrowser();
      // Un factor recién inscripto se verifica con su propio id; una sesión que
      // ya tiene factor y está en aal1 tiene que elevarse con el primero
      // verificado. Los dos casos usan challenge + verify.
      let id = factorId;
      if (!id) {
        const { data: lista } = await sb.auth.mfa.listFactors();
        id = (lista?.totp ?? []).find((f) => f.status === "verified")?.id ?? null;
      }
      if (!id) throw new Error("no hay ningún factor para verificar");
      const { data: ch, error: e1 } = await sb.auth.mfa.challenge({ factorId: id });
      if (e1) throw e1;
      const { error: e2 } = await sb.auth.mfa.verify({
        factorId: id, challengeId: ch.id, code: codigo.replace(/\s+/g, ""),
      });
      if (e2) throw e2;
      setQr(null); setSecreto(null); setFactorId(null); setCodigo("");
      await refrescar();
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally { setOcupado(false); }
  }, [codigo, factorId, refrescar]);

  useEffect(() => {
    // Con dos factores y la sesión ya elevada no queda nada que hacer acá.
    if (estado === "listo" && factores >= 2) router.replace("/admin");
  }, [estado, factores, router]);

  return (
    <div className="admin">
      <h1>Segundo factor</h1>

      <p className="admin-nota">
        Factores verificados: <strong>{factores}</strong>. Hacen falta <strong>dos</strong>:
        el que usás siempre y uno de respaldo en otro dispositivo. Si perdés el único,
        la cuenta queda sin poder publicar y no hay forma de saltearlo desde la app.
      </p>

      {estado === "falta-verificar" && !qr && (
        <section>
          <h2>Ingresá el código</h2>
          <p className="admin-nota">Tu sesión todavía está sin verificar.</p>
        </section>
      )}

      {qr && (
        <section>
          <h2>Escaneá este código</h2>
          {/* `qr_code` es un data: URI que genera Supabase. Sin petición saliente. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="Código QR para el autenticador" width={220} height={220} />
          <p className="admin-nota">
            Si no podés escanear, cargá esta clave a mano: <code>{secreto}</code>
          </p>
        </section>
      )}

      {(qr || estado === "falta-verificar") && (
        <section>
          <label htmlFor="totp">Código de seis dígitos</label>
          <input
            id="totp" inputMode="numeric" autoComplete="one-time-code" maxLength={7}
            value={codigo} onChange={(e) => setCodigo(e.target.value)}
          />
          <button type="button" onClick={verificar} disabled={ocupado || codigo.trim().length < 6}>
            Verificar
          </button>
        </section>
      )}

      {!qr && (
        <button type="button" onClick={inscribir} disabled={ocupado}>
          {factores === 0 ? "Registrar el primer factor" : "Registrar un factor de respaldo"}
        </button>
      )}

      {error && <p className="admin-error" role="alert">{error}</p>}
    </div>
  );
}
