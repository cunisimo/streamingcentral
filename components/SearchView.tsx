"use client";
import Link from "next/link";
import { useState, useEffect, useRef, useCallback } from "react";
import { usePlatforms } from "./PlatformsContext";
import TitleCard from "./TitleCard";
import PersonCard from "./PersonCard";
import { GenreSlider, CountryFilter, DecadeFilter } from "./Filters";
import { useEstadoSimple } from "@/hooks/useEstadoSimple";
import { crearTicket, esParaMi, invalidar, type Ticket } from "@/hooks/ticket-vuelta";
import { GENRES, GENRE_COLOR, COUNTRIES, genreLabel } from "./data";
import type { UITitle, UIPerson, MediaType } from "@/lib/types";

type Filter = "todo" | "movie" | "tv" | "actores" | "directores";

export default function SearchView() {
  const { platforms, ready } = usePlatforms();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("todo");
  const [res, setRes] = useState<{ titles: UITitle[]; people: UIPerson[] }>({ titles: [], people: [] });
  const [loading, setLoading] = useState(false);
  const [explore, setExplore] = useState<{ country: string } | null>(null);
  const [covers, setCovers] = useState<Record<string, string | null>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // --- Volver de una ficha --------------------------------------------------
  // Acá hay DOS dueños de estado: el modo y el texto viven en esta vista, y los
  // títulos y las páginas en los hijos (`BrowseTitles`, `BrowseActors`). Como
  // `consumirVuelta` borra la marca al leerla, si los dos preguntaran el primero
  // se la llevaría y el segundo restauraría vacío.
  //
  // Por eso la consume UNA sola vez el padre —adentro de `useEstadoSimple`— y la
  // reparte con un ticket a nombre del modo restaurado. Ver hooks/ticket-vuelta.
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const proximoTicket = useRef(0);

  const { fase, inicial } = useEstadoSimple<
    { titles: UITitle[]; people: UIPerson[] },
    { q: string; filter: Filter; explore: { country: string } | null }
  >({
    clave: "buscar",
    firma: platforms.join(","),
    datos: res,
    extra: { q, filter, explore },
    // Hay altura cuando ya se pintó algo: resultados de texto o el modo browse.
    listo: !loading && (res.titles.length > 0 || res.people.length > 0),
    // Con la vista en su estado inicial no hay nada que guardar. Si no, el
    // primer render pisaría el snapshot justo antes de que alguien lo lea.
    vacio: !q.trim() && filter === "todo" && !explore,
  });

  // Lo restaurado se aplica una sola vez, y el ticket se emite recién después de
  // haber puesto el modo: el hijo que monte es el que estaba abierto.
  const aplicado = useRef(false);
  const qRestaurado = useRef<string | null>(null);
  useEffect(() => {
    if (fase !== "listo" || aplicado.current) return;
    aplicado.current = true;
    if (!inicial?.extra) return;
    const e = inicial.extra;
    // `qRestaurado` evita que el debounce vuelva a buscar lo mismo que acaba de
    // volver del snapshot: sin esto, restaurar el texto dispara la llamada a
    // /api/search que el snapshot justamente hacía innecesaria.
    qRestaurado.current = e.q;
    setQ(e.q);
    setFilter(e.filter);
    setExplore(e.explore);
    setRes(inicial.datos);
    // EL TICKET SOLO SE EMITE SI VA A MONTAR UN HIJO QUE PUEDA CONSUMIRLO.
    // Con texto de búsqueda los resultados los pinta el padre y no monta
    // ninguno, así que el ticket quedaba abierto para siempre: bastaba con
    // borrar el texto para que el hijo que montara reclamara una vuelta vieja
    // y restaurara filtros y páginas de una navegación anterior.
    const conTexto = e.q.trim().length >= 2;
    if (!conTexto) {
      // El modo del ticket incluye "explore": ese hijo también restaura.
      setTicket(crearTicket(++proximoTicket.current, e.explore ? "explore" : e.filter));
    }
  }, [fase, inicial]);

  const idTicket = ticket?.id ?? -1;
  const cerrarTicket = useCallback(() => {
    setTicket((t) => invalidar(t, idTicket));
  }, [idTicket]);

  useEffect(() => {
    fetch("/api/genre-covers").then((r) => r.json()).then((j) => setCovers(j.covers ?? {})).catch(() => {});
  }, []);

  // búsqueda con debounce (desde 2 caracteres)
  useEffect(() => {
    if (!ready) return;
    // Esperar a que se decida la restauración: si no, se dispara la búsqueda del
    // estado inicial y después la pisa lo restaurado — dos cargas y un parpadeo.
    if (fase !== "listo") return;
    const term = q.trim();
    // Mientras se está restaurando, este efecto NO puede tocar nada. Corre una
    // vez con el `q` viejo —React todavía no aplicó el `setQ` del snapshot— y
    // ahí el `term.length < 2` de abajo limpiaba `res`, borrando los resultados
    // restaurados justo antes de pintarlos: volvía el texto y la pestaña, con
    // la grilla vacía.
    if (qRestaurado.current !== null) {
      if (term !== qRestaurado.current.trim()) return;   // todavía no llegó el texto
      // Ya llegó: los resultados vinieron con él, así que no hay nada que pedir.
      qRestaurado.current = null;
      setLoading(false);
      return;
    }
    if (term.length < 2) { setRes({ titles: [], people: [] }); setLoading(false); return; }
    if (timer.current) clearTimeout(timer.current);
    setLoading(true);
    timer.current = setTimeout(() => {
      // Las plataformas van para ORDENAR, no para filtrar: los resultados que
      // sí podés ver van arriba y el resto sigue apareciendo abajo.
      fetch(`/api/search?q=${encodeURIComponent(term)}&providers=${platforms.join(",")}`)
        .then((r) => r.json())
        .then((j) => { setRes({ titles: j.titles ?? [], people: j.people ?? [] }); setLoading(false); })
        .catch(() => setLoading(false));
    }, 250);
  }, [q, ready, platforms, fase]);

  const hasQuery = q.trim().length >= 2;
  const showTitles = filter === "actores" || filter === "directores" ? [] : filter === "todo" ? res.titles : res.titles.filter((t) => t.type === filter);
  const showPeople = filter === "actores" ? res.people.filter((p) => (p.department ?? "Acting") === "Acting")
    : filter === "directores" ? res.people.filter((p) => p.department === "Directing")
    : filter === "todo" ? res.people
    : [];

  return (
    <div className="wrap buscar">
      <h1 className="buscar-title">¿Qué vemos hoy?</h1>
      <div className="bsearch">
        <svg className="ico" viewBox="0 0 24 24" fill="none" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
        <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setExplore(null); }} placeholder="¿Qué querés ver?" />
      </div>
      <div className="bchips">
        {((filter === "movie" || filter === "tv" ? ["todo", "movie", "tv"] : ["todo", "movie", "tv", "actores", "directores"]) as Filter[]).map((f) => (
          <button key={f} className={`bchip ${filter === f ? "on" : ""}`} onClick={() => { setFilter(f); setExplore(null); }}>
            {f === "todo" ? "Todo" : f === "movie" ? "Películas" : f === "tv" ? "Series" : f === "actores" ? "Actores" : "Directores"}
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
              const color = GENRE_COLOR[s];
              // Lavado del color del género sobre el póster: la imagen queda tenue
              // y el color diferencia cada categoría (D9≈85%, F2≈95% alpha).
              const style = cover
                ? { backgroundImage: `linear-gradient(180deg, ${color}D9, ${color}F2), url(${cover})` }
                : { background: color };
              return (
                <Link key={s} href={`/categoria/${s}`} className="explore-tile" style={style}><span>{l}</span></Link>
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

      {!hasQuery && filter === "todo" && explore && <ExploreList explore={explore} onBack={() => setExplore(null)} volvio={esParaMi(ticket, "explore")} onDecidido={cerrarTicket} />}

      {!hasQuery && (filter === "movie" || filter === "tv") && <BrowseTitles tipo={filter} volvio={esParaMi(ticket, filter)} onDecidido={cerrarTicket} />}

      {!hasQuery && filter === "actores" && <BrowseActors volvio={esParaMi(ticket, "actores")} onDecidido={cerrarTicket} />}

      {!hasQuery && filter === "directores" && <BrowseDirectors volvio={esParaMi(ticket, "directores")} onDecidido={cerrarTicket} />}

      {/* ---- CON QUERY: los chips filtran resultados ---- */}
      {hasQuery && (
        <>
          {loading && <p className="loading">Buscando…</p>}
          {!loading && showPeople.length > 0 && (
            <>
              <h2 className="bres-h">{filter === "directores" ? "Directores" : "Actores"}</h2>
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
const AGES: [string, string][] = [["ATP", "atp"], ["+13", "13"], ["+16", "16"]];

// Décadas. El valor viaja a /api/discover, que lo traduce a un rango de fechas.
//
// Películas y series NO ofrecen lo mismo, a propósito. Medido el 2026-08-09
// sobre AR + flatrate + las 14 plataformas: en películas, de 1930 a 1969 hay
// 260 títulos contra 3133 solo en los 2020, así que todo eso va agrupado en un
// bucket ("Antes de 1970") en vez de tres décadas casi vacías. En series no
// existe NADA antes de 1950 (0 en los 30 y 0 en los 40), así que esas dos
// simplemente no se ofrecen, y desde los 50 van sueltas.
//
// La lista es fija y no un conteo en vivo: saber qué década está vacía depende
// de las plataformas del usuario y de los filtros que ya tenga puestos, o sea
// una llamada extra a TMDB por opción cada vez que toca algo. Si dentro de un
// tiempo el catálogo cambia, se recuenta a mano con la consulta de discover.
const DECADES: Record<MediaType, [string, string][]> = {
  movie: [
    ["Antes de 1970", "pre1970"], ["Años 70", "1970"], ["Años 80", "1980"], ["Años 90", "1990"],
    ["Años 2000", "2000"], ["Años 2010", "2010"], ["Años 2020", "2020"],
  ],
  tv: [
    ["Años 50", "1950"], ["Años 60", "1960"], ["Años 70", "1970"], ["Años 80", "1980"],
    ["Años 90", "1990"], ["Años 2000", "2000"], ["Años 2010", "2010"], ["Años 2020", "2020"],
  ],
};

// UNA sola entrada para los hijos, compartida entre todos los modos: cambiar de
// pestaña la pisa. No queremos historiales paralelos de Películas, Series y
// Actores — la regla es volver a la vista que dejaste, no recordar una por
// pestaña. El modo va adentro del snapshot para descartarlo si no corresponde.
const CLAVE_HIJO = "buscar:hijo";

interface ExtraHijo { modo: string; genre?: string; country?: string | null; age?: string | null; decade?: string | null; page?: number }

function BrowseTitles({ tipo, volvio, onDecidido }: {
  tipo: MediaType; volvio?: boolean; onDecidido?: () => void;
}) {
  const { platforms, ready } = usePlatforms();
  const [genre, setGenre] = useState("todos");
  const [country, setCountry] = useState<string | null>(null);
  const [age, setAge] = useState<string | null>(null);
  const [decade, setDecade] = useState<string | null>(null);
  const [items, setItems] = useState<UITitle[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [end, setEnd] = useState(false);

  const buildUrl = useCallback((p: number) => {
    let u = `/api/discover?tipo=${tipo}&genre=${genre}&page=${p}&providers=${platforms.join(",")}`;
    if (country) u += `&country=${country}`;
    if (age && tipo === "movie") u += `&age=${age}`;
    if (decade) u += `&decade=${decade}`;
    return u;
  }, [tipo, genre, country, age, decade, platforms]);

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

  const { fase, inicial } = useEstadoSimple<UITitle[], ExtraHijo>({
    clave: CLAVE_HIJO,
    firma: platforms.join(","),
    datos: items,
    extra: { modo: tipo, genre, country, age, decade, page },
    listo: !loading && items.length > 0,
    vacio: items.length === 0,
    volvio,          // el ticket del padre: acá NO se consume la marca
    onDecidido,      // y así se cierra: lo avisa el hijo, no un timeout
  });

  // Restaurar antes de pedir. Si el snapshot vale, no se llama a /api/discover:
  // vuelven los títulos, los filtros y la página en la que iba.
  const restaurado = useRef(false);
  useEffect(() => {
    if (!ready || fase !== "listo" || restaurado.current) return;
    restaurado.current = true;
    const e = inicial?.extra;
    if (inicial && e?.modo === tipo) {
      setItems(inicial.datos);
      setGenre(e.genre ?? "todos");
      setCountry(e.country ?? null);
      setAge(e.age ?? null);
      setDecade(e.decade ?? null);
      setPage(e.page ?? 1);
      setLoading(false);
      return;
    }
    setPage(1); setEnd(false);
    load(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, fase, inicial]);

  // Los cambios POSTERIORES de filtro sí recargan, y son deliberados: lista
  // nueva desde la página 1 y arriba de todo.
  const urlPrevia = useRef<string | null>(null);
  useEffect(() => {
    if (!restaurado.current) return;
    const u = buildUrl(1);
    if (urlPrevia.current === null) { urlPrevia.current = u; return; }
    if (urlPrevia.current === u) return;
    urlPrevia.current = u;
    setPage(1); setEnd(false);
    window.scrollTo(0, 0);
    load(1, true);
  }, [buildUrl, load]);

  const more = () => { const p = page + 1; setPage(p); load(p, false); };

  // Al pasar de Películas a Series el componente NO se remonta, así que una
  // década que sólo existe en películas ("Antes de 1970") quedaría seleccionada
  // en un selector que ya no la ofrece: filtrando sin que se vea qué filtro es.
  const opciones = DECADES[tipo];
  useEffect(() => {
    if (decade && !opciones.some(([, v]) => v === decade)) setDecade(null);
  }, [decade, opciones]);
  const decadeLabel = opciones.find(([, v]) => v === decade)?.[0] ?? null;

  return (
    <>
      <GenreSlider value={genre} onChange={setGenre} />
      <div className="filtros-fila">
        <CountryFilter value={country} onChange={setCountry} />
        {tipo === "movie" && (
          <div className="bchips" style={{ margin: 0 }}>
            {AGES.map(([label, val]) => (
              <button key={val} className={`bchip ${age === val ? "on" : ""}`} onClick={() => setAge(age === val ? null : val)}>{label}</button>
            ))}
          </div>
        )}
        <DecadeFilter value={decade} onChange={setDecade} options={opciones} />
      </div>
      <h2 className="bres-h">{tipo === "movie" ? "Películas" : "Series"}{genre !== "todos" ? ` · ${genreLabel(genre)}` : ""}{country ? ` · ${COUNTRIES[country]?.name}` : ""}{decadeLabel ? ` · ${decadeLabel}` : ""}</h2>
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
function BrowseActors({ volvio, onDecidido }: { volvio?: boolean; onDecidido?: () => void }) {
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

  // Comparte la entrada con `BrowseTitles`: una sola por ruta. El `modo` del
  // snapshot es lo que evita leer una lista de títulos como si fueran personas.
  const { fase, inicial } = useEstadoSimple<UIPerson[], ExtraHijo>({
    clave: CLAVE_HIJO,
    firma: "",       // /api/personas no depende de plataformas
    datos: people,
    extra: { modo: "actores", page },
    listo: !loading && people.length > 0,
    vacio: people.length === 0,
    volvio,
    onDecidido,
  });

  const restaurado = useRef(false);
  useEffect(() => {
    if (fase !== "listo" || restaurado.current) return;
    restaurado.current = true;
    if (inicial && inicial.extra?.modo === "actores") {
      setPeople(inicial.datos);
      setPage(inicial.extra.page ?? 1);
      setLoading(false);
      return;
    }
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase, inicial]);

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

// --- Directores curados (lista fija de /api/directores). TMDB no tiene índice
// de directores como sí de actores (person/popular es ~99% actores), así que el
// browse muestra una lista curada; para cualquier otro, usar el buscador. ---
function BrowseDirectors({ volvio, onDecidido }: { volvio?: boolean; onDecidido?: () => void }) {
  const [people, setPeople] = useState<UIPerson[]>([]);
  const [loading, setLoading] = useState(true);
  // Comparte la ÚNICA entrada de los hijos. Sin esto no había forma de saber
  // cuándo terminó de cargar, así que el padre no tenía condición válida para
  // devolver el scroll: volvía al modo correcto y a la posición 0.
  const { fase, inicial } = useEstadoSimple<UIPerson[], ExtraHijo>({
    clave: CLAVE_HIJO,
    firma: "",          // la lista de directores es curada, no depende de plataformas
    datos: people,
    extra: { modo: "directores" },
    listo: !loading && people.length > 0,
    vacio: people.length === 0,
    volvio,
    onDecidido,
  });
  const restaurado = useRef(false);
  useEffect(() => {
    if (fase !== "listo" || restaurado.current) return;
    restaurado.current = true;
    if (inicial && inicial.extra?.modo === "directores") {
      setPeople(inicial.datos);
      setLoading(false);
      return;
    }
    fetch("/api/directores").then((r) => r.json()).then((j) => {
      setPeople(j.people ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase, inicial]);
  return (
    <>
      <h2 className="bres-h">Directores</h2>
      {loading ? <p className="loading">Cargando…</p>
        : <div className="people-grid">{people.map((p) => <PersonCard key={p.id} p={p} />)}</div>}
    </>
  );
}

function ExploreList({ explore, onBack, volvio, onDecidido }: {
  explore: { country: string }; onBack: () => void; volvio?: boolean; onDecidido?: () => void;
}) {
  const { platforms } = usePlatforms();
  const [items, setItems] = useState<UITitle[]>([]);
  const [loading, setLoading] = useState(true);
  // El país lo restaura el padre; los títulos y la posición, este hijo. El
  // modo guardado incluye el país para no restaurar el listado de otro.
  const modoPais = `explore:${explore.country}`;
  const { fase, inicial } = useEstadoSimple<UITitle[], ExtraHijo>({
    clave: CLAVE_HIJO,
    firma: platforms.join(","),
    datos: items,
    extra: { modo: modoPais },
    listo: !loading && items.length > 0,
    vacio: items.length === 0,
    volvio,
    onDecidido,
  });
  const restaurado = useRef(false);
  useEffect(() => {
    if (fase !== "listo") return;
    if (!restaurado.current) {
      restaurado.current = true;
      if (inicial && inicial.extra?.modo === modoPais) {
        setItems(inicial.datos);
        setLoading(false);
        return;
      }
    }
    const url = `/api/discover?tipo=movie&country=${explore.country}&providers=${platforms.join(",")}`;
    setLoading(true);
    fetch(url).then((r) => r.json()).then((j) => { setItems(j.items ?? []); setLoading(false); }).catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase, inicial, explore, platforms]);
  const title = `${COUNTRIES[explore.country]?.flag} ${COUNTRIES[explore.country]?.name}`;
  return (
    <>
      <button className="back" style={{ background: "none", border: "none", padding: 0, font: "inherit" }} onClick={onBack}><svg viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" /></svg>Explorar todo</button>
      <h2 className="section-title">{title}</h2>
      <p className="section-sub">{loading ? "Cargando…" : `${items.length} título${items.length !== 1 ? "s" : ""} en tus plataformas`}</p>
      <div className="grid">{items.map((t) => <TitleCard key={`${t.type}-${t.id}`} t={t} />)}</div>
    </>
  );
}
