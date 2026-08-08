"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { PlatformCode } from "@/lib/types";
import { DEFAULT_PLATFORMS } from "@/lib/providers-ar";

interface Ctx {
  platforms: PlatformCode[];
  has: (c: PlatformCode) => boolean;
  toggle: (c: PlatformCode) => void;
  set: (codes: PlatformCode[]) => void;
  ready: boolean;
}
const PlatformsCtx = createContext<Ctx | null>(null);
const KEY = "sc:platforms";

export function PlatformsProvider({ children }: { children: React.ReactNode }) {
  const [platforms, setPlatforms] = useState<PlatformCode[]>(DEFAULT_PLATFORMS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      const guardado = raw ? JSON.parse(raw) : null;
      // El invariante "nunca vacío" también vale acá: `toggle` y `set` lo
      // respetaban, pero la hidratación aceptaba un "[]" guardado y dejaba al
      // usuario sin ninguna plataforma (y con el catálogo entero vacío).
      if (Array.isArray(guardado) && guardado.length) setPlatforms(guardado);
    } catch { /* noop */ }
    setReady(true);
  }, []);

  const persist = (next: PlatformCode[]) => {
    setPlatforms(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* noop */ }
  };

  const toggle = useCallback((c: PlatformCode) => {
    setPlatforms((prev) => {
      const next = prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c];
      const final = next.length ? next : prev;
      try { localStorage.setItem(KEY, JSON.stringify(final)); } catch { /* noop */ }
      return final;
    });
  }, []);

  const has = useCallback((c: PlatformCode) => platforms.includes(c), [platforms]);

  const set = useCallback((codes: PlatformCode[]) => {
    const final = codes.length ? codes : DEFAULT_PLATFORMS; // nunca vacío
    setPlatforms(final);
    try { localStorage.setItem(KEY, JSON.stringify(final)); } catch { /* noop */ }
  }, []);

  return (
    <PlatformsCtx.Provider value={{ platforms, has, toggle, set, ready }}>
      {children}
    </PlatformsCtx.Provider>
  );
}

export function usePlatforms() {
  const ctx = useContext(PlatformsCtx);
  if (!ctx) throw new Error("usePlatforms fuera del provider");
  return ctx;
}
