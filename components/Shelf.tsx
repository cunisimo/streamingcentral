"use client";
import { useRef, useEffect } from "react";
import Link from "next/link";
import { useApi } from "./useApi";
import { usePlatforms } from "./PlatformsContext";
import { useShelfType } from "@/hooks/useShelfType";
import TitleCard from "./TitleCard";
import ShelfTypeToggle from "./ShelfTypeToggle";
import { genreLabel } from "./data";
import type { UITitle, MediaType } from "@/lib/types";

// Shelf genérico. Por defecto arma la URL de /api/discover con tipo+género.
// Si se pasa `url` y `title`, usa ese endpoint (ej: /api/latest).
//
// Con `typeToggle` muestra el toggle Películas/Series y recuerda la elección
// por `shelfKey` (localStorage). Dos modos:
//  - "refetch": el tipo entra en la URL de /api/discover → refetch al cambiar.
//  - "filter":  filtra en cliente los ítems ya cargados por `type` (votos).
export default function Shelf({
  tipo, genre, country, title, url, showType, onOffline, seeAllHref,
  typeToggle, shelfKey, initialType, items: controlled, onTypeChange,
}: {
  tipo?: MediaType; genre?: string; country?: string;
  title?: string; url?: string; showType?: boolean;
  // Aviso al contenedor de que el fetch falló por red. Los rieles se auto-ocultan
  // (mejor que N errores iguales), pero si TODOS se ocultan la pantalla queda
  // vacía y sin explicación: CatalogView lo pasa solo al primer riel para poder
  // mostrar un único estado offline. Cubre el caso "hay red pero el server no
  // responde", donde navigator.onLine sigue en true.
  onOffline?: () => void; seeAllHref?: string;
  typeToggle?: "refetch" | "filter"; shelfKey?: string; initialType?: MediaType;
  // Modo controlado: si viene, el riel no fetchea y renderiza estos items.
  // Lo usa el Home (payload de /api/home). Sin esta prop, fetchea como siempre
  // (CategoryView depende de ese modo).
  items?: UITitle[];
  // Solo lo cablea el Home y SOLO en los rieles con typeToggle "refetch": ahí el
  // toggle no refetchea este riel, avisa al composer, que reconstruye el Home
  // entero. Los rieles "filter" no lo reciben: filtran en cliente la lista mixta
  // que ya tienen, así que reconstruir el Home devolvería exactamente lo mismo.
  onTypeChange?: (t: MediaType) => void;
}) {
  const { platforms } = usePlatforms();
  const track = useRef<HTMLDivElement>(null);

  const controladoPor = controlled !== undefined;
  // Quién es dueño del tipo activo:
  //  - Controlado + toggle "refetch" (los rieles de género del Home): el
  //    contenedor. El riel NO guarda estado propio — si lo guardara, ignoraría el
  //    activeType que manda el server después del montaje (dos fuentes de verdad).
  //  - Resto (no controlado, o toggle "filter" que se resuelve en cliente):
  //    useShelfType, con su persistencia en localStorage, igual que siempre.
  const tipoPorProp = controladoPor && typeToggle === "refetch";
  // El hook se llama siempre (reglas de hooks). Con shelfKey vacío queda inerte:
  // ni lee ni escribe localStorage.
  const [ownType, setOwnType] = useShelfType(
    tipoPorProp ? "" : (shelfKey ?? ""), initialType ?? tipo ?? "movie",
  );
  const activeType: MediaType = tipoPorProp ? (initialType ?? tipo ?? "movie") : ownType;
  const changeType = (t: MediaType) => {
    if (!tipoPorProp) setOwnType(t);
    onTypeChange?.(t);
  };

  // En modo refetch el tipo efectivo de /api/discover es el del toggle.
  const effectiveTipo: MediaType | undefined =
    typeToggle === "refetch" ? activeType : tipo;

  const buildUrl = () =>
    url
      ? `${url}${url.includes("?") ? "&" : "?"}providers=${platforms.join(",")}`
      : `/api/discover?tipo=${effectiveTipo}&genre=${genre}&providers=${platforms.join(",")}${country ? `&country=${country}` : ""}`;
  // En modo controlado no se dispara ningún fetch: se pasa una URL vacía y el
  // hook queda inerte (useApi no fetchea con string vacío).
  const { data, loading: fetchLoading, offline } = useApi<{ items: UITitle[] }>(
    () => (controladoPor ? "" : buildUrl()), [effectiveTipo, genre, country, url, controladoPor],
  );

  const loading = controladoPor ? false : fetchLoading;
  const rawItems = controladoPor ? controlled : (data?.items ?? []);
  // En modo filter, acotamos al tipo activo sobre la lista mixta ya cargada.
  const items = typeToggle === "filter"
    ? rawItems.filter((t) => t.type === activeType)
    : rawItems;

  useEffect(() => {
    if (offline && onOffline) onOffline();
  }, [offline, onOffline]);

  // Auto-ocultado solo para rieles SIN toggle. Con toggle, mantenemos header +
  // toggle visibles aunque el tipo activo quede vacío (si no, el usuario no
  // podría volver).
  if (!typeToggle && !loading && items.length < 2) return null;

  const heading = title ?? genreLabel(genre ?? "");
  const tipoLabel = activeType === "movie" ? "películas" : "series";
  const emptyMsg = genre
    ? `No hay ${tipoLabel} de ${genreLabel(genre).toLowerCase()} en tus plataformas`
    : `No hay ${tipoLabel} para mostrar`;

  // "Ver todas" sigue al toggle en los rieles de género (refetch).
  const resolvedSeeAll =
    typeToggle === "refetch" && genre
      ? `/categoria/${genre}?tipo=${activeType}`
      : seeAllHref;

  const scroll = (d: number) => track.current?.scrollBy({ left: d * (track.current.clientWidth * 0.8), behavior: "smooth" });
  return (
    <div className="shelf">
      <div className="shelf-head">
        <div className="shelf-head-l">
          <h2>{heading}{showType && !typeToggle && tipo && <span style={{ color: "var(--faint)", fontWeight: 500, fontSize: "0.75em" }}>{tipo === "movie" ? " · Películas" : " · Series"}</span>}</h2>
          {typeToggle && <ShelfTypeToggle value={activeType} onChange={changeType} />}
        </div>
        <div className="arrows">
          <button className="arrow" onClick={() => scroll(-1)} aria-label="Anterior"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg></button>
          <button className="arrow" onClick={() => scroll(1)} aria-label="Siguiente"><svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg></button>
        </div>
      </div>
      <div className="track" ref={track}>
        {loading ? <span className="loading">Cargando…</span>
          : items.length < 2 ? <span className="empty-note">{emptyMsg}</span>
          : (
            <>
              {items.map((t) => <TitleCard key={`${t.type}-${t.id}`} t={t} />)}
              {resolvedSeeAll && items.length > 0 && (
                <Link href={resolvedSeeAll} className="seeall-card">
                  <span>Ver todas</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
                </Link>
              )}
            </>
          )}
      </div>
    </div>
  );
}
