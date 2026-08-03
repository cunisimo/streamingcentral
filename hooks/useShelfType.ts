"use client";
import { useEffect, useState } from "react";
import type { MediaType } from "@/lib/types";

// Preferencia de tipo (movie/tv) por riel del Home, persistida en localStorage.
// Un solo objeto { [shelfKey]: "movie" | "tv" } bajo una key. Es tolerante a
// localStorage no disponible (SSR / modo privado): degrada a estado en memoria.
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

export function useShelfType(
  shelfKey: string,
  initial: MediaType,
): [MediaType, (t: MediaType) => void] {
  // Inicia con `initial` para no romper la hidratación (el server no tiene
  // localStorage). La preferencia guardada se aplica tras montar.
  const [type, setType] = useState<MediaType>(initial);

  useEffect(() => {
    if (!shelfKey) return;
    const stored = readStore()[shelfKey];
    if (stored === "movie" || stored === "tv") setType(stored);
  }, [shelfKey]);

  const update = (t: MediaType) => {
    setType(t);
    if (!shelfKey) return;
    try {
      const store = readStore();
      store[shelfKey] = t;
      localStorage.setItem(KEY, JSON.stringify(store));
    } catch {
      /* localStorage no disponible: la preferencia no persiste, no rompe */
    }
  };

  return [type, update];
}
