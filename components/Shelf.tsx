"use client";
import { useRef, useEffect } from "react";
import { useApi } from "./useApi";
import { usePlatforms } from "./PlatformsContext";
import TitleCard from "./TitleCard";
import { genreLabel } from "./data";
import type { UITitle, MediaType } from "@/lib/types";

// Shelf genérico. Por defecto arma la URL de /api/discover con tipo+género.
// Si se pasa `url` y `title`, usa ese endpoint (ej: /api/latest).
export default function Shelf({
  tipo, genre, country, title, url, showType, onOffline,
}: {
  tipo?: MediaType; genre?: string; country?: string;
  title?: string; url?: string; showType?: boolean;
  // Aviso al contenedor de que el fetch falló por red. Los rieles se auto-ocultan
  // (mejor que N errores iguales), pero si TODOS se ocultan la pantalla queda
  // vacía y sin explicación: CatalogView lo pasa solo al primer riel para poder
  // mostrar un único estado offline. Cubre el caso "hay red pero el server no
  // responde", donde navigator.onLine sigue en true.
  onOffline?: () => void;
}) {
  const { platforms } = usePlatforms();
  const track = useRef<HTMLDivElement>(null);
  const buildUrl = () =>
    url
      ? `${url}${url.includes("?") ? "&" : "?"}providers=${platforms.join(",")}`
      : `/api/discover?tipo=${tipo}&genre=${genre}&providers=${platforms.join(",")}${country ? `&country=${country}` : ""}`;
  const { data, loading, offline } = useApi<{ items: UITitle[] }>(buildUrl, [tipo, genre, country, url]);
  const items = data?.items ?? [];

  useEffect(() => {
    if (offline && onOffline) onOffline();
  }, [offline, onOffline]);

  if (!loading && items.length < 2) return null;

  const heading = title ?? genreLabel(genre ?? "");
  const scroll = (d: number) => track.current?.scrollBy({ left: d * (track.current.clientWidth * 0.8), behavior: "smooth" });
  return (
    <div className="shelf">
      <div className="shelf-head">
        <h2>{heading}{showType && tipo && <span style={{ color: "var(--faint)", fontWeight: 500, fontSize: "0.75em" }}>{tipo === "movie" ? " · Películas" : " · Series"}</span>}</h2>
        <div className="arrows">
          <button className="arrow" onClick={() => scroll(-1)} aria-label="Anterior"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg></button>
          <button className="arrow" onClick={() => scroll(1)} aria-label="Siguiente"><svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg></button>
        </div>
      </div>
      <div className="track" ref={track}>
        {loading ? <span className="loading">Cargando…</span> : items.map((t) => <TitleCard key={`${t.type}-${t.id}`} t={t} />)}
      </div>
    </div>
  );
}
