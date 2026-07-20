"use client";
import Link from "next/link";
import PlatformLogo from "../PlatformLogo";
import { genreLabel } from "../data";
import Confetti from "./Confetti";
import type { UITitle } from "@/lib/types";

export default function DesempateResult({
  winner, onReplay,
}: {
  winner: UITitle;
  onReplay: () => void;
}) {
  const genres = winner.genres.map(genreLabel).slice(0, 3).join(", ");
  return (
    <div className="dsmp-result">
      <Confetti />
      <p className="dsmp-result-kicker">✨ El ganador es…</p>
      <div className="dsmp-result-card">
        <div
          className="dsmp-result-poster"
          style={winner.poster ? { backgroundImage: `url(${winner.poster})` } : { background: "#3A3A42" }}
        >
          {!winner.poster && <span>{winner.title}</span>}
        </div>
        <div className="dsmp-result-body">
          <h3>{winner.title}</h3>
          <p className="dsmp-result-meta">
            {winner.year ?? ""}{genres ? ` · ${genres}` : ""}
          </p>
          {winner.platforms.length > 0 && (
            <div className="dsmp-result-plats">
              <span className="dsmp-result-plats-lbl">Disponible en:</span>
              <span className="logos">{winner.platforms.map((p) => <PlatformLogo key={p} code={p} />)}</span>
            </div>
          )}
          <div className="dsmp-result-actions">
            <Link className="btn" href={`/titulo/${winner.type}/${winner.id}`}>Ver ficha</Link>
            <button className="btn ghost" onClick={onReplay}>↻ Volver a jugar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
