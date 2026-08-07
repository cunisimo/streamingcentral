# StreamingCentral — contexto del proyecto

Agregador de streaming para Argentina. Resuelve "no sé qué ver": agrega catálogo
de las plataformas del usuario (Netflix, Disney+, Max, etc.), sin cine ni TV
abierta. El diferencial frente a JustWatch/similares son las **reseñas
editoriales propias** (el dueño del proyecto, no una IA) cargadas vía dashboard.

Dueño del proyecto: desarrollador freelance WordPress/PHP, experimentado, pero
este es su primer proyecto en Next.js/React. Prefiere respuestas técnicas
directas, sin relleno, con las limitaciones reales marcadas antes de codear
(no después, como excusa).

## Stack y por qué

- **Next.js 14 App Router + TypeScript + Tailwind.** SSR/API routes en un solo
  proyecto, deploy directo a Vercel.
- **TMDB** — fuente de verdad del catálogo: metadata, providers por región,
  búsqueda, recomendaciones, personas. Bearer token v4 (`TMDB_READ_TOKEN`),
  **no** el `api_key` v3.
- **OMDB** — IMDb rating + Metacritic (TMDB no los tiene). Opcional: sin clave,
  la app funciona, esos dos datos simplemente no aparecen en la ficha.
- **Upstash Redis** — cache de providers/ratings/covers. Opcional: sin
  credenciales, `lib/cache.ts` cae a cache en memoria (se pierde en cada cold
  start de serverless, pero no rompe nada).
- **Supabase** — Postgres + Auth, solo para reseñas editoriales y el login del
  dashboard `/admin`. RLS activado.

## Decisiones de arquitectura que importan

- **TMDB es la fuente del catálogo, no se replica.** Supabase solo guarda
  `editorial_reviews`. La ficha se arma en cada request combinando
  TMDB + OMDB + Supabase, cacheado en Redis (`lib/enrich.ts` → `detail()`).
- **Región fija `AR`.** `watch_region=AR`, `with_watch_monetization_types=flatrate`.
  Todo lo que no tenga oferta de streaming plano en AR simplemente no aparece
  (es la definición de "solo streaming" de esta app, no un filtro extra).
- **"Mis plataformas" vive en `localStorage`**, sin cuentas de usuario en la
  parte pública (`components/PlatformsContext.tsx`, key `sc:platforms`). Todo
  fetch a `/api/*` lleva `?providers=n,d,m` y el server filtra con eso.
- **Géneros TMDB difieren entre movie y tv.** TV no tiene género Terror; se
  resuelve con keyword `9799`. El mapeo vive en `lib/categories.ts`.
- **"Modo indeciso" (Home) es determinístico por día**, no random en cada
  render: `lib/cache.ts` → `dailySeed()` + `pickDaily()` (mulberry32 +
  Fisher-Yates con seed de la fecha). "Mostrame otras" es un offset sobre el
  mismo pool, no un fetch nuevo random.
- **Votos/reseñas de usuario están en el schema pero NO construidos**
  (`supabase/schema.sql`, tablas `votes` y `user_reviews`, con RLS). Esto es a
  propósito — el dueño quiere ese módulo en standby hasta decidir el sistema
  de cuentas del lado público.
- **El Home se arma en un solo lugar (`lib/home.ts`, "Home Composer").** Pipeline
  `TMDB → audiencia → compose → dedup → [rotación] → [personalización] → JSON`.
  Un título aparece **una sola vez** en todo el Home: la prioridad es el orden
  visual, y lo que toma un riel se lo quita a los de abajo (clave `type:id`,
  nunca el nombre). **Excepciones que no participan:** "Próximamente" y
  "Desempatá" (no reservan ni se filtran), y el hero solo reserva su estado base
  — los chips y "Mostrame otras" no rearman el Home. `rotate()` y `personalize()`
  están cableados como identidad: son los puntos de extensión, no implementados.
  `HOME_GENRES` y `defaultTypeFor` viven en `components/data.ts` (client-safe),
  no en `lib/home.ts`: importarlos desde el cliente arrastraba el cliente de
  Upstash Redis (70 KB) al bundle del navegador. Los carruseles de audiencia
  ("Para toda la familia", "Animación para adultos") usan su propio tope
  `AUDIENCE_CARDS` (40 tarjetas), no `VISIBLE_CARDS`. "Lo más votados" y
  "Hacete cargo" no se rellenan tras el dedup — su tope lo pone la cantidad de
  votos en la base, no el algoritmo de relleno.
- **Animación y familia son DOS filtros separados, y el `scope` lo decide el
  llamador** (`lib/audience.ts` → `excludedGenres`). Mezclarlos ya causó dos bugs
  reportados, así que no volver a unirlos:

  | Superficie | Animación (16) | Familia (10751/10762) |
  |---|---|---|
  | Rieles de género del Home (`scope: "home"`) | excluye | excluye |
  | Recomendador y `/categoria/[slug]` (`scope: "browse"`) | excluye | **muestra** |
  | Próximamente, búsqueda, listas del usuario (sin `scope`) | muestra | muestra |

  El filtro de familia en búsqueda explícita dejaba "Magia navideña" sin *Solo en
  casa 2*, *El mago de Oz* ni *¡Qué bello es vivir!* (familiares, no animadas),
  devolviendo *Terrifier 3* e *Iron Man 3*, que solo comparten la keyword. La
  animación excluida no se pierde: va al riel de cruce de cada categoría
  ("Terror en dibujos"), que ya existía vía `genre2`. Por eso `excludedGenres`
  mira **`genre` y `genre2`**: en el cruce el usuario pidió animación justamente.
- **Crunchyroll (`cr`) desactiva el filtro de animación en TODA la app.** Su
  catálogo es anime casi puro: con el filtro puesto, a quien la elige le quedaba
  el 4% de las series (60 de 1640) y los rieles se vaciaban (Terror 38→0, Acción
  684→2). Alcanza con tenerla elegida, aunque haya otras. Además, si es la
  **única** plataforma, el carrusel "Animación para adultos" se oculta: todo el
  Home ya es anime y sería el mismo contenido con otro título. Con Crunchyroll +
  otra (Max, Netflix) se mantiene, porque esas también tienen animación adulta.

## Limitaciones duras de TMDB (no son bugs, no tienen fix)

Estas ya se explicaron y aceptaron; si aparecen de nuevo como "bug", recordar
esto antes de prometer una solución:

- **No hay deep-link nativo por plataforma.** `watch/providers` da un único
  link agregador por título/región (tipo JustWatch), no `netflix.com/title/xxx`.
  El botón "Ver en…" abre ese link agregador — es lo máximo disponible.
- **FilmAffinity no tiene API pública.** Se descartó, no se va a agregar salvo
  que el dueño acepte scraping (frágil, legalmente gris — no se ofreció esa
  opción, no ofrecerla de nuevo sin que la pida explícitamente).
- **No hay endpoint de personas por orden alfabético.** Solo `/person/popular`
  paginado por popularidad. El listado de actores del buscador usa ese orden
  con "Cargar más" — no hay forma de dar A-Z real.
- **No se puede filtrar personas por país/nacionalidad.** El dato existe en el
  detalle individual (`place_of_birth`) pero no es filtrable en ningún listado.
- **Certificación por edad solo en `movie`, no en `tv`.** Y la certificación
  AR está incompleta en TMDB; se usa la de US mapeada (ATP→PG, +13→PG-13,
  +16→R, +18→NC-17) como aproximación en `app/api/discover/route.ts`.

## Estructura

```
app/
  page.tsx, buscar/                          — Home y buscador (no hay /peliculas ni
                                               /series: el toggle Películas/Series vive
                                               por riel, ver "Home y nav")
  categoria/[slug]/, lista/[slug]/           — "Ver todas" de un género y de un riel
  persona/[id]/, titulo/[tipo]/[id]/         — ficha de persona y de título
  cuenta/                                     — área de usuario (hub, perfil, listas, config)
  proximamente/, directores/, onboarding/     — agenda de estrenos, directores, alta inicial
  admin/                                      — dashboard editorial (login + CRUD reseñas)
  api/                                        — todas las rutas backend (ver abajo)
  layout.tsx                                  — fuentes (next/font/google) + PlatformsProvider
  globals.css                                 — todo el CSS (sin CSS-in-JS), tokens en :root

components/
  CatalogView.tsx      — orquesta el Home: un solo fetch a `/api/home` (ver `lib/home.ts`)
                          y los rieles se renderizan con `Shelf` en modo controlado
  IndecisoHero.tsx      — el "modo indeciso" de Home
  Shelf.tsx              — riel horizontal genérico. Dos modos: controlado (recibe
                            `items`, lo usa el Home) o auto-fetch a `/api/discover`
  CategoryView.tsx       — grilla paginada de un género (`/categoria/[slug]`)
  ListaView.tsx          — grilla de un riel completo (`/lista/[slug]`)
  SearchView.tsx         — buscador completo: modos de navegación + filtros + paginación
  DetailView.tsx         — ficha de título
  PersonView.tsx         — filmografía de una persona (actor o director)
  PersonCard.tsx          — tarjeta de persona
  TitleCard.tsx           — card de título (usada en shelves, grillas, relacionados)
  PlatformsContext.tsx    — "mis plataformas" en localStorage
  TopBar.tsx / BottomNav.tsx / Filters.tsx / PlatformLogo.tsx
  useApi.ts               — hook de fetch compartido: expone `offline` (fallo de
                             red) y `error` (fallo HTTP) por separado, y una opción
                             `keepPrevious` (solo la usa `CatalogView`, para no
                             vaciar el Home mientras llega un refetch por toggle)
  data.ts                  — client-safe: `HOME_GENRES` y `defaultTypeFor` (absorbió
                             al viejo `SHELVES`). Lo importan tanto `CatalogView`
                             (cliente) como `lib/home.ts` (server) — ver nota de
                             arquitectura abajo sobre por qué no viven en `lib/home.ts`

lib/
  tmdb.ts        — cliente TMDB crudo (fetch + tipos raw)
  omdb.ts         — cliente OMDB
  enrich.ts        — TODO EL MERGE: raw TMDB → shape UI, combina con OMDB/Supabase/cache.
                      Punto de entrada para casi cualquier feature nueva de datos.
  home.ts           — Home Composer: arma el Home entero (hero + rieles) en un
                       solo pipeline server-side, deduplicado. Ver nota de
                       arquitectura abajo.
  providers-ar.ts   — mapeo plataforma↔id TMDB para Argentina (revisar si una
                      plataforma nueva no aparece — puede que falte su provider_id)
  categories.ts      — géneros UI ↔ géneros/keywords TMDB (movie vs tv)
  cache.ts            — wrapper Redis/memoria + el motor determinístico del indeciso
  supabase.ts          — clientes browser/server
  reviews.ts            — acceso a editorial_reviews
  types.ts               — shape estable que consume toda la UI (UITitle, UITitleDetail, UIPerson)

supabase/schema.sql   — editorial_reviews (activo) + votes/user_reviews (dormido, no usado)
```

## Rutas API (todas `force-dynamic`, sin caché de Next)

| Ruta | Qué hace |
|---|---|
| `GET /api/home` | arma el Home entero (hero + rieles) deduplicado, vía `lib/home.ts`. Único con `maxDuration = 60` |
| `GET /api/discover` | listado por tipo+género+país+edad, filtrado a `providers` |
| `GET /api/audience` | carruseles de audiencia (`family` / `adult-anime`), recetas de `lib/audience.ts` |
| `GET /api/upcoming` | agenda de estrenos "Próximamente" (motor tmdb-sync, tabla propia) |
| `GET /api/providers` | catálogo de plataformas disponibles en AR (onboarding y selector) |
| `GET /api/recomendaciones` | pool del "modo indeciso" (día + offset) |
| `GET /api/mas-votados` | "Lo más votados" (votos ta buena+petacular, `top_voted` 2-3) |
| `GET /api/hacete-cargo` | "Hacete cargo" (votos malaso, `top_voted` 1-1) |
| `GET /api/search` | búsqueda multi (títulos sin filtrar por plataforma + personas) |
| `GET /api/latest` | últimos estrenos (solo movie, por fecha) |
| `GET /api/person/[id]` | filmografía de una persona (actor o director), filtrada a plataformas |
| `GET /api/personas` | actores populares paginados (`?page=`) |
| `GET /api/directores` | lista curada de directores (`DIRECTOR_IDS` en `lib/enrich.ts`) |
| `GET /api/genre-covers` | un póster representativo por género, cacheado 24h |
| `GET /api/title/[tipo]/[id]` | ficha completa (TMDB+OMDB+Supabase+relacionados) |
| `GET /api/admin-search` | búsqueda TMDB sin filtro de plataforma, para el editor de reseñas |
| `GET /api/cards` | enriquece una lista de ids (`items=movie:1,tv:2`) a cards, sin filtro de plataforma (listas del usuario) |

## Estado actual (todo lo de arriba está construido y validado)

Validado con `npx tsc --noEmit` (0 errores) y `npx next build` (compila
completo). El único fallo de build visto fue la descarga de Google Fonts en
sandbox sin red — no ocurre en Vercel ni en desarrollo normal con internet.

Ya resueltos en iteraciones anteriores (por si aparecen reportados de nuevo):
- Búsqueda con debounce real (250ms, desde 2 caracteres), sin filtrar por
  plataforma (para que aparezca aunque no la tengas — la card indica
  disponibilidad).
- Filtros de género/país combinables y funcionales en `/categoria/[slug]`.
- Filtro de edad (solo movie, ver limitación arriba).
- Chips Todo/Películas/Series/Actores del buscador son modos de navegación
  reales cuando no hay texto en el input.
- Actores populares paginados con "Cargar más".
- Ficha: hero alto con backdrop, puntajes TMDB siempre + IMDb/Metacritic si
  hay OMDB, badge y sección de reseña editorial ("Reseña SC"), música,
  temporadas/episodios en series, slider de relacionados.
- Home: rieles de género con toggle Películas/Series (default alternado
  movie/tv), riel "Últimos lanzamientos", rieles de votos y los dos carruseles
  de audiencia. El riel "Directores" se sacó del Home; la página
  `/directores` y `/api/directores` siguen existiendo.
- Ícono "Mi lista" corregido (el path del check estaba mal).
- Lista de países ampliada (34 países).
- Tiles de "Explorar todo" con póster real de fondo, no solo color plano.

## Pendiente / en standby (decisión explícita del dueño, no lo reactives sin que lo pida)

- ~~**"Las más votadas"**~~ — YA CONSTRUIDO. Login público activo → `LikeButton`
  en la ficha (malaso/ta buena/petacular), tabla `votes`, función `top_voted`
  por rango de rating, y dos shelves en Home: "Lo más votados" (2-3) y
  "Hacete cargo" (1). Requiere re-correr `supabase/schema.sql` para que
  `top_voted` tome la firma de 4 args.
- ~~**"Películas que viste" + "Perfil de usuario / 5ta pestaña"**~~ — YA CONSTRUIDO. Área de usuario completa: hub con rieles (Mi lista, Me gustaron, Vistos recientemente), perfil con edición de nombre y picker de avatar (avatares DiceBear), historial de vistas (`view_history`), Mi lista y Ya la vi (`user_items`). Próximos módulos: **Mis amigos** y **Mis emblemas** (placeholders en el hub). Requiere re-correr `supabase/schema.sql`.

## PWA (instalable — construido)

La app es una PWA instalable en Android, iPhone y escritorio. Diseño completo en
`docs/superpowers/specs/2026-07-21-pwa-design.md`. Piezas:

- **Manifest**: `app/manifest.ts` (metadata route tipada). **Íconos/splash**: se
  generan con `node scripts/generate-pwa-assets.mjs` desde `assets/brand/logo.svg`
  (fuente única). Si cambia el logo, re-ejecutar ese script regenera los 26
  assets **y** `components/pwa/AppleSplashLinks.tsx`. La lista de dispositivos iOS
  vive en `scripts/pwa-devices.mjs` (compartida generador↔componente).
- **Service Worker**: `public/sw.js` + `public/sw/*` (propio, sin librerías,
  `importScripts` con un IIFE por módulo). Estrategias: HTML `Network First`;
  `/_next/static` e íconos `Cache First`; imágenes TMDB `Cache First` 30d/tope 300;
  **`/api/*` y Supabase `Network Only`** (nunca datos viejos); YouTube sin tocar;
  solo GET. `push`/`sync`/`share-target` son módulos **reservados** (comentados).
- **Offline**: `public/offline.html` (HTML estático, **no** una ruta de Next: servir
  una ruta de Next bajo otra URL rompe la hidratación) + `components/pwa/OfflineState.tsx`;
  `useApi` expone `offline`/`retry`, conectado en DetailView/CategoryView/ListaView/
  PersonView, y `CatalogView` muestra un único estado offline en vez de dejar la
  pantalla vacía cuando todos los rieles se ocultan.

**Arquitectura completa documentada en `docs/PWA.md`.**
- **Instalación/actualización**: `components/pwa/PwaClient.tsx` orquesta registro,
  `InstallPrompt` (banner Android / instrucciones iOS), `UpdateToast` y
  `StandaloneWelcome`. Fila "Instalar" en `/cuenta/configuracion`.

### Reglas al tocar la PWA (para no romperla)

- **El SW NO corre en `next dev`** (a propósito: cachear en dev es un infierno de
  depuración). Para probarlo: `npx next build && npx next start`.
- **Al cambiar cualquier archivo del SW, subir `CACHE_VERSION`** en
  `public/sw/config.js`. Si no, `activate` no limpia los caches viejos.
- **No cachear `/api/*` ni Supabase.** Es la prioridad del dueño: mejor fallar y
  mostrar `OfflineState` que mostrar catálogo/listas desactualizadas.
- Los módulos del SW comparten un scope global (`importScripts`): cada uno va
  envuelto en IIFE para no colisionar `const` entre archivos.
- **Lighthouse ya no tiene categoría PWA** (eliminada en v12). Verificar
  instalabilidad en DevTools → Application → Manifest / Service Workers.

### Limitaciones de iOS (no son bugs — no prometer fixes)

- Safari **no** soporta `beforeinstallprompt`: en iPhone el banner solo da
  instrucciones ("Compartir → Agregar a inicio"), no instala con un botón.
- iOS ignora casi todo el manifest (display, theme_color, shortcuts, orientation):
  eso se cubre con meta `apple-*` y los 18 splash a mano.
- **Instalar en iOS crea un contexto de storage nuevo**: se pierden plataformas,
  tema y sesión de Safari. Por eso `StandaloneWelcome` da la bienvenida y manda a
  elegir plataformas en el primer arranque. Si alguien reporta "se borró todo al
  instalar", es esto, no un bug.
- Los screenshots del manifest (`public/screenshots/`) son placeholders branded;
  reemplazables por capturas reales sin tocar el manifest.

## Cómo levantar en local

```bash
cp .env.local.example .env.local   # completar TMDB_READ_TOKEN + Supabase; OMDB/Upstash opcionales
npm install
npm run dev
```

Antes de dar por bueno un cambio: `npx tsc --noEmit` y, si el cambio toca algo
grande, `npx next build` (puede fallar solo por fuentes de Google si no hay
red — no es indicativo de error real en ese caso).

## Convenciones a mantener

- Todo el texto de la UI en español rioplatense.
- Sin CSS-in-JS ni styled-components: todo en `app/globals.css`, clases planas
  reusando las que ya existen antes de inventar una nueva.
- `lib/enrich.ts` es el único lugar que debería tocar OMDB/Supabase/TMDB juntos.
  Las rutas API son finas: parsean query params y llaman una función de `enrich.ts`.
- Tipos de UI (`UITitle`, `UITitleDetail`, `UIPerson`) son el contrato estable
  que consume toda la capa de componentes — si agregás un campo nuevo del lado
  de datos, agregalo ahí primero.
