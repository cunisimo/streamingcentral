"use client";
import { useState } from "react";
import { GenreSlider, CountryFilter } from "./Filters";
import Shelf from "./Shelf";
import FilterGrid from "./FilterGrid";
import IndecisoHero from "./IndecisoHero";
import PersonRail from "./PersonRail";
import { SHELVES } from "./data";
import type { MediaType } from "@/lib/types";

type Mode = "inicio" | "peliculas" | "series";

export default function CatalogView({ mode }: { mode: Mode }) {
  const [genre, setGenre] = useState("todos");
  const [country, setCountry] = useState<string | null>(null);

  if (mode === "inicio") {
    return (
      <>
        <IndecisoHero />
        <div className="wrap">
          <Shelf title="Últimos lanzamientos" url="/api/latest" />
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
      {filtering ? (
        <FilterGrid tipo={tipo} genre={genre} country={country} />
      ) : (
        <div className="wrap">
          {SHELVES.map((g) => <Shelf key={`${tipo}-${g}`} tipo={tipo} genre={g} />)}
        </div>
      )}
    </>
  );
}
