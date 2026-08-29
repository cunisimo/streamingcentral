"use client";
import { useEffect, useState } from "react";
import ProviderCard from "./ProviderCard";
import { apiUrl } from "@/lib/api-base";

interface Provider { id: number; name: string }

export default function PlatformPicker({ selected, onToggle, onNone }:
  { selected: number[]; onToggle: (id: number) => void; onNone: () => void }) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const none = selected.length === 0;

  useEffect(() => {
    let alive = true;
    fetch(apiUrl("/api/providers"))
      .then((r) => r.json())
      .then((j) => { if (alive) { setProviders(j.providers ?? []); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  return (
    <section className="ob-block">
      <h2 className="ob-h">¿Qué plataformas usás?</h2>
      <p className="ob-sub">Seleccioná las plataformas que tenés para personalizar tu experiencia.</p>
      {loading ? <p className="loading">Cargando…</p> : (
        <div className="ob-grid">
          {providers.map((p) => (
            <ProviderCard key={p.id} name={p.name} selected={selected.includes(p.id)} onToggle={() => onToggle(p.id)} />
          ))}
          <button type="button" className={`ob-card ob-none ${none ? "on" : ""}`} onClick={onNone} aria-pressed={none}>
            <span className="ob-card-logo"><span className="ob-plus">＋</span></span>
            <span className="ob-card-name">No tengo ninguna por ahora</span>
          </button>
        </div>
      )}
      <p className="ob-hint">Podrás cambiarlas cuando quieras desde Configuración.</p>
    </section>
  );
}
