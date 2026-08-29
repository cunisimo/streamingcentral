"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import PersonCard from "./PersonCard";
import { useEstadoSimple } from "@/hooks/useEstadoSimple";
import type { UIPerson } from "@/lib/types";
import { apiUrl } from "@/lib/api-base";

const PAGE = 20;
// Normaliza para búsqueda insensible a acentos y mayúsculas.
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export default function DirectoresView() {
  const [people, setPeople] = useState<UIPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [visible, setVisible] = useState(PAGE);

  // NO usa `useListaPaginada` aunque tenga "Cargar más": no hay paginación de
  // servidor. La lista llega COMPLETA en una llamada y `visible` solo decide
  // cuántas se pintan. Forzarla dentro del hook paginado sería inventarle una
  // `pagina` que no existe.
  //
  // Firma vacía: la lista de directores es curada y no depende de plataformas.
  const { fase, inicial } = useEstadoSimple<UIPerson[], { q: string; visible: number }>({
    clave: "directores",
    firma: "",
    datos: people,
    extra: { q, visible },
    listo: !loading && people.length > 0,
    vacio: people.length === 0,
  });

  // Restaurar antes de pedir: si el snapshot vale, no se llama a /api/directores.
  const decidido = useRef(false);
  useEffect(() => {
    if (fase !== "listo" || decidido.current) return;
    decidido.current = true;
    if (inicial) {
      setPeople(inicial.datos);
      if (inicial.extra) { setQ(inicial.extra.q); setVisible(inicial.extra.visible); }
      setLoading(false);
      return;
    }
    let alive = true;
    fetch(apiUrl("/api/directores"))
      .then((r) => r.json())
      .then((j) => { if (alive) { setPeople(j.people ?? []); setLoading(false); } })
      .catch(() => alive && setLoading(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase, inicial]);

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
