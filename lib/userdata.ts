// Acceso a los datos del usuario desde el browser (RLS: cada uno ve/gestiona
// lo suyo). Las lecturas no necesitan userId: la policy ya filtra por sesión.
// Las escrituras sí lo necesitan (columna user_id, with check auth.uid()).
"use client";
import { supabaseBrowser } from "./supabase";
import { paginar, PAGINA_DESCARTES } from "@/components/reco-descartes";
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

// LANZA si Supabase falla, en cualquier página. Ver `paginar` en
// components/reco-descartes.ts: una lista de descartes incompleta hace
// reaparecer títulos en silencio, así que el riel prefiere no mostrarse.
export async function dismissedRefs(): Promise<ItemRef[]> {
  const sb = supabaseBrowser();
  const filas = await paginar<{ tmdb_id: number; tipo: MediaType }>(
    async (desde, hasta) => {
      const { data, error } = await sb
        .from("user_items")
        .select("tmdb_id, tipo")
        .eq("kind", "dismissed")
        .order("created_at", { ascending: false })
        .range(desde, hasta);
      return { data: data as { tmdb_id: number; tipo: MediaType }[] | null, error };
    },
    PAGINA_DESCARTES,
    "los descartes",
  );
  return toRefs(filas);
}

// Borra el descarte de un título, si lo hubiera. La usan dos caminos distintos:
//
//   1. "Deshacer" del aviso, que es el obvio.
//   2. LA SEÑAL POSITIVA GANA. Votar "Ta buena"/"Petacular" o mandarlo a Mi
//      lista borra un "No es para mí" anterior. "Ya la vi" y "Malaso" NO lo
//      revierten: son compatibles con no querer verlo recomendado.
//
// QUÉ NO HACE, para no repetir dos errores que ya se escribieron acá:
//
//   - NO devuelve la tarjeta al riel. Un título votado o en Mi lista ya viaja en
//     `excluir`, así que el servidor no lo ofrece más — y está bien, porque el
//     riel recomienda lo que TODAVÍA NO calificaste.
//   - NO hace que el título empiece a generar recomendaciones. Ya las generaba:
//     las señales salen de `votes` y de Mi lista, y la fila `dismissed` nunca
//     tuvo nada que ver con eso.
//
// Lo que sí hace es evitar un estado contradictorio —un "sí" y un "no" sobre el
// mismo título— y, sobre todo, que ese descarte viejo vuelva a actuar más
// adelante: si algún día sacás el voto o lo quitás de Mi lista, el título
// vuelve a ser recomendable, y la fila olvidada lo seguiría escondiendo sin que
// nadie entienda por qué.
export async function olvidarDescarte(userId: string, ref: ItemRef): Promise<{ error?: string }> {
  const { error } = await supabaseBrowser()
    .from("user_items")
    .delete()
    .eq("user_id", userId).eq("kind", "dismissed")
    .eq("tmdb_id", ref.tmdb_id).eq("tipo", ref.tipo);
  return error ? { error: error.message } : {};
}

// TODOS los votos del usuario, del más nuevo al más viejo.
//
// Sin tope, y paginado por la misma razón que los descartes: PostgREST corta en
// su `max-rows` por defecto y lo hace EN SILENCIO, así que un tope implícito
// devolvería exclusiones incompletas y haría reaparecer títulos ya calificados
// sin ningún error. Si falla una página, falla la lectura entera.
//
// No suma llamadas en el caso normal: quien tiene menos de 500 votos paga UNA
// query, la misma de siempre. El recorte a los 40 más recientes para las señales
// se hace en memoria (ver `armarSenales` en components/reco-entrada.ts).
export async function allVotes(): Promise<{ tmdb_id: number; tipo: MediaType; rating: number }[]> {
  const sb = supabaseBrowser();
  return paginar<{ tmdb_id: number; tipo: MediaType; rating: number }>(
    async (desde, hasta) => {
      const { data, error } = await sb
        .from("votes")
        .select("tmdb_id, tipo, rating")
        .order("created_at", { ascending: false })
        .range(desde, hasta);
      return { data: data as { tmdb_id: number; tipo: MediaType; rating: number }[] | null, error };
    },
    PAGINA_DESCARTES,
    "los votos",
  );
}

// TODOS los "Mi lista" y "Ya la vi", del más nuevo al más viejo.
//
// Sin tope y paginado, por lo mismo que los votos: con el tope de 200 anterior,
// a partir del registro 201 el título se caía de `excluir` y volvía a aparecer
// RECOMENDADO. El recorte a 200 sigue existiendo, pero solo para las señales y
// en memoria (ver `armarSenales`).
export async function allItems(): Promise<{ tmdb_id: number; tipo: MediaType; kind: string }[]> {
  const sb = supabaseBrowser();
  return paginar<{ tmdb_id: number; tipo: MediaType; kind: string }>(
    async (desde, hasta) => {
      const { data, error } = await sb
        .from("user_items")
        .select("tmdb_id, tipo, kind")
        .in("kind", ["list", "watched"])
        .order("created_at", { ascending: false })
        .range(desde, hasta);
      return { data: data as { tmdb_id: number; tipo: MediaType; kind: string }[] | null, error };
    },
    PAGINA_DESCARTES,
    "Mi lista y Ya la vi",
  );
}
