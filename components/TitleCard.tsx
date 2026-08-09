"use client";
import Link from "next/link";
import { usePlatforms } from "./PlatformsContext";
import PlatformLogo from "./PlatformLogo";
import QuickAddButton from "./QuickAddButton";
import type { UITitle } from "@/lib/types";

const star = <svg viewBox="0 0 24 24"><path d="M12 2l2.9 6.3 6.8.6-5.1 4.5 1.5 6.7L12 17l-6 3.6 1.5-6.7L2.4 8.9l6.8-.6z" /></svg>;

export default function TitleCard({ t, rank }: { t: UITitle; rank?: number }) {
  const { platforms } = usePlatforms();
  const mine = t.platforms.filter((p) => platforms.includes(p));
  const shown = mine.slice(0, 2);
  const bg = t.poster ? { backgroundImage: `url(${t.poster})` } : { background: "#3A3A42" };
  return (
    <div className="card">
      <Link className="card-link" href={`/titulo/${t.type}/${t.id}`}>
        <div className="poster" style={bg}>
          {t.hasEditorial && <div className="ed-flag">{star}Reseña SC</div>}
          {/* Número del ranking del Top, va abajo a la izquierda sobre el degradado */}
          {rank != null && <span className={`rank-num${rank <= 3 ? " top3" : ""}`}>{rank}</span>}
          {!t.poster && <div className={`ptitle${rank != null ? " rank-shift" : ""}`}>{t.title}</div>}
        </div>
        <div className="meta">
          <div className="t">{t.title}</div>
          <div className="info">{t.year ?? ""}{t.runtime ? ` · ${t.runtime}` : ""}</div>
          <div className="logos">
            {shown.map((p) => <PlatformLogo key={p} code={p} />)}
            {mine.length > 2 && <span className="more">+{mine.length - 2}</span>}
            {mine.length === 0 && <span className="more">—</span>}
          </div>
          {t.tmdb != null && (
            <div className="ratings">
              <span className="r"><span className="star">{star}</span><span>{t.tmdb.toFixed(1)}</span><span className="src">TMDB</span></span>
            </div>
          )}
        </div>
      </Link>
      <QuickAddButton id={t.id} tipo={t.type} />
    </div>
  );
}
