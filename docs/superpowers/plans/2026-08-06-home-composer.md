# Home Composer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralizar la construcción del Home en un único servicio (`lib/home.ts` + `/api/home`) que arma todos los carruseles en orden de prioridad, elimina títulos duplicados entre ellos y rellena cada riel hasta completar las tarjetas configuradas.

**Architecture:** Pipeline server-side `TMDB → Audience Filter (ya existe) → Home Composer → Dedup → [hook rotación] → [hook personalización] → JSON`. El composer pide candidatos con buffer (2 páginas de discover), deduplica **sobre los raw de TMDB antes de enriquecer** (así el costo de `providersOf` no se multiplica), y solo pide una página extra si tras el filtrado un riel quedó corto. El cliente pasa de 11 fetches paralelos a 1 fetch a `/api/home`; `Shelf` gana un modo controlado (recibe `items` por prop) manteniendo intacto su modo actual de fetch propio, que `CategoryView` sigue usando.

**Tech Stack:** Next.js 14 App Router, TypeScript, TMDB v4 (Bearer), Upstash Redis (cache), Supabase (votos/reseñas).

## Global Constraints

- **Alcance:** la deduplicación aplica **únicamente al Home**. No tocar páginas de género (`/categoria/[slug]`), buscador, resultados de búsqueda, fichas, `/api/recomendaciones`, ni ninguna API existente.
- **No modificar la lógica de audiencia** (`lib/audience.ts`, `audienceTitles`, `EXCLUDED_FROM_GENERAL_GENRES`). El composer consume su salida, no la cambia.
- **`Próximamente` (`UpcomingSection`) queda fuera del algoritmo**: no reserva ni es filtrado. No se toca.
- **`Desempatá` (`DesempateBanner`) queda fuera**: no reserva ni es filtrado. No se toca.
- **`Para vos hoy` (hero) participa con la prioridad más alta**: reserva sus títulos y no se filtra por nadie.
- **Identidad de un título:** `` `${type}:${id}` `` (tmdb_id + media_type). **Nunca por nombre.**
- **Orden de prioridad = orden visual del Home**, exactamente el actual.
- `VISIBLE_CARDS = 20`, `FETCH_BUFFER = 2` (páginas de discover). Página extra solo como fallback.
- Al cambiar el toggle Películas/Series de cualquier riel, **el Home se reconstruye entero**.
- No romper: cache Redis, SSR/CSR, loading states, `OfflineState`, tipado (`npx tsc --noEmit` en 0).
- Todo el texto de UI en español rioplatense. Sin CSS-in-JS: estilos en `app/globals.css`.
- El repo **no tiene framework de tests**. La verificación de cada tarea es un script Node ejecutable contra la API local (`node scripts/…` o el scratchpad) cuya salida se compara con lo esperado.

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| **Create** `lib/home.ts` | HomeComposer: config, tipos del payload, pipeline, dedup, hooks de rotación/personalización. Único lugar donde vive el orden del Home. |
| **Modify** `lib/enrich.ts` | +2 exports: `categoryCandidates` (raw sin enriquecer, N páginas) y `enrichRaw` (raw → UITitle + filtro de plataformas). Sin tocar las funciones existentes. |
| **Create** `app/api/home/route.ts` | Ruta fina: parsea `providers` y `t` (tipos por riel), llama `composeHome`. |
| **Modify** `components/Shelf.tsx` | Modo controlado: si viene `items`, no fetchea. Modo actual intacto (lo usa `CategoryView`). |
| **Modify** `components/CatalogView.tsx` | Un fetch a `/api/home`; renderiza los rieles del payload; centraliza los toggles. |
| **Create** `hooks/useHomeTypes.ts` | Lee/escribe los toggles de todos los rieles (mismas claves `localStorage` que `useShelfType`) y los serializa para la URL. |
| **Modify** `components/IndecisoHero.tsx` | Acepta `initialItems` del payload para el estado base; los chips y "Mostrame otras" siguen usando `/api/recomendaciones` sin cambios. |

**Decisión de diseño registrada:** el hero reserva **solo su estado base** (`genre=todos`, `offset=0`, 6 títulos). Los chips y "Mostrame otras" son exploración puntual y **no** rearman el Home — si lo hicieran, tocar un chip reordenaría toda la página.

---

### Task 1: `lib/enrich.ts` — candidatos crudos y enriquecido por separado

**Files:**
- Modify: `lib/enrich.ts` (agregar 2 exports; no tocar lo existente)
- Verify: `scripts/verify-home.mjs` (crear en Task 5; acá se verifica por `tsc` + un script ad-hoc)

**Interfaces:**
- Consumes: `discover`, `RawTitle`, `publishedIds`, `toUITitle`, `onUserPlatforms`, `resolveCategory`, `excludeFamilyFor`, `EXCLUDED_FROM_GENERAL_GENRES` (todos ya existen en el archivo).
- Produces:
  - `categoryCandidates(opts: { tipo: MediaType; genre?: string; providers: PlatformCode[]; pages?: number; sortBy?: string; minVotes?: number; extra?: Record<string,string> }): Promise<RawTitle[]>`
  - `enrichRaw(raws: RawTitle[], tipo: MediaType, providers: PlatformCode[]): Promise<UITitle[]>`
  - `export type { RawTitle }` desde `lib/enrich.ts` para que `lib/home.ts` no importe `lib/tmdb.ts` directo.

- [ ] **Step 1: Agregar `categoryCandidates` al final de `lib/enrich.ts`, antes de `export { categoryLabel }`**

```ts
// --- Candidatos crudos para el Home Composer ---
// Devuelve los RawTitle de TMDB SIN enriquecer (sin providersOf, que es la
// llamada cara: 1 request por título). El composer deduplica sobre estos raw y
// recién enriquece lo que va a mostrar. Mismas reglas de género/audiencia que
// listByCategory — se comparte la construcción del query para no divergir.
export async function categoryCandidates(opts: {
  tipo: MediaType; genre?: string; providers: PlatformCode[];
  pages?: number; sortBy?: string; minVotes?: number; extra?: Record<string, string>;
}): Promise<RawTitle[]> {
  if (!opts.providers.length) return [];
  const ids = codesToTmdbIds(opts.providers);
  const rule = opts.genre && opts.genre !== "todos" ? resolveCategory(opts.genre, opts.tipo) : {};
  const pages = Math.max(1, opts.pages ?? 1);

  const reqs = Array.from({ length: pages }, (_, i) =>
    discover(opts.tipo, {
      providers: ids,
      genres: rule.genres?.length ? rule.genres : undefined,
      keywords: rule.keywords?.length ? rule.keywords : undefined,
      withoutGenres: excludeFamilyFor(opts.genre) ? EXCLUDED_FROM_GENERAL_GENRES : undefined,
      originCountry: rule.originCountry,
      page: i + 1, sortBy: opts.sortBy, minVotes: opts.minVotes, extra: opts.extra,
    }),
  );
  const res = await Promise.all(reqs);
  return res.flatMap((r) => r.results);
}

// Enriquece una tanda de raw (providers por título, cacheado) y filtra a las
// plataformas del usuario. Contraparte de categoryCandidates.
export async function enrichRaw(
  raws: RawTitle[], tipo: MediaType, providers: PlatformCode[],
): Promise<UITitle[]> {
  if (!raws.length) return [];
  const pub = await publishedIds(tipo);
  const items = await Promise.all(raws.map((t) => toUITitle(t, tipo, pub)));
  return items.filter((i) => onUserPlatforms(i, providers));
}
```

- [ ] **Step 2: Re-exportar el tipo `RawTitle`**

En `lib/enrich.ts`, cambiar la última línea:

```ts
export { categoryLabel };
export type { RawTitle };
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin salida (0 errores).

- [ ] **Step 4: Verificar que `categoryCandidates` trae 40 con `pages: 2` y que el filtro de animación sigue aplicado**

Crear `C:\...\scratchpad\t1.mjs` no aplica (es TS server-side). Verificar vía la ruta existente en Task 2. Por ahora, chequeo estático:

Run: `grep -n "categoryCandidates\|enrichRaw\|export type { RawTitle }" lib/enrich.ts`
Expected: 3 coincidencias, una por símbolo nuevo.

- [ ] **Step 5: Commit**

```bash
git add lib/enrich.ts
git commit -m "feat(home): separar candidatos crudos del enriquecido en enrich"
```

---

### Task 2: `lib/home.ts` — el Composer

**Files:**
- Create: `lib/home.ts`

**Interfaces:**
- Consumes: `categoryCandidates`, `enrichRaw`, `latestReleases`, `mostVoted`, `mostPanned`, `audienceTitles`, `recommendations` (de `lib/enrich.ts`); `SHELVES`-equivalente local; `UITitle`, `MediaType`, `PlatformCode` (de `lib/types.ts`).
- Produces:
  - `VISIBLE_CARDS = 20`, `FETCH_BUFFER = 2`
  - `interface HomeRail { key: string; title?: string; genre?: string; items: UITitle[]; seeAllHref?: string; typeToggle?: "refetch" | "filter"; shelfKey?: string; activeType?: MediaType }`
  - `interface HomePayload { hero: UITitle[]; rails: HomeRail[] }`
  - `composeHome(opts: { providers: PlatformCode[]; types?: Record<string, MediaType> }): Promise<HomePayload>`
  - `HOME_GENRES: string[]` (el orden de los rieles de género)

- [ ] **Step 1: Crear `lib/home.ts` completo**

```ts
// Home Composer — pipeline que arma TODO el Home en un solo lugar.
//
//   TMDB → Audience Filter (lib/audience.ts, ya existente)
//        → Compose (orden + prioridad)
//        → Dedup (tmdb_id + media_type)
//        → [rotate: reservado, hoy identidad]
//        → [personalize: reservado, hoy identidad]
//        → HomePayload
//
// Reglas (ver docs/superpowers/plans/2026-08-06-home-composer.md):
//  - Un título aparece UNA sola vez en todo el Home.
//  - La prioridad es el orden visual: lo que toma un riel se lo quita a los de abajo.
//  - "Para vos hoy" (hero) tiene la prioridad más alta y reserva sus títulos.
//  - "Próximamente" y "Desempatá" NO participan (no reservan ni se filtran):
//    no se construyen acá, siguen siendo sus propios componentes.
//  - Si un riel pierde ítems por dedup, se rellena con más candidatos hasta
//    completar VISIBLE_CARDS. Página extra de TMDB solo como fallback.
import {
  categoryCandidates, enrichRaw, latestReleases, mostVoted, mostPanned,
  audienceTitles, recommendations, type RawTitle,
} from "./enrich";
import type { MediaType, PlatformCode, UITitle } from "./types";

export const VISIBLE_CARDS = 20;
// Páginas de discover que se piden de entrada (20 por página). Con 2 (=40
// candidatos) se cubre el peor solapamiento medido (7 de 20). La 3ª página solo
// se pide si tras dedup + filtro de plataformas el riel quedó corto.
export const FETCH_BUFFER = 2;

// Orden de los rieles de género en el Home. Fuente de verdad: antes vivía en
// components/data.ts (SHELVES); acá manda el composer.
export const HOME_GENRES = ["accion", "scifi", "terror", "drama", "comedia", "documental"];

// Tipo por defecto de cada riel de género: alterna movie/tv como hoy.
export const defaultTypeFor = (genre: string): MediaType =>
  HOME_GENRES.indexOf(genre) % 2 === 0 ? "movie" : "tv";

export interface HomeRail {
  key: string;
  title?: string;
  genre?: string;
  items: UITitle[];
  seeAllHref?: string;
  typeToggle?: "refetch" | "filter";
  shelfKey?: string;
  activeType?: MediaType;
}

export interface HomePayload {
  hero: UITitle[];
  rails: HomeRail[];
}

const keyOf = (t: { id: number; type: MediaType }) => `${t.type}:${t.id}`;
const rawKey = (t: RawTitle, tipo: MediaType) => `${tipo}:${t.id}`;

// --- Etapa: Dedup -----------------------------------------------------------
// Reserva las claves de `items` en `used` y devuelve solo las no vistas.
function take(items: UITitle[], used: Set<string>, limit = VISIBLE_CARDS): UITitle[] {
  const out: UITitle[] = [];
  for (const t of items) {
    const k = keyOf(t);
    if (used.has(k)) continue;
    used.add(k);
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

// --- Etapa: Source (con buffer y relleno) ------------------------------------
// Trae candidatos crudos, descarta los ya usados ANTES de enriquecer (que es lo
// caro: 1 request de providers por título), enriquece con margen, filtra a las
// plataformas y completa VISIBLE_CARDS. Si no alcanza, pide una página más.
async function genreRail(
  genre: string, tipo: MediaType, providers: PlatformCode[], used: Set<string>,
): Promise<UITitle[]> {
  const out: UITitle[] = [];
  // Vuelta 0: el buffer inicial (páginas 1..FETCH_BUFFER).
  // Vuelta 1 (fallback, solo si quedó corto): una página más.
  let pages = FETCH_BUFFER;

  for (let vuelta = 0; vuelta < 2 && out.length < VISIBLE_CARDS; vuelta++) {
    const raws = await categoryCandidates({ tipo, genre, providers, pages });
    // Dedup sobre raw: contra lo ya usado por rieles anteriores y contra lo que
    // este mismo riel ya tomó en la vuelta previa.
    const frescos = raws.filter((r) => !used.has(rawKey(r, tipo)));
    if (!frescos.length) break;
    // Margen del 40% para absorber lo que se caiga por el filtro de plataformas.
    const faltan = VISIBLE_CARDS - out.length;
    const tanda = frescos.slice(0, Math.ceil(faltan * 1.4));
    const enriquecidos = await enrichRaw(tanda, tipo, providers);
    out.push(...take(enriquecidos, used, faltan));
    pages += 1; // fallback: una página más allá del buffer
  }
  return out;
}

// --- Etapas reservadas (hoy identidad) --------------------------------------
// Puntos de extensión ya cableados en el pipeline para no tener que volver a
// tocar la estructura cuando se implementen. NO implementar todavía.
function rotate(rails: HomeRail[]): HomeRail[] { return rails; }
function personalize(rails: HomeRail[]): HomeRail[] { return rails; }

// --- Pipeline ---------------------------------------------------------------
export async function composeHome(opts: {
  providers: PlatformCode[];
  types?: Record<string, MediaType>;
}): Promise<HomePayload> {
  const { providers } = opts;
  const types = opts.types ?? {};
  const used = new Set<string>();

  if (!providers.length) return { hero: [], rails: [] };

  // 1. Hero "Para vos hoy" — prioridad más alta, reserva sus títulos.
  //    Solo el estado base (genre=todos, offset=0): los chips y "Mostrame otras"
  //    son exploración puntual y no rearman el Home.
  const heroRaw = await recommendations({ tipo: "all", providers, n: 6, offset: 0 });
  const hero = take(heroRaw, used, 6);

  // 2. Últimos lanzamientos. Sin toggle (hoy es solo movie, por fecha de estreno).
  const latest = take(await latestReleases(providers, "movie"), used);

  // 3. Votos. Vienen de la DB (hasta 60 filas), ya hay margen para deduplicar.
  //    Modo "filter": la lista es mixta movie+tv y el cliente acota por tipo, así
  //    que acá NO se corta a VISIBLE_CARDS por tipo.
  const votados = take(await mostVoted(providers), used, VISIBLE_CARDS * 2);
  const cargo = take(await mostPanned(providers), used, VISIBLE_CARDS * 2);

  // 4. Rieles de género, en orden. Cada uno deduplica contra todo lo anterior.
  const generos: HomeRail[] = [];
  for (const g of HOME_GENRES) {
    const tipo = types[g] ?? defaultTypeFor(g);
    generos.push({
      key: `genre:${g}`,
      genre: g,
      items: await genreRail(g, tipo, providers, used),
      typeToggle: "refetch",
      shelfKey: g,
      activeType: tipo,
      seeAllHref: `/categoria/${g}?tipo=${tipo}`,
    });
  }

  // 5. Audiencia. NO se toca su lógica (lib/audience.ts): se consume su salida
  //    y solo se deduplica. Devuelve movie+tv mergeados (~40), hay margen.
  const family = take(await audienceTitles("family", providers), used);
  const anime = take(await audienceTitles("adult-anime", providers), used);

  const rails: HomeRail[] = [
    { key: "ultimos", title: "Últimos lanzamientos", items: latest, seeAllHref: "/lista/ultimos" },
    { key: "mas-votados", title: "Lo más votados", items: votados, seeAllHref: "/lista/mas-votados", typeToggle: "filter", shelfKey: "mas-votados", activeType: types["mas-votados"] ?? "movie" },
    { key: "hacete-cargo", title: "Hacete cargo", items: cargo, seeAllHref: "/lista/hacete-cargo", typeToggle: "filter", shelfKey: "hacete-cargo", activeType: types["hacete-cargo"] ?? "movie" },
    ...generos,
    { key: "family", title: "🍿 Para toda la familia", items: family, seeAllHref: "/lista/familia" },
    { key: "adult-anime", title: "🎬 Animación para adultos", items: anime, seeAllHref: "/lista/anime-adulto" },
  ];

  return { hero, rails: personalize(rotate(rails)) };
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin salida.

- [ ] **Step 3: Commit**

```bash
git add lib/home.ts
git commit -m "feat(home): HomeComposer con pipeline y dedup por tmdb_id+media_type"
```

---

### Task 3: `app/api/home/route.ts` — el endpoint

**Files:**
- Create: `app/api/home/route.ts`

**Interfaces:**
- Consumes: `composeHome` de `lib/home.ts`; `PlatformCode` de `lib/types.ts`.
- Produces: `GET /api/home?providers=n,d,m&t=accion:movie,scifi:tv` → `HomePayload`.

- [ ] **Step 1: Crear la ruta**

```ts
import { NextRequest, NextResponse } from "next/server";
import { composeHome } from "@/lib/home";
import type { MediaType, PlatformCode } from "@/lib/types";

export const dynamic = "force-dynamic";

// `t` serializa el toggle Películas/Series de cada riel: "accion:movie,scifi:tv".
// Cambiar cualquiera reconstruye el Home entero (misma URL, otro valor de `t`).
function parseTypes(raw: string | null): Record<string, MediaType> {
  const out: Record<string, MediaType> = {};
  for (const par of raw?.split(",").filter(Boolean) ?? []) {
    const [k, v] = par.split(":");
    if (k && (v === "movie" || v === "tv")) out[k] = v;
  }
  return out;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const providers = (sp.get("providers")?.split(",").filter(Boolean) ?? []) as PlatformCode[];
  try {
    return NextResponse.json(await composeHome({ providers, types: parseTypes(sp.get("t")) }));
  } catch (e) {
    return NextResponse.json({ error: String(e), hero: [], rails: [] }, { status: 500 });
  }
}
```

- [ ] **Step 2: Levantar el dev server y verificar que hay CERO duplicados**

Crear `scripts/verify-home.mjs`:

```js
// Verifica las reglas del Home Composer contra la API local.
// Uso: node scripts/verify-home.mjs
const P = process.env.SC_PROVIDERS || "n,d,m,st,pv,ap";
const r = await fetch(`http://localhost:3000/api/home?providers=${P}`);
const j = await r.json();
if (j.error) { console.error("ERROR:", j.error); process.exit(1); }

const key = (t) => `${t.type}:${t.id}`;
const seen = new Map();
let dupes = 0;

const secciones = [["Para vos hoy", j.hero], ...j.rails.map((x) => [x.title || x.genre, x.items])];
console.log("sección".padEnd(26), "items".padStart(6), "dupes".padStart(6));
console.log("-".repeat(42));
for (const [nombre, items] of secciones) {
  let d = 0;
  for (const t of items) {
    const k = key(t);
    if (seen.has(k)) { d++; dupes++; console.error(`  DUP: ${t.title} ya estaba en "${seen.get(k)}"`); }
    else seen.set(k, nombre);
  }
  console.log(nombre.padEnd(26), String(items.length).padStart(6), String(d).padStart(6));
}
console.log("-".repeat(42));
console.log(`únicos: ${seen.size} | duplicados: ${dupes}`);

// Reglas duras
const cortos = j.rails.filter((x) => x.key.startsWith("genre:") && x.items.length < 20);
if (cortos.length) console.error(`FALLA: rieles de género con menos de 20: ${cortos.map((c) => `${c.genre}(${c.items.length})`).join(", ")}`);
if (dupes) console.error(`FALLA: ${dupes} duplicados`);
process.exit(dupes || cortos.length ? 1 : 0);
```

Run: `node scripts/verify-home.mjs`
Expected: `duplicados: 0`, ningún riel de género con menos de 20, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add app/api/home/route.ts scripts/verify-home.mjs
git commit -m "feat(home): endpoint /api/home + script de verificación"
```

---

### Task 4: `components/Shelf.tsx` — modo controlado

**Files:**
- Modify: `components/Shelf.tsx:19-58`

**Interfaces:**
- Consumes: `UITitle`, `MediaType`.
- Produces: prop nueva `items?: UITitle[]`. Cuando viene, `Shelf` **no fetchea** y usa esos items. Cuando no viene, el comportamiento es idéntico al actual (lo usa `CategoryView`, que no cambia).

- [ ] **Step 1: Agregar la prop `items` a la firma**

En la destructuración de props (línea 20) agregar `items: controlled,` y en el tipo (línea 22-32) agregar:

```ts
  // Modo controlado: si viene, el riel no fetchea y renderiza estos items.
  // Lo usa el Home (payload de /api/home). Sin esta prop, fetchea como siempre
  // (CategoryView depende de ese modo).
  items?: UITitle[];
```

- [ ] **Step 2: Saltear el fetch cuando es controlado**

Reemplazar el bloque de `buildUrl` + `useApi` (líneas 46-58) por:

```ts
  const controladoPor = controlled !== undefined;
  const buildUrl = () =>
    url
      ? `${url}${url.includes("?") ? "&" : "?"}providers=${platforms.join(",")}`
      : `/api/discover?tipo=${effectiveTipo}&genre=${genre}&providers=${platforms.join(",")}${country ? `&country=${country}` : ""}`;
  // En modo controlado no se dispara ningún fetch: se pasa una URL vacía y el
  // hook queda inerte (useApi no fetchea con string vacío).
  const { data, loading: fetchLoading, offline } = useApi<{ items: UITitle[] }>(
    () => (controladoPor ? "" : buildUrl()), [effectiveTipo, genre, country, url, controladoPor],
  );

  const loading = controladoPor ? false : fetchLoading;
  const rawItems = controladoPor ? controlled : (data?.items ?? []);
```

- [ ] **Step 3: Hacer que `useApi` ignore la URL vacía**

En `components/useApi.ts`, dentro del `useEffect` (línea 28), después de `if (!ready) return;` agregar:

```ts
    const u = url();
    // URL vacía = riel en modo controlado (los items vienen por prop): no hay
    // nada que pedir y tampoco hay que quedar en loading para siempre.
    if (!u) { setLoading(false); return; }
```

y cambiar `fetch(url())` por `fetch(u)`.

- [ ] **Step 4: Verificar que compila y que `/categoria/[slug]` sigue andando**

Run: `npx tsc --noEmit`
Expected: sin salida.

Con el dev server arriba:
Run: `curl -s "http://localhost:3000/categoria/accion" -o /dev/null -w "%{http_code}\n"`
Expected: `200`

- [ ] **Step 5: Commit**

```bash
git add components/Shelf.tsx components/useApi.ts
git commit -m "feat(home): modo controlado en Shelf (items por prop)"
```

---

### Task 5: `hooks/useHomeTypes.ts` + `CatalogView` consumiendo `/api/home`

**Files:**
- Create: `hooks/useHomeTypes.ts`
- Modify: `components/CatalogView.tsx` (completo)
- Modify: `components/IndecisoHero.tsx:34-45`

**Interfaces:**
- Consumes: `HomePayload`, `HomeRail`, `HOME_GENRES`, `defaultTypeFor` de `lib/home.ts`; `useApi`; `useShelfType` (para las mismas claves de `localStorage`).
- Produces: `useHomeTypes(): { types: Record<string, MediaType>; setType: (key: string, t: MediaType) => void; param: string }`.

- [ ] **Step 1: Crear `hooks/useHomeTypes.ts`**

```ts
"use client";
import { useCallback, useEffect, useState } from "react";
import { HOME_GENRES, defaultTypeFor } from "@/lib/home";
import type { MediaType } from "@/lib/types";

// Claves con toggle en el Home: los 6 géneros + los 2 rieles de votos.
const TOGGLE_KEYS = [...HOME_GENRES, "mas-votados", "hacete-cargo"];
// MISMA clave y MISMO formato que hooks/useShelfType.ts: un único objeto JSON
// { [shelfKey]: "movie" | "tv" }. Si se usara una clave por riel, el usuario
// perdería la preferencia que ya tenía guardada.
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

const defaultFor = (k: string): MediaType =>
  HOME_GENRES.includes(k) ? defaultTypeFor(k) : "movie";

// Estado centralizado de los toggles Películas/Series del Home. Antes vivía en
// cada Shelf (useShelfType); ahora el Home se reconstruye entero al cambiar
// cualquiera, así que el estado tiene que estar arriba.
export function useHomeTypes() {
  const [types, setTypes] = useState<Record<string, MediaType>>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const store = readStore();
    const out: Record<string, MediaType> = {};
    for (const k of TOGGLE_KEYS) {
      const v = store[k];
      out[k] = v === "movie" || v === "tv" ? v : defaultFor(k);
    }
    setTypes(out);
    setReady(true);
  }, []);

  const setType = useCallback((k: string, t: MediaType) => {
    setTypes((prev) => ({ ...prev, [k]: t }));
    try {
      const store = readStore();
      store[k] = t;
      localStorage.setItem(KEY, JSON.stringify(store));
    } catch {
      /* localStorage no disponible: no persiste, no rompe */
    }
  }, []);

  // Serialización para /api/home?t=...
  const param = TOGGLE_KEYS.map((k) => `${k}:${types[k] ?? defaultFor(k)}`).join(",");

  return { types, setType, param, ready };
}
```

**Verificado:** `hooks/useShelfType.ts:8` usa `KEY = "yump:shelf-type"` con un único objeto JSON `{ [shelfKey]: MediaType }`. El hook nuevo lee y escribe ese mismo formato, así que la preferencia ya guardada por el usuario se respeta.

- [ ] **Step 2: Reescribir `components/CatalogView.tsx`**

```tsx
"use client";
import Shelf from "./Shelf";
import IndecisoHero from "./IndecisoHero";
import DesempateBanner from "./desempate/DesempateBanner";
import UpcomingSection from "./upcoming/UpcomingSection";
import OfflineState from "./pwa/OfflineState";
import { useOnline } from "@/hooks/useOnline";
import { useApi } from "./useApi";
import { usePlatforms } from "./PlatformsContext";
import { useHomeTypes } from "@/hooks/useHomeTypes";
import type { HomePayload } from "@/lib/home";

// El Home se arma entero en el server (lib/home.ts): un solo fetch a /api/home
// devuelve el hero y todos los rieles ya deduplicados y en orden. Los rieles son
// presentacionales (Shelf en modo controlado). "Próximamente" y "Desempatá"
// quedan fuera del composer a propósito: no reservan ni se filtran.
export default function CatalogView() {
  const online = useOnline();
  const { platforms } = usePlatforms();
  const { setType, param, ready } = useHomeTypes();

  const { data, loading, offline } = useApi<HomePayload>(
    () => (ready ? `/api/home?providers=${platforms.join(",")}&t=${param}` : ""),
    [param, ready],
  );

  if (!online || offline) {
    return <div className="wrap"><OfflineState onRetry={() => location.reload()} /></div>;
  }

  const rails = data?.rails ?? [];

  return (
    <>
      <IndecisoHero initialItems={data?.hero} />
      <div className="wrap">
        <DesempateBanner />
        <UpcomingSection />
        {loading && !rails.length
          ? <div className="shelf"><span className="loading">Cargando…</span></div>
          : rails.map((r) => (
              <Shelf
                key={r.key}
                items={r.items}
                title={r.title}
                genre={r.genre}
                seeAllHref={r.seeAllHref}
                typeToggle={r.typeToggle}
                shelfKey={r.shelfKey}
                initialType={r.activeType}
                onTypeChange={(t) => setType(r.shelfKey ?? r.key, t)}
              />
            ))}
      </div>
    </>
  );
}
```

- [ ] **Step 3: Agregar `onTypeChange` a `Shelf`**

En `components/Shelf.tsx`, agregar a las props:

```ts
  // En el Home el toggle no refetchea este riel: avisa al composer, que
  // reconstruye el Home entero (decisión de diseño: el cambio de tipo es un
  // cambio de contexto de toda la pantalla).
  onTypeChange?: (t: MediaType) => void;
```

y en el render del toggle (línea 87) usar:

```tsx
{typeToggle && <ShelfTypeToggle value={activeType} onChange={(t) => { setActiveType(t); onTypeChange?.(t); }} />}
```

- [ ] **Step 4: Aceptar `initialItems` en `IndecisoHero`**

En `components/IndecisoHero.tsx`, cambiar la firma a:

```tsx
export default function IndecisoHero({ initialItems }: { initialItems?: UITitle[] }) {
```

y el cálculo de `picks` (línea 45) a:

```tsx
  // El estado base ("6 para hoy", sin chip, offset 0) viene del composer, que ya
  // reservó esos títulos para que no se repitan abajo. Al tocar un chip o
  // "Mostrame otras" se vuelve a /api/recomendaciones: es exploración puntual y
  // NO rearma el Home.
  const esBase = genre === "todos" && offset === 0;
  const picks = esBase && initialItems?.length ? initialItems : (data?.items ?? []);
```

y hacer que `useApi` no dispare en el estado base:

```tsx
  const { data, loading: fetchLoading } = useApi<{ items: UITitle[] }>(
    () => (esBase && initialItems?.length
      ? ""
      : `/api/recomendaciones?tipo=all&genre=${genre}&offset=${offset}&providers=${platforms.join(",")}`),
    [offset, genre, !!initialItems?.length],
  );
  const loading = esBase && initialItems?.length ? false : fetchLoading;
```

**Ojo:** `esBase` se usa dentro del `useApi` que se declara antes — mover la línea `const esBase = …` **arriba** de la llamada a `useApi`.

- [ ] **Step 5: Verificar compilación y el Home en el navegador**

Run: `npx tsc --noEmit`
Expected: sin salida.

Run: `node scripts/verify-home.mjs`
Expected: `duplicados: 0`, exit 0.

En el navegador (dev server arriba), en `http://localhost:3000`:
- El Home muestra hero + Desempatá + Próximamente + los 11 rieles.
- Cambiar el toggle de Acción a Series → todo el Home se reconstruye.
- Consola sin errores nuevos.

- [ ] **Step 6: Commit**

```bash
git add hooks/useHomeTypes.ts components/CatalogView.tsx components/Shelf.tsx components/IndecisoHero.tsx
git commit -m "feat(home): CatalogView consume /api/home con toggles centralizados"
```

---

### Task 6: Verificación final y documentación

**Files:**
- Modify: `CLAUDE.md` (tabla de rutas API + nota de arquitectura)

- [ ] **Step 1: Verificar que NO se rompió nada fuera del Home**

Con el dev server arriba, comprobar que siguen respondiendo igual que antes:

```bash
for u in "/api/discover?tipo=movie&genre=accion&providers=n,d,m" "/api/recomendaciones?tipo=all&genre=todos&offset=0&providers=n,d,m" "/api/audience?a=family&providers=n,d,m" "/api/mas-votados?providers=n,d,m" "/api/search?q=matrix"; do echo -n "$u -> "; curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000$u"; done
```

Expected: `200` en las 5.

- [ ] **Step 2: Verificar que la clasificación de audiencia quedó intacta**

```bash
curl -s "http://localhost:3000/api/home?providers=n,d,m,st,pv,ap" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);for(const r of j.rails){if(r.key.startsWith('genre:')){const a=r.items.filter(i=>(i.genres||[]).includes('animacion'));if(a.length)console.error('FALLA: animación en',r.genre,a.map(x=>x.title));}}console.log('ok: sin animación en rieles de género');});"
```

Expected: `ok: sin animación en rieles de género`.

- [ ] **Step 3: Build de producción**

Parar el dev server primero (el `next build` choca con `next dev` sobre el mismo `.next`).

Run: `rm -rf .next && npx next build`
Expected: `✓ Compiled successfully` y la tabla de rutas incluyendo `ƒ /api/home`.

- [ ] **Step 4: Documentar en `CLAUDE.md`**

En la tabla "Rutas API" agregar:

```markdown
| `GET /api/home` | arma el Home entero (hero + rieles) deduplicado, vía `lib/home.ts` |
```

y en "Decisiones de arquitectura que importan" agregar:

```markdown
- **El Home se arma en un solo lugar (`lib/home.ts`, "Home Composer").** Pipeline
  `TMDB → audiencia → compose → dedup → [rotación] → [personalización] → JSON`.
  Un título aparece **una sola vez** en todo el Home: la prioridad es el orden
  visual, y lo que toma un riel se lo quita a los de abajo (clave `type:id`,
  nunca el nombre). **Excepciones que no participan:** "Próximamente" y
  "Desempatá" (no reservan ni se filtran), y el hero solo reserva su estado base
  — los chips y "Mostrame otras" no rearman el Home. `rotate()` y `personalize()`
  están cableados como identidad: son los puntos de extensión, no implementados.
```

- [ ] **Step 5: Commit final**

```bash
git add CLAUDE.md
git commit -m "docs: Home Composer en CLAUDE.md"
```

---

## Self-Review

**Cobertura del spec:**

| Requisito | Task |
|---|---|
| Dedup solo en el Home | 2 (composer server-side), 5 (solo `CatalogView`) |
| No tocar género/buscador/fichas/APIs/TMDB | 4 (Shelf mantiene modo fetch), 6 Step 1 (verificación) |
| No tocar la lógica de audiencia | 2 (consume `audienceTitles` sin modificarla), 6 Step 2 |
| Próximamente fuera | 2 (no se construye en el composer), 5 (`UpcomingSection` intacto) |
| Desempatá fuera | 2, 5 (`DesempateBanner` intacto) |
| "Para vos hoy" prioridad máxima y reserva | 2 Step 1 (`take(heroRaw, used, 6)` primero) |
| Orden de prioridad = orden visual | 2 (`rails` en orden, `used` compartido secuencial) |
| Clave `tmdb_id + media_type` | 2 (`keyOf`/`rawKey`) |
| Completar siempre las tarjetas | 2 (`genreRail` con buffer + fallback de página) |
| Buffer configurable | 2 (`VISIBLE_CARDS`, `FETCH_BUFFER`) |
| Página 2 solo como fallback | 2 (segunda vuelta del `for`) |
| Toggle reconstruye todo el Home | 5 (`useHomeTypes` + `param` en la URL) |
| Servicio/pipeline preparado para rotación y personalización | 2 (`rotate`/`personalize` como identidad) |
| Sin consultas extra innecesarias | 1 (dedup sobre raw antes de enriquecer) |
| No romper cache/SSR/loading/tipado | 4, 5, 6 |

**Riesgos conocidos, marcados antes de codear:**

1. **El Home pasa de 11 fetches paralelos a 1.** El first paint del contenido va a ser más lento: hoy cada riel aparece cuando llega; ahora aparecen todos juntos. Es el costo inevitable de deduplicar respetando un orden de prioridad — no se puede saber qué le toca al riel 8 sin haber resuelto el 1 al 7. Mitigación: los rieles se resuelven en paralelo dentro del composer donde el orden lo permite, y `providersOf` está cacheado en Redis.
2. **"Pedir 60 candidatos en una sola consulta" no existe en TMDB**: devuelve 20 por página. `FETCH_BUFFER = 2` son 2 requests de discover por riel (baratas); lo caro es `providersOf` (1 por título), y por eso el dedup va **antes** de enriquecer.
3. `HOME_GENRES` duplica `SHELVES` de `components/data.ts`. El plan deja `SHELVES` en su lugar porque `data.ts` es client-safe y `lib/home.ts` es server; `CatalogView` ya no lo usa. Si más adelante nadie lo usa, se borra.
