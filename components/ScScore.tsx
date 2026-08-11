"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import type { MediaType } from "@/lib/types";

// Puntaje Yump: promedio de votos de la comunidad en escala 1-10 (malaso=2,
// ta buena=7, petacular=10; media ponderada). Lee el agregado público
// vote_counts (grant anon), se ve sin login.
//
// El visor NO desaparece cuando no hay votos: muestra `--/--` y "sin votos".
// Antes se ocultaba, y eso dejaba la fila de puntajes con un solo cuadro
// (TMDB), que es justo lo contrario de lo que queremos comunicar — el puntaje
// propio es el diferencial, tiene que estar siempre a la vista.
const VALUE: Record<number, number> = { 1: 2, 2: 7, 3: 10 };

export default function ScScore({ id, tipo }: { id: number; tipo: MediaType }) {
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

  const total = counts ? counts[1] + counts[2] + counts[3] : 0;
  const avg = counts && total > 0
    ? (VALUE[1] * counts[1] + VALUE[2] * counts[2] + VALUE[3] * counts[3]) / total
    : null;

  return (
    <div className="rb sc-score">
      <div className="lbl">
        <svg className="sc-star" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.3 6.8.6-5.1 4.5 1.5 6.7L12 17l-6 3.6 1.5-6.7L2.4 8.9l6.8-.6z" /></svg>
        Yump
      </div>
      <div className="num">
        {avg != null ? <>{avg.toFixed(1)}<span className="sc-max">/10</span></> : "--/--"}
      </div>
      {/* Mientras carga no se afirma nada: decir "sin votos" antes de saberlo
          sería mentira en un título que sí los tiene. */}
      <div className="sc-votes">
        {counts == null ? " " : total > 0 ? `${total} ${total === 1 ? "voto" : "votos"}` : "sin votos"}
      </div>
    </div>
  );
}
