"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { usePlatforms } from "./PlatformsContext";
import TitleCard from "./TitleCard";
import OfflineState from "./pwa/OfflineState";
import { useOnline } from "@/hooks/useOnline";
import { useListaPaginada } from "@/hooks/useListaPaginada";
import type { UITitle, MediaType } from "@/lib/types";

export default function UltimosView() {
  const { platforms, ready } = usePlatforms();
  const [tipo, setTipo] = useState<MediaType>("movie");
  const [items, setItems] = useState<UITitle[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false); // una página vacía = fin
  const online = useOnline();
  const [failed, setFailed] = useState(false);
  const reqId = useRef(0);

  // El tipo activo entra en la firma junto con las plataformas: son las dos
  // cosas que cambian QUÉ lista es. Volver de una ficha estando en "Series" no
  // puede restaurar la tanda de "Películas".
  const firma = `${tipo}|${platforms.join(",")}`;
  const { fase, inicial, reiniciar } = useListaPaginada<UITitle>({
    clave: "lista:ultimos",
    firma,
    items,
    pagina: page,
    hayMas: !done,
    listo: !loading && items.length > 0,
  });

  const load = useCallback(async (t: MediaType, p: number) => {
    const myReq = ++reqId.current;
    setLoading(true);
    try {
      const res = await fetch(`/api/latest?tipo=${t}&page=${p}&providers=${platforms.join(",")}`);
      const j = await res.json();
      if (myReq !== reqId.current) return; // respuesta obsoleta: descartar
      const got: UITitle[] = j.items ?? [];
      setItems((prev) => (p === 1 ? got : [...prev, ...got]));
      setDone(got.length === 0);
      setFailed(false);
    } catch {
      if (myReq === reqId.current) setFailed(true);
    } finally {
      if (myReq === reqId.current) setLoading(false);
    }
  }, [platforms]);

  // Carga inicial + al cambiar tipo o plataformas: reset a página 1.
  //
  // Espera a que `useListaPaginada` decida si hay algo que restaurar. Si lo hay,
  // no se pide nada: los títulos ya cargados vuelven tal cual, junto con la
  // página en la que iba y la posición del scroll.
  useEffect(() => {
    if (!ready || fase !== "listo") return;
    if (inicial && inicial.firma === firma) {
      setItems(inicial.items);
      setPage(inicial.pagina);
      setDone(!inicial.hayMas);
      setLoading(false);
      return;
    }
    reiniciar();
    setPage(1);
    load(tipo, 1);
  }, [tipo, load, ready, fase, inicial, firma, reiniciar]);

  function switchTipo(t: MediaType) { if (t !== tipo) { setItems([]); setDone(false); setTipo(t); } }
  function more() { const next = page + 1; setPage(next); load(tipo, next); }

  if ((!online || failed) && !items.length) {
    return <div className="wrap"><OfflineState onRetry={() => load(tipo, 1)} /></div>;
  }

  return (
    <div className="wrap">
      <div className="compact-head"><h1>Últimos lanzamientos</h1></div>
      <div className="tipo-toggle" role="tablist">
        <button role="tab" aria-selected={tipo === "movie"} className={`tt ${tipo === "movie" ? "on" : ""}`} onClick={() => switchTipo("movie")}>Películas</button>
        <button role="tab" aria-selected={tipo === "tv"} className={`tt ${tipo === "tv" ? "on" : ""}`} onClick={() => switchTipo("tv")}>Series</button>
      </div>
      <div className="grid">
        {items.map((t) => <TitleCard key={`${t.type}-${t.id}`} t={t} />)}
        {!loading && !items.length && <p className="empty-note">Nada por acá con tus plataformas.</p>}
      </div>
      {loading && <p className="loading">Cargando…</p>}
      {!done && !loading && items.length > 0 && (
        <div style={{ textAlign: "center", marginTop: 20 }}>
          <button className="btn ghost" onClick={more}>Cargar más</button>
        </div>
      )}
    </div>
  );
}
