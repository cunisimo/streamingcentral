"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { usePlatforms } from "./PlatformsContext";
import TitleCard from "./TitleCard";
import PersonCard from "./PersonCard";
import { GenreSlider, CountryFilter } from "./Filters";
import { GENRES, GENRE_COLOR, COUNTRIES, genreLabel } from "./data";
import type { UITitle, UIPerson, MediaType } from "@/lib/types";

type Filter = "todo" | "movie" | "tv" | "actores";

export default function SearchView() {
  const { ready } = usePlatforms();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("todo");
  const [res, setRes] = useState<{ titles: UITitle[]; people: UIPerson[] }>({ titles: [], people: [] });
  const [loading, setLoading] = useState(false);
  const [explore, setExplore] = useState<{ slug?: string; country?: string } | null>(null);
  const [covers, setCovers] = useState<Record<string, string | null>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    fetch("/api/genre-covers").then((r) => r.json()).then((j) => setCovers(j.covers ?? {})).catch(() => {});
  }, []);

  // búsqueda con debounce (desde 2 caracteres)
  useEffect(() => {
    if (!ready) return;
    const term = q.trim();
    if (term.length < 2) { setRes({ titles: [], people: [] }); setLoading(false); return; }
    if (timer.current) clearTimeout(timer.current);
    setLoading(true);
    timer.current = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}`)
        .then((r) => r.json())
        .then((j) => { setRes({ titles: j.titles ?? [], people: j.people ?? [] }); setLoading(false); })
        .catch(() => setLoading(false));
    }, 250);
  }, [q, ready]);

  const hasQuery = q.trim().length >= 2;
  const showTitles = filter === "actores" ? [] : filter === "todo" ? res.titles : res.titles.filter((t) => t.type === filter);
  const showPeople = filter === "todo" || filter === "actores" ? res.people : [];

  return (
    <div className="wrap buscar">
      <h1 className="buscar-title">Buscar</h1>
      <div className="bsearch">
        <svg className="ico" viewBox="0 0 24 24" fill="none" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
        <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setExplore(null); }} placeholder="¿Qué querés ver?" />
      </div>
      <div className="bchips">
        {(["todo", "movie", "tv", "actores"] as Filter[]).map((f) => (
          <button key={f} className={`bchip ${filter === f ? "on" : ""}`} onClick={() => { setFilter(f); setExplore(null); }}>
            {f === "todo" ? "Todo" : f === "movie" ? "Películas" : f === "tv" ? "Series" : "Actores"}
          </button>
        ))}
      </div>

      {/* ---- SIN QUERY: cada chip es un modo de navegación ---- */}
      {!hasQuery && filter === "todo" && !explore && (
        <>
          <h2 className="bres-h">Explorar todo</h2>
          <div className="explore-grid">
            {GENRES.filter((g) => g[0] !== "todos").map(([s, l]) => {
              const cover = covers[s];
              const style = cover
                ? { backgroundImage: `linear-gradient(180deg, rgba(0,0,0,.15), rgba(0,0,0,.55)), url(${cover})` }
                : { background: GENRE_COLOR[s] };
              return (
                <button key={s} className="explore-tile" style={style} onClick={() => setExplore({ slug: s })}><span>{l}</span></button>
              );
            })}
          </div>
          <h2 className="bres-h" style={{ marginTop: 26 }}>Por país</h2>
          <div className="chip-slider">
            {Object.entries(COUNTRIES).map(([c, v]) => (
              <button key={c} className="chip" onClick={() => setExplore({ country: c })}>{v.flag} {v.name}</button>
            ))}
          </div>
        </>
      )}

      {!hasQuery && filter === "todo" && explore && <ExploreList explore={explore} onBack={() => setExplore(null)} />}

      {!hasQuery && (filter === "movie" || filter === "tv") && <BrowseTitles tipo={filter} />}

      {!hasQuery && filter === "actores" && <BrowseActors />}

      {/* ---- CON QUERY: los chips filtran resultados ---- */}
      {hasQuery && (
        <>
          {loading && <p className="loading">Buscando…</p>}
          {!loading && showPeople.length > 0 && (
            <>
              <h2 className="bres-h">Actores</h2>
              <div className="people-grid">{showPeople.map((p) => <PersonCard key={p.id} p={p} />)}</div>
            </>
          )}
          {!loading && showTitles.length > 0 && (
            <>
              <h2 className="bres-h">Títulos</h2>
              <div className="grid">{showTitles.map((t) => <TitleCard key={`${t.type}-${t.id}`} t={t} />)}</div>
            </>
          )}
          {!loading && showTitles.length === 0 && showPeople.length === 0 && (
            <p className="empty-note">Sin resultados para “{q}”.</p>
          )}
        </>
      )}
    </div>
  );
}

// --- Navegar películas/series con filtros combinables + paginación ---
const AGES: [string, string][] = [["ATP", "atp"], ["+13", "13"], ["+16", "16"], ["+18", "18"]];

function BrowseTitles({ tipo }: { tipo: MediaType }) {
  const { platforms, ready } = usePlatforms();
  const [genre, setGenre] = useState("todos");
  const [country, setCountry] = useState<string | null>(null);
  const [age, setAge] = useState<string | null>(null);
  const [items, setItems] = useState<UITitle[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [end, setEnd] = useState(false);

  const buildUrl = useCallback((p: number) => {
    let u = `/api/discover?tipo=${tipo}&genre=${genre}&page=${p}&providers=${platforms.join(",")}`;
    if (country) u += `&country=${country}`;
    if (age && tipo === "movie") u += `&age=${age}`;
    return u;
  }, [tipo, genre, country, age, platforms]);

  const load = useCallback((p: number, replace: boolean) => {
    setLoading(true);
    fetch(buildUrl(p)).then((r) => r.json()).then((j) => {
      const nuevos: UITitle[] = j.items ?? [];
      setEnd(nuevos.length === 0);
      setItems((prev) => {
        const base = replace ? [] : prev;
        const seen = new Set(base.map((t) => `${t.type}-${t.id}`));
        return [...base, ...nuevos.filter((t) => !seen.has(`${t.type}-${t.id}`))];
      });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [buildUrl]);

  useEffect(() => {
    if (!ready) return;
    setPage(1); setEnd(false);
    load(1, true);
  }, [ready, load]);

  const more = () => { const p = page + 1; setPage(p); load(p, false); };

  return (
    <>
      <GenreSlider value={genre} onChange={setGenre} />
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <CountryFilter value={country} onChange={setCountry} />
        {tipo === "movie" && (
          <div className="bchips" style={{ margin: 0 }}>
            {AGES.map(([label, val]) => (
              <button key={val} className={`bchip ${age === val ? "on" : ""}`} onClick={() => setAge(age === val ? null : val)}>{label}</button>
            ))}
          </div>
        )}
      </div>
      <h2 className="bres-h">{tipo === "movie" ? "Películas" : "Series"}{genre !== "todos" ? ` · ${genreLabel(genre)}` : ""}{country ? ` · ${COUNTRIES[country]?.name}` : ""}</h2>
      <div className="grid">
        {items.map((t) => <TitleCard key={`${t.type}-${t.id}`} t={t} />)}
      </div>
      {loading && <p className="loading">Cargando…</p>}
      {!loading && items.length === 0 && <p className="empty-note">Nada con esta combinación. Probá otro filtro o activá más plataformas.</p>}
      {!loading && !end && items.length > 0 && (
        <div style={{ display: "flex", justifyContent: "center", padding: "18px 0" }}>
          <button className="btn ghost" onClick={more}>Cargar más</button>
        </div>
      )}
    </>
  );
}

// --- Actores populares con "Cargar más" (TMDB no tiene índice alfabético) ---
function BrowseActors() {
  const [people, setPeople] = useState<UIPerson[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);

  const load = useCallback((p: number) => {
    setLoading(true);
    fetch(`/api/personas?page=${p}`).then((r) => r.json()).then((j) => {
      const nuevos: UIPerson[] = j.people ?? [];
      setHasMore(Boolean(j.hasMore));
      setPeople((prev) => {
        const seen = new Set(prev.map((x) => x.id));
        return [...prev, ...nuevos.filter((x) => !seen.has(x.id))];
      });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(1); }, [load]);
  const more = () => { const p = page + 1; setPage(p); load(p); };

  return (
    <>
      <h2 className="bres-h">Actores populares</h2>
      <div className="people-grid">
        {people.map((p) => <PersonCard key={p.id} p={p} />)}
      </div>
      {loading && <p className="loading">Cargando…</p>}
      {!loading && hasMore && (
        <div style={{ display: "flex", justifyContent: "center", padding: "18px 0" }}>
          <button className="btn ghost" onClick={more}>Cargar más</button>
        </div>
      )}
    </>
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
    fetch(url).then((r) => r.json()).then((j) => { setItems(j.items ?? []); setLoading(false); }).catch(() => setLoading(false));
  }, [explore, platforms]);
  const title = explore.slug ? genreLabel(explore.slug) : `${COUNTRIES[explore.country!]?.flag} ${COUNTRIES[explore.country!]?.name}`;
  return (
    <>
      <button className="back" style={{ background: "none", border: "none", padding: 0, font: "inherit" }} onClick={onBack}><svg viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" /></svg>Explorar todo</button>
      <h2 className="section-title">{title}</h2>
      <p className="section-sub">{loading ? "Cargando…" : `${items.length} título${items.length !== 1 ? "s" : ""} en tus plataformas`}</p>
      <div className="grid">{items.map((t) => <TitleCard key={`${t.type}-${t.id}`} t={t} />)}</div>
    </>
  );
}
