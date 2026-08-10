"use client";
import { useCallback, useEffect, useRef } from "react";
import type { Escenario } from "@/lib/roulette";

// Los tmdb_id que la ruleta YA mostró, por escenario.
//
// Es estado de paginación, no historial: la semilla del día es compartida y
// estable, así que sin esto volver a la ruleta a la tarde devuelve la misma
// película de la mañana. Se pasa en p_excluir junto con los "ya la vi" del
// usuario, y aplica igual a quien está logueado.
//
// Por escenario y no en una bolsa única: agotar `fondo` (el más angosto, 123
// títulos alcanzables) borraría el progreso de los otros tres.
const KEY = "yump:ruleta-mostrados";
// Tope por escenario. El pool alcanzable más chico son 123 títulos, así que
// 300 no recorta nada real; está para que la clave no crezca sin límite.
const TOPE = 300;

type Store = Partial<Record<Escenario, number[]>>;

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

export function useRouletteSeen() {
  // Copia en memoria para no leer localStorage en cada render. Se hidrata tras
  // montar: en el server no existe.
  const store = useRef<Store>({});
  useEffect(() => { store.current = read(); }, []);

  const persist = useCallback(() => {
    try { localStorage.setItem(KEY, JSON.stringify(store.current)); } catch { /* modo privado: no persiste, no rompe */ }
  }, []);

  const seen = useCallback((e: Escenario) => store.current[e] ?? [], []);

  const add = useCallback((e: Escenario, ids: number[]) => {
    const previos = store.current[e] ?? [];
    const union = [...new Set([...previos, ...ids])];
    store.current[e] = union.slice(-TOPE);
    persist();
  }, [persist]);

  const reset = useCallback((e: Escenario) => {
    store.current[e] = [];
    persist();
  }, [persist]);

  return { seen, add, reset };
}
