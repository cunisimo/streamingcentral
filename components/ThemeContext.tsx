"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { COLOR_FONDO } from "@/lib/tema-colores";
import { aplicarBarraDeEstado } from "@/lib/barra-estado";

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
  // La barra de estado de la PWA sigue a `theme-color`, y el tema lo elige el
  // usuario, así que hay que reescribirla en cada toggle.
  //
  // 🔴 ES UNA SOLA META Y NO LA RENDEREA REACT: la crea el script de arranque
  // de `app/layout.tsx` (ahí está el porqué). Acá se muta la misma, o se crea
  // si por lo que sea no está. Nunca declararla en el JSX ni en `viewport`:
  // React repone con el valor original cualquier meta suya que hayamos mutado.
  try {
    let m = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!m) {
      m = document.createElement("meta");
      m.name = "theme-color";
      document.head.appendChild(m);
    }
    m.content = COLOR_FONDO[t];
  } catch { /* noop */ }

  // En el contenedor, la meta no alcanza: el FONDO de la barra sí acompaña
  // —la WebView dibuja debajo—, pero los iconos quedaban blancos siempre y en
  // tema claro eran ilegibles. Medido en CP8. En web esto no hace nada.
  void aplicarBarraDeEstado(t);
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
