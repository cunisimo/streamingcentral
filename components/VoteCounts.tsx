"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import type { MediaType } from "@/lib/types";

// Contador público de votos por opción (malaso / ta buena / petacular).
// Lee el agregado con la función security definer vote_counts (grant anon), así
// que se ve aunque no estés logueado. No filtra por plataforma.
const OPTS: { r: number; lab: string; cls: string }[] = [
  { r: 1, lab: "Malaso", cls: "mala" },
  { r: 2, lab: "Ta buena", cls: "buena" },
  { r: 3, lab: "Petacular", cls: "peta" },
];

export default function VoteCounts({ id, tipo }: { id: number; tipo: MediaType }) {
  const [counts, setCounts] = useState<Record<number, number> | null>(null);

  useEffect(() => {
    let alive = true;
    supabaseBrowser()
      .rpc("vote_counts", { p_tmdb_id: id, p_tipo: tipo })
      .then(({ data, error }) => {
        if (!alive || error) return; // sin migración o error → no se muestra
        const c: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
        for (const row of (data as { rating: number; votos: number }[] | null) ?? []) {
          c[row.rating] = Number(row.votos);
        }
        setCounts(c);
      });
    return () => { alive = false; };
  }, [id, tipo]);

  // Oculto mientras carga, si hubo error, o si el título todavía no tiene votos.
  if (!counts || counts[1] + counts[2] + counts[3] === 0) return null;

  return (
    <div className="votecounts">
      {OPTS.map((o) => (
        <div key={o.r} className={`vc ${o.cls}`}>
          <span className="vc-n">{counts[o.r]}</span>
          <span className="vc-l">{o.lab}</span>
        </div>
      ))}
    </div>
  );
}
