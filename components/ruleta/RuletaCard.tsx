"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../AuthContext";
import PlatformLogo from "../PlatformLogo";
import { setItem } from "@/lib/userdata";
import { fraseAtencion } from "./frases";
import type { RoulettePick } from "@/lib/roulette";

export default function RuletaCard({
  pick, onOtra, onCerrar,
}: { pick: RoulettePick; onOtra: () => void; onCerrar: () => void }) {
  const { user } = useAuth();
  const router = useRouter();
  const [visto, setVisto] = useState(false);
  const [busy, setBusy] = useState(false);
  const frase = fraseAtencion(pick.atencion, pick.id);
  const plataforma = pick.platforms[0];

  // Copia exacta de toggleWatched de components/ListActions.tsx:30 — mismo dato,
  // misma acción. Es un TOGGLE de ida y vuelta: un mistap se deshace tocando de
  // nuevo, sin tener que ir a buscar la ficha. Y por eso la tarjeta NO avanza
  // sola al marcar: si avanzara, deshacer sería imposible acá.
  async function toggleVisto() {
    if (!user) { router.push("/cuenta"); return; }
    if (busy) return;
    setBusy(true);
    const next = !visto;
    setVisto(next); // optimista
    const { error } = await setItem(user.id, "watched", { tmdb_id: pick.id, tipo: pick.type }, next);
    if (error) setVisto(!next); // rollback
    setBusy(false);
  }

  const meta = [
    pick.year, pick.runtime, pick.genres.length ? pick.genres.join(" / ") : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="rlt-card">
      <button className="rlt-close" onClick={onCerrar} aria-label="Cerrar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
      </button>

      <span className="chip-group-label">Te recomendamos</span>
      <h3 className="rlt-title">
        <Link href={`/titulo/${pick.type}/${pick.id}`}>{pick.title}</Link>
      </h3>
      {meta && <p className="rlt-meta">{meta}</p>}

      <div className="rlt-tags">
        {plataforma && <span className="rlt-tag rlt-tag-plat"><PlatformLogo code={plataforma} /></span>}
        {frase && <span className="rlt-tag">{frase}</span>}
      </div>

      <span className="chip-group-label">Por qué esta</span>
      <p className="rlt-razon">{pick.razon}</p>

      {/* El bloque PERO sólo existe si hay advertencia: viene NULL en ~27% de
          los casos por diseño, y preferimos que falte a inventarla. */}
      {pick.advertencia && (
        <div className="rlt-pero">
          <span className="rlt-pero-lab">⚠ Pero</span>
          <p>{pick.advertencia}</p>
        </div>
      )}

      <div className="rlt-acciones">
        <a
          className="rlt-btn rlt-btn-primary"
          href={pick.watchLink ?? `/titulo/${pick.type}/${pick.id}`}
          target={pick.watchLink ? "_blank" : undefined}
          rel={pick.watchLink ? "noreferrer" : undefined}
        >
          ▶ Verla
        </a>
        <button className="rlt-btn" onClick={onOtra}>Otra</button>
        <button className={`rlt-btn ${visto ? "on" : ""}`} onClick={toggleVisto} disabled={busy}>
          {visto ? "✓ Ya la viste" : "Ya la vi"}
        </button>
      </div>
    </div>
  );
}
