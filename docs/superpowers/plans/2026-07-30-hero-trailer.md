# Trailer en el Hero — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reproducir el trailer de YouTube dentro del Hero de la ficha (`DetailView`), reemplazando el backdrop con un cross-fade, sin modal ni navegación ni cambio de layout.

**Architecture:** El `trailerKey` viaja en la respuesta existente de `/api/title/...` (se agrega `videos` al `append_to_response` ya presente — cero requests extra). Un helper puro `lib/trailer.ts` elige el mejor trailer y arma el embed. En el cliente, `HeroTrailer` maneja el estado play/close y hace el cross-fade; `TrailerPlayer` monta el iframe lazy con controles propios; `TrailerButton` es el disparador. Todo el CSS va a `app/globals.css`.

**Tech Stack:** Next.js 14 App Router, TypeScript, React client components, TMDB `/{type}/{id}?append_to_response=videos`, YouTube `youtube-nocookie` embed + IFrame `postMessage`, `ResizeObserver`, CSS plano.

## Global Constraints

- `npx tsc --noEmit` debe dar **0 errores** tras cada task (única verificación de tipos; no hay test runner en el proyecto).
- **Sin CSS-in-JS ni styled-components**: todo el CSS nuevo va a `app/globals.css`, reusando tokens existentes (`--accent`, `--safe-t`, `--sh`, etc.).
- **Sin dependencias npm nuevas.** Solo APIs del navegador (`ResizeObserver`, `postMessage`, `requestFullscreen`) y de Next/React.
- **No tocar archivos del Service Worker** (`public/sw*`) → no hay que subir `SC_CACHE_VERSION`.
- Todo texto de UI en **español rioplatense**.
- `UITitleDetail` (`lib/types.ts`) es el contrato estable: los campos de datos se agregan ahí primero.
- Región AR fija (no se toca `watch_region`/monetización).

---

### Task 1: Capa de datos — `videos` de TMDB, `pickTrailer`, `trailerKey`

**Files:**
- Modify: `lib/tmdb.ts` (agregar `RawVideo`, `videos` en `RawDetail`, `videos` en el append de `titleDetails`)
- Create: `lib/trailer.ts` (`pickTrailer`, `trailerEmbedUrl`)
- Modify: `lib/types.ts` (agregar `trailerKey` a `UITitleDetail`)
- Modify: `lib/enrich.ts` (usar `pickTrailer` en `detail()`)

**Interfaces:**
- Produces:
  - `export interface RawVideo { key: string; site: string; type: string; official: boolean; name: string; published_at: string }` (en `lib/tmdb.ts`)
  - `export function pickTrailer(videos: RawVideo[]): string | null` (en `lib/trailer.ts`)
  - `export function trailerEmbedUrl(key: string): string` (en `lib/trailer.ts`)
  - `UITitleDetail.trailerKey: string | null`

- [ ] **Step 1: Agregar `RawVideo` y `videos` a `lib/tmdb.ts`**

En `lib/tmdb.ts`, agregar la interfaz `RawVideo` justo antes de `RawDetail` (cerca de la línea 110):

```ts
export interface RawVideo {
  key: string;
  site: string;
  type: string;
  official: boolean;
  name: string;
  published_at: string;
}
```

Dentro de `interface RawDetail { ... }`, agregar una línea (junto a `recommendations`):

```ts
  videos?: { results: RawVideo[] };
```

En `titleDetails()`, agregar `videos` a ambos strings del append:

```ts
export function titleDetails(type: MediaType, id: number) {
  const append = type === "movie"
    ? "credits,external_ids,release_dates,recommendations,videos"
    : "credits,external_ids,content_ratings,recommendations,videos";
  return tmdb<RawDetail>(`/${type}/${id}`, { append_to_response: append });
}
```

- [ ] **Step 2: Crear `lib/trailer.ts`**

```ts
// Selección de trailer de YouTube y armado del embed.
// Reutilizable (sirve también para features futuras tipo Trailer Zone).
import type { RawVideo } from "./tmdb";

// Devuelve la key de YouTube del mejor trailer, o null si no hay ninguno válido.
// Prioridad: official Trailer > Trailer > official Teaser > Teaser.
// Solo se consideran Trailer y Teaser; se ignoran Clip, Featurette,
// Behind the Scenes, Bloopers, Opening Credits y cualquier otro tipo.
export function pickTrailer(videos: RawVideo[]): string | null {
  const yt = videos.filter((v) => v.site === "YouTube" && !!v.key);
  const find = (type: string, officialOnly: boolean) =>
    yt.find((v) => v.type === type && (!officialOnly || v.official));
  const pick =
    find("Trailer", true) ??
    find("Trailer", false) ??
    find("Teaser", true) ??
    find("Teaser", false);
  return pick?.key ?? null;
}

const EMBED_PARAMS = new URLSearchParams({
  autoplay: "1",
  mute: "1",         // arranca muteado siempre (autoplay confiable en todos lados)
  controls: "1",
  rel: "0",          // best-effort: YouTube ya no elimina relacionados del todo
  playsinline: "1",  // evita fullscreen forzado en iOS
  modestbranding: "1",
  enablejsapi: "1",  // habilita postMessage para mute/unMute
}).toString();

export function trailerEmbedUrl(key: string): string {
  return `https://www.youtube-nocookie.com/embed/${key}?${EMBED_PARAMS}`;
}
```

- [ ] **Step 3: Agregar `trailerKey` al contrato en `lib/types.ts`**

Dentro de `interface UITitleDetail extends UITitle { ... }`, agregar (junto a `watchLink`):

```ts
  trailerKey: string | null; // key de YouTube del mejor trailer, o null
```

- [ ] **Step 4: Usar `pickTrailer` en `detail()` de `lib/enrich.ts`**

Agregar el import cerca de los otros imports de `lib/*` (arriba del archivo):

```ts
import { pickTrailer } from "./trailer";
```

En el objeto que retorna `detail()` (el `return { ... }` alrededor de la línea 286-312), agregar una propiedad junto a `watchLink`:

```ts
    trailerKey: pickTrailer(d.videos?.results ?? []),
```

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 6: Verificación funcional contra títulos reales**

Levantar dev (`npm run dev`) y pedir el detalle por API:

Run (PowerShell): `curl.exe "http://localhost:3000/api/title/movie/27205?providers=n,d,m"`
Expected: el JSON incluye `"trailerKey":"<11 chars>"` (Inception tiene trailer oficial de YouTube).

Run (PowerShell): `curl.exe "http://localhost:3000/api/title/movie/278?providers=n,d,m"`
Expected: `"trailerKey"` presente (string) o `null` — el campo **existe** en la respuesta en ambos casos.

- [ ] **Step 7: Commit**

```bash
git add lib/tmdb.ts lib/trailer.ts lib/types.ts lib/enrich.ts
git commit -m "feat(hero-trailer): datos de trailer (videos TMDB + pickTrailer + trailerKey)"
```

---

### Task 2: `TrailerPlayer` — iframe lazy, cover, controles y estados

**Files:**
- Create: `components/TrailerPlayer.tsx`
- Modify: `app/globals.css` (estilos `.htrailer-player`, iframe cover, `.htrailer-ctl`, spinner, mensaje de error, reduced-motion)

**Interfaces:**
- Consumes: `trailerEmbedUrl(key: string): string` (de `lib/trailer.ts`, Task 1)
- Produces: `export default function TrailerPlayer(props: { youtubeKey: string; onClose: () => void })`

- [ ] **Step 1: Crear `components/TrailerPlayer.tsx`**

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { trailerEmbedUrl } from "@/lib/trailer";

const YT_ORIGIN = "https://www.youtube-nocookie.com";

export default function TrailerPlayer({ youtubeKey, onClose }: { youtubeKey: string; onClose: () => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [muted, setMuted] = useState(true);
  const [nonce, setNonce] = useState(0); // remonta el iframe al reintentar

  // Foco al botón cerrar al montar (accesibilidad).
  useEffect(() => { closeRef.current?.focus(); }, []);

  // Cover: dimensiona el iframe para cubrir la caja manteniendo 16:9.
  useEffect(() => {
    const fit = () => {
      const box = wrapRef.current, ifr = iframeRef.current;
      if (!box || !ifr) return;
      const w = box.clientWidth, h = box.clientHeight;
      ifr.style.width = Math.max(w, (h * 16) / 9) + "px";
      ifr.style.height = Math.max(h, (w * 9) / 16) + "px";
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [nonce]);

  // Timeout de carga → estado error, sin romper el hero.
  useEffect(() => {
    if (status !== "loading") return;
    const t = setTimeout(() => setStatus((s) => (s === "loading" ? "error" : s)), 8000);
    return () => clearTimeout(t);
  }, [status, nonce]);

  const command = (func: "mute" | "unMute") => {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func, args: [] }),
      YT_ORIGIN,
    );
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    command(next ? "mute" : "unMute");
  };

  const toggleFullscreen = () => {
    iframeRef.current?.requestFullscreen?.().catch(() => {});
  };

  const retry = () => { setStatus("loading"); setNonce((n) => n + 1); };

  if (status === "error") {
    return (
      <div className="htrailer-player htrailer-msg">
        <p>No se pudo cargar el tráiler.</p>
        <div className="htrailer-msg-actions">
          <button onClick={retry}>Reintentar</button>
          <button ref={closeRef} onClick={onClose}>Cerrar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="htrailer-player" ref={wrapRef}>
      {status === "loading" && <div className="htrailer-spin" aria-hidden />}
      <iframe
        key={nonce}
        ref={iframeRef}
        src={trailerEmbedUrl(youtubeKey)}
        title="Tráiler"
        allow="autoplay; encrypted-media; fullscreen"
        allowFullScreen
        onLoad={() => setStatus("ready")}
        className={status === "ready" ? "is-ready" : ""}
      />
      <div className="htrailer-ctl">
        <button onClick={toggleMute} aria-label={muted ? "Activar sonido" : "Silenciar"}>
          {muted ? "🔇" : "🔊"}
        </button>
        <button onClick={toggleFullscreen} aria-label="Pantalla completa">⛶</button>
        <button ref={closeRef} onClick={onClose} aria-label="Cerrar tráiler">✕</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Agregar los estilos a `app/globals.css`**

Agregar al final del archivo (o junto al bloque `.dhero`), reusando `--safe-t`:

```css
/* ==========================================================================
   Trailer en el Hero
   ========================================================================== */
.htrailer-player{position:absolute;inset:0;z-index:1;overflow:hidden;background:#000;animation:htrailer-in .28s ease both}
@keyframes htrailer-in{from{opacity:0}to{opacity:1}}
.htrailer-player iframe{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);border:0;background:#000;opacity:0;transition:opacity .2s ease}
.htrailer-player iframe.is-ready{opacity:1}
.htrailer-player iframe:fullscreen{width:100%!important;height:100%!important;left:0;top:0;transform:none!important}

.htrailer-spin{position:absolute;top:50%;left:50%;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:3px solid rgba(255,255,255,.25);border-top-color:#fff;animation:htrailer-spin 1s linear infinite;z-index:1}
@keyframes htrailer-spin{to{transform:rotate(360deg)}}

.htrailer-ctl{position:absolute;top:calc(var(--safe-t) + 14px);right:14px;z-index:2;display:flex;gap:8px}
.htrailer-ctl button{width:38px;height:38px;border-radius:50%;border:none;background:rgba(0,0,0,.5);color:#fff;font-size:15px;line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
.htrailer-ctl button:hover{background:rgba(0,0,0,.7)}

.htrailer-msg{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:#fff;text-align:center;padding:20px}
.htrailer-msg-actions{display:flex;gap:10px}
.htrailer-msg-actions button{height:38px;padding:0 16px;border-radius:9px;border:1px solid rgba(255,255,255,.35);background:transparent;color:#fff;cursor:pointer}

@media (prefers-reduced-motion: reduce){
  .htrailer-player{animation:none}
  .htrailer-player iframe{transition:none}
  .htrailer-spin{animation-duration:2s}
}
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: 0 errores.

Nota: el chequeo visual/funcional real de este componente se hace integrado en la Task 3 (montado dentro de `HeroTrailer`). Acá alcanza con tipos OK.

- [ ] **Step 4: Commit**

```bash
git add components/TrailerPlayer.tsx app/globals.css
git commit -m "feat(hero-trailer): TrailerPlayer (iframe cover, mute/fullscreen, estados)"
```

---

### Task 3: `TrailerButton` + `HeroTrailer` + integración en `DetailView`

**Files:**
- Create: `components/TrailerButton.tsx`
- Create: `components/HeroTrailer.tsx`
- Modify: `components/DetailView.tsx` (reemplazar el bloque `.dhero` por `<HeroTrailer />`)
- Modify: `app/globals.css` (estilo `.htrailer-btn`)

**Interfaces:**
- Consumes:
  - `TrailerPlayer` (Task 2)
  - `UITitleDetail.trailerKey` (Task 1)
- Produces:
  - `export default function TrailerButton(props: { onPlay: () => void })`
  - `export default function HeroTrailer(props: { heroStyle: CSSProperties; onBack: () => void; trailerKey: string | null })`

- [ ] **Step 1: Crear `components/TrailerButton.tsx`**

```tsx
"use client";
import { forwardRef } from "react";

// forwardRef para que HeroTrailer pueda devolverle el foco al cerrar el player.
const TrailerButton = forwardRef<HTMLButtonElement, { onPlay: () => void }>(
  function TrailerButton({ onPlay }, ref) {
    return (
      <button ref={ref} className="htrailer-btn" onClick={onPlay} aria-label="Ver tráiler">
        <span className="play"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg></span>
        <span>Ver tráiler</span>
      </button>
    );
  },
);
export default TrailerButton;
```

- [ ] **Step 2: Crear `components/HeroTrailer.tsx`**

```tsx
"use client";
import { CSSProperties, useEffect, useRef, useState } from "react";
import TrailerButton from "./TrailerButton";
import TrailerPlayer from "./TrailerPlayer";

export default function HeroTrailer(
  { heroStyle, onBack, trailerKey }:
  { heroStyle: CSSProperties; onBack: () => void; trailerKey: string | null },
) {
  const [playing, setPlaying] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const openedOnce = useRef(false);

  // Esc cierra el player.
  useEffect(() => {
    if (!playing) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPlaying(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing]);

  // Al cerrar, devolver el foco al botón de play (sin robarlo en el montaje).
  useEffect(() => {
    if (playing) { openedOnce.current = true; return; }
    if (openedOnce.current) btnRef.current?.focus();
  }, [playing]);

  // El backdrop (heroStyle) queda siempre debajo: al cerrar, el hero vuelve
  // idéntico sin salto. El player hace fade-in por encima.
  return (
    <div className="dhero" style={heroStyle}>
      <button className="dback" onClick={onBack} aria-label="Volver">
        <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
      </button>
      {trailerKey && !playing && <TrailerButton ref={btnRef} onPlay={() => setPlaying(true)} />}
      {trailerKey && playing && (
        <TrailerPlayer youtubeKey={trailerKey} onClose={() => setPlaying(false)} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Integrar en `components/DetailView.tsx`**

Agregar el import junto a los otros de componentes (cerca de la línea 13):

```tsx
import HeroTrailer from "./HeroTrailer";
```

Reemplazar el bloque actual del hero (líneas ~36-40):

```tsx
      <div className="dhero" style={heroBg}>
        <button className="dback" onClick={() => router.back()} aria-label="Volver">
          <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
      </div>
```

por:

```tsx
      <HeroTrailer heroStyle={heroBg} onBack={() => router.back()} trailerKey={t.trailerKey} />
```

(`heroBg` y `router` ya existen en el componente; no se agregan variables nuevas.)

- [ ] **Step 4: Agregar el estilo del botón a `app/globals.css`**

Junto al bloque "Trailer en el Hero" de la Task 2:

```css
.htrailer-btn{position:absolute;left:22px;bottom:18px;z-index:2;display:inline-flex;align-items:center;gap:9px;height:44px;padding:0 18px 0 12px;border:none;border-radius:11px;background:rgba(0,0,0,.5);color:#fff;font-size:14px;font-weight:600;cursor:pointer;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
.htrailer-btn:hover{background:rgba(0,0,0,.68)}
.htrailer-btn .play{width:30px;height:30px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center}
.htrailer-btn .play svg{width:13px;height:13px;fill:#fff;margin-left:2px}
```

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 6: Verificación visual/funcional (dev)**

Con `npm run dev`, abrir una ficha con trailer (ej. `http://localhost:3000/titulo/movie/27205`) y confirmar:
- Aparece "▶ Ver tráiler" abajo-izquierda del hero.
- Al clickear: fade-in al reproductor en la **misma caja** (misma altura del hero, sin salto de layout), autoplay **muteado**.
- El video **cubre** la caja sin barras negras (recorte lateral).
- 🔇→🔊 activa/desactiva sonido; ⛶ abre fullscreen; el botón de volver sigue visible arriba-izquierda.
- `✕` (o tecla `Esc`) detiene y desmonta el iframe → vuelve al hero idéntico, sin sonido de fondo, scroll intacto.
- Abrir una ficha **sin** trailer (verificable con el `trailerKey:null` de la Task 1) → **no** aparece el botón.

- [ ] **Step 7: Verificación del embed real (build de producción)**

El SW no corre en `next dev`; para validar el embed y el autoplay reales:

Run: `npx next build`
Expected: compila sin errores (puede fallar solo por fuentes de Google sin red — no es error real).

Luego `npx next start` y repetir el chequeo del Step 6 en `http://localhost:3000`.

- [ ] **Step 8: Commit**

```bash
git add components/TrailerButton.tsx components/HeroTrailer.tsx components/DetailView.tsx app/globals.css
git commit -m "feat(hero-trailer): TrailerButton + HeroTrailer + integración en la ficha"
```

---

## Notas de verificación global

- No hay test runner en el proyecto (decisión del dueño): la verificación de cada task es `npx tsc --noEmit` + los chequeos funcionales/visuales descriptos.
- `pickTrailer` se valida funcionalmente vía `/api/title/...` (Task 1, Step 6) contra títulos reales con y sin trailer.
- Riesgo conocido y su fallback: si `mute`/`unMute` por `postMessage` resultara inconsistente en algún navegador, el fallback es remontar el iframe con el parámetro `mute` invertido (cuesta reiniciar la repro). No se implementa en v1 salvo que aparezca el problema.
