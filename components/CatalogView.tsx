"use client";
import { useState, useCallback } from "react";
import Shelf from "./Shelf";
import IndecisoHero from "./IndecisoHero";
import DesempateBanner from "./desempate/DesempateBanner";
import UpcomingSection from "./upcoming/UpcomingSection";
import OfflineState from "./pwa/OfflineState";
import { useOnline } from "@/hooks/useOnline";
import { SHELVES } from "./data";

export default function CatalogView() {
  const online = useOnline();
  const [fetchFailed, setFetchFailed] = useState(false);
  const reportOffline = useCallback(() => setFetchFailed(true), []);

  // Sin conexión, cada Shelf se auto-oculta; acá mostramos un único estado
  // offline. Dos señales: navigator.onLine (modo avión) y el fallo real del
  // primer riel (cubre "hay red pero el server no responde").
  const sinDatos = !online || fetchFailed;
  if (sinDatos) return <div className="wrap"><OfflineState onRetry={() => location.reload()} /></div>;

  return (
    <>
      <IndecisoHero />
      <div className="wrap">
        <DesempateBanner />
        <UpcomingSection />
        <Shelf title="Últimos lanzamientos" url="/api/latest" seeAllHref="/lista/ultimos" onOffline={reportOffline} />
        <Shelf title="Lo más votados" url="/api/mas-votados" seeAllHref="/lista/mas-votados" typeToggle="filter" shelfKey="mas-votados" initialType="movie" />
        <Shelf title="Hacete cargo" url="/api/hacete-cargo" seeAllHref="/lista/hacete-cargo" typeToggle="filter" shelfKey="hacete-cargo" initialType="movie" />
        {SHELVES.map((g, i) => (
          <Shelf key={g} genre={g} typeToggle="refetch" shelfKey={g} initialType={i % 2 === 0 ? "movie" : "tv"} seeAllHref={`/categoria/${g}?tipo=${i % 2 === 0 ? "movie" : "tv"}`} />
        ))}
        <Shelf title="🍿 Para toda la familia" url="/api/audience?a=family" seeAllHref="/lista/familia" />
        <Shelf title="🎬 Animación para adultos" url="/api/audience?a=adult-anime" seeAllHref="/lista/anime-adulto" />
      </div>
    </>
  );
}
