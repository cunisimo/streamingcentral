"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase";

export interface Profile {
  id: string;
  display_name: string | null;
  is_admin: boolean;
}

interface Ctx {
  user: User | null;
  profile: Profile | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, displayName: string) => Promise<{ error?: string; needsConfirm?: boolean }>;
  signOut: () => Promise<void>;
  updateDisplayName: (name: string) => Promise<{ error?: string }>;
  resetPassword: (email: string) => Promise<{ error?: string }>;
  updatePassword: (password: string) => Promise<{ error?: string }>;
}
const AuthCtx = createContext<Ctx | null>(null);

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabaseBrowser()
    .from("profiles")
    .select("id, display_name, is_admin")
    .eq("id", userId)
    .single();
  return (data as Profile) ?? null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sb = supabaseBrowser();
    let alive = true;

    async function sync(session: Session | null) {
      const u = session?.user ?? null;
      if (!alive) return;
      setUser(u);
      setProfile(u ? await loadProfile(u.id) : null);
      if (alive) setReady(true);
    }

    sb.auth.getSession().then(({ data }) => sync(data.session));
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => { sync(session); });
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
  const resetPassword = useCallback(async (email: string) => {
    const redirectTo =
      typeof window !== "undefined" ? `${window.location.origin}/cuenta/reset` : undefined;
    const { error } = await supabaseBrowser().auth.resetPasswordForEmail(email, { redirectTo });
    return error ? { error: error.message } : {};
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabaseBrowser().auth.updateUser({ password });
    return error ? { error: error.message } : {};
  }, []);

  const updateDisplayName = useCallback(async (name: string) => {
    if (!user) return { error: "No hay sesión" };
    const { error } = await supabaseBrowser()
      .from("profiles")
      .update({ display_name: name })
      .eq("id", user.id);
    if (error) return { error: error.message };
    setProfile((p) => (p ? { ...p, display_name: name } : p));
    return {};
  }, [user]);

  return (
    <AuthCtx.Provider value={{ user, profile, ready, signIn, signUp, signOut, updateDisplayName, resetPassword, updatePassword }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth fuera del provider");
  return ctx;
}
