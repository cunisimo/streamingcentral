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
  // Las meta theme-color con `media` (ver viewport en app/layout.tsx) siguen a
  // prefers-color-scheme, no al toggle manual. Sin esto, alguien con el sistema
  // en claro y la app en oscuro ve la barra de estado clara sobre una app oscura.
  //
  // ⚠️ SOLO mutamos `content`; nunca remover ni recrear estos nodos. Los renderiza
  // React y los administra como "hoistable resources": si los sacamos del DOM,
  // cuando React va a desmontarlos hace parentNode.removeChild() sobre un nodo
  // huérfano y tira "Cannot read properties of null (reading 'removeChild')".
  //
  // Poner el mismo color en TODAS alcanza: matchee la que matchee por su media,
  // el color resultante es el que eligió el usuario.
  try {
    const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
    metas.forEach((m) => { m.content = BAR[t]; });
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
