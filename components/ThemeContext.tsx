"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { COLOR_FONDO } from "@/lib/tema-colores";

type Theme = "light" | "dark";
interface Ctx {
  theme: Theme;
  toggle: () => void;
  ready: boolean;
}
const ThemeCtx = createContext<Ctx | null>(null);
const KEY = "sc:theme";

// 🔴 EL COLOR DE LA BARRA SALE DE `lib/tema-colores.ts`, NO DE UNA COPIA.
//
// Acá había una copia a mano con el comentario "tienen que coincidir con --bg
// de cada tema en globals.css". No coincidían:
//
//     claro:  #F5F5F2  contra  --bg #FAFAFD
//     oscuro: #16171B  contra  --bg #0F0E13
//
// En la PWA instalada de Android eso pinta la barra de estado de un tono
// distinto al de la app, y por eso se veía la franja en los DOS temas: en claro
// más oscura, en oscuro más clara. Un test ata ahora esos valores al CSS.

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
    metas.forEach((m) => { m.content = COLOR_FONDO[t]; });
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
