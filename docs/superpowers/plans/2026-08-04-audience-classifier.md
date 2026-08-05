# Clasificación de audiencia — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Excluir contenido family de los carruseles de género adultos y agregar dos carruseles nuevos (Para toda la familia, Animación para adultos), con toda la lógica en un módulo backend único.

**Architecture:** `lib/audience.ts` = fuente de verdad (recetas de filtros TMDB). `listByCategory` aplica la exclusión de family en un solo punto (cubre Home/categoria/recomendador/buscador). `audienceTitles` + `/api/audience` alimentan los 2 carruseles nuevos. Frontend solo consume; cero regla de negocio en React.

**Tech Stack:** Next.js 14 App Router, TypeScript, TMDB discover (server-side filtering), React client components.

## Global Constraints

- **No hay test runner** (por diseño). Verificación por tarea: `npx tsc --noEmit` (0 errores) + curl/visual donde se indique.
- **No replicar catálogo en Supabase.** La audiencia es capa de negocio a nivel query (recetas de discover), no atributo por título almacenado.
- **Lógica en un solo módulo** (`lib/audience.ts`). Sin reglas duplicadas en queries/endpoints/React.
- UI en **español rioplatense**. Región AR fija.
- IDs de género confirmados: Family `10751`, Kids `10762` (tv), Animación `16`. Recetas validadas contra TMDB.
- Commits en español, imperativo, con `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Rama de trabajo ya creada: `feat/audience-classifier`.

## File Structure

- **Create** `lib/audience.ts` — fuente de verdad: `FAMILY_GENRES`, `excludeFamilyFor`, `AUDIENCES`, `audienceRule`.
- **Modify** `lib/tmdb.ts` — `DiscoverOpts` + `discover()`: soporte `withoutGenres`.
- **Modify** `lib/enrich.ts` — `listByCategory` aplica exclusión; nueva `audienceTitles`.
- **Create** `app/api/audience/route.ts` — endpoint de los carruseles de audiencia.
- **Modify** `components/CatalogView.tsx` — +2 `<Shelf>`, −`PersonRail` Directores.

---

### Task 1: Módulo `lib/audience.ts` + `discover` con `withoutGenres`

**Files:**
- Create: `lib/audience.ts`
- Modify: `lib/tmdb.ts` (`DiscoverOpts` interface + `discover()`)

**Interfaces:**
- Produces: `FAMILY_GENRES: number[]`, `excludeFamilyFor(slug?: string): boolean`, `AUDIENCES` record, `audienceRule(slug: string, tipo: MediaType): AudienceRule | null`. `AudienceRule = { genres?: number[]; withoutGenres?: number[]; certLte?: string; certGte?: string }`.
- Produces: `DiscoverOpts.withoutGenres?: number[]` → TMDB `without_genres` (join con coma).

- [ ] **Step 1: Crear `lib/audience.ts`**

```ts
// Fuente de verdad de la clasificación de audiencia (capa de negocio backend).
// La audiencia es una receta de filtros de TMDB aplicada en las queries de
// discover — NO un atributo por título en Supabase. Cambiar el criterio de qué
// es family/adulto se hace acá y en ningún otro lado.
import type { MediaType } from "./types";

// Family (movie+tv) y Kids (solo tv). Se excluyen de los géneros adultos.
export const FAMILY_GENRES = [10751, 10762];

// Categorías cuya naturaleza es animación/familiar: NO se les excluye family
// (si no, un carrusel de Animación perdería su contenido familiar).
const EXEMPT = new Set(["animacion", "familiar"]);

// ¿A este slug de género se le excluye el contenido family? true para géneros
// general/adulto; false para exentos, "todos" y sin género.
export function excludeFamilyFor(slug?: string): boolean {
  return !!slug && slug !== "todos" && !EXEMPT.has(slug);
}

export interface AudienceRule {
  genres?: number[];
  withoutGenres?: number[];
  certLte?: string; // certification.lte (US)
  certGte?: string; // certification.gte (US)
}

// Recetas de los carruseles de audiencia, por tipo. IDs validados contra TMDB.
export const AUDIENCES: Record<string, { label: string; movie: AudienceRule; tv: AudienceRule }> = {
  family: {
    label: "Para toda la familia",
    movie: { genres: [10751], certLte: "PG" },
    tv: { genres: [10762] },
  },
  "adult-anime": {
    label: "Animación para adultos",
    movie: { genres: [16], withoutGenres: [10751], certGte: "PG-13" },
    tv: { genres: [16], withoutGenres: [10762] },
  },
};

export function audienceRule(slug: string, tipo: MediaType): AudienceRule | null {
  return AUDIENCES[slug]?.[tipo] ?? null;
}
```

- [ ] **Step 2: `withoutGenres` en `discover` (`lib/tmdb.ts`)**

En la interface `DiscoverOpts` (líneas 60-69), agregar el campo tras `genres`:

```ts
  genres?: number[];
```

queda:

```ts
  genres?: number[];
  withoutGenres?: number[];
```

Y en `discover()` (líneas 71-84), tras la línea `if (o.genres?.length) p.with_genres = o.genres.join("|");`, agregar:

```ts
  if (o.withoutGenres?.length) p.without_genres = o.withoutGenres.join(",");
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add lib/audience.ts lib/tmdb.ts
git commit -m "feat(audience): módulo lib/audience.ts + soporte without_genres en discover"
```

---

### Task 2: Exclusión de family en `listByCategory`

**Files:**
- Modify: `lib/enrich.ts` (`listByCategory`, ~líneas 57-95)

**Interfaces:**
- Consumes: `excludeFamilyFor`, `FAMILY_GENRES` de `./audience`; `discover.withoutGenres` (Task 1).

- [ ] **Step 1: Importar de `./audience`**

En `lib/enrich.ts`, en el bloque de imports (cerca de la línea 13, junto a `import { topVotedRows } from "./votes";`), agregar:

```ts
import { excludeFamilyFor, FAMILY_GENRES } from "./audience";
```

- [ ] **Step 2: Aplicar la exclusión en la llamada a `discover`**

En `listByCategory`, la llamada a `discover` (líneas 85-91) es:

```ts
  const res = await discover(opts.tipo, {
    providers: ids,
    genres: genres.length ? genres : undefined,
    keywords: keywords.length ? keywords : undefined,
    originCountry: opts.country || rule.originCountry,
    page: opts.page, sortBy: opts.sortBy, minVotes: opts.minVotes, extra,
  });
```

Reemplazarla por (agrega `withoutGenres`):

```ts
  const res = await discover(opts.tipo, {
    providers: ids,
    genres: genres.length ? genres : undefined,
    keywords: keywords.length ? keywords : undefined,
    withoutGenres: excludeFamilyFor(opts.genre) ? FAMILY_GENRES : undefined,
    originCountry: opts.country || rule.originCountry,
    page: opts.page, sortBy: opts.sortBy, minVotes: opts.minVotes, extra,
  });
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 4: Verificar por endpoint (con el dev server corriendo)**

Comedia no debe traer dibujos infantiles; animacion (exenta) sí conserva family:

```bash
curl -s "http://localhost:3000/api/discover?tipo=tv&genre=comedia&providers=n,d,m,p,pp,at,mb,cr,sp" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log((JSON.parse(s).items||[]).map(t=>t.title).join(" | ")))'
```
Expected: sin Peppa Pig / Paw Patrol / Barrio Sésamo (títulos de género Kids).

```bash
curl -s "http://localhost:3000/api/discover?tipo=tv&genre=animacion&providers=n,d,m,p,pp,at,mb,cr,sp" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log((JSON.parse(s).items||[]).length+" items"))'
```
Expected: >0 (animacion exenta, conserva su catálogo).

- [ ] **Step 5: Commit**

```bash
git add lib/enrich.ts
git commit -m "feat(audience): excluir family de géneros adultos en listByCategory"
```

---

### Task 3: `audienceTitles` + endpoint `/api/audience`

**Files:**
- Modify: `lib/enrich.ts` (nueva función `audienceTitles`, agregar cerca de `mostVoted`/`recommendations`)
- Create: `app/api/audience/route.ts`

**Interfaces:**
- Consumes: `audienceRule` de `./audience` (Task 1); `discover`, `codesToTmdbIds`, `toUITitle`, `publishedIds` (ya en enrich).
- Produces: `audienceTitles(slug: string, providers: PlatformCode[]): Promise<UITitle[]>`.

- [ ] **Step 1: Importar `audienceRule`**

En `lib/enrich.ts`, cambiar el import de `./audience` (de Task 2) para incluir `audienceRule`:

```ts
import { excludeFamilyFor, FAMILY_GENRES, audienceRule } from "./audience";
```

- [ ] **Step 2: Agregar `audienceTitles`**

En `lib/enrich.ts`, después de la función `recommendations` (termina ~línea 120), agregar:

```ts
// --- Carruseles de audiencia (family / adult-anime): receta de lib/audience,
// movie+tv mergeados, filtrado a plataformas. Server-side, cero costo por título.
export async function audienceTitles(slug: string, providers: PlatformCode[]): Promise<UITitle[]> {
  const ids = codesToTmdbIds(providers);
  if (!ids.length) return [];
  const types: MediaType[] = ["movie", "tv"];
  const pools = await Promise.all(types.map(async (tp) => {
    const rule = audienceRule(slug, tp);
    if (!rule) return [] as UITitle[];
    const extra: Record<string, string> = {};
    if (rule.certLte) { extra.certification_country = "US"; extra["certification.lte"] = rule.certLte; }
    if (rule.certGte) { extra.certification_country = "US"; extra["certification.gte"] = rule.certGte; }
    const res = await discover(tp, {
      providers: ids,
      genres: rule.genres,
      withoutGenres: rule.withoutGenres,
      extra: Object.keys(extra).length ? extra : undefined,
    });
    const pub = await publishedIds(tp);
    const items = await Promise.all(res.results.slice(0, 20).map((t) => toUITitle(t, tp, pub)));
    return items.filter((i) => i.platforms.length > 0);
  }));
  return pools.flat();
}
```

- [ ] **Step 3: Crear `app/api/audience/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { audienceTitles } from "@/lib/enrich";
import type { PlatformCode } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const a = req.nextUrl.searchParams.get("a") || "";
  const providers = (req.nextUrl.searchParams.get("providers")?.split(",").filter(Boolean) || []) as PlatformCode[];
  try {
    return NextResponse.json({ items: await audienceTitles(a, providers) });
  } catch (e) {
    return NextResponse.json({ error: String(e), items: [] }, { status: 500 });
  }
}
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 5: Verificar por endpoint**

```bash
curl -s "http://localhost:3000/api/audience?a=family&providers=n,d,m,p,pp,at,mb,cr,sp" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const i=JSON.parse(s).items||[];console.log(i.length+" → "+i.slice(0,6).map(t=>t.title).join(" | "))})'
```
Expected: títulos family (Toy Story, Peppa Pig, etc.), n>0.

```bash
curl -s "http://localhost:3000/api/audience?a=adult-anime&providers=n,d,m,p,pp,at,mb,cr,sp" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const i=JSON.parse(s).items||[];console.log(i.length+" → "+i.slice(0,6).map(t=>t.title).join(" | "))})'
```
Expected: anime/animación adulta (Rick y Morty, Demon Slayer, etc.), n>0.

- [ ] **Step 6: Commit**

```bash
git add lib/enrich.ts app/api/audience/route.ts
git commit -m "feat(audience): audienceTitles + endpoint /api/audience (carruseles family/adult-anime)"
```

---

### Task 4: Home — +2 carruseles, −Directores

**Files:**
- Modify: `components/CatalogView.tsx`

**Interfaces:**
- Consumes: `/api/audience?a=…` (Task 3); `Shelf` (sin cambios de firma).

- [ ] **Step 1: Reescribir el bloque de rieles + imports**

Reemplazar TODO el contenido de `components/CatalogView.tsx` por:

```tsx
"use client";
import { useState, useCallback } from "react";
import Shelf from "./Shelf";
import IndecisoHero from "./IndecisoHero";
import DesempateBanner from "./desempate/DesempateBanner";
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
        <Shelf title="🍿 Para toda la familia" url="/api/audience?a=family" />
        <Shelf title="🎬 Animación para adultos" url="/api/audience?a=adult-anime" />
      </div>
    </>
  );
}
```

(Cambios: se quita el import y el uso de `PersonRail` (riel Directores); se agregan los 2 `<Shelf>` de audiencia tras el `SHELVES.map`, mismo componente, sin `seeAllHref` porque no hay página de lista.)

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Verificación visual**

```bash
npm run dev
```

En el Home confirmar:
- Los carruseles de género (Comedia, Terror, etc.) sin dibujos infantiles.
- Tras Documental aparecen **🍿 Para toda la familia** (Toy Story, Peppa…) y **🎬 Animación para adultos** (Rick y Morty, Demon Slayer…), mismo card/riel.
- **No** está el riel Directores.
- `/categoria/animacion` conserva contenido familiar (exento).

- [ ] **Step 4: Commit**

```bash
git add components/CatalogView.tsx
git commit -m "feat(audience): Home suma carruseles Familia y Animación adultos; saca Directores"
```

---

## Self-Review (hecho al escribir el plan)

- **Cobertura del spec:** módulo único (Task 1), exclusión family en 1 punto que cubre todo el browsing (Task 2), 2 carruseles + endpoint (Task 3), Home +2/−Directores (Task 4). Exención animacion/familiar por `excludeFamilyFor` (Task 1/2). content_type diferido (no-objetivo). ✔
- **Sin placeholders:** código completo; IDs de género validados; recetas de `AUDIENCES` con IDs confirmados. ✔
- **Consistencia:** `excludeFamilyFor`/`FAMILY_GENRES`/`audienceRule`/`AudienceRule` definidos en Task 1 y usados igual en Task 2/3; `DiscoverOpts.withoutGenres` (Task 1) usado en Task 2/3; `audienceTitles(slug, providers)` (Task 3) llamado por el endpoint y consumido por el Home vía `/api/audience?a=` (Task 4). ✔
- **No rompe:** queries sin género (latest, recomendador "todos") no reciben exclusión (`excludeFamilyFor` false); pipeline y firmas existentes intactos. ✔
