"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePlatforms } from "./PlatformsContext";
import TitleCard from "./TitleCard";
import { GENRES, GENRE_COLOR, COUNTRIES, genreLabel } from "./data";
import type { UITitle, UIPerson } from "@/lib/types";

type Filter = "todo" | "movie" | "tv" | "actores";

export default function SearchView() {
  const { platforms, ready } = usePlatforms();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("todo");
  const [res, setRes] = useState<{ titles: UITitle[]; people: UIPerson[] }>({ titles: [], people: [] });
  const [loading, setLoading] = useState(false);
  const [explore, setExplore] = useState<{ slug?: string; country?: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    if (!ready) return;
    if (!q.trim()) { setRes({ titles: [], people: [] }); return; }
    if (timer.current) clearTimeout(timer.current);
    setLoading(true);
    timer.current = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}&providers=${platforms.join(",")}`)
        .then((r) => r.json())
        .then((j) => { setRes({ titles: j.titles ?? [], people: j.people ?? [] }); setLoading(false); })
        .catch(() => setLoading(false));
    }, 300);
  }, [q, ready, platforms]);

  const showTitles = filter !== "actores" ? (filter === "todo" ? res.titles : res.titles.filter((t) => t.type === filter)) : [];
  const showPeople = filter === "todo" || filter === "actores" ? res.people : [];

  return (
    <div className="wrap buscar">
      <h1 className="buscar-title">Buscar</h1>
      <div className="bsearch">
        <svg className="ico" viewBox="0 0 24 24" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
        <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setExplore(null); }} placeholder="¿Qué querés ver?" />
      </div>
      <div className="bchips">
        {(["todo", "movie", "tv", "actores"] as Filter[]).map((f) => (
          <button key={f} className={`bchip ${filter === f ? "on" : ""}`} onClick={() => setFilter(f)}>
            {f === "todo" ? "Todo" : f === "movie" ? "Películas" : f === "tv" ? "Series" : "Actores"}
          </button>
        ))}
      </div>

      {!q.trim() && !explore && (
        <>
          <h2 className="bres-h">Explorar todo</h2>
          <div className="explore-grid">
            {GENRES.filter((g) => g[0] !== "todos").map(([s, l]) => (
              <button key={s} className="explore-tile" style={{ background: GENRE_COLOR[s], border: "none" }} onClick={() => setExplore({ slug: s })}><span>{l}</span></button>
            ))}
          </div>
          <h2 className="bres-h" style={{ marginTop: 26 }}>Por país</h2>
          <div className="chip-slider">
            {Object.entries(COUNTRIES).map(([c, v]) => (
              <button key={c} className="chip" onClick={() => setExplore({ country: c })}>{v.flag} {v.name}</button>
            ))}
          </div>
        </>
      )}

      {!q.trim() && explore && <ExploreList explore={explore} onBack={() => setExplore(null)} />}

      {q.trim() && (
        <>
          {loading && <p className="loading">Buscando…</p>}
          {!loading && showPeople.length > 0 && (
            <>
              <h2 className="bres-h">Actores</h2>
              <div className="people-row">
                {showPeople.map((p) => (
                  <Link key={p.id} href={`/persona/${p.id}`} className="pcard">
                    <div className="av" style={p.profile ? { backgroundImage: `url(${p.profile})` } : { background: "#5A3340" }}>
                      {!p.profile && p.name.split(" ").map((n) => n[0]).join("")}
                    </div>
                    <div className="nm">{p.name}</div>
                    <div className="sb">{p.knownFor[0] ?? ""}</div>
                  </Link>
                ))}
              </div>
            </>
          )}
          {!loading && showTitles.length > 0 && (
            <>
              <h2 className="bres-h">Títulos</h2>
              <div className="grid">{showTitles.map((t) => <TitleCard key={`${t.type}-${t.id}`} t={t} />)}</div>
            </>
          )}
          {!loading && showTitles.length === 0 && showPeople.length === 0 && (
            <p className="empty-note">Sin resultados para “{q}” en tus plataformas.</p>
          )}
        </>
      )}
    </div>
  );
}

function ExploreList({ explore, onBack }: { explore: { slug?: string; country?: string }; onBack: () => void }) {
  const { platforms } = usePlatforms();
  const [items, setItems] = useState<UITitle[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const url = explore.slug
      ? `/api/discover?tipo=movie&genre=${explore.slug}&providers=${platforms.join(",")}`
      : `/api/discover?tipo=movie&country=${explore.country}&providers=${platforms.join(",")}`;
    setLoading(true);
    fetch(url).then((r) => r.json()).then((j) => { setItems(j.items ?? []); setLoading(false); });
  }, [explore, platforms]);
  const title = explore.slug ? genreLabel(explore.slug) : `${COUNTRIES[explore.country!]?.flag} ${COUNTRIES[explore.country!]?.name}`;
  return (
    <>
      <button className="back" style={{ background: "none", border: "none", padding: 0, font: "inherit" }} onClick={onBack}><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>Explorar todo</button>
      <h2 className="section-title">{title}</h2>
      <p className="section-sub">{loading ? "Cargando…" : `${items.length} título${items.length !== 1 ? "s" : ""} en tus plataformas`}</p>
      <div className="grid">{items.map((t) => <TitleCard key={`${t.type}-${t.id}`} t={t} />)}</div>
    </>
  );
}
