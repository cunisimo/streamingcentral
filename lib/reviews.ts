// Acceso a reseñas editoriales (Supabase). Lectura pública de publicadas.
import { supabaseServer } from "./supabase";
import { cached, TTL } from "./cache";
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
//
// Cacheado porque se llama una vez por CADA listado que se arma: medido, eran 16
// viajes a Supabase por rearmado del Home. Y la tabla está vacía a propósito
// —el módulo editorial está en standby, ver el encabezado de CLAUDE.md—, así que
// eran 16 consultas para recibir 16 conjuntos vacíos.
//
// El TTL es corto a propósito. Es el único dato del Home que un humano cambia a
// mano desde /admin: si algún día se publica una reseña, esperar 24 h a que
// aparezca el badge sería desconcertante. 5 minutos hace el trabajo (16 viajes
// pasan a 1) sin volverlo un dato viejo.
//
// El Set NO se puede cachear directo: `cached` serializa a JSON y un Set vuelve
// como {}. Se guarda el array y se reconstruye al leer.
export async function publishedIds(tipo?: MediaType): Promise<Set<string>> {
  const claves = await cached(`ed:pub:${tipo ?? "all"}`, TTL.editorial, async () => {
    const sb = supabaseServer();
    if (!sb) return [] as string[];
    let q = sb.from("editorial_reviews").select("tmdb_id, tipo").eq("publicado", true);
    if (tipo) q = q.eq("tipo", tipo);
    const { data } = await q;
    return (data ?? []).map((r) => `${r.tmdb_id}:${r.tipo}`);
  });
  return new Set(claves);
}
