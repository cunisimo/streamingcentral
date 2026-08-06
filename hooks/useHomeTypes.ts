"use client";
import { useCallback, useEffect, useState } from "react";
import { HOME_GENRES, defaultTypeFor } from "@/lib/home";
import type { MediaType } from "@/lib/types";

// Claves con toggle en el Home: los 6 géneros + los 2 rieles de votos.
const TOGGLE_KEYS = [...HOME_GENRES, "mas-votados", "hacete-cargo"];
// MISMA clave y MISMO formato que hooks/useShelfType.ts: un único objeto JSON
// { [shelfKey]: "movie" | "tv" }. Si se usara una clave por riel, el usuario
// perdería la preferencia que ya tenía guardada.
const KEY = "yump:shelf-type";
type Store = Record<string, MediaType>;

function readStore(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

const defaultFor = (k: string): MediaType =>
  HOME_GENRES.includes(k) ? defaultTypeFor(k) : "movie";

// Estado centralizado de los toggles Películas/Series del Home. Antes vivía en
// cada Shelf (useShelfType); ahora el Home se reconstruye entero al cambiar
// cualquiera, así que el estado tiene que estar arriba.
export function useHomeTypes() {
  const [types, setTypes] = useState<Record<string, MediaType>>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const store = readStore();
    const out: Record<string, MediaType> = {};
    for (const k of TOGGLE_KEYS) {
      const v = store[k];
      out[k] = v === "movie" || v === "tv" ? v : defaultFor(k);
    }
    setTypes(out);
    setReady(true);
  }, []);

  const setType = useCallback((k: string, t: MediaType) => {
    setTypes((prev) => ({ ...prev, [k]: t }));
    try {
      const store = readStore();
      store[k] = t;
      localStorage.setItem(KEY, JSON.stringify(store));
    } catch {
      /* localStorage no disponible: no persiste, no rompe */
    }
  }, []);

  // Serialización para /api/home?t=...
  const param = TOGGLE_KEYS.map((k) => `${k}:${types[k] ?? defaultFor(k)}`).join(",");

  return { types, setType, param, ready };
}
