"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "./AuthContext";
import TitleCard from "./TitleCard";
import type { ItemRef } from "@/lib/userdata";
import type { UITitle } from "@/lib/types";

export default function UserShelf({
  title, href, load, empty, full,
}: {
  title: string; href?: string; load: () => Promise<ItemRef[]>; empty?: string; full?: boolean;
}) {
  const { ready, user } = useAuth();
  const [items, setItems] = useState<UITitle[] | null>(null);
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ready) return;
    if (!user) { setItems([]); return; }
    let alive = true;
    (async () => {
      const refs = await load();
      if (!refs.length) { if (alive) setItems([]); return; }
      const q = refs.map((r) => `${r.tipo}:${r.tmdb_id}`).join(",");
      const res = await fetch(`/api/cards?items=${encodeURIComponent(q)}`);
      const data = await res.json().catch(() => ({ items: [] as UITitle[] }));
      if (alive) setItems((data.items as UITitle[]) ?? []);
    })();
    return () => { alive = false; };
    // load es estable por sección; el efecto depende de la sesión.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user]);

  if (items === null) {
    return <div className="shelf"><div className="shelf-head"><h2>{title}</h2></div><div className="track"><span className="loading">Cargando…</span></div></div>;
  }
  if (items.length === 0) {
    if (!empty) return null;
    return (
      <div className="shelf">
        <div className="shelf-head"><h2>{title}</h2></div>
        <p className="empty-note">{empty}</p>
      </div>
    );
  }

  const scroll = (d: number) => track.current?.scrollBy({ left: d * (track.current.clientWidth * 0.8), behavior: "smooth" });

  if (full) {
    return (
      <div className="shelf">
        <div className="shelf-head"><h2>{title}</h2></div>
        <div className="user-grid">{items.map((t) => <TitleCard key={`${t.type}-${t.id}`} t={t} />)}</div>
      </div>
    );
  }

  return (
    <div className="shelf">
      <div className="shelf-head">
        <h2>{title}</h2>
        <div className="shelf-head-r">
          {href && <Link href={href} className="vertodo">ver todo</Link>}
          <div className="arrows">
            <button className="arrow" onClick={() => scroll(-1)} aria-label="Anterior"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg></button>
            <button className="arrow" onClick={() => scroll(1)} aria-label="Siguiente"><svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg></button>
          </div>
        </div>
      </div>
      <div className="track" ref={track}>{items.map((t) => <TitleCard key={`${t.type}-${t.id}`} t={t} />)}</div>
    </div>
  );
}
