"use client";
import { useApi } from "./useApi";
import { usePlatforms } from "./PlatformsContext";
import TitleCard from "./TitleCard";
import { COUNTRIES, genreLabel } from "./data";
import type { UITitle, MediaType } from "@/lib/types";

export default function CountryGrid({ tipo, genre, country }: { tipo: MediaType; genre: string; country: string }) {
  const { platforms } = usePlatforms();
  const { data, loading } = useApi<{ items: UITitle[] }>(
    () => `/api/discover?tipo=${tipo}&genre=${genre}&country=${country}&providers=${platforms.join(",")}`,
    [tipo, genre, country],
  );
  const items = data?.items ?? [];
  const v = COUNTRIES[country];
  const gl = genre === "todos" ? "" : `${genreLabel(genre)} · `;
  return (
    <div className="wrap">
      <h2 className="section-title" style={{ marginTop: 20 }}><span className="flag">{v?.flag}</span> {gl}{v?.name}</h2>
      <p className="section-sub">{loading ? "Cargando…" : `${items.length} título${items.length !== 1 ? "s" : ""} en tus plataformas`}</p>
      <div className="grid">
        {items.map((t) => <TitleCard key={`${t.type}-${t.id}`} t={t} />)}
        {!loading && !items.length && <p className="empty-note">Nada con este filtro. Probá otro género o activá más plataformas.</p>}
      </div>
    </div>
  );
}
