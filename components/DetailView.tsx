"use client";
import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApi } from "./useApi";
import { usePlatforms } from "./PlatformsContext";
import PlatformLogo from "./PlatformLogo";
import TitleCard from "./TitleCard";
import { COUNTRIES, genreLabel } from "./data";
import type { UITitleDetail, MediaType } from "@/lib/types";

const star = <svg viewBox="0 0 24 24"><path d="M12 2l2.9 6.3 6.8.6-5.1 4.5 1.5 6.7L12 17l-6 3.6 1.5-6.7L2.4 8.9l6.8-.6z" /></svg>;

export default function DetailView({ tipo, id }: { tipo: MediaType; id: string }) {
  const router = useRouter();
  const { platforms } = usePlatforms();
  const { data, loading } = useApi<UITitleDetail>(() => `/api/title/${tipo}/${id}?providers=${platforms.join(",")}`, [tipo, id]);
  const [inList, setInList] = useState(false);
  const [rated, setRated] = useState(false);
  const relTrack = useRef<HTMLDivElement>(null);

  if (loading || !data) return <div className="detail-inner"><div className="dpad"><p className="loading">Cargando ficha…</p></div></div>;
  const t = data;
  const mine = t.platforms.filter((p) => platforms.includes(p));
  const hero = t.backdrop || t.poster;
  const heroBg = hero ? { backgroundImage: `url(${hero})` } : { background: "#2A2D33" };
  const scrollRel = (d: number) => relTrack.current?.scrollBy({ left: d * (relTrack.current.clientWidth * 0.8), behavior: "smooth" });

  return (
    <div className="detail-inner">
      <div className="dhero" style={heroBg}>
        <button className="dback" onClick={() => router.back()} aria-label="Volver">
          <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
      </div>
      <div className="dpad">
        <div className="dttl">{t.title}</div>
        <div className="dmeta">
          {t.year && <span>{t.year}</span>}
          {t.age && t.age !== "—" && <span className="age">{t.age}</span>}
          {t.runtime && <span>{t.runtime}</span>}
          {t.type === "tv" && t.episodes != null && <span>{t.episodes} ep.</span>}
          <span className="hd">HD</span>
          {t.country && COUNTRIES[t.country] && <span>{COUNTRIES[t.country].flag} {COUNTRIES[t.country].name}</span>}
        </div>

        {mine.length ? (
          <a className="dprimary" href={t.watchLink ?? t.links[mine[0]] ?? "#"} target="_blank" rel="noreferrer">
            <span className="play"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg></span>
            <span className="cap">Ver en</span><PlatformLogo code={mine[0]} />
          </a>
        ) : (
          <div className="dprimary none">No está en tus plataformas</div>
        )}
        {mine.length > 1 && (
          <div className="dalso">También en {mine.slice(1).map((p, i) => <span key={p}>{i > 0 && " · "}<PlatformLogo code={p} /></span>)}</div>
        )}

        <div className="actions">
          <button className={`act ${inList ? "on" : ""}`} onClick={() => setInList((v) => !v)}>
            {inList
              ? <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.2 4.2L19 7" /></svg>
              : <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>}
            <span className="lab">Mi lista</span>
          </button>
          <button className={`act ${rated ? "on" : ""}`} onClick={() => setRated((v) => !v)}>
            <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v11M7 10l4-7c1.5 0 2.5 1 2.5 2.5L13 10h5.5c1.1 0 2 1 1.8 2.1l-1.3 7c-.2 1-1 1.9-2 1.9H7" /></svg>
            <span className="lab">Calificar</span>
          </button>
          <button className="act" onClick={() => navigator.share?.({ title: t.title }).catch(() => {})}>
            <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></svg>
            <span className="lab">Compartir</span>
          </button>
        </div>

        {t.synopsis && <p className="dsyn">{t.synopsis}</p>}
        {t.cast.length > 0 && <p className="dcast"><b>Reparto:</b> {t.cast.slice(0, 4).join(", ")}{t.cast.length > 4 ? "…" : ""}</p>}
        {t.directors.length > 0 && <p className="dcast"><b>Dirección:</b> {t.directors.join(", ")}</p>}
        {t.composers.length > 0 && <p className="dcast"><b>Música:</b> {t.composers.slice(0, 2).join(", ")}</p>}
        {t.type === "tv" && (t.seasons != null || t.episodes != null) && (
          <p className="dcast"><b>Temporadas:</b> {t.seasons ?? "—"}{t.episodes != null ? ` · ${t.episodes} episodios` : ""}</p>
        )}

        {(t.tmdb != null || t.imdb != null || t.metacritic != null || t.editorial) && (
          <>
            <div className="dsec-h">Puntajes</div>
            <div className="rating-bar">
              {t.imdb != null && <div className="rb imdb"><div className="lbl">IMDb</div><div className="num">{t.imdb.toFixed(1)}</div></div>}
              {t.metacritic != null && <div className="rb mc"><div className="lbl">Metacritic</div><div className="num">{t.metacritic}</div></div>}
              {t.tmdb != null && <div className="rb"><div className="lbl">TMDB</div><div className="num">{t.tmdb.toFixed(1)}</div></div>}
              {t.editorial?.rating != null && <div className="rb ed"><div className="lbl">Reseña SC</div><div className="num">{t.editorial.rating.toFixed(1)}</div></div>}
            </div>
            {t.imdb == null && t.metacritic == null && (
              <p className="empty-note" style={{ paddingTop: 8 }}>IMDb y Metacritic aparecen cuando configurás la clave de OMDB.</p>
            )}
          </>
        )}

        {t.editorial && (
          <>
            <div className="dsec-h">Reseña editorial</div>
            <div className="review">
              <div className="badge">{star}Reseña SC</div>
              <p>{t.editorial.texto}</p>
              <p className="auth">— Reseña propia · {t.editorial.fecha}</p>
            </div>
          </>
        )}

        {t.genres.length > 0 && (
          <div className="gtags">{t.genres.map((g) => <span key={g} className="gt">{genreLabel(g)}</span>)}</div>
        )}

        {t.related.length > 0 && (
          <>
            <div className="shelf-head" style={{ marginTop: 28 }}>
              <div className="dsec-h" style={{ margin: 0 }}>También te puede interesar</div>
              <div className="arrows">
                <button className="arrow" onClick={() => scrollRel(-1)} aria-label="Anterior"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg></button>
                <button className="arrow" onClick={() => scrollRel(1)} aria-label="Siguiente"><svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg></button>
              </div>
            </div>
            <div className="track" ref={relTrack}>
              {t.related.map((r) => <TitleCard key={`${r.type}-${r.id}`} t={r} />)}
            </div>
          </>
        )}

        <div style={{ height: 8 }} />
        <Link href="/buscar" className="back" style={{ marginTop: 18 }}>
          <svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>Buscar otra cosa
        </Link>
      </div>
    </div>
  );
}
