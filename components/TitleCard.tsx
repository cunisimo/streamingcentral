"use client";
import Link from "next/link";
import { usePlatforms } from "./PlatformsContext";
import PlatformLogo from "./PlatformLogo";
import type { UITitle } from "@/lib/types";

const star = <svg viewBox="0 0 24 24"><path d="M12 2l2.9 6.3 6.8.6-5.1 4.5 1.5 6.7L12 17l-6 3.6 1.5-6.7L2.4 8.9l6.8-.6z" /></svg>;

export default function TitleCard({ t }: { t: UITitle }) {
  const { platforms } = usePlatforms();
  const mine = t.platforms.filter((p) => platforms.includes(p));
  const shown = mine.slice(0, 2);
  const bg = t.poster ? { backgroundImage: `url(${t.poster})` } : { background: "#3A3A42" };
  return (
    <Link className="card" href={`/titulo/${t.type}/${t.id}`}>
      <div className="poster" style={bg}>
        {t.hasEditorial && <div className="ed-flag">{star}Reseña SC</div>}
        {!t.poster && <div className="ptitle">{t.title}</div>}
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
  );
}
