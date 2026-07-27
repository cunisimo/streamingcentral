"use client";
import { useState, useCallback } from "react";
import Shelf from "./Shelf";
import OfflineState from "./pwa/OfflineState";
import { useOnline } from "@/hooks/useOnline";
import { CATEGORIES } from "@/lib/categories";
import type { MediaType } from "@/lib/types";

export default function CategoryView({
  slug, label, initialTipo,
}: {
  slug: string; label: string; initialTipo: MediaType;
}) {
  const [tipo, setTipo] = useState<MediaType>(initialTipo);
  const online = useOnline();
  const [fetchFailed, setFetchFailed] = useState(false);
  const reportOffline = useCallback(() => setFetchFailed(true), []);
  const sinDatos = !online || fetchFailed;

  // Cruces: el género principal × cada otra categoría (salvo el propio y documental).
  const crosses = CATEGORIES.filter((c) => c.slug !== slug && c.slug !== "documental");

  return (
    <div className="wrap">
      <div className="compact-head">
        <h1>{label}</h1>
        <p className="sub">Explorá {label.toLowerCase()} en tus plataformas</p>
      </div>
      <div className="tipo-toggle" role="tablist">
        <button role="tab" aria-selected={tipo === "movie"} className={`tt ${tipo === "movie" ? "on" : ""}`} onClick={() => setTipo("movie")}>Películas</button>
        <button role="tab" aria-selected={tipo === "tv"} className={`tt ${tipo === "tv" ? "on" : ""}`} onClick={() => setTipo("tv")}>Series</button>
      </div>
      {sinDatos ? (
        <OfflineState onRetry={() => location.reload()} />
      ) : (
        <>
          <Shelf key={`pop-${tipo}`} tipo={tipo} genre={slug} title={`Populares en ${label}`} onOffline={reportOffline} />
          {crosses.map((c) => (
            <Shelf
              key={`${tipo}-${slug}-${c.slug}`}
              title={`${label} + ${c.label}`}
              url={`/api/discover?tipo=${tipo}&genre=${slug}&genre2=${c.slug}`}
            />
          ))}
        </>
      )}
    </div>
  );
}
