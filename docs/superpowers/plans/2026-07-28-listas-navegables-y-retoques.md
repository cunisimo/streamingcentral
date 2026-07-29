# Listas navegables + retoques de UX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Arreglos de UX (alto de la card "Ver todas", sacar autofocus, "Ver todo", títulos ingeniosos de cruces) + directores navegable (buscador + paginado) + últimos navegable (filtro pelis/series + paginado).

**Architecture:** G1 son ediciones puntuales. G2 amplía la lista curada de directores y pagina/filtra del lado del cliente. G3 extiende `/api/latest` con `tipo`+`page` y agrega un `UltimosView` con toggle + "Cargar más" que appendea.

**Tech Stack:** Next.js 14 App Router, TypeScript, React (client components), CSS plano en `app/globals.css`.

## Global Constraints

- **No hay test runner** (por diseño). Cada task se valida con `npx tsc --noEmit` (0 errores) + chequeo visual. Copiado del CLAUDE.md.
- **Sin cambios de schema, modelo de votos ni Service Worker.**
- **IDs de directores nuevos verificados:** cada TMDB id agregado debe resolver al director correcto (confirmado contra TMDB); no se agregan ids "a ojo".
- **CSS solo en `app/globals.css`, reusando clases. Texto UI en español rioplatense.**
- **Backward-compat de `/api/latest`:** sin `tipo`/`page` sigue devolviendo movie/página 1 (lo usa el shelf del home).
- **Rama:** `feat/listas-navegables` (creada, con el spec commiteado).

---

### Task 1: G1 — arreglos rápidos (card, autofocus, "Ver todo", títulos)

**Files:**
- Modify: `app/globals.css` (`.seeall-card`)
- Modify: `components/desempate/DesempateManualSearch.tsx:48` (quitar `autoFocus`)
- Modify: `components/SearchView.tsx:23` (quitar `.focus()`)
- Modify: `components/PersonRail.tsx` (prop `seeAllLabel`)
- Modify: `components/CatalogView.tsx` (pasar `seeAllLabel="Ver todo"`)
- Modify: `lib/categories.ts` (`CROSS_PHRASE`)
- Modify: `components/CategoryView.tsx` (títulos con `CROSS_PHRASE`)

**Interfaces:**
- Produces: `PersonRail` con prop opcional `seeAllLabel?: string`; `CROSS_PHRASE: Record<string,string>` exportado de `lib/categories.ts`.

- [ ] **Step 1: `.seeall-card` al tamaño del póster (`app/globals.css`)**

Reemplazar la regla actual (`app/globals.css:211-213`):
```css
.seeall-card{flex:0 0 auto;align-self:stretch;width:120px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;border-radius:var(--radius);border:1px dashed var(--line-2);background:var(--surface);color:var(--accent);text-decoration:none;font-weight:700;font-size:14px}
.seeall-card svg{width:22px;height:22px}
.seeall-card:hover{background:var(--surface-2)}
```
por:
```css
.seeall-card{flex:0 0 158px;align-self:flex-start;aspect-ratio:2/3;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;border-radius:var(--radius-sm);border:1px dashed var(--line-2);background:var(--surface);color:var(--accent);text-decoration:none;font-weight:700;font-size:14px}
.seeall-card svg{width:22px;height:22px}
.seeall-card:hover{background:var(--surface-2)}
@media(max-width:620px){.track .seeall-card{flex-basis:140px}}
.people-row .seeall-card{flex-basis:96px;aspect-ratio:1;border-radius:50%}
```
(En rieles de título matchea el póster: ancho 158/140 + `aspect-ratio 2/3`, alineada arriba. En el riel de directores, círculo 96px como los avatares.)

- [ ] **Step 2: Quitar `autoFocus` del desempate (`components/desempate/DesempateManualSearch.tsx`)**

En el `<input>` (líneas 44-49), borrar la línea 48 `autoFocus` (dejar el resto igual):
```tsx
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscá una película o serie…"
        />
```

- [ ] **Step 3: Quitar el `.focus()` del buscador (`components/SearchView.tsx`)**

Borrar la línea 23:
```tsx
  useEffect(() => { inputRef.current?.focus(); }, []);
```
(Dejar el `const inputRef = useRef<HTMLInputElement>(null);` de la línea 21 — puede seguir usándose para el `ref` del input; solo se saca el auto-focus.)

- [ ] **Step 4: Prop `seeAllLabel` en `components/PersonRail.tsx`**

Cambiar la firma:
```tsx
export default function PersonRail({ title, endpoint, seeAllHref, seeAllLabel }: { title: string; endpoint: string; seeAllHref?: string; seeAllLabel?: string }) {
```
Y en la card "Ver todas" del riel, cambiar el texto `<span>Ver todas</span>` por:
```tsx
                <span>{seeAllLabel ?? "Ver todas"}</span>
```

- [ ] **Step 5: Pasar `seeAllLabel="Ver todo"` a Directores en `components/CatalogView.tsx`**

En el `<PersonRail>` del home:
```tsx
          <PersonRail title="Directores" endpoint="/api/directores" seeAllHref="/directores" seeAllLabel="Ver todo" />
```

- [ ] **Step 6: `CROSS_PHRASE` en `lib/categories.ts`**

Al final del archivo, agregar:
```ts
// Frase ingeniosa para el título de un sub-slider de cruce: "{Principal} {frase}".
// Ej. Acción × comedia → "Acción con risas". Clave = slug del género secundario.
export const CROSS_PHRASE: Record<string, string> = {
  comedia: "con risas",
  terror: "con sustos",
  suspenso: "con tensión",
  crimen: "con delito",
  romance: "con amor",
  scifi: "del futuro",
  aventura: "a pura aventura",
  drama: "para llorar",
  animacion: "en dibujos",
  misterio: "con enigmas",
};
```

- [ ] **Step 7: Usar `CROSS_PHRASE` en `components/CategoryView.tsx`**

Agregar `CROSS_PHRASE` al import de categories:
```tsx
import { CATEGORIES, resolveCategory, CROSS_PHRASE } from "@/lib/categories";
```
Cambiar el `title` del `<Shelf>` de cruce (`title={`${label} + ${c.label}`}`) por:
```tsx
              title={`${label} ${CROSS_PHRASE[c.slug] ?? `+ ${c.label}`}`}
```

- [ ] **Step 8: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: PASS (0 errores).

- [ ] **Step 9: Verificación visual**

Run: `npm run dev`.
Expected: la card "Ver todas" mide como el póster (no incluye el alto del texto); abrir Desempate / ir a `/buscar` no despliega teclado ni cursor; el riel de Directores dice "Ver todo"; en `/categoria/accion` los cruces dicen "Acción con risas", "Acción del futuro", etc.

- [ ] **Step 10: Commit**

```bash
git add app/globals.css components/desempate/DesempateManualSearch.tsx components/SearchView.tsx components/PersonRail.tsx components/CatalogView.tsx lib/categories.ts components/CategoryView.tsx
git commit -m "feat(ux): card 'Ver todas' del tamaño del póster, sin autofocus, 'Ver todo' y títulos ingeniosos de cruces"
```

---

### Task 2: Directores navegable (lista ampliada + buscador + paginado)

**Files:**
- Modify: `lib/enrich.ts` (`DIRECTOR_IDS` ampliado)
- Modify: `components/DirectoresView.tsx` (buscador + paginado cliente)

**Interfaces:**
- Consumes: `/api/directores` → `{ people: UIPerson[] }` (sin cambios de shape).

- [ ] **Step 1: Ampliar `DIRECTOR_IDS` en `lib/enrich.ts`**

Los 12 actuales (líneas 153-166) se conservan. Agregar directores hasta ~48 en total.
**Para cada nombre de la lista de abajo, resolver su TMDB person id y verificarlo**
(que la id corresponda a ese director): usar el server de dev y
`GET /api/search?q=<nombre>` (los resultados incluyen personas con su `id`), o
TMDB `/search/person`. Confirmar contra `/person/[id]` que el nombre coincide y
que es director. Agregar cada id a `DIRECTOR_IDS` con un comentario `// Nombre`.
Si alguno no se puede resolver con confianza, omitirlo y anotarlo en el reporte.

Nombres a agregar:
Ridley Scott, James Cameron, Peter Jackson, Alfonso Cuarón, Alejandro G. Iñárritu,
Pedro Almodóvar, Paul Thomas Anderson, Sofia Coppola, Kathryn Bigelow, Spike Lee,
Tim Burton, David Lynch, Stanley Kubrick, Francis Ford Coppola, Clint Eastwood,
Ang Lee, Danny Boyle, Darren Aronofsky, George Miller, Taika Waititi, Chloé Zhao,
Rian Johnson, Edgar Wright, Robert Eggers, Ari Aster, Yorgos Lanthimos,
Park Chan-wook, Hayao Miyazaki, Wong Kar-wai, Ryan Coogler, Joel Coen, Ethan Coen,
Lana Wachowski, Damián Szifron, Juan José Campanella, Lucrecia Martel.

(La lista queda como un array de números con comentarios de nombre, igual que hoy.)

- [ ] **Step 2: Verificar que la lista resuelve**

Run (con el dev corriendo): `curl "http://localhost:3000/api/directores" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.people.length,'directores');})"`
Expected: ~45+ directores (los que resolvieron). Ninguno con nombre vacío.

- [ ] **Step 3: Reescribir `components/DirectoresView.tsx` con buscador + paginado**

```tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import PersonCard from "./PersonCard";
import type { UIPerson } from "@/lib/types";

const PAGE = 20;
// Normaliza para búsqueda insensible a acentos y mayúsculas.
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export default function DirectoresView() {
  const [people, setPeople] = useState<UIPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [visible, setVisible] = useState(PAGE);

  useEffect(() => {
    let alive = true;
    fetch("/api/directores")
      .then((r) => r.json())
      .then((j) => { if (alive) { setPeople(j.people ?? []); setLoading(false); } })
      .catch(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    const nq = norm(q.trim());
    return nq ? people.filter((p) => norm(p.name).includes(nq)) : people;
  }, [people, q]);

  const shown = filtered.slice(0, visible);

  return (
    <div className="wrap">
      <div className="compact-head"><h1>Directores</h1></div>
      <div className="field" style={{ maxWidth: 360 }}>
        <input
          type="text"
          value={q}
          onChange={(e) => { setQ(e.target.value); setVisible(PAGE); }}
          placeholder="Buscar director por nombre…"
        />
      </div>
      {loading ? <p className="loading">Cargando…</p> : (
        <>
          <div className="people-grid">
            {shown.map((p) => <PersonCard key={p.id} p={p} />)}
          </div>
          {!filtered.length && <p className="empty-note">No hay directores con ese nombre.</p>}
          {visible < filtered.length && (
            <div style={{ textAlign: "center", marginTop: 20 }}>
              <button className="btn ghost" onClick={() => setVisible((v) => v + PAGE)}>Cargar más</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Verificación visual**

Run: `npm run dev`, abrir `/directores`.
Expected: input de búsqueda arriba; se ven 20 directores; "Cargar más" revela +20; escribir un nombre filtra (case/acentos insensible) y resetea a 20; cada card linkea a `/persona/[id]`.

- [ ] **Step 6: Commit**

```bash
git add lib/enrich.ts components/DirectoresView.tsx
git commit -m "feat(directores): lista curada ampliada + buscador y 'cargar más'"
```

---

### Task 3: Últimos navegable (filtro pelis/series + paginado)

**Files:**
- Modify: `lib/enrich.ts` (`latestReleases(providers, tipo, page)`)
- Modify: `app/api/latest/route.ts` (params `tipo`/`page`)
- Create: `components/UltimosView.tsx`
- Modify: `app/lista/[key]/page.tsx` (montar `UltimosView` para `ultimos`)

**Interfaces:**
- Produces: `/api/latest?tipo=movie|tv&page=N` → `{ items: UITitle[] }` (≤20 por página).

- [ ] **Step 1: `latestReleases(providers, tipo, page)` en `lib/enrich.ts`**

Reemplazar `latestReleases` (líneas 97-103) por:
```ts
export async function latestReleases(
  providers: PlatformCode[], tipo: MediaType = "movie", page = 1,
): Promise<UITitle[]> {
  const extra = tipo === "movie"
    ? { "primary_release_date.lte": today() }
    : { "first_air_date.lte": today() };
  return listByCategory({
    tipo, providers, page, minVotes: 5,
    sortBy: tipo === "movie" ? "primary_release_date.desc" : "first_air_date.desc",
    extra,
  });
}
```
(`MediaType` ya está importado en el archivo.)

- [ ] **Step 2: Params en `app/api/latest/route.ts`**

Reemplazar el archivo por:
```ts
import { NextRequest, NextResponse } from "next/server";
import { latestReleases } from "@/lib/enrich";
import type { MediaType, PlatformCode } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const providers = (sp.get("providers")?.split(",").filter(Boolean) || []) as PlatformCode[];
  const tipo: MediaType = sp.get("tipo") === "tv" ? "tv" : "movie";
  const page = Number(sp.get("page") || "1");
  try {
    return NextResponse.json({ items: await latestReleases(providers, tipo, page) });
  } catch (e) {
    return NextResponse.json({ error: String(e), items: [] }, { status: 500 });
  }
}
```
(Sin `tipo`/`page` → movie/página 1, igual que hoy: el shelf del home no cambia.)

- [ ] **Step 3: Crear `components/UltimosView.tsx`**

```tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import { usePlatforms } from "./PlatformsContext";
import TitleCard from "./TitleCard";
import OfflineState from "./pwa/OfflineState";
import { useOnline } from "@/hooks/useOnline";
import type { UITitle, MediaType } from "@/lib/types";

export default function UltimosView() {
  const { platforms } = usePlatforms();
  const [tipo, setTipo] = useState<MediaType>("movie");
  const [items, setItems] = useState<UITitle[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false); // una página vacía = fin
  const online = useOnline();
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (t: MediaType, p: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/latest?tipo=${t}&page=${p}&providers=${platforms.join(",")}`);
      const j = await res.json();
      const got: UITitle[] = j.items ?? [];
      setItems((prev) => (p === 1 ? got : [...prev, ...got]));
      setDone(got.length === 0);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [platforms]);

  // Carga inicial + al cambiar tipo o plataformas: reset a página 1.
  useEffect(() => { setPage(1); load(tipo, 1); }, [tipo, load]);

  function switchTipo(t: MediaType) { if (t !== tipo) { setItems([]); setDone(false); setTipo(t); } }
  function more() { const next = page + 1; setPage(next); load(tipo, next); }

  if ((!online || failed) && !items.length) {
    return <div className="wrap"><OfflineState onRetry={() => load(tipo, 1)} /></div>;
  }

  return (
    <div className="wrap">
      <div className="compact-head"><h1>Últimos lanzamientos</h1></div>
      <div className="tipo-toggle" role="tablist">
        <button role="tab" aria-selected={tipo === "movie"} className={`tt ${tipo === "movie" ? "on" : ""}`} onClick={() => switchTipo("movie")}>Películas</button>
        <button role="tab" aria-selected={tipo === "tv"} className={`tt ${tipo === "tv" ? "on" : ""}`} onClick={() => switchTipo("tv")}>Series</button>
      </div>
      <div className="grid">
        {items.map((t) => <TitleCard key={`${t.type}-${t.id}`} t={t} />)}
      </div>
      {loading && <p className="loading">Cargando…</p>}
      {!loading && !items.length && <p className="empty-note">Nada por acá con tus plataformas.</p>}
      {!done && !loading && items.length > 0 && (
        <div style={{ textAlign: "center", marginTop: 20 }}>
          <button className="btn ghost" onClick={more}>Cargar más</button>
        </div>
      )}
    </div>
  );
}
```
> Nota: `listByCategory` corta a 20 y luego filtra por plataforma, así que una
> página puede volver con < 20 aun habiendo más adelante. Por eso el fin se
> detecta con página **vacía** (`got.length === 0`), no con `< 20`: así no se
> oculta "Cargar más" antes de tiempo (a lo sumo un click final que trae 0).

- [ ] **Step 4: Montar `UltimosView` para `ultimos` en `app/lista/[key]/page.tsx`**

Agregar el import y el caso especial. Reemplazar el `export default function ListaPage`:
```tsx
import { notFound } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import ListaView from "@/components/ListaView";
import UltimosView from "@/components/UltimosView";

const LISTAS: Record<string, { endpoint: string; title: string }> = {
  "mas-votados": { endpoint: "/api/mas-votados", title: "Lo más votados" },
  "hacete-cargo": { endpoint: "/api/hacete-cargo", title: "Hacete cargo" },
};

export default function ListaPage({ params }: { params: { key: string } }) {
  if (params.key === "ultimos") {
    return (<><TopBar /><main><UltimosView /></main><BottomNav /></>);
  }
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
(Se saca `ultimos` de `LISTAS` porque ahora lo maneja `UltimosView`. El `seeAllHref="/lista/ultimos"` del home sigue funcionando.)

- [ ] **Step 5: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Verificación visual**

Run: `npm run dev`, abrir `/lista/ultimos` (con plataformas).
Expected: título "Últimos lanzamientos" + toggle Películas/Series; se ven títulos; "Cargar más" appendea más sin recargar; cambiar a Series muestra series recientes (reset). `/lista/mas-votados` y `/lista/hacete-cargo` siguen como grilla simple.

- [ ] **Step 7: Commit**

```bash
git add lib/enrich.ts app/api/latest/route.ts components/UltimosView.tsx app/lista/[key]/page.tsx
git commit -m "feat(ultimos): filtro pelis/series + paginado 'cargar más'"
```

---

## Verificación final

- [ ] `npx tsc --noEmit` → 0 errores.
- [ ] Card "Ver todas" al alto del póster (rieles) y como círculo 96px (directores).
- [ ] Sin autofocus: Desempate y `/buscar` no abren el teclado solos.
- [ ] Directores: tile "Ver todo"; `/directores` con buscador + 20 + "Cargar más".
- [ ] Cruces con títulos ingeniosos ("Acción con risas", etc.).
- [ ] `/lista/ultimos`: toggle pelis/series + "Cargar más" (append); otros `/lista/*` simples.
- [ ] Home shelf "Últimos lanzamientos" sin cambios (backward-compat de `/api/latest`).

## Self-Review (hecho)

- **Cobertura del spec:** G1 (Task 1: card/autofocus/Ver todo/títulos), G2 (Task 2: DIRECTOR_IDS + buscador/paginado), G3 (Task 3: latest tipo/page + UltimosView). ✔
- **Placeholders:** el único paso "no literal" es resolver los TMDB ids de directores por nombre (Task 2 Step 1) — es un procedimiento verificable con nombres exactos, no un placeholder. Resto todo código literal. ✔
- **Consistencia de tipos:** `seeAllLabel?: string` (PersonRail/CatalogView), `CROSS_PHRASE` (categories.ts→CategoryView), `latestReleases(providers,tipo,page)` (enrich→route), `/api/latest?tipo=&page=` (route→UltimosView) consistentes. ✔
