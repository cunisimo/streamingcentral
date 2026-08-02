"use client";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../AuthContext";
import { usePlatforms } from "../PlatformsContext";
import { codeForTmdbId } from "@/lib/providers-ar";
import type { Profile } from "../AuthContext";
import type { User } from "@supabase/supabase-js";

function initialName(profile: Profile | null, user: User | null): string {
  const m = user?.user_metadata ?? {};
  return profile?.display_name
    || (m.display_name as string)
    || (m.full_name as string)
    || (m.name as string)
    || "";
}

export function useOnboarding() {
  const { user, profile, updatePlatforms, updateDisplayName, completeOnboarding } = useAuth();
  const platformsCtx = usePlatforms();

  const [selected, setSelected] = useState<number[]>([]);
  const [name, setName] = useState("");
  const [seeded, setSeeded] = useState(false);

  // Carga inicial desde el perfil (resume): corre una vez cuando llega el perfil.
  useEffect(() => {
    if (!profile || seeded) return;
    setSelected(profile.platforms ?? []);
    setName(initialName(profile, user));
    setSeeded(true);
  }, [profile, user, seeded]);

  // Puente a "mis plataformas": mapea provider_id -> código y sincroniza
  // sc:platforms. `set()` cae al default si no hay mapeables (nunca vacío), así
  // deseleccionar todo NO deja pegada una plataforma vieja. Los provider_id sin
  // código interno quedan igual guardados en el perfil (para fase 2).
  const bridge = useCallback((ids: number[]) => {
    const codes = [...new Set(ids.map((id) => codeForTmdbId(id)).filter((c): c is NonNullable<typeof c> => !!c))];
    platformsCtx.set(codes);
  }, [platformsCtx]);

  const togglePlatform = useCallback((id: number) => {
    setSelected((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      void updatePlatforms(next);
      bridge(next);
      return next;
    });
  }, [updatePlatforms, bridge]);

  const clearPlatforms = useCallback(() => {
    setSelected([]);
    void updatePlatforms([]);
    bridge([]); // "No tengo ninguna": sc:platforms vuelve al default (no queda una vieja pegada).
  }, [updatePlatforms, bridge]);

  const saveName = useCallback(() => {
    const v = name.trim();
    if (v) void updateDisplayName(v);
  }, [name, updateDisplayName]);

  const finish = useCallback(() => completeOnboarding(), [completeOnboarding]);

  return { selected, name, togglePlatform, clearPlatforms, setName, saveName, finish };
}
