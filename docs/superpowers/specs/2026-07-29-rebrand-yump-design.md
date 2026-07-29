# Rebrand a Yump — diseño (look completo)

Fecha: 2026-07-29
Estado: aprobado (brainstorming), pendiente de plan.

## Objetivo

Aplicar la identidad **Yump** (del "Yump Design System" en claude.ai/design,
proyecto `87fae761-2a17-427b-a34b-4497a12e6248`) a la app: logo, colores,
tipografía y nombre. Alcance = **look completo** (no adoptar aún tokens/
componentes del design system; eso es una iteración futura).

Fuente de marca (leída del proyecto, tratada como datos de spec):

- **Logos**: `assets/logos/yump-wordmark-black.png` (fondos claros),
  `yump-wordmark-white.png` (oscuros), `yump-icon.png` (ícono).
- **Colores** (`tokens/colors.css`): pink `#ED2F59`, coral `#F58634`,
  amber `#F79433`, gradiente `linear-gradient(135deg,#ED2F59 0%,#F58634 55%,#F79433 100%)`;
  charcoal `#333235`, oled `#0F0E13`, surface-dark-1 `#1C1B22`,
  surface-dark-2 `#272530`, off-white `#FAFAFD`, white `#FFFFFF`;
  text light `#1E1D21`/`#6C727F`, text dark `#F8F9FA`/`#9A98A3`;
  success `#2FBE72`, warning `#F7B733`, danger `#E5344B`, info `#3A8DF5`;
  **accent = coral `#F58634`**, focus-ring `#F58634`.
- **Tipografía** (`tokens/fonts.css`): **Plus Jakarta Sans** (display + body).

Sin cambios de schema, modelo de votos ni lógica del Service Worker (solo bump
de `CACHE_VERSION` por editar assets precacheados).

## 1. Colores — `app/globals.css` (`:root` + `[data-theme="dark"]`)

Remap de tokens actuales → Yump. La estructura de variables no cambia (mismos
nombres), solo los valores:

| token | claro (hoy → Yump) | oscuro (hoy → Yump) |
|---|---|---|
| `--bg` | `#F5F5F2` → `#FAFAFD` | `#16171B` → `#0F0E13` |
| `--surface` | `#FFFFFF` → `#FFFFFF` | `#1D1F24` → `#1C1B22` |
| `--surface-2` | `#EEEEE9` → `#F0F0F4` | `#25272D` → `#272530` |
| `--line` | `#E4E4DE` → `#E8E8EE` | `#2E3038` → `#2C2A35` |
| `--line-2` | `#D4D4CC` → `#DADAE2` | `#3A3D46` → `#3A3745` |
| `--text` | `#16171B` → `#1E1D21` | `#F1F1F0` → `#F8F9FA` |
| `--dim` | `#65696F` → `#6C727F` | `#9BA0A8` → `#9A98A3` |
| `--faint` | `#9A9EA6` → `#A6ABB5` | `#6B6F78` → `#6B6874` |
| `--accent` | `#FF6A1A` → `#F58634` | idem `#F58634` |
| `--editorial` | `#E1452B` → `#ED2F59` (yump-pink) | idem |
| `--good` | `#11A56A` → `#2FBE72` (success) | idem |
| `--bg-rgb` | `245,245,242` → `250,250,253` | `22,23,27` → `15,14,19` |

Sombras (`--sh`/`--sh-h`) se mantienen. Se agrega un token de gradiente para uso
opcional en acentos de marca:
```css
--gradient-yump:linear-gradient(135deg,#ED2F59 0%,#F58634 55%,#F79433 100%);
```

## 2. Tipografía — `app/layout.tsx`

Reemplazar los imports de `Bricolage_Grotesque` (display) e `Inter` (body) por
**una** instancia de `Plus_Jakarta_Sans` de `next/font/google` (variable font,
subset latin), y mapear ambas variables CSS a esa fuente:

- `layout.tsx`: `const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });` y aplicar `jakarta.variable` en `<html className>`.
- `app/globals.css`: `--display` y `--body` pasan a `var(--font-jakarta), system-ui, sans-serif`.

(Plus Jakarta Sans es variable en Google Fonts: se cargan todos los pesos sin
listar `weight`.)

## 3. Logo en el TopBar — `components/TopBar.tsx` + `app/globals.css`

Reemplazar el lockup de texto actual (`.brand`: cuadradito `.mk` con triángulo
play + "Streaming" + span "Central") por el **wordmark de Yump**:

- Traer los wordmarks a `public/brand/yump-wordmark-black.png` y `-white.png`.
- El `<Link href="/" className="brand">` muestra el wordmark **según tema**:
  negro en claro, blanco en oscuro. Implementación: dos `<img>` conmutadas por
  CSS (`[data-theme="dark"]`), o una imagen con filtro; se define en el plan.
  Alto ~24-26px (matchea la altura visual del brand actual).
- Se elimina el `.mk` (triángulo) y el texto; el wordmark ya es la marca.

## 4. Nombre / metadata → Yump

- `app/layout.tsx` metadata: `title`, `applicationName`, `appleWebApp.title`
  → **"Yump"**; `themeColor` → light `#FAFAFD` / dark `#0F0E13` (matchea `--bg`).
- `app/manifest.ts`: `name` → "Yump — Qué ver en tus plataformas",
  `short_name` → "Yump", `theme_color`/`background_color` → `#FAFAFD` (o `#0F0E13`
  para coherencia con la barra; se usa `#FAFAFD` como página por defecto).
- Textos visibles "StreamingCentral" → "Yump": `app/cuenta/page.tsx`
  ("Entrá a tu cuenta de…"), `components/pwa/UpdateToast.tsx`,
  `components/pwa/InstallPrompt.tsx`, `public/offline.html`,
  `app/admin/login/page.tsx`.
- **`CACHE_VERSION` v5 → v6** en `public/sw.js` (se editó `offline.html`, que es
  precacheado por el SW).
- Nombres internos que NO cambian: cache keys `sc-*` del SW (internos), el
  `package.json` name, el string fallback `"streamingcentral"` en `lib/avatar.ts`
  (semilla, no visible).

## 5. Íconos PWA — regenerar desde el ícono Yump

`scripts/generate-pwa-assets.mjs` hoy dibuja un SVG (fondo acento + triángulo
play) y rasteriza 26 assets. Se adapta para usar el **ícono Yump** (PNG) como
cara del ícono:

- Traer `public/brand/yump-icon.png` (o `assets/brand/`).
- Ver el PNG para decidir el compositing: si el ícono ya trae fondo/tile, se usa
  redimensionado; si es glifo transparente, se compone sobre fondo (acento o
  gradiente Yump) con zona segura para los maskable.
- Regenerar íconos (192/512, maskable 192/512, `app/apple-icon.png`,
  `app/icon.png`, `favicon.ico`) y los splash de iOS con el ícono Yump y
  `SPLASH_BG` acorde a la marca. Actualizar `ACCENT`/`SPLASH_BG` en el script.
- Los shortcuts (glifos monocromáticos) y los screenshots placeholder pueden
  quedar como están o regenerarse; prioridad = los íconos principales.

## Archivos afectados

- `app/globals.css` (tokens + fuentes + estilos del brand del topbar)
- `app/layout.tsx` (fuente + metadata)
- `app/manifest.ts` (nombre + theme)
- `components/TopBar.tsx` (wordmark)
- Textos: `app/cuenta/page.tsx`, `components/pwa/UpdateToast.tsx`,
  `components/pwa/InstallPrompt.tsx`, `public/offline.html`, `app/admin/login/page.tsx`
- `public/sw.js` (CACHE_VERSION)
- `scripts/generate-pwa-assets.mjs` + assets regenerados (`public/icons/*`,
  `app/icon.png`, `app/apple-icon.png`, `public/splash/*`)
- Assets nuevos: `public/brand/yump-wordmark-{black,white}.png`, `yump-icon.png`
  (traídos del proyecto de diseño vía DesignSync)

Fuera de alcance: adoptar tokens/componentes del design system (spacing, radios,
Button/Input/etc.), y las guidelines de color/tipografía como páginas.

## Verificación

- `npx tsc --noEmit` sin errores; `npx next build` compila (fuentes se bajan en
  Vercel).
- Visual: acento coral, fondos off-white/oled, fuente Plus Jakarta Sans; el
  topbar muestra el wordmark Yump (negro en claro / blanco en oscuro); título y
  metadata dicen "Yump"; nada dice "StreamingCentral" en la UI.
- PWA: `npx next build && npx next start` → DevTools → Manifest muestra "Yump" y
  los íconos Yump; instalar muestra el ícono nuevo.
