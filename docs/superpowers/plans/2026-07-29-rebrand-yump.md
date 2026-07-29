# Rebrand a Yump (look completo) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar la identidad Yump a la app: paleta de colores, tipografía Plus Jakarta Sans, wordmark en el topbar, nombre/metadata "Yump", e íconos PWA regenerados desde el ícono Yump.

**Architecture:** Task 1 es CSS/metadata/texto (sin assets nuevos). Task 2 trae los wordmarks del proyecto de diseño (DesignSync) y los pone en el topbar según tema. Task 3 trae el ícono Yump y regenera el set PWA adaptando el generador.

**Tech Stack:** Next.js 14 App Router, TypeScript, CSS plano (`app/globals.css`), `next/font/google`, sharp (generador PWA), MCP `DesignSync`.

## Global Constraints

- **No hay test runner** (por diseño). Cada task se valida con `npx tsc --noEmit` (0 errores) + chequeo visual. Copiado del CLAUDE.md.
- **Marca Yump** (proyecto DesignSync `87fae761-2a17-427b-a34b-4497a12e6248`): accent coral `#F58634`, pink `#ED2F59`, amber `#F79433`, gradiente `linear-gradient(135deg,#ED2F59 0%,#F58634 55%,#F79433 100%)`, off-white `#FAFAFD`, oled `#0F0E13`; fuente **Plus Jakarta Sans**.
- **Sin cambios de schema, modelo de votos, ni lógica del SW** (solo bump `CACHE_VERSION` por editar `offline.html` precacheado).
- **CSS solo en `app/globals.css`. Texto UI en español rioplatense.**
- Assets de marca del proyecto DesignSync se traen con `get_file` (base64) y se escriben a `public/brand/`. El contenido binario queda en el contexto del subagente, no en el del controlador.
- **Rama:** `feat/rebrand-yump` (creada, con el spec commiteado).

---

### Task 1: Colores + tipografía + nombre/metadata + textos

**Files:**
- Modify: `app/globals.css` (`:root`, `[data-theme="dark"]`, `--display`/`--body`)
- Modify: `app/layout.tsx` (fuente, `viewport.themeColor`, `metadata`)
- Modify: `app/manifest.ts` (name/short_name/theme_color/background_color)
- Modify: `app/cuenta/page.tsx`, `components/pwa/UpdateToast.tsx`, `components/pwa/InstallPrompt.tsx`, `public/offline.html`, `app/admin/login/page.tsx` (texto "StreamingCentral" → "Yump")
- Modify: `public/sw.js` (`CACHE_VERSION`)

- [ ] **Step 1: Paleta Yump en `:root` (claro) — `app/globals.css`**

Reemplazar (líneas ~6-13 del `:root`):
```css
  --bg:#F5F5F2;--surface:#FFFFFF;--surface-2:#EEEEE9;
  --line:#E4E4DE;--line-2:#D4D4CC;
  --text:#16171B;--dim:#65696F;--faint:#9A9EA6;
  /* acento provisional: naranja vivo (cambiar al definir marca) */
  --accent:#FF6A1A;--editorial:#E1452B;--good:#11A56A;
```
por:
```css
  --bg:#FAFAFD;--surface:#FFFFFF;--surface-2:#F0F0F4;
  --line:#E8E8EE;--line-2:#DADAE2;
  --text:#1E1D21;--dim:#6C727F;--faint:#A6ABB5;
  /* Marca Yump */
  --accent:#F58634;--editorial:#ED2F59;--good:#2FBE72;
  --gradient-yump:linear-gradient(135deg,#ED2F59 0%,#F58634 55%,#F79433 100%);
```
Y en el mismo `:root`, cambiar `--bg-rgb:245,245,242;` por `--bg-rgb:250,250,253;`.

- [ ] **Step 2: Paleta Yump en `[data-theme="dark"]` — `app/globals.css`**

Reemplazar (bloque dark, líneas ~28-34):
```css
  --bg:#16171B;--surface:#1D1F24;--surface-2:#25272D;
  --line:#2E3038;--line-2:#3A3D46;
  --text:#F1F1F0;--dim:#9BA0A8;--faint:#6B6F78;
  --accent:#FF6A1A;--editorial:#E1452B;--good:#11A56A;
```
por:
```css
  --bg:#0F0E13;--surface:#1C1B22;--surface-2:#272530;
  --line:#2C2A35;--line-2:#3A3745;
  --text:#F8F9FA;--dim:#9A98A3;--faint:#6B6874;
  --accent:#F58634;--editorial:#ED2F59;--good:#2FBE72;
```
Y cambiar `--bg-rgb:22,23,27;` por `--bg-rgb:15,14,19;`.

- [ ] **Step 3: Fuentes → Plus Jakarta Sans (`app/globals.css`)**

En `:root`, cambiar:
```css
  --display:var(--font-display),sans-serif;--body:var(--font-body),system-ui,sans-serif;
```
por:
```css
  --display:var(--font-jakarta),system-ui,sans-serif;--body:var(--font-jakarta),system-ui,sans-serif;
```

- [ ] **Step 4: Cargar Plus Jakarta Sans en `app/layout.tsx`**

Reemplazar el import y las dos instancias de fuente:
```ts
import { Bricolage_Grotesque, Inter } from "next/font/google";
```
por:
```ts
import { Plus_Jakarta_Sans } from "next/font/google";
```
Reemplazar:
```ts
const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const body = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });
```
por:
```ts
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });
```
Y en el `<html>`, cambiar `className={`${display.variable} ${body.variable}`}` por `className={jakarta.variable}`.

- [ ] **Step 5: theme-color + metadata "Yump" en `app/layout.tsx`**

En `viewport.themeColor`, cambiar los colores:
```ts
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAFAFD" },
    { media: "(prefers-color-scheme: dark)", color: "#0F0E13" },
  ],
```
En `metadata`: `title: "Yump"`, `applicationName: "Yump"`, y `appleWebApp.title: "Yump"`.

- [ ] **Step 6: `app/manifest.ts` → Yump**

Cambiar:
```ts
    name: "Yump — Qué ver en tus plataformas",
    short_name: "Yump",
```
y `theme_color: "#FAFAFD"`, `background_color: "#FAFAFD"`.

- [ ] **Step 7: Textos visibles "StreamingCentral" → "Yump"**

En cada archivo, reemplazar solo el texto visible (no cache keys ni package name):
- `app/cuenta/page.tsx`: "Entrá a tu cuenta de StreamingCentral." → "Entrá a tu cuenta de Yump."
- `components/pwa/UpdateToast.tsx`: cualquier "StreamingCentral" → "Yump".
- `components/pwa/InstallPrompt.tsx`: cualquier "StreamingCentral" → "Yump".
- `public/offline.html`: cualquier "StreamingCentral" → "Yump".
- `app/admin/login/page.tsx`: cualquier "StreamingCentral" → "Yump".

(Usar grep para ubicar la cadena exacta en cada archivo y reemplazar el texto visible.)

- [ ] **Step 8: Bump `CACHE_VERSION` en `public/sw.js`**

`self.SC_CACHE_VERSION = "v5";` → `"v6";` (se editó `offline.html`, precacheado).

- [ ] **Step 9: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: PASS (0 errores).

- [ ] **Step 10: Verificación visual**

Run: `npm run dev`.
Expected: acento coral (#F58634), fondos off-white (claro) / oled (oscuro), fuente Plus Jakarta Sans; título de la pestaña "Yump"; en la UI nada dice "StreamingCentral". (El wordmark del topbar es la Task 2.)

- [ ] **Step 11: Commit**

```bash
git add app/globals.css app/layout.tsx app/manifest.ts app/cuenta/page.tsx components/pwa/UpdateToast.tsx components/pwa/InstallPrompt.tsx public/offline.html app/admin/login/page.tsx public/sw.js
git commit -m "feat(rebrand): paleta Yump + Plus Jakarta Sans + nombre/metadata Yump"
```

---

### Task 2: Wordmark de Yump en el TopBar

**Files:**
- Create: `public/brand/yump-wordmark-black.png`, `public/brand/yump-wordmark-white.png` (traídos de DesignSync)
- Modify: `components/TopBar.tsx` (lockup)
- Modify: `app/globals.css` (`.brand`)

**Interfaces:**
- Consumes: assets en `public/brand/`.

- [ ] **Step 1: Traer los wordmarks del proyecto de diseño (DesignSync)**

Con el MCP `DesignSync` (cargar el schema con ToolSearch si hace falta), método `get_file` sobre el proyecto `87fae761-2a17-427b-a34b-4497a12e6248`:
- `assets/logos/yump-wordmark-black.png` → devuelve `content` en base64 (`isBase64:true`).
- `assets/logos/yump-wordmark-white.png` → idem.

Decodificar cada base64 y escribir a `public/brand/yump-wordmark-black.png` y `public/brand/yump-wordmark-white.png` (ej.: `node -e "require('fs').writeFileSync('public/brand/yump-wordmark-black.png', Buffer.from(process.argv[1],'base64'))" "<BASE64>"`, o volcando el base64 a un archivo temporal y decodificando). Verificar con `node -e "console.log(require('fs').statSync('public/brand/yump-wordmark-black.png').size)"` que pesan > 0.
Si algún `get_file` viene `truncated:true` (archivo > 256 KiB), NO escribir un PNG corrupto: reportar BLOCKED pidiendo el asset por otra vía.

- [ ] **Step 2: Wordmark en `components/TopBar.tsx`**

Reemplazar el lockup de marca actual:
```tsx
        <Link href="/" className="brand">
          <span className="mk"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg></span>
          Streaming<span>Central</span>
        </Link>
```
por:
```tsx
        <Link href="/" className="brand" aria-label="Yump — inicio">
          <img className="brand-wm brand-wm-light" src="/brand/yump-wordmark-black.png" alt="" />
          <img className="brand-wm brand-wm-dark" src="/brand/yump-wordmark-white.png" alt="" />
        </Link>
```

- [ ] **Step 3: Estilos del wordmark en `app/globals.css`**

Reemplazar las reglas del brand actual (`.brand`, `.brand .mk`, `.brand .mk svg`, `.brand span`):
```css
.brand{font-family:var(--display);font-weight:700;font-size:20px;letter-spacing:-.03em;display:flex;align-items:center;gap:9px;white-space:nowrap;cursor:pointer}
.brand .mk{width:26px;height:26px;border-radius:8px;background:var(--accent);display:flex;align-items:center;justify-content:center}
.brand .mk svg{width:15px;height:15px;fill:#fff}
.brand span{font-weight:400;color:var(--dim)}
```
por:
```css
.brand{display:flex;align-items:center;height:26px;cursor:pointer}
.brand-wm{height:24px;width:auto;display:block}
.brand-wm-dark{display:none}
[data-theme="dark"] .brand-wm-light{display:none}
[data-theme="dark"] .brand-wm-dark{display:block}
```

- [ ] **Step 4: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Verificación visual**

Run: `npm run dev`.
Expected: el topbar muestra el wordmark **Yump** (negro en tema claro, blanco en oscuro), sin el cuadrado con triángulo ni el texto. Cambiar el tema conmuta el wordmark.

- [ ] **Step 6: Commit**

```bash
git add public/brand/yump-wordmark-black.png public/brand/yump-wordmark-white.png components/TopBar.tsx app/globals.css
git commit -m "feat(rebrand): wordmark de Yump en el topbar (negro/blanco por tema)"
```

---

### Task 3: Íconos PWA desde el ícono Yump

**Files:**
- Create: `public/brand/yump-icon.png` (traído de DesignSync)
- Modify: `scripts/generate-pwa-assets.mjs`
- Regenerate: `public/icons/*`, `app/icon.png`, `app/apple-icon.png`, `public/splash/*`

- [ ] **Step 1: Traer el ícono Yump (DesignSync) y verlo**

`DesignSync.get_file` sobre `assets/logos/yump-icon.png` → decodificar base64 y escribir a `public/brand/yump-icon.png`. Luego **Read** el PNG (imagen) para ver su composición: ¿es un tile con fondo propio, o un glifo sobre transparente? Esto decide el compositing del Step 2.

- [ ] **Step 2: Adaptar `scripts/generate-pwa-assets.mjs` para usar el ícono Yump**

Cambiar la cara del ícono para que use `public/brand/yump-icon.png` en vez del triángulo play. Dos casos según lo visto en Step 1:
- **Ícono ya es un tile con fondo**: usar el PNG redimensionado directamente como cara (para `rounded`/`fullBleed`), y para `maskable` componer el PNG (escalado a ~62% / zona segura) centrado sobre un fondo de marca.
- **Ícono es glifo transparente**: componer el PNG (con `sharp().composite`) centrado sobre un fondo `--accent`/gradiente Yump; para maskable, escalar a la zona segura.

Concretamente: reemplazar `iconSvg()`/`png()` por un pipeline con sharp que parte del PNG. Ejemplo de compositing sobre fondo (glifo transparente):
```js
async function iconPng(size, { bleed = false, safe = 1 } = {}) {
  const bg = { create: { width: 512, height: 512, channels: 4, background: "#F58634" } };
  const glyphSize = Math.round(512 * 0.6 * safe);
  const glyph = await sharp("public/brand/yump-icon.png").resize(glyphSize, glyphSize, { fit: "contain", background: { r:0,g:0,b:0,alpha:0 } }).png().toBuffer();
  let img = sharp(bg).composite([{ input: glyph, gravity: "centre" }]);
  if (!bleed) { /* esquinas redondeadas via máscara SVG rounded-rect */ }
  return img.resize(size, size).png().toBuffer();
}
```
Actualizar `ACCENT` y `SPLASH_BG` a la marca Yump (accent `#F58634`; SPLASH_BG el fondo de splash, ej. off-white `#FAFAFD` claro u oled — mantener el criterio actual del archivo). Mantener los shortcuts (glifos) y screenshots como están si no aportan al rebrand del ícono principal; regenerarlos es opcional.
> Nota: el generador es la fuente única de los 26 assets. Ajustar la cara del
> ícono y dejar que el resto del pipeline (favicon, apple, splash) fluya igual.

- [ ] **Step 3: Regenerar los assets**

Run: `node scripts/generate-pwa-assets.mjs`
Expected: se regeneran `public/icons/*`, `app/icon.png`, `app/apple-icon.png`, `public/splash/*` sin errores. Verificar visualmente 2-3 (`public/icons/icon-512.png`, `icon-maskable-512.png`, `app/apple-icon.png`) con **Read** que muestren el ícono Yump, y que el maskable tenga zona segura (el glifo no tocado por el recorte de círculo).

- [ ] **Step 4: Verificar tsc + que el manifest apunta bien**

Run: `npx tsc --noEmit`
Expected: PASS. (El manifest ya referencia `/icons/icon-*.png`; los paths no cambian.)

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-pwa-assets.mjs public/brand/yump-icon.png public/icons app/icon.png app/apple-icon.png public/splash
git commit -m "feat(rebrand): íconos PWA regenerados desde el ícono Yump"
```

---

## Verificación final

- [ ] `npx tsc --noEmit` → 0 errores.
- [ ] Visual: acento coral, off-white/oled, Plus Jakarta Sans; topbar con wordmark Yump (negro/blanco por tema); pestaña y metadata "Yump"; nada dice "StreamingCentral" en la UI.
- [ ] `npx next build` compila (fuentes se bajan en Vercel; un fallo solo por fuentes sin red no es error real).
- [ ] PWA (`next build && next start`): DevTools → Manifest muestra "Yump" + íconos Yump; el favicon/tab y el apple-icon son el ícono Yump; splash con el ícono Yump.

## Self-Review (hecho)

- **Cobertura del spec:** colores (Task 1 Steps 1-2), tipografía (Steps 3-4), nombre/metadata/textos (Steps 5-8), wordmark topbar (Task 2), íconos PWA (Task 3). ✔
- **Placeholders:** el compositing del ícono (Task 3 Step 2) depende de ver el PNG — procedimiento explícito con dos ramas concretas, no un placeholder. Resto código literal. ✔
- **Consistencia:** `--font-jakarta` definido en layout y consumido en globals; `public/brand/yump-*` producido en Tasks 2/3 y consumido por TopBar/generador; valores de color coinciden con el spec. ✔
