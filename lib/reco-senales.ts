// La parte PURA de las señales leídas por el servidor: de las filas de
// `votes` y `user_items` a señales con rango y claves a excluir. Aparte de
// ./reco-senales-servidor para poder probarla sin Supabase.
import type { MediaType } from "./types";
import type { SenalConRango } from "./reco-seleccion";

export interface FilaVoto { tmdb_id: number; tipo: MediaType; rating: number; created_at: string }
export interface FilaItem { tmdb_id: number; tipo: MediaType; kind: string; created_at: string }

// Puro, para poder probarlo: de las filas a señales con rango y claves.
export function senalesDesdeFilas(
  votos: FilaVoto[], items: FilaItem[],
): { senales: SenalConRango[]; claves: string[] } {
  const positivas = [
    ...votos.filter((v) => v.rating === 3 || v.rating === 2)
      .map((v) => ({ tipo: v.tipo, id: v.tmdb_id, peso: v.rating as 2 | 3, fecha: v.created_at })),
    ...items.filter((i) => i.kind === "list")
      .map((i) => ({ tipo: i.tipo, id: i.tmdb_id, peso: 1 as const, fecha: i.created_at })),
  ];
  // Más nueva primero. Desempate estable por `tipo:id`, y a igual título el de
  // mayor peso, para que el rango no dependa del orden de llegada.
  positivas.sort((a, b) =>
    b.fecha.localeCompare(a.fecha) || b.peso - a.peso || `${a.tipo}:${a.id}`.localeCompare(`${b.tipo}:${b.id}`));
  return {
    senales: positivas.map((p, rango) => ({ tipo: p.tipo, id: p.id, peso: p.peso, rango })),
    claves: [...votos, ...items].map((f) => `${f.tipo}:${f.tmdb_id}`),
  };
}
