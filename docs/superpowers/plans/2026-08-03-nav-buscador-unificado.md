# Nav + buscador unificado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reordenar la navegación (nav inferior sin Pelis/Series + Buscador; nav superior con banderita AR) y unificar todo el browse en `/buscar`, eliminando `/peliculas` y `/series`.

**Architecture:** Cambios acotados por componente: `BottomNav`, `TopBar`, `SearchView` (+ `genreCovers` en `lib/enrich.ts` para los covers), y borrado de rutas/`CatalogView`/`FilterGrid`/`CountryGrid`. No se toca el pipeline de datos ni la búsqueda por texto.

**Tech Stack:** Next.js 14 App Router, TypeScript, React client components, CSS plano en `app/globals.css`.

## Global Constraints

- **No hay test runner** (por diseño). Verificación por tarea: `npx tsc --noEmit` (0 errores) + chequeo visual/funcional donde se indique.
- UI en **español rioplatense**. **Sin CSS-in-JS**: estilos en `app/globals.css`, reusando clases existentes.
- **Región AR fija** (la banderita es estática, NO selector — no arrancar Fase 2 multi-región).
- Commits en español, imperativo, con `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Rama de trabajo ya creada: `feat/nav-buscador-unificado`.

## File Structure

- **Modify** `components/BottomNav.tsx` — ítems: Inicio, Buscador, Mi lista, Mi cuenta.
- **Modify** `components/TopBar.tsx` + `app/globals.css` — banderita 🇦🇷 en vez de la lupa.
- **Modify** `lib/enrich.ts` — `genreCovers` con dedupe de pósters + cache v2.
- **Modify** `components/SearchView.tsx` + `app/globals.css` — título, chip Directores, tiles → `/categoria/[slug]` con lavado de color.
- **Delete** `app/peliculas/page.tsx`, `app/series/page.tsx`, `components/FilterGrid.tsx`, `components/CountryGrid.tsx`; **Modify** `components/CatalogView.tsx` (solo Home) y `app/page.tsx`.

---

### Task 1: Nav inferior (`BottomNav`)

**Files:**
- Modify: `components/BottomNav.tsx` (reescritura del array `ITEMS` y el label de cuenta)

**Interfaces:**
- Produces: nav inferior con `Inicio`, `Buscador` (`/buscar`), `Mi lista` (`/cuenta/lista`), `Mi cuenta` (`/cuenta`).

- [ ] **Step 1: Editar el array `ITEMS`**

En `components/BottomNav.tsx`, reemplazar el array `ITEMS` (líneas 7-12):

```tsx
const ITEMS = [
  { href: "/", label: "Inicio", match: (p: string) => p === "/", icon: <path d="M3 10l9-7 9 7v9a2 2 0 0 1-2 2h-4v-6h-6v6H5a2 2 0 0 1-2-2z" /> },
  { href: "/series", label: "Series", match: (p: string) => p.startsWith("/series"), icon: <><rect x="3" y="5" width="18" height="13" rx="2" /><path d="M9 21h6" /></> },
  { href: "/peliculas", label: "Películas", match: (p: string) => p.startsWith("/peliculas"), icon: <><path d="M3 8h18v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M3 8l2.5-4h3L6 8M9.5 8L12 4h3l-2.5 4M15.5 8L18 4h3" /></> },
  { href: "/cuenta/lista", label: "Mi lista", match: (p: string) => p.startsWith("/cuenta/lista"), icon: <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /> },
];
```

por:

```tsx
const ITEMS = [
  { href: "/", label: "Inicio", match: (p: string) => p === "/", icon: <path d="M3 10l9-7 9 7v9a2 2 0 0 1-2 2h-4v-6h-6v6H5a2 2 0 0 1-2-2z" /> },
  { href: "/buscar", label: "Buscador", match: (p: string) => p.startsWith("/buscar"), icon: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></> },
  { href: "/cuenta/lista", label: "Mi lista", match: (p: string) => p.startsWith("/cuenta/lista"), icon: <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /> },
];
```

- [ ] **Step 2: Renombrar Cuenta → Mi cuenta**

En el mismo archivo, en el `<Link href="/cuenta" ...>`, reemplazar el texto `Cuenta` (la línea que dice solo `        Cuenta`, dentro de ese Link, ~línea 37) por `        Mi cuenta`.

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add components/BottomNav.tsx
git commit -m "feat(nav): nav inferior Inicio/Buscador/Mi lista/Mi cuenta (sin Pelis/Series)"
```

---

### Task 2: Nav superior (`TopBar`) — banderita AR

**Files:**
- Modify: `components/TopBar.tsx` (reemplazar el Link de búsqueda por la banderita)
- Modify: `app/globals.css` (clase `.regionflag`)

- [ ] **Step 1: Reemplazar la lupa por la banderita**

En `components/TopBar.tsx`, reemplazar el bloque del Link de búsqueda (líneas 52-56):

```tsx
        <Link href="/buscar" className="acct-link" aria-label="Buscar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
          </svg>
        </Link>
```

por:

```tsx
        <span className="regionflag" role="img" aria-label="Región: Argentina" title="Argentina">🇦🇷</span>
```

(El import de `Link` se mantiene: se sigue usando en `<Link href="/" className="brand">`.)

- [ ] **Step 2: Agregar el CSS de la banderita**

En `app/globals.css`, después de la línea `.acct-link svg{width:24px;height:24px}` (~línea 94), agregar:

```css
.regionflag{font-size:22px;line-height:1;user-select:none}
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add components/TopBar.tsx app/globals.css
git commit -m "feat(nav): banderita AR en el nav superior (reemplaza la lupa)"
```

---

### Task 3: `genreCovers` sin imágenes repetidas

**Files:**
- Modify: `lib/enrich.ts` (función `genreCovers`, líneas 219-234)

**Interfaces:**
- Consumes: `CATEGORIES`, `resolveCategory`, `discover`, `img`, `cached`, `TTL` (ya importados en el archivo).
- Produces: `genreCovers(): Promise<Record<string, string | null>>` — un póster distinto por género (dedupe), cacheado bajo `"genre:covers:v2"`.

- [ ] **Step 1: Reescribir `genreCovers`**

En `lib/enrich.ts`, reemplazar la función `genreCovers` completa (líneas 219-234):

```ts
export async function genreCovers(): Promise<Record<string, string | null>> {
  return cached("genre:covers:v1", TTL.catalog, async () => {
    const slugs = CATEGORIES.map((c) => c.slug);
    const entries = await Promise.all(slugs.map(async (slug) => {
      const rule = resolveCategory(slug, "movie");
      try {
        const res = await discover("movie", { genres: rule.genres, keywords: rule.keywords, minVotes: 300 });
        const withPoster = res.results.find((t) => t.poster_path);
        return [slug, img(withPoster?.poster_path ?? null, "w342")] as const;
      } catch {
        return [slug, null] as const;
      }
    }));
    return Object.fromEntries(entries);
  });
}
```

por:

```ts
export async function genreCovers(): Promise<Record<string, string | null>> {
  return cached("genre:covers:v2", TTL.catalog, async () => {
    const slugs = CATEGORIES.map((c) => c.slug);
    // 1) Candidatos (posters) por género, en paralelo.
    const candidates = await Promise.all(slugs.map(async (slug) => {
      const rule = resolveCategory(slug, "movie");
      try {
        const res = await discover("movie", { genres: rule.genres, keywords: rule.keywords, minVotes: 300 });
        const posters = res.results.map((t) => t.poster_path).filter((p): p is string => !!p);
        return [slug, posters] as const;
      } catch {
        return [slug, [] as string[]] as const;
      }
    }));
    // 2) Asignación secuencial: cada género toma el primer poster no usado por
    //    otro (evita imágenes repetidas entre tiles). Fallback: su primer poster.
    const used = new Set<string>();
    const entries = candidates.map(([slug, posters]) => {
      const pick = posters.find((p) => !used.has(p)) ?? posters[0] ?? null;
      if (pick) used.add(pick);
      return [slug, img(pick, "w342")] as const;
    });
    return Object.fromEntries(entries);
  });
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add lib/enrich.ts
git commit -m "fix(buscar): un póster distinto por género en Explorar todo (dedupe + cache v2)"
```

---

### Task 4: Buscador unificado (`SearchView`)

**Files:**
- Modify: `components/SearchView.tsx` (título, chip Directores + `BrowseDirectors`, tiles → `/categoria/[slug]` con lavado de color, `ExploreList` solo país)
- Modify: `app/globals.css` (`.explore-tile` como `<Link>`: `text-decoration:none`)

**Interfaces:**
- Consumes: `PersonCard`, `UIPerson` (ya importados), `/api/directores` que devuelve `{ people: UIPerson[] }`, `GENRE_COLOR`/`GENRES` (ya importados), `/categoria/[slug]` (ruta existente).

- [ ] **Step 1: Importar `Link`**

En `components/SearchView.tsx`, reemplazar la primera línea de imports:

```tsx
import { useState, useEffect, useRef, useCallback } from "react";
```

por:

```tsx
import Link from "next/link";
import { useState, useEffect, useRef, useCallback } from "react";
```

- [ ] **Step 2: Ampliar el tipo `Filter`**

Reemplazar:

```tsx
type Filter = "todo" | "movie" | "tv" | "actores";
```

por:

```tsx
type Filter = "todo" | "movie" | "tv" | "actores" | "directores";
```

- [ ] **Step 3: Simplificar el estado `explore` a solo país**

Reemplazar:

```tsx
  const [explore, setExplore] = useState<{ slug?: string; country?: string } | null>(null);
```

por:

```tsx
  const [explore, setExplore] = useState<{ country: string } | null>(null);
```

- [ ] **Step 4: Cambiar el título**

Reemplazar:

```tsx
      <h1 className="buscar-title">Buscar</h1>
```

por:

```tsx
      <h1 className="buscar-title">¿Qué vemos hoy?</h1>
```

- [ ] **Step 5: Agregar la pastilla Directores**

Reemplazar el bloque de chips:

```tsx
        {(["todo", "movie", "tv", "actores"] as Filter[]).map((f) => (
          <button key={f} className={`bchip ${filter === f ? "on" : ""}`} onClick={() => { setFilter(f); setExplore(null); }}>
            {f === "todo" ? "Todo" : f === "movie" ? "Películas" : f === "tv" ? "Series" : "Actores"}
          </button>
        ))}
```

por:

```tsx
        {(["todo", "movie", "tv", "actores", "directores"] as Filter[]).map((f) => (
          <button key={f} className={`bchip ${filter === f ? "on" : ""}`} onClick={() => { setFilter(f); setExplore(null); }}>
            {f === "todo" ? "Todo" : f === "movie" ? "Películas" : f === "tv" ? "Series" : f === "actores" ? "Actores" : "Directores"}
          </button>
        ))}
```

- [ ] **Step 6: Tiles de género → `<Link>` a `/categoria/[slug]` con lavado de color**

Reemplazar el `.map` de los tiles:

```tsx
            {GENRES.filter((g) => g[0] !== "todos").map(([s, l]) => {
              const cover = covers[s];
              const style = cover
                ? { backgroundImage: `linear-gradient(180deg, rgba(0,0,0,.15), rgba(0,0,0,.55)), url(${cover})` }
                : { background: GENRE_COLOR[s] };
              return (
                <button key={s} className="explore-tile" style={style} onClick={() => setExplore({ slug: s })}><span>{l}</span></button>
              );
            })}
```

por:

```tsx
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
```

- [ ] **Step 7: Renderizar `BrowseDirectors` cuando el chip es Directores**

Reemplazar:

```tsx
      {!hasQuery && filter === "actores" && <BrowseActors />}
```

por:

```tsx
      {!hasQuery && filter === "actores" && <BrowseActors />}

      {!hasQuery && filter === "directores" && <BrowseDirectors />}
```

- [ ] **Step 8: Agregar el componente `BrowseDirectors`**

Insertar, justo ANTES de la línea `function ExploreList({ explore, onBack }...`, este componente nuevo:

```tsx
// --- Directores curados (lista fija de /api/directores, sin paginación) ---
function BrowseDirectors() {
  const [people, setPeople] = useState<UIPerson[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/directores").then((r) => r.json()).then((j) => {
      setPeople(j.people ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);
  return (
    <>
      <h2 className="bres-h">Directores</h2>
      {loading ? <p className="loading">Cargando…</p>
        : <div className="people-grid">{people.map((p) => <PersonCard key={p.id} p={p} />)}</div>}
    </>
  );
}

```

- [ ] **Step 9: Simplificar `ExploreList` a solo país**

Reemplazar la función `ExploreList` completa:

```tsx
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
```

por:

```tsx
function ExploreList({ explore, onBack }: { explore: { country: string }; onBack: () => void }) {
  const { platforms } = usePlatforms();
  const [items, setItems] = useState<UITitle[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const url = `/api/discover?tipo=movie&country=${explore.country}&providers=${platforms.join(",")}`;
    setLoading(true);
    fetch(url).then((r) => r.json()).then((j) => { setItems(j.items ?? []); setLoading(false); }).catch(() => setLoading(false));
  }, [explore, platforms]);
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
```

- [ ] **Step 10: CSS — `.explore-tile` como enlace**

En `app/globals.css`, en la regla `.explore-tile{...}` (~línea 216), agregar `text-decoration:none` al final (antes del `}`). Reemplazar el final de esa regla:

```css
background-size:cover;background-position:center;border:none;text-align:left}
```

por:

```css
background-size:cover;background-position:center;border:none;text-align:left;text-decoration:none}
```

- [ ] **Step 11: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 12: Commit**

```bash
git add components/SearchView.tsx app/globals.css
git commit -m "feat(buscar): título ¿Qué vemos hoy?, chip Directores, tiles → /categoria con lavado de color"
```

---

### Task 5: Eliminar `/peliculas` y `/series` + limpieza

**Files:**
- Delete: `app/peliculas/page.tsx`, `app/series/page.tsx`, `components/FilterGrid.tsx`, `components/CountryGrid.tsx`
- Modify: `components/CatalogView.tsx` (solo Home), `app/page.tsx`

**Interfaces:**
- Consumes: `IndecisoHero`, `DesempateBanner`, `UpcomingSection`, `Shelf`, `PersonRail`, `OfflineState`, `useOnline`, `SHELVES` (sin cambios de firma).
- Produces: `CatalogView` sin props (`export default function CatalogView()`).

- [ ] **Step 1: Borrar rutas y componentes huérfanos**

```bash
git rm app/peliculas/page.tsx app/series/page.tsx components/FilterGrid.tsx components/CountryGrid.tsx
```

- [ ] **Step 2: Simplificar `CatalogView` a solo Home**

Reemplazar TODO el contenido de `components/CatalogView.tsx` por:

```tsx
"use client";
import { useState, useCallback } from "react";
import Shelf from "./Shelf";
import IndecisoHero from "./IndecisoHero";
import DesempateBanner from "./desempate/DesempateBanner";
import PersonRail from "./PersonRail";
import UpcomingSection from "./upcoming/UpcomingSection";
import OfflineState from "./pwa/OfflineState";
import { useOnline } from "@/hooks/useOnline";
import { SHELVES } from "./data";

export default function CatalogView() {
  const online = useOnline();
  const [fetchFailed, setFetchFailed] = useState(false);
  const reportOffline = useCallback(() => setFetchFailed(true), []);

  // Sin conexión, cada Shelf se auto-oculta; acá mostramos un único estado
  // offline. Dos señales: navigator.onLine (modo avión) y el fallo real del
  // primer riel (cubre "hay red pero el server no responde").
  const sinDatos = !online || fetchFailed;
  if (sinDatos) return <div className="wrap"><OfflineState onRetry={() => location.reload()} /></div>;

  return (
    <>
      <IndecisoHero />
      <div className="wrap">
        <DesempateBanner />
        <UpcomingSection />
        <Shelf title="Últimos lanzamientos" url="/api/latest" seeAllHref="/lista/ultimos" onOffline={reportOffline} />
        <Shelf title="Lo más votados" url="/api/mas-votados" seeAllHref="/lista/mas-votados" typeToggle="filter" shelfKey="mas-votados" initialType="movie" />
        <Shelf title="Hacete cargo" url="/api/hacete-cargo" seeAllHref="/lista/hacete-cargo" typeToggle="filter" shelfKey="hacete-cargo" initialType="movie" />
        {SHELVES.map((g, i) => (
          <Shelf key={g} genre={g} typeToggle="refetch" shelfKey={g} initialType={i % 2 === 0 ? "movie" : "tv"} seeAllHref={`/categoria/${g}?tipo=${i % 2 === 0 ? "movie" : "tv"}`} />
        ))}
        <PersonRail title="Directores" endpoint="/api/directores" seeAllHref="/directores" seeAllLabel="Ver todo" />
      </div>
    </>
  );
}
```

- [ ] **Step 3: Actualizar `app/page.tsx`**

Reemplazar:

```tsx
  return (<><TopBar /><main><CatalogView mode="inicio" /></main><BottomNav /></>);
```

por:

```tsx
  return (<><TopBar /><main><CatalogView /></main><BottomNav /></>);
```

- [ ] **Step 4: Verificar tipos y que no queden imports colgados**

Run: `npx tsc --noEmit`
Expected: 0 errores.

Run: `grep -rn "FilterGrid\|CountryGrid\|CatalogView mode\|peliculas\|/series" --include=*.tsx --include=*.ts components app | grep -v "seeAllHref\|startsWith\|categoria"`
Expected: sin resultados (ninguna referencia a los archivos/rutas borrados; los `Shelf` del Home usan `/categoria`, no `/peliculas`).

- [ ] **Step 5: Verificación funcional**

```bash
npm run dev
```

Confirmar:
- `/peliculas` y `/series` → 404.
- Home (`/`) sigue renderizando igual (hero recomendador, rieles, toggle, directores).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(nav): eliminar /peliculas y /series; CatalogView solo Home; borrar FilterGrid/CountryGrid"
```

---

## Self-Review (hecho al escribir el plan)

- **Cobertura del spec:** A nav inferior (Task 1), B banderita (Task 2), C.4.2 dedupe covers (Task 3), C.1 título + C.2 Directores + C.4.1 tiles→categoría + C.4.3 lavado de color + C.3 país inline (Task 4), D borrar rutas + limpieza (Task 5). ✔
- **Sin placeholders:** código completo en cada step; opacidades del lavado fijadas (D9/F2). ✔
- **Consistencia:** `Filter` incluye "directores" (Step 2) y se usa en chips (Step 5) + render (Step 7) + componente (Step 8); `explore` pasa a `{country:string}` (Step 3) y `ExploreList` matchea (Step 9); `CatalogView()` sin props (Task 5 Step 2) matchea `app/page.tsx` (Step 3). ✔
- **`Filters.tsx` se mantiene** (lo usa `SearchView`→`BrowseTitles`); no se borra. ✔
- **`genreCovers` itera `CATEGORIES`** (12 base, sin las recommender) → coincide con los 12 slugs de `GENRES` que muestra el buscador. ✔
