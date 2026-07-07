"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";

type Theme = "light" | "dark";
interface Ctx {
  theme: Theme;
  toggle: () => void;
  ready: boolean;
}
const ThemeCtx = createContext<Ctx | null>(null);
const KEY = "sc:theme";

function applyTheme(t: Theme) {
  document.documentElement.setAttribute("data-theme", t);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let initial: Theme = "light";
    try {
      const stored = localStorage.getItem(KEY);
      if (stored === "light" || stored === "dark") {
        initial = stored;
      } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        initial = "dark";
      }
    } catch { /* noop */ }
    setTheme(initial);
    applyTheme(initial);
    setReady(true);
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      applyTheme(next);
      try { localStorage.setItem(KEY, next); } catch { /* noop */ }
      return next;
    });
  }, []);

  return (
    <ThemeCtx.Provider value={{ theme, toggle, ready }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme fuera del provider");
  return ctx;
}
