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
  limit?: number;
}

export function useUpcoming(q: UpcomingQuery = {}) {
  const url = () => {
    const sp = new URLSearchParams();
    if (q.mediaType) sp.set("mediaType", q.mediaType);
    if (q.platform) sp.set("platform", q.platform);
    if (q.month) sp.set("month", q.month);
    if (q.items) sp.set("items", q.items);
    if (q.limit) sp.set("limit", String(q.limit));
    const qs = sp.toString();
    return `/api/upcoming${qs ? `?${qs}` : ""}`;
  };
  const { data, loading, offline, retry } = useApi<{ items: UIUpcoming[] }>(
    url,
    [q.mediaType, q.platform, q.month, q.items, q.limit],
  );
  return { items: data?.items ?? [], loading, offline, retry };
}
