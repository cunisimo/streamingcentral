"use client";
import { useState, useRef } from "react";
import { useApi } from "./useApi";
import { usePlatforms } from "./PlatformsContext";
import TitleCard from "./TitleCard";
import type { UITitle } from "@/lib/types";

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
  { slug: "romance",             label: "A fuego lento",         emoji: "💖", group: "tematica" },
  { slug: "navidad",             label: "Magia navideña",        emoji: "🎄", group: "tematica" },
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

export default function IndecisoHero({ initialItems }: { initialItems?: UITitle[] }) {
  const { platforms } = usePlatforms();
  const [offset, setOffset] = useState(0);
  const [genre, setGenre] = useState("todos");
  const [activeMood, setActiveMood] = useState<Mood | null>(null);
  const [sectionTitle, setSectionTitle] = useState("6 para hoy");
  const track = useRef<HTMLDivElement>(null);

  // El estado base ("6 para hoy", sin chip, offset 0) viene del composer, que ya
  // reservó esos títulos para que no se repitan abajo. Al tocar un chip o
  // "Mostrame otras" se vuelve a /api/recomendaciones: es exploración puntual y
  // NO rearma el Home.
  const esBase = genre === "todos" && offset === 0;
  const { data, loading: fetchLoading } = useApi<{ items: UITitle[] }>(
    () => (esBase && initialItems?.length
      ? ""
      : `/api/recomendaciones?tipo=all&genre=${genre}&offset=${offset}&providers=${platforms.join(",")}`),
    [offset, genre, !!initialItems?.length],
  );
  const loading = esBase && initialItems?.length ? false : fetchLoading;
  const picks = esBase && initialItems?.length ? initialItems : (data?.items ?? []);
  const filtered = genre !== "todos";

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
          {chipGroup("Estados de ánimo", ANIMO)}
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
              Mostrame otras
            </button>
          </div>
          <div className="track" ref={track}>
            {loading ? <span className="loading">Cargando…</span>
              : picks.length ? picks.map((t) => <TitleCard key={`${t.type}-${t.id}`} t={t} />)
              : <p className="empty-note">Nada en tus plataformas. Activá alguna en el botón de arriba.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
