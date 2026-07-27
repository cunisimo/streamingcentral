# "Ver todas" + páginas de categoría — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada slider del home suma una card "Ver todas" que lleva a una sección dedicada: los de género a una página rica con sub-sliders por cruce de género + filtro pelis/series; los especiales y directores a páginas simples de lista completa.

**Architecture:** Se extiende `/api/discover` con `genre2` para cruzar dos categorías (AND real de géneros). Una `CategoryView` compone `Shelf` existentes (uno "populares" + uno por cada cruce, auto-ocultando los vacíos). Páginas simples reusan el patrón de grilla. `Shelf`/`PersonRail` ganan una prop `seeAllHref` que renderiza la card final.

**Tech Stack:** Next.js 14 App Router, TypeScript, React (client components), CSS plano en `app/globals.css`.

## Global Constraints

- **No hay test runner** (por diseño). Cada task se valida con `npx tsc --noEmit` (0 errores) + chequeo visual en `npm run dev`. Copiado del CLAUDE.md.
- **Región AR + filtro por plataformas se mantienen:** todo pasa por `/api/discover` → `listByCategory`, que ya filtran. No se toca esa cadena salvo sumar `genre2`.
- **Cruce de géneros = AND.** `discover` une `with_genres` con `|` (OR); un cruce "Acción + Comedia" necesita coma (`with_genres=28,35`). Cuando ambas categorías aportan géneros, forzar el AND vía `extra.with_genres`. genre+keyword ya es AND natural (params separados). keyword+keyword se acepta OR (caso rarísimo).
- **Sin cambios de schema, ni modelo de votos, ni Service Worker** (las rutas nuevas son same-origin: el SW las trata como navegación, sin cambios).
- **CSS solo en `app/globals.css`, reusando clases. Texto UI en español rioplatense.**
- **Rama:** `feat/ver-todas-categorias` (creada, con el spec commiteado).

---

### Task 1: `genre2` en discover (capa de datos)

**Files:**
- Modify: `lib/enrich.ts` (`listByCategory`, ~líneas 56-71)
- Modify: `app/api/discover/route.ts` (leer `genre2`)

**Interfaces:**
- Produces: `listByCategory({ ..., genre2?: string })` — cruza dos categorías con AND de géneros. `/api/discover?...&genre2=<slug>`.

- [ ] **Step 1: Extender `listByCategory` en `lib/enrich.ts`**

Reemplazar la función `listByCategory` (líneas 56-71) por:
```ts
export async function listByCategory(opts: {
  tipo: MediaType; genre?: string; genre2?: string; country?: string;
  providers: PlatformCode[]; page?: number; sortBy?: string; minVotes?: number; extra?: Record<string, string>;
}): Promise<UITitle[]> {
  if (!opts.providers.length) return [];
  const ids = codesToTmdbIds(opts.providers);
  const rule = opts.genre && opts.genre !== "todos" ? resolveCategory(opts.genre, opts.tipo) : {};
  const rule2 = opts.genre2 && opts.genre2 !== "todos" ? resolveCategory(opts.genre2, opts.tipo) : {};

  let genres = [...(rule.genres ?? []), ...(rule2.genres ?? [])];
  const keywords = [...(rule.keywords ?? []), ...(rule2.keywords ?? [])];
  let extra = opts.extra;

  // Cruce donde AMBAS categorías aportan géneros: with_genres con AND (coma).
  // discover une genres con "|" (OR), así que forzamos el AND vía extra
  // (Object.assign(p, o.extra) en discover pisa el with_genres OR).
  if ((rule.genres?.length ?? 0) > 0 && (rule2.genres?.length ?? 0) > 0) {
    extra = { ...(opts.extra ?? {}), with_genres: genres.join(",") };
    genres = []; // que discover no arme el "|"
  }

  const res = await discover(opts.tipo, {
    providers: ids,
    genres: genres.length ? genres : undefined,
    keywords: keywords.length ? keywords : undefined,
    originCountry: opts.country || rule.originCountry,
    page: opts.page, sortBy: opts.sortBy, minVotes: opts.minVotes, extra,
  });
  const pub = await publishedIds(opts.tipo);
  const items = await Promise.all(res.results.slice(0, 20).map((t) => toUITitle(t, opts.tipo, pub)));
  return items.filter((i) => i.platforms.length > 0);
}
```
(Sin `genre2` el comportamiento es idéntico al actual: `rule2 = {}`, `genres = rule.genres`, `keywords = rule.keywords`, `extra = opts.extra`.)

- [ ] **Step 2: Leer `genre2` en `app/api/discover/route.ts`**

Después de la línea `const genre = sp.get("genre") || undefined;` (línea 22) agregar:
```ts
  const genre2 = sp.get("genre2") || undefined;
```
Y en la llamada a `listByCategory` (línea 37-40) agregar `genre2`:
```ts
    const items = await listByCategory({
      tipo, genre, genre2, country, providers, page,
      extra: Object.keys(extra).length ? extra : undefined,
    });
```

- [ ] **Step 3: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: PASS (0 errores).

- [ ] **Step 4: Verificación funcional (curl)**

Run (con el dev corriendo y providers de ejemplo):
`curl "http://localhost:3000/api/discover?tipo=movie&genre=accion&genre2=comedia&providers=n,d,m"`
Expected: JSON `{ items: [...] }`; los títulos son de acción **y** comedia (no la unión). Comparar contra `genre=accion` solo: el set con `genre2=comedia` es un subconjunto/distinto.

- [ ] **Step 5: Commit**

```bash
git add lib/enrich.ts app/api/discover/route.ts
git commit -m "feat(discover): param genre2 para cruzar dos categorías (AND de géneros)"
```

---

### Task 2: Página de categoría rica

**Files:**
- Create: `app/categoria/[slug]/page.tsx`
- Create: `components/CategoryView.tsx`
- Modify: `app/globals.css` (toggle pelis/series)

**Interfaces:**
- Consumes: `/api/discover?...&genre2=` (Task 1) — sólo vía URL, sin dependencia de tipos. `Shelf` (existente) con props `{ tipo, genre, title }` o `{ url, title }`.
- Produces: ruta `/categoria/[slug]`.

- [ ] **Step 1: Crear `app/categoria/[slug]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import CategoryView from "@/components/CategoryView";
import { CATEGORIES } from "@/lib/categories";
import type { MediaType } from "@/lib/types";

export default function CategoriaPage({
  params, searchParams,
}: {
  params: { slug: string };
  searchParams: { tipo?: string };
}) {
  const cat = CATEGORIES.find((c) => c.slug === params.slug);
  if (!cat) notFound();
  const tipo: MediaType = searchParams.tipo === "tv" ? "tv" : "movie";
  return (
    <>
      <TopBar />
      <main><CategoryView slug={cat.slug} label={cat.label} initialTipo={tipo} /></main>
      <BottomNav />
    </>
  );
}
```
(`notFound()` retorna `never`, así que TS estrecha `cat` a definido después del `if`.)

- [ ] **Step 2: Crear `components/CategoryView.tsx`**

```tsx
"use client";
import { useState, useCallback } from "react";
import Shelf from "./Shelf";
import OfflineState from "./pwa/OfflineState";
import { useOnline } from "@/hooks/useOnline";
import { CATEGORIES } from "@/lib/categories";
import type { MediaType } from "@/lib/types";

export default function CategoryView({
  slug, label, initialTipo,
}: {
  slug: string; label: string; initialTipo: MediaType;
}) {
  const [tipo, setTipo] = useState<MediaType>(initialTipo);
  const online = useOnline();
  const [fetchFailed, setFetchFailed] = useState(false);
  const reportOffline = useCallback(() => setFetchFailed(true), []);
  const sinDatos = !online || fetchFailed;

  // Cruces: el género principal × cada otra categoría (salvo el propio y documental).
  const crosses = CATEGORIES.filter((c) => c.slug !== slug && c.slug !== "documental");

  return (
    <div className="wrap">
      <div className="compact-head">
        <h1>{label}</h1>
        <p className="sub">Explorá {label.toLowerCase()} en tus plataformas</p>
      </div>
      <div className="tipo-toggle" role="tablist">
        <button role="tab" aria-selected={tipo === "movie"} className={`tt ${tipo === "movie" ? "on" : ""}`} onClick={() => setTipo("movie")}>Películas</button>
        <button role="tab" aria-selected={tipo === "tv"} className={`tt ${tipo === "tv" ? "on" : ""}`} onClick={() => setTipo("tv")}>Series</button>
      </div>
      {sinDatos ? (
        <OfflineState onRetry={() => location.reload()} />
      ) : (
        <>
          <Shelf key={`pop-${tipo}`} tipo={tipo} genre={slug} title={`Populares en ${label}`} onOffline={reportOffline} />
          {crosses.map((c) => (
            <Shelf
              key={`${tipo}-${slug}-${c.slug}`}
              title={`${label} + ${c.label}`}
              url={`/api/discover?tipo=${tipo}&genre=${slug}&genre2=${c.slug}`}
            />
          ))}
        </>
      )}
    </div>
  );
}
```
(Cada `Shelf` ya se auto-oculta con < 2 títulos, así que los cruces sin catálogo desaparecen solos. Al cambiar el toggle, las `key`/`url` cambian → refetch.)

- [ ] **Step 3: CSS del toggle en `app/globals.css`**

Agregar (cerca de `.compact-head`):
```css
.tipo-toggle{display:inline-flex;gap:4px;background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:4px;margin:6px 0 4px}
.tt{border:none;background:none;cursor:pointer;font-family:var(--body);font-size:14px;font-weight:600;color:var(--dim);padding:7px 18px;border-radius:999px}
.tt.on{background:var(--accent);color:#fff}
```

- [ ] **Step 4: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Verificación visual**

Run: `npm run dev`, abrir `/categoria/accion?tipo=movie` (con plataformas elegidas).
Expected: header "Acción" + toggle Películas/Series, fila "Populares en Acción", y sub-sliders "Acción + Comedia", "Acción + Aventura", etc. (solo los con catálogo). Tocar "Series" recarga los sliders con tv.

- [ ] **Step 6: Commit**

```bash
git add app/categoria/ components/CategoryView.tsx app/globals.css
git commit -m "feat(categoria): página de categoría con sub-sliders por cruce de género"
```

---

### Task 3: Páginas simples (especiales + directores)

**Files:**
- Create: `app/lista/[key]/page.tsx`, `components/ListaView.tsx`
- Create: `app/directores/page.tsx`, `components/DirectoresView.tsx`
- Modify: `app/globals.css` (`.people-grid`)

**Interfaces:**
- Produces: rutas `/lista/[key]` (key ∈ ultimos|mas-votados|hacete-cargo) y `/directores`.

- [ ] **Step 1: Crear `components/ListaView.tsx`**

```tsx
"use client";
import { useApi } from "./useApi";
import { usePlatforms } from "./PlatformsContext";
import TitleCard from "./TitleCard";
import OfflineState from "./pwa/OfflineState";
import type { UITitle } from "@/lib/types";

export default function ListaView({ endpoint, title }: { endpoint: string; title: string }) {
  const { platforms } = usePlatforms();
  const { data, loading, offline, retry } = useApi<{ items: UITitle[] }>(
    () => `${endpoint}${endpoint.includes("?") ? "&" : "?"}providers=${platforms.join(",")}`,
    [endpoint],
  );
  const items = data?.items ?? [];
  if (offline && !items.length) return <div className="wrap"><OfflineState onRetry={retry} /></div>;
  return (
    <div className="wrap">
      <div className="compact-head"><h1>{title}</h1></div>
      <p className="section-sub">{loading ? "Cargando…" : `${items.length} título${items.length !== 1 ? "s" : ""} en tus plataformas`}</p>
      <div className="grid">
        {items.map((t) => <TitleCard key={`${t.type}-${t.id}`} t={t} />)}
        {!loading && !items.length && <p className="empty-note">Nada por acá con tus plataformas.</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Crear `app/lista/[key]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import ListaView from "@/components/ListaView";

const LISTAS: Record<string, { endpoint: string; title: string }> = {
  "ultimos": { endpoint: "/api/latest", title: "Últimos lanzamientos" },
  "mas-votados": { endpoint: "/api/mas-votados", title: "Lo más votados" },
  "hacete-cargo": { endpoint: "/api/hacete-cargo", title: "Hacete cargo" },
};

export default function ListaPage({ params }: { params: { key: string } }) {
  const l = LISTAS[params.key];
  if (!l) notFound();
  return (
    <>
      <TopBar />
      <main><ListaView endpoint={l.endpoint} title={l.title} /></main>
      <BottomNav />
    </>
  );
}
```

- [ ] **Step 3: Crear `components/DirectoresView.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import PersonCard from "./PersonCard";
import type { UIPerson } from "@/lib/types";

export default function DirectoresView() {
  const [people, setPeople] = useState<UIPerson[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/directores")
      .then((r) => r.json())
      .then((j) => { if (alive) { setPeople(j.people ?? []); setLoading(false); } })
      .catch(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  return (
    <div className="wrap">
      <div className="compact-head"><h1>Directores</h1></div>
      {loading ? <p className="loading">Cargando…</p> : (
        <div className="people-grid">
          {people.map((p) => <PersonCard key={p.id} p={p} />)}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Crear `app/directores/page.tsx`**

```tsx
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import DirectoresView from "@/components/DirectoresView";

export default function DirectoresPage() {
  return (
    <>
      <TopBar />
      <main><DirectoresView /></main>
      <BottomNav />
    </>
  );
}
```

- [ ] **Step 5: CSS `.people-grid` en `app/globals.css`**

Agregar (cerca de `.people-row` / `.pcard`):
```css
.people-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:16px;margin-top:14px}
```

- [ ] **Step 6: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Verificación visual**

Run: `npm run dev`.
Expected: `/lista/mas-votados`, `/lista/ultimos`, `/lista/hacete-cargo` muestran una grilla de títulos con el título de la lista; `/directores` muestra una grilla de directores, cada uno linkeando a `/persona/[id]`. Una key inválida (`/lista/x`) da 404.

- [ ] **Step 8: Commit**

```bash
git add app/lista/ components/ListaView.tsx app/directores/ components/DirectoresView.tsx app/globals.css
git commit -m "feat(listas): páginas simples de especiales y directores"
```

---

### Task 4: Tile "Ver todas" en los sliders + wiring

**Files:**
- Modify: `components/Shelf.tsx` (prop `seeAllHref` + card)
- Modify: `components/PersonRail.tsx` (prop `seeAllHref` + card)
- Modify: `components/CatalogView.tsx` (pasar los hrefs)
- Modify: `app/globals.css` (`.seeall-card`)

**Interfaces:**
- Consumes: rutas `/categoria/[slug]` (Task 2), `/lista/[key]` y `/directores` (Task 3).

- [ ] **Step 1: `seeAllHref` en `components/Shelf.tsx`**

Agregar el import `Link`:
```tsx
import Link from "next/link";
```
Agregar `seeAllHref` a las props (destructuring y tipos):
```tsx
export default function Shelf({
  tipo, genre, country, title, url, showType, onOffline, seeAllHref,
}: {
  tipo?: MediaType; genre?: string; country?: string;
  title?: string; url?: string; showType?: boolean;
  onOffline?: () => void; seeAllHref?: string;
}) {
```
Reemplazar el contenido del `<div className="track" ref={track}>` por:
```tsx
      <div className="track" ref={track}>
        {loading ? <span className="loading">Cargando…</span> : (
          <>
            {items.map((t) => <TitleCard key={`${t.type}-${t.id}`} t={t} />)}
            {seeAllHref && items.length > 0 && (
              <Link href={seeAllHref} className="seeall-card">
                <span>Ver todas</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
              </Link>
            )}
          </>
        )}
      </div>
```

- [ ] **Step 2: `seeAllHref` en `components/PersonRail.tsx`**

Agregar `import Link from "next/link";` y la prop:
```tsx
export default function PersonRail({ title, endpoint, seeAllHref }: { title: string; endpoint: string; seeAllHref?: string }) {
```
Reemplazar el contenido de `<div className="people-row" ref={track}>` por:
```tsx
      <div className="people-row" ref={track}>
        {loading ? <span className="loading">Cargando…</span> : (
          <>
            {people.map((p) => <PersonCard key={p.id} p={p} />)}
            {seeAllHref && people.length > 0 && (
              <Link href={seeAllHref} className="seeall-card">
                <span>Ver todas</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
              </Link>
            )}
          </>
        )}
      </div>
```

- [ ] **Step 3: Pasar los hrefs en `components/CatalogView.tsx`**

En el bloque `mode === "inicio"` (líneas 38-44), reemplazar por:
```tsx
          <Shelf title="Últimos lanzamientos" url="/api/latest" seeAllHref="/lista/ultimos" onOffline={reportOffline} />
          <Shelf title="Lo más votados" url="/api/mas-votados" seeAllHref="/lista/mas-votados" />
          <Shelf title="Hacete cargo" url="/api/hacete-cargo" seeAllHref="/lista/hacete-cargo" />
          {SHELVES.map((g, i) => (
            <Shelf key={`${i % 2 === 0 ? "m" : "t"}-${g}`} tipo={i % 2 === 0 ? "movie" : "tv"} genre={g} showType seeAllHref={`/categoria/${g}?tipo=${i % 2 === 0 ? "movie" : "tv"}`} />
          ))}
          <PersonRail title="Directores" endpoint="/api/directores" seeAllHref="/directores" />
```
Y en el bloque de `/peliculas`/`/series` (líneas 66-70), agregar `seeAllHref` a esos shelves de género:
```tsx
        <div className="wrap">
          {SHELVES.map((g, i) => (
            <Shelf key={`${tipo}-${g}`} tipo={tipo} genre={g} onOffline={i === 0 ? reportOffline : undefined} seeAllHref={`/categoria/${g}?tipo=${tipo}`} />
          ))}
        </div>
```

- [ ] **Step 4: CSS `.seeall-card` en `app/globals.css`**

Agregar:
```css
.seeall-card{flex:0 0 auto;align-self:stretch;width:120px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;border-radius:var(--radius);border:1px dashed var(--line-2);background:var(--surface);color:var(--accent);text-decoration:none;font-weight:700;font-size:14px}
.seeall-card svg{width:22px;height:22px}
.seeall-card:hover{background:var(--surface-2)}
```

- [ ] **Step 5: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Verificación visual**

Run: `npm run dev`, abrir `/` (con plataformas).
Expected: al final de cada slider de género y de los especiales, y al final del riel de Directores, aparece la card "Ver todas →". Click en la de un género → `/categoria/[slug]`; en un especial → `/lista/[key]`; en directores → `/directores`. En `/peliculas` y `/series` los sliders de género también muestran la card.

- [ ] **Step 7: Commit**

```bash
git add components/Shelf.tsx components/PersonRail.tsx components/CatalogView.tsx app/globals.css
git commit -m "feat(home): card 'Ver todas' en sliders de género, especiales y directores"
```

---

## Verificación final

- [ ] `npx tsc --noEmit` → 0 errores.
- [ ] Home: cada slider (género + especiales) y el riel de directores muestran "Ver todas" al final; los links van al destino correcto.
- [ ] `/categoria/accion?tipo=movie`: toggle pelis/series, "Populares en Acción", sub-sliders "Acción + X" (los con catálogo); el cruce es AND real (Acción **y** Comedia).
- [ ] `/lista/{ultimos,mas-votados,hacete-cargo}`: grilla con la lista del endpoint. `/directores`: grilla de directores → `/persona/[id]`.
- [ ] Slug/key inválidos → 404.
- [ ] Modelo de votos y shelves del home sin cambios de comportamiento (solo el tile agregado).

## Self-Review (hecho)

- **Cobertura del spec:** tile "Ver todas" (Task 4), página de categoría rica + cruces (Task 2), `genre2`/AND (Task 1), páginas simples especiales+directores (Task 3). ✔
- **Placeholders:** sin TODO/TBD; todo el código es literal. ✔
- **Consistencia de tipos:** `listByCategory` con `genre2?` (Task 1) consumido vía URL por CategoryView/CatalogView; `seeAllHref?: string` consistente en Shelf/PersonRail/CatalogView; rutas `/categoria/[slug]`, `/lista/[key]`, `/directores` coinciden entre generador (Task 4) y páginas (Tasks 2-3). ✔
