"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import UpcomingCard from "./UpcomingCard";
import OfflineState from "../pwa/OfflineState";
import { useOnline } from "@/hooks/useOnline";
import { useEstadoSimple } from "@/hooks/useEstadoSimple";
import type { UIUpcoming } from "@/lib/types";
import { apiUrl } from "@/lib/api-base";

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

  // Volver de una ficha tiene que devolver el filtro, los items y la posición.
  // NO es una lista paginada —trae todo de una con `limit=100`—, así que va por
  // el mecanismo simple y no por `useListaPaginada`.
  //
  // La firma queda vacía a propósito: la agenda no depende de las plataformas
  // elegidas (el motor ya la acota a títulos con provider AR), así que no hay
  // nada que la invalide. El filtro va en `extra`, que es lo que se restaura.
  const { fase, inicial } = useEstadoSimple<UIUpcoming[], { filtro: Filtro }>({
    clave: "proximamente",
    firma: "",
    datos: items,
    extra: { filtro },
    listo: !loading && items.length > 0,
    vacio: items.length === 0,
  });

  const load = useCallback(async (f: Filtro) => {
    const myReq = ++reqId.current;
    setLoading(true);
    try {
      const mt = f === "all" ? "" : `mediaType=${f}&`;
      const res = await fetch(apiUrl(`/api/upcoming?${mt}limit=100`));
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

  // Restaurar ANTES de pedir nada: sin esto se dispara el fetch del filtro por
  // defecto y después lo pisa lo restaurado — dos cargas, un parpadeo y una
  // llamada de red que no hacía falta.
  const restaurado = useRef(false);
  useEffect(() => {
    if (fase !== "listo" || restaurado.current) return;
    restaurado.current = true;
    if (inicial) {
      setItems(inicial.datos);
      if (inicial.extra?.filtro) setFiltro(inicial.extra.filtro);
      setLoading(false);
      return;   // los items volvieron del snapshot: no se pide nada
    }
    load(filtro);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase, inicial]);

  // Los cambios de filtro POSTERIORES sí piden. El guard de `restaurado` evita
  // que este efecto dispare la carga inicial por duplicado.
  const filtroPrevio = useRef<Filtro | null>(null);
  useEffect(() => {
    if (!restaurado.current) return;
    if (filtroPrevio.current === null) { filtroPrevio.current = filtro; return; }
    if (filtroPrevio.current === filtro) return;
    filtroPrevio.current = filtro;
    // Cambiar de filtro es una acción deliberada: lista nueva y arriba de todo.
    window.scrollTo(0, 0);
    load(filtro);
  }, [filtro, load]);

  if ((!online || failed) && !items.length) {
    return <div className="wrap"><OfflineState onRetry={() => load(filtro)} /></div>;
  }

  return (
    <div className="wrap">
      <div className="compact-head"><h1>Próximamente en streaming</h1></div>
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
