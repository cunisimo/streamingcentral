"use client";
import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";

// El estado de MFA del admin, y el token para hablarle a las APIs.
//
// ============================================================================
// QUÉ ES `aal` Y POR QUÉ SE MIRA ACÁ
// ============================================================================
// Supabase distingue dos niveles de garantía: `aal1` es email y contraseña,
// `aal2` es una sesión que además pasó por el TOTP. `getAuthenticatorAssurance
// Level()` devuelve el nivel actual y el que la cuenta EXIGE — si tenés un
// factor verificado, el exigido pasa a ser `aal2`.
//
// 🔴 ESTO ES SÓLO EXPERIENCIA DE USUARIO. La sesión vive en `localStorage`, así
// que el servidor no la ve: lo que este hook hace es no dibujar un dashboard
// que no vas a poder usar. Quien rechaza de verdad es `adminDeToken` en cada
// API y `is_admin_mfa()` en las policies. Ver `lib/admin-auth.ts`.
import { estadoDeMfa, type EstadoMfa as EstadoBase } from "@/lib/admin-auth-nucleo";

export type EstadoMfa = "cargando" | EstadoBase;

export interface AdminSesion {
  estado: EstadoMfa;
  /** El access token, para el header `Authorization: Bearer …`. */
  token: string | null;
  /** Cuántos factores TOTP verificados hay. El plan exige un segundo de respaldo. */
  factores: number;
  refrescar: () => Promise<void>;
}

export function useAdminSesion(): AdminSesion {
  const [estado, setEstado] = useState<EstadoMfa>("cargando");
  const [token, setToken] = useState<string | null>(null);
  const [factores, setFactores] = useState(0);

  const refrescar = useCallback(async () => {
    const sb = supabaseBrowser();
    const { data: ses } = await sb.auth.getSession();
    setToken(ses.session?.access_token ?? null);
    if (!ses.session) { setEstado("sin-factor"); return; }

    const { data: lista } = await sb.auth.mfa.listFactors();
    const verificados = (lista?.totp ?? []).filter((f) => f.status === "verified");
    setFactores(verificados.length);

    const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    // 🔴 LA DECISIÓN VIVE EN `estadoDeMfa`, NO ACÁ. Antes esto miraba sólo el
    // `aal`: con UN factor y la sesión elevada daba "listo", así que el layout
    // dejaba entrar mientras `/admin/mfa` insistía en que hacían falta dos. El
    // aviso quedaba como una sugerencia que nadie cumplía.
    setEstado(estadoDeMfa({
      factores: verificados.length,
      aal: aal?.currentLevel ?? null,
    }));
  }, []);

  useEffect(() => {
    void refrescar();
    // El token se renueva solo; sin escuchar esto, el dashboard seguiría
    // mandando el viejo y las APIs empezarían a devolver 401 sin motivo visible.
    const { data } = supabaseBrowser().auth.onAuthStateChange(() => { void refrescar(); });
    return () => data.subscription.unsubscribe();
  }, [refrescar]);

  return { estado, token, factores, refrescar };
}
