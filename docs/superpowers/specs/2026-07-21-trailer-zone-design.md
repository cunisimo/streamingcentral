# Trailer Zone — Diseño completo

> Documento de diseño. No hay código todavía.
> Fecha: 2026-07-21 · Proyecto: StreamingCentral

---

## Context

StreamingCentral resuelve "no sé qué ver" con catálogo agregado + reseñas
editoriales. Hoy el descubrimiento es **textual y estático**: grillas de pósters,
rieles por género, fichas. El usuario tiene que decidir a partir de una imagen fija
y una sinopsis.

**Trailer Zone** agrega el eslabón que falta: decidir **viendo**. Un feed vertical
de trailers oficiales donde en 30 segundos sabés si un título te interesa, con
todas las acciones del ecosistema (Mi Lista, votos, Desempate, ficha) al alcance
sin salir del feed.

El objetivo no es tiempo en pantalla — es **decisiones por sesión**. Cada trailer
que termina debería producir una acción, no un scroll.

---

## 0. Limitaciones duras (leer antes de aprobar)

Estas no tienen fix. El diseño está construido alrededor de ellas.

| # | Limitación | Consecuencia en el diseño |
|---|---|---|
| 1 | **TMDB solo devuelve el `key` de YouTube.** No hay MP4, no hay CDN propio. | Todo el playback es un iframe de YouTube. No hay control sobre buffering ni calidad. |
| 2 | **Autoplay con sonido está bloqueado** por Chrome/Safari/iOS sin gesto previo del usuario. | Arranca siempre muteado. Un tap activa audio y se recuerda por sesión (`sessionStorage`). No hay workaround. |
| 3 | **Los trailers son 16:9.** | Cinema Card (decidido). Ver §1. |
| 4 | **Algunos trailers no se pueden embeber** (embed deshabilitado o age-restricted). No es detectable desde TMDB. | Solo se descubre en runtime (error 101/150 del player). Requiere fallback + saneo del mazo. Ver §9. |
| 5 | **No se puede ocultar el branding de YouTube.** `modestbranding` está deprecado; tapar el player viola los ToS. | El player queda visible y con sus controles. La UI vive **fuera** del rectángulo del video. Cinema Card lo resuelve naturalmente. |
| 6 | **Los eventos táctiles dentro de un iframe no burbujean.** Un swipe sobre el video no scrollea el feed. | El área de swipe tiene que estar fuera del video. **Este es el argumento técnico más fuerte a favor de Cinema Card** — deja ~55% de alto de pantalla como zona de gesto. |
| 7 | **TMDB `/videos` en `es-ES` viene vacío casi siempre.** | Hay que pedir `include_video_language=es,en,null` y priorizar. Ver §5. |
| 8 | **`/videos` es una llamada extra por título.** Un mazo de 10 con cache frío = 10 requests a TMDB. | Cache Redis de 7 días por título (los trailers no cambian) + `Promise.allSettled`. |

---

## 1. Concepto UX

### La idea rectora: "Cinema Card", no "pantalla completa"

TikTok llena la pantalla porque su contenido es 9:16 nativo. Los trailers no.
Estirarlos o recortarlos los degrada — caras cortadas, tipografía de créditos
ilegible, encuadre destruido. Y encima es zona gris de ToS.

En vez de pelear con el formato, lo celebramos: **el trailer se presenta como en
una sala**. Video 16:9 respetado, centrado, flotando sobre el backdrop del propio
título blureado y oscurecido. El espacio arriba y abajo no es desperdicio — es
donde vive la ficha y las acciones, sin tapar un solo píxel de imagen.

El resultado se parece más a Letterboxd o al hero de Netflix que a TikTok. Que es
exactamente lo pedido.

### Los cinco principios

1. **El video nunca se tapa.** Ni gradientes encima, ni botones flotando sobre la
   imagen. La UI vive en las bandas superior e inferior.
2. **Una tarjeta = una decisión.** Cada slide tiene que dejar al usuario en
   condiciones de decidir: veo / no veo / después.
3. **El final del trailer es el clímax, no el corte.** Ahí aparece el panel de
   acción (decidido). Auto-avance a los 8s si no hay interacción.
4. **Silencio por defecto, sonido por elección.** Muteado al entrar, con un
   indicador de audio visible y un onboarding de una sola vez.
5. **Nada muere en el feed.** Toda acción alimenta el resto de la app: Mi Lista,
   votos, Desempate, historial, área de usuario.

### Anti-objetivos (explícitos)

- No hay contador de likes públicos ni métricas de vanidad.
- No hay algoritmo de engagement infinito. El mazo es finito y determinístico por
  día (mismo motor que el Modo Indeciso). Se puede *terminar* el feed del día —
  y eso es una feature, no un bug.
- No hay contenido generado por usuarios en video. Solo trailers oficiales.

---

## 2. Wireframe textual

### Estado A — Reproduciendo (móvil, 390×844)

```
╔══════════════════════════════════════════════╗
║ ░░░░ backdrop blureado (blur 40px,          ║
║ ░░░░ brightness .35, scale 1.1) ░░░░░░░░░░  ║
║                                              ║
║  ┌────────────────────────────────────────┐ ║ ← safe area top
║  │ ← Salir            Trailer Zone   🔇   │ ║   56px
║  └────────────────────────────────────────┘ ║
║                                              ║
║ ┌──────────────────────────────────────────┐ ║
║ │                                          │ ║  ZONA DE SWIPE
║ │        [ espacio de gesto ]              │ ║  (libre, sin iframe)
║ │                                          │ ║  ~90px
║ └──────────────────────────────────────────┘ ║
║ ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓ ║
║ ┃                                          ┃ ║
║ ┃      ▶  IFRAME YOUTUBE 16:9              ┃ ║  358×201
║ ┃         (radius 14, shadow xl)           ┃ ║  ~24% del alto
║ ┃                                          ┃ ║
║ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛ ║
║ ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬░░░░░░░░░░░░░░░░  1:12   ║ ← progreso propio
║                                              ║
║ ┌──────────────────────────────────┐ ┌─────┐ ║
║ │ DUNE: PARTE DOS                  │ │  ❤️ │ ║
║ │ 2024 · Ciencia ficción, Aventura │ │ Lista│ ║
║ │ 2h 46m · ★ 8.2                   │ │     │ ║
║ │                                  │ │  👍 │ ║  COLUMNA
║ │ [N] [M]  ● En tus plataformas    │ │Interesa│ ║  ACCIONES
║ │                                  │ │     │ ║  (68px)
║ │ Paul Atreides se une a los       │ │  👎 │ ║
║ │ Fremen para vengar a su casa…    │ │Paso │ ║
║ │                                  │ │     │ ║
║ │ [ 🎬 Ver ficha completa      ]   │ │  💬 │ ║
║ │ [ 🎲 Desempate ]  [ 🔗 ]         │ │  🔗 │ ║
║ └──────────────────────────────────┘ └─────┘ ║
║                                              ║
║ ┌──────────────────────────────────────────┐ ║
║ │        [ espacio de gesto ]        ⌃     │ ║  ZONA DE SWIPE
║ └──────────────────────────────────────────┘ ║  ~70px
╠══════════════════════════════════════════════╣
║  🏠      📺    ╭─────╮    🎬       🔖        ║
║ Inicio  Series │ 🎞️  │ Películas Mi lista   ║  BOTTOM NAV
║                │  TZ │                       ║  (FAB central)
║                ╰─────╯                       ║
╚══════════════════════════════════════════════╝
```

**Nota clave:** el iframe ocupa solo ~24% del alto. El 76% restante es zona de
gesto válida. Esto resuelve la limitación #6 sin overlays sobre el player.

### Estado B — Trailer terminado (panel de acción)

```
║ ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓ ║
║ ┃  [último frame, brightness .3, blur 2px] ┃ ║
║ ┃          ↻  Volver a ver                 ┃ ║
║ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛ ║
║                                              ║
║   ┌────────────────────────────────────┐    ║
║   │  ¿Y? ¿La ves?                      │    ║
║   │                                    │    ║
║   │  [ ❤️  Agregar a Mi Lista      ]   │    ║
║   │  [ 🎬  Ver ficha completa      ]   │    ║
║   │  [ 🎲  Mandar a Desempate      ]   │    ║
║   │                                    │    ║
║   │  Siguiente en 6…      [ Saltar ⌃ ] │    ║
║   └────────────────────────────────────┘    ║
```

Cuenta regresiva de 8s con barra fina. Cualquier interacción la cancela.

### Estado C — Trailer no embebible (fallback)

```
║ ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓ ║
║ ┃  [backdrop nítido, sin blur]             ┃ ║
║ ┃                                          ┃ ║
║ ┃   Este trailer no se puede reproducir    ┃ ║
║ ┃   acá por restricciones de YouTube.      ┃ ║
║ ┃                                          ┃ ║
║ ┃   [ ▶ Ver en YouTube ]  [ 🎬 Ficha ]     ┃ ║
║ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛ ║
```

Se registra el `tmdb_id` como no-embebible en Redis (TTL 30d) para excluirlo de
mazos futuros de todos los usuarios. Auto-avanza a los 4s.

### Estado D — Desktop (≥900px)

Layout de dos columnas. Video 16:9 grande a la izquierda (max 820px), panel de
metadata + acciones fijo a la derecha (360px). Navegación con ↑/↓, `espacio`
play/pausa, `M` mute. Sin scroll-snap: transición cross-fade.

### Estado E — Onboarding (primera visita, `localStorage: sc:tz:onboard`)

Overlay de un solo paso sobre la primera tarjeta, dismissable con cualquier tap:

```
   Deslizá para el siguiente trailer  ⌃
   Tocá el 🔇 para activar el sonido
```

### Estado F — Fin del mazo

```
   Por hoy terminaste 🎞️
   Viste 24 trailers · 11 completos

   [ Ver los que marqué (5) ]
   [ Volver al inicio ]

   Mañana hay mazo nuevo.
```

---

## 3. Flujo completo del usuario

### Flujo principal

```
Bottom nav → FAB "Trailer Zone"
  ↓
GET /api/trailer-feed?providers=n,d,m  (página 1, 10 items)
  ↓
¿platforms vacío? ──sí──► Prompt "Elegí tus plataformas" → abre panel de TopBar
  │no
  ↓
Render tarjeta 0 · autoplay MUTEADO · onboarding si es primera vez
  ↓
┌─► Usuario mira ────────────────────────────────────────────┐
│     │                                                       │
│     ├─ tap en 🔇 ──────► unmute (persiste en sesión)        │
│     ├─ swipe ⌃/⌄ ──────► siguiente/anterior tarjeta ────────┤
│     ├─ acción lateral ─► optimistic UI + escritura Supabase │
│     ├─ "Ver ficha" ────► /titulo/{tipo}/{id} (feed pausa,   │
│     │                     posición guardada en sessionStorage)│
│     └─ trailer termina ► PANEL DE ACCIÓN (8s) ──────────────┤
│                                                             │
└─── activeIndex ≥ length-4 ──► prefetch página siguiente ────┘
  ↓
Fin del mazo → pantalla de resumen
```

### Sub-flujo: acciones y su destino

| Acción | Persistencia | Dónde reaparece |
|---|---|---|
| ❤️ Mi Lista | `user_items` kind=`list` | `/cuenta/lista`, riel del hub, botón de la ficha |
| 👍 Me interesa | `user_items` kind=`interested` **(nuevo)** | Nuevo riel en `/cuenta`, alimenta afinidad del mazo |
| 👎 No me interesa | `trailer_dismissed` **(nueva)** | Excluido del mazo 90 días. No visible en UI. |
| 💬 Comentario | `comments` **(nueva, Fase 5)** | Ficha del título, sección "Comentarios" |
| 🔗 Compartir | **nada** | `navigator.share` → `/titulo/{tipo}/{id}` |
| 🎬 Ver ficha | `view_history` (ya existe, vía `ListActions`) | "Vistos recientemente" |
| 🎲 Desempate | `sessionStorage: sc:desempate:tray` | Bandeja del Desempate en Home |
| (mirar) | `trailer_views` **(nueva)** | Gamificación, exclusión de repetidos |

### Sub-flujo: usuario anónimo

El feed funciona sin login. Al tocar cualquier acción que requiere cuenta,
aparece un bottom-sheet — **no un redirect** (perdería la posición del feed):

```
   Para guardar esto necesitás una cuenta

   [ Ingresar ]   [ Ahora no ]
```

`Ingresar` → `/cuenta?next=/trailers&at={tmdb_id}` y al volver se restaura la
posición. Sin login: mazo sin personalización, solo tendencias + estrenos +
popularidad mundial, filtrado por plataformas de `localStorage`.

### Sub-flujo: Desempate (requiere cambio en el feature existente)

Hoy `useDesempate` es efímero y vive solo en el acordeón del Home
(`components/desempate/useDesempate.ts:5` — *"Efímera: nada se persiste"*).
Para el hand-off desde el feed:

1. Feed → `pushToTray(title)` escribe en `sessionStorage: sc:desempate:tray`
   (array de `UITitle`, máximo 3, dedupe por `${type}-${id}`).
2. Toast: `Agregado al Desempate (2/3)` + link `Ir`.
3. `useDesempate` gana una acción `HYDRATE` que lee la bandeja al montar.
4. Con 2+ títulos en bandeja, el `DesempateBanner` del Home muestra un badge.

Esto es un cambio chico y contenido, pero **modifica un feature existente** — hay
que aprobarlo explícitamente.

---

## 4. Arquitectura técnica

### Estructura de carpetas

```
app/
  trailers/page.tsx                      — shell, force-dynamic, metadata
  api/trailer-feed/route.ts              — mazo paginado
  api/trailer-events/route.ts            — POST batched de vistas (Fase 3)

components/trailers/
  TrailerFeed.tsx        — contenedor: scroll-snap, IntersectionObserver, paginación
  TrailerCard.tsx        — una tarjeta completa (bg + player + meta + acciones)
  TrailerPlayer.tsx      — wrapper del IFrame API: estados, progreso, errores
  TrailerMeta.tsx        — título/año/géneros/duración/rating/plataformas/sinopsis
  TrailerActions.tsx     — columna lateral de acciones
  TrailerEndPanel.tsx    — panel de fin de trailer + countdown
  TrailerFallback.tsx    — estado no-embebible
  TrailerOnboarding.tsx  — hint de swipe/audio, una vez
  TrailerEmpty.tsx       — sin plataformas / fin del mazo
  useTrailerFeed.ts      — fetch, paginación, dedupe, exclusiones locales
  useYouTubePlayer.ts    — carga única del IFrame API, ciclo de vida del player
  useFeedAudio.ts        — mute global (sessionStorage)
  useActiveSlide.ts      — IntersectionObserver → activeIndex

lib/
  videos.ts        — selección del mejor trailer desde TMDB /videos
  feed.ts          — armado del mazo: buckets, pesos, intercalado, exclusiones
  trailerdata.ts   — I/O Supabase del feed (views, dismiss, interested)
  taste.ts         — perfil de gustos del usuario (géneros top desde votos+lista)
```

### Estado — deliberadamente NO global

No hace falta Zustand/Redux ni un context nuevo. El estado se reparte así:

| Estado | Dónde vive | Por qué |
|---|---|---|
| Lista de items + paginación | `useTrailerFeed` (local a `TrailerFeed`) | No lo consume nadie más |
| `activeIndex` | `useState` en `TrailerFeed` | Idem |
| Mute global | `useFeedAudio` → `sessionStorage` | Compartido entre tarjetas, pero es un booleano — un hook con evento custom alcanza |
| Estado del player | `useYouTubePlayer` (por tarjeta) | Cada player es independiente |
| Sesión / usuario | **`AuthContext` existente** | Ya existe, no se toca |
| Plataformas | **`PlatformsContext` existente** | Ya existe, no se toca |
| Acciones (lista/interesa) | Local optimista por tarjeta + Supabase | Mismo patrón que `ListActions.tsx:32-40` |

**Regla:** si un estado no lo necesitan dos componentes hermanos, no sube.

### Reutilización de lo que ya existe

| Ya existe | Se usa para |
|---|---|
| `lib/cache.ts` → `cached()`, `dailySeed()`, `pickDaily()` | Cache de videos y del mazo; determinismo diario del feed |
| `lib/enrich.ts` → `toUITitle`, `providersOf`, `listByCategory`, `latestReleases` | Todo el enriquecimiento de las tarjetas |
| `lib/userdata.ts` → `setItem`, `hasItem`, `itemRefs`, `recordView` | ❤️ Mi Lista y 👍 Me interesa sin escribir I/O nuevo |
| `components/AuthContext.tsx` → `useAuth()` | Sesión |
| `components/PlatformsContext.tsx` → `usePlatforms()` | Filtro de plataformas |
| `components/PlatformLogo.tsx` | Logos en la metadata de la tarjeta |
| `lib/categories.ts` → `genreIdsToSlugs`, `categoryLabel` | Géneros mostrados |
| `lib/avatar.ts` → `avatarSvg()` | Avatares en comentarios (Fase 5) |
| `app/globals.css` | Todo el CSS nuevo va acá, bloque `.tz-*` (mismo criterio que `.dsmp-*` en :298-402) |

### Tipos nuevos (`lib/types.ts`)

```ts
// Un item del feed. Extiende UITitle en vez de duplicarlo.
export interface UITrailerItem extends UITitle {
  youtubeKey: string;
  trailerName: string;
  trailerLang: "es" | "en" | "xx";
  backdrop: string | null;
  synopsis: string;
  bucket: FeedBucket;         // para debug y para el intercalado
}

export type FeedBucket =
  | "tendencias" | "estrenos" | "afinidad"
  | "descubrimiento" | "proximos";

export interface TrailerFeedPage {
  items: UITrailerItem[];
  cursor: string | null;      // opaco; null = fin del mazo
}
```

`UITitleDetail` gana un campo opcional `trailer: { key, name } | null` para que la
ficha también pueda mostrar el trailer (§8, integración).

---

## 5. APIs involucradas

### Estrategia de origen de trailers — análisis

| Opción | Ventajas | Desventajas | Veredicto |
|---|---|---|---|
| **TMDB `/videos` + YouTube IFrame API** | Sin cuota. Sin API key extra. TMDB ya está integrado y autenticado. El IFrame API da eventos (`onStateChange`, `getCurrentTime`) → progreso y % completado reales. Un solo proveedor de datos. | Depende de la curaduría de TMDB (a veces el "trailer oficial" no es el mejor). No sabés de antemano si es embebible. | ✅ **ELEGIDA** |
| TMDB + **YouTube Data API v3** | `status.embeddable` y `contentDetails.regionRestriction` permiten sanear el mazo *antes* de mostrarlo. `duration` real. | Cuota de 10.000 unidades/día. `videos.list` cuesta 1 unidad por llamada (hasta 50 ids por batch). Con crecimiento se agota y el feed muere. API key extra que administrar. | ⚠️ Opcional como hardening en Fase 6, en batch de 50 ids y cacheado 30 días. **No en el MVP.** |
| Scraping / `ytdl` para MP4 directo | Control total del player, formato, autoplay con sonido. | Viola los ToS de YouTube. Frágil (rompe cada pocas semanas). Costo de ancho de banda. Riesgo legal. | ❌ Descartado |
| Otros proveedores (JustWatch, Kinocheck) | Kinocheck tiene una API de trailers gratuita. | Cobertura peor en catálogo AR. Otra integración que mantener. Igual termina en YouTube. | ❌ No aporta |

**Decisión: TMDB `/videos` + YouTube IFrame Player API, sin YouTube Data API.**
Cero cuota, cero claves nuevas, y el IFrame API cubre todo lo que necesitamos
medir.

### Nuevo en `lib/tmdb.ts`

```
titleVideos(type, id)
  → GET /{type}/{id}/videos
    ?language=es-ES&include_video_language=es,en,null
```

No se agrega `videos` al `append_to_response` de `titleDetails()`
(`lib/tmdb.ts:132-137`) porque ahí el `language=es-ES` global filtraría los
trailers en inglés — que son la mayoría. Va como llamada separada.

### Selección del mejor trailer (`lib/videos.ts`)

Puntaje descendente sobre `results`:

1. `site === "YouTube"` — descarta todo lo demás (obligatorio)
2. `type === "Trailer"` (+3) > `"Teaser"` (+1) > resto (descarta)
3. `official === true` (+2)
4. `iso_639_1 === "es"` (+2) > `"en"` (+1)
5. `size >= 1080` (+1)
6. Desempate: `published_at` más reciente

Si no hay candidato → el título **se excluye del mazo**. Nunca se muestra una
tarjeta sin trailer.

### Endpoints nuevos

| Ruta | Params | Devuelve |
|---|---|---|
| `GET /api/trailer-feed` | `providers` (CSV), `cursor` (opaco b64), `seed` (opcional, debug) | `{ items: UITrailerItem[], cursor: string \| null }` |
| `POST /api/trailer-events` | body: `[{ tmdb_id, tipo, pct, completed }]` | `{ ok: true }` — batch, se dispara cada 10 eventos o al salir (Fase 3) |

Ambas `force-dynamic`, mismo patrón de try/catch que las 12 rutas existentes.
Las escrituras de acciones (Mi Lista, interesa, dismiss) van **directo a Supabase
desde el cliente** vía `lib/trailerdata.ts`, igual que `ListActions`/`LikeButton`
hoy — RLS ya protege.

### El "mazo del día" — estrategia de ordenamiento

Análisis de las opciones planteadas:

- **Puro aleatorio** → no cumple, y no es reproducible (si el usuario recarga
  pierde el hilo).
- **Puro trending** → todos ven lo mismo, se agota rápido, no descubre nada.
- **Puro personalizado** → burbuja. En una app de descubrimiento, mostrar solo
  lo que ya te gusta es autodestructivo.
- **Puro cronológico (estrenos)** → se acaba en dos semanas.

**Recomendación: mazo mixto ponderado, determinístico por día.** Reutiliza
`dailySeed()` + `pickDaily()` de `lib/cache.ts:37-59` — el mismo motor que ya
usa el Modo Indeciso, así que el comportamiento es coherente con el resto de la
app: *el mazo de hoy es el mazo de hoy*, recargar no lo reordena, y mañana hay
uno nuevo.

| Bucket | Peso | Fuente | Requiere login |
|---|---|---|---|
| **Tendencias en tus plataformas** | 30% | `/trending/{type}/week` ∩ providers | No |
| **Estrenos recientes** | 25% | `latestReleases()` (ya existe, `enrich.ts:74`) | No |
| **Afinidad de género** | 20% | `discover` con los 3 géneros top del usuario | Sí |
| **Descubrimiento** | 15% | `discover` popularidad global, **excluyendo** sus géneros top | No |
| **Próximos estrenos** | 10% | `discover` con `primary_release_date.gte = hoy` | No |

Sin sesión, los pesos de afinidad se redistribuyen a tendencias y descubrimiento.

**Post-procesamiento (en orden):**

1. Dedupe por `${tipo}-${id}`
2. Excluir: sin trailer, marcados no-embebibles (Redis), `trailer_dismissed`,
   ya completados en los últimos 30 días
3. `pickDaily(pool, 60, dailySeed(), 0)` — barajado determinístico
4. **Intercalado**: reordenar para que no haya dos consecutivos del mismo bucket
   ni del mismo género principal. Sin esto se sienten "tandas" y se nota el
   algoritmo.
5. Paginar de a 10

El bucket de **descubrimiento (15%)** es el que evita la burbuja y es, en la
práctica, el que produce los hallazgos que hacen que la sección valga la pena.
No lo bajaría de ahí.

**Perfil de gustos (`lib/taste.ts`):** géneros más frecuentes entre `votes`
rating 2-3 + `user_items` kind `list`/`interested`. Se calcula server-side y se
reduce a un **`tasteBucket`** — un hash corto de los 3 géneros top. Esto es clave
para el cache: la key del mazo es
`feed:{YYYY-MM-DD}:{providersHash}:{tasteBucket}`, no `user_id`. Miles de
usuarios comparten unas pocas decenas de combinaciones → el cache sirve de verdad.

---

## 6. Rendimiento

Este es el punto donde la sección se hace o se rompe.

### Virtualización — ventana de 5, máximo 2 iframes

```
índice:  … 8    9   [10]   11   12  …
DOM:         │    │    │    │    │
render:    poster iframe iframe poster
             │   (pausado)(PLAY)  │
             │              │     │
        solo <img>    los ÚNICOS dos iframes
```

- **Ventana de DOM: 5 slides** (2 antes, activo, 2 después). El resto no se monta.
- **Iframes vivos: 2 como máximo** — el activo (reproduciendo) y el siguiente
  (cargado, muteado, pausado en 0). Cada iframe de YouTube es un documento
  completo con su propio JS; montar 5 hunde Safari en iOS. Este límite no es
  negociable.
- Los slides no activos muestran solo el `backdrop` en `<img loading="lazy">`.
- Al avanzar: el iframe que queda 2 atrás se **destruye** (`player.destroy()`),
  no se pausa. Los players zombies filtran memoria.

### Scroll y detección de slide activo

- Contenedor con `scroll-snap-type: y mandatory`, cada slide
  `scroll-snap-align: start`. **Scroll nativo** — no transforms manuales, no
  librerías de swipe. El scroll nativo del navegador es más fluido que cualquier
  implementación en JS y respeta la física del sistema.
- `IntersectionObserver` con `threshold: 0.6` sobre los slides define
  `activeIndex`. Sin listeners de `scroll`.
- `content-visibility: auto` en los slides fuera de ventana.
- Respeta `prefers-reduced-motion`: sin autoplay, tap para reproducir.

### Precarga

- **Video siguiente:** iframe montado con `autoplay=0`, muteado. YouTube empieza
  a bufferear al construirse el player.
- **Metadata:** prefetch de la página siguiente cuando `activeIndex >= length - 4`.
- **Imágenes:** `<link rel="preload">` para los backdrops de +1 y +2.
- **`saveData`:** si `navigator.connection.saveData` es true → sin autoplay, sin
  precarga del siguiente, tap para reproducir. Y una preferencia manual
  "Ahorro de datos" en `/cuenta/configuracion` (la página ya existe).

### Cache

| Key | TTL | Qué guarda |
|---|---|---|
| `videos:{tipo}:{id}` | **7 días** | Trailer elegido. Los trailers no cambian. |
| `videos:none:{tipo}:{id}` | 3 días | Marca negativa: este título no tiene trailer. Evita re-consultar. |
| `videos:noembed:{tipo}:{id}` | 30 días | No embebible (detectado en runtime por un cliente). **Beneficia a todos los usuarios.** |
| `feed:{fecha}:{provHash}:{taste}` | 6 h | El mazo completo de 60 ids |
| `card:{tipo}:{id}` | 24 h | **Ya existe** (`enrich.ts:249`) |

⚠️ **Bug preexistente relevante:** `cached()` (`lib/cache.ts:23`) trata `null`
como miss, así que `titleCard` re-consulta TMDB en cada request cuando falla.
Para las marcas negativas de video hay que guardar un sentinel (`{ none: true }`),
no `null`.

### Consumo de API TMDB

| Escenario | Requests a TMDB |
|---|---|
| Mazo frío (primer usuario del día con esa combinación) | 1 discover/trending por bucket (~5) + hasta 60 `/videos` |
| Mazo caliente (todos los demás) | **0** |
| Usuario navegando 30 trailers | 0 (todo del mazo cacheado) |

El armado del mazo hace `Promise.allSettled` sobre los `/videos` en lotes de 10
para no saturar. TMDB no publica rate limit duro hoy, pero ~50 req/s es el
consenso — los lotes lo mantienen holgadamente abajo.

---

## 7. Modelo de datos

### Qué persistir y qué no — análisis

| Dato | ¿Persistir? | Decisión |
|---|---|---|
| ❤️ Mi Lista | Sí | **Reusar `user_items` kind=`list`.** Cero backend nuevo. |
| 👍 Me interesa | Sí | **Reusar `user_items`, nuevo kind=`interested`.** Semánticamente idéntico ("marqué este título"). Solo hay que ampliar el CHECK. |
| 👎 No me interesa | Sí | Tabla nueva `trailer_dismissed`. No es un "item del usuario" — es una señal negativa del feed. Mezclarla en `user_items` ensuciaría los rieles del hub. |
| Trailers vistos / % completado | Sí | Tabla nueva `trailer_views`. Necesaria para no repetir y para gamificación. **Una fila por usuario+título** (upsert con `max(pct)`), no un log de eventos — un log crece sin techo y no aporta nada acá. |
| Comentarios | Sí (Fase 5) | Tabla nueva `comments`. **No reusar `user_reviews`**: tiene `unique(user_id, tmdb_id, tipo)`, o sea un texto por persona por título. Un comentario no es una reseña. |
| Reportes / bloqueos | Sí (Fase 5) | `comment_reports`, `user_blocks` |
| 🔗 Shares | **No** | Un contador de shares no cambia ninguna decisión de producto a esta escala. Si algún día querés la métrica, va a analytics, no a Postgres. |
| Rachas / insignias / stats | **No** | Todo derivable de `trailer_views` con una función SQL. Cero denormalización hasta que haya un problema de performance real. |
| Posición en el feed | **No** (`sessionStorage`) | Efímero por definición. |

### SQL nuevo (a agregar al final de `supabase/schema.sql`)

```sql
-- Ampliar user_items para 'interested' (👍 Me interesa)
alter table user_items drop constraint if exists user_items_kind_check;
alter table user_items add constraint user_items_kind_check
  check (kind in ('list','watched','interested'));

-- 👎 No me interesa
create table if not exists trailer_dismissed (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  tmdb_id    integer not null,
  tipo       text not null check (tipo in ('movie','tv')),
  created_at timestamptz not null default now(),
  unique (user_id, tmdb_id, tipo)
);

-- Historial de trailers vistos (una fila por usuario+título)
create table if not exists trailer_views (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  tmdb_id    integer not null,
  tipo       text not null check (tipo in ('movie','tv')),
  pct        smallint not null default 0 check (pct between 0 and 100),
  completed  boolean not null default false,
  seen_at    timestamptz not null default now(),
  unique (user_id, tmdb_id, tipo)
);
create index if not exists trailer_views_user_seen
  on trailer_views (user_id, seen_at desc);

-- RLS: mismo patrón que user_items / view_history
alter table trailer_dismissed enable row level security;
create policy "cada uno gestiona sus descartes" on trailer_dismissed
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table trailer_views enable row level security;
create policy "cada uno gestiona sus trailers vistos" on trailer_views
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Stats derivadas (gamificación, Fase 6)
create or replace function trailer_stats(p_user uuid)
returns table (vistos bigint, completos bigint, racha int)
language sql security definer stable as $$ ... $$;
```

### Fase 5 — comentarios y moderación

```sql
create table if not exists comments (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  tmdb_id    integer not null,
  tipo       text not null check (tipo in ('movie','tv')),
  texto      text not null check (char_length(texto) between 1 and 600),
  parent_id  uuid references comments (id) on delete cascade,
  estado     text not null default 'visible'
             check (estado in ('visible','oculto','eliminado')),
  origen     text not null default 'ficha'
             check (origen in ('ficha','trailer')),   -- solo analítica
  created_at timestamptz not null default now()
);
create index if not exists comments_title on comments (tmdb_id, tipo, created_at desc);

create table if not exists comment_reports (
  id         uuid primary key default gen_random_uuid(),
  comment_id uuid not null references comments (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  motivo     text not null check (motivo in ('spam','ofensivo','spoiler','otro')),
  created_at timestamptz not null default now(),
  unique (comment_id, user_id)
);

create table if not exists user_blocks (
  user_id    uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_id)
);
```

**Moderación mínima viable (sin construir un panel completo):**

1. **Lectura:** solo `estado = 'visible'`, y filtrando autores bloqueados por RLS.
2. **Auto-ocultar:** trigger que pasa a `oculto` al llegar a **3 reportes
   distintos**. Sin intervención humana.
3. **Rate limit:** máximo 5 comentarios por usuario por hora, chequeado en una
   función `security definer` (no confiable solo en el cliente).
4. **Anti-spam básico:** rechazar comentarios con URLs, con >60% de mayúsculas, o
   duplicados exactos del mismo usuario.
5. **Bloqueo:** el usuario bloquea a otro; sus comentarios desaparecen de su vista.
6. **Panel admin:** una pestaña nueva en `/admin` con la cola de `oculto` +
   reportes. El admin puede restaurar o pasar a `eliminado`. **Esto es todo el
   panel** — sin dashboards ni métricas.

⚠️ **Bloqueante para comentarios:** hoy las políticas de `profiles`
(`schema.sql:19-28`) solo permiten leer el perfil propio. Para mostrar el nombre y
avatar del autor de un comentario hace falta una vista `public_profiles`
exponiendo solo `(id, display_name, avatar_seed)` con lectura para
`authenticated`. Es un cambio de superficie de privacidad — hay que decidirlo
conscientemente.

---

## 8. Integración con el ecosistema

Ninguna de estas es opcional; son lo que evita que Trailer Zone sea una isla.

| Con | Integración |
|---|---|
| **Bottom nav** | FAB central. `Inicio · Series \| [TZ] \| Películas · Mi lista`. El buscador sube a la TopBar como ícono junto al avatar. |
| **Ficha** (`DetailView.tsx`) | El hero (`:32-36`) hoy es una imagen estática. Gana un botón **▶ Ver trailer** que abre el player inline. `UITitleDetail` gana `trailer`. Es el mismo `lib/videos.ts` — costo marginal cero. |
| **Ficha ← feed** | Botón "Ver ficha" navega a `/titulo/{tipo}/{id}?from=tz`. El botón "atrás" de la ficha vuelve al feed en la misma posición. |
| **Mi Lista** | ❤️ escribe en `user_items` kind=`list`. Aparece igual que si lo hubieras marcado desde la ficha. |
| **Área de usuario** (`UserHub.tsx`) | Riel nuevo **"Te interesaron"** (`itemRefs("interested")`), al lado de los tres existentes. Usa `UserShelf` sin cambios. |
| **Votos** | 👍/👎 del feed son **distintos** del voto de 3 niveles de la ficha. 👍 = "quiero verla" (intención). El voto = "la vi y opino" (juicio). No los mezclamos: son cosas diferentes y confundirlas ensucia `top_voted` y "Hacete cargo". |
| **Desempate** | Ver §3. Bandeja en `sessionStorage` + acción `HYDRATE`. |
| **Plataformas** | El mazo se filtra por `PlatformsContext`. Cambiar plataformas invalida el feed y lo recarga (mismo patrón que `useApi.ts:6-22`). |
| **Buscador** | Cada resultado de búsqueda con trailer disponible gana un ícono ▶ que abre Trailer Zone posicionado en ese título (`/trailers?at=movie:693134`). |
| **Reseñas editoriales** | Si el título tiene reseña publicada, la tarjeta muestra el badge **"Reseña SC"** — mismo criterio que la ficha. Es el diferencial del producto, tiene que estar visible en el feed. |
| **Historial** | Ver la ficha desde el feed dispara `recordView` (ya lo hace `ListActions.tsx:21`). |

---

## 9. Riesgos técnicos

Ordenados por probabilidad × impacto.

| # | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| 1 | **Swipe sobre el iframe no scrollea** (los eventos táctiles no burbujean). | Alta | Alto | Cinema Card deja ~76% del alto libre para gesto. Además: flechas ⌃/⌄ visibles y teclado en desktop. **Validar en un spike de la Fase 1, antes de construir nada más.** |
| 2 | **Trailers no embebibles** (age-restricted / embed off). | Alta | Medio | Handler de `onError` (101/150) → fallback + auto-avance 4s + marca en Redis 30d que beneficia a todos. Si la tasa supera ~15%, evaluar YouTube Data API en Fase 6. |
| 3 | **Performance en móviles gama media.** Los iframes de YouTube son pesados. | Media | Alto | Límite duro de 2 iframes. `destroy()` en vez de pausar. Ventana de 5 slides. Probar en un Android real, no solo en DevTools. |
| 4 | **Consumo de datos móviles.** Autoplay de video en 4G. | Media | Alto | `saveData` respetado + preferencia manual en `/cuenta/configuracion` + aviso en el onboarding. |
| 5 | **Cobertura de trailers.** Catálogo AR viejo o de nicho sin trailer en TMDB. | Media | Medio | Marca negativa cacheada. Si el mazo baja de 20 items, se relajan los filtros de plataforma para el bucket de descubrimiento. |
| 6 | **iOS Safari y autoplay inline.** Requiere `playsinline=1`; algunas versiones fuerzan fullscreen nativo. | Media | Alto | Parte del spike de Fase 1. Sin esto la sección no existe en iPhone. |
| 7 | **ToS de YouTube.** Tapar el player, quitar branding o simular reproducción propia. | Baja | Muy alto | Cinema Card cumple por diseño: player visible, controles accesibles, sin overlays encima. **No introducir zoom/crop en ninguna fase.** |
| 8 | **Explosión del cache del mazo.** Una key por usuario sería inservible. | Baja | Medio | Key = `fecha + providersHash + tasteBucket`. Combinaciones acotadas por diseño. |
| 9 | **Moderación de comentarios** desbordada. | Baja (Fase 5) | Alto | Auto-ocultar a 3 reportes, rate limit server-side, sin URLs. La Fase 5 es la última justamente por esto. |
| 10 | **Memory leaks** de players no destruidos en navegación rápida. | Media | Medio | Cleanup en `useEffect` de `useYouTubePlayer`, con guard de doble-montaje de StrictMode (mismo problema que ya resolvieron en `Wheel.tsx:17-21`). |

---

## 10. Plan de implementación por fases

Cada fase es entregable y verificable por separado.

### Fase 0 — Spike técnico (medio día) ⚠️ BLOQUEANTE

**Antes de escribir cualquier feature.** Una página descartable con 3 trailers
hardcodeados que valide, en un iPhone y un Android reales:

- [ ] ¿Autoplay muteado inline funciona en iOS Safari?
- [ ] ¿El swipe sobre las zonas de gesto scrollea con el iframe presente?
- [ ] ¿`onStateChange` y `getCurrentTime` reportan progreso confiable?
- [ ] ¿Cuánto tarda en montar un player? ¿Y dos?

**Si el swipe o el autoplay inline fallan, el diseño cambia.** No seguir sin esto.

### Fase 1 — Cimientos de datos (1 día)

- `titleVideos()` en `lib/tmdb.ts` + tipo `RawVideo`
- `lib/videos.ts` con la selección por puntaje
- Cache Redis (`videos:*`) incluyendo el sentinel negativo
- `lib/feed.ts` con **un solo bucket** (tendencias) para arrancar
- `GET /api/trailer-feed` funcional

**Verificación:** `curl` al endpoint devuelve 10 items con `youtubeKey` válido.

### Fase 2 — Feed navegable (2-3 días)

- `app/trailers/page.tsx` + `TrailerFeed` + `TrailerCard` + `TrailerPlayer`
- Cinema Card completo, scroll-snap, IntersectionObserver
- Ventana de 5 / máximo 2 iframes
- Mute global, onboarding, fallback no-embebible
- CSS `.tz-*` en `globals.css`
- Sin acciones todavía

**Verificación:** feed usable en móvil, 30 trailers sin degradación de memoria.

### Fase 3 — Acciones y persistencia (2 días)

- Migración SQL: kind `interested`, `trailer_dismissed`, `trailer_views`
- `lib/trailerdata.ts`
- `TrailerActions` + `TrailerEndPanel` con countdown
- Bottom-sheet de login para anónimos
- Batch de `trailer_events`

**Verificación:** marcar en el feed → aparece en `/cuenta/lista`. Descartar →
no vuelve a aparecer.

### Fase 4 — Feed inteligente (1-2 días)

- `lib/taste.ts` + los 5 buckets con pesos
- Intercalado anti-tanda
- Exclusiones (vistos, descartados, no-embebibles)
- Cache del mazo con `tasteBucket`
- Pantalla de fin de mazo

**Verificación:** dos usuarios con gustos distintos reciben mazos distintos; el
mismo usuario recargando recibe el mismo mazo.

### Fase 5 — Navegación e integración (1 día)

- `BottomNav` con FAB central; buscador a `TopBar`
- Riel "Te interesaron" en `UserHub`
- Botón ▶ trailer en la ficha (`DetailView`)
- Hand-off al Desempate (`sessionStorage` + `HYDRATE`)
- Deep-link `/trailers?at=movie:123` desde el buscador

**Verificación:** los 5 puntos de integración funcionan en ambas direcciones.

### Fase 6 — Comentarios y moderación (3-4 días)

- Tablas `comments`, `comment_reports`, `user_blocks` + RLS
- Vista `public_profiles` (⚠️ decisión de privacidad)
- Hoja de comentarios en el feed + sección en la ficha (**misma fuente**)
- Auto-ocultar a 3 reportes, rate limit, anti-spam
- Cola de moderación en `/admin`

### Fase 7 — Gamificación (1-2 días)

Solo lo que se deriva de `trailer_views`, sin tablas nuevas:

- **Racha**: días consecutivos con al menos 1 trailer completo
- **Contador**: "Viste 47 trailers · 23 completos"
- **Insignias** derivadas: *Maratonista* (10 en un día), *Curioso* (5 géneros
  distintos), *Fiel* (racha de 7), *Descubridor* (agregaste 10 a Mi Lista desde
  el feed)
- Se muestran en `/cuenta/perfil` y reemplazan el tile muerto **"Mis emblemas"**
  de `UserHub.tsx:36`

**Deliberadamente ausente:** ranking público entre usuarios. Convierte
descubrimiento en competencia y arruina la calidad de las señales del feed.

---

## Recomendaciones finales

1. **La Fase 0 no es opcional.** Los riesgos #1 y #6 (swipe sobre iframe,
   autoplay inline en iOS) pueden invalidar el diseño de interacción entero. Medio
   día de spike ahora vale más que tres días de rehacer la Fase 2.

2. **Lanzá con las Fases 0-5 y medí antes de la 6.** El MVP real es el feed con
   acciones e integración. Los comentarios son un producto aparte, con su propio
   costo de moderación, y no tiene sentido construirlos hasta saber si la gente
   usa el feed. *(Ya decidido — queda acá como registro.)*

3. **No cedas al zoom-to-fill después.** Va a haber tentación de "hacerlo más
   TikTok". Cinema Card no es una concesión al formato: es la decisión que resuelve
   simultáneamente los ToS (#7), el gesto sobre el iframe (#1) y la identidad
   visual premium.

4. **👍 "Me interesa" y el voto de la ficha tienen que quedar separados.**
   Intención ≠ juicio. Mezclarlos contamina `top_voted` y "Hacete cargo", que
   hoy funcionan porque significan algo preciso.

5. **El mazo determinístico es una ventaja de producto, no una limitación
   técnica.** "Terminaste el mazo de hoy, mañana hay uno nuevo" es coherente con
   el Modo Indeciso y crea un motivo real para volver. Un feed infinito compite
   con TikTok en su cancha — y ahí perdés.

6. **Aprovechá para arreglar tres cosas que este trabajo toca de cerca:** el
   `null` no cacheado en `lib/cache.ts:23`, los cuatro `await` secuenciales de
   `detail()` (`enrich.ts:206-209`), y el `?providers=` muerto en
   `/api/title/[tipo]/[id]`. Son chicos y están en el camino.

---

## Verificación end-to-end (al cerrar la Fase 5)

```bash
npx tsc --noEmit          # 0 errores
npx next build            # compila (puede fallar por fuentes sin red)
npm run dev
```

Recorrido manual, en móvil real:

1. `/` → FAB central → `/trailers` → el primer trailer arranca muteado
2. Tap en 🔇 → hay audio; swipe ⌃ → el siguiente ya arranca con audio
3. Dejar terminar un trailer → aparece el panel con countdown
4. ❤️ Mi Lista → ir a `/cuenta/lista` → el título está
5. 👍 → `/cuenta` → aparece en el riel "Te interesaron"
6. 👎 → recargar `/trailers` → ese título no vuelve
7. 🎲 Desempate ×2 → `/` → el banner muestra los 2 títulos en bandeja
8. "Ver ficha" → volver → el feed está en la misma posición
9. Cambiar plataformas en TopBar → el mazo se recarga y respeta el filtro
10. Recargar la página → **mismo mazo, mismo orden** (determinismo diario)
11. DevTools → Memory: tras 30 slides, ≤2 iframes vivos y sin crecimiento sostenido
12. Sin sesión: el feed funciona; una acción abre el bottom-sheet de login
```
