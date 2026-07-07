"use client";
import { useEffect, useState, useRef } from "react";
import PersonCard from "./PersonCard";
import type { UIPerson } from "@/lib/types";

export default function PersonRail({ title, endpoint }: { title: string; endpoint: string }) {
  const [people, setPeople] = useState<UIPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    fetch(endpoint).then((r) => r.json()).then((j) => {
      if (alive) { setPeople(j.people ?? []); setLoading(false); }
    }).catch(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [endpoint]);

  if (!loading && people.length === 0) return null;
  const scroll = (d: number) => track.current?.scrollBy({ left: d * (track.current.clientWidth * 0.8), behavior: "smooth" });

  return (
    <div className="shelf">
      <div className="shelf-head">
        <h2>{title}</h2>
        <div className="arrows">
          <button className="arrow" onClick={() => scroll(-1)} aria-label="Anterior"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg></button>
          <button className="arrow" onClick={() => scroll(1)} aria-label="Siguiente"><svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg></button>
        </div>
      </div>
      <div className="people-row" ref={track}>
        {loading ? <span className="loading">Cargando…</span> : people.map((p) => <PersonCard key={p.id} p={p} />)}
      </div>
    </div>
  );
}
