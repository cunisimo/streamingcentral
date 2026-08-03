# Recomendador "¿Qué te inspira hoy?" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar el bloque recomendador del Home: título "¿Qué te inspira hoy?", sin buscador de texto, y 16 chips agrupados en "Estados de ánimo" (7) y "Temáticas" (9), cada uno mapeado a géneros/keywords de TMDB.

**Architecture:** El mecanismo no cambia (un chip setea `genre=<slug>` → `/api/recomendaciones` → `recommendations` → `listByCategory` → `discover`). Se agregan 10 categorías nuevas (aditivas) a `lib/categories.ts` y se reescribe `components/IndecisoHero.tsx` con la lista de chips en dos grupos, más CSS para la etiqueta de grupo.

**Tech Stack:** Next.js 14 App Router, TypeScript, React client component, CSS plano en `app/globals.css`.

## Global Constraints

- **No hay test runner** (por diseño). Verificación por tarea: `npx tsc --noEmit` (0 errores) + chequeo visual/funcional donde se indique. No se escriben tests unitarios.
- UI en **español rioplatense**. **Sin CSS-in-JS**: estilos en `app/globals.css`, reusando clases existentes (`.chip-slider`, `.chip`).
- **Región AR + flatrate fijas** (fuera de alcance).
- **No tocar** `components/data.ts` (`GENRES`/`SHELVES`/páginas de género). Las categorías nuevas son solo del recomendador.
- **IDs de keyword confirmados contra TMDB** (usar exactamente estos): christmas `207317`; alien `9951`, alien invasion `14909`, extraterrestrial `9739`; space `9882`, space travel `3801`, spacecraft `1612`; survival `10349`, disaster `10617`, natural disaster `5096`.
- **Género y keyword se combinan con AND en `discover`** → ningún chip mezcla ambos en una regla.
- Windows/PowerShell: no `rm -rf`. Commits en español, imperativo, con `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Rama de trabajo ya creada: `feat/recomendador-inspira`.

## File Structure

- **Modify** `lib/categories.ts` — agregar 10 entradas nuevas al array `CATEGORIES`.
- **Modify** `components/IndecisoHero.tsx` — reescritura: nueva lista de 16 chips con campo `group`, render en dos grupos, título nuevo, eliminación del buscador de texto y su código muerto.
- **Modify** `app/globals.css` — clase `.chip-group-label` (+ ajuste de spacing) y eliminación del CSS muerto del buscador.

---

### Task 1: Categorías nuevas en `lib/categories.ts`

**Files:**
- Modify: `lib/categories.ts` (array `CATEGORIES`, líneas 16-29)

**Interfaces:**
- Consumes: el tipo `Category` y `Rule` ya definidos en el archivo (`{ genres?: number[]; keywords?: number[]; originCountry?: string }` por movie/tv).
- Produces: 10 slugs nuevos resolubles por `resolveCategory(slug, type)`: `palomitas`, `misterio-intrincado`, `familiar`, `navidad`, `guerra`, `aliens`, `espacio`, `reales`, `fantasia`, `supervivencia`. (Los slugs `drama`, `comedia`, `terror`, `scifi`, `romance`, `crimen` ya existen y se reusan.)

- [ ] **Step 1: Agregar las 10 categorías**

En `lib/categories.ts`, reemplazar exactamente estas dos líneas (la entrada `romance` y el cierre del array):

```ts
  { slug: "romance",     label: "Romance",     movie: { genres: [10749] },tv: { genres: [18] } },
];
```

por:

```ts
  { slug: "romance",     label: "Romance",     movie: { genres: [10749] },tv: { genres: [18] } },
  // --- Categorías del recomendador "¿Qué te inspira hoy?" (aditivas) ---
  { slug: "palomitas",           label: "Palomitas",             movie: { genres: [28, 12] },        tv: { genres: [10759] } },
  { slug: "misterio-intrincado", label: "Misterio intrincado",   movie: { genres: [9648, 53] },      tv: { genres: [9648] } },
  { slug: "familiar",            label: "Aventura familiar",     movie: { genres: [10751, 12, 16] }, tv: { genres: [10751, 10762, 16] } },
  { slug: "navidad",             label: "Magia navideña",        movie: { keywords: [207317] },      tv: { keywords: [207317] } },
  { slug: "guerra",              label: "Fuego cruzado",         movie: { genres: [10752] },         tv: { genres: [10768] } },
  { slug: "aliens",              label: "Contacto extraterrestre", movie: { keywords: [9951, 14909, 9739] }, tv: { keywords: [9951, 14909, 9739] } },
  { slug: "espacio",             label: "Odisea espacial",       movie: { keywords: [9882, 3801, 1612] }, tv: { keywords: [9882, 3801, 1612] } },
  { slug: "reales",              label: "Historias reales",      movie: { genres: [99] },             tv: { genres: [99] } },
  { slug: "fantasia",            label: "Mundos fantásticos",    movie: { genres: [14] },             tv: { genres: [10765] } },
  { slug: "supervivencia",       label: "Supervivencia extrema", movie: { keywords: [10349, 10617, 5096] }, tv: { keywords: [10349, 10617, 5096] } },
];
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add lib/categories.ts
git commit -m "feat(recomendador): 10 categorías nuevas para los chips del recomendador"
```

---

### Task 2: Reescribir `IndecisoHero` + CSS

**Files:**
- Modify: `components/IndecisoHero.tsx` (reescritura completa)
- Modify: `app/globals.css` (agregar `.chip-group-label`; quitar CSS muerto del buscador)

**Interfaces:**
- Consumes: los slugs de Task 1 (via `genre=<slug>` a `/api/recomendaciones`); `useApi`, `usePlatforms`, `TitleCard` (sin cambios).
- Produces: el bloque recomendador rediseñado. No exporta nada nuevo.

- [ ] **Step 1: Reescribir `components/IndecisoHero.tsx`**

Reemplazar TODO el contenido de `components/IndecisoHero.tsx` por:

```tsx
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

export default function IndecisoHero() {
  const { platforms } = usePlatforms();
  const [offset, setOffset] = useState(0);
  const [genre, setGenre] = useState("todos");
  const [activeMood, setActiveMood] = useState<Mood | null>(null);
  const [sectionTitle, setSectionTitle] = useState("6 para hoy");
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
```

- [ ] **Step 2: Agregar el CSS del grupo**

En `app/globals.css`, reemplazar exactamente esta línea (137):

```css
.finder .chip-slider{margin:12px 0 4px}
```

por:

```css
.finder .chip-slider{margin:12px 0 4px}
.chip-group-label{display:block;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);margin:14px 0 2px 2px}
.finder .chip-group .chip-slider{margin:6px 0 2px}
```

- [ ] **Step 3: Quitar el CSS muerto del buscador**

En `app/globals.css`, eliminar la línea 136 (variante `sm` del spark, ya sin uso):

```css
.finder-spark.sm svg{width:15px;height:15px}
```

Y eliminar el bloque del buscador de texto (líneas 138-142):

```css
.finder-box{display:flex;align-items:center;gap:10px;margin-top:12px;background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--radius-sm);padding:0 10px 0 12px;height:52px}
.finder-box input{flex:1;min-width:0;border:0;background:transparent;color:var(--text);font-family:var(--body);font-size:15px;outline:none}
.finder-box input::placeholder{color:var(--faint)}
.finder-go{display:inline-flex;align-items:center;gap:7px;height:40px;padding:0 18px;border-radius:var(--radius-sm);border:0;background:var(--accent);color:#fff;font-family:var(--body);font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap}
.finder-go:hover{filter:brightness(1.05)}.finder-go svg{width:15px;height:15px}
```

(Quedan sin uso porque el componente ya no renderiza `.finder-box`/`.finder-go`/`.finder-spark.sm`.)

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 5: Verificación visual/funcional**

Levantar el dev server:

```bash
npm run dev
```

En el Home confirmar:
- El título del bloque dice **"¿Qué te inspira hoy?"** y **no** hay input de texto ni botón "Buscar".
- Hay dos grupos etiquetados: **Estados de ánimo** (7 chips) y **Temáticas** (9 chips), con los emojis correctos. "A fuego lento" 💖 (no "Amor a fuego lento").
- Click en varios chips carga contenido acorde, incluidos al menos dos por keyword: **🎄 Magia navideña**, **👽 Contacto extraterrestre**, **🌌 Odisea espacial**, **🏔️ Supervivencia extrema** (si un tema no tiene resultados en las plataformas activas, muestra el empty-note; probar con varias plataformas activas).
- "Mostrame otras" (offset), "Restablecer" y el estado activo del chip siguen funcionando.

- [ ] **Step 6: Commit**

```bash
git add components/IndecisoHero.tsx app/globals.css
git commit -m "feat(recomendador): título ¿Qué te inspira hoy?, 16 chips en 2 grupos, sin buscador"
```

---

## Self-Review (hecho al escribir el plan)

- **Cobertura del spec:** título nuevo (Task 2), quitar buscador + código muerto (Task 2), 16 chips en 2 grupos (Task 2), "A fuego lento" 💖 (Task 2), familiar con animación `[...,16]` (Task 1), 10 categorías con IDs confirmados (Task 1), "Historias reales" solo género 99 (Task 1), tipo=all (Task 2), CSS `.chip-group-label` sin CSS-in-JS (Task 2). ✔
- **Sin placeholders:** todo el código está completo; los IDs de keyword son los confirmados contra TMDB. ✔
- **Consistencia de slugs:** los slugs de los chips en `MOODS` (Task 2) coinciden con los definidos/reusados en `CATEGORIES` (Task 1): `palomitas`, `drama`, `misterio-intrincado`, `comedia`, `terror`, `scifi`, `familiar`, `romance`, `navidad`, `guerra`, `aliens`, `espacio`, `reales`, `fantasia`, `crimen`, `supervivencia`. ✔
- **Limitación género+keyword AND:** ninguna categoría nueva mezcla `genres` y `keywords` en la misma regla. ✔
