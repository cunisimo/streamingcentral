"use client";
import { useState, useRef } from "react";
import { useApi } from "./useApi";
import { usePlatforms } from "./PlatformsContext";
import TitleCard from "./TitleCard";
import type { UITitle } from "@/lib/types";
import { categoryLabel } from "@/lib/categories";

// "Recomendador": no hay IA real. Los chips y las palabras que escribe el
// usuario se mapean a las categorías existentes (slugs de lib/categories.ts)
// y ese género alimenta el pool de "X para hoy".
type Mood = { slug: string; label: string; emoji: string; hint: string };
const MOODS: Mood[] = [
  { slug: "accion",    label: "Palomitas",         emoji: "🍿", hint: "acción, entretenida, para pasar el rato" },
  { slug: "drama",     label: "Drama intenso",      emoji: "😭", hint: "drama, emotivo, historias profundas" },
  { slug: "misterio",  label: "Misterio intrincado",emoji: "🔍", hint: "misterio, intriga, giros inesperados" },
  { slug: "comedia",   label: "Para reír",          emoji: "😂", hint: "comedia inteligente, humor, situaciones divertidas" },
  { slug: "terror",    label: "Terror siniestro",   emoji: "👻", hint: "terror, sustos, atmósfera oscura" },
  { slug: "scifi",     label: "Sci-fi épico",       emoji: "🛸", hint: "ciencia ficción, futuro, espacio" },
  { slug: "aventura",  label: "Aventura familiar",  emoji: "🐯", hint: "aventura, épica, para toda la familia" },
];

// Diccionario palabra clave -> slug de categoría. El texto libre se escanea
// contra esto y gana el slug con más coincidencias.
const KEYWORDS: Record<string, string[]> = {
  accion:     ["accion", "acción", "pelea", "peleas", "explosion", "explosiones", "adrenalina", "tiros", "entretenida", "palomitas"],
  drama:      ["drama", "dramatico", "dramático", "emotivo", "emocion", "emoción", "llorar", "profundo", "profundas", "intenso", "intensa"],
  comedia:    ["comedia", "reir", "reír", "risa", "risas", "humor", "gracioso", "graciosa", "divertido", "divertida", "divertidas", "comico", "cómico"],
  terror:     ["terror", "miedo", "susto", "sustos", "horror", "siniestro", "escalofriante", "oscuro", "oscura", "fantasma", "fantasmas"],
  scifi:      ["ciencia", "ficcion", "ficción", "scifi", "sci-fi", "futuro", "futurista", "espacio", "espacial", "robots", "alienigenas", "alienígenas", "epico", "épico"],
  suspenso:   ["suspenso", "tension", "tensión", "thriller"],
  crimen:     ["crimen", "policial", "mafia", "asesino", "detective", "narcos", "narco"],
  aventura:   ["aventura", "aventuras", "viaje", "familiar", "familia", "epopeya"],
  animacion:  ["animacion", "animación", "animada", "animado", "dibujos", "dibujitos"],
  misterio:   ["misterio", "intriga", "enigma", "giros", "intrincado", "intrincada"],
  documental: ["documental", "documentales", "real", "reales", "historia real"],
  romance:    ["romance", "amor", "romantico", "romántico", "romantica", "romántica", "pareja", "enamorados"],
};

function resolveQuery(text: string): { slug: string; label: string } | null {
  const t = text.toLowerCase();
  if (!t.trim()) return null;
  let best: string | null = null;
  let bestHits = 0;
  for (const [slug, words] of Object.entries(KEYWORDS)) {
    const hits = words.reduce((n, w) => (t.includes(w) ? n + 1 : n), 0);
    if (hits > bestHits) { bestHits = hits; best = slug; }
  }
  return best ? { slug: best, label: categoryLabel(best) } : null;
}

export default function IndecisoHero() {
  const { platforms } = usePlatforms();
  const [offset, setOffset] = useState(0);
  const [genre, setGenre] = useState("todos");
  const [activeMood, setActiveMood] = useState<Mood | null>(null);
  const [sectionTitle, setSectionTitle] = useState("6 para hoy");
  const [query, setQuery] = useState("");
  const track = useRef<HTMLDivElement>(null);
  const { data, loading } = useApi<{ items: UITitle[] }>(
    () => `/api/recomendaciones?tipo=all&genre=${genre}&offset=${offset}&providers=${platforms.join(",")}`,
    [offset, genre],
  );
  const picks = data?.items ?? [];
  const filtered = genre !== "todos";

  function reset() {
    setActiveMood(null);
    setSectionTitle("6 para hoy");
    setQuery("");
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
    setQuery(m.hint);
    setGenre(m.slug);
    setOffset(0);
  }

  function runSearch() {
    const hit = resolveQuery(query);
    if (hit) {
      const m = MOODS.find((x) => x.slug === hit.slug) ?? null;
      setActiveMood(m);
      setSectionTitle(`Resultados: ${m ? `${m.label} ${m.emoji}` : hit.label}`);
      setGenre(hit.slug);
    } else {
      setActiveMood(null);
      setSectionTitle("6 para hoy");
      setGenre("todos");
    }
    setOffset(0);
  }

  return (
    <section className="hero">
      <div className="wrap">
        <p className="kicker">No sabés qué ver</p>
        <h1>¿Qué tenés ganas de ver hoy?</h1>
        <p className="sub">Menos scroll. Más play.</p>

        <div className="finder">
          <div className="finder-head">
            <span className="finder-spark">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.9 5.6L19.5 9l-4.4 3.3L16.4 18 12 14.7 7.6 18l1.3-5.7L4.5 9l5.6-1.4z" /></svg>
            </span>
            ¿Cómo te sentís hoy? · Recomendador
          </div>
          <div className="chip-slider">
            {MOODS.map((m) => (
              <button
                key={m.slug}
                className={`chip ${activeMood?.slug === m.slug ? "active" : ""}`}
                onClick={() => pickMood(m)}
              >
                {m.label} {m.emoji}
              </button>
            ))}
          </div>
          <div className="finder-box">
            <span className="finder-spark sm">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.9 5.6L19.5 9l-4.4 3.3L16.4 18 12 14.7 7.6 18l1.3-5.7L4.5 9l5.6-1.4z" /></svg>
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
              placeholder="Describí lo que buscás: humor, misterio, sustos…"
            />
            <button className="finder-go" onClick={runSearch}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
              Buscar
            </button>
          </div>
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
