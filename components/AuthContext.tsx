"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { createClient, type Session, type User } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase";
import type { EleccionAvatar } from "@/lib/avatares";
import {
  cambiarPassword, hayTokensDeRecuperacion,
  type RecuperacionAceptada, type Resultado as ResultadoRecuperacion,
} from "@/lib/recuperacion";

export interface Profile {
  id: string;
  display_name: string | null;
  is_admin: boolean;
  avatar_seed: string | null;
  avatar_style: string | null;
  onboarding_completed: boolean;
  platforms: number[];
  country_code: string;
}

interface Ctx {
  user: User | null;
  profile: Profile | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, displayName: string) => Promise<{ error?: string; needsConfirm?: boolean }>;
  signOut: () => Promise<void>;
  updateDisplayName: (name: string) => Promise<{ error?: string }>;
  // Recibe el objeto entero, no dos strings sueltos: los valores los arma
  // `eleccionAvatar` (lib/avatares.ts), que es la fuente única de lo que se
  // persiste. Con dos parámetros del mismo tipo, además, invertirlos compilaba.
  updateAvatar: (eleccion: EleccionAvatar) => Promise<{ error?: string }>;
  resetPassword: (email: string) => Promise<{ error?: string }>;
  /**
   * La recuperación que Supabase ACEPTÓ en esta pestaña, o `null`. Sale del
   * evento `PASSWORD_RECOVERY`, que auth-js emite sólo después de validar el
   * token del enlace contra el servidor. Es la única prueba que vale. Ver #22.
   */
  recuperacion: RecuperacionAceptada | null;
  /**
   * Cambia la contraseña de la cuenta de `recuperacion`, y de ninguna otra: la
   * escritura va con esos tokens en un cliente aislado, no con la sesión que
   * tenga el singleton en ese momento. Sin recuperación aceptada, no escribe.
   */
  cambiarPasswordDeRecuperacion: (password: string) => Promise<ResultadoRecuperacion>;
  /** Cambio de contraseña con la sesión ABIERTA (configuración). No para recuperar. */
  updatePassword: (password: string) => Promise<{ error?: string }>;
  updatePlatforms: (ids: number[]) => Promise<{ error?: string }>;
  completeOnboarding: () => Promise<{ error?: string }>;
}
const AuthCtx = createContext<Ctx | null>(null);

async function loadProfile(user: User): Promise<Profile | null> {
  const { data } = await supabaseBrowser()
    .from("profiles")
    .select("id, display_name, is_admin, avatar_seed, avatar_style, onboarding_completed, platforms, country_code")
    .eq("id", user.id)
    .maybeSingle();
  // El nombre elegido al registrarse queda también en el metadata de auth.
  // Lo usamos como respaldo para no volver a pedirlo si el perfil no lo tiene
  // (registro previo al trigger, o fila de perfil todavía no creada).
  const metaName = (user.user_metadata?.display_name as string | undefined) || null;
  if (data) {
    const p = data as Profile;
    if (!p.display_name && metaName) {
      // Backfill silencioso para que la próxima vez ya venga del perfil.
      void supabaseBrowser().from("profiles").update({ display_name: metaName }).eq("id", user.id);
      return { ...p, display_name: metaName };
    }
    return p;
  }
  return metaName ? { id: user.id, display_name: metaName, is_admin: false, avatar_seed: user.id, avatar_style: null, onboarding_completed: true, platforms: [], country_code: "AR" } : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const [recuperacion, setRecuperacion] = useState<RecuperacionAceptada | null>(null);

  useEffect(() => {
    // ⚠️ ANTES de crear el cliente: auth-js borra el fragmento en cuanto acepta
    // los tokens. Con esto se decide si `ready` tiene que ESPERAR (ver abajo).
    const esperarRecuperacion = hayTokensDeRecuperacion(window.location.hash, window.location.search);

    const sb = supabaseBrowser();
    let alive = true;

    async function sync(session: Session | null) {
      const u = session?.user ?? null;
      if (!alive) return;
      setUser(u);
      setProfile(u ? await loadProfile(u) : null);
    }

    // `ready` con `getSession()`, como siempre — salvo que la URL traiga tokens
    // de recuperación. Ahí `ready` llegaría UN TICK ANTES que `PASSWORD_RECOVERY`
    // (auth-js lo emite con `setTimeout(0)` después de terminar de inicializar)
    // y la página mostraría "enlace inválido" un instante antes del formulario.
    sb.auth.getSession().then(({ data }) => {
      void sync(data.session);
      if (alive && !esperarRecuperacion) setReady(true);
    });

    const { data: sub } = sb.auth.onAuthStateChange((evento, session) => {
      if (!alive) return;
      if (evento === "PASSWORD_RECOVERY" && session) {
        // La ACEPTACIÓN. auth-js 2.108.2 llega acá sólo después de que el
        // servidor validó el access_token del enlace (`_getUser`), y con la
        // sesión que ese servidor devolvió. Un token basura, vencido o consumido
        // nunca emite esto. Es la única prueba de recuperación que se acepta.
        setRecuperacion({
          userId: session.user.id,
          email: session.user.email ?? null,
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
        });
        setReady(true);
      }
      if (evento === "INITIAL_SESSION" && esperarRecuperacion) {
        // Había tokens y Supabase terminó de inicializar. Si los aceptó, el
        // `PASSWORD_RECOVERY` ya está en la cola de timers —se programó ANTES
        // que este— y llega primero. Si no los aceptó, no llega nada, y este
        // tick es lo que deja a la página decir que el enlace no sirvió.
        setTimeout(() => { if (alive) setReady(true); }, 0);
      }
      void sync(session);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    return error ? { error: error.message } : {};
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    const { data, error } = await supabaseBrowser().auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
    if (error) return { error: error.message };
    // Con "Confirm email" activo en Supabase no viene sesión hasta que el
    // usuario confirma por mail; se lo avisamos en la UI.
    return { needsConfirm: !data.session };
  }, []);

  const signOut = useCallback(async () => {
    await supabaseBrowser().auth.signOut();
  }, []);

  // Manda el mail de recuperación. El link vuelve a /cuenta/reset, donde
  // Supabase (detectSessionInUrl) canjea el token por una sesión temporal
  // de recovery y ahí se setea la clave nueva con updatePassword.
  //
  // El destino sale de NEXT_PUBLIC_SITE_URL, NO de window.location.origin: con
  // el origin, el link del mail apunta a donde se pidió el reset. Pedirlo desde
  // localhost mandaba a un usuario real un mail con link a http://localhost:3000,
  // una máquina a la que no tiene acceso. Sin la variable (desarrollo) cae al
  // origin, que ahí sí es lo que se quiere.
  //
  // OJO: el destino además tiene que estar en la allowlist de Redirect URLs del
  // proyecto en Supabase. Si no está, Supabase lo descarta en silencio y usa el
  // Site URL — que es exactamente cómo se rompió esto la primera vez.
  const resetPassword = useCallback(async (email: string) => {
    const base = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "")
      || (typeof window !== "undefined" ? window.location.origin : "");
    const redirectTo = base ? `${base}/cuenta/reset` : undefined;
    const { error } = await supabaseBrowser().auth.resetPasswordForEmail(email, { redirectTo });
    return error ? { error: error.message } : {};
  }, []);

  // Cambio de contraseña con la sesión abierta, desde configuración. NO se usa
  // para recuperar: para eso está `cambiarPasswordDeRecuperacion`, que no
  // depende de qué sesión tenga el singleton.
  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabaseBrowser().auth.updateUser({ password });
    return error ? { error: error.message } : {};
  }, []);

  // La escritura de la recuperación, ATADA a lo que Supabase aceptó.
  //
  // CLIENTE AISLADO, mismo patrón y mismas tres opciones que
  // `lib/eliminar-cuenta.ts`: nace con los tokens de la recuperación y muere con
  // la escritura. `persistSession: false` no guarda nada; `autoRefreshToken:
  // false` no deja un temporizador vivo; `detectSessionInUrl: false` no vuelve a
  // leer la barra.
  //
  // 🔴 POR QUÉ NO `supabaseBrowser().auth.updateUser`: ese cliente escribe sobre
  // "la sesión que tenga AHORA". Si otra pestaña entró como otra cuenta entre
  // abrir el formulario y pulsar Guardar, ahora es esa otra cuenta — y la
  // comparación posterior llegaría tarde, con la contraseña ya cambiada. Con el
  // cliente aislado la cuenta la fija el token, no el momento. Cero escrituras
  // sobre otra cuenta, por construcción.
  const cambiarPasswordDeRecuperacion = useCallback(async (password: string) => {
    const resultado = await cambiarPassword({
      escribirCon: async (r, pass) => {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
        const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
        const aislado = createClient(url, anon, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        });
        const s = await aislado.auth.setSession({ access_token: r.accessToken, refresh_token: r.refreshToken });
        if (s.error) return { userId: null, error: s.error.message };
        const { data, error } = await aislado.auth.updateUser({ password: pass });
        if (error) return { userId: null, error: error.message };
        return { userId: data.user?.id ?? null };
      },
    }, recuperacion, password);
    // Una recuperación se usa UNA vez. Con éxito o con fallo de identidad, ya no
    // sirve para otra escritura desde esta pestaña.
    if (resultado.ok || resultado.motivo === "identidad") setRecuperacion(null);
    return resultado;
  }, [recuperacion]);

  const updateDisplayName = useCallback(async (name: string) => {
    if (!user) return { error: "No hay sesión" };
    const sb = supabaseBrowser();
    const { error } = await sb.from("profiles").update({ display_name: name }).eq("id", user.id);
    if (error) return { error: error.message };
    // Espejamos el nombre en el metadata de auth para tenerlo siempre a mano
    // en el próximo login sin depender de la fila de perfil.
    void sb.auth.updateUser({ data: { display_name: name } });
    setProfile((p) => (p ? { ...p, display_name: name } : { id: user.id, display_name: name, is_admin: false, avatar_seed: user.id, avatar_style: null, onboarding_completed: true, platforms: [], country_code: "AR" }));
    return {};
  }, [user]);

  const updateAvatar = useCallback(async (eleccion: EleccionAvatar) => {
    if (!user) return { error: "No hay sesión" };
    const { avatar_seed, avatar_style } = eleccion;
    const sb = supabaseBrowser();
    const { error } = await sb.from("profiles").update({ avatar_seed, avatar_style }).eq("id", user.id);
    if (error) return { error: error.message };
    setProfile((p) => (p ? { ...p, avatar_seed, avatar_style } : { id: user.id, display_name: null, is_admin: false, avatar_seed, avatar_style, onboarding_completed: true, platforms: [], country_code: "AR" }));
    return {};
  }, [user]);

  const updatePlatforms = useCallback(async (ids: number[]) => {
    if (!user) return { error: "No hay sesión" };
    const { error } = await supabaseBrowser().from("profiles").update({ platforms: ids }).eq("id", user.id);
    if (error) return { error: error.message };
    setProfile((p) => (p ? { ...p, platforms: ids } : p));
    return {};
  }, [user]);

  const completeOnboarding = useCallback(async () => {
    if (!user) return { error: "No hay sesión" };
    const { error } = await supabaseBrowser().from("profiles").update({ onboarding_completed: true }).eq("id", user.id);
    if (error) return { error: error.message };
    setProfile((p) => (p ? { ...p, onboarding_completed: true } : p));
    return {};
  }, [user]);

  return (
    <AuthCtx.Provider value={{ user, profile, ready, recuperacion, signIn, signUp, signOut, updateDisplayName, updateAvatar, resetPassword, cambiarPasswordDeRecuperacion, updatePassword, updatePlatforms, completeOnboarding }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth fuera del provider");
  return ctx;
}
