"use client";
import { useState, useCallback } from "react";
import { GenreSlider, CountryFilter } from "./Filters";
import Shelf from "./Shelf";
import FilterGrid from "./FilterGrid";
import IndecisoHero from "./IndecisoHero";
import DesempateBanner from "./desempate/DesempateBanner";
import PersonRail from "./PersonRail";
import OfflineState from "./pwa/OfflineState";
import { useOnline } from "@/hooks/useOnline";
import { SHELVES } from "./data";
import type { MediaType } from "@/lib/types";

type Mode = "inicio" | "peliculas" | "series";

export default function CatalogView({ mode }: { mode: Mode }) {
  const [genre, setGenre] = useState("todos");
  const [country, setCountry] = useState<string | null>(null);
  const online = useOnline();
  const [fetchFailed, setFetchFailed] = useState(false);
  const reportOffline = useCallback(() => setFetchFailed(true), []);

  // Sin conexión, cada Shelf se auto-oculta (mejor que 15 errores iguales), pero
  // eso dejaría la pantalla vacía y sin explicación. Acá mostramos un solo
  // estado offline en lugar del stack de rieles.
  // Dos señales: navigator.onLine (modo avión) y el fallo real del primer riel
  // (cubre "hay red pero el server no responde", donde onLine sigue en true).
  const sinDatos = !online || fetchFailed;
  const offlineBlock = <div className="wrap"><OfflineState onRetry={() => location.reload()} /></div>;

  if (mode === "inicio") {
    if (sinDatos) return offlineBlock;
    return (
      <>
        <IndecisoHero />
        <div className="wrap">
          <DesempateBanner />
          <Shelf title="Últimos lanzamientos" url="/api/latest" onOffline={reportOffline} />
          <Shelf title="Lo más votados" url="/api/mas-votados" />
          <Shelf title="Hacete cargo" url="/api/hacete-cargo" />
          {SHELVES.map((g, i) => (
            <Shelf key={`${i % 2 === 0 ? "m" : "t"}-${g}`} tipo={i % 2 === 0 ? "movie" : "tv"} genre={g} showType />
          ))}
          <PersonRail title="Directores" endpoint="/api/directores" />
        </div>
      </>
    );
  }

  const tipo: MediaType = mode === "series" ? "tv" : "movie";
  const filtering = genre !== "todos" || country !== null;

  return (
    <>
      <div className="wrap">
        <div className="compact-head">
          <h1>{mode === "peliculas" ? "Películas" : "Series"}</h1>
          <p className="sub">{mode === "peliculas" ? "Todas las películas en tus plataformas" : "Todas las series en tus plataformas"}</p>
        </div>
        <GenreSlider value={genre} onChange={setGenre} />
        <CountryFilter value={country} onChange={setCountry} />
      </div>
      {sinDatos ? offlineBlock : filtering ? (
        <FilterGrid tipo={tipo} genre={genre} country={country} />
      ) : (
        <div className="wrap">
          {SHELVES.map((g, i) => (
            <Shelf key={`${tipo}-${g}`} tipo={tipo} genre={g} onOffline={i === 0 ? reportOffline : undefined} />
          ))}
        </div>
      )}
    </>
  );
}
