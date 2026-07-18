// Lectura de agregados de votos ("me gusta") desde el servidor.
// El conteo global no es visible con la policy de RLS (cada uno ve solo lo
// suyo), así que se lee vía funciones security definer definidas en el schema.
import { supabaseServer } from "./supabase";
import type { MediaType } from "./types";

export interface VotedRow {
  tmdb_id: number;
  tipo: MediaType;
  votos: number;
}

// Top de títulos por cantidad de votos en los últimos `days` días, acotado al
// rango de rating [min, max]: 2-3 = "ta buena"/"petacular" (los más votados),
// 1-1 = "malaso" (hacete cargo). Por defecto abarca todo el rango.
export async function topVotedRows(days = 7, limit = 60, min = 1, max = 3): Promise<VotedRow[]> {
  const sb = supabaseServer();
  if (!sb) return [];
  const { data, error } = await sb.rpc("top_voted", { p_days: days, p_limit: limit, p_min: min, p_max: max });
  if (error || !data) return [];
  return (data as { tmdb_id: number; tipo: MediaType; votos: number }[]).map((r) => ({
    tmdb_id: r.tmdb_id,
    tipo: r.tipo,
    votos: Number(r.votos),
  }));
}
