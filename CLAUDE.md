# StreamingCentral — contexto del proyecto

Agregador de streaming para Argentina. Resuelve "no sé qué ver": agrega catálogo
de las plataformas del usuario (Netflix, Disney+, Max, etc.), sin cine ni TV
abierta.

**El diferencial hoy son la ruleta y los votos de la comunidad, NO las reseñas
editoriales.** El módulo de reseñas propias está construido (dashboard `/admin`,
tabla `editorial_reviews`, badge y sección en la ficha) pero **en standby por
decisión del dueño**: si algún día negocia con una plataforma, un puntaje bajo
firmado por Yump sobre una película de esa plataforma se vuelve una variable de
la negociación. La tabla está vacía a propósito y el cuadro "Reseña Yump" de la
ficha no se renderiza nunca. **No proponer cargar reseñas ni reactivar el
módulo** sin que el dueño lo pida.

Si algún día se retoma, el camino ya está probado y es el de la ruleta: **voz
editorial sin puntaje**. Cada título del pool trae un "por qué esta" y un "pero"
honesto, sin nota numérica — describe para quién es cada cosa en vez de
ordenarla, y es mucho menos objetable en una negociación que un 4/10.

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
- **OMDB se sacó** (IMDb + Metacritic). Sus términos permiten uso personal y
  prohíben construir algo con esos datos *"whether or not for profit"*, y la app
  se publica abierta. No hay reemplazo gratis: Metacritic no tiene API pública y
  Rotten Tomatoes y Letterboxd tampoco. **No volver a agregarlo** sin una
  licencia. Los puntajes de la ficha son ahora el propio (`ScScore`), el de TMDB
  y el editorial.
- **Upstash Redis** — cache de providers/covers. Opcional: sin
  credenciales, `lib/cache.ts` cae a cache en memoria (se pierde en cada cold
  start de serverless, pero no rompe nada).
- **Supabase** — Postgres + Auth, solo para reseñas editoriales y el login del
  dashboard `/admin`. RLS activado.

## Decisiones de arquitectura que importan

- **TMDB es la fuente del catálogo, no se replica.** Supabase solo guarda
  `editorial_reviews`. La ficha se arma en cada request combinando
  TMDB + Supabase, cacheado en Redis (`lib/enrich.ts` → `detail()`).
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
  **`dailySeed()` usa la fecha de `America/Argentina/Buenos_Aires`, no UTC**: el
  "día" de esta app es el día argentino. Con UTC, todo lo que rota por día
  cambiaba a las 21:00 locales, en pleno horario de uso. Son **seis llamadas en
  cinco features** las que dependen de esa semilla — la clave de cache del Home,
  la mezcla de los rieles de género, el pool del recomendador, el intercalado
  documentales/ficción, el orden de los chips curados y la tanda de la ruleta —
  así que tocarla las mueve a todas juntas, que es lo que se quiere.
  Quedan otras fechas calculadas en UTC — ver **issue #4** en `docs/ISSUES.md`.
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
  **El payload compuesto se cachea entero** (`homePayload()`, clave
  `home:v2:<semilla>:<plataformas ordenadas>:<tipos>`, TTL 6 h — el número lo
  manda la cuota de Upstash, ver el comentario de `TTL.home`). La versión de la
  clave se sube cuando cambia el **contenido** del payload, no su forma: si no,
  lo ya cacheado se sigue sirviendo hasta que expire el TTL y el cambio "no se
  ve" después de deployar (`v2` = ventana de votos de 7 a 90 días). Los `cached()`
  de `enrich.ts` ya evitaban los ~300 pedidos a TMDB, pero no el costo de
  rearmar: cada request seguía haciendo cientos de round-trips a Upstash. Medido
  en producción, ese piso eran ~2.9 s con todo cacheado y ~5.2 s en frío; con el
  payload guardado, la segunda visita es un solo GET. **Un payload `degradado` no
  se guarda** (`cachedIf` en `lib/cache.ts`): si no, una caída pasajera de TMDB
  queda congelada para todos. La clave ordena las plataformas: "n,d,m" y "m,d,n"
  son el mismo Home. **Ojo con la clave: incluye el `t` de los toggles
  Películas/Series de cada riel**, así que cambiar un toggle no es un refetch
  barato — es una clave nueva y un rearmado completo. Es inherente al diseño (el
  toggle reconstruye el Home entero), pero es el segundo consumidor de cuota
  después de la expiración del TTL.
  `HOME_GENRES` y `defaultTypeFor` viven en `components/data.ts` (client-safe),
  no en `lib/home.ts`: importarlos desde el cliente arrastraba el cliente de
  Upstash Redis (70 KB) al bundle del navegador. Los carruseles de audiencia
  ("Para toda la familia", "Animación para adultos") usan su propio tope
  `AUDIENCE_CARDS` (40 tarjetas), no `VISIBLE_CARDS`. "Lo más votados" y
  "Hacete cargo" no se rellenan tras el dedup — su tope lo pone la cantidad de
  votos en la base, no el algoritmo de relleno.
- **El hero ("6 para hoy") arma un universo grande de crudos y enriquece solo lo
  que muestra.** Antes pedía una página de discover por tipo, enriquecía las 40
  (1 request de providers por título) y mostraba 6: pagaba 40 para mostrar 6, y
  esas 40 eran todo el universo. A los 5 clics de "Mostrame otras" ya había dado
  la vuelta, y una semana entera no podía mostrar más de 40 títulos distintos —
  el pool era siempre el mismo y lo único que cambiaba era el barajado.
  Ahora el universo son ~330 crudos (`candidatosDePools`, 3 páginas por
  plataforma y por tipo, cacheados y compartidos entre usuarios) y el enriquecido
  se paga por ventana de 12 sobre el offset que se está mostrando
  (`tandaAncha` en `lib/enrich.ts`). El eje rota por día (`superficie: "hero"`),
  que es la otra mitad de la cobertura: sin eso el universo sería más grande pero
  siempre el mismo. Medido con n,d,m: >40 clics limpios contra 5, y 236 títulos
  distintos por semana contra 40.
  **Hay que ordenar por clave antes de barajar.** `pickDaily` baraja POSICIONES:
  el mismo conjunto llegando en otro orden sale distinto, y el orden de llegada
  es lo más inestable que hay acá (TMDB reordena `popularity.desc` a diario y los
  pools de cada plataforma se unen en el orden en que resuelven). Sin ese sort,
  dos requests del mismo día daban heros distintos y "Otras" se desincronizaba.
  **Tres chips NO usan este camino, a propósito**: `navidad` (curado),
  `reales` (regla `alt`: son dos queries unidas por OR y `categoryCandidates`
  hace una sola — meterla igual devolvería medio chip en silencio) y
  `supervivencia` (`balanceDocs`: la proporción se calcula sobre `genres`, que es
  de `UITitle` y no existe en el crudo). Sirven además de control al medir.
  Interruptor de emergencia: `HERO_ANCHO=0` vuelve al camino viejo.
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
- **El Top (`/top`) es la única sección con dato de consumo real, y solo para
  Netflix.** Sale del TSV público de Netflix (`lib/netflix-top10.ts`), ingestado
  por un cron semanal a la tabla `netflix_top10`, que hace de ranking **y** de
  mapa título→TMDB (el TSV solo trae el título en inglés). Las otras cinco
  plataformas van por popularidad de TMDB y se etiquetan distinto a propósito:
  "Lo más popular ahora" vs "Lo más visto esta semana · dato oficial". No unificar
  ese copy — la distinción es deliberada. Disney+, Prime Video, Max, Apple TV+ y
  Crunchyroll **no publican** su top 10; las únicas fuentes que lo agregan
  (FlixPatrol, JustWatch) son de pago. En el Top no corren ni los filtros de
  audiencia ni el dedup del Home. El toggle Películas/Series es **uno solo
  global** para toda la página, no uno por riel como en el Home: los bloques son
  la misma pregunta repetida por plataforma, y estados independientes rompen la
  lectura de "el top de ahora". El cron escribe con `supabaseAdmin()`
  (service role, bypassa RLS, en `lib/supabase-admin.ts` — aparte de
  `lib/supabase.ts`, que sí llega al bundle del navegador), porque `netflix_top10` solo
  tiene policy de lectura: necesita `SUPABASE_SERVICE_ROLE_KEY` en el entorno de
  Next. Sin esa variable la ingesta no corre y el bloque de Netflix cae a
  popularidad como los otros cinco — la app no se rompe.
- **La ruleta sirve UNA recomendación por vez, nunca una lista.** Es el punto:
  una lista reconstruye la parálisis de elección que la feature resuelve. El pool
  es `roulette_titles` (curado offline, 2259 con texto de los 2401) y lo sirve la
  función `get_roulette_picks`; la app **no la modifica**. Pide 20 candidatos por
  tanda y "Otra" los consume en el cliente: una query por tanda, no por toque.
  **`roulette_titles` NO se puede leer con la anon key** — un select directo
  devuelve 401 `permission denied`. La función es `security definer` y es la
  única vía: el texto editorial es lo más caro de producir del proyecto y no
  tiene por qué bajarse con un `select *`. La función **capa `p_limit` a 40**, y
  lo hace **en silencio**: pedir más no da error, devuelve 40. Hoy se piden 20
  (`TANDA` en `lib/roulette.ts`), así que no aplica — pero si alguien sube ese
  número por encima de 40 no se va a enterar por un error.
  Los nombres de plataforma que guarda `title_availability` **no** son los de
  `lib/providers-ar.ts` (allá "Max" es "HBO Max", y `"VIX "` viene con un espacio
  al final que no hay que corregir): el puente explícito está en
  `lib/roulette-providers.ts` y falla ruidosamente en desarrollo si falta uno.
  Los escenarios son **tres y se definen por duración**, que es un dato de TMDB
  y no una inferencia: `corta` (90 min o menos), `larga` (más de 90) y
  `chicos` (`apto_chicos`); el default es `larga`. Los cuatro anteriores
  (solo/pareja/chicos/fondo) se descartaron porque "ver solo" y "ver en pareja"
  no existen como atributo en los datos y filtraban por lo mismo. **La función
  NO valida el escenario**: un valor viejo cae en su `else true` y devuelve el
  pool sin filtrar, sin error — por eso `esEscenario` gatea la ruta.
  `atencion` (`alta`/`media`/`fondo`) **ya no filtra**, quedó sólo como etiqueta,
  y **nunca se muestra crudo** — se traduce con el banco de frases de
  `components/ruleta/frases.ts`. Ojo que ese `fondo` es un nivel de atención, no
  el escenario eliminado. `advertencia` en la práctica nunca viene NULL (la
  función sólo devuelve títulos que la tengan, porque el bloque "PERO" es el
  diferencial de la tarjeta); el guard que la oculta se mantiene por las dudas. Los tmdb_id ya mostrados viven en
  `localStorage` (`yump:ruleta-mostrados`, por escenario) y se pasan en
  `p_excluir` junto con los "ya la vi": es estado de paginación, no historial —
  sin eso, la semilla diaria compartida devuelve la misma película todo el día.
- **Después de CADA corrida del pipeline offline hay que volver a diffear el
  mapa de plataformas de la ruleta.** El pipeline escribe
  `title_availability.providers` con los nombres que le devuelve TMDB/JustWatch,
  así que una corrida nueva puede traer nombres que `lib/roulette-providers.ts`
  no conoce, y esos títulos desaparecen **en silencio**: no hay error, solo un
  pool más chico. El guard del módulo detecta códigos sin mapear, **no nombres
  nuevos ni mal escritos** — contra eso no hay chequeo automático posible,
  porque la app no conoce la lista de la base. El diff es a mano:

  ```sql
  select distinct unnest(providers) from title_availability where region = 'AR';
  ```

  Cada nombre del resultado tiene que estar o en el mapa, o en la lista de
  exclusiones deliberadas del comentario de ese archivo. **Esa lista de 20
  excluidas es un snapshot del 2026-08-09 y se desactualiza sola**: no la
  trates como la verdad, comparala. Así se cazaron `Crunchyroll` a secas
  (17 títulos, además de su channel de Amazon) y `OnDemandKorea`, los dos
  invisibles mirando sólo el pool con texto.
- **El `provider_id` de TMDB no es confiable a ciegas.** El id `2` de Apple TV+
  era la tienda de alquiler/compra, no el flatrate — TMDB lo devuelve igual bajo
  `flatrate` en AR (misma inconsistencia que Pluto TV, ya descartada). Inflaba
  Apple TV+ de 321 títulos reales a 5389 y le mostraba cine de alquiler al
  usuario como si estuviera incluido en la suscripción; corregido en
  `lib/providers-ar.ts`. Por la misma revisión, **Star+ se sacó** del mapeo: se
  fusionó con Disney+ en 2024 y devuelve 0 títulos en movie y en tv.

## Limitaciones duras de TMDB (no son bugs, no tienen fix)

Estas ya se explicaron y aceptaron; si aparecen de nuevo como "bug", recordar
esto antes de prometer una solución:

- **No hay deep-link nativo por plataforma.** `watch/providers` da un único
  link agregador por título/región, no `netflix.com/title/xxx`. Ese link apunta
  a **TMDB**, no a JustWatch: hoy devuelve
  `themoviedb.org/movie/<id>-<slug>/watch?locale=AR`, una página de TMDB que
  lista los proveedores. Lo usan el botón "Ver en…" de la ficha y el "Verla" de
  la ruleta, los dos con el mismo campo — es lo máximo disponible.
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
  top/                                         — top 10 por plataforma (Netflix real + popularidad)
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
  TopView.tsx             — la sección `/top`: bloques por plataforma, un solo
                             fetch a `/api/top` (ver `lib/top.ts`)
  ruleta/                  — RuletaBanner.tsx (acordeón de 4 situaciones +
                             estado, montado en el Home) y RuletaCard.tsx (la
                             tarjeta: Verla/Otra/Ya la vi). Ver nota de
                             arquitectura arriba sobre la ruleta
  PlatformsContext.tsx    — "mis plataformas" en localStorage
  TopBar.tsx / BottomNav.tsx / Filters.tsx / PlatformLogo.tsx
  useApi.ts               — hook de fetch compartido: expone `offline` (fallo de
                             red) y `error` (fallo HTTP) por separado, y una opción
                             `keepPrevious` (la usan `CatalogView` y `TopView`,
                             para no vaciar la pantalla mientras llega un
                             refetch por toggle)
  data.ts                  — client-safe: `HOME_GENRES` y `defaultTypeFor` (absorbió
                             al viejo `SHELVES`). Lo importan tanto `CatalogView`
                             (cliente) como `lib/home.ts` (server) — ver nota de
                             arquitectura abajo sobre por qué no viven en `lib/home.ts`

lib/
  tmdb.ts        — cliente TMDB crudo (fetch + tipos raw)
  enrich.ts        — TODO EL MERGE: raw TMDB → shape UI, combina con Supabase/cache.
                      Punto de entrada para casi cualquier feature nueva de datos.
  home.ts           — Home Composer: arma el Home entero (hero + rieles) en un
                       solo pipeline server-side, deduplicado. Ver nota de
                       arquitectura abajo.
  netflix-top10.ts   — ingesta del TSV oficial de Netflix y resolución
                       título→TMDB contra `netflix_top10`. Ver nota de
                       arquitectura abajo sobre el Top.
  top.ts            — Top Composer: arma los bloques de `/top` (Netflix real +
                       popularidad TMDB de las otras cinco), sin dedup ni
                       filtros de audiencia.
  roulette.ts        — llama a `get_roulette_picks`, enriquece con TMDB
                       (`cardsByIds`, clave `type:id`) y arma el deep link.
                       Ver nota de arquitectura arriba sobre la ruleta.
  roulette-providers.ts — puente entre `lib/providers-ar.ts` y los nombres de
                       plataforma que guarda `title_availability`. Falla
                       ruidosamente en desarrollo si falta un código.
  providers-ar.ts   — mapeo plataforma↔id TMDB para Argentina (revisar si una
                      plataforma nueva no aparece — puede que falte su provider_id)
  categories.ts      — géneros UI ↔ géneros/keywords TMDB (movie vs tv)
  cache.ts            — wrapper Redis/memoria + el motor determinístico del indeciso
  supabase.ts          — clientes browser/server
  reviews.ts            — acceso a editorial_reviews
  types.ts               — shape estable que consume toda la UI (UITitle, UITitleDetail, UIPerson)

supabase/schema.sql   — editorial_reviews (construido pero EN STANDBY, tabla vacía
                        a propósito — ver el encabezado) + votes/user_reviews
```

## Rutas API (todas `force-dynamic`, sin caché de Next)

| Ruta | Qué hace |
|---|---|
| `GET /api/home` | arma el Home entero (hero + rieles) deduplicado, vía `lib/home.ts`. `maxDuration = 60` |
| `GET /api/top` | top 10 por plataforma (Netflix real + popularidad), vía `lib/top.ts`. `maxDuration = 60` |
| `GET /api/cron/netflix-top10` | ingesta semanal del TSV oficial de Netflix (Vercel Cron, martes). `maxDuration = 60`, protegida con `CRON_SECRET` |
| `GET /api/ruleta` | una tanda de 20 candidatos del pool curado (`roulette_titles`), vía `lib/roulette.ts`. `maxDuration = 60` |
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
| `GET /api/title/[tipo]/[id]` | ficha completa (TMDB+Supabase+relacionados) |
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
- Ficha: hero alto con backdrop, puntaje propio + TMDB + editorial (IMDb y
  Metacritic se sacaron con OMDB), badge y sección de reseña editorial, música,
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
cp .env.local.example .env.local   # completar TMDB_READ_TOKEN + Supabase; Upstash opcional
npm install
npm run dev
```

Antes de dar por bueno un cambio: `npx tsc --noEmit` y, si el cambio toca algo
grande, `npx next build` (puede fallar solo por fuentes de Google si no hay
red — no es indicativo de error real en ese caso).

## Convenciones a mantener

- Todo el texto de la UI en español rioplatense.
- **Toda fecha se calcula en hora argentina, nunca en UTC.** El "día" de esta
  app es el día argentino. `new Date().toISOString().slice(0,10)` está prohibido
  para decidir qué día es hoy: devuelve la fecha UTC y a partir de las 21:00
  locales ya cuenta como mañana. La forma correcta es
  `toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })`,
  que devuelve `YYYY-MM-DD` ya local (ver `dailySeed()` en `lib/cache.ts`).
  Esto no es un detalle: **todos los bugs de fecha de este proyecto caen entre
  las 21 h y la medianoche**, que es exactamente la franja en la que la gente
  abre la app para elegir qué ver. La excepción son los formatos que un estándar
  externo exige en UTC, como el `DTSTAMP` de un `.ics`.
  Para **medir** algo que rota por día: `YUMP_FECHA=2026-08-15` clava `hoyAR()` y
  con eso toda la rotación (solo fuera de producción, y solo cuando nadie pasó
  una fecha explícita). No clava el catálogo de TMDB, que se reordena solo — ver
  `docs/MANTENIMIENTO.md` 8.c antes de leer un diff contra una foto vieja.
- Sin CSS-in-JS ni styled-components: todo en `app/globals.css`, clases planas
  reusando las que ya existen antes de inventar una nueva.
- `lib/enrich.ts` es el único lugar que debería tocar Supabase/TMDB juntos.
  Las rutas API son finas: parsean query params y llaman una función de `enrich.ts`.
- Tipos de UI (`UITitle`, `UITitleDetail`, `UIPerson`) son el contrato estable
  que consume toda la capa de componentes — si agregás un campo nuevo del lado
  de datos, agregalo ahí primero.
