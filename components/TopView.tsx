"use client";
import { useRef, useState } from "react";
import { useApi } from "./useApi";
import { usePlatforms } from "./PlatformsContext";
import { useShelfType } from "@/hooks/useShelfType";
import { useOnline } from "@/hooks/useOnline";
import ShelfTypeToggle from "./ShelfTypeToggle";
import TitleCard from "./TitleCard";
import PlatformLogo from "./PlatformLogo";
import OfflineState from "./pwa/OfflineState";
import { platformByCode } from "@/lib/providers-ar";
import type { TopBlock, TopPayload } from "@/lib/top";

const NOTA =
  "El top de Netflix sale de los datos que la propia Netflix publica cada semana " +
  "para Argentina: son horas vistas reales, de la semana que cerró el domingo. " +
  "En el resto de las plataformas no hay dato público de consumo, así que " +
  "mostramos las más populares del momento — no es lo mismo, y por eso lo " +
  "aclaramos.";

function Bloque({ b }: { b: TopBlock }) {
  const track = useRef<HTMLDivElement>(null);
  const [nota, setNota] = useState(false);
  const def = platformByCode(b.platform);
  const scroll = (d: number) =>
    track.current?.scrollBy({ left: d * (track.current.clientWidth * 0.8), behavior: "smooth" });

  return (
    <div className="shelf">
      <div className="shelf-head">
        <div className="shelf-head-l">
          {/* El wordmark de PlatformLogo YA es el nombre de la plataforma en su
              tipografía de marca: poner además `def.name` al lado lo duplica
              ("NETFLIX Netflix"). El aria-label deja el nombre para lectores. */}
          <h2 aria-label={def?.name ?? b.platform}><PlatformLogo code={b.platform} /></h2>
          {b.source === "netflix" && (
            <button
              type="button" className="top-info" aria-label="De dónde sale este dato"
              // `aria-controls` apunta al párrafo que este botón muestra/oculta:
              // sin esto, `aria-expanded` dice que algo se expandió pero un
              // lector de pantalla no tiene forma de saber qué es.
              aria-expanded={nota} aria-controls={`top-nota-${b.platform}`}
              onClick={() => setNota((v) => !v)}
            >i</button>
          )}
        </div>
        <div className="arrows">
          <button className="arrow" onClick={() => scroll(-1)} aria-label="Anterior"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg></button>
          <button className="arrow" onClick={() => scroll(1)} aria-label="Siguiente"><svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg></button>
        </div>
      </div>
      <p className="top-sub">
        {b.source === "netflix" ? "Lo más visto esta semana · dato oficial" : "Lo más popular ahora"}
      </p>
      {nota && <p className="top-nota" id={`top-nota-${b.platform}`}>{NOTA}</p>}
      <div className="track" ref={track}>
        {b.slots.map((s) =>
          s.item
            ? <TitleCard key={`${s.rank}-${s.item.id}`} t={s.item} rank={s.rank} />
            : (
              <div className="card rank-slot" key={`vacio-${s.rank}`}>
                <div className="poster">
                  <span className="rank-num">{s.rank}</span>
                  <div className="ptitle rank-shift">{s.rawTitle}</div>
                </div>
                <div className="meta"><div className="info">Ficha no disponible</div></div>
              </div>
            ),
        )}
      </div>
    </div>
  );
}

export default function TopView() {
  const online = useOnline();
  const { platforms } = usePlatforms();
  const [tipo, setTipo] = useShelfType("top", "movie");
  // Mismo patrón que CatalogView con el Home: hay que leer `error` además de
  // `offline`, si no un 500 (body con `{ error, ... }`) se toma como si no
  // hubiera pasado nada y la pantalla queda en blanco bajo el toggle, sin
  // aviso ni reintento.
  const { data, loading, offline, error, retry } = useApi<TopPayload>(
    () => `/api/top?tipo=${tipo}&providers=${platforms.join(",")}`,
    [tipo, platforms.join(",")],
    { keepPrevious: true },
  );

  const mine = data?.mine ?? [];
  const others = data?.others ?? [];
  const hayContenido = mine.length > 0 || others.length > 0;
  // 200 pero con bloques caídos (`safe` en lib/top.ts los descartó): distinto de
  // "esa plataforma no tiene top hoy". Mismo criterio que CatalogView con el
  // Home — reintentar sí puede arreglarlo.
  const degradado = !!data?.degradado;
  const cargando = loading;
  // `error` = el server respondió 500. `offline` = no hubo respuesta. `degradado`
  // = respondió 200 pero con bloques caídos. Los tres ameritan el mismo aviso
  // con reintento.
  const fallo = !online || offline || error || degradado;

  // Pantalla completa SOLO cuando no hay nada que mostrar todavía: si ya hay
  // bloques en pantalla, un refetch fallido no los borra (keepPrevious) — se
  // avisa arriba y se ofrece reintentar sin tapar lo que sí cargó.
  if (!hayContenido && !cargando && (!online || offline)) {
    return <div className="wrap"><OfflineState onRetry={retry} /></div>;
  }

  return (
    <div className="wrap">
      <h1 className="section-title">Top Yump</h1>
      <p className="section-sub">Lo que más se está viendo en Argentina.</p>
      <div className="top-toggle">
        <ShelfTypeToggle value={tipo} onChange={setTipo} />
      </div>

      {fallo && hayContenido && (
        <p className="empty-note home-retry" role="status">
          {degradado && online && !offline && !error
            ? "No pudimos cargar todo el top."
            : "No pudimos actualizar el top."}{" "}
          <button className="up-retry" onClick={retry}>Reintentar</button>
        </p>
      )}

      {!hayContenido ? (
        cargando ? (
          <div className="loading">Cargando…</div>
        ) : (
          // Payload llegó (o el fetch falló con error/degradado) y no hay un
          // solo bloque: antes esto era una pantalla vacía y muda bajo el
          // toggle, sin mensaje ni forma de reintentar.
          <p className="empty-note home-retry" role="status">
            No pudimos cargar el top.{" "}
            <button className="up-retry" onClick={retry}>Reintentar</button>
          </p>
        )
      ) : (
        <>
          {mine.length > 0 && (
            <>
              <span className="chip-group-label">Tus plataformas</span>
              {mine.map((b) => <Bloque key={b.platform} b={b} />)}
            </>
          )}
          {others.length > 0 && (
            <>
              <span className="chip-group-label">En otras plataformas</span>
              {others.map((b) => <Bloque key={b.platform} b={b} />)}
            </>
          )}
        </>
      )}
    </div>
  );
}
