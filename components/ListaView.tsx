"use client";
import { useEffect, useRef, useState } from "react";
import { useApi } from "./useApi";
import { consumirVuelta, decidirRestauracionVista, guardarVista } from "@/hooks/lista-paginada-store";
import { usePlatforms } from "./PlatformsContext";
import TitleCard from "./TitleCard";
import OfflineState from "./pwa/OfflineState";
import type { UITitle } from "@/lib/types";

export default function ListaView({ endpoint, title }: { endpoint: string; title: string }) {
  const { platforms } = usePlatforms();
  const clave = `lista:${endpoint}`;
  const firma = platforms.join(",");

  // Estas listas no tienen filtros ni paginación: lo único que se perdía era la
  // POSICIÓN, y se perdía siempre. Medido el 22/08 en /lista/mas-votados: a los
  // 900 ms de volver la página medía 527 px con 0 tarjetas, el navegador
  // restauró contra un documento sin altura y aterrizó en 0.
  //
  // LA DECISIÓN VA ANTES DEL FETCH, y por eso no se usa `useEstadoSimple` acá:
  // ese hook decide en un efecto, y para entonces `useApi` ya salió a pedir. Al
  // restaurar NO se pide nada — los títulos vuelven del snapshot.
  const [restaurado, setRestaurado] = useState<UITitle[] | null>(null);
  const [decidido, setDecidido] = useState(false);
  const pendiente = useRef<number | null>(null);
  useEffect(() => {
    const e = decidirRestauracionVista<UITitle[]>({ clave, firma, volvio: consumirVuelta(window.location.pathname) });
    if (e) { setRestaurado(e.datos); pendiente.current = e.scrollY; }
    setDecidido(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  const { data, loading, offline, error, retry } = useApi<{ items: UITitle[] }>(
    // URL vacía = `useApi` no fetchea. Mientras se decide, y si se restauró,
    // no sale ni un request.
    () => (!decidido || restaurado ? "" : `${endpoint}${endpoint.includes("?") ? "&" : "?"}providers=${platforms.join(",")}`),
    [endpoint, decidido, !!restaurado],
  );
  const items = restaurado ?? data?.items ?? [];

  // El scroll, con las tarjetas ya montadas. Mismo rAF doble que el resto.
  useEffect(() => {
    if (!items.length || pendiente.current === null) return;
    const y = pendiente.current;
    pendiente.current = null;
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
  }, [items.length]);

  useEffect(() => {
    if (!decidido || !items.length) return;
    let pend = false;
    const guardar = () => guardarVista<UITitle[]>(clave, { firma, datos: items, scrollY: window.scrollY });
    guardar();
    const onScroll = () => {
      if (pend) return;
      pend = true;
      requestAnimationFrame(() => { pend = false; guardar(); });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [clave, firma, items, decidido]);

  if ((offline || error) && !items.length) return <div className="wrap"><OfflineState onRetry={retry} /></div>;
  return (
    <div className="wrap">
      <div className="compact-head"><h1>{title}</h1></div>
      <p className="section-sub">{loading && !items.length ? "Cargando…" : `${items.length} título${items.length !== 1 ? "s" : ""} en tus plataformas`}</p>
      <div className="grid">
        {items.map((t) => <TitleCard key={`${t.type}-${t.id}`} t={t} />)}
        {!loading && !items.length && <p className="empty-note">Nada por acá con tus plataformas.</p>}
      </div>
    </div>
  );
}
