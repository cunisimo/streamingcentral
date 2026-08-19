"use client";
import { useState, useRef, useEffect } from "react";
import { useApi } from "./useApi";
import { usePlatforms } from "./PlatformsContext";
import TitleCard from "./TitleCard";
import CardSkeleton from "./CardSkeleton";
import { useTrackScroll } from "@/hooks/useTrackScroll";
import { claveTrackHero, guardarEstadoHero, leerEstadoHero } from "./hero-estado";
import type { MotivoVacio, UITitle } from "@/lib/types";

// "Recomendador": no hay IA. Cada chip mapea a un slug de categoría
// (lib/categories.ts) que alimenta el pool "6 para hoy". Dos grupos:
// estados de ánimo (géneros) y temáticas (géneros/keywords).
type Mood = { slug: string; label: string; emoji: string; group: "animo" | "tematica" };
const MOODS: Mood[] = [
  { slug: "palomitas",           label: "Palomitas",             emoji: "🍿", group: "animo" },
  { slug: "drama",               label: "Drama intenso",         emoji: "😭", group: "animo" },
  { slug: "misterio-intrincado", label: "Misterio intrincado",   emoji: "🔍", group: "animo" },
  { slug: "comedia",             label: "Para reír",             emoji: "😂", group: "animo" },
  { slug: "terror",              label: "Terror siniestro",      emoji: "👻", group: "animo" },
  { slug: "scifi",               label: "Sci-fi épico",          emoji: "🛸", group: "animo" },
  { slug: "familiar",            label: "Aventura familiar",     emoji: "👨‍👩‍👧‍👦", group: "animo" },
  { slug: "romance",             label: "Historias de amor",     emoji: "💖", group: "tematica" },
  { slug: "navidad",             label: "Mágica navidad",        emoji: "🎄", group: "tematica" },
  { slug: "guerra",              label: "Fuego cruzado",         emoji: "⚔️", group: "tematica" },
  { slug: "aliens",              label: "Contacto extraterrestre", emoji: "👽", group: "tematica" },
  { slug: "espacio",             label: "Odisea espacial",       emoji: "🌌", group: "tematica" },
  { slug: "reales",              label: "Historias reales",      emoji: "🧠", group: "tematica" },
  { slug: "fantasia",            label: "Mundos fantásticos",    emoji: "🧙‍♂️", group: "tematica" },
  { slug: "crimen",              label: "Crimen y mafia",        emoji: "🕵️‍♂️", group: "tematica" },
  { slug: "supervivencia",       label: "Supervivencia extrema", emoji: "🏔️", group: "tematica" },
];

const ANIMO = MOODS.filter((m) => m.group === "animo");
const TEMATICA = MOODS.filter((m) => m.group === "tematica");

export default function IndecisoHero({
  initialItems, heroPendiente, cargaDegradada,
}: {
  initialItems?: UITitle[];
  // true mientras el payload del composer está en vuelo. Distingue "todavía no
  // llegó" de "llegó vacío": sin esto, el primer render (initialItems undefined)
  // disparaba /api/recomendaciones al pedo en CADA carga del Home.
  heroPendiente?: boolean;
  // true cuando el composer respondió con fuentes caídas. Un hero vacío ahí NO
  // significa "no tenés nada en tus plataformas" — significa que no se pudo
  // cargar. El reintento vive en CatalogView (un solo botón para todo el Home).
  cargaDegradada?: boolean;
}) {
  const { platforms } = usePlatforms();
  const [offset, setOffset] = useState(0);
  const [genre, setGenre] = useState("todos");
  const [activeMood, setActiveMood] = useState<Mood | null>(null);
  const [sectionTitle, setSectionTitle] = useState("6 para hoy");
  const track = useRef<HTMLDivElement>(null);
  // Hasta que no se leyó el estado guardado no se persiste nada: si no, el
  // primer render (con el estado inicial) pisaría lo que el usuario dejó.
  const [restaurado, setRestaurado] = useState(false);

  // Volver de una ficha tiene que devolverte al MISMO conjunto, no solo a la
  // misma posición de scroll. Sin esto, elegir "Terror", pedir "Otras" dos
  // veces y abrir una ficha te devolvía a "6 para hoy" desde cero: la posición
  // horizontal se restauraba, pero sobre otro contenido.
  //
  // Se lee en un efecto y no en el estado inicial porque este componente lo
  // renderiza el server: leer sessionStorage durante el render sería un
  // mismatch de hidratación.
  useEffect(() => {
    const e = leerEstadoHero();
    if (e.slug !== "todos" || e.offset > 0) {
      const m = MOODS.find((x) => x.slug === e.slug) ?? null;
      // El chip se DERIVA del slug: la etiqueta y el emoji salen de la lista, no
      // del sessionStorage. Si el slug ya no existe (chip renombrado o sacado),
      // `m` es null y se vuelve al estado base en vez de romper.
      if (m) {
        setActiveMood(m);
        setSectionTitle(`Resultados: ${m.label} ${m.emoji}`);
        setGenre(m.slug);
      }
      setOffset(e.offset);
    }
    setRestaurado(true);
  }, []);

  useEffect(() => {
    if (restaurado) guardarEstadoHero({ slug: genre, offset });
  }, [restaurado, genre, offset]);

  // El estado base ("6 para hoy", sin chip, offset 0) viene del composer, que ya
  // reservó esos títulos para que no se repitan abajo. Al tocar un chip o
  // "Mostrame otras" se vuelve a /api/recomendaciones: es exploración puntual y
  // NO rearma el Home.
  const esBase = genre === "todos" && offset === 0;
  // Criterio de "controlado" igual al de Shelf: `!== undefined`, no truthiness.
  // Un hero legítimamente vacío (0 títulos en tus plataformas) es un resultado
  // válido del composer, no una razón para ir a buscar otra cosa.
  const controlado = initialItems !== undefined;
  // El estado base lo manda el composer (ya reservó esos títulos para que no se
  // repitan abajo): mientras esté pendiente o ya haya llegado, no se fetchea.
  // Si el composer falló (ni pendiente ni controlado) el hero se busca solo.
  const usaComposer = esBase && (heroPendiente || controlado);
  const { data, loading: fetchLoading } = useApi<{ items: UITitle[]; motivo?: MotivoVacio }>(
    () => (usaComposer
      ? ""
      : `/api/recomendaciones?tipo=all&genre=${genre}&offset=${offset}&providers=${platforms.join(",")}`),
    [offset, genre, controlado, heroPendiente],
  );
  const loading = usaComposer ? !!heroPendiente : fetchLoading;
  const picks = usaComposer ? (initialItems ?? []) : (data?.items ?? []);
  const filtered = genre !== "todos";

  // La clave incluye chip y tanda: cada conjunto de 6 es contenido distinto y
  // tiene su propia posición. Se restaura recién con las tarjetas puestas — con
  // el riel vacío no hay ancho que scrollear y asignar `scrollLeft` no hace nada.
  useTrackScroll(claveTrackHero({ slug: genre, offset }), track, !loading && picks.length > 0);

  // Qué decir cuando no hay nada que mostrar. La regla: solo se le pide al
  // usuario que active una plataforma cuando el filtro de plataformas fue lo que
  // vació la lista. Si vino vacía desde antes de filtrar, el problema es
  // nuestro y pedirle que active algo lo manda a buscar un botón que no arregla
  // nada. Ver MotivoVacio en lib/types.ts.
  //
  // El texto viejo ("Nada en tus plataformas. Activá alguna") era el ÚNICO para
  // todos los casos, y acá nunca podía ser cierto: `PlatformsContext` no deja la
  // lista vacía —si el usuario destilda todo, cae a DEFAULT_PLATFORMS— así que
  // el estado "no elegiste ninguna" no existe del lado del cliente.
  //
  // Por eso el mensaje sale del `motivo` que manda el server y NO de
  // `platforms.length`: preguntarle al cliente daba siempre la misma respuesta
  // (tiene plataformas) y por eso el texto injusto salía siempre. El server sí
  // sabe con qué se pidió. Si algún día el contexto permite la lista vacía, esto
  // ya funciona sin tocarlo.
  function textoVacio() {
    if (usaComposer && cargaDegradada) return "No pudimos cargar las recomendaciones de hoy.";
    // El estado base viene del composer, que no manda motivo; ahí no se supone.
    const motivo = usaComposer ? undefined : data?.motivo;
    if (motivo === "sin-plataformas") return "Nada en tus plataformas. Activá alguna en el botón de arriba.";
    if (motivo === "filtro") {
      return filtered
        ? "Nada de esta categoría está en tus plataformas."
        : "No encontramos nada en tus plataformas.";
    }
    return filtered
      ? "No pudimos armar esta selección hoy. Probá con otra categoría."
      : "No pudimos armar las recomendaciones de hoy.";
  }

  function reset() {
    setActiveMood(null);
    setSectionTitle("6 para hoy");
    setGenre("todos");
    setOffset(0);
  }

  function pickMood(m: Mood) {
    if (activeMood?.slug === m.slug) {
      reset(); // toggle off: vuelve al pool general
      return;
    }
    setActiveMood(m);
    setSectionTitle(`Resultados: ${m.label} ${m.emoji}`);
    setGenre(m.slug);
    setOffset(0);
  }

  const chipGroup = (label: string, items: Mood[]) => (
    <div className="chip-group">
      <span className="chip-group-label">{label}</span>
      <div className="chip-slider">
        {items.map((m) => (
          <button
            key={m.slug}
            className={`chip ${activeMood?.slug === m.slug ? "active" : ""}`}
            onClick={() => pickMood(m)}
          >
            {m.label} {m.emoji}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <section className="hero">
      <div className="wrap">
        <p className="kicker">Todas tus plataformas en un solo lugar</p>
        <h1>Menos scroll. Más play.</h1>
        <p className="sub">Encontrá qué mirar en segundos</p>

        <div className="finder">
          <div className="finder-head">
            <span className="finder-spark">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.9 5.6L19.5 9l-4.4 3.3L16.4 18 12 14.7 7.6 18l1.3-5.7L4.5 9l5.6-1.4z" /></svg>
            </span>
            ¿Qué te inspira hoy?
          </div>
          {chipGroup("Categorías", ANIMO)}
          {chipGroup("Temáticas", TEMATICA)}
        </div>
      </div>
      <div className="wrap">
        <div className="shelf">
          <div className="shelf-head">
            <div className="shelf-title">
              <h2>{sectionTitle}</h2>
              {filtered && (
                <button className="reset-btn" onClick={reset}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
                  Restablecer
                </button>
              )}
            </div>
            <button className="reshuffle" onClick={() => setOffset((o) => o + 1)}>
              <svg viewBox="0 0 24 24" fill="none"><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></svg>
              Otras
            </button>
          </div>
          <div className="track" ref={track}>
            {/* Skeletons y no un "Cargando…": el texto suelto medía 141px y el
                riel con las 6 cards mide 407px, así que al llegar el payload
                todo el Home bajaba 266px de una. Son 6 porque 6 son los picks. */}
            {loading ? Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)
              : picks.length ? picks.map((t) => <TitleCard key={`${t.type}-${t.id}`} t={t} />)
              : <p className="empty-note">{textoVacio()}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
