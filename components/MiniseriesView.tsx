"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { usePlatforms } from "./PlatformsContext";
import TitleCard from "./TitleCard";
import OfflineState from "./pwa/OfflineState";
import { useOnline } from "@/hooks/useOnline";
import { MINISERIES_TITULO } from "@/lib/miniseries";
import type { UITitle } from "@/lib/types";

// "Ver todas" del riel de miniseries.
//
// Misma estructura que UltimosView —el otro listado paginado— pero SIN el toggle
// Películas/Series: una miniserie-película no existe, el conmutador ofrecería un
// lado vacío.
//
// El fin de la lista lo dice el server (`hayMas`), no el tamaño de la respuesta.
// Cortar por "vinieron menos de 20" sería un bug silencioso: el filtro estricto
// de plataformas puede achicar una página y el resto del catálogo quedaría sin
// mostrar. Es la diferencia con `done = got.length === 0` de UltimosView.
export default function MiniseriesView() {
  const { platforms, ready } = usePlatforms();
  const [items, setItems] = useState<UITitle[]>([]);
  const [page, setPage] = useState(1);
  const [hayMas, setHayMas] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const online = useOnline();
  const [failed, setFailed] = useState(false);
  const reqId = useRef(0);

  const load = useCallback(async (p: number) => {
    const myReq = ++reqId.current;
    setLoading(true);
    try {
      const res = await fetch(`/api/miniseries?page=${p}&providers=${platforms.join(",")}`);
      const j = await res.json();
      if (myReq !== reqId.current) return; // respuesta obsoleta: descartar
      const got: UITitle[] = j.items ?? [];
      // Dedup al concatenar. Con la consulta combinada no puede haber repetidos
      // entre páginas (el orden lo fija TMDB y no se reconstruye), así que esto
      // es un cinturón, no el mecanismo: si algún día vuelve a repetirse algo,
      // que no se vea en pantalla mientras se investiga.
      setItems((prev) => {
        if (p === 1) return got;
        const vistos = new Set(prev.map((t) => `${t.type}:${t.id}`));
        return [...prev, ...got.filter((t) => !vistos.has(`${t.type}:${t.id}`))];
      });
      setHayMas(!!j.hayMas);
      if (typeof j.total === "number") setTotal(j.total);
      setFailed(false);
    } catch {
      if (myReq === reqId.current) setFailed(true);
    } finally {
      if (myReq === reqId.current) setLoading(false);
    }
  }, [platforms]);

  // Carga inicial y al cambiar plataformas: siempre vuelve a la página 1.
  useEffect(() => { if (!ready) return; setPage(1); load(1); }, [load, ready]);

  const more = () => { const next = page + 1; setPage(next); load(next); };

  if ((!online || failed) && !items.length) {
    return <div className="wrap"><OfflineState onRetry={() => load(1)} /></div>;
  }

  return (
    <div className="wrap">
      <div className="compact-head"><h1>{MINISERIES_TITULO}</h1></div>
      <p className="section-sub">
        {loading && !items.length
          ? "Cargando…"
          : `${items.length}${total && total > items.length ? ` de ${total}` : ""} título${items.length !== 1 ? "s" : ""} en tus plataformas`}
      </p>
      <div className="grid">
        {items.map((t) => <TitleCard key={`${t.type}-${t.id}`} t={t} />)}
        {!loading && !items.length && <p className="empty-note">Nada por acá con tus plataformas.</p>}
      </div>
      {loading && <p className="loading">Cargando…</p>}
      {hayMas && !loading && items.length > 0 && (
        <div style={{ textAlign: "center", marginTop: 20 }}>
          <button className="btn ghost" onClick={more}>Cargar más</button>
        </div>
      )}
    </div>
  );
}
