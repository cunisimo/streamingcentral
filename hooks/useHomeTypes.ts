"use client";
import { useCallback, useEffect, useState } from "react";
// Import client-safe a propósito: components/data.ts no arrastra nada del server.
// Importar esto de lib/home.ts metería el cliente de Upstash Redis en el bundle.
import type { MediaType } from "@/lib/types";
// El inventario de claves, los defaults y la serialización viven en un módulo
// PURO para poder probarlos con `node --test`: lo que decide si el Home se
// rearma es el parámetro `t`, y eso no se puede verificar mirando el hook.
// Ver hooks/home-types-nucleo.ts y su test.
import { TOGGLE_KEYS, paramDeTipos, tiposIniciales } from "./home-types-nucleo";
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
    setTypes(tiposIniciales(readStore()));
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

  // Serialización para /api/home?t=... Cambia cuando cambia cualquier toggle de
  // refetch —los seis géneros y "ultimos"—, que es exactamente cuando hay que
  // rearmar el Home.
  const param = paramDeTipos(types);

  // `types` lo consume CatalogView para que el toggle de un riel de género se vea
  // aplicado de inmediato, sin esperar a que vuelva el payload nuevo.
  return { types, setType, param, ready };
}
