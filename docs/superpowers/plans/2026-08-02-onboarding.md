# Onboarding inicial (MVP) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Onboarding premium de una sola pantalla (plataformas + avatar + nombre) que se muestra una única vez tras el primer login (`onboarding_completed = false`), guardando cada bloque al instante en Supabase.

**Architecture:** Módulo desacoplado `components/onboarding/` (View + bloques + hook) montado en la ruta `/onboarding`; un `OnboardingGate` en el layout redirige mientras el flag esté en false. Las plataformas salen dinámicamente de la tabla `providers` (vía `/api/providers`), se guardan como `provider_id` de TMDB en el perfil, y se puentean a "mis plataformas" (localStorage) mapeando a los 9 códigos conocidos.

**Tech Stack:** Next 14 App Router, TypeScript, React client components, Supabase (profiles), Deno Edge Function (`syncProviders`), CSS plano.

## Global Constraints

- `npx tsc --noEmit` = **0 errores** tras cada task Node (única verificación de tipos; no hay test runner).
- **Sin dependencias npm nuevas.** Solo APIs del navegador y libs ya presentes.
- **Sin CSS-in-JS**: todo el CSS nuevo va en `app/globals.css`, reusando tokens (`--accent`, `.btn`, `.field`, `.card`, grid).
- **Reutilizar** `AvatarPicker` (bloque 2, sin duplicar) y `AuthContext` (perfil + persistencia).
- UI en **español rioplatense**. No cambiar la identidad visual de Yump.
- El código Deno (`supabase/functions/**`) está excluido del `tsc` (ya en tsconfig); se valida al desplegar.
- **`syncProviders` es un paso manual del dueño** (redeploy del Edge Function + correr el job). El resto funciona con la tabla actual (16 providers filtrados).

---

### Task 1: Base de datos + job `syncProviders`

**Files:**
- Modify: `supabase/schema.sql` (columnas nuevas en `profiles`)
- Modify: `supabase/functions/tmdb-sync/lib/tmdb.ts` (agregar `providerList`)
- Modify: `supabase/functions/tmdb-sync/jobs/sync-providers.ts` (implementar, hoy stub)

**Interfaces:**
- Produces: columnas `profiles.onboarding_completed boolean`, `profiles.platforms integer[]`, `profiles.country_code text`; job `syncProviders` que puebla `providers` con la lista completa AR.

- [ ] **Step 1: Columnas en `profiles` (schema.sql)**

Agregar tras la función `is_admin()` (fin de la sección profiles, ~línea 78):

```sql
-- Onboarding: se completa una vez. Los usuarios EXISTENTES se marcan como
-- completado (no deben ver el onboarding); los nuevos arrancan en false.
alter table profiles add column if not exists onboarding_completed boolean;
update profiles set onboarding_completed = true where onboarding_completed is null;
alter table profiles alter column onboarding_completed set default false;
alter table profiles alter column onboarding_completed set not null;

-- Plataformas elegidas como provider_id de TMDB (fase 2 filtra por esto).
alter table profiles add column if not exists platforms integer[] not null default '{}';

-- País (prep multi-región; el onboarding MVP no lo pide).
alter table profiles add column if not exists country_code text not null default 'AR';
```

- [ ] **Step 2: `providerList` en el cliente TMDB de Deno**

En `supabase/functions/tmdb-sync/lib/tmdb.ts`, agregar tipo + función (al lado de `discover`/`watchProviders`):

```ts
export interface RawProviderInfo {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
  display_priority: number;
  display_priorities?: Record<string, number>;
}

// Lista COMPLETA de watch providers de la región (AR por DEFAULTS).
export function providerList(type: MediaType) {
  return tmdb<{ results: RawProviderInfo[] }>(`/watch/providers/${type}`);
}
```

- [ ] **Step 3: Implementar `syncProviders`**

Reemplazar TODO el contenido de `supabase/functions/tmdb-sync/jobs/sync-providers.ts`:

```ts
import { SupabaseClient } from "@supabase/supabase-js";
import { providerList, RawProviderInfo } from "../lib/tmdb.ts";

// Puebla `providers` con la lista completa de watch providers de AR (movie+tv)
// desde TMDB. Idempotente (upsert por id). Es la fuente autoritativa de
// plataformas para el onboarding.
export async function syncProviders(sb: SupabaseClient) {
  const [mv, tv] = await Promise.all([providerList("movie"), providerList("tv")]);
  const byId = new Map<number, RawProviderInfo>();
  for (const p of [...mv.results, ...tv.results]) {
    if (!byId.has(p.provider_id)) byId.set(p.provider_id, p);
  }
  const stamp = new Date().toISOString();
  const rows = [...byId.values()].map((p) => ({
    id: p.provider_id,
    name: p.provider_name,
    logo_path: p.logo_path ?? null,
    display_priority: p.display_priorities?.AR ?? p.display_priority ?? null,
    updated_at: stamp,
  }));
  const { error } = await sb.from("providers").upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`providers upsert: ${error.message}`);
  return { providers: rows.length };
}
```

Nota: `index.ts` ya importa `syncProviders` y lo tiene en `HANDLERS` (antes tiraba `NOT_IMPLEMENTED`); no hay que tocar el dispatcher.

- [ ] **Step 4: Verificar tipos (lado Node)**

Run: `npx tsc --noEmit`
Expected: 0 errores (los archivos Deno están excluidos; esto valida que nada del lado Node se rompió).

- [ ] **Step 5: Commit**

```bash
git add supabase/schema.sql supabase/functions/tmdb-sync
git commit -m "feat(onboarding): columnas de profiles + job syncProviders"
```

- [ ] **Step 6: (Manual del dueño, documentar) Aplicar en Supabase**

Correr la sección nueva de `supabase/schema.sql` en el SQL editor; `supabase functions deploy tmdb-sync`; invocar `{"job":"syncProviders"}`. Verificar que `providers` incluye MUBI (id 11). No bloquea las tasks siguientes (funcionan con la tabla actual).

---

### Task 2: Ruta `/api/providers`

**Files:**
- Create: `app/api/providers/route.ts`

**Interfaces:**
- Consumes: tabla `providers` (Supabase), `TMDB_IMG` de `lib/tmdb.ts`.
- Produces: `GET /api/providers` → `{ providers: { id: number; name: string; logo: string | null }[] }`.

- [ ] **Step 1: Crear la ruta**

```ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { TMDB_IMG } from "@/lib/tmdb";

export const dynamic = "force-dynamic";

// Plataformas para el onboarding, desde la tabla `providers`. Filtra los canales
// revendedores (nombres con "Channel"). Ordenado por display_priority.
// (Multi-región: la tabla es AR por ahora; se agregará ?region= en fase 2.)
export async function GET() {
  const sb = supabaseServer();
  if (!sb) return NextResponse.json({ providers: [] });
  try {
    const { data, error } = await sb
      .from("providers")
      .select("id, name, logo_path, display_priority")
      .order("display_priority", { ascending: true });
    if (error) throw new Error(error.message);
    const providers = (data ?? [])
      .filter((p: { name: string }) => !/channel/i.test(p.name))
      .map((p: { id: number; name: string; logo_path: string | null }) => ({
        id: p.id,
        name: p.name.trim(),
        logo: p.logo_path ? `${TMDB_IMG}/w92${p.logo_path}` : null,
      }));
    return NextResponse.json({ providers });
  } catch (e) {
    return NextResponse.json({ error: String(e), providers: [] }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Verificación funcional**

Con `npm run dev`: `curl.exe "http://localhost:3000/api/providers"` → JSON `{ providers: [...] }` con Netflix/Disney/etc., **sin** entradas que contengan "Channel", cada una con `logo` (URL de imagen TMDB).

- [ ] **Step 4: Commit**

```bash
git add app/api/providers
git commit -m "feat(onboarding): ruta /api/providers (tabla filtrada)"
```

---

### Task 3: Extensiones de contexto (AuthContext + PlatformsContext)

**Files:**
- Modify: `components/AuthContext.tsx`
- Modify: `components/PlatformsContext.tsx`

**Interfaces:**
- Produces:
  - `Profile` suma `onboarding_completed: boolean; platforms: number[]; country_code: string`.
  - `useAuth()` suma `updatePlatforms(ids: number[]): Promise<{ error?: string }>` y `completeOnboarding(): Promise<{ error?: string }>`.
  - `usePlatforms()` suma `set(codes: PlatformCode[]): void`.

- [ ] **Step 1: `PlatformsContext` — método `set`**

En `components/PlatformsContext.tsx`, agregar `set` a la interfaz `Ctx` (junto a `toggle`):

```ts
  set: (codes: PlatformCode[]) => void;
```

Dentro del provider, agregar (junto a `toggle`):

```ts
  const set = useCallback((codes: PlatformCode[]) => {
    const final = codes.length ? codes : DEFAULT_PLATFORMS; // nunca vacío
    setPlatforms(final);
    try { localStorage.setItem(KEY, JSON.stringify(final)); } catch { /* noop */ }
  }, []);
```

Y agregarlo al value del provider: `<PlatformsCtx.Provider value={{ platforms, has, toggle, set, ready }}>`.

- [ ] **Step 2: `AuthContext` — campos del Profile + select**

En `components/AuthContext.tsx`, extender la interfaz `Profile`:

```ts
export interface Profile {
  id: string;
  display_name: string | null;
  is_admin: boolean;
  avatar_seed: string | null;
  avatar_style: string | null;
  onboarding_completed: boolean;
  platforms: number[];
  country_code: string;
}
```

En `loadProfile`, cambiar el `select` a:

```ts
    .select("id, display_name, is_admin, avatar_seed, avatar_style, onboarding_completed, platforms, country_code")
```

Y en los **tres** objetos Profile literales de respaldo, agregar los campos nuevos con defaults seguros `onboarding_completed: true, platforms: [], country_code: "AR"`:
1. el `return metaName ? { id, display_name: metaName, ... } : null` de `loadProfile`;
2. el fallback (rama else) del `setProfile((p) => (p ? { ...p, display_name: name } : { id: user.id, display_name: name, ... }))` de `updateDisplayName`;
3. el fallback (rama else) del `setProfile((p) => (p ? { ... } : { id: user.id, display_name: null, ... }))` de `updateAvatar`.

(Fallback = true para no atrapar a alguien sin fila de perfil en un onboarding que no podría persistir.)

- [ ] **Step 3: `AuthContext` — métodos `updatePlatforms` y `completeOnboarding`**

Agregar a la interfaz `Ctx`:

```ts
  updatePlatforms: (ids: number[]) => Promise<{ error?: string }>;
  completeOnboarding: () => Promise<{ error?: string }>;
```

Implementar (junto a `updateAvatar`):

```ts
  const updatePlatforms = useCallback(async (ids: number[]) => {
    if (!user) return { error: "No hay sesión" };
    const { error } = await supabaseBrowser().from("profiles").update({ platforms: ids }).eq("id", user.id);
    if (error) return { error: error.message };
    setProfile((p) => (p ? { ...p, platforms: ids } : p));
    return {};
  }, [user]);

  const completeOnboarding = useCallback(async () => {
    if (!user) return { error: "No hay sesión" };
    const { error } = await supabaseBrowser().from("profiles").update({ onboarding_completed: true }).eq("id", user.id);
    if (error) return { error: error.message };
    setProfile((p) => (p ? { ...p, onboarding_completed: true } : p));
    return {};
  }, [user]);
```

Agregarlos al value del provider (junto a `updateAvatar`): `updatePlatforms, completeOnboarding`.

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 5: Commit**

```bash
git add components/AuthContext.tsx components/PlatformsContext.tsx
git commit -m "feat(onboarding): AuthContext (platforms/onboarding) + PlatformsContext.set"
```

---

### Task 4: Hook `useOnboarding`

**Files:**
- Create: `components/onboarding/useOnboarding.ts`

**Interfaces:**
- Consumes: `useAuth()` (`user`, `profile`, `updatePlatforms`, `updateDisplayName`, `completeOnboarding`), `usePlatforms()` (`set`), `codeForTmdbId` (`lib/providers-ar.ts`).
- Produces: `useOnboarding()` → `{ selected: number[]; name: string; togglePlatform(id): void; clearPlatforms(): void; setName(v): void; saveName(): void; finish(): Promise<{error?:string}> }`.

- [ ] **Step 1: Crear el hook**

```ts
"use client";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../AuthContext";
import { usePlatforms } from "../PlatformsContext";
import { codeForTmdbId } from "@/lib/providers-ar";
import type { Profile } from "../AuthContext";
import type { User } from "@supabase/supabase-js";

function initialName(profile: Profile | null, user: User | null): string {
  const m = user?.user_metadata ?? {};
  return profile?.display_name
    || (m.display_name as string)
    || (m.full_name as string)
    || (m.name as string)
    || "";
}

export function useOnboarding() {
  const { user, profile, updatePlatforms, updateDisplayName, completeOnboarding } = useAuth();
  const platformsCtx = usePlatforms();

  const [selected, setSelected] = useState<number[]>([]);
  const [name, setName] = useState("");
  const [seeded, setSeeded] = useState(false);

  // Carga inicial desde el perfil (resume): corre una vez cuando llega el perfil.
  useEffect(() => {
    if (!profile || seeded) return;
    setSelected(profile.platforms ?? []);
    setName(initialName(profile, user));
    setSeeded(true);
  }, [profile, user, seeded]);

  // Puente a "mis plataformas": mapea provider_id -> código; si hay mapeables,
  // sincroniza sc:platforms (los no mapeables quedan solo en el perfil).
  const bridge = useCallback((ids: number[]) => {
    const codes = [...new Set(ids.map((id) => codeForTmdbId(id)).filter((c): c is NonNullable<typeof c> => !!c))];
    if (codes.length) platformsCtx.set(codes);
  }, [platformsCtx]);

  const togglePlatform = useCallback((id: number) => {
    setSelected((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      void updatePlatforms(next);
      bridge(next);
      return next;
    });
  }, [updatePlatforms, bridge]);

  const clearPlatforms = useCallback(() => {
    setSelected([]);
    void updatePlatforms([]);
    // "No tengo ninguna": no toca sc:platforms (deja el default).
  }, [updatePlatforms]);

  const saveName = useCallback(() => {
    const v = name.trim();
    if (v) void updateDisplayName(v);
  }, [name, updateDisplayName]);

  const finish = useCallback(() => completeOnboarding(), [completeOnboarding]);

  return { selected, name, togglePlatform, clearPlatforms, setName, saveName, finish };
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add components/onboarding/useOnboarding.ts
git commit -m "feat(onboarding): hook useOnboarding (estado + persistencia + puente)"
```

---

### Task 5: UI del onboarding (bloques + View + CSS)

**Files:**
- Create: `components/onboarding/ProviderCard.tsx`
- Create: `components/onboarding/PlatformPicker.tsx`
- Create: `components/onboarding/NameBlock.tsx`
- Create: `components/onboarding/OnboardingView.tsx`
- Modify: `app/globals.css` (estilos `.ob-*`)

**Interfaces:**
- Consumes: `useOnboarding()` (Task 4), `AvatarPicker` (`components/avatar/AvatarPicker`), `/api/providers` (Task 2).
- Produces: `OnboardingView` (default export) — la pantalla completa.

- [ ] **Step 1: `ProviderCard`**

```tsx
"use client";

export default function ProviderCard({ name, logo, selected, onToggle }:
  { name: string; logo: string | null; selected: boolean; onToggle: () => void }) {
  return (
    <button type="button" className={`ob-card ${selected ? "on" : ""}`} onClick={onToggle} aria-pressed={selected}>
      <span className="ob-card-logo">
        {logo ? <img src={logo} alt="" width={40} height={40} /> : <span className="ob-card-ph">{name.charAt(0)}</span>}
      </span>
      <span className="ob-card-name">{name}</span>
      {selected && (
        <span className="ob-card-check">
          <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
        </span>
      )}
    </button>
  );
}
```

- [ ] **Step 2: `PlatformPicker`**

```tsx
"use client";
import { useEffect, useState } from "react";
import ProviderCard from "./ProviderCard";

interface Provider { id: number; name: string; logo: string | null }

export default function PlatformPicker({ selected, onToggle, onNone }:
  { selected: number[]; onToggle: (id: number) => void; onNone: () => void }) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const none = selected.length === 0;

  useEffect(() => {
    let alive = true;
    fetch("/api/providers")
      .then((r) => r.json())
      .then((j) => { if (alive) { setProviders(j.providers ?? []); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  return (
    <section className="ob-block">
      <h2 className="ob-h">¿Qué plataformas usás?</h2>
      <p className="ob-sub">Seleccioná las plataformas que tenés para personalizar tu experiencia.</p>
      {loading ? <p className="loading">Cargando…</p> : (
        <div className="ob-grid">
          {providers.map((p) => (
            <ProviderCard key={p.id} name={p.name} logo={p.logo} selected={selected.includes(p.id)} onToggle={() => onToggle(p.id)} />
          ))}
          <button type="button" className={`ob-card ob-none ${none ? "on" : ""}`} onClick={onNone} aria-pressed={none}>
            <span className="ob-card-logo"><span className="ob-plus">＋</span></span>
            <span className="ob-card-name">No tengo ninguna por ahora</span>
          </button>
        </div>
      )}
      <p className="ob-hint">Podrás cambiarlas cuando quieras desde Configuración.</p>
    </section>
  );
}
```

- [ ] **Step 3: `NameBlock`**

```tsx
"use client";

export default function NameBlock({ value, onChange, onBlur }:
  { value: string; onChange: (v: string) => void; onBlur: () => void }) {
  return (
    <section className="ob-block">
      <h2 className="ob-h">¿Cómo querés que te llamemos?</h2>
      <div className="field">
        <label htmlFor="ob-name">Tu nombre</label>
        <input id="ob-name" type="text" value={value} autoComplete="name"
          onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />
      </div>
    </section>
  );
}
```

- [ ] **Step 4: `OnboardingView`**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useOnboarding } from "./useOnboarding";
import PlatformPicker from "./PlatformPicker";
import NameBlock from "./NameBlock";
import AvatarPicker from "../avatar/AvatarPicker";

export default function OnboardingView() {
  const router = useRouter();
  const { selected, name, togglePlatform, clearPlatforms, setName, saveName, finish } = useOnboarding();
  const [busy, setBusy] = useState(false);

  async function comenzar() {
    setBusy(true);
    saveName();       // asegura el nombre guardado aunque no haya habido blur
    await finish();   // onboarding_completed = true
    router.push("/");
  }

  return (
    <div className="ob-wrap">
      <header className="ob-header">
        <h1>👋 ¡Bienvenido a Yump!</h1>
        <p>Personalizá tu experiencia. Solo te llevará un minuto.</p>
      </header>

      <PlatformPicker selected={selected} onToggle={togglePlatform} onNone={clearPlatforms} />

      <section className="ob-block">
        <h2 className="ob-h">Elegí tu avatar</h2>
        <AvatarPicker />
      </section>

      <NameBlock value={name} onChange={setName} onBlur={saveName} />

      <div className="ob-cta">
        <button className="btn" onClick={comenzar} disabled={busy}>
          {busy ? "Un momento…" : "Comenzar"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: CSS en `app/globals.css`**

Agregar al final:

```css
/* ==========================================================================
   Onboarding
   ========================================================================== */
.ob-wrap{max-width:560px;margin:0 auto;padding:32px 22px calc(var(--nav-total) + 96px)}
.ob-header{text-align:center;margin-bottom:26px}
.ob-header h1{font-family:var(--display);font-size:26px;font-weight:700;letter-spacing:-.02em}
.ob-header p{color:var(--dim);font-size:15px;margin-top:6px}
.ob-block{margin-top:30px}
.ob-h{font-family:var(--display);font-size:20px;font-weight:700;letter-spacing:-.015em}
.ob-sub{color:var(--dim);font-size:14px;margin-top:4px;margin-bottom:14px}
.ob-hint{color:var(--faint);font-size:12.5px;margin-top:12px}
.ob-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
@media(max-width:440px){.ob-grid{grid-template-columns:repeat(2,1fr)}}
.ob-card{position:relative;display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px 10px;border-radius:var(--radius-sm);border:1px solid var(--line-2);background:var(--surface);cursor:pointer;transition:border-color .15s,transform .12s,box-shadow .15s;box-shadow:var(--sh)}
.ob-card:hover{border-color:var(--text)}
.ob-card:active{transform:scale(.97)}
.ob-card.on{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent) inset}
.ob-card-logo{width:44px;height:44px;border-radius:10px;overflow:hidden;display:flex;align-items:center;justify-content:center;background:var(--surface-2)}
.ob-card-logo img{width:40px;height:40px;object-fit:cover;border-radius:8px}
.ob-card-ph{font-family:var(--display);font-weight:700;font-size:18px;color:var(--dim)}
.ob-card-name{font-size:12.5px;font-weight:600;text-align:center;line-height:1.2;color:var(--text)}
.ob-card-check{position:absolute;top:7px;right:7px;width:20px;height:20px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center}
.ob-card-check svg{width:12px;height:12px;stroke:#fff;fill:none;stroke-width:3}
.ob-none .ob-plus{font-size:24px;color:var(--accent);font-weight:700;line-height:1}
.ob-cta{position:fixed;left:0;right:0;bottom:0;z-index:20;padding:14px 22px calc(14px + var(--safe-b));background:linear-gradient(to top,var(--bg) 60%,transparent);display:flex;justify-content:center}
.ob-cta .btn{width:100%;max-width:516px}
@media(prefers-reduced-motion:reduce){.ob-card{transition:none}}
```

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 7: Commit**

```bash
git add components/onboarding app/globals.css
git commit -m "feat(onboarding): UI (bloques plataformas/avatar/nombre + View + CSS)"
```

---

### Task 6: Integración (Gate + ruta + layout)

**Files:**
- Create: `components/onboarding/OnboardingGate.tsx`
- Create: `app/onboarding/page.tsx`
- Modify: `app/layout.tsx` (montar el gate)

**Interfaces:**
- Consumes: `useAuth()` (`user`, `profile`, `ready`), `OnboardingView` (Task 5).

- [ ] **Step 1: `OnboardingGate`**

Crear `components/onboarding/OnboardingGate.tsx` (por la ubicación, el import de AuthContext es `"../AuthContext"`):

```tsx
"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../AuthContext";

// Redirige al onboarding mientras el usuario no lo haya completado. Desacoplado
// del login: vive en el layout y observa el perfil.
export default function OnboardingGate() {
  const { user, profile, ready } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!ready || !user || !profile) return;
    if (!profile.onboarding_completed && pathname !== "/onboarding") {
      router.replace("/onboarding");
    } else if (profile.onboarding_completed && pathname === "/onboarding") {
      router.replace("/");
    }
  }, [ready, user, profile, pathname, router]);

  return null;
}
```

- [ ] **Step 2: Ruta `/onboarding`**

`app/onboarding/page.tsx` (pantalla inmersiva, sin TopBar/BottomNav):

```tsx
import OnboardingView from "@/components/onboarding/OnboardingView";

export default function OnboardingPage() {
  return <main><OnboardingView /></main>;
}
```

- [ ] **Step 3: Montar el gate en el layout**

En `app/layout.tsx`, importar y montar `OnboardingGate` dentro de `AuthProvider` (junto a `PwaClient`):

```tsx
import OnboardingGate from "@/components/onboarding/OnboardingGate";
```

Y dentro de `PlatformsProvider`, junto a `<PwaClient />`:

```tsx
              <OnboardingGate />
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 5: Verificación funcional/visual (dev)**

Con `npm run dev` y un usuario con `onboarding_completed = false` (o setearlo a false en Supabase para un usuario de prueba):
- Al entrar a cualquier página → redirige a `/onboarding`.
- Elegir plataformas: se ven seleccionadas; el Home luego refleja las mapeables (puente). "No tengo ninguna" limpia la selección.
- "Cambiar avatar" abre el modal DiceBear (Generar más/Seleccionar/Guardar) y persiste.
- Escribir el nombre y salir del input lo guarda.
- "Comenzar" → va al Home y NO vuelve a aparecer el onboarding.
- Cerrar a mitad y volver a entrar → precarga lo ya hecho (plataformas/nombre/avatar).
- Un usuario con `onboarding_completed = true` → nunca ve `/onboarding` (si entra a mano, lo redirige al Home).

- [ ] **Step 6: Commit**

```bash
git add components/onboarding/OnboardingGate.tsx app/onboarding app/layout.tsx
git commit -m "feat(onboarding): gate + ruta /onboarding + montaje en layout"
```

---

## Notas de verificación global

- Sin test runner: cada task cierra con `npx tsc --noEmit` + los chequeos funcionales descriptos.
- El job `syncProviders` (Deno) se valida al desplegar (paso manual del dueño, Task 1 Step 6). Hasta entonces el onboarding usa la tabla actual (16 providers filtrados; sin MUBI).
- No se mergea a `main` hasta la validación del dueño (deploy Vercel + los pasos de Supabase).
