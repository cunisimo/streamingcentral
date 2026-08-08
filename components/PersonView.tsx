"use client";
import Link from "next/link";
import { useApi } from "./useApi";
import { usePlatforms } from "./PlatformsContext";
import TitleCard from "./TitleCard";
import OfflineState from "./pwa/OfflineState";
import type { UITitle, UIPerson } from "@/lib/types";

export default function PersonView({ id }: { id: string }) {
  const { platforms } = usePlatforms();
  const { data, loading, offline, error, retry } = useApi<{ person: UIPerson; titles: UITitle[]; hidden: number }>(
    () => `/api/person/${id}?providers=${platforms.join(",")}`, [id]);
  if ((offline || error) && !data) return <div className="wrap"><OfflineState onRetry={retry} /></div>;
  return (
    <div className="wrap">
      <Link className="back" href="/buscar"><svg viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" /></svg>Volver a Buscar</Link>
      <h2 className="section-title">{data?.person?.name ?? "Cargando…"}</h2>
      <p className="section-sub">
        {/* Solo "Filmografía en tus plataformas": el conteo de ocultos ("32 en
            plataformas que no tenés") le hacía sentir al usuario que le estamos
            escondiendo cosas. La frase ya dice que lo que ve es lo suyo. */}
        {loading ? "" : "Filmografía en tus plataformas"}
      </p>
      <div className="grid">
        {(data?.titles ?? []).map((t) => <TitleCard key={`${t.type}-${t.id}`} t={t} />)}
        {!loading && data && data.titles.length === 0 && <p className="empty-note">Nada en tus plataformas ahora.</p>}
      </div>
    </div>
  );
}
