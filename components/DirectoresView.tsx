"use client";
import { useEffect, useMemo, useState } from "react";
import PersonCard from "./PersonCard";
import type { UIPerson } from "@/lib/types";

const PAGE = 20;
// Normaliza para búsqueda insensible a acentos y mayúsculas.
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export default function DirectoresView() {
  const [people, setPeople] = useState<UIPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [visible, setVisible] = useState(PAGE);

  useEffect(() => {
    let alive = true;
    fetch("/api/directores")
      .then((r) => r.json())
      .then((j) => { if (alive) { setPeople(j.people ?? []); setLoading(false); } })
      .catch(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    const nq = norm(q.trim());
    return nq ? people.filter((p) => norm(p.name).includes(nq)) : people;
  }, [people, q]);

  const shown = filtered.slice(0, visible);

  return (
    <div className="wrap">
      <div className="compact-head"><h1>Directores</h1></div>
      <div className="dir-search">
        <input
          type="text"
          value={q}
          onChange={(e) => { setQ(e.target.value); setVisible(PAGE); }}
          placeholder="Buscar director por nombre…"
        />
      </div>
      {loading ? <p className="loading">Cargando…</p> : (
        <>
          <div className="people-grid">
            {shown.map((p) => <PersonCard key={p.id} p={p} />)}
          </div>
          {!filtered.length && <p className="empty-note">No hay directores con ese nombre.</p>}
          {visible < filtered.length && (
            <div style={{ textAlign: "center", marginTop: 20 }}>
              <button className="btn ghost" onClick={() => setVisible((v) => v + PAGE)}>Cargar más</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
