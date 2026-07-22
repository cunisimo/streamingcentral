# StreamingCentral PWA — Auditoría y plan técnico

> Documento de diseño. No hay código todavía.
> Fecha: 2026-07-21 · Next.js 14.2.35 · App Router

---

## Context

StreamingCentral es hoy un sitio web. Se usa casi enteramente desde el celular
(bottom nav fija, cards de póster, layout de 560px), pero se abre desde el
navegador, con barra de URL, sin ícono propio y sin nada que la distinga de una
pestaña más.

El objetivo es convertirla en una **PWA instalable** que se comporte como
aplicación: ícono en la pantalla de inicio, sin chrome del navegador, splash
screen, y que abra aunque no haya conexión — **sin sacrificar frescura de datos**.

Además, el proyecto está por encarar Trailer Zone (ver
`docs/superpowers/specs/2026-07-21-trailer-zone-design.md`), que es intensamente
móvil: video a pantalla completa, gestos, safe areas. Hacer la PWA **antes** evita
construir Trailer Zone sobre cimientos móviles rotos y después arreglar las dos
cosas juntas.

**Alcance decidido:** infraestructura PWA + arreglos mobile-first. Performance,
accesibilidad y SEO quedan auditados acá con hallazgos concretos, pero se
implementan en un spec aparte.

---

## 1. Auditoría — qué hay y qué falta

### 1.1 Estado general

| Área | Estado | Detalle |
|---|---|---|
| `public/` | ❌ **No existe** | Ni la carpeta. Cero íconos, cero favicon, sin `robots.txt`, sin `sitemap.xml` |
| Manifest | ❌ Falta | — |
| Service Worker | ❌ Falta | Ninguna dependencia PWA en `package.json` |
| Íconos | ❌ Falta | No hay ni un archivo de imagen en el proyecto |
| Splash screens | ❌ Falta | — |
| `viewport-fit: cover` | ❌ Falta | **Rompe las safe areas ya escritas** (§1.3) |
| Safe areas | ⚠️ Parcial | Escritas pero inertes |
| `theme_color` | ⚠️ Parcial | Hardcodeado en claro |
| Fuentes | ✅ Correcto | `next/font/google` self-hostea a `/_next/static/media/` |
| App Router | ✅ Compatible | Sin bloqueantes para PWA |
| Metadata por página | ❌ Falta | Una sola exportación, en el root layout |
| `next/image` | ❌ No se usa | 0 usos; `remotePatterns` es config muerta |

### 1.2 Compatibilidad con Next.js — sin bloqueantes

Next.js 14.2.35 con App Router soporta todo lo necesario de forma nativa:

- **`app/manifest.ts`** — metadata route que genera `/manifest.webmanifest`
  tipado. Mejor que un JSON suelto: TypeScript valida el shape.
- **`app/icon.png` / `app/apple-icon.png`** — Next inyecta los `<link>`
  automáticamente y les pone hash de contenido.
- **`export const viewport: Viewport`** — ya se usa; falta configurarlo bien.
- **`public/sw.js`** — se sirve desde la raíz, que es el scope que necesita el SW.

**Hallazgo clave que habilita el SW propio:** todas las páginas son shells
estáticos. `app/page.tsx`, `/series`, `/peliculas`, `/buscar` y
`/titulo/[tipo]/[id]` son server components que solo montan client components; el
fetch de datos ocurre íntegramente en el cliente vía `useApi` → `/api/*`.
**El HTML no contiene ni un dato dinámico.** Por lo tanto cachear documentos HTML
no puede mostrar información vieja: lo peor que puede pasar es servir el shell de
un build anterior, y eso se resuelve versionando el cache (§3.4).

### 1.3 Safe areas — el bug concreto

```css
/* app/globals.css:186 */
.bottomnav{ … padding-bottom:env(safe-area-inset-bottom) }
```

```ts
/* app/layout.tsx:13-17 — falta viewportFit */
export const viewport: Viewport = { width:"device-width", initialScale:1, themeColor:"#F5F5F2" };
```

Sin `viewport-fit: "cover"`, **iOS devuelve `0` en todos los `env(safe-area-inset-*)`**.
El código del notch está escrito pero no hace nada. Y una vez que se active,
aparece un segundo problema:

```css
/* app/globals.css */
main{ padding-bottom:92px }        /* fijo */
.bottomnav{ height:72px }           /* + safe-area cuando funcione */
```

En un iPhone con home indicator la nav pasa a medir 72 + 34 = **106px** > 92px.
El contenido queda tapado. Hay que reemplazar el `92px` por un cálculo con
variable.

Además, `.detail-inner` (`globals.css:192`) usa `min-height:100vh` — en iOS `100vh`
incluye la barra del navegador, lo que produce el clásico salto de scroll.

### 1.4 Otros hallazgos mobile-first

| Hallazgo | Dónde | Efecto |
|---|---|---|
| Sin `overscroll-behavior` | `globals.css` (falta) | Rubber-band y pull-to-refresh accidental en standalone |
| Sin `-webkit-tap-highlight-color` | `globals.css` (falta) | Flash azul al tocar — delata que es web |
| Sin `touch-action` en la rueda del Desempate | `Wheel.tsx` | El gesto puede scrollear la página durante el giro |
| Teclado virtual | `SearchView`, `/cuenta` | El input queda tapado; no hay manejo de `visualViewport` |
| `::-webkit-scrollbar{width:0}` | `globals.css:32` | Oculta scrollbars también en desktop, donde son señal de affordance |
| Sin `user-select:none` en la nav | `globals.css` | Long-press sobre la nav selecciona texto |

### 1.5 Hallazgos fuera de alcance (para el spec siguiente)

Se documentan porque la auditoría los encontró, **no se arreglan acá**:

- **Performance:** `next/image` no se usa. 10 lugares con `backgroundImage` en CSS
  (`TitleCard.tsx:13`, `DetailView.tsx:27`, `PersonCard.tsx:9`, los 5 de
  `desempate/`, `SearchView.tsx:70`) y 4 `<img>` crudos. Sin `width`/`height`
  explícitos, sin AVIF/WebP, sin lazy nativo. Es el principal obstáculo para
  Performance > 90.
- **SEO:** una sola `metadata` (root). Ninguna página tiene título, descripción,
  canonical ni Open Graph propios. Falta `robots.txt` y `sitemap.xml`.
- **Accesibilidad:** `--faint:#9A9EA6` sobre `--bg:#F5F5F2` da **2.46:1**; WCAG AA
  exige 4.5:1. Se usa en textos secundarios y contadores. Además los botones
  ícono-only (`.act`, flechas de rieles) no tienen `aria-label` consistente.

### 1.6 Corrección al objetivo de Lighthouse

**La categoría PWA fue eliminada de Lighthouse 12 (2024).** No existe más un score
de PWA. "PWA > 100" no es medible. Se reemplaza por criterios binarios:

- Chrome DevTools → Application → Manifest: sin errores
- Chrome ofrece "Instalar aplicación" en la omnibox
- El SW se registra y activa; DevTools → Application → Service Workers lo muestra
- Modo avión: la app abre y navega

Los otros cuatro objetivos (Performance, Best Practices, A11y, SEO) siguen siendo
válidos, pero **solo Best Practices > 95 es alcanzable dentro de este spec**. Los
otros tres dependen del trabajo de §1.5.

---

## 2. Limitaciones duras de iOS (no tienen fix)

Igual que las de TMDB: si vuelven a aparecer reportadas como bug, es esto.

| # | Limitación | Consecuencia |
|---|---|---|
| 1 | **Safari no soporta `beforeinstallprompt`** | En iPhone es imposible un banner de instalación funcional. Solo se pueden dar instrucciones visuales. |
| 2 | **iOS ignora casi todo el manifest**: `display`, `theme_color`, `background_color`, `shortcuts`, `screenshots`, `orientation` | Todo se duplica en meta tags `apple-mobile-web-app-*`. El manifest sirve para Android/desktop. |
| 3 | **Los splash de iOS se declaran a mano, uno por resolución** | ~18 `<link rel="apple-touch-startup-image">` con media queries. Android los genera solo. |
| 4 | **Instalar en iOS crea un contexto de almacenamiento nuevo** | El `localStorage` de Safari **no se hereda**. Primer arranque de la app instalada = deslogueado, sin plataformas, tema por defecto. Hay que diseñarlo (§4.3). |
| 5 | **iOS desaloja caches del SW tras ~7 días sin uso** | Las garantías offline en iPhone son más débiles que en Android. No prometer offline permanente. |
| 6 | **Background Sync no existe en iOS ni en Safari desktop** | Es Chrome/Edge Android. Cualquier sync futuro necesita fallback. |
| 7 | **Web Push en iOS exige 16.4+ y app ya instalada** | No se puede pedir permiso desde una pestaña de Safari. |
| 8 | **`orientation: portrait` del manifest no se respeta en iOS** | En iPhone la app rota igual. Si Trailer Zone necesita bloquear orientación, es CSS, no manifest. |

---

## 3. Diseño de la solución

### 3.1 Manifest (`app/manifest.ts`)

Metadata route de Next, no JSON suelto.

```
name              StreamingCentral — Qué ver en tus plataformas
short_name        StreamingCentral        (12 char, cabe bajo el ícono)
description       (la de metadata actual)
id                "/"                     (identidad estable; sin esto un cambio de start_url crea una app "nueva")
start_url         "/?source=pwa"          (permite medir aperturas desde la app)
scope             "/"
display           standalone
display_override  ["standalone","minimal-ui"]
orientation       portrait                (Android/desktop; iOS lo ignora)
theme_color       #F5F5F2
background_color  #F5F5F2
lang              es-AR
dir               ltr
categories        ["entertainment","lifestyle"]
icons             ver §3.2
screenshots       ver abajo
shortcuts         ver abajo
```

**`theme_color` y modo oscuro.** El manifest admite un solo valor. El tema real se
maneja con dos meta tags que iOS y Chrome sí respetan por `media`:

```html
<meta name="theme-color" content="#F5F5F2" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#16171B" media="(prefers-color-scheme: dark)">
```

⚠️ **Limitación conocida:** esto sigue `prefers-color-scheme` del sistema, no el
toggle manual de `ThemeContext` (`sc:theme`). Un usuario con sistema claro y app
en oscuro va a ver la barra de estado clara. **Solución:** que `ThemeContext`
actualice el `<meta name="theme-color">` por JS al cambiar de tema, además de
setear `data-theme`. Es un efecto de tres líneas y elimina la inconsistencia.

**Screenshots** (habilitan la ficha rica de instalación en Android):

| Archivo | Tamaño | `form_factor` | Contenido |
|---|---|---|---|
| `sc-mobile-1.png` | 1080×1920 | `narrow` | Home con rieles |
| `sc-mobile-2.png` | 1080×1920 | `narrow` | Ficha de título |
| `sc-mobile-3.png` | 1080×1920 | `narrow` | Modo indeciso |
| `sc-desktop-1.png` | 1920×1080 | `wide` | Home en escritorio |

**Shortcuts** (Android long-press y jump list de Windows). Solo los que aportan:

1. **Buscar** → `/buscar`
2. **Mi lista** → `/cuenta/lista`
3. **Qué veo hoy** → `/` (el Modo Indeciso es el diferencial de la app)

Máximo 4 en Android; con 3 alcanza. Cuando exista Trailer Zone, reemplaza a uno.
Cada shortcut necesita su ícono 96×96.

### 3.2 Íconos

**Problema de partida: no existe ningún archivo de logo.** La marca hoy es un
triángulo de play en SVG inline (`TopBar.tsx:49`) sobre el acento `#FF6A1A`.

**Propuesta:** crear `assets/brand/logo.svg` como fuente única de verdad —
el triángulo de play existente sobre un cuadrado con el acento — y derivar todo
de ahí. ⚠️ *Esto es una decisión de marca, no técnica. Si tenés o querés otro
logo, es el momento de definirlo: rehacer 20 íconos después es tedioso.*

| Archivo | Tamaño | `purpose` | Para qué |
|---|---|---|---|
| `icon-192.png` | 192×192 | `any` | Android mínimo obligatorio |
| `icon-512.png` | 512×512 | `any` | Android splash + tiendas |
| `icon-maskable-192.png` | 192×192 | `maskable` | Android adaptativo |
| `icon-maskable-512.png` | 512×512 | `maskable` | Android adaptativo |
| `apple-icon.png` | 180×180 | — | iOS (vía `app/apple-icon.png`) |
| `icon.png` | 32×32 | — | Favicon (vía `app/icon.png`) |
| `favicon.ico` | 16+32+48 | — | Navegadores viejos y Windows |
| `shortcut-*.png` | 96×96 ×3 | — | Los 3 shortcuts |

**Los maskable necesitan un 20% de padding.** Android recorta el ícono a la forma
del launcher (círculo, squircle, cuadrado redondeado). Si el logo llega al borde,
se corta. La "zona segura" es un círculo del 80% central. Un maskable mal hecho es
el error más frecuente y visible de una PWA.

### 3.3 Splash screens de iOS

Android genera el splash desde `name` + `background_color` + `icon-512`. iOS no:
requiere una imagen exacta por resolución, declarada con media query.

Se generan **18 PNG** cubriendo iPhone SE → 16 Pro Max y iPad. Cada uno es el logo
centrado sobre `background_color`, en las variantes portrait de cada dispositivo.

Como son 18 `<link>` con media queries largas, van en un componente propio
(`components/pwa/AppleSplashLinks.tsx`) renderizado desde el `<head>` del layout,
no inline en `layout.tsx`.

⚠️ Un splash con la resolución equivocada **no se muestra** — iOS cae a la
pantalla blanca. Se verifica en simulador o dispositivo real, no en DevTools.

### 3.4 Service Worker

**Decisión: SW propio en JS clásico, sin librerías.** Viable acá por dos razones:

1. **No hace falta generar un precache manifest.** `/_next/static/*` tiene nombres
   hasheados por contenido e inmutables. Cache First runtime **se auto-puebla** y
   nunca sirve algo obsoleto: si el contenido cambia, el nombre cambia. Esto es lo
   que normalmente justifica Workbox, y acá no aplica.
2. El precache real es minúsculo: la página offline y los íconos. Una lista a mano
   de 6 entradas.

**Modularidad con `importScripts`**, no ES modules: los SW de tipo `module` no
tienen soporte en Firefox y llegaron tarde a Safari. `importScripts` funciona en
todos lados.

```
public/
  sw.js                    ← entry: versión, install/activate/fetch, importScripts
  sw/
    config.js              ← CACHE_VERSION, nombres, TTLs, límites
    strategies.js          ← cacheFirst, networkFirst, networkOnly, withExpiry
    routes.js              ← el router: request → estrategia
    push.js                ← RESERVADO — listeners comentados, documentado
    sync.js                ← RESERVADO — idem
    share-target.js        ← RESERVADO — idem
```

#### Estrategias por tipo de recurso

| Recurso | Estrategia | Por qué |
|---|---|---|
| Documentos HTML (navegación) | **Network First** → cache → `/offline` | El HTML no tiene datos (§1.2). Network First evita servir un shell viejo que referencie chunks borrados tras un deploy. |
| `/_next/static/*` (JS, CSS, fuentes) | **Cache First**, sin expiración | Inmutable por hash de contenido. |
| `/icons/*`, `/splash/*`, manifest | **Cache First**, precacheados | Estáticos propios. |
| `image.tmdb.org` (pósters, backdrops) | **Cache First** + expiración 30d, tope **300 entradas** (LRU) | Las URLs de TMDB son inmutables. SWR revalidaría gratis contra la red por nada. El tope evita que el cache crezca sin techo. |
| **`/api/*` (propias)** | **Network Only** | ⚠️ *Corrige el brief.* Network First sirve cache cuando falla la red — o sea, datos viejos. Contradice la prioridad declarada. El fallo lo maneja la UI. |
| `*.supabase.co` | **Network Only** | Sesión, votos, listas. Nunca cache. |
| `api.themoviedb.org` | **Network Only** | Nunca se llama desde el navegador (todo pasa por `/api/*`), pero se declara por las dudas. |
| `youtube.com` / `ytimg.com` | **Sin interceptar** | El SW ni los toca. Cachear video es inútil y rompe el player. Crítico para Trailer Zone. |
| Todo lo demás | **Sin interceptar** | Regla de oro: interceptar solo lo declarado. |

**Regla transversal:** el SW **solo intercepta `GET`**. Cualquier POST/PATCH/DELETE
pasa directo. Un SW que toca escrituras es una fuente de bugs de datos.

#### Versionado y ciclo de vida

- `CACHE_VERSION` en `sw/config.js`, bumpeado a mano en cada cambio del SW.
- `install` → precache de la lista mínima → **`skipWaiting()`**.
- `activate` → borrar todo cache cuyo nombre no coincida con la versión actual →
  `clients.claim()`.
- **`skipWaiting()` inmediato es una decisión consciente:** actualiza rápido, a
  costa de que una pestaña abierta pueda quedar con JS viejo y HTML nuevo. Se
  mitiga con el aviso de actualización (§3.6). La alternativa (esperar a que se
  cierren todas las pestañas) deja usuarios semanas con versiones viejas —
  peor problema.

#### Espacios reservados (estructura, sin funcionalidad)

Cada archivo se crea con su listener comentado y un comentario de cabecera que
explica qué falta para activarlo. Así agregarlos después **no requiere
refactorizar**:

```js
// public/sw/push.js — RESERVADO
// Para activar: generar claves VAPID, tabla push_subscriptions en Supabase,
// endpoint POST /api/push/subscribe, y descomentar los listeners.
// iOS: requiere 16.4+ y que la app YA esté instalada.
// self.addEventListener("push", …)
// self.addEventListener("notificationclick", …)
```

Idem `sync.js` (con la nota de que iOS/Safari no lo soportan) y
`share-target.js` (que además necesitará su bloque `share_target` en el manifest).

### 3.5 Offline

**Página `/offline`** — ruta real de Next, precacheada. Renderiza el `TopBar` y el
`BottomNav` reales (para que la app siga sintiéndose la app), un mensaje, y un
botón **Reintentar** que hace `location.reload()`.

**Componente `<OfflineState onRetry>`** — para el caso más común, que no es "no
hay HTML" sino "el HTML cargó y `/api/*` falló". Se usa dentro de las vistas:
mismo lenguaje visual que `/offline`, mismo botón.

**Detección de conexión (`hooks/useOnline.ts`)** — `navigator.onLine` +
listeners `online`/`offline`. ⚠️ `navigator.onLine === true` solo significa "hay
interfaz de red", no "hay internet" (wifi de hotel, captive portal). Por eso la
verdad la da el fetch fallido, no el flag: el flag sirve para reaccionar rápido y
para reintentar automáticamente al volver la conexión.

**Punto de integración:** `components/useApi.ts` (que ya centraliza todos los
fetch a `/api/*`) gana un estado `offline` además de `loading`/`data`. Un solo
cambio en el hook y las ~10 vistas que lo usan heredan el comportamiento. **No hay
que tocar cada vista.**

**Comportamiento resultante, sin conexión:**

| Acción | Resultado |
|---|---|
| Abrir la app | ✅ Abre (shell cacheado) |
| Tocar la nav inferior | ✅ Navega; si la ruta fue visitada antes, carga; si no, `/offline` |
| Ver una sección con datos | ✅ `<OfflineState>` elegante con Reintentar |
| Pósters ya vistos | ✅ Se ven (Cache First) |
| Votar / agregar a lista | ❌ Falla con aviso claro. *(Sin Background Sync — ver limitación #6)* |
| Trailer Zone | ❌ `<OfflineState>` — el video necesita red por definición |

### 3.6 Instalación

**`components/pwa/InstallPrompt.tsx`** — banner propio, con dos caminos:

**Android / Chrome / Edge:** captura `beforeinstallprompt`, lo guarda, muestra el
banner propio y al aceptar dispara `prompt()`.

**iOS Safari:** no existe `beforeinstallprompt` (limitación #1). Se detecta
iOS + Safari + no-standalone y se muestra una hoja con instrucciones ilustradas:
*Compartir ⎋ → Agregar a inicio*.

**Reglas de aparición** (para que no sea molesto):

- Nunca en la primera visita. Recién a partir de la **segunda sesión**.
- Nunca si ya está instalada (`display-mode: standalone` o `navigator.standalone`).
- Si el usuario lo descarta: silencio **30 días** (`localStorage: sc:pwa:dismissed`).
- Como máximo una vez por sesión.
- Entrada permanente y no intrusiva en `/cuenta/configuracion` → **"Instalar
  aplicación"**, para el que lo descartó y después lo quiere.

**`components/pwa/UpdateToast.tsx`** — cuando el SW detecta una versión nueva,
un toast discreto: *"Hay una versión nueva"* + **Actualizar** → `location.reload()`.
Necesario por la decisión de `skipWaiting()` (§3.4).

**`components/pwa/ServiceWorkerRegister.tsx`** — client component montado en el
layout. Registra `/sw.js`, escucha `updatefound`, y **no registra en desarrollo**
(un SW cacheando en `next dev` produce horas de depuración fantasma).

### 3.7 Mobile-first — correcciones

| # | Qué | Dónde |
|---|---|---|
| 1 | `viewportFit: "cover"` | `app/layout.tsx` — **desbloquea todos los `env()`** |
| 2 | `themeColor` con variantes claro/oscuro + sync desde `ThemeContext` | `app/layout.tsx`, `components/ThemeContext.tsx` |
| 3 | Variables de layout: `--nav-h`, `--safe-b`, `--safe-t` | `globals.css :root` |
| 4 | `main{padding-bottom:calc(var(--nav-h) + var(--safe-b) + 20px)}` | reemplaza el `92px` fijo |
| 5 | `100vh` → `100dvh` | `globals.css:192` (`.detail-inner`) |
| 6 | `overscroll-behavior-y: none` en `body` | Mata el pull-to-refresh accidental en standalone |
| 7 | `-webkit-tap-highlight-color: transparent` + `:active` propios | Elimina el flash azul |
| 8 | `user-select: none` en nav y controles | Long-press deja de seleccionar texto |
| 9 | `touch-action: none` durante el giro del Desempate | `Wheel.tsx` |
| 10 | Teclado virtual: `useVisualViewport` en buscador y login | Evita que el input quede tapado |
| 11 | Scrollbars visibles ≥1024px | Revierte `::-webkit-scrollbar{width:0}` (`globals.css:32`) solo en desktop |
| 12 | Media query `@media (display-mode: standalone)` | Ajustes exclusivos de app instalada (ej. padding superior distinto) |

**Sobre orientación:** `orientation: portrait` en el manifest funciona en Android
y se ignora en iOS (limitación #8). No se fuerza por CSS: rotar en un
tablet es legítimo. Se verifica que el layout no se rompa en landscape,
nada más.

---

## 4. Archivos a crear y modificar

### 4.1 Crear

```
public/
  sw.js                                  entry del SW
  sw/config.js                           versión, nombres de cache, TTLs, límites
  sw/strategies.js                       cacheFirst, networkFirst, networkOnly, withExpiry
  sw/routes.js                           router request → estrategia
  sw/push.js                             RESERVADO (comentado + documentado)
  sw/sync.js                             RESERVADO
  sw/share-target.js                     RESERVADO
  icons/          icon-192, icon-512, icon-maskable-192, icon-maskable-512,
                  favicon.ico, shortcut-buscar, shortcut-lista, shortcut-indeciso  (96×96)
  splash/         18 PNG de apple-touch-startup-image
  screenshots/    sc-mobile-1..3.png (1080×1920), sc-desktop-1.png (1920×1080)

app/
  manifest.ts                            metadata route tipada
  icon.png                               favicon (Next inyecta el link)
  apple-icon.png                         180×180
  offline/page.tsx                       página offline con TopBar + BottomNav reales

components/pwa/
  ServiceWorkerRegister.tsx              registro + detección de update
  InstallPrompt.tsx                      banner propio (Android + hoja iOS)
  UpdateToast.tsx                        aviso de versión nueva
  AppleSplashLinks.tsx                   los 18 <link> con media queries
  OfflineState.tsx                       componente reusable de sección offline

hooks/
  useOnline.ts                           navigator.onLine + eventos
  useInstallPrompt.ts                    beforeinstallprompt + detección iOS/standalone
  useVisualViewport.ts                   teclado virtual

assets/brand/
  logo.svg                               fuente de verdad de la marca (⚠️ decisión pendiente)
```

### 4.2 Modificar

| Archivo | Cambio |
|---|---|
| `app/layout.tsx` | `viewportFit:"cover"`; `themeColor` con variantes; montar `ServiceWorkerRegister`, `InstallPrompt`, `UpdateToast`, `AppleSplashLinks`; meta `apple-mobile-web-app-*` |
| `app/globals.css` | Variables `--nav-h`/`--safe-b`; `main` padding calculado; `100dvh`; `overscroll-behavior`; `tap-highlight`; `user-select`; scrollbars en desktop; bloque `@media (display-mode: standalone)`; estilos `.pwa-*` y `.offline-*` |
| `components/ThemeContext.tsx` | Actualizar `<meta name="theme-color">` al cambiar de tema |
| `components/useApi.ts` | Estado `offline`; reintento automático al volver la conexión |
| `components/desempate/Wheel.tsx` | `touch-action:none` durante el giro |
| `app/cuenta/configuracion/page.tsx` | Fila "Instalar aplicación" |
| `next.config.mjs` | Headers: `Cache-Control` correcto para `/sw.js` (**`no-cache`** — si el navegador cachea el SW, no te podés actualizar nunca) |
| `.gitignore` | Verificar que `public/` **no** esté ignorado |
| `CLAUDE.md` | Sección PWA: limitaciones de iOS, cómo bumpear `CACHE_VERSION`, qué no cachear |

### 4.3 El problema de storage al instalar en iOS (limitación #4)

Instalar crea un contexto nuevo: se pierden `sc:platforms`, `sc:theme`, `sc:pais`
y la sesión de Supabase. El usuario abre "su" app por primera vez y está
deslogueado y sin plataformas.

**No hay forma de migrar el storage entre contextos.** Lo que sí se puede es que
no se sienta un error:

1. Detectar primer arranque en standalone (`localStorage` vacío +
   `display-mode: standalone`).
2. Mostrar un onboarding breve: *"¡Bienvenido a la app! Elegí tus plataformas"* →
   abre directo el panel de plataformas.
3. Si había sesión, un aviso suave: *"Ingresá de nuevo para ver tus listas"*.

Presentarlo como bienvenida y no como pérdida de datos. **Documentarlo en
`CLAUDE.md`** para que no se reporte como bug.

---

## 5. Orden de implementación

Cada fase es verificable por separado.

### Fase 1 — Marca y assets (½ día, ⚠️ decisión primero)

Definir `assets/brand/logo.svg`, generar los 8 íconos + 18 splash + 4 screenshots.
**Bloqueante:** sin decidir el logo no se puede empezar. Rehacer 26 imágenes
después es caro.

**Verificación:** los maskable se ven bien en <https://maskable.app/editor>.

### Fase 2 — Manifest e instalabilidad (½ día)

`app/manifest.ts`, `app/icon.png`, `app/apple-icon.png`, meta `apple-*`,
`AppleSplashLinks`, `themeColor` con variantes.

**Verificación:** DevTools → Application → Manifest sin errores; Chrome ofrece
instalar; instalar en Android real y ver ícono, nombre y splash.

### Fase 3 — Mobile-first (1 día) ⚠️ ANTES del SW

`viewportFit:"cover"` y los 12 arreglos de §3.7. **Va antes del Service Worker
a propósito:** con un SW activo, cada cambio de CSS obliga a bumpear versión y
hacer hard-reload. Depurar layout con SW encima es innecesariamente doloroso.

**Verificación:** en iPhone real instalado — la nav no tapa contenido, el notch
respeta insets, sin rubber-band, sin flash azul al tocar.

### Fase 4 — Service Worker y offline (1½ días)

`public/sw.js` + los 3 módulos activos + 3 reservados; `/offline`;
`OfflineState`; `useOnline`; integración en `useApi`; header `no-cache` para
`/sw.js`.

**Verificación:** modo avión → la app abre, la nav navega, cada sección muestra
`OfflineState`, los pósters ya vistos se ven. DevTools → Network: **cero**
requests a `/api/*` servidos desde cache.

### Fase 5 — Instalación y actualización (½ día)

`InstallPrompt` (Android + hoja iOS), `UpdateToast`,
`ServiceWorkerRegister`, fila en configuración, onboarding de primer arranque
en standalone (§4.3).

**Verificación:** el banner no aparece en la primera visita ni si ya está
instalada; descartarlo lo silencia 30 días; deployar una versión nueva muestra
el toast.

### Fase 6 — Verificación cruzada (½ día)

Matriz de dispositivos, Lighthouse, documentación en `CLAUDE.md`.

**Total estimado: 4½ días.**

---

## 6. Riesgos

| # | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| 1 | **SW cacheando en desarrollo.** Cambiás código y no se refleja; se van horas. | **Alta** | Alto | No registrar el SW si `NODE_ENV !== "production"`. Documentarlo en `CLAUDE.md`. Es el problema #1 de toda PWA. |
| 2 | **HTML viejo → chunks borrados tras deploy** = pantalla en blanco. | Media | **Muy alto** | Network First en documentos + cache versionado por build + `UpdateToast`. |
| 3 | **`/sw.js` cacheado por el navegador** → imposible actualizar. | Media | **Muy alto** | Header `Cache-Control: no-cache` explícito en `next.config.mjs`. |
| 4 | **Maskable icons mal generados** (logo cortado por el launcher). | Media | Medio | 20% de padding, validar en maskable.app antes de cerrar la Fase 1. |
| 5 | **Splash de iOS con resolución errónea** → pantalla blanca al abrir. | Media | Medio | Generar los 18 exactos, probar en dispositivo real (DevTools no lo simula). |
| 6 | **Cache de imágenes TMDB sin techo** → decenas de MB, iOS desaloja todo. | Media | Medio | Tope de 300 entradas con LRU + expiración 30d. |
| 7 | **Pérdida de storage al instalar en iOS** reportada como bug. | **Alta** | Bajo | Onboarding de bienvenida (§4.3) + documentado en `CLAUDE.md`. |
| 8 | Bug preexistente: **`--faint` falla contraste WCAG**. | — | Medio | Fuera de alcance. Documentado en §1.5 para el spec de a11y. |
| 9 | **Expectativa de Lighthouse PWA = 100** que ya no existe. | — | Bajo | §1.6. Criterios binarios en su lugar. |
| 10 | **`skipWaiting()` deja pestañas con JS viejo + HTML nuevo.** | Baja | Medio | `UpdateToast` + `clients.claim()`. Decisión consciente (§3.4). |

---

## 7. Compatibilidad Android / iPhone / Desktop

| Capacidad | Android (Chrome) | iOS (Safari) | Desktop (Chrome/Edge) |
|---|---|---|---|
| Instalación | ✅ Automática | ⚠️ Manual (Compartir → Agregar) | ✅ Automática |
| Banner propio de instalación | ✅ `beforeinstallprompt` | ❌ **Solo instrucciones** | ✅ |
| `display: standalone` | ✅ | ✅ (vía `apple-mobile-web-app-capable`) | ✅ |
| Splash screen | ✅ Generado del manifest | ⚠️ **18 imágenes a mano** | ➖ N/A |
| `theme_color` | ✅ | ⚠️ Vía meta `apple-*` | ✅ Barra de título |
| Íconos maskable | ✅ | ➖ Ignora, usa `apple-icon` | ➖ |
| Shortcuts | ✅ Long-press | ❌ Ignorados | ✅ Jump list |
| Screenshots en instalación | ✅ Ficha rica | ❌ | ✅ |
| `orientation` | ✅ | ❌ Ignorado | ➖ |
| Service Worker | ✅ | ✅ | ✅ |
| Cache API | ✅ | ⚠️ **Desalojo a ~7 días sin uso** | ✅ |
| Sesión persistente | ✅ | ⚠️ **Contexto nuevo al instalar** | ✅ |
| Web Push *(futuro)* | ✅ | ⚠️ 16.4+ **y ya instalada** | ✅ |
| Background Sync *(futuro)* | ✅ | ❌ **No existe** | ✅ Chrome/Edge |
| Share Target *(futuro)* | ✅ | ❌ | ⚠️ Parcial |

**Matriz mínima de prueba real** (DevTools no alcanza para nada de esto):
Android + Chrome instalada · iPhone + Safari instalada · Chrome desktop
instalada · iPhone en modo avión.

---

## 8. Recomendaciones antes de Trailer Zone

Esta es la razón principal para hacer la PWA primero. Trailer Zone es el feature
más móvil del proyecto y depende de cosas que hoy no existen.

1. **`viewport-fit: cover` es prerrequisito absoluto.** El layout Cinema Card
   calcula alturas contra la pantalla completa. Sin safe areas funcionando, en
   iPhone el panel de acciones queda debajo del home indicator. **Hacer Trailer
   Zone antes de la Fase 3 garantiza retrabajo.**

2. **`--nav-h` y `--safe-b` como variables CSS** (Fase 3) son exactamente lo que
   Trailer Zone necesita para posicionar su UI. Si no existen, va a hardcodear
   `92px` y romperse en el primer dispositivo distinto.

3. **El SW debe ignorar YouTube explícitamente.** Está en §3.4 y no es negociable:
   interceptar requests de video rompe el player de formas difíciles de depurar.

4. **`overscroll-behavior: none`** (Fase 3) evita que el swipe vertical del feed
   dispare el pull-to-refresh. Sin esto, deslizar hacia arriba en el primer
   trailer recarga la página.

5. **`useVisualViewport`** (Fase 3) lo va a reusar la hoja de comentarios de
   Trailer Zone (Fase 6 de ese spec).

6. **El shortcut del manifest para Trailer Zone se agrega recién cuando exista.**
   Un shortcut a una ruta 404 es un bug visible en el long-press del ícono.

7. **`display-mode: standalone` como media query** habilita que Trailer Zone se
   comporte distinto instalada vs. en pestaña — por ejemplo, ocultar el botón
   "Salir" cuando no hay botón atrás del navegador.

**Recomendación de orden: PWA completa (4½ días) → después Trailer Zone.**
Al revés significa construir el feature más sensible a móvil sobre cimientos que
sabemos rotos, y arreglar los dos a la vez.

---

## 9. Verificación end-to-end

```bash
npx tsc --noEmit          # 0 errores
npx next build            # compila
npx next start            # el SW SOLO corre en build de producción
```

**Chequeos en Chrome DevTools → Application:**

- [ ] Manifest: sin errores ni warnings; los íconos se previsualizan
- [ ] Service Workers: registrado, activado, sin errores
- [ ] Cache Storage: `sc-static-v1`, `sc-pages-v1`, `sc-images-v1` presentes
- [ ] **Cache Storage NO contiene ninguna respuesta de `/api/*` ni de Supabase**

**Recorrido manual (Android instalada):**

1. Chrome ofrece instalar → instalar → ícono correcto en el launcher
2. Abrir desde el ícono → splash con logo → **sin barra de URL**
3. Long-press del ícono → los 3 shortcuts → cada uno abre su ruta
4. Navegar por las 5 secciones (online, todo normal)
5. **Modo avión** → la app abre → la nav responde → cada sección muestra
   `OfflineState` con Reintentar → los pósters ya vistos se ven
6. Volver la conexión → Reintentar → carga
7. Deployar una versión → reabrir → aparece `UpdateToast` → Actualizar

**Recorrido manual (iPhone instalada):**

8. Safari → aparece la hoja de instrucciones iOS (no un banner de Chrome)
9. Compartir → Agregar a inicio → ícono correcto
10. Abrir → **splash correcto, no pantalla blanca**
11. Sin barra de Safari; la nav inferior **no queda tapada por el home indicator**
12. Notch: el contenido no se corta en landscape
13. Primer arranque → aparece el onboarding de bienvenida (§4.3)
14. Modo avión → repetir pasos 5-6

**Lighthouse** (móvil, producción): Best Practices > 95 es el único objetivo
comprometido en este spec. Performance, A11y y SEO se registran como línea de
base para el spec siguiente (§1.5).
