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

// Colores de la barra de estado en app instalada. Tienen que coincidir con
// --bg de cada tema en globals.css.
const BAR: Record<Theme, string> = { light: "#F5F5F2", dark: "#16171B" };

function applyTheme(t: Theme) {
  document.documentElement.setAttribute("data-theme", t);
  // El manifest y las meta con `media` siguen a prefers-color-scheme, no al
  // toggle manual. Sin esto, alguien con el sistema en claro y la app en oscuro
  // ve la barra de estado clara sobre una app oscura. Reescribimos las etiquetas
  // en runtime para que gane la elección del usuario.
  try {
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = BAR[t];
    document.head.appendChild(meta);
  } catch { /* noop */ }
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
