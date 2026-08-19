// Acceso a los datos del usuario desde el browser (RLS: cada uno ve/gestiona
// lo suyo). Las lecturas no necesitan userId: la policy ya filtra por sesión.
// Las escrituras sí lo necesitan (columna user_id, with check auth.uid()).
"use client";
import { supabaseBrowser } from "./supabase";
import type { MediaType } from "./types";

export interface ItemRef { tmdb_id: number; tipo: MediaType }

// 'dismissed' = "No es para mí" del riel "Elegidas para vos". Es un kind más de
// `user_items`, pero NO es un item que el usuario tenga: es una exclusión. Por
// eso tiene sus propios accesos acá abajo y no pasa por `itemRefs`, que ya
// filtra por kind y así deja Mi lista y Ya la vi intactas sin tocarlas.
type Kind = "list" | "watched" | "dismissed";

function toRefs(data: unknown): ItemRef[] {
  return ((data as { tmdb_id: number; tipo: MediaType }[] | null) ?? [])
    .map((r) => ({ tmdb_id: r.tmdb_id, tipo: r.tipo }));
}

export async function itemRefs(kind: Kind): Promise<ItemRef[]> {
  const { data } = await supabaseBrowser()
    .from("user_items")
    .select("tmdb_id, tipo")
    .eq("kind", kind)
    .order("created_at", { ascending: false });
  return toRefs(data);
}

export async function hasItem(kind: Kind, ref: ItemRef): Promise<boolean> {
  const { data } = await supabaseBrowser()
    .from("user_items")
    .select("id")
    .eq("kind", kind).eq("tmdb_id", ref.tmdb_id).eq("tipo", ref.tipo)
    .maybeSingle();
  return !!data;
}

export async function setItem(userId: string, kind: Kind, ref: ItemRef, on: boolean): Promise<{ error?: string }> {
  const sb = supabaseBrowser();
  if (on) {
    const { error } = await sb.from("user_items").upsert(
      { user_id: userId, tmdb_id: ref.tmdb_id, tipo: ref.tipo, kind },
      { onConflict: "user_id,tmdb_id,tipo,kind" },
    );
    return error ? { error: error.message } : {};
  }
  const { error } = await sb.from("user_items")
    .delete()
    .eq("user_id", userId).eq("kind", kind).eq("tmdb_id", ref.tmdb_id).eq("tipo", ref.tipo);
  return error ? { error: error.message } : {};
}

export async function recordView(userId: string, ref: ItemRef): Promise<void> {
  await supabaseBrowser().from("view_history").upsert(
    { user_id: userId, tmdb_id: ref.tmdb_id, tipo: ref.tipo, viewed_at: new Date().toISOString() },
    { onConflict: "user_id,tmdb_id,tipo" },
  );
}

export async function historyRefs(limit = 40): Promise<ItemRef[]> {
  const { data } = await supabaseBrowser()
    .from("view_history")
    .select("tmdb_id, tipo")
    .order("viewed_at", { ascending: false })
    .limit(limit);
  return toRefs(data);
}

export async function likedRefs(): Promise<ItemRef[]> {
  const { data } = await supabaseBrowser()
    .from("votes")
    .select("tmdb_id, tipo")
    .in("rating", [2, 3])
    .order("created_at", { ascending: false });
  return toRefs(data);
}

// --- "No es para mí" ---------------------------------------------------------

// De a cuántos se leen los descartes. NO es un tope: es el tamaño de página.
//
// Un tope haría reaparecer títulos EN SILENCIO al pasarse —el peor modo de
// fallar que hay acá, porque el usuario ya dijo que no y no hay ninguna señal de
// que se ignoró—. Así, quien tiene 40 descartes paga una sola query igual que
// hoy, y el costo extra existe únicamente para el caso excepcional de pasar los
// 500, que además lo paga solo esa persona.
const PAGINA_DESCARTES = 500;

export async function dismissedRefs(): Promise<ItemRef[]> {
  const sb = supabaseBrowser();
  const out: ItemRef[] = [];
  for (let desde = 0; ; desde += PAGINA_DESCARTES) {
    const { data, error } = await sb
      .from("user_items")
      .select("tmdb_id, tipo")
      .eq("kind", "dismissed")
      .order("created_at", { ascending: false })
      .range(desde, desde + PAGINA_DESCARTES - 1);
    if (error) break;
    const refs = toRefs(data);
    out.push(...refs);
    // Página incompleta = no hay más. Con exactamente 500 se pide otra, que
    // vuelve vacía: un viaje de más en un caso rarísimo, a cambio de no tener
    // que adivinar el total.
    if (refs.length < PAGINA_DESCARTES) break;
  }
  return out;
}

// Borra el descarte de un título, si lo hubiera. La usan dos caminos distintos:
//
//   1. "Deshacer" del aviso, que es el obvio.
//   2. LA SEÑAL POSITIVA GANA. Si después de descartar algo le ponés "Ta buena",
//      "Petacular" o lo mandás a Mi lista, ese "sí" pisa al "no" anterior: sería
//      absurdo que el riel siguiera escondiendo un título que acabás de marcar
//      como que te gusta. "Ya la vi" y "Malaso" NO lo revierten — los dos son
//      compatibles con no querer verlo recomendado.
//
// No devuelve error a propósito en el caso 2: es un efecto secundario de otra
// acción y no puede hacerla fallar. Si no se borra, lo peor que pasa es que el
// título siga oculto del riel.
export async function olvidarDescarte(userId: string, ref: ItemRef): Promise<{ error?: string }> {
  const { error } = await supabaseBrowser()
    .from("user_items")
    .delete()
    .eq("user_id", userId).eq("kind", "dismissed")
    .eq("tmdb_id", ref.tmdb_id).eq("tipo", ref.tipo);
  return error ? { error: error.message } : {};
}
