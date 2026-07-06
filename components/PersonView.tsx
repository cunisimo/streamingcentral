"use client";
import Link from "next/link";
import { useApi } from "./useApi";
import { usePlatforms } from "./PlatformsContext";
import TitleCard from "./TitleCard";
import type { UITitle, UIPerson } from "@/lib/types";

export default function PersonView({ id }: { id: string }) {
  const { platforms } = usePlatforms();
  const { data, loading } = useApi<{ person: UIPerson; titles: UITitle[]; hidden: number }>(
    () => `/api/person/${id}?providers=${platforms.join(",")}`, [id]);
  return (
    <div className="wrap">
      <Link className="back" href="/buscar"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>Volver a Buscar</Link>
      <h2 className="section-title">{data?.person?.name ?? "Cargando…"}</h2>
      <p className="section-sub">
        {loading ? "" : `Filmografía en tus plataformas${data && data.hidden > 0 ? ` · ${data.hidden} oculto${data.hidden > 1 ? "s" : ""} (en plataformas que no tenés)` : ""}`}
      </p>
      <div className="grid">
        {(data?.titles ?? []).map((t) => <TitleCard key={`${t.type}-${t.id}`} t={t} />)}
        {!loading && data && data.titles.length === 0 && <p className="empty-note">Nada en tus plataformas ahora.</p>}
      </div>
    </div>
  );
}
