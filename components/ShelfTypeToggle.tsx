"use client";
import type { MediaType } from "@/lib/types";

// Toggle de 2 estados Películas | Series para el header de un riel.
// El tipo activo va en coral (--accent), el otro en gris (--faint).
export default function ShelfTypeToggle({
  value, onChange,
}: { value: MediaType; onChange: (t: MediaType) => void }) {
  return (
    <div className="shelf-toggle" role="group" aria-label="Tipo de contenido">
      <button
        type="button"
        className={value === "movie" ? "is-active" : ""}
        aria-pressed={value === "movie"}
        onClick={() => onChange("movie")}
      >
        Películas
      </button>
      <button
        type="button"
        className={value === "tv" ? "is-active" : ""}
        aria-pressed={value === "tv"}
        onClick={() => onChange("tv")}
      >
        Series
      </button>
    </div>
  );
}
