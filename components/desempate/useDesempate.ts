"use client";
import { useReducer } from "react";
import type { UITitle } from "@/lib/types";

// Máquina de estado del minijuego. Efímera: nada se persiste.
export type Phase = "setup" | "spinning" | "result";
export type Mode = "manual" | "filtros";

export const MAX_PICKS = 3;
export const MIN_PICKS = 2;

const keyOf = (t: { type: string; id: number }) => `${t.type}-${t.id}`;

interface State {
  phase: Phase;
  mode: Mode;
  selected: UITitle[];
  winnerIdx: number | null;
}

type Action =
  | { type: "MODE"; mode: Mode }
  | { type: "ADD"; title: UITitle }
  | { type: "REMOVE"; key: string }
  | { type: "SPIN" }
  | { type: "FINISH" }
  | { type: "REPLAY" };

const initial: State = { phase: "setup", mode: "manual", selected: [], winnerIdx: null };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "MODE":
      return { ...s, mode: a.mode };
    case "ADD": {
      if (s.selected.length >= MAX_PICKS) return s;
      if (s.selected.some((t) => keyOf(t) === keyOf(a.title))) return s;
      return { ...s, selected: [...s.selected, a.title] };
    }
    case "REMOVE":
      return { ...s, selected: s.selected.filter((t) => keyOf(t) !== a.key) };
    case "SPIN": {
      if (s.selected.length < MIN_PICKS) return s;
      // Azar justo: 1/N real. Se elige acá, antes de animar.
      const winnerIdx = Math.floor(Math.random() * s.selected.length);
      return { ...s, phase: "spinning", winnerIdx };
    }
    case "FINISH":
      return { ...s, phase: "result" };
    case "REPLAY":
      // Vuelve a Setup conservando la selección.
      return { ...s, phase: "setup", winnerIdx: null };
    default:
      return s;
  }
}

export function useDesempate() {
  const [state, dispatch] = useReducer(reducer, initial);
  const winner = state.winnerIdx != null ? state.selected[state.winnerIdx] : null;
  return {
    state,
    winner,
    setMode: (mode: Mode) => dispatch({ type: "MODE", mode }),
    add: (title: UITitle) => dispatch({ type: "ADD", title }),
    remove: (key: string) => dispatch({ type: "REMOVE", key }),
    spin: () => dispatch({ type: "SPIN" }),
    finish: () => dispatch({ type: "FINISH" }),
    replay: () => dispatch({ type: "REPLAY" }),
    keyOf,
  };
}
