"use client";
import { useEffect, useState } from "react";
import PersonCard from "./PersonCard";
import type { UIPerson } from "@/lib/types";

export default function DirectoresView() {
  const [people, setPeople] = useState<UIPerson[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/directores")
      .then((r) => r.json())
      .then((j) => { if (alive) { setPeople(j.people ?? []); setLoading(false); } })
      .catch(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  return (
    <div className="wrap">
      <div className="compact-head"><h1>Directores</h1></div>
      {loading ? <p className="loading">Cargando…</p> : (
        <div className="people-grid">
          {people.map((p) => <PersonCard key={p.id} p={p} />)}
        </div>
      )}
    </div>
  );
}
