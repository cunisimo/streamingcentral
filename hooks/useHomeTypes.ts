"use client";
import { useCallback, useEffect, useState } from "react";
// Import client-safe a propósito: components/data.ts no arrastra nada del server.
// Importar esto de lib/home.ts metería el cliente de Upstash Redis en el bundle.
import { HOME_GENRES, defaultTypeFor } from "@/components/data";
import type { MediaType } from "@/lib/types";

// Claves con toggle que RECONSTRUYEN el Home: solo los 6 géneros (typeToggle
// "refetch"). Los rieles de votos ("mas-votados" / "hacete-cargo") usan
// typeToggle "filter": se resuelven en cliente sobre la lista mixta ya cargada,
// así que no entran acá ni en el parámetro `t` — su preferencia la sigue
// guardando useShelfType, en la misma clave y formato.
const TOGGLE_KEYS = HOME_GENRES;
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

// Estado centralizado de los toggles Películas/Series de los rieles de género del
// Home. Antes vivía en cada Shelf (useShelfType); ahora el Home se reconstruye
// entero al cambiar cualquiera, así que el estado tiene que estar arriba.
export function useHomeTypes() {
  const [types, setTypes] = useState<Record<string, MediaType>>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const store = readStore();
    const out: Record<string, MediaType> = {};
    for (const k of TOGGLE_KEYS) {
      const v = store[k];
      out[k] = v === "movie" || v === "tv" ? v : defaultTypeFor(k);
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

  // Serialización para /api/home?t=... Solo cambia si cambia un toggle de género,
  // que es exactamente cuando hay que rearmar el Home.
  const param = TOGGLE_KEYS.map((k) => `${k}:${types[k] ?? defaultTypeFor(k)}`).join(",");

  // `types` lo consume CatalogView para que el toggle de un riel de género se vea
  // aplicado de inmediato, sin esperar a que vuelva el payload nuevo.
  return { types, setType, param, ready };
}
