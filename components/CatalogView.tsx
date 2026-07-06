"use client";
import { useState } from "react";
import { GenreSlider, CountryFilter } from "./Filters";
import Shelf from "./Shelf";
import IndecisoHero from "./IndecisoHero";
import CountryGrid from "./CountryGrid";
import { SHELVES } from "./data";
import type { MediaType } from "@/lib/types";

type Mode = "inicio" | "peliculas" | "series";

export default function CatalogView({ mode }: { mode: Mode }) {
  const [genre, setGenre] = useState("todos");
  const [country, setCountry] = useState<string | null>(null);
  const tipo: MediaType = mode === "series" ? "tv" : "movie"; // para shelves; inicio usa ambos vía shelves de cada tipo
  const isInicio = mode === "inicio";

  return (
    <>
      {isInicio && <IndecisoHero genre={genre} />}
      <div className="wrap">
        {!isInicio && (
          <div className="compact-head">
            <h1>{mode === "peliculas" ? "Películas" : "Series"}</h1>
            <p className="sub">{mode === "peliculas" ? "Todas las películas en tus plataformas" : "Todas las series en tus plataformas"}</p>
          </div>
        )}
        <GenreSlider value={genre} onChange={(g) => setGenre(g)} />
        <CountryFilter value={country} onChange={setCountry} />
      </div>
      {country ? (
        <CountryGrid tipo={isInicio ? "movie" : tipo} genre={genre} country={country} />
      ) : (
        <div className="wrap">
          {isInicio
            ? SHELVES.flatMap((g, i) => [
                // alterna: shelf de películas y de series por género
                <Shelf key={`${i % 2 === 0 ? "m" : "t"}-${g}`} tipo={i % 2 === 0 ? "movie" : "tv"} genre={g} />,
              ])
            : SHELVES.map((g) => <Shelf key={`${tipo}-${g}`} tipo={tipo} genre={g} />)}
        </div>
      )}
    </>
  );
}
