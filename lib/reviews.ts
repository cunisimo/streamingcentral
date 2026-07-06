// Acceso a reseñas editoriales (Supabase). Lectura pública de publicadas.
import { supabaseServer } from "./supabase";
import type { EditorialReview, MediaType } from "./types";

export async function getEditorial(tmdbId: number, tipo: MediaType): Promise<EditorialReview | null> {
  const sb = supabaseServer();
  if (!sb) return null;
  const { data } = await sb
    .from("editorial_reviews")
    .select("texto, rating, updated_at")
    .eq("tmdb_id", tmdbId)
    .eq("tipo", tipo)
    .eq("publicado", true)
    .maybeSingle();
  if (!data) return null;
  return {
    texto: data.texto as string,
    rating: (data.rating as number) ?? null,
    fecha: new Date(data.updated_at as string).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" }),
  };
}

// Set de tmdb_ids con reseña publicada (para marcar el badge en listados).
export async function publishedIds(tipo?: MediaType): Promise<Set<string>> {
  const sb = supabaseServer();
  if (!sb) return new Set();
  let q = sb.from("editorial_reviews").select("tmdb_id, tipo").eq("publicado", true);
  if (tipo) q = q.eq("tipo", tipo);
  const { data } = await q;
  return new Set((data ?? []).map((r) => `${r.tmdb_id}:${r.tipo}`));
}
