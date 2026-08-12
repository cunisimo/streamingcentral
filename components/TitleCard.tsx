"use client";
import Link from "next/link";
import { usePlatforms } from "./PlatformsContext";
import PlatformLogo from "./PlatformLogo";
import QuickAddButton from "./QuickAddButton";
import type { UITitle } from "@/lib/types";

const star = <svg viewBox="0 0 24 24"><path d="M12 2l2.9 6.3 6.8.6-5.1 4.5 1.5 6.7L12 17l-6 3.6 1.5-6.7L2.4 8.9l6.8-.6z" /></svg>;

export default function TitleCard({ t, rank }: { t: UITitle; rank?: number }) {
  const { platforms, ready } = usePlatforms();
  const mine = t.platforms.filter((p) => platforms.includes(p));
  const shown = mine.slice(0, 2);
  const bg = t.poster ? { backgroundImage: `url(${t.poster})` } : { background: "#3A3A42" };
  // Fuera de tus plataformas: se dice con todas las letras y el póster va en
  // gris, para que se note de una sin leer.
  //
  // El `ready` no es opcional: el contexto arranca con DEFAULT_PLATFORMS y
  // recién después hidrata desde localStorage, así que sin esto TODAS las cards
  // parpadean en gris en cada carga. No hace falta chequear que haya al menos
  // una plataforma — PlatformsContext garantiza el invariante "nunca vacío" en
  // la hidratación, en `toggle` y en `set`.
  const fuera = ready && mine.length === 0;
  return (
    <div className={`card${fuera ? " off-plat" : ""}`}>
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
            {mine.length === 0 && (
              <span className="more off-plat-lbl">
                {fuera ? "No está en tus plataformas" : "—"}
              </span>
            )}
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
