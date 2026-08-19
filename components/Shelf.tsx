"use client";
import { useRef, useEffect } from "react";
import Link from "next/link";
import { useApi } from "./useApi";
import { usePlatforms } from "./PlatformsContext";
import { useShelfType } from "@/hooks/useShelfType";
import TitleCard from "./TitleCard";
import { debeReiniciar, olvidarTrack, useTrackScroll } from "@/hooks/useTrackScroll";
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
  tipo, genre, country, title, url, onOffline, seeAllHref,
  typeToggle, shelfKey, initialType, items: controlled, onTypeChange, minItems, onDescartar,
}: {
  tipo?: MediaType; genre?: string; country?: string;
  title?: string; url?: string;
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
  // Mínimo de ítems para renderizar el riel (default 2). Ver el comentario de
  // `minimo` más abajo.
  minItems?: number;
  // "No es para mí" sobre cada card. Lo pasa SOLO "Elegidas para vos": sin este
  // prop la card no dibuja el botón, así que ningún otro riel puede mostrarlo.
  onDescartar?: (t: UITitle) => void;
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
  // La clave del scroll. `shelfKey` solo lo mandan los rieles del Home; para el
  // resto alcanza el encabezado, que es estable dentro de una misma página.
  const claveTrack = shelfKey ?? (title ?? genreLabel(genre ?? ""));

  const changeType = (t: MediaType) => {
    // Tocar el toggle que YA está activo no es un cambio: es un no-op completo y
    // se sale acá. No alcanza con saltear el reset del scroll — `onTypeChange`
    // es lo caro: en el Home rearma el payload entero con una clave de cache
    // nueva (ver la nota del Home Composer en CLAUDE.md, el toggle es el segundo
    // consumidor de cuota después del TTL). Un clic que no cambia nada no tiene
    // por qué pagar eso, ni hacer parpadear el riel con un `loading`.
    if (!debeReiniciar(activeType, t)) return;

    // El contenido nuevo SIEMPRE empieza desde el principio. Llegar al final de
    // Películas y pasar a Series te dejaba en la misma posición horizontal sobre
    // otra lista: mirabas el final de un riel que recién empezaba.
    //
    // Y no alcanza con asignar `scrollLeft = 0`, que es lo primero que uno hace.
    // En los rieles `refetch` el contenido llega DESPUÉS, y ahí `useTrackScroll`
    // se vuelve a ejecutar (`listo` pasa de false a true) y restaura la posición
    // guardada, deshaciendo el reset. Por eso además se OLVIDA el valor: así la
    // restauración pone 0 y las dos cosas quedan de acuerdo.
    //
    // Sin animación a propósito: el contenido está cambiando, así que un
    // desplazamiento suave sería una animación sobre tarjetas que ya no son las
    // mismas.
    olvidarTrack(claveTrack);
    if (track.current) track.current.scrollLeft = 0;

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

  // Cuántos ítems hacen falta para mostrar el riel. El default de 2 evita un
  // carrusel de una sola tarjeta, que se ve roto. Los rieles de votos lo bajan
  // a 1: ahí el tope no lo pone el algoritmo sino cuánta gente votó, y esconder
  // el único título votado es peor que mostrarlo solo.
  const minimo = minItems ?? 2;
  const heading = title ?? genreLabel(genre ?? "");

  // Recuerda el scroll horizontal entre navegaciones. Va ANTES del return
  // temprano de abajo: un hook no puede quedar detrás de un return condicional.
  // `shelfKey` solo lo mandan los rieles del Home; para el resto alcanza el
  // encabezado, que es estable dentro de una misma página.
  useTrackScroll(claveTrack, track, !loading && items.length >= minimo);

  // Auto-ocultado solo para rieles SIN toggle. Con toggle, mantenemos header +
  // toggle visibles aunque el tipo activo quede vacío (si no, el usuario no
  // podría volver).
  if (!typeToggle && !loading && items.length < minimo) return null;
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
          <h2>{heading}</h2>
          {typeToggle && <ShelfTypeToggle value={activeType} onChange={changeType} />}
        </div>
        <div className="arrows">
          <button className="arrow" onClick={() => scroll(-1)} aria-label="Anterior"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg></button>
          <button className="arrow" onClick={() => scroll(1)} aria-label="Siguiente"><svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg></button>
        </div>
      </div>
      <div className="track" ref={track}>
        {loading ? <span className="loading">Cargando…</span>
          : items.length < minimo ? <span className="empty-note">{emptyMsg}</span>
          : (
            <>
              {items.map((t) => <TitleCard key={`${t.type}-${t.id}`} t={t} onDescartar={onDescartar} />)}
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
