"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import Wheel from "../desempate/Wheel";
import Confetti from "../desempate/Confetti";
import { Ganadora, PieResultado } from "./ResultadoMatch";
import CompartirMatch from "./CompartirMatch";
import { supabaseBrowser } from "@/lib/supabase";
import { desempatar as accionDesempatar } from "@/lib/sala/acciones-host";
import { hrefTitulo } from "@/lib/rutas";
import { useVenceEn, formatoSeg } from "@/hooks/useVenceEn";
import type { EstadoSala, ResultadoSala } from "@/lib/sala/estado";
import type { CardSala } from "@/lib/sala/tipos";

// "¡Tenemos empate!" (plan de salas, Tarea 4.1). Dos fases, las dos dictadas
// por `estado.resultado` (la base decide; acá no se cuenta nada):
//
//   1. `desempatado: false` — las cards empatadas entran (`sala-entra`) y
//      quedan a la vista; corre la ventana de 5 min. SÓLO el organizador ve
//      "Desempatar" (`puede_desempatar` lo dice la base, y la RPC vuelve a
//      exigir su JWT); los demás esperan.
//   2. `desempatado: true` — `ganador_pos` ya está guardado. La rueda de
//      "Desempatá" gira y SE DETIENE en ese ganador (no elige nada: muestra lo
//      que la base ya decidió, determinístico por semilla de sala). Al frenar,
//      la elegida y —para el organizador— "Otra tanda", que hasta acá no
//      aparece: con el empate sin resolver `puede_otra_tanda` es false.
//
// Con `prefers-reduced-motion: reduce`, la entrada no anima y la rueda dura
// 300 ms (lo resuelve Wheel).
export default function ResultadoEmpate({ estado, resultado, titulos, roomId, desfase, releer }: {
  estado: EstadoSala; resultado: ResultadoSala; titulos: CardSala[]; roomId: string; desfase: number; releer: () => Promise<void>;
}) {
  const seg = useVenceEn(estado, desfase);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ruedaTermino, setRuedaTermino] = useState(false);

  const empatadas = useMemo(() => {
    const pos = new Set(resultado.empatadas ?? []);
    return titulos.filter((t) => pos.has(t.pos)).sort((a, b) => a.pos - b.pos);
  }, [titulos, resultado.empatadas]);
  const ganadora = resultado.ganador_pos === null ? null : titulos.find((t) => t.pos === resultado.ganador_pos) ?? null;
  const winnerIdx = ganadora ? empatadas.findIndex((t) => t.pos === ganadora.pos) : -1;
  const organizador = estado.participantes.find((p) => p.es_host)?.nombre ?? "quien organiza";

  // Tras el éxito se RELEE en el acto (lib/sala/acciones-host.ts): quien tocó
  // ve la rueda sin esperar su propio aviso por el canal; los demás lo reciben
  // por Realtime como siempre.
  async function desempatar() {
    setBusy(true); setErr("");
    const r = await accionDesempatar({
      rpc: async () => { const { data, error } = await supabaseBrowser().rpc("sala_desempatar", { p_room: roomId }); return { data, error }; },
      releer,
    });
    setBusy(false);
    if (!r.ok) setErr(r.texto);
  }

  // Fase 2: ya hay ganadora. Rueda hasta que frena; después, la elegida.
  if (resultado.desempatado && ganadora && winnerIdx >= 0) {
    if (!ruedaTermino) {
      return (
        <div className="sala-resultado sala-empate">
          <h1 className="sala-h1 sala-titular">Desempatando…</h1>
          <Wheel
            selected={empatadas.map((t) => ({ poster: t.poster, title: t.titulo }))}
            winnerIdx={winnerIdx}
            onFinish={() => setRuedaTermino(true)}
          />
        </div>
      );
    }
    return (
      <div className="sala-resultado sala-match">
        <Confetti count={60} />
        <h1 className="sala-h1 sala-titular">¡Hay match!</h1>
        <p className="sala-hint">La rueda desempató entre {empatadas.length}. Nuestro match.</p>
        <Ganadora card={ganadora} union={estado.union} />
        <div className="sala-acciones sala-acciones-resultado">
          <CompartirMatch card={ganadora} union={estado.union} />
          <Link className="rlt-btn" href={hrefTitulo("movie", ganadora.tmdb_id)}>Ver la ficha</Link>
        </div>
        <PieResultado estado={estado} roomId={roomId} seg={seg} releer={releer} />
      </div>
    );
  }

  // Fase 1: empate sin resolver.
  return (
    <div className="sala-resultado sala-empate">
      <h1 className="sala-h1 sala-titular">¡Tenemos empate!</h1>
      <p className="sala-hint">{empatadas.length} películas juntaron los mismos síes.</p>
      <div className="sala-entran" aria-label="Películas empatadas">
        {empatadas.map((t, i) => (
          <figure key={t.pos} className="sala-entra" style={{ ["--i" as string]: i } as React.CSSProperties}>
            {t.poster ? <img src={t.poster} alt="" /> : <span className="sala-separa-txt">{t.titulo}</span>}
            <figcaption>{t.titulo}</figcaption>
          </figure>
        ))}
      </div>
      {seg !== null && seg > 0 && (
        <p className="sala-vence" role="status">Hay <strong>{formatoSeg(seg)}</strong> para desempatar.</p>
      )}
      {resultado.puede_desempatar ? (
        <div className="sala-acciones">
          <button type="button" className="btn" onClick={desempatar} disabled={busy}>{busy ? "Un momento…" : "Desempatar"}</button>
        </div>
      ) : (
        <p className="sala-espera" role="status">Esperando a que {organizador} desempate…</p>
      )}
      {err && <p className="sala-err" role="alert">{err}</p>}
    </div>
  );
}
