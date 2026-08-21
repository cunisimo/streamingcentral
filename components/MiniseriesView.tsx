"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { usePlatforms } from "./PlatformsContext";
import TitleCard from "./TitleCard";
import OfflineState from "./pwa/OfflineState";
import { useOnline } from "@/hooks/useOnline";
import { useListaPaginada } from "@/hooks/useListaPaginada";
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
  const firma = platforms.join(",");

  const { fase, inicial, reiniciar } = useListaPaginada<UITitle, { total: number | null }>({
    clave: "lista:miniseries",
    firma,
    items,
    pagina: page,
    hayMas,
    // El total del catálogo también vuelve: si no, el subtítulo pasaba de
    // "60 de 627 títulos" a "60 títulos" justo al volver.
    extra: { total },
    listo: !loading && items.length > 0,
  });

  const load = useCallback(async (p: number) => {
    const myReq = ++reqId.current;
    setLoading(true);
    try {
      const res = await fetch(`/api/miniseries?page=${p}&providers=${platforms.join(",")}`);
      const j = await res.json();
      if (myReq !== reqId.current) return; // respuesta obsoleta: descartar
      const got: UITitle[] = j.items ?? [];
      // Dedup al concatenar. La consulta combinada saca la causa que estaba de
      // nuestro lado (reordenar una unión que crece), pero el orden sigue siendo
      // de TMDB: si recalculan la popularidad entre dos pedidos, dos páginas
      // pueden solaparse. Es la limitación normal de paginar una API ajena, así
      // que esto queda como defensa permanente y no como un parche temporal.
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

  // Montaje: restaurar o empezar limpio. Corre UNA sola vez (`aplicado`), para
  // que un `inicial` ya consumido no pueda volver a aplicarse más tarde.
  //
  // Espera a que `useListaPaginada` decida: si pidiera la página 1 antes, se
  // pagarían dos cargas y la restaurada pisaría a la otra con un parpadeo. Si
  // restauró, no se pide NADA — los títulos ya están.
  // Se recuerda QUÉ FIRMA se aplicó, no "si ya monté". Un booleano de primera
  // vez no alcanza: `platforms` llega vacío y se completa un render después, así
  // que `ready` ya es true cuando la firma pasa de "" a "n,d,m", y eso contaba
  // como cambio de plataformas: recargaba la página 1 encima de lo recién
  // restaurado. Por eso la comparación es contra el valor.
  const firmaAplicada = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || fase !== "listo") return;

    if (firmaAplicada.current === null) {
      firmaAplicada.current = firma;
      if (inicial) {
        setItems(inicial.items);
        setPage(inicial.pagina);
        setHayMas(inicial.hayMas);
        setTotal(inicial.extra?.total ?? null);
        setLoading(false);
        return;
      }
      // Entrada normal: `decidirRestauracion` ya tiró lo guardado, pero
      // "empezar desde arriba" es la otra mitad y hay que pedirla — una
      // navegación SPA puede llegar con scroll heredado de la pantalla anterior.
      reiniciar();
      setPage(1);
      load(1);
      return;
    }

    if (firmaAplicada.current === firma) return;
    // Cambió de plataformas: la lista es otra, se empieza de cero y arriba.
    firmaAplicada.current = firma;
    reiniciar();
    setItems([]);
    setHayMas(false);
    setTotal(null);
    setPage(1);
    load(1);
  }, [load, ready, fase, inicial, firma, reiniciar]);

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
