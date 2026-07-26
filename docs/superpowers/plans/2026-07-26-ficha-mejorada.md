# Ficha de título mejorada — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el desglose de votos (malaso/ta buena/petacular) por un rating único con estrella (promedio /10 + votos), mostrar el reparto con fotos tipo TMDB, y confirmar temporadas/episodios en series — todo en la ficha de título.

**Architecture:** Cambio acotado a la ficha (`DetailView`) + un widening de tipo en el cliente TMDB y el enriquecido de `cast` (de nombres a objetos con foto/personaje). El promedio con estrella se calcula en el cliente desde la RPC `vote_counts` ya existente, sin tocar el modelo de votos.

**Tech Stack:** Next.js 14, TypeScript, React (client components), Supabase RPC, CSS plano en `app/globals.css`.

## Global Constraints

- **No hay test runner** (por diseño). Cada task se valida con `npx tsc --noEmit` (0 errores) + chequeo visual en `npm run dev`. Copiado del CLAUDE.md.
- **El modelo de votos NO se toca:** tabla `votes`, `components/LikeButton.tsx`, RPC `top_voted`, y los shelves del home "Lo más votados" / "Hacete cargo" quedan igual. Este plan es display-only en la ficha.
- **Sin cambios de schema.** El promedio sale de la RPC `vote_counts(p_tmdb_id, p_tipo)` que ya existe (grant anon).
- **Mapeo voto→10:** `VALUE = { 1: 2, 2: 7, 3: 10 }` (malaso=2, ta buena=7, petacular=10). Promedio = media ponderada, 1 decimal.
- **Estrella oculta si 0 votos.**
- **Reparto:** top 12, cada ítem linkea a `/persona/[id]`. Actor sin foto → placeholder (inicial).
- **CSS solo en `app/globals.css`, reusando clases existentes. Texto UI en español rioplatense.**
- **Rama:** `feat/ficha-mejorada` (creada, con el spec commiteado).

---

### Task 1: Reparto con fotos (datos + UI)

Cambia `cast` de `string[]` a objetos con foto/personaje y lo renderiza como riel.
Como `UITitleDetail.cast` cambia de tipo, esto rompe el uso viejo en `DetailView`
hasta actualizarlo; por eso datos + UI van en una sola task (gate `tsc` verde al final).

**Files:**
- Modify: `lib/tmdb.ts:126` (ensanchar el tipo de `credits.cast`)
- Modify: `lib/types.ts:31-44` (nuevo `UICastMember`, `cast: UICastMember[]`)
- Modify: `lib/enrich.ts:234` (mapear cast enriquecido)
- Create: `components/CastRail.tsx`
- Modify: `components/DetailView.tsx:75` (reemplazar la línea de texto de reparto)
- Modify: `app/globals.css` (estilos del riel de reparto)

**Interfaces:**
- Produces: `interface UICastMember { id: number; name: string; character: string | null; profile: string | null }`; `UITitleDetail.cast: UICastMember[]`; `<CastRail cast={UICastMember[]} />`.

- [ ] **Step 1: Ensanchar el tipo del cast en `lib/tmdb.ts`**

Línea 126, reemplazar:
```ts
  credits: { cast: { name: string }[]; crew: { job: string; name: string }[] };
```
por:
```ts
  credits: { cast: { id: number; name: string; character?: string; profile_path: string | null }[]; crew: { job: string; name: string }[] };
```
(TMDB ya devuelve estos campos en `append_to_response=credits`; solo faltaba el tipo.)

- [ ] **Step 2: Agregar `UICastMember` y cambiar `cast` en `lib/types.ts`**

Antes de `export interface UITitleDetail` (línea 31) agregar:
```ts
export interface UICastMember {
  id: number;
  name: string;
  character: string | null;
  profile: string | null; // URL de la foto (w185) o null
}
```
Y en `UITitleDetail` cambiar la línea 35 `cast: string[];` por:
```ts
  cast: UICastMember[];
```

- [ ] **Step 3: Enriquecer el cast en `lib/enrich.ts`**

Línea 234, reemplazar:
```ts
    cast: d.credits?.cast?.slice(0, 6).map((c) => c.name) ?? [],
```
por:
```ts
    cast: d.credits?.cast?.slice(0, 12).map((c) => ({
      id: c.id,
      name: c.name,
      character: c.character || null,
      profile: img(c.profile_path, "w185"),
    })) ?? [],
```
(`img` ya existe en el archivo, línea 18.)

- [ ] **Step 4: Crear `components/CastRail.tsx`**

```tsx
"use client";
import Link from "next/link";
import type { UICastMember } from "@/lib/types";

// Riel horizontal de reparto tipo TMDB: foto + nombre + personaje, cada uno
// linkeando a la ficha de la persona. Sin loading="lazy" a propósito: son pocas
// fotos chicas y el lazy dejó imágenes sin cargar en otros rieles/modales.
export default function CastRail({ cast }: { cast: UICastMember[] }) {
  if (!cast.length) return null;
  return (
    <div className="cast-sec">
      <div className="dsec-h">Reparto</div>
      <div className="cast-rail">
        {cast.map((c) => (
          <Link key={c.id} href={`/persona/${c.id}`} className="cast-card">
            {c.profile
              ? <img className="cast-photo" src={c.profile} alt="" width={80} height={80} />
              : <span className="cast-photo cast-ph" aria-hidden>{c.name.charAt(0)}</span>}
            <span className="cast-name">{c.name}</span>
            {c.character && <span className="cast-char">{c.character}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Usar `CastRail` en `DetailView.tsx`**

Agregar el import junto a los otros (después de la línea 11 `import VoteCounts...`):
```tsx
import CastRail from "./CastRail";
```
Reemplazar la línea 75:
```tsx
        {t.cast.length > 0 && <p className="dcast"><b>Reparto:</b> {t.cast.slice(0, 4).join(", ")}{t.cast.length > 4 ? "…" : ""}</p>}
```
por:
```tsx
        <CastRail cast={t.cast} />
```

- [ ] **Step 6: CSS del riel en `app/globals.css`**

Agregar (junto a otros estilos de la ficha; buscar `.dcast` y poner cerca):
```css
.cast-sec{margin-top:18px}
.cast-rail{display:flex;gap:14px;overflow-x:auto;padding:4px 0 6px;scrollbar-width:none}
.cast-rail::-webkit-scrollbar{display:none}
.cast-card{flex:0 0 auto;width:84px;display:flex;flex-direction:column;align-items:center;text-align:center;text-decoration:none;color:inherit}
.cast-photo{width:80px;height:80px;border-radius:50%;object-fit:cover;background:#2A2D33;display:block}
.cast-ph{display:flex;align-items:center;justify-content:center;font-family:var(--display);font-size:28px;color:var(--dim)}
.cast-name{margin-top:8px;font-size:12.5px;font-weight:600;line-height:1.2}
.cast-char{margin-top:2px;font-size:11.5px;color:var(--dim);line-height:1.2}
.cast-card:hover .cast-name{color:var(--accent)}
```

- [ ] **Step 7: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: PASS (0 errores). Si marca que `t.cast` se usa como string en otro lado, ese lugar es solo `DetailView:75` (ya reemplazado); no hay otros consumidores.

- [ ] **Step 8: Verificación visual**

Run: `npm run dev`, abrir una ficha (ej. una película popular).
Expected: bajo la sinopsis aparece "Reparto" con un riel de fotos redondas + nombre + personaje; al tocar una foto va a `/persona/[id]`. Un actor sin foto muestra un círculo con su inicial.

- [ ] **Step 9: Commit**

```bash
git add lib/tmdb.ts lib/types.ts lib/enrich.ts components/CastRail.tsx components/DetailView.tsx app/globals.css
git commit -m "feat(ficha): reparto con fotos tipo TMDB (riel + link a persona)"
```

---

### Task 2: Rating único con estrella

Reemplaza el desglose de votos por un promedio /10 con estrella, integrado al bloque
de puntajes junto a IMDb/Metacritic/TMDB.

**Files:**
- Create: `components/ScScore.tsx`
- Delete: `components/VoteCounts.tsx`
- Modify: `components/DetailView.tsx` (quitar VoteCounts, meter ScScore en la barra de puntajes)
- Modify: `app/globals.css` (estilo del stat de estrella)

**Interfaces:**
- Consumes: RPC `vote_counts(p_tmdb_id, p_tipo)` → filas `{ rating: number; votos: number }`.
- Produces: `<ScScore id={number} tipo={MediaType} />` (renderiza `null` si 0 votos).

- [ ] **Step 1: Crear `components/ScScore.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import type { MediaType } from "@/lib/types";

// Promedio de votos de la comunidad en escala 1-10 (malaso=2, ta buena=7,
// petacular=10; media ponderada). Lee el agregado público vote_counts (grant
// anon), se ve sin login. Oculto mientras carga o si el título no tiene votos.
const VALUE: Record<number, number> = { 1: 2, 2: 7, 3: 10 };

export default function ScScore({ id, tipo }: { id: number; tipo: MediaType }) {
  const [counts, setCounts] = useState<Record<number, number> | null>(null);

  useEffect(() => {
    let alive = true;
    supabaseBrowser()
      .rpc("vote_counts", { p_tmdb_id: id, p_tipo: tipo })
      .then(({ data, error }) => {
        if (!alive || error) return; // sin migración o error → no se muestra
        const c: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
        for (const row of (data as { rating: number; votos: number }[] | null) ?? []) {
          c[row.rating] = Number(row.votos);
        }
        setCounts(c);
      });
    return () => { alive = false; };
  }, [id, tipo]);

  if (!counts) return null;
  const total = counts[1] + counts[2] + counts[3];
  if (total === 0) return null;
  const avg = (VALUE[1] * counts[1] + VALUE[2] * counts[2] + VALUE[3] * counts[3]) / total;

  return (
    <div className="rb sc-score">
      <div className="lbl">
        <svg className="sc-star" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.3 6.8.6-5.1 4.5 1.5 6.7L12 17l-6 3.6 1.5-6.7L2.4 8.9l6.8-.6z" /></svg>
        SC
      </div>
      <div className="num">{avg.toFixed(1)}<span className="sc-max">/10</span></div>
      <div className="sc-votes">{total} {total === 1 ? "voto" : "votos"}</div>
    </div>
  );
}
```

- [ ] **Step 2: Quitar `VoteCounts` y agregar `ScScore` en `DetailView.tsx`**

Quitar el import de la línea 11 (`import VoteCounts from "./VoteCounts";`) y agregar:
```tsx
import ScScore from "./ScScore";
```
Eliminar la línea 72:
```tsx
        <VoteCounts id={t.id} tipo={t.type} />
```
En el bloque de puntajes, dentro de `<div className="rating-bar">` (línea 85), poner `ScScore` como **primer** hijo:
```tsx
            <div className="rating-bar">
              <ScScore id={t.id} tipo={t.type} />
              {t.imdb != null && <div className="rb imdb"><div className="lbl">IMDb</div><div className="num">{t.imdb.toFixed(1)}</div></div>}
              {t.metacritic != null && <div className="rb mc"><div className="lbl">Metacritic</div><div className="num">{t.metacritic}</div></div>}
              {t.tmdb != null && <div className="rb"><div className="lbl">TMDB</div><div className="num">{t.tmdb.toFixed(1)}</div></div>}
              {t.editorial?.rating != null && <div className="rb ed"><div className="lbl">Reseña SC</div><div className="num">{t.editorial.rating.toFixed(1)}</div></div>}
            </div>
```
(El resto del bloque `{(t.tmdb != null || ...)}` queda igual. Nota: si un título tuviera votos pero ningún puntaje externo —muy raro, TMDB casi siempre trae `vote_average`— la sección no se mostraría; se acepta.)

- [ ] **Step 3: Borrar `components/VoteCounts.tsx`**

```bash
git rm components/VoteCounts.tsx
```

- [ ] **Step 4: CSS del stat de estrella en `app/globals.css`**

Buscar el bloque de `.rating-bar` / `.rb` y agregar debajo:
```css
.sc-score .lbl{display:inline-flex;align-items:center;gap:4px}
.sc-score .sc-star{width:14px;height:14px;color:#f5b301}
.sc-score .sc-max{font-size:.6em;color:var(--dim);font-weight:600}
.sc-score .sc-votes{font-size:11px;color:var(--dim);margin-top:2px}
```
(Reusa `.rb`/`.lbl`/`.num` existentes para que el stat matchee el tamaño de los otros chips.)

- [ ] **Step 5: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: PASS. Confirmar por grep que no quedó ninguna referencia a `VoteCounts`:
Run: `grep -rn "VoteCounts" app components lib` → sin resultados.

- [ ] **Step 6: Verificación visual**

Run: `npm run dev`, logueado, votar un título (malaso/ta buena/petacular con el botón) y recargar la ficha.
Expected: en "Puntajes" aparece ⭐ + promedio /10 + "N votos", y al lado IMDb/Metacritic/TMDB. Un título sin votos NO muestra la estrella (solo los otros puntajes). Ya no aparece la fila malaso/ta buena/petacular.

- [ ] **Step 7: Commit**

```bash
git add components/ScScore.tsx components/DetailView.tsx app/globals.css
git commit -m "feat(ficha): rating único con estrella (promedio de votos /10)"
```

---

### Task 3: Series — temporadas + episodios

Los datos ya existen (`seasons`, `episodes` en `enrich.ts:237-238`) y se muestran
(`DetailView:46` y `:78-79`). Esta task confirma que se ve con datos reales y pule
el texto (singular/plural claro).

**Files:**
- Modify: `components/DetailView.tsx:78-80`

**Interfaces:**
- Consumes: `t.seasons: number | null`, `t.episodes: number | null` (ya en `UITitleDetail`).

- [ ] **Step 1: Pulir la línea de temporadas/episodios en `DetailView.tsx`**

Reemplazar las líneas 78-80:
```tsx
        {t.type === "tv" && (t.seasons != null || t.episodes != null) && (
          <p className="dcast"><b>Temporadas:</b> {t.seasons ?? "—"}{t.episodes != null ? ` · ${t.episodes} episodios` : ""}</p>
        )}
```
por:
```tsx
        {t.type === "tv" && (t.seasons != null || t.episodes != null) && (
          <p className="dcast">
            <b>Serie:</b>{" "}
            {t.seasons != null && `${t.seasons} ${t.seasons === 1 ? "temporada" : "temporadas"}`}
            {t.seasons != null && t.episodes != null && " · "}
            {t.episodes != null && `${t.episodes} ${t.episodes === 1 ? "episodio" : "episodios"}`}
          </p>
        )}
```

- [ ] **Step 2: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Verificación visual**

Run: `npm run dev`, abrir la ficha de una serie (tipo tv).
Expected: se lee "Serie: X temporadas · Y episodios" con datos reales; una serie de 1 temporada dice "1 temporada". En películas esta línea no aparece.

- [ ] **Step 4: Commit**

```bash
git add components/DetailView.tsx
git commit -m "feat(ficha): temporadas y episodios claros en series"
```

---

## Verificación final

- [ ] `npx tsc --noEmit` → 0 errores.
- [ ] Ficha de película con votos: ⭐ promedio /10 + votos + IMDb/Metacritic/TMDB; reparto con fotos.
- [ ] Ficha sin votos: sin estrella, con el resto de puntajes.
- [ ] Ficha de serie: temporadas + episodios; reparto con fotos.
- [ ] Home: shelves "Lo más votados" y "Hacete cargo" siguen igual (no se tocaron); ya no hay desglose malaso/ta buena/petacular en ninguna ficha.

## Self-Review (hecho)

- **Cobertura del spec:** rating estrella (Task 2), reparto con fotos (Task 1), series temporadas/episodios (Task 3), modelo de votos intacto (constraint global + verificación). ✔
- **Placeholders:** sin TODO/TBD; todo el código es literal. ✔
- **Consistencia de tipos:** `UICastMember` definido en Task 1 (types.ts) y consumido por `CastRail`/`enrich`; `ScScore` props `{id, tipo}` consistentes; `VALUE={1:2,2:7,3:10}` coincide con el spec. ✔
