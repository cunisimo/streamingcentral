"use client";
import { useEffect, useRef, useState } from "react";
import { olvidarTrack, useTrackScroll } from "@/hooks/useTrackScroll";
import { consumirVuelta, decidirRestauracionVista, guardarVista } from "@/hooks/lista-paginada-store";
import { contextoDe, snapshotVigente } from "@/hooks/restauracion-vigente";
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
import type { MediaType } from "@/lib/types";

// La nota explicaba por qué Netflix decía una cosa y el resto otra. Con el Top
// semanal cargado a mano esa distinción desapareció: las seis plataformas salen
// de la misma fuente, así que no hay nada que aclarar.
//
// ⚠️ ANTES DEL CUTOVER la nota sigue haciendo falta: hasta que estén publicados
// los doce bloques, `/top` sirve la implementación vieja y ahí Netflix y el
// resto SÍ son cosas distintas. Por eso el texto no se borró — se muestra sólo
// cuando el bloque viene de la fuente vieja.
const NOTA =
  "El top de Netflix sale de los datos que la propia Netflix publica cada semana " +
  "para Argentina: son horas vistas reales, de la semana que cerró el domingo. " +
  "En el resto de las plataformas no hay dato público de consumo, así que " +
  "mostramos las más populares del momento — no es lo mismo, y por eso lo " +
  "aclaramos.";

// El subtítulo de cada bloque.
//
// 🔴 CON LA CARGA MANUAL TODAS DICEN LO MISMO. La distinción "dato oficial" vs
// "popularidad" existía porque las fuentes eran distintas de verdad; ahora las
// seis las arma el dueño con el mismo criterio, y sostener dos rótulos sería
// afirmar una diferencia que ya no existe.
//
// Las fechas de captura NO se muestran acá: viven en el dashboard. El lector no
// tiene que auditar cuándo se cargó un ranking.
function subtitulo(source: TopBlock["source"]): string {
  if (source === "manual") return "Top semanal";
  return source === "netflix" ? "Lo más visto esta semana · dato oficial" : "Lo más popular ahora";
}

// La clave del carrusel incluye el TIPO, y eso es lo que hace que al pasar de
// Películas a Series cada riel arranque del principio: es una clave nueva, no
// hay nada guardado y `useTrackScroll` asigna 0. Además `TopView` olvida las
// posiciones del tipo anterior al cambiar, para que volver a Películas tampoco
// devuelva una posición vieja — mismo criterio que `Shelf.changeType`.
export const claveTop = (platform: string, tipo: MediaType) => `top:${tipo}:${platform}`;

function Bloque({ b, tipo }: { b: TopBlock; tipo: MediaType }) {
  const track = useRef<HTMLDivElement>(null);
  const [nota, setNota] = useState(false);
  useTrackScroll(claveTop(b.platform, tipo), track, b.slots.length > 0);
  const def = platformByCode(b.platform);
  const scroll = (d: number) =>
    track.current?.scrollBy({ left: d * (track.current.clientWidth * 0.8), behavior: "smooth" });

  return (
    <div className="shelf">
      <div className="shelf-head">
        <div className="shelf-head-l">
          {/* `PlatformLogo` YA es el nombre de la plataforma en texto neutro,
              así que poner además `def.name` al lado lo duplicaría. El
              aria-label lo deja explícito para lectores de pantalla. */}
          <h2 className="top-plat" aria-label={def?.name ?? b.platform}><PlatformLogo code={b.platform} /></h2>
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
      <p className="top-sub">{subtitulo(b.source)}</p>
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
  // LA DECISIÓN VA ANTES DEL FETCH. `useEstadoSimple` decide en un efecto, y
  // para entonces `useApi` ya salió a pedir: el snapshot devolvía la vista pero
  // igual se llamaba a /api/top. Con la URL vacía, `useApi` queda inerte.
  //
  // El tipo va en la CLAVE, no en la firma: así los snapshots de Películas y
  // Series conviven y volver restaura el que corresponde. Las plataformas sí
  // invalidan, y por eso van en la firma.
  const claveTop2 = `top:${tipo}`;
  const firmaTop = platforms.join(",");
  const [restaurado, setRestaurado] = useState<TopPayload | null>(null);
  const [decidido, setDecidido] = useState(false);
  const pendienteY = useRef<number | null>(null);
  // A qué tipo y plataformas pertenece lo restaurado. Si el usuario cambia
  // cualquiera de las dos, el snapshot deja de corresponder y hay que soltarlo:
  // mientras siga presente, la URL de `useApi` queda vacía y no se pide nada.
  const [ctxRestaurado, setCtxRestaurado] = useState<string | null>(null);
  const ctxActual = contextoDe([tipo, firmaTop]);

  useEffect(() => {
    const e = decidirRestauracionVista<TopPayload>({ clave: claveTop2, firma: firmaTop, volvio: consumirVuelta(window.location.pathname) });
    if (e) { setRestaurado(e.datos); pendienteY.current = e.scrollY; setCtxRestaurado(ctxActual); }
    setDecidido(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveTop2]);

  // Cambió el tipo o las plataformas: se suelta lo restaurado y se vuelve
  // arriba. Recién ahí `useApi` recupera su URL y pide lo nuevo.
  useEffect(() => {
    if (snapshotVigente(ctxRestaurado, ctxActual)) return;
    setRestaurado(null);
    setCtxRestaurado(null);
    pendienteY.current = null;
    window.scrollTo(0, 0);
  }, [ctxRestaurado, ctxActual]);

  const { data, loading, offline, error, retry } = useApi<TopPayload>(
    () => (!decidido || restaurado ? "" : `/api/top?tipo=${tipo}&providers=${platforms.join(",")}`),
    [tipo, platforms.join(","), decidido, !!restaurado],
    { keepPrevious: true },
  );

  // Snapshot del payload entero + scroll. Medido el 22/08: volver a /top con
  // 900 de scroll aterrizaba en 0 (la página volvía con 543 px de alto), y el
  // carrusel que estaba en 354 volvía a 2.
  //
  // El tipo NO va en la firma sino que forma parte de la clave del snapshot:
  // así el snapshot de Películas y el de Series no se pisan, y volver restaura
  // el que corresponde. Las plataformas SÍ invalidan.
  const vivo = data ?? restaurado;

  // El scroll, con los bloques ya montados.
  useEffect(() => {
    if (!vivo || pendienteY.current === null) return;
    const y = pendienteY.current;
    pendienteY.current = null;
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
  }, [vivo]);

  useEffect(() => {
    if (!decidido || !vivo) return;
    let pend = false;
    const g = () => guardarVista<TopPayload>(claveTop2, { firma: firmaTop, datos: vivo, scrollY: window.scrollY });
    g();
    const onScroll = () => { if (pend) return; pend = true; requestAnimationFrame(() => { pend = false; g(); }); };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [claveTop2, firmaTop, vivo, decidido]);

  // Al cambiar de tipo, cada carrusel vuelve al principio y se olvida lo
  // anterior. Sin el olvido, volver al tipo original restauraría una posición
  // sobre otro contenido.
  const tipoPrevio = useRef(tipo);
  useEffect(() => {
    if (tipoPrevio.current === tipo) return;
    const anterior = tipoPrevio.current;
    tipoPrevio.current = tipo;
    for (const b of [...(vivo?.mine ?? []), ...(vivo?.others ?? [])]) {
      olvidarTrack(claveTop(b.platform, anterior));
      olvidarTrack(claveTop(b.platform, tipo));
    }
  }, [tipo, vivo]);

  const mine = vivo?.mine ?? [];
  const others = vivo?.others ?? [];
  const hayContenido = mine.length > 0 || others.length > 0;
  // 200 pero con bloques caídos (`safe` en lib/top.ts los descartó): distinto de
  // "esa plataforma no tiene top hoy". Mismo criterio que CatalogView con el
  // Home — reintentar sí puede arreglarlo.
  const degradado = !!vivo?.degradado;
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
              <h2 className="top-group">Tus plataformas</h2>
              {mine.map((b) => <Bloque key={b.platform} b={b} tipo={tipo} />)}
            </>
          )}
          {others.length > 0 && (
            <>
              <h2 className="top-group">En otras plataformas</h2>
              {others.map((b) => <Bloque key={b.platform} b={b} tipo={tipo} />)}
            </>
          )}
        </>
      )}
    </div>
  );
}
