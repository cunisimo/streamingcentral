# Toggle Películas/Series por riel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el badge fijo `· Películas`/`· Series` de los rieles del Home por un toggle de 2 estados que deja al usuario elegir el tipo de contenido de ese riel, recordando la elección.

**Architecture:** Un hook `useShelfType` guarda la preferencia por riel en localStorage. Un componente `ShelfTypeToggle` renderiza el par de botones. `Shelf` recibe un prop `typeToggle` con dos modos: `"refetch"` (rieles de género → reconstruye la URL de `/api/discover` y `useApi` refetchea) y `"filter"` (rieles de votos → filtra en cliente los ítems ya cargados por `type`). `CatalogView` cablea los 8 rieles.

**Tech Stack:** Next.js 14 App Router, TypeScript, React client components, CSS plano en `app/globals.css`.

## Global Constraints

- **No hay test runner** (por diseño del proyecto). La verificación de cada tarea es `npx tsc --noEmit` (0 errores) + chequeo visual/funcional descrito. No se escriben tests unitarios.
- UI en **español rioplatense**.
- **Sin CSS-in-JS**: todo estilo nuevo va en `app/globals.css` con clases planas. Reusar tokens existentes (`--accent` = coral, `--faint` = gris inactivo).
- **Windows/PowerShell**: no usar `rm -rf`. Los comandos `git`/`npx` son cross-shell.
- Commits en español, imperativo, con `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Rama de trabajo ya creada: `feat/shelf-type-toggle`.

## File Structure

- **Create** `hooks/useShelfType.ts` — estado `MediaType` por riel, persistido en `localStorage["yump:shelf-type"]`.
- **Create** `components/ShelfTypeToggle.tsx` — par de botones Películas/Series.
- **Modify** `components/Shelf.tsx` — prop `typeToggle`, integración del hook + toggle, modos refetch/filter, empty-state que no desmonta.
- **Modify** `components/CatalogView.tsx` — pasar `typeToggle` a los 6 rieles de género y a los 2 de votos.
- **Modify** `app/globals.css` — clases `.shelf-head-l` y `.shelf-toggle`.

---

### Task 1: Hook `useShelfType`

**Files:**
- Create: `hooks/useShelfType.ts`

**Interfaces:**
- Produces: `useShelfType(shelfKey: string, initial: MediaType): [MediaType, (t: MediaType) => void]`. Devuelve el tipo activo del riel y un setter que persiste. `MediaType` es `"movie" | "tv"` (de `@/lib/types`).

- [ ] **Step 1: Crear el archivo del hook**

Crear `hooks/useShelfType.ts` con este contenido exacto:

```ts
"use client";
import { useEffect, useState } from "react";
import type { MediaType } from "@/lib/types";

// Preferencia de tipo (movie/tv) por riel del Home, persistida en localStorage.
// Un solo objeto { [shelfKey]: "movie" | "tv" } bajo una key. Es tolerante a
// localStorage no disponible (SSR / modo privado): degrada a estado en memoria.
const KEY = "yump:shelf-type";
type Store = Record<string, MediaType>;

function readStore(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

export function useShelfType(
  shelfKey: string,
  initial: MediaType,
): [MediaType, (t: MediaType) => void] {
  // Inicia con `initial` para no romper la hidratación (el server no tiene
  // localStorage). La preferencia guardada se aplica tras montar.
  const [type, setType] = useState<MediaType>(initial);

  useEffect(() => {
    if (!shelfKey) return;
    const stored = readStore()[shelfKey];
    if (stored === "movie" || stored === "tv") setType(stored);
  }, [shelfKey]);

  const update = (t: MediaType) => {
    setType(t);
    if (!shelfKey) return;
    try {
      const store = readStore();
      store[shelfKey] = t;
      localStorage.setItem(KEY, JSON.stringify(store));
    } catch {
      /* localStorage no disponible: la preferencia no persiste, no rompe */
    }
  };

  return [type, update];
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add hooks/useShelfType.ts
git commit -m "feat(shelf): hook useShelfType (preferencia de tipo por riel en localStorage)"
```

---

### Task 2: Componente `ShelfTypeToggle` + CSS

**Files:**
- Create: `components/ShelfTypeToggle.tsx`
- Modify: `app/globals.css` (agregar clases después de la línea `.arrows{...}`, ~línea 158)

**Interfaces:**
- Consumes: `MediaType` de `@/lib/types`.
- Produces: `export default function ShelfTypeToggle({ value, onChange }: { value: MediaType; onChange: (t: MediaType) => void })`.

- [ ] **Step 1: Crear el componente**

Crear `components/ShelfTypeToggle.tsx` con este contenido exacto:

```tsx
"use client";
import type { MediaType } from "@/lib/types";

// Toggle de 2 estados Películas | Series para el header de un riel.
// El tipo activo va en coral (--accent), el otro en gris (--faint).
export default function ShelfTypeToggle({
  value, onChange,
}: { value: MediaType; onChange: (t: MediaType) => void }) {
  return (
    <div className="shelf-toggle" role="group" aria-label="Tipo de contenido">
      <button
        type="button"
        className={value === "movie" ? "is-active" : ""}
        aria-pressed={value === "movie"}
        onClick={() => onChange("movie")}
      >
        Películas
      </button>
      <button
        type="button"
        className={value === "tv" ? "is-active" : ""}
        aria-pressed={value === "tv"}
        onClick={() => onChange("tv")}
      >
        Series
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Agregar el CSS**

En `app/globals.css`, justo después de la línea `.arrows{display:flex;gap:8px}` (~línea 158), agregar:

```css
.shelf-head-l{display:flex;align-items:center;gap:14px;flex-wrap:wrap;min-width:0}
.shelf-toggle{display:inline-flex;align-items:center;gap:12px}
.shelf-toggle button{background:none;border:0;padding:0;font-family:var(--body);font-size:13px;font-weight:600;color:var(--faint);cursor:pointer;letter-spacing:-.01em;transition:color .15s}
.shelf-toggle button:hover{color:var(--dim)}
.shelf-toggle button.is-active{color:var(--accent)}
.shelf-toggle button.is-active:hover{color:var(--accent)}
.shelf-toggle button:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px}
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add components/ShelfTypeToggle.tsx app/globals.css
git commit -m "feat(shelf): componente ShelfTypeToggle + estilos"
```

---

### Task 3: Integrar el toggle en `Shelf`

**Files:**
- Modify: `components/Shelf.tsx` (reescritura completa del componente)

**Interfaces:**
- Consumes: `useShelfType` (Task 1), `ShelfTypeToggle` (Task 2), `genreLabel` de `./data`, `MediaType`/`UITitle` de `@/lib/types`.
- Produces: `Shelf` con props nuevos `typeToggle?: "refetch" | "filter"`, `shelfKey?: string`, `initialType?: MediaType`. Comportamiento sin `typeToggle` idéntico al actual.

Notas de comportamiento que el código implementa:
- **refetch**: el tipo activo entra en la URL de `/api/discover` y en las deps de `useApi` → refetchea al cambiar. Además, si hay `genre`, el link "Ver todas" se recalcula a `/categoria/{genre}?tipo={activeType}` para que siga al toggle.
- **filter**: la URL no cambia; los ítems ya cargados se filtran por `t.type === activeType`.
- **empty-state**: los rieles con `typeToggle` NO se auto-ocultan; si el tipo activo queda con <2 ítems, se muestra el header+toggle y un mensaje. Los rieles sin `typeToggle` conservan el auto-ocultado actual (`return null`).

- [ ] **Step 1: Reescribir `components/Shelf.tsx`**

Reemplazar todo el contenido de `components/Shelf.tsx` por:

```tsx
"use client";
import { useRef, useEffect } from "react";
import Link from "next/link";
import { useApi } from "./useApi";
import { usePlatforms } from "./PlatformsContext";
import { useShelfType } from "@/hooks/useShelfType";
import TitleCard from "./TitleCard";
import ShelfTypeToggle from "./ShelfTypeToggle";
import { genreLabel } from "./data";
import type { UITitle, MediaType } from "@/lib/types";

// Shelf genérico. Por defecto arma la URL de /api/discover con tipo+género.
// Si se pasa `url` y `title`, usa ese endpoint (ej: /api/latest).
//
// Con `typeToggle` muestra el toggle Películas/Series y recuerda la elección
// por `shelfKey` (localStorage). Dos modos:
//  - "refetch": el tipo entra en la URL de /api/discover → refetch al cambiar.
//  - "filter":  filtra en cliente los ítems ya cargados por `type` (votos).
export default function Shelf({
  tipo, genre, country, title, url, showType, onOffline, seeAllHref,
  typeToggle, shelfKey, initialType,
}: {
  tipo?: MediaType; genre?: string; country?: string;
  title?: string; url?: string; showType?: boolean;
  // Aviso al contenedor de que el fetch falló por red. Los rieles se auto-ocultan
  // (mejor que N errores iguales), pero si TODOS se ocultan la pantalla queda
  // vacía y sin explicación: CatalogView lo pasa solo al primer riel para poder
  // mostrar un único estado offline. Cubre el caso "hay red pero el server no
  // responde", donde navigator.onLine sigue en true.
  onOffline?: () => void; seeAllHref?: string;
  typeToggle?: "refetch" | "filter"; shelfKey?: string; initialType?: MediaType;
}) {
  const { platforms } = usePlatforms();
  const track = useRef<HTMLDivElement>(null);

  // Estado del toggle (siempre se llama el hook por las reglas de hooks; solo
  // se usa cuando hay typeToggle). Default: initialType, o el tipo fijo, o movie.
  const [activeType, setActiveType] = useShelfType(
    shelfKey ?? "", initialType ?? tipo ?? "movie",
  );

  // En modo refetch el tipo efectivo de /api/discover es el del toggle.
  const effectiveTipo: MediaType | undefined =
    typeToggle === "refetch" ? activeType : tipo;

  const buildUrl = () =>
    url
      ? `${url}${url.includes("?") ? "&" : "?"}providers=${platforms.join(",")}`
      : `/api/discover?tipo=${effectiveTipo}&genre=${genre}&providers=${platforms.join(",")}${country ? `&country=${country}` : ""}`;
  const { data, loading, offline } = useApi<{ items: UITitle[] }>(
    buildUrl, [effectiveTipo, genre, country, url],
  );

  const rawItems = data?.items ?? [];
  // En modo filter, acotamos al tipo activo sobre la lista mixta ya cargada.
  const items = typeToggle === "filter"
    ? rawItems.filter((t) => t.type === activeType)
    : rawItems;

  useEffect(() => {
    if (offline && onOffline) onOffline();
  }, [offline, onOffline]);

  // Auto-ocultado solo para rieles SIN toggle. Con toggle, mantenemos header +
  // toggle visibles aunque el tipo activo quede vacío (si no, el usuario no
  // podría volver).
  if (!typeToggle && !loading && items.length < 2) return null;

  const heading = title ?? genreLabel(genre ?? "");
  const tipoLabel = activeType === "movie" ? "películas" : "series";
  const emptyMsg = genre
    ? `No hay ${tipoLabel} de ${genreLabel(genre).toLowerCase()} en tus plataformas`
    : `No hay ${tipoLabel} para mostrar`;

  // "Ver todas" sigue al toggle en los rieles de género (refetch).
  const resolvedSeeAll =
    typeToggle === "refetch" && genre
      ? `/categoria/${genre}?tipo=${activeType}`
      : seeAllHref;

  const scroll = (d: number) => track.current?.scrollBy({ left: d * (track.current.clientWidth * 0.8), behavior: "smooth" });
  return (
    <div className="shelf">
      <div className="shelf-head">
        <div className="shelf-head-l">
          <h2>{heading}{showType && !typeToggle && tipo && <span style={{ color: "var(--faint)", fontWeight: 500, fontSize: "0.75em" }}>{tipo === "movie" ? " · Películas" : " · Series"}</span>}</h2>
          {typeToggle && <ShelfTypeToggle value={activeType} onChange={setActiveType} />}
        </div>
        <div className="arrows">
          <button className="arrow" onClick={() => scroll(-1)} aria-label="Anterior"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg></button>
          <button className="arrow" onClick={() => scroll(1)} aria-label="Siguiente"><svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg></button>
        </div>
      </div>
      <div className="track" ref={track}>
        {loading ? <span className="loading">Cargando…</span>
          : items.length < 2 ? <span className="empty-note">{emptyMsg}</span>
          : (
            <>
              {items.map((t) => <TitleCard key={`${t.type}-${t.id}`} t={t} />)}
              {resolvedSeeAll && items.length > 0 && (
                <Link href={resolvedSeeAll} className="seeall-card">
                  <span>Ver todas</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
                </Link>
              )}
            </>
          )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add components/Shelf.tsx
git commit -m "feat(shelf): Shelf soporta toggle de tipo (refetch/filter) + empty-state"
```

---

### Task 4: Cablear los rieles del Home en `CatalogView`

**Files:**
- Modify: `components/CatalogView.tsx` (líneas 41-45, bloque del modo "inicio")

**Interfaces:**
- Consumes: `Shelf` con props `typeToggle`/`shelfKey`/`initialType` (Task 3).

- [ ] **Step 1: Cablear los rieles de votos**

En `components/CatalogView.tsx`, reemplazar las líneas 41-42:

```tsx
          <Shelf title="Lo más votados" url="/api/mas-votados" seeAllHref="/lista/mas-votados" />
          <Shelf title="Hacete cargo" url="/api/hacete-cargo" seeAllHref="/lista/hacete-cargo" />
```

por:

```tsx
          <Shelf title="Lo más votados" url="/api/mas-votados" seeAllHref="/lista/mas-votados" typeToggle="filter" shelfKey="mas-votados" initialType="movie" />
          <Shelf title="Hacete cargo" url="/api/hacete-cargo" seeAllHref="/lista/hacete-cargo" typeToggle="filter" shelfKey="hacete-cargo" initialType="movie" />
```

- [ ] **Step 2: Cablear los rieles de género**

En `components/CatalogView.tsx`, reemplazar el bloque de las líneas 43-45:

```tsx
          {SHELVES.map((g, i) => (
            <Shelf key={`${i % 2 === 0 ? "m" : "t"}-${g}`} tipo={i % 2 === 0 ? "movie" : "tv"} genre={g} showType seeAllHref={`/categoria/${g}?tipo=${i % 2 === 0 ? "movie" : "tv"}`} />
          ))}
```

por:

```tsx
          {SHELVES.map((g, i) => (
            <Shelf key={g} genre={g} typeToggle="refetch" shelfKey={g} initialType={i % 2 === 0 ? "movie" : "tv"} seeAllHref={`/categoria/${g}?tipo=${i % 2 === 0 ? "movie" : "tv"}`} />
          ))}
```

(Se retira `showType` y el `tipo` fijo; `initialType` fija el default por alternancia, y `Shelf` recalcula la URL y el link "Ver todas" según el toggle.)

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 4: Verificación visual/funcional**

Correr el server de producción (el SW no corre en `next dev`, pero acá no lo tocamos; igual sirve `next dev` para esta verificación):

```bash
npm run dev
```

Abrir el Home y confirmar:
- Los 8 rieles (6 de género + Lo más votados + Hacete cargo) muestran el toggle **Películas | Series** al lado del título.
- Default correcto: en los de género alterna (acción→Películas, sci-fi→Series, terror→Películas, drama→Series, comedia→Películas, documental→Series); votos→Películas.
- Click en "Series" en el riel de Terror: recarga con series de terror; "Series" pasa a coral y "Películas" a gris.
- Recargar la página: el riel de Terror recuerda "Series".
- En un riel donde el tipo elegido no tenga resultados, aparece el mensaje ("No hay … en tus plataformas") y el riel NO desaparece.
- "Últimos lanzamientos", "Directores" y las páginas Películas/Series quedan igual que antes (sin toggle).

- [ ] **Step 5: Commit**

```bash
git add components/CatalogView.tsx
git commit -m "feat(shelf): toggle de tipo en los 8 rieles del Home (género + votos)"
```

---

## Self-Review (hecho al escribir el plan)

- **Cobertura del spec:** toggle 2 estados (Task 2), refetch/filter (Task 3), default alternancia + votos Películas (Task 4), persistencia (Task 1), empty-state (Task 3), sin tocar endpoints/enrich, sin CSS-in-JS. ✔
- **Sin placeholders:** todo el código está completo en cada step. ✔
- **Consistencia de tipos:** `useShelfType(shelfKey, initial): [MediaType, (t)=>void]` usado igual en Shelf; `ShelfTypeToggle({value,onChange})` usado igual; `typeToggle`/`shelfKey`/`initialType` consistentes entre Task 3 y Task 4. ✔
- **Extra sobre el spec (correctness):** "Ver todas" de los rieles de género sigue al toggle (`/categoria/{genre}?tipo={activeType}`), para no mandar a películas cuando el riel está en series. Es una corrección natural, no scope nuevo. ✔
