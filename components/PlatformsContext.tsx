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

// --- La cookie espejo --------------------------------------------------------
// El mismo dato que `localStorage`, escrito también como cookie para que el
// SERVIDOR pueda saber qué plataformas tiene el usuario. Hoy no la lee nadie:
// es el primer paso para poder armar el Home del lado del servidor. Sin esto,
// `CatalogView` está obligado a pedir el Home desde el cliente después de
// hidratar, y por eso se ven esqueletos en todas las visitas aunque el payload
// esté cacheado.
//
// QUIÉN GANA ANTE UN DESACUERDO. Hay tres lugares con este dato y el orden
// importa:
//   1. `localStorage` — la FUENTE DE VERDAD. Gana siempre.
//   2. El perfil de Supabase (`profiles.platforms`) — hoy solo se lee para
//      pre-cargar el formulario del onboarding (`useOnboarding`), y NUNCA pisa
//      a localStorage. Ojo: eso significa que iniciar sesión en otro
//      dispositivo tampoco restaura las plataformas; es un agujero conocido,
//      anterior a esta cookie. El día que se construya esa restauración tiene
//      que pasar por `set()`, y así escribe la cookie sola.
//   3. Esta cookie — un ESPEJO DE ESCRITURA. Nunca gana y nadie la lee.
//
// El nombre va con guion bajo y no con dos puntos como la clave de
// localStorage: `:` no es válido en un nombre de cookie según el RFC 6265 (los
// navegadores lo toleran, pero no hay motivo para depender de eso).
//
// El valor es "n,d,m" y no JSON a propósito: es el mismo formato que ya viaja
// en `?providers=` en toda la API, así que del lado del servidor se lee sin
// traducir nada.
//
// Sin `HttpOnly` porque la escribe el cliente. No hay nada sensible acá: es la
// lista de plataformas de streaming que eligió el usuario.
const COOKIE = "sc_platforms";
const UN_ANIO = 60 * 60 * 24 * 365;

function leerCookie(): string | null {
  const m = document.cookie.match(/(?:^|;\s*)sc_platforms=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function escribirCookie(codes: PlatformCode[]) {
  try {
    // `Secure` solo en https: en `localhost` (http) el navegador descarta una
    // cookie marcada como Secure, y el espejo quedaría vacío en desarrollo.
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie =
      `${COOKIE}=${codes.join(",")}; Path=/; Max-Age=${UN_ANIO}; SameSite=Lax${secure}`;
  } catch { /* noop */ }
}

// El ÚNICO lugar que persiste. Antes había tres caminos que escribían
// localStorage por su cuenta (uno de ellos, `persist`, ni siquiera se usaba), y
// con la cookie sumada eso serían seis lugares para mantener en sincronía.
function guardar(next: PlatformCode[]) {
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* noop */ }
  escribirCookie(next);
}

export function PlatformsProvider({ children }: { children: React.ReactNode }) {
  const [platforms, setPlatforms] = useState<PlatformCode[]>(DEFAULT_PLATFORMS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let inicial: PlatformCode[] = DEFAULT_PLATFORMS;
    try {
      const raw = localStorage.getItem(KEY);
      const guardado = raw ? JSON.parse(raw) : null;
      // El invariante "nunca vacío" también vale acá: `toggle` y `set` lo
      // respetaban, pero la hidratación aceptaba un "[]" guardado y dejaba al
      // usuario sin ninguna plataforma (y con el catálogo entero vacío).
      if (Array.isArray(guardado) && guardado.length) {
        inicial = guardado;
        setPlatforms(guardado);
      }
    } catch { /* noop */ }

    // Poner la cookie al día al hidratar, y no solo cuando el usuario cambia
    // algo. Sin esto el espejo quedaría vacío justo para los usuarios que ya
    // existen: eligen sus plataformas una vez y no las vuelven a tocar nunca,
    // así que el día del deploy tendrían localStorage con su selección y
    // ninguna cookie. Con esto se pone al día sola en la primera visita de cada
    // uno, sin migración y sin pedirle nada a nadie.
    //
    // Se compara antes de escribir para no tocar `document.cookie` en cada
    // carga cuando ya está bien.
    if (leerCookie() !== inicial.join(",")) escribirCookie(inicial);
    setReady(true);
  }, []);

  // La escritura va FUERA del updater de `setState`. Estaba adentro, y un
  // updater puede ejecutarse dos veces (StrictMode en desarrollo, y React se
  // reserva el derecho en general): meter efectos ahí está mal aunque escribir
  // dos veces lo mismo no rompa nada.
  const toggle = useCallback((c: PlatformCode) => {
    const next = platforms.includes(c)
      ? platforms.filter((x) => x !== c)
      : [...platforms, c];
    const final = next.length ? next : platforms;   // nunca vacío
    setPlatforms(final);
    guardar(final);
  }, [platforms]);

  const has = useCallback((c: PlatformCode) => platforms.includes(c), [platforms]);

  const set = useCallback((codes: PlatformCode[]) => {
    const final = codes.length ? codes : DEFAULT_PLATFORMS; // nunca vacío
    setPlatforms(final);
    guardar(final);
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
