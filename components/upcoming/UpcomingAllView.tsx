"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import UpcomingCard from "./UpcomingCard";
import OfflineState from "../pwa/OfflineState";
import { useOnline } from "@/hooks/useOnline";
import type { UIUpcoming } from "@/lib/types";

type Filtro = "all" | "movie" | "tv";

// "Ver todas" de Próximamente: grilla completa con filtro Todos/Películas/Series.
// La agenda es un set acotado (solo títulos con provider AR), así que se trae
// todo de una (limit alto) sin paginación.
export default function UpcomingAllView() {
  const [filtro, setFiltro] = useState<Filtro>("all");
  const [items, setItems] = useState<UIUpcoming[]>([]);
  const [loading, setLoading] = useState(true);
  const online = useOnline();
  const [failed, setFailed] = useState(false);
  const reqId = useRef(0);

  const load = useCallback(async (f: Filtro) => {
    const myReq = ++reqId.current;
    setLoading(true);
    try {
      const mt = f === "all" ? "" : `mediaType=${f}&`;
      const res = await fetch(`/api/upcoming?${mt}limit=100`);
      const j = await res.json();
      if (myReq !== reqId.current) return; // respuesta obsoleta
      if (!res.ok) throw new Error(j?.error ?? "error");
      setItems(j.items ?? []);
      setFailed(false);
    } catch {
      if (myReq === reqId.current) setFailed(true);
    } finally {
      if (myReq === reqId.current) setLoading(false);
    }
  }, []);

  useEffect(() => { load(filtro); }, [filtro, load]);

  if ((!online || failed) && !items.length) {
    return <div className="wrap"><OfflineState onRetry={() => load(filtro)} /></div>;
  }

  return (
    <div className="wrap">
      <div className="compact-head"><h1>Próximamente</h1></div>
      <div className="tipo-toggle" role="tablist">
        <button role="tab" aria-selected={filtro === "all"} className={`tt ${filtro === "all" ? "on" : ""}`} onClick={() => setFiltro("all")}>Todos</button>
        <button role="tab" aria-selected={filtro === "movie"} className={`tt ${filtro === "movie" ? "on" : ""}`} onClick={() => setFiltro("movie")}>Películas</button>
        <button role="tab" aria-selected={filtro === "tv"} className={`tt ${filtro === "tv" ? "on" : ""}`} onClick={() => setFiltro("tv")}>Series</button>
      </div>
      <div className="grid">
        {items.map((it) => <UpcomingCard key={`${it.type}-${it.id}`} item={it} />)}
        {!loading && !items.length && <p className="empty-note">No hay estrenos próximos para mostrar.</p>}
      </div>
      {loading && <p className="loading">Cargando…</p>}
    </div>
  );
}
