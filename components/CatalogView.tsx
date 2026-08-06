"use client";
import Shelf from "./Shelf";
import IndecisoHero from "./IndecisoHero";
import DesempateBanner from "./desempate/DesempateBanner";
import UpcomingSection from "./upcoming/UpcomingSection";
import OfflineState from "./pwa/OfflineState";
import { useOnline } from "@/hooks/useOnline";
import { useApi } from "./useApi";
import { usePlatforms } from "./PlatformsContext";
import { useHomeTypes } from "@/hooks/useHomeTypes";
import type { HomePayload } from "@/lib/home";

// El Home se arma entero en el server (lib/home.ts): un solo fetch a /api/home
// devuelve el hero y todos los rieles ya deduplicados y en orden. Los rieles son
// presentacionales (Shelf en modo controlado). "Próximamente" y "Desempatá"
// quedan fuera del composer a propósito: no reservan ni se filtran.
export default function CatalogView() {
  const online = useOnline();
  const { platforms } = usePlatforms();
  const { types, setType, param, ready } = useHomeTypes();

  const { data, loading, offline, error, retry } = useApi<HomePayload>(
    () => (ready ? `/api/home?providers=${platforms.join(",")}&t=${param}` : ""),
    [param, ready],
    // Único consumidor que necesita conservar los rieles ya visibles cuando
    // un refetch (toggle Películas/Series) falla — ver comentario en useApi.
    { keepPrevious: true },
  );

  const rails = data?.rails ?? [];
  const hayContenido = rails.length > 0;
  // Mientras useHomeTypes no leyó localStorage no hay URL que pedir y useApi apaga
  // `loading`: sin sumarlo acá, entrar al Home desde otra página pinta un frame
  // en blanco antes del primer fetch.
  const cargando = !ready || loading;
  // `error` = el server respondió 500 (composeHome se cayó). `offline` = no hubo
  // respuesta. Los dos dejan la pantalla igual de vacía, así que se tratan juntos.
  const fallo = !online || offline || error;

  // Pantalla completa SOLO cuando no hay nada que mostrar todavía. Si ya hay
  // rieles, un fallo de refetch no borra el Home: se avisa arriba y se ofrece
  // reintentar (abajo).
  if (!hayContenido && !cargando && (!online || offline)) {
    return <div className="wrap"><OfflineState onRetry={retry} /></div>;
  }

  return (
    <>
      <IndecisoHero initialItems={data?.hero} heroPendiente={!data && !fallo} />
      <div className="wrap">
        <DesempateBanner />
        <UpcomingSection />

        {fallo && hayContenido && (
          <p className="empty-note home-retry" role="status">
            No pudimos actualizar el inicio.{" "}
            <button className="up-retry" onClick={retry}>Reintentar</button>
          </p>
        )}

        {!hayContenido ? (
          cargando ? (
            <div className="shelf"><span className="loading">Cargando…</span></div>
          ) : (
            // El payload llegó (o falló) y no hay un solo riel: antes esto era una
            // pantalla vacía y muda.
            <p className="empty-note home-retry" role="status">
              No pudimos cargar el inicio.{" "}
              <button className="up-retry" onClick={retry}>Reintentar</button>
            </p>
          )
        ) : (
          // Durante un refetch con contenido en pantalla, los rieles se atenúan y
          // no aceptan clicks: el toggle tarda lo que tarde composeHome y sin esto
          // no pasaba nada visible.
          <div className={`home-rails${cargando ? " is-refreshing" : ""}`} aria-busy={cargando}>
            {rails.map((r) => {
              const sk = r.shelfKey;
              return (
                <Shelf
                  key={r.key}
                  items={r.items}
                  title={r.title}
                  genre={r.genre}
                  seeAllHref={r.seeAllHref}
                  typeToggle={r.typeToggle}
                  shelfKey={sk}
                  // El tipo del cliente gana mientras vuelve el payload nuevo, así
                  // el toggle se ve aplicado de inmediato y no rebota al valor viejo.
                  initialType={(sk && types[sk]) || r.activeType}
                  // Solo los rieles "refetch" rearman el Home. Los "filter" filtran
                  // en cliente: pedir /api/home de nuevo devolvería lo mismo.
                  onTypeChange={
                    r.typeToggle === "refetch" && sk ? (t) => setType(sk, t) : undefined
                  }
                />
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
