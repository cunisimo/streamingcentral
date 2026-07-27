"use client";
import { useState, useCallback } from "react";
import Shelf from "./Shelf";
import OfflineState from "./pwa/OfflineState";
import { useOnline } from "@/hooks/useOnline";
import { CATEGORIES, resolveCategory } from "@/lib/categories";
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

  // id-set de un rule (géneros y keywords en namespaces separados).
  const idSet = (r: { genres?: number[]; keywords?: number[] }) =>
    new Set([...(r.genres ?? []).map((g) => `g${g}`), ...(r.keywords ?? []).map((k) => `k${k}`)]);

  // Cruces: el género principal × cada otra categoría (salvo el propio y
  // documental). Se excluye, PARA EL TIPO ACTUAL, toda categoría que no aporte
  // ningún id nuevo respecto del principal (ej. Acción y Aventura comparten el
  // id 10759 en TV): el cruce daría el mismo pool que "Populares" (with_genres=
  // X,X = X) → riel duplicado. En movie los ids son distintos, así que no se
  // excluye nada de más.
  const primaryIds = idSet(resolveCategory(slug, tipo));
  const crosses = CATEGORIES.filter((c) => {
    if (c.slug === slug || c.slug === "documental") return false;
    const ids = idSet(resolveCategory(c.slug, tipo));
    return [...ids].some((id) => !primaryIds.has(id));
  });

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
