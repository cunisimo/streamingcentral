"use client";
import { useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApi } from "./useApi";
import { usePlatforms } from "./PlatformsContext";
import PlatformLogo from "./PlatformLogo";
import TitleCard from "./TitleCard";
import LikeButton from "./LikeButton";
import ListActions from "./ListActions";
import RecordarButton from "./RecordarButton";
import { platformByCode } from "@/lib/providers-ar";
import ScScore from "./ScScore";
import CastRail from "./CastRail";
import HeroTrailer from "./HeroTrailer";
import OfflineState from "./pwa/OfflineState";
import DetailSkeleton from "./DetailSkeleton";
import { COUNTRIES, genreLabel } from "./data";
import type { UITitleDetail, MediaType, PlatformCode } from "@/lib/types";

const star = <svg viewBox="0 0 24 24"><path d="M12 2l2.9 6.3 6.8.6-5.1 4.5 1.5 6.7L12 17l-6 3.6 1.5-6.7L2.4 8.9l6.8-.6z" /></svg>;

export default function DetailView({ tipo, id }: { tipo: MediaType; id: string }) {
  const router = useRouter();
  const { platforms } = usePlatforms();
  const { data, loading, offline, error, retry } = useApi<UITitleDetail>(() => `/api/title/${tipo}/${id}?providers=${platforms.join(",")}`, [tipo, id]);
  const relTrack = useRef<HTMLDivElement>(null);

  // `error` (500 del server) entra acá igual que `offline`: si no, el skeleton
  // quedaría girando para siempre.
  if ((offline || error) && !data) return <div className="detail-inner"><OfflineState onRetry={retry} /></div>;
  if (loading || !data) return <DetailSkeleton />;
  const t = data;
  const mine = t.platforms.filter((p) => platforms.includes(p));
  // Todavía no salió: es lo que habilita "Recordarme". Se compara contra el día
  // de hoy en ISO, sin husos: la fecha de TMDB es un día calendario, no un
  // instante, y convertirla a Date acá corría el estreno un día en AR (UTC-3).
  // En películas manda la fecha de estreno; en series, la del próximo episodio
  // (`releaseDate` de una serie es su estreno original, así que una serie en
  // emisión nunca calificaría).
  const cuando = t.type === "movie" ? t.releaseDate : t.nextAirDate;
  const porEstrenar = !!cuando && cuando > new Date().toISOString().slice(0, 10);
  // Primera plataforma del título de la que conocemos la página de suscripción.
  const suscripcion = t.platforms
    .map((code) => ({ code, url: platformByCode(code)?.signupUrl }))
    .find((p): p is { code: PlatformCode; url: string } => !!p.url);
  const hero = t.backdrop || t.poster;
  const heroBg = hero ? { backgroundImage: `url(${hero})` } : { background: "#2A2D33" };
  const scrollRel = (d: number) => relTrack.current?.scrollBy({ left: d * (relTrack.current.clientWidth * 0.8), behavior: "smooth" });

  return (
    <div className="detail-inner">
      <HeroTrailer heroStyle={heroBg} onBack={() => router.back()} trailerKey={t.trailerKey} />
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
        ) : t.platforms.length ? (
          // El bloque ya existía como texto muerto. Ahora, si conocemos la
          // página de suscripción de esa plataforma, es un link: al usuario que
          // se está por perder un estreno le sirve más eso que un cartel.
          suscripcion ? (
            <a className="dprimary none link" href={suscripcion.url} target="_blank" rel="noreferrer">
              <span className="cap">No está en tus plataformas · suscribite a</span>
              <PlatformLogo code={suscripcion.code} />
            </a>
          ) : (
            <div className="dprimary none">
              <span className="cap">No está en tus plataformas · en</span>
              {t.platforms.map((p) => <PlatformLogo key={p} code={p} />)}
            </div>
          )
        ) : (
          <div className="dprimary none">No está en streaming</div>
        )}
        {mine.length > 1 && (
          <div className="dalso">También en {mine.slice(1).map((p, i) => <span key={p}>{i > 0 && " · "}<PlatformLogo code={p} /></span>)}</div>
        )}

        <div className="actions">
          <ListActions id={t.id} tipo={t.type} />
          {/* Sólo tiene sentido en lo que todavía no salió. */}
          {porEstrenar && (
            <RecordarButton
              id={t.id} tipo={t.type} titulo={t.title} fecha={cuando!}
              plataforma={t.platforms[0] ?? null} variant="texto"
            />
          )}
          <LikeButton id={t.id} tipo={t.type} />
          <button className="act" onClick={() => navigator.share?.({ title: t.title }).catch(() => {})}>
            <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></svg>
            <span className="lab">Compartir</span>
          </button>
        </div>

        {t.synopsis && <p className="dsyn">{t.synopsis}</p>}
        <CastRail cast={t.cast} />
        {t.directors.length > 0 && <p className="dcast"><b>Dirección:</b> {t.directors.join(", ")}</p>}
        {t.composers.length > 0 && <p className="dcast"><b>Música:</b> {t.composers.slice(0, 2).join(", ")}</p>}
        {t.type === "tv" && (t.seasons != null || t.episodes != null) && (
          <p className="dcast">
            <b>Serie:</b>{" "}
            {t.seasons != null && `${t.seasons} ${t.seasons === 1 ? "temporada" : "temporadas"}`}
            {t.seasons != null && t.episodes != null && " · "}
            {t.episodes != null && `${t.episodes} ${t.episodes === 1 ? "episodio" : "episodios"}`}
          </p>
        )}

        {(t.tmdb != null || t.imdb != null || t.metacritic != null || t.editorial) && (
          <>
            <div className="dsec-h">Puntajes</div>
            <div className="rating-bar">
              <ScScore id={t.id} tipo={t.type} />
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
