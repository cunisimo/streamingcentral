"use client";
import { useState, useCallback } from "react";
import Shelf from "./Shelf";
import OfflineState from "./pwa/OfflineState";
import { useOnline } from "@/hooks/useOnline";
import { CATEGORIES, resolveCategory, CROSS_PHRASE } from "@/lib/categories";
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

  // Cruces: el principal × cada otra categoría (salvo el propio y documental).
  // Para el TIPO ACTUAL se excluye todo cruce cuyo set combinado (principal ∪ cruce)
  // (a) no aporte ningún id nuevo respecto del principal —daría el mismo pool que
  // "Populares"— o (b) ya haya salido en otro cruce. Ej. en TV: Aventura colapsa a
  // Acción (10759), y Drama/Romance colapsan entre sí (18); se deja solo el primero.
  const primaryIds = idSet(resolveCategory(slug, tipo));
  const seenCombos = new Set<string>();
  const crosses = CATEGORIES.filter((c) => {
    if (c.slug === slug || c.slug === "documental") return false;
    const combined = new Set(primaryIds);
    for (const id of idSet(resolveCategory(c.slug, tipo))) combined.add(id);
    if (combined.size === primaryIds.size) return false; // no aporta id nuevo
    const key = [...combined].sort().join(",");
    if (seenCombos.has(key)) return false;               // cruce duplicado de otro
    seenCombos.add(key);
    return true;
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
              title={`${label} ${CROSS_PHRASE[c.slug] ?? `+ ${c.label}`}`}
              url={`/api/discover?tipo=${tipo}&genre=${slug}&genre2=${c.slug}`}
            />
          ))}
        </>
      )}
    </div>
  );
}
