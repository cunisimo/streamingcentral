"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { usePlatforms } from "./PlatformsContext";
import TitleCard from "./TitleCard";
import OfflineState from "./pwa/OfflineState";
import { useOnline } from "@/hooks/useOnline";
import { useListaPaginada } from "@/hooks/useListaPaginada";
import type { UITitle, MediaType } from "@/lib/types";
import { apiUrl } from "@/lib/api-base";

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

  // La firma son SOLO las plataformas. El tipo activo NO va acá aunque también
  // cambie qué lista es: la vista monta siempre en `movie`, así que una firma
  // `movie|…` nunca coincidiría con una guardada `tv|…` y `leerLista` borraría
  // el estado antes de que nadie pudiera leer que el toggle estaba en Series.
  // El tipo es algo que se RESTAURA, así que viaja en `extra`.
  const firma = platforms.join(",");
  const { fase, inicial, reiniciar } = useListaPaginada<UITitle, { tipo: MediaType }>({
    clave: "lista:ultimos",
    firma,
    items,
    pagina: page,
    hayMas: !done,
    extra: { tipo },
    listo: !loading && items.length > 0,
  });

  const load = useCallback(async (t: MediaType, p: number) => {
    const myReq = ++reqId.current;
    setLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/latest?tipo=${t}&page=${p}&providers=${platforms.join(",")}`));
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

  // Montaje: restaurar o empezar limpio. Corre UNA sola vez (`aplicado`), y esa
  // es la parte que importa. Sin el candado, la secuencia "restauro Películas →
  // toggle a Series → toggle de vuelta a Películas" volvía a aplicar el
  // `inicial` que quedó en el estado del hook y resucitaba las páginas viejas
  // en vez de arrancar Películas de cero.
  //
  // Espera a que `useListaPaginada` decida: si pidiera la página 1 antes, se
  // pagarían dos cargas y la restaurada pisaría a la otra con un parpadeo.
  // Se recuerda QUÉ FIRMA se aplicó, no "si ya monté". Un booleano de primera
  // vez no alcanza: `platforms` llega vacío y se completa un render después, así
  // que `ready` ya es true cuando la firma pasa de "" a "n,d,m". Con un "saltar
  // el primer disparo" eso contaba como cambio de plataformas y recargaba la
  // página 1 encima de lo que se acababa de restaurar — el bug era ese, y por
  // eso la comparación es contra el valor y no contra un contador.
  const firmaAplicada = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || fase !== "listo") return;

    if (firmaAplicada.current === null) {
      firmaAplicada.current = firma;
      if (inicial) {
        // El tipo se restaura junto con los items y NO dispara carga: desde acá
        // el toggle lo maneja `switchTipo`, así que `tipo` no es una dependencia
        // que recargue.
        if (inicial.extra?.tipo) setTipo(inicial.extra.tipo);
        setItems(inicial.items);
        setPage(inicial.pagina);
        setDone(!inicial.hayMas);
        setLoading(false);
        return;
      }
      // Entrada normal: `decidirRestauracion` ya tiró lo guardado, pero
      // "empezar desde arriba" es la otra mitad y hay que pedirla — una
      // navegación SPA puede llegar con scroll heredado de la pantalla anterior.
      reiniciar();
      setPage(1);
      load(tipo, 1);
      return;
    }

    if (firmaAplicada.current === firma) return;
    // Cambió de plataformas: la lista es otra, se empieza de cero y arriba.
    firmaAplicada.current = firma;
    reiniciar();
    setItems([]);
    setDone(false);
    setPage(1);
    load(tipo, 1);
    // `tipo` fuera de las dependencias a propósito: cuando cambia el toggle
    // recarga `switchTipo`, no este efecto. En la rama de cambio de firma el
    // efecto sí vuelve a correr, así que el `tipo` del closure está fresco.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, fase, inicial, firma, load, reiniciar]);

  function switchTipo(t: MediaType) {
    if (t === tipo) return;
    // Cambiar de tipo es empezar otra lista: se tira lo guardado y se vuelve
    // arriba, igual que un cambio de plataformas.
    reiniciar();
    setItems([]);
    setDone(false);
    setPage(1);
    setTipo(t);
    load(t, 1);
  }
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
