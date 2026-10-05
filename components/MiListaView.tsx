"use client";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { usePathname } from "next/navigation";
import { useMyList } from "./MyListContext";
import TitleCard from "./TitleCard";
import OfflineState from "./pwa/OfflineState";
import { itemRefs } from "@/lib/userdata";
import { apiUrl } from "@/lib/api-base";
import { consumirVuelta, decidirRestauracionVista, guardarVista } from "@/hooks/lista-paginada-store";
import { abrirMiLista, deTipo, MENSAJE_VACIO_TIPO, type TipoLista } from "@/lib/mi-lista";
import type { UITitle } from "@/lib/types";

// La vista completa de Mi lista (/cuenta/lista) con el selector Películas |
// Series de las categorías (mismas clases `.tipo-toggle`/`.tt`). La lógica vive
// en lib/mi-lista.ts; acá sólo se cablea. Los rieles del hub siguen con
// `UserShelf`, sin selector.
//
// Restauración: el mismo almacén y la misma marca de vuelta que el resto de las
// listas (un solo popstate). La firma es el usuario: otra sesión no hereda el
// snapshot. Las tarjetas van en `datos` y el filtro en `extra`.
const CLAVE = "cuenta:mi-lista";
const PANEL = "mi-lista-panel";
const TIPOS: { tipo: TipoLista; rotulo: string }[] = [
  { tipo: "movie", rotulo: "Películas" },
  { tipo: "tv", rotulo: "Series" },
];
const VACIA = `Todavía no guardaste nada — tocá "Mi lista" en cualquier ficha.`;

async function cargarMiLista(): Promise<UITitle[]> {
  const refs = await itemRefs("list");
  if (!refs.length) return [];
  const q = refs.map((r) => `${r.tipo}:${r.tmdb_id}`).join(",");
  const res = await fetch(apiUrl(`/api/cards?items=${encodeURIComponent(q)}`));
  if (!res.ok) throw new Error(`/api/cards ${res.status}`);
  const data = (await res.json()) as { items?: UITitle[] };
  return data.items ?? [];
}

// `userId` lo da la página, que ya exige sesión. `cargar` es la carga real por
// defecto; se puede inyectar para probar la vista sin sesión.
export default function MiListaView({ userId, cargar = cargarMiLista }: { userId: string; cargar?: () => Promise<UITitle[]> }) {
  const lista = useMyList();
  const ruta = usePathname();
  const [items, setItems] = useState<UITitle[] | null>(null);
  const [tipo, setTipo] = useState<TipoLista>("movie");
  const [fallo, setFallo] = useState(false);
  const [intento, setIntento] = useState(0);
  const decidido = useRef(false);
  const montado = useRef(true);
  const scrollPendiente = useRef<number | null>(null);
  const botones = useRef<Record<TipoLista, HTMLButtonElement | null>>({ movie: null, tv: null });
  // Hasta saber qué hay en la lista no se decide: el snapshot se reconcilia
  // contra eso. Sin el contexto montado (no debería pasar) se carga igual.
  const contextoListo = !lista || lista.loaded;

  useEffect(() => {
    montado.current = true;
    return () => { montado.current = false; };
  }, []);

  // UNA carga al montar (o al reintentar). No depende del filtro.
  useEffect(() => {
    if (!contextoListo || decidido.current) return;
    decidido.current = true;
    const e = decidirRestauracionVista<UITitle[], { tipo: TipoLista }>({ clave: CLAVE, firma: userId, volvio: consumirVuelta(ruta) });
    const snapshot = e?.extra?.tipo ? { datos: { tipo: e.extra.tipo, items: e.datos }, scrollY: e.scrollY } : null;
    abrirMiLista({ snapshot, enLista: lista?.loaded ? lista.asentado : null, cargar })
      .then((v) => {
        if (!montado.current) return;
        scrollPendiente.current = v.scrollY;
        setTipo(v.tipo);
        setItems(v.items);
      })
      .catch(() => { if (montado.current) setFallo(true); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, contextoListo, intento]);

  // El scroll, con las tarjetas ya montadas: el mismo rAF doble que el resto.
  useEffect(() => {
    if (items === null || scrollPendiente.current === null) return;
    const y = scrollPendiente.current;
    scrollPendiente.current = null;
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
  }, [items]);

  // Filtrar lo ya cargado: no sale ninguna consulta.
  const elegir = (nuevo: TipoLista) => setTipo(nuevo);

  // Pestañas por teclado: flechas, Inicio y Fin mueven la selección y el foco.
  // Sólo la pestaña elegida entra en el orden de tabulación.
  const onTecla = (ev: KeyboardEvent<HTMLButtonElement>) => {
    const i = TIPOS.findIndex((x) => x.tipo === tipo);
    let j: number | null = null;
    if (ev.key === "ArrowRight") j = (i + 1) % TIPOS.length;
    else if (ev.key === "ArrowLeft") j = (i - 1 + TIPOS.length) % TIPOS.length;
    else if (ev.key === "Home") j = 0;
    else if (ev.key === "End") j = TIPOS.length - 1;
    if (j === null) return;
    ev.preventDefault();
    const nuevo = TIPOS[j].tipo;
    elegir(nuevo);
    botones.current[nuevo]?.focus();
  };

  useEffect(() => {
    if (items === null) return;
    let pend = false;
    const guardar = () => guardarVista<UITitle[], { tipo: TipoLista }>(CLAVE, { firma: userId, datos: items, extra: { tipo }, scrollY: window.scrollY });
    guardar();
    const onScroll = () => {
      if (pend) return;
      pend = true;
      requestAnimationFrame(() => { pend = false; guardar(); });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [userId, items, tipo]);

  const cabecera = <div className="shelf-head"><h2>Mi lista</h2></div>;

  if (fallo) {
    const reintentar = () => { setFallo(false); decidido.current = false; setIntento((n) => n + 1); };
    return <div className="shelf">{cabecera}<OfflineState onRetry={reintentar} /></div>;
  }
  if (items === null) {
    return <div className="shelf">{cabecera}<div className="track"><span className="loading">Cargando…</span></div></div>;
  }
  if (items.length === 0) {
    return <div className="shelf">{cabecera}<p className="empty-note">{VACIA}</p></div>;
  }

  const visibles = deTipo(items, tipo);
  return (
    <div className="shelf">
      {cabecera}
      <div className="tipo-toggle" role="tablist" aria-label="Tipo de título">
        {TIPOS.map(({ tipo: x, rotulo }) => (
          <button
            key={x}
            id={`mi-lista-tab-${x}`}
            ref={(b) => { botones.current[x] = b; }}
            type="button"
            role="tab"
            aria-selected={tipo === x}
            aria-controls={PANEL}
            tabIndex={tipo === x ? 0 : -1}
            className={`tt ${tipo === x ? "on" : ""}`}
            onClick={() => elegir(x)}
            onKeyDown={onTecla}
          >{rotulo}</button>
        ))}
      </div>
      <div id={PANEL} role="tabpanel" aria-labelledby={`mi-lista-tab-${tipo}`}>
        {visibles.length > 0
          ? <div className="user-grid">{visibles.map((t) => <TitleCard key={`${t.type}-${t.id}`} t={t} />)}</div>
          : <p className="empty-note">{MENSAJE_VACIO_TIPO[tipo]}</p>}
      </div>
    </div>
  );
}
