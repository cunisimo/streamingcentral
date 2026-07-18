// Acceso a los datos del usuario desde el browser (RLS: cada uno ve/gestiona
// lo suyo). Las lecturas no necesitan userId: la policy ya filtra por sesión.
// Las escrituras sí lo necesitan (columna user_id, with check auth.uid()).
"use client";
import { supabaseBrowser } from "./supabase";
import type { MediaType } from "./types";

export interface ItemRef { tmdb_id: number; tipo: MediaType }

type Kind = "list" | "watched";

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
