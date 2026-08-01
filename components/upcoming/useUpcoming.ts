"use client";
import { useApi } from "../useApi";
import type { MediaType, UIUpcoming } from "@/lib/types";

// Consulta de la Agenda de Estrenos contra el read-path existente (/api/upcoming).
// Ya acepta los ejes de los filtros futuros (plataforma, mes, watchlist) para no
// tener que reescribir el consumo cuando se agreguen.
export interface UpcomingQuery {
  mediaType?: MediaType;
  platform?: string; // código interno (n/d/m/...)
  month?: string; // YYYY-MM
  items?: string; // refs de la watchlist: "movie:123,tv:456"
  mix?: boolean; // popurrí pelis+series intercaladas (para el slider)
  limit?: number;
}

export function useUpcoming(q: UpcomingQuery = {}) {
  const url = () => {
    const sp = new URLSearchParams();
    if (q.mediaType) sp.set("mediaType", q.mediaType);
    if (q.platform) sp.set("platform", q.platform);
    if (q.month) sp.set("month", q.month);
    if (q.items) sp.set("items", q.items);
    if (q.mix) sp.set("mix", "1");
    if (q.limit) sp.set("limit", String(q.limit));
    const qs = sp.toString();
    return `/api/upcoming${qs ? `?${qs}` : ""}`;
  };
  const { data, loading, offline, retry } = useApi<{ items?: UIUpcoming[]; error?: string }>(
    url,
    [q.mediaType, q.platform, q.month, q.items, q.mix, q.limit],
  );
  // `offline` = fallo de red (useApi). `error` = el server respondió 500 con
  // { error } (ej. falla de Supabase). Distinguir esto del vacío real (200 sin
  // error) es lo que habilita el estado de error separado que pide el spec.
  return { items: data?.items ?? [], loading, offline, error: !!data?.error, retry };
}
