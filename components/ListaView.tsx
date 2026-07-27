"use client";
import { useApi } from "./useApi";
import { usePlatforms } from "./PlatformsContext";
import TitleCard from "./TitleCard";
import OfflineState from "./pwa/OfflineState";
import type { UITitle } from "@/lib/types";

export default function ListaView({ endpoint, title }: { endpoint: string; title: string }) {
  const { platforms } = usePlatforms();
  const { data, loading, offline, retry } = useApi<{ items: UITitle[] }>(
    () => `${endpoint}${endpoint.includes("?") ? "&" : "?"}providers=${platforms.join(",")}`,
    [endpoint],
  );
  const items = data?.items ?? [];
  if (offline && !items.length) return <div className="wrap"><OfflineState onRetry={retry} /></div>;
  return (
    <div className="wrap">
      <div className="compact-head"><h1>{title}</h1></div>
      <p className="section-sub">{loading ? "Cargando…" : `${items.length} título${items.length !== 1 ? "s" : ""} en tus plataformas`}</p>
      <div className="grid">
        {items.map((t) => <TitleCard key={`${t.type}-${t.id}`} t={t} />)}
        {!loading && !items.length && <p className="empty-note">Nada por acá con tus plataformas.</p>}
      </div>
    </div>
  );
}
