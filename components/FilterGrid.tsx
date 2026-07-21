"use client";
import { useApi } from "./useApi";
import { usePlatforms } from "./PlatformsContext";
import TitleCard from "./TitleCard";
import OfflineState from "./pwa/OfflineState";
import { COUNTRIES, genreLabel } from "./data";
import type { UITitle, MediaType } from "@/lib/types";

export default function FilterGrid({ tipo, genre, country }: { tipo: MediaType; genre: string; country: string | null }) {
  const { platforms } = usePlatforms();
  const { data, loading, offline, retry } = useApi<{ items: UITitle[] }>(
    () => `/api/discover?tipo=${tipo}&genre=${genre}${country ? `&country=${country}` : ""}&providers=${platforms.join(",")}`,
    [tipo, genre, country],
  );
  const items = data?.items ?? [];
  if (offline && !items.length) return <div className="wrap"><OfflineState onRetry={retry} /></div>;
  const parts: string[] = [];
  if (genre !== "todos") parts.push(genreLabel(genre));
  if (country) parts.push(`${COUNTRIES[country]?.flag ?? ""} ${COUNTRIES[country]?.name ?? country}`);
  const heading = parts.join(" · ") || (tipo === "movie" ? "Películas" : "Series");

  return (
    <div className="wrap">
      <h2 className="section-title" style={{ marginTop: 20 }}>{heading}</h2>
      <p className="section-sub">{loading ? "Cargando…" : `${items.length} título${items.length !== 1 ? "s" : ""} en tus plataformas`}</p>
      <div className="grid">
        {items.map((t) => <TitleCard key={`${t.type}-${t.id}`} t={t} />)}
        {!loading && !items.length && <p className="empty-note">Nada con este filtro. Probá otro género/país o activá más plataformas.</p>}
      </div>
    </div>
  );
}
