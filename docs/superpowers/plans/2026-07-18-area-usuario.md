# Área de usuario — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir `/cuenta` en un hub de usuario (Mi lista, Me gustaron, Vistos recientemente, perfil con avatar) sobre el login ya existente, con "Mi lista" y "Ya la vi" persistidos de verdad.

**Architecture:** Enfoque A del spec — el browser lee/escribe las filas del usuario directo en Supabase con RLS (igual que `LikeButton`), y una ruta pública `/api/cards` enriquece ids sueltos a `UITitle[]` con TMDB (reusando `titleCard()`). No se toca el auth. Las listas del usuario no se filtran por plataforma.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (Postgres + RLS), DiceBear (avatares SVG generados local), TMDB vía `lib/enrich.ts`.

## Global Constraints

- Todo el texto de UI en **español rioplatense**.
- **Sin CSS-in-JS**: todo el CSS va en `app/globals.css`, reusando clases existentes; las nuevas se agregan al final del archivo.
- **`lib/enrich.ts` es el único lugar** que combina TMDB/OMDB/Supabase; las rutas API son finas (parsean params y llaman una función de enrich).
- Tipos de UI estables: `UITitle`, `UITitleDetail`, `UIPerson`, `MediaType`, `PlatformCode` en `lib/types.ts`.
- **Región fija AR** y `force-dynamic` en toda ruta API.
- **No hay test runner en el repo.** La verificación establecida es `npx tsc --noEmit` (0 errores), `npx next build` cuando el cambio es grande, y prueba manual end-to-end. Cada tarea cierra con typecheck + (donde aplica) una comprobación manual concreta + commit. No se introduce framework de tests (fuera de alcance, no pedido).
- **Requiere sesión + migración aplicada** para probar manualmente: la Task 1 (SQL) debe estar corrida en Supabase antes de las pruebas manuales de las tareas siguientes.

---

### Task 1: Migración de schema (Supabase)

**Files:**
- Modify: `supabase/schema.sql` (agregar al final, tras la sección de `votes`)

**Interfaces:**
- Produces: tabla `user_items(user_id, tmdb_id, tipo, kind)`, tabla `view_history(user_id, tmdb_id, tipo, viewed_at)`, columna `profiles.avatar_seed`, trigger `handle_new_user()` que setea `avatar_seed` random.

- [ ] **Step 1: Agregar avatar_seed a profiles y setearlo en el trigger**

En `supabase/schema.sql`, justo después del bloque `create table ... profiles (...)` y antes de `alter table profiles enable row level security;`, agregar:

```sql
-- Avatar generado (DiceBear). Se guarda solo la semilla; el SVG se arma en el
-- cliente. Backfill determinístico para perfiles viejos: semilla = id.
alter table profiles add column if not exists avatar_seed text;
update profiles set avatar_seed = id::text where avatar_seed is null;
```

Y reemplazar el cuerpo de `handle_new_user()` para que asigne una semilla random al crear el perfil:

```sql
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, avatar_seed)
  values (new.id, new.raw_user_meta_data ->> 'display_name', gen_random_uuid()::text);
  return new;
end;
$$ language plpgsql security definer set search_path = public;
```

- [ ] **Step 2: Agregar la tabla user_items (Mi lista + Ya la vi)**

Al final del archivo, en una sección nueva:

```sql
-- ============================================================
-- ACTIVO: items del usuario. kind='list' = Mi lista;
-- kind='watched' = "Ya la vi" (base de emblemas futuros).
-- ============================================================
create table if not exists user_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  tmdb_id    integer     not null,
  tipo       text        not null check (tipo in ('movie','tv')),
  kind       text        not null check (kind in ('list','watched')),
  created_at timestamptz not null default now(),
  unique (user_id, tmdb_id, tipo, kind)
);
alter table user_items enable row level security;
drop policy if exists "cada uno gestiona sus items" on user_items;
create policy "cada uno gestiona sus items" on user_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 3: Agregar la tabla view_history (Vistos recientemente)**

```sql
-- ============================================================
-- ACTIVO: historial de fichas abiertas. Upsert por título
-- actualizando viewed_at; se lee por recencia.
-- ============================================================
create table if not exists view_history (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid        not null references auth.users (id) on delete cascade,
  tmdb_id   integer     not null,
  tipo      text        not null check (tipo in ('movie','tv')),
  viewed_at timestamptz not null default now(),
  unique (user_id, tmdb_id, tipo)
);
alter table view_history enable row level security;
drop policy if exists "cada uno gestiona su historial" on view_history;
create policy "cada uno gestiona su historial" on view_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 4: Aplicar en Supabase**

Pegar el `supabase/schema.sql` completo en el SQL editor de Supabase y ejecutarlo (es idempotente). Verificación:

Run (en el SQL editor):
```sql
select column_name from information_schema.columns where table_name='profiles' and column_name='avatar_seed';
select to_regclass('public.user_items'), to_regclass('public.view_history');
```
Expected: `avatar_seed` presente; ambas tablas devuelven su nombre (no `null`).

- [ ] **Step 5: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat(db): user_items, view_history y avatar_seed para el área de usuario"
```

---

### Task 2: Librería de avatares + dependencias

**Files:**
- Create: `lib/avatar.ts`
- Modify: `package.json` (vía npm install)

**Interfaces:**
- Produces: `avatarSvg(seed: string): string` (data URI listo para `<img src>`), `randomSeed(): string`.

- [ ] **Step 1: Instalar DiceBear**

Run:
```bash
npm install @dicebear/core @dicebear/collection
```
Expected: se agregan a `dependencies` en `package.json`, sin errores de peer deps.

- [ ] **Step 2: Crear lib/avatar.ts**

```ts
// Avatares generados con DiceBear (style fun-emoji). Solo se persiste la
// semilla en profiles.avatar_seed; el SVG se arma acá, en el cliente, sin
// llamadas de red ni assets bundleados. Cambiar de style es una línea.
import { createAvatar } from "@dicebear/core";
import { funEmoji } from "@dicebear/collection";

export function avatarSvg(seed: string): string {
  const svg = createAvatar(funEmoji, { seed: seed || "streamingcentral" }).toString();
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json lib/avatar.ts
git commit -m "feat: lib/avatar con DiceBear fun-emoji"
```

---

### Task 3: AuthContext — avatar_seed + updateAvatarSeed

**Files:**
- Modify: `components/AuthContext.tsx`

**Interfaces:**
- Consumes: `supabaseBrowser()` de `@/lib/supabase`.
- Produces: `Profile.avatar_seed: string | null`; `updateAvatarSeed(seed: string): Promise<{ error?: string }>` en el contexto.

- [ ] **Step 1: Agregar avatar_seed al tipo Profile**

En `components/AuthContext.tsx`, en la interface `Profile`:

```ts
export interface Profile {
  id: string;
  display_name: string | null;
  is_admin: boolean;
  avatar_seed: string | null;
}
```

- [ ] **Step 2: Incluir avatar_seed en loadProfile**

Cambiar el `.select(...)` y los returns de `loadProfile`:

```ts
async function loadProfile(user: User): Promise<Profile | null> {
  const { data } = await supabaseBrowser()
    .from("profiles")
    .select("id, display_name, is_admin, avatar_seed")
    .eq("id", user.id)
    .maybeSingle();
  const metaName = (user.user_metadata?.display_name as string | undefined) || null;
  if (data) {
    const p = data as Profile;
    if (!p.display_name && metaName) {
      void supabaseBrowser().from("profiles").update({ display_name: metaName }).eq("id", user.id);
      return { ...p, display_name: metaName };
    }
    return p;
  }
  return metaName ? { id: user.id, display_name: metaName, is_admin: false, avatar_seed: user.id } : null;
}
```

- [ ] **Step 3: Agregar updateAvatarSeed al contexto**

En la interface `Ctx` agregar la firma:

```ts
  updateAvatarSeed: (seed: string) => Promise<{ error?: string }>;
```

Definir la función (junto a `updateDisplayName`):

```ts
  const updateAvatarSeed = useCallback(async (seed: string) => {
    if (!user) return { error: "No hay sesión" };
    const sb = supabaseBrowser();
    const { error } = await sb.from("profiles").update({ avatar_seed: seed }).eq("id", user.id);
    if (error) return { error: error.message };
    setProfile((p) => (p ? { ...p, avatar_seed: seed } : { id: user.id, display_name: null, is_admin: false, avatar_seed: seed }));
    return {};
  }, [user]);
```

Y agregarla al `value` del provider:

```ts
    <AuthCtx.Provider value={{ user, profile, ready, signIn, signUp, signOut, updateDisplayName, updateAvatarSeed, resetPassword, updatePassword }}>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 5: Commit**

```bash
git add components/AuthContext.tsx
git commit -m "feat(auth): avatar_seed en Profile y updateAvatarSeed"
```

---

### Task 4: TopBar — círculo de avatar

**Files:**
- Modify: `components/TopBar.tsx`
- Modify: `app/globals.css` (append)

**Interfaces:**
- Consumes: `avatarSvg` de `@/lib/avatar`; `profile.avatar_seed` de `useAuth`.

- [ ] **Step 1: Reemplazar el link de cuenta por el avatar**

En `components/TopBar.tsx`, agregar el import:

```ts
import { avatarSvg } from "@/lib/avatar";
```

Reemplazar el bloque `<Link href="/cuenta" className="acct-link" ...>...</Link>` (dentro de `.topbar-top`) por:

```tsx
        {user ? (
          <Link href="/cuenta" className="acct-av" aria-label="Mi cuenta">
            <img src={avatarSvg(profile?.avatar_seed || user.id)} alt="" />
          </Link>
        ) : (
          <Link href="/cuenta" className="acct-link" aria-label="Ingresar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
            </svg>
            <span>Ingresar</span>
          </Link>
        )}
```

- [ ] **Step 2: CSS del círculo**

Agregar al final de `app/globals.css`:

```css
/* Avatar de cuenta en la topbar */
.acct-av { display: inline-flex; }
.acct-av img {
  width: 30px; height: 30px; border-radius: 50%;
  border: 2px solid var(--line, rgba(255,255,255,.15));
  background: #2A2D33; object-fit: cover; display: block;
}
.acct-av:hover img { border-color: var(--accent); }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 4: Verificación manual**

Con `npm run dev` y sesión iniciada: en la topbar arriba a la izquierda se ve un círculo con la carita del avatar (no el nombre). Deslogueado: se ve "Ingresar" con el ícono de persona. Ambos linkean a `/cuenta`.

- [ ] **Step 5: Commit**

```bash
git add components/TopBar.tsx app/globals.css
git commit -m "feat(topbar): círculo de avatar en vez del nombre"
```

---

### Task 5: Capa de datos del browser — lib/userdata.ts

**Files:**
- Create: `lib/userdata.ts`

**Interfaces:**
- Consumes: `supabaseBrowser()`, `MediaType`.
- Produces:
  - `interface ItemRef { tmdb_id: number; tipo: MediaType }`
  - `itemRefs(kind: "list" | "watched"): Promise<ItemRef[]>`
  - `hasItem(kind: "list" | "watched", ref: ItemRef): Promise<boolean>`
  - `setItem(userId: string, kind: "list" | "watched", ref: ItemRef, on: boolean): Promise<{ error?: string }>`
  - `recordView(userId: string, ref: ItemRef): Promise<void>`
  - `historyRefs(limit?: number): Promise<ItemRef[]>`
  - `likedRefs(): Promise<ItemRef[]>`

- [ ] **Step 1: Crear lib/userdata.ts**

```ts
// Acceso a los datos del usuario desde el browser (RLS: cada uno ve/gestiona
// lo suyo). Las lecturas no necesitan userId: la policy ya filtra por sesión.
// Las escrituras sí lo necesitan (columna user_id, with check auth.uid()).
"use client";
import { supabaseBrowser } from "./supabase";
import type { MediaType } from "./types";

export interface ItemRef { tmdb_id: number; tipo: MediaType }

type Kind = "list" | "watched";

function toRefs(data: unknown): ItemRef[] {
  return ((data as { tmdb_id: number; tipo: MediaType }[] | null) ?? [])
    .map((r) => ({ tmdb_id: r.tmdb_id, tipo: r.tipo }));
}

export async function itemRefs(kind: Kind): Promise<ItemRef[]> {
  const { data } = await supabaseBrowser()
    .from("user_items")
    .select("tmdb_id, tipo")
    .eq("kind", kind)
    .order("created_at", { ascending: false });
  return toRefs(data);
}

export async function hasItem(kind: Kind, ref: ItemRef): Promise<boolean> {
  const { data } = await supabaseBrowser()
    .from("user_items")
    .select("id")
    .eq("kind", kind).eq("tmdb_id", ref.tmdb_id).eq("tipo", ref.tipo)
    .maybeSingle();
  return !!data;
}

export async function setItem(userId: string, kind: Kind, ref: ItemRef, on: boolean): Promise<{ error?: string }> {
  const sb = supabaseBrowser();
  if (on) {
    const { error } = await sb.from("user_items").upsert(
      { user_id: userId, tmdb_id: ref.tmdb_id, tipo: ref.tipo, kind },
      { onConflict: "user_id,tmdb_id,tipo,kind" },
    );
    return error ? { error: error.message } : {};
  }
  const { error } = await sb.from("user_items")
    .delete()
    .eq("user_id", userId).eq("kind", kind).eq("tmdb_id", ref.tmdb_id).eq("tipo", ref.tipo);
  return error ? { error: error.message } : {};
}

export async function recordView(userId: string, ref: ItemRef): Promise<void> {
  await supabaseBrowser().from("view_history").upsert(
    { user_id: userId, tmdb_id: ref.tmdb_id, tipo: ref.tipo, viewed_at: new Date().toISOString() },
    { onConflict: "user_id,tmdb_id,tipo" },
  );
}

export async function historyRefs(limit = 40): Promise<ItemRef[]> {
  const { data } = await supabaseBrowser()
    .from("view_history")
    .select("tmdb_id, tipo")
    .order("viewed_at", { ascending: false })
    .limit(limit);
  return toRefs(data);
}

export async function likedRefs(): Promise<ItemRef[]> {
  const { data } = await supabaseBrowser()
    .from("votes")
    .select("tmdb_id, tipo")
    .in("rating", [2, 3])
    .order("created_at", { ascending: false });
  return toRefs(data);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add lib/userdata.ts
git commit -m "feat: lib/userdata (mi lista, ya la vi, historial, me gustaron)"
```

---

### Task 6: enrich.cardsByIds + ruta /api/cards

**Files:**
- Modify: `lib/enrich.ts` (agregar función, cerca de `mostVoted`)
- Create: `app/api/cards/route.ts`

**Interfaces:**
- Consumes: `titleCard(tipo, id)` y `publishedIds()` (ya usados por `mostVoted` en `enrich.ts`).
- Produces: `cardsByIds(pairs: { tipo: MediaType; id: number }[]): Promise<UITitle[]>`; ruta `GET /api/cards?items=movie:123,tv:45` → `{ items: UITitle[] }`.

- [ ] **Step 1: Agregar cardsByIds a enrich.ts**

En `lib/enrich.ts`, después de `mostPanned` (y antes de `export { categoryLabel };`):

```ts
// Enriquece una lista puntual de ids a cards. Para las listas del usuario:
// NO filtra por plataforma (la lista es del usuario, se muestra completa).
// Preserva el orden recibido.
export async function cardsByIds(pairs: { tipo: MediaType; id: number }[]): Promise<UITitle[]> {
  if (!pairs.length) return [];
  const pub = await publishedIds();
  const cards = await Promise.all(pairs.map(async (p) => {
    const c = await titleCard(p.tipo, p.id);
    if (!c) return null;
    return { ...c, hasEditorial: pub.has(`${p.id}:${p.tipo}`) } as UITitle;
  }));
  return cards.filter((c): c is UITitle => !!c);
}
```

Verificar que `MediaType` esté importado en `enrich.ts` (ya se usa `UITitle`/`PlatformCode`). Si no lo está, agregar `MediaType` al import de `./types`.

- [ ] **Step 2: Crear la ruta**

`app/api/cards/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { cardsByIds } from "@/lib/enrich";
import type { MediaType } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("items") || "";
  const pairs = raw.split(",").map((s) => s.trim()).filter(Boolean)
    .map((s) => {
      const [tipo, id] = s.split(":");
      return { tipo: tipo as MediaType, id: Number(id) };
    })
    .filter((p) => (p.tipo === "movie" || p.tipo === "tv") && Number.isFinite(p.id));
  try {
    return NextResponse.json({ items: await cardsByIds(pairs) });
  } catch (e) {
    return NextResponse.json({ error: String(e), items: [] }, { status: 500 });
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 4: Verificación manual**

Con `npm run dev`, abrir en el navegador (usar ids reales, ej. movie 27205 = Inception):
`http://localhost:3000/api/cards?items=movie:27205,tv:1396`
Expected: JSON `{ "items": [ ... ] }` con dos cards enriquecidas (title, poster, platforms, etc.), en ese orden. Ids inválidos se ignoran.

- [ ] **Step 5: Commit**

```bash
git add lib/enrich.ts app/api/cards/route.ts
git commit -m "feat(api): /api/cards enriquece ids sueltos (sin filtro de plataforma)"
```

---

### Task 7: Componente UserShelf

**Files:**
- Create: `components/UserShelf.tsx`
- Modify: `app/globals.css` (append)

**Interfaces:**
- Consumes: `useAuth`, `ItemRef` de `@/lib/userdata`, `UITitle`, `TitleCard`.
- Produces: componente `UserShelf` con props `{ title: string; href?: string; load: () => Promise<ItemRef[]>; empty?: string; full?: boolean }`.

- [ ] **Step 1: Crear components/UserShelf.tsx**

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "./AuthContext";
import TitleCard from "./TitleCard";
import type { ItemRef } from "@/lib/userdata";
import type { UITitle } from "@/lib/types";

export default function UserShelf({
  title, href, load, empty, full,
}: {
  title: string; href?: string; load: () => Promise<ItemRef[]>; empty?: string; full?: boolean;
}) {
  const { ready, user } = useAuth();
  const [items, setItems] = useState<UITitle[] | null>(null);
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ready) return;
    if (!user) { setItems([]); return; }
    let alive = true;
    (async () => {
      const refs = await load();
      if (!refs.length) { if (alive) setItems([]); return; }
      const q = refs.map((r) => `${r.tipo}:${r.tmdb_id}`).join(",");
      const res = await fetch(`/api/cards?items=${encodeURIComponent(q)}`);
      const data = await res.json().catch(() => ({ items: [] as UITitle[] }));
      if (alive) setItems((data.items as UITitle[]) ?? []);
    })();
    return () => { alive = false; };
    // load es estable por sección; el efecto depende de la sesión.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user]);

  if (items === null) {
    return <div className="shelf"><div className="shelf-head"><h2>{title}</h2></div><div className="track"><span className="loading">Cargando…</span></div></div>;
  }
  if (items.length === 0) {
    if (!empty) return null;
    return (
      <div className="shelf">
        <div className="shelf-head"><h2>{title}</h2></div>
        <p className="empty-note">{empty}</p>
      </div>
    );
  }

  const scroll = (d: number) => track.current?.scrollBy({ left: d * (track.current.clientWidth * 0.8), behavior: "smooth" });

  if (full) {
    return (
      <div className="shelf">
        <div className="shelf-head"><h2>{title}</h2></div>
        <div className="user-grid">{items.map((t) => <TitleCard key={`${t.type}-${t.id}`} t={t} />)}</div>
      </div>
    );
  }

  return (
    <div className="shelf">
      <div className="shelf-head">
        <h2>{title}</h2>
        <div className="shelf-head-r">
          {href && <Link href={href} className="vertodo">ver todo</Link>}
          <div className="arrows">
            <button className="arrow" onClick={() => scroll(-1)} aria-label="Anterior"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg></button>
            <button className="arrow" onClick={() => scroll(1)} aria-label="Siguiente"><svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg></button>
          </div>
        </div>
      </div>
      <div className="track" ref={track}>{items.map((t) => <TitleCard key={`${t.type}-${t.id}`} t={t} />)}</div>
    </div>
  );
}
```

- [ ] **Step 2: CSS**

Agregar al final de `app/globals.css`:

```css
/* Rieles del área de usuario */
.shelf-head-r { display: flex; align-items: center; gap: 12px; }
.vertodo { font-size: 13px; color: var(--accent); text-decoration: none; white-space: nowrap; }
.vertodo:hover { text-decoration: underline; }
.user-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 12px; }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores. (No verificable a solas en UI; se prueba en Task 8.)

- [ ] **Step 4: Commit**

```bash
git add components/UserShelf.tsx app/globals.css
git commit -m "feat: UserShelf (riel + grilla de listas del usuario)"
```

---

### Task 8: UserHub + rework de /cuenta

**Files:**
- Create: `components/UserHub.tsx`
- Modify: `app/cuenta/page.tsx`
- Modify: `app/globals.css` (append)

**Interfaces:**
- Consumes: `useAuth`, `avatarSvg`, `UserShelf`, `itemRefs`/`likedRefs`/`historyRefs` de `@/lib/userdata`.
- Produces: componente `UserHub`.

- [ ] **Step 1: Crear components/UserHub.tsx**

```tsx
"use client";
import Link from "next/link";
import { useAuth } from "./AuthContext";
import UserShelf from "./UserShelf";
import { avatarSvg } from "@/lib/avatar";
import { itemRefs, likedRefs, historyRefs } from "@/lib/userdata";

export default function UserHub() {
  const { user, profile } = useAuth();
  const seed = profile?.avatar_seed || user?.id || "";
  const nombre = profile?.display_name || "vos";

  return (
    <div className="wrap">
      <div className="hub-head">
        <img className="hub-av" src={avatarSvg(seed)} alt="" />
        <div>
          <h1 className="hub-hi">Hola, {nombre}</h1>
          <Link href="/cuenta/perfil" className="hub-edit">Editar perfil ›</Link>
        </div>
      </div>

      <UserShelf
        title="Mi lista" href="/cuenta/lista"
        load={() => itemRefs("list")}
        empty="Todavía no guardaste nada — tocá “Mi lista” en cualquier ficha."
      />
      <UserShelf title="Me gustaron" href="/cuenta/gustaron" load={likedRefs} />
      <UserShelf title="Vistos recientemente" href="/cuenta/vistos" load={() => historyRefs(20)} />

      <div className="hub-tiles">
        <div className="hub-tile off"><span className="lock">🔒</span><span>Mis amigos</span><small>Próximamente</small></div>
        <div className="hub-tile off"><span className="lock">🔒</span><span>Mis emblemas</span><small>Próximamente</small></div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Enrutar /cuenta al hub o al acceso**

En `app/cuenta/page.tsx`: agregar el import `import UserHub from "@/components/UserHub";`, **eliminar** el componente `Perfil` (se muda a Task 9) y su uso, y dejar el default así:

```tsx
export default function Cuenta() {
  const { user, ready, signIn, signUp, resetPassword } = useAuth();

  if (!ready) {
    return (<><TopBar /><main><div className="admin"><p className="loading">Cargando…</p></div></main><BottomNav /></>);
  }

  return (
    <>
      <TopBar />
      <main>
        {user ? (
          <UserHub />
        ) : (
          <div className="admin" style={{ maxWidth: 420 }}>
            <Acceso signIn={signIn} signUp={signUp} resetPassword={resetPassword} />
          </div>
        )}
      </main>
      <BottomNav />
    </>
  );
}
```

Quitar de la desestructuración de `useAuth()` lo que ya no se usa acá (`profile`, `signOut`, `updateDisplayName`). Mantener el componente `Acceso` tal cual está en el archivo.

- [ ] **Step 3: CSS del hub**

Agregar al final de `app/globals.css`:

```css
/* Hub de usuario */
.hub-head { display: flex; align-items: center; gap: 14px; padding: 6px 0 18px; }
.hub-av { width: 64px; height: 64px; border-radius: 50%; border: 2px solid var(--line, rgba(255,255,255,.15)); background: #2A2D33; }
.hub-hi { margin: 0; font-size: 22px; }
.hub-edit { font-size: 13px; color: var(--accent); text-decoration: none; }
.hub-edit:hover { text-decoration: underline; }
.hub-tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 24px; }
.hub-tile { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
  min-height: 92px; border-radius: 14px; background: var(--card, #22252B); color: var(--dim); font-size: 14px; }
.hub-tile.off { opacity: .55; }
.hub-tile .lock { font-size: 18px; }
.hub-tile small { font-size: 11px; color: var(--faint); }
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 5: Verificación manual**

Con sesión iniciada y la migración aplicada, ir a `/cuenta`: se ve el header con avatar + "Hola, {nombre}" + "Editar perfil ›", el empty-state de Mi lista (si no guardaste nada), y los tiles Amigos/Emblemas en gris con candado. Deslogueado, `/cuenta` muestra el login como antes.

- [ ] **Step 6: Commit**

```bash
git add components/UserHub.tsx app/cuenta/page.tsx app/globals.css
git commit -m "feat: hub de usuario en /cuenta"
```

---

### Task 9: /cuenta/perfil + AvatarPicker

**Files:**
- Create: `app/cuenta/perfil/page.tsx`
- Create: `components/AvatarPicker.tsx`
- Modify: `app/globals.css` (append)

**Interfaces:**
- Consumes: `useAuth` (`updateDisplayName`, `updateAvatarSeed`, `signOut`), `avatarSvg`, `randomSeed`.

- [ ] **Step 1: Crear components/AvatarPicker.tsx**

```tsx
"use client";
import { useState } from "react";
import { avatarSvg, randomSeed } from "@/lib/avatar";

export default function AvatarPicker({
  current, onPick,
}: {
  current: string; onPick: (seed: string) => void;
}) {
  const [seeds, setSeeds] = useState<string[]>(() => {
    const s = new Set<string>([current].filter(Boolean));
    while (s.size < 16) s.add(randomSeed());
    return [...s];
  });

  return (
    <div className="field">
      <label>Elegí tu avatar</label>
      <div className="avpick">
        {seeds.map((s) => (
          <button
            key={s} type="button"
            className={`avopt ${s === current ? "on" : ""}`}
            onClick={() => onPick(s)}
            aria-pressed={s === current}
          >
            <img src={avatarSvg(s)} alt="" />
          </button>
        ))}
      </div>
      <button type="button" className="btn ghost" style={{ marginTop: 10 }}
        onClick={() => setSeeds((prev) => [...prev, ...Array.from({ length: 8 }, () => randomSeed())])}>
        Mostrar más
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Crear app/cuenta/perfil/page.tsx**

```tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import AvatarPicker from "@/components/AvatarPicker";
import { useAuth } from "@/components/AuthContext";

export default function PerfilPage() {
  const { user, profile, ready, updateDisplayName, updateAvatarSeed, signOut } = useAuth();
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (ready && profile) setNombre(profile.display_name ?? ""); }, [ready, profile]);
  useEffect(() => { if (ready && !user) router.replace("/cuenta"); }, [ready, user, router]);

  if (!ready || !user) {
    return (<><TopBar /><main><div className="admin"><p className="loading">Cargando…</p></div></main><BottomNav /></>);
  }

  async function guardarNombre() {
    setBusy(true); setErr(""); setOk("");
    const { error } = await updateDisplayName(nombre.trim());
    setBusy(false);
    if (error) { setErr(error); return; }
    setOk("Guardado.");
  }

  async function elegirAvatar(seed: string) {
    setOk(""); setErr("");
    const { error } = await updateAvatarSeed(seed);
    if (error) setErr(error);
  }

  return (
    <>
      <TopBar />
      <main>
        <div className="admin" style={{ maxWidth: 480 }}>
          <Link href="/cuenta" className="back"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>Volver</Link>
          <h1>Mi perfil</h1>
          <p className="section-sub">{user.email}</p>

          <AvatarPicker current={profile?.avatar_seed ?? user.id} onPick={elegirAvatar} />

          <div className="field">
            <label>Nombre para mostrar</label>
            <input value={nombre} onChange={(e) => { setNombre(e.target.value); setOk(""); }} type="text" />
          </div>

          {err && <p style={{ color: "var(--editorial)", marginTop: 12, fontSize: 14 }}>{err}</p>}
          {ok && <p style={{ color: "var(--accent)", marginTop: 12, fontSize: 14 }}>{ok}</p>}

          <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
            <button className="btn" onClick={guardarNombre} disabled={busy || nombre.trim() === (profile?.display_name ?? "")}>
              {busy ? "Guardando…" : "Guardar nombre"}
            </button>
            <button className="btn ghost" onClick={signOut}>Cerrar sesión</button>
          </div>
        </div>
      </main>
      <BottomNav />
    </>
  );
}
```

- [ ] **Step 3: CSS del picker**

Agregar al final de `app/globals.css`:

```css
/* Picker de avatar */
.avpick { display: grid; grid-template-columns: repeat(auto-fill, minmax(56px, 1fr)); gap: 10px; }
.avopt { padding: 0; border: 2px solid transparent; border-radius: 50%; background: #2A2D33; cursor: pointer; line-height: 0; }
.avopt img { width: 100%; border-radius: 50%; display: block; }
.avopt.on { border-color: var(--accent); }
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 5: Verificación manual**

En `/cuenta` tocar "Editar perfil ›" → `/cuenta/perfil`. Elegir un avatar de la grilla: se marca el borde de acento y el círculo del TopBar cambia al instante. Cambiar el nombre y Guardar muestra "Guardado". "Cerrar sesión" desloguea. Deslogueado, entrar a `/cuenta/perfil` redirige a `/cuenta`.

- [ ] **Step 6: Commit**

```bash
git add app/cuenta/perfil/page.tsx components/AvatarPicker.tsx app/globals.css
git commit -m "feat: /cuenta/perfil con edición de nombre y picker de avatar"
```

---

### Task 10: Páginas "ver todo" (lista / gustaron / vistos)

**Files:**
- Create: `app/cuenta/lista/page.tsx`
- Create: `app/cuenta/gustaron/page.tsx`
- Create: `app/cuenta/vistos/page.tsx`

**Interfaces:**
- Consumes: `UserShelf` (prop `full`), loaders de `@/lib/userdata`, `useAuth` para el guard.

- [ ] **Step 1: Crear app/cuenta/lista/page.tsx**

```tsx
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import UserShelf from "@/components/UserShelf";
import { useAuth } from "@/components/AuthContext";
import { itemRefs } from "@/lib/userdata";

export default function MiListaPage() {
  const { user, ready } = useAuth();
  const router = useRouter();
  useEffect(() => { if (ready && !user) router.replace("/cuenta"); }, [ready, user, router]);
  if (!ready || !user) return (<><TopBar /><main><div className="wrap"><p className="loading">Cargando…</p></div></main><BottomNav /></>);
  return (
    <>
      <TopBar />
      <main><div className="wrap">
        <Link href="/cuenta" className="back"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>Volver</Link>
        <UserShelf title="Mi lista" load={() => itemRefs("list")} full
          empty="Todavía no guardaste nada — tocá “Mi lista” en cualquier ficha." />
      </div></main>
      <BottomNav />
    </>
  );
}
```

- [ ] **Step 2: Crear app/cuenta/gustaron/page.tsx**

Igual estructura, cambiando el loader, el título y el empty:

```tsx
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import UserShelf from "@/components/UserShelf";
import { useAuth } from "@/components/AuthContext";
import { likedRefs } from "@/lib/userdata";

export default function GustaronPage() {
  const { user, ready } = useAuth();
  const router = useRouter();
  useEffect(() => { if (ready && !user) router.replace("/cuenta"); }, [ready, user, router]);
  if (!ready || !user) return (<><TopBar /><main><div className="wrap"><p className="loading">Cargando…</p></div></main><BottomNav /></>);
  return (
    <>
      <TopBar />
      <main><div className="wrap">
        <Link href="/cuenta" className="back"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>Volver</Link>
        <UserShelf title="Me gustaron" load={likedRefs} full
          empty="Todavía no votaste nada como “ta buena” o “petacular”." />
      </div></main>
      <BottomNav />
    </>
  );
}
```

- [ ] **Step 3: Crear app/cuenta/vistos/page.tsx**

```tsx
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import UserShelf from "@/components/UserShelf";
import { useAuth } from "@/components/AuthContext";
import { historyRefs } from "@/lib/userdata";

export default function VistosPage() {
  const { user, ready } = useAuth();
  const router = useRouter();
  useEffect(() => { if (ready && !user) router.replace("/cuenta"); }, [ready, user, router]);
  if (!ready || !user) return (<><TopBar /><main><div className="wrap"><p className="loading">Cargando…</p></div></main><BottomNav /></>);
  return (
    <>
      <TopBar />
      <main><div className="wrap">
        <Link href="/cuenta" className="back"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>Volver</Link>
        <UserShelf title="Vistos recientemente" load={() => historyRefs(60)} full
          empty="Todavía no abriste ninguna ficha." />
      </div></main>
      <BottomNav />
    </>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 5: Verificación manual**

Desde el hub, "ver todo" en cada riel abre su página con la grilla completa y un "Volver". Deslogueado, cada una redirige a `/cuenta`.

- [ ] **Step 6: Commit**

```bash
git add app/cuenta/lista/page.tsx app/cuenta/gustaron/page.tsx app/cuenta/vistos/page.tsx
git commit -m "feat: páginas ver todo de mi lista, me gustaron y vistos"
```

---

### Task 11: ListActions en la ficha + wiring de DetailView

**Files:**
- Create: `components/ListActions.tsx`
- Modify: `components/DetailView.tsx`
- Modify: `app/globals.css` (append, si hace falta)

**Interfaces:**
- Consumes: `useAuth`, `hasItem`/`setItem`/`recordView` de `@/lib/userdata`, `MediaType`.
- Produces: componente `ListActions` con props `{ id: number; tipo: MediaType }` que renderiza los botones "Mi lista" y "Ya la vi" y registra la vista.

- [ ] **Step 1: Crear components/ListActions.tsx**

```tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthContext";
import { hasItem, setItem, recordView } from "@/lib/userdata";
import type { MediaType } from "@/lib/types";

type Kind = "list" | "watched";

export default function ListActions({ id, tipo }: { id: number; tipo: MediaType }) {
  const { user, ready } = useAuth();
  const router = useRouter();
  const [inList, setInList] = useState(false);
  const [watched, setWatched] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready || !user) { setInList(false); setWatched(false); return; }
    let alive = true;
    void recordView(user.id, { tmdb_id: id, tipo });
    (async () => {
      const [l, w] = await Promise.all([
        hasItem("list", { tmdb_id: id, tipo }),
        hasItem("watched", { tmdb_id: id, tipo }),
      ]);
      if (alive) { setInList(l); setWatched(w); }
    })();
    return () => { alive = false; };
  }, [ready, user, id, tipo]);

  async function toggle(kind: Kind, cur: boolean, set: (v: boolean) => void) {
    if (!user) { router.push("/cuenta"); return; }
    if (busy) return;
    setBusy(true);
    set(!cur); // optimista
    const { error } = await setItem(user.id, kind, { tmdb_id: id, tipo }, !cur);
    if (error) set(cur); // rollback
    setBusy(false);
  }

  return (
    <>
      <button className={`act ${inList ? "on" : ""}`} onClick={() => toggle("list", inList, setInList)}>
        {inList
          ? <svg className="chk" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          : <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>}
        <span className="lab">Mi lista</span>
      </button>
      <button className={`act ${watched ? "on" : ""}`} onClick={() => toggle("watched", watched, setWatched)}>
        {watched
          ? <svg className="chk" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          : <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>}
        <span className="lab">Ya la vi</span>
      </button>
    </>
  );
}
```

- [ ] **Step 2: Cablear DetailView**

En `components/DetailView.tsx`:

1. Agregar import: `import ListActions from "./ListActions";`
2. Eliminar la línea de estado falso: `const [inList, setInList] = useState(false);` (y quitar `useState` del import de React si ya no se usa en el archivo — verificar; `useRef` sigue).
3. Reemplazar el bloque del botón "Mi lista" (el `<button className={\`act ${inList ? "on" : ""}\`} ...>...</button>` dentro de `.actions`) por: `<ListActions id={t.id} tipo={t.type} />`

El bloque `.actions` queda:

```tsx
        <div className="actions">
          <ListActions id={t.id} tipo={t.type} />
          <LikeButton id={t.id} tipo={t.type} />
          <button className="act" onClick={() => navigator.share?.({ title: t.title }).catch(() => {})}>
            <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></svg>
            <span className="lab">Compartir</span>
          </button>
        </div>
```

Nota: `t.id` es `number` y `t.type` es `MediaType` (ya expuestos por `UITitleDetail`), que es justo lo que `ListActions` consume.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores. Si TS marca `useState` sin uso en DetailView, quitarlo del import.

- [ ] **Step 4: Verificación manual (end-to-end)**

Con sesión + migración aplicada:
1. Abrir una ficha → tocar "Mi lista": el ícono pasa a check. Recargar la ficha: sigue en check (persistió). Ir a `/cuenta`: aparece en el riel "Mi lista".
2. Tocar "Ya la vi": queda marcado y persiste al recargar.
3. Abrir 3-4 fichas distintas → `/cuenta` → "Vistos recientemente" las lista por recencia (la última arriba).
4. Votar "ta buena"/"petacular" en una ficha → aparece en "Me gustaron".
5. Deslogueado: tocar "Mi lista"/"Ya la vi" lleva a `/cuenta` (login).

- [ ] **Step 5: Commit**

```bash
git add components/ListActions.tsx components/DetailView.tsx
git commit -m "feat(ficha): Mi lista y Ya la vi persistidos + registro de vista"
```

---

### Task 12: Actualizar documentación

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:** ninguna (docs).

- [ ] **Step 1: Tabla de rutas API**

En `CLAUDE.md`, en la tabla de rutas, agregar la fila:

```
| `GET /api/cards` | enriquece una lista de ids (`items=movie:1,tv:2`) a cards, sin filtro de plataforma (listas del usuario) |
```

- [ ] **Step 2: Sacar el área de usuario de "standby"**

En la sección "Pendiente / en standby", reemplazar los ítems de "Películas que viste" y "Perfil de usuario / 5ta pestaña" por una nota de que el área de usuario (hub, Mi lista, Ya la vi, historial, avatares) ya está construida, y que **Mis amigos** y **Mis emblemas** quedan como los próximos módulos (placeholders en el hub). Mantener que requiere re-correr `supabase/schema.sql`.

- [ ] **Step 3: Build de cierre**

Run: `npx next build`
Expected: compila completo (puede fallar solo por fuentes de Google si no hay red — no es error real).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: área de usuario construida; /api/cards en la tabla"
```

---

## Self-Review (hecho)

- **Cobertura del spec:** perfil (nombre+avatar) → T3, T9; hub con rieles → T7, T8; Mi lista real → T5, T11; Ya la vi → T5, T11; Vistos recientemente → T5, T11; Me gustaron desde votos → T5; `/api/cards` sin filtro → T6; TopBar círculo de avatar → T4; placeholders amigos/emblemas → T8; migración → T1; deslogueado (botones → /cuenta, guards) → T8/T9/T10/T11. Todo cubierto.
- **Placeholders:** ninguno; todo el código está completo (el único "a mano" es aplicar el SQL en Supabase, inevitable sin credenciales de DB).
- **Consistencia de tipos:** `ItemRef` definido en T5 y consumido igual en T6/T7/T11; `avatarSvg(seed)` de T2 usado en T4/T8/T9; `updateAvatarSeed` de T3 usado en T9; `cardsByIds` de T6 usado por `/api/cards` y `UserShelf`; `ListActions({id,tipo})` de T11 alimentado por `t.id`/`t.type`.
