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
- **TMDB** — fuente del catálogo: metadata, providers por región,
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
  `home:<huella de idioma>:v5:<semilla>:<plataformas ordenadas>:<tipos>`, TTL 6 h — el número lo
  manda la cuota de Upstash, ver el comentario de `TTL.home`). La versión de la
  clave se sube cuando cambia el **contenido** del payload, no su forma: si no,
  lo ya cacheado se sigue sirviendo hasta que expire el TTL y el cambio "no se
  ve" después de deployar (`v2` = ventana de votos de 7 a 90 días; `v3` = el
  riel "Hacete cargo" pasó a llamarse "No gustaron"; `v4` = entró el riel
  "Miniseries para ansiosos"; `v5` = ese riel sumó su "Ver todas").
  **Los títulos de los
  rieles viajan adentro del payload**, así que hasta cambiar un texto de la
  interfaz obliga a subir la versión. Los `cached()`
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
  "No gustaron" no se rellenan tras el dedup — su tope lo pone la cantidad de
  votos en la base, no el algoritmo de relleno.
- **El idioma de los títulos sale de una variable, y la configuración va DENTRO
  de la clave de cache** (`lib/idioma.ts` → `HUELLA_IDIOMA`, `lib/claves.ts`).
  `IDIOMA_TITULOS` decide el idioma base (default `es-ES`) y `FALLBACK_IDIOMA`
  decide si lo que TMDB no traduce se repara pidiendo el respaldo en `es-ES`.
  Las **once** familias de claves localizadas llevan la huella
  (`card:es-MX+f.r1:movie:278`), y eso es lo que hace que un rollback revierta de
  verdad: sin la huella, volver a `es-ES` seguiría leyendo títulos mexicanos de
  las mismas claves hasta que expiraran TTLs de hasta 30 h. **El precio es que
  cada cambio de configuración cuesta un arranque frío**, ida y vuelta.
  Medido con las dos variantes alternadas en la misma ventana: `es-ES` →
  `es-MX` con fallback son **+38 llamadas a TMDB (+6,2%)**, entre **+0 y +2**
  comandos de Upstash (la reparación se guarda bajo la MISMA clave) y **+337 B**
  de payload. Las 38-39 llamadas de respaldo son **37 páginas de `discover` + 2
  detalles de ficha**, no 39 páginas. Aislado contra su propio control
  (`FALLBACK_IDIOMA=0`), el fallback cuesta **+440 ms** en un Home frío. **Lo que NO se repara es el pasaje al inglés**: los 38
  títulos donde `es-MX` devuelve "Monsters, Inc.", "Moana 2" o "Game of Thrones"
  son los nombres publicados en Argentina, y hay tests que lo fijan.
  **TMDB ordena `discover` por idioma**: mismo query, mismos ids, otro orden (18
  de 20 en la misma posición en la página 1). El efecto sobre el Home es chico y
  está medido: en la misma ventana, **11 de 12 rieles traen los mismos títulos en
  el mismo orden** y el hero es idéntico; el único que se mueve es "Últimos
  lanzamientos" (un título de 20), que ordena por fecha y sin piso de votos.
  **La trampa de medición es otra y es más grande: el catálogo de TMDB deriva
  solo.** Comparar una corrida de hoy contra una foto de hace una hora atribuye
  al cambio lo que era deriva — pasó, y se publicó una conclusión equivocada
  sobre las cantidades por riel. Las dos variantes se miden **alternadas en la
  misma ventana**, y el control es correr la misma variante dos veces: si el
  composer es determinístico, da 0 diferencias.
  `searchDeTipo` está clavado en `es-MX` y `searchTitles` en `en-US` (matchea el
  TSV de Netflix): ninguno de los dos sigue al idioma base.
- **"Miniseries para ansiosos"** (`lib/miniseries.ts` + el cableado en
  `lib/home.ts`) va debajo de "Documental" y arriba de los dos de audiencia; esa
  posición ES su prioridad de dedup. Solo `tv` y sin toggle. La condición es
  `with_type=2` de TMDB, que es *exactamente* el flag de miniserie (verificado:
  317 de 317 con `type: "Miniseries"`, 311 con una sola temporada).
  `with_status=3` significa **"marcada finalizada por TMDB"** y nada más — no
  garantiza historia cerrada ni una temporada: 5 de las 6 series de más de una
  temporada del pool lo pasan, porque filtra por el campo `status`. **Piso de 15
  para mostrarse**: debajo de eso el riel se oculta entero y *no* se rellena con
  series comunes (se aplica en el server, así que un riel corto ni viaja en el
  payload; con una plataforma chica sola —MUBI, ViX— desaparece, que es lo
  buscado). Excluye documental (99) por decisión de producto —en el eje `nuevo`
  el pool llegaba a 41% de documentales y quedaba pegado abajo de "Documental"—
  y hereda animación/infantil de la regla de audiencia con su excepción de
  Crunchyroll. **Su piso de votos está declarado, no heredado del eje**
  (`MINISERIES_PISO_VOTOS`, tipo `Record<Eje, number>` para que sumar un eje no
  compile hasta decidirlo): 0 en cuatro y 10 en `top`. El 0 es por país de
  origen, no por cantidad — con el piso de los ejes entran 23 títulos de LatAm
  (7 argentinos) y con 0 entran 34 (12), sumando Okupas, Santa Evita, El lobista
  y Nafta Súper; el 10 de `top` es porque ahí el `sort_by` **es** la nota y sin
  piso de votos encabeza un 10.0 con un voto. **No es un piso de nota** — no hay
  ninguno. Kill switch `RIEL_MINISERIES=0`. Medidas en
  `docs/medidas/2026-08-21-miniseries-*.json`.
- **`/lista/miniseries` ("Ver todas") pagina con UNA consulta combinada, no con
  la unión de pools.** El enlace viaja en el mismo objeto del riel, así que
  aparece solo cuando el riel aparece. La unión de pools por plataforma sirve
  para el Home —comparte cache y le alcanza una ventana fija— pero **no se puede
  paginar**: la lista ordenada se reconstruye y crece con cada página, y un
  título de una página profunda puede correr el borde entre dos páginas dejando
  fuera lo que queda del otro lado. Un dedup en el cliente tapa el duplicado y
  no recupera lo salteado. `candidatosCombinados` (lib/pools.ts) pide
  `with_watch_providers=a|b|c` y usa la paginación de TMDB, así que el orden se
  fija una vez: cada página es un tramo de un ranking que no se mueve, y
  `hayMas` sale de `total_pages` en vez de deducirse. Verificado barriendo las
  32 páginas de n,d,m: 627 servidos, 627 únicos, 627 declarados por TMDB — el
  catálogo entero sin repetir ni faltar uno. **La estabilidad llega hasta donde
  llega TMDB**: si recalculan el ranking entre dos pedidos las páginas se pueden
  mover, que es la limitación normal de paginar una API ajena; lo que se elimina
  es la causa que estaba de nuestro lado. El dedup del cliente se conserva como
  defensa. Cuesta 1 discover + 20
  `providersOf` por página, constante. La lista **no rota por ejes** (es
  exploración, tiene que ser estable) y **no deduplica contra el Home** (muestra
  el catálogo completo, riel incluido).
- **Volver de una ficha devuelve LA VISTA, no solo la ruta.** El mecanismo vive
  en `hooks/lista-paginada-store.ts` (el almacén y la marca de vuelta) con dos
  hooks encima: `useListaPaginada` para lo paginado y `useEstadoSimple` para lo
  que trae todo de una. **Un solo `popstate` en toda la app**, registrado al
  importar el STORE — estuvo en el hook y era un bug latente: `/categoria` no
  importa ese hook, así que ahí el listener nunca se registraba y la
  restauración fallaba en silencio.

  **Tres cosas distintas que se pierden por separado**, y una vista no está
  cubierta porque persista una sola: filtros/toggle, scroll vertical de la
  página y scroll horizontal de los carruseles (ese último es `useTrackScroll`,
  aparte).

  | Superficie | Qué restaura |
  |---|---|
  | `/lista/miniseries`, `/lista/ultimos` | items, página, scroll (paginado) |
  | `/buscar` | texto, pestaña, país, filtros, páginas cargadas, scroll |
  | `/directores` | lista, texto del filtro, cuántos visibles, scroll |
  | `/categoria/[slug]` | tipo y scroll |
  | `/lista/[key]` simples | items y scroll |
  | `/proximamente` | filtro, items y scroll |
  | `/top` | payload, scroll vertical y horizontal de cada carrusel |
  | `/cuenta/*` | scroll horizontal de cada riel |

  **Fuera a propósito**: Home y `/persona` **no se tocaron** — se auditaron y no
  reprodujeron la falla, aunque comparten la carrera (contenido asíncrono +
  restauración nativa del navegador). Si alguna vez aparece, es esto.

  **Qué guarda**: `sessionStorage`, clave `yump:lista-paginada`, una entrada por
  vista. **Una sola entrada por ruta, NO una por modo**: en `/buscar`, cambiar
  de pestaña pisa el snapshot. Con claves por modo quedaba memoria paralela de
  Películas, Series y Actores, que es historial por pestaña y no "volver a lo
  que dejaste". Medido: 71 KB con siete vistas guardadas a la vez, contra un
  tope de ~5 MB.

  **Qué lo invalida**: la `firma` (las plataformas; el tipo en "Últimos
  lanzamientos"). Lo que se RESTAURA nunca va en la firma — va en `extra`. Y en
  las vistas que gatean el fetch con la decisión (`/top`, `/lista/[key]`) hay
  que soltar el snapshot cuando cambia el contexto (`snapshotVigente`): mientras
  siga presente, la URL de `useApi` queda vacía y la vista se congela mostrando
  el contenido viejo sin pedir nada.

  **Restaura SOLO con atrás/adelante.** Entrar por un link empieza arriba y
  borra lo guardado. **La marca vence a los 8 s** y esa ventana es la limitación
  conocida: cualquier vuelta atrás la dispara, también las que no van a una
  vista con restauración, así que una marca huérfana se vence sola en vez de
  disparar una restauración a destiempo. Con red muy lenta, una transición que
  tarde más de 8 s pierde la restauración.

  **`/buscar` reparte la vuelta con un TICKET** (`hooks/ticket-vuelta.ts`): el
  modo y el texto viven en el padre y los items en los hijos, y `consumirVuelta`
  borra la marca al leerla. La consume el padre y la reparte a nombre del modo
  restaurado; **lo cierra el hijo** cuando avisa que leyó o descartó su
  snapshot, no un timeout ni un contador de renders. **Con texto de búsqueda no
  se emite ticket**: ahí los resultados los pinta el padre y no monta ningún
  hijo, así que el ticket quedaba abierto y bastaba con borrar el texto para que
  el hijo que montara reclamara una vuelta vieja.

  **`/categoria` restaura cuando se asentaron TODOS los rieles**
  (`hooks/categoria-generaciones.ts`), no cuando termina el primero: cada riel
  pendiente sigue moviendo la altura. Un riel vacío o con error también cuenta
  como terminado. Al cambiar de tipo arranca una generación nueva y los avisos
  de la anterior se descartan por número. **El tipo se restaura del snapshot, no
  de la URL**: al volver atrás Next no re-ejecuta el componente de servidor,
  sirve el RSC cacheado, así que la barra decía `?tipo=tv` y la vista se
  rendereaba en Películas igual. El `?tipo=` con `replaceState` sigue valiendo
  para compartir la URL y para una entrada nueva.
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
- **Los rieles de género rotan el eje por día** (`superficie: "riel"`), igual que
  audiencia y el hero. Era la última superficie que pedía siempre popularidad
  páginas 1-3 — la más grande del Home y la que menos variedad daba. Kill switch:
  `EJES_RIELES=0`.
  **Lo que decide acá es `FETCH_BUFFER`, no `MAX_VUELTAS`.** Medido en un día de
  `hondo` con el tope en 1, 2, 4, 6 y 8: resultado idéntico en los cinco. Cada
  riel llena sus 20 tarjetas en UNA vuelta, pagando 28 enriquecidos, porque pide
  3 páginas de entrada (~130-180 candidatos). Audiencia pide UNA página por
  vuelta, y por eso ahí el tope sí ata. El desglose sale en el log
  `[home] VUELTAS`.
  **La página extra de fallback reusa el eje ya resuelto** (`ejeFijo`): tiene que
  ser la página siguiente de la MISMA receta. Con `hondo`, que arranca en la 4,
  la ventana ya trajo 4-6 y la extra es la 7 — pedir la 4 fija le habría dado lo
  que ya tenía, y justo al riel más profundo, que es el único que la necesita.
- **Un eje que no puede llenar no se usa** (`candidatosConEje` en `lib/pools.ts`).
  Los cinco ejes se calibraron contra superficies grandes, donde siempre hay
  material. En una angosta no: "Contacto extraterrestre" tiene 19 títulos en
  Netflix, 37 en Disney+ y 20 en Max, así que el día que le tocaba `hondo` —que
  arranca en la página 4— los tres pools volvían vacíos y el chip no mostraba
  nada. **No era un caso especial de ese chip**: medido con n,d,m, `aliens`,
  `espacio` y `guerra` mueren enteros en `hondo`, y en otras seis superficies se
  muere el lado de series (terror/tv tiene 4 títulos en Max). Ahora se mira la
  cosecha y, si no llega a `PISO_EJE`, se cae a `pop` páginas 1-3.
  **Se verifica contra lo que volvió y no con una cuenta previa** a propósito:
  `total_results` solo atraparía a `hondo`, mientras que mirar la cosecha atrapa
  también el piso de votos de `top`, una keyword que no matchea y una plataforma
  sin catálogo en el tema. Cuesta un fetch extra solo en la superficie degradada.
  En los logs el eje degradado sale con asterisco (`pop*`), para distinguirlo del
  día que sacó `pop` por sorteo. Lo que esto **no** arregla: los chips angostos
  caen a `pop` uno de cada seis días, así que casi no reciben rotación — la
  cobertura de 236 títulos vale para el hero base, no para ellos (**issue #10**).
- **Una lista vacía no siempre es culpa del usuario** (`MotivoVacio` en
  `lib/types.ts`). "Nada en tus plataformas, activá alguna" solo se muestra si el
  filtro de plataformas fue lo que vació la lista. Si volvió vacía **antes** de
  filtrar (`sin-catalogo`), el problema es nuestro y pedirle que active algo lo
  manda a buscar un botón que no arregla nada. `recommendations()` devuelve
  `{ items, motivo }` justamente para poder distinguirlos.
- **El puntaje de TMDB NO se usa nunca como filtro de exclusión, solo como
  medición.** Lo que busca esta app es variedad, y `vote_average` está sesgado
  por popularidad e idioma: hay cine de 5 que tiene que estar. Auditado el
  2026-08-16, **en la app viva no hay ningún piso de nota** — `vote_average`
  solo ORDENA (en el eje `top`). Los dos pisos de nota que existen
  (`MIN_NOTA` 6.2 en el pipeline de la ruleta, 6.0 en el de shorts) son del
  pipeline **offline**, que es curado por definición.
  Esto vale sobre todo para la **personalización** que viene: personalizar va a
  ser reordenar y esconder lo ya visto, **nunca imponer pisos de calidad**. A
  quien le gusta el drama hay que darle drama, aunque las notas del género sean
  bajas.
  Los pisos que sí filtran son de **cantidad de votos**, y conviene tenerlos a
  la vista: `discover()` trae **60 por defecto** (`lib/tmdb.ts`) y ese es el
  único que nadie decidió por superficie — excluye cine regional en todas, y es
  el gemelo del **issue #9**. Los demás son explícitos y medidos: 300 en el eje
  `top` y en `genreCovers()`, 10 en el eje `nuevo`, 60 en `lib/top.ts`, y **0**
  en `latestReleases`.
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
  lectura de "el top de ahora".
  **En el bloque oficial, la plataforma la garantiza la FUENTE, no TMDB**
  (`lib/top-plataformas.ts`). Esos veinte títulos los publicó Netflix como lo
  más visto EN Netflix Argentina, así que "está en Netflix" es un dato, no una
  deducción — y es mejor dato que `watch/providers`, que llega tarde en los
  estrenos. Sin eso, "Moria" entró **#1 del top oficial pintada en gris y con
  "No está en tus plataformas"** (`tv/322428`, semana 2026-08-16: estrenó el
  14/08 y TMDB no tenía proveedores en NINGUNA región). Es el caso que la
  **regla 2** de `resolveTitle` ya contemplaba —título exacto que TMDB todavía
  no ubica en Netflix— y que nadie había bajado a la card. **Solo se aplica
  cuando no sabemos NADA**: si TMDB conoce el título y lo ubica en otras
  plataformas, no hay lag que explicar, lo más probable es que la resolución
  del TSV haya agarrado un homónimo, y ahí agregar Netflix convertiría un error
  de matcheo en una afirmación falsa bajo el sello "dato oficial".
  **La FICHA usa la misma evidencia** (`plataformasDeFicha` +
  `disponiblesEnTopOficial`). Era una limitación declarada y estaba mal: `Moria`
  decía **"No está en streaming"** siendo el #1 del top oficial, y esperar a
  TMDB no era una salida — su web ya muestra el canal y el homepage de Netflix
  mientras `/tv/322428/watch/providers` sigue devolviendo `results: {}`. Si
  `providersOf` viene **vacío**, se mira si ese `tipo:id` aparece en el top con
  `tmdb_id` resuelto y **`needs_review = false`**. Esa segunda condición es más
  estricta que en la card a propósito: `needs_review` marca las filas que pueden
  apuntar a un homónimo, y en el top el peor caso es una card de más, mientras
  que la ficha dice "Disponible en Netflix".
  **Mira TODAS las semanas de la ventana de 14 días, no la última**, y eso no es
  un detalle: atada a la semana más nueva, la evidencia se evaporaba sola con el
  cron siguiente —el título salía del top, la ficha volvía a "No está en
  streaming" y no había cambiado nada ni en TMDB ni acá—. Era una regresión
  programada. Por lo mismo, una fila nueva con `needs_review = true` **no**
  invalida una anterior confiable del mismo `tipo:id`: la evidencia se acumula
  en un conjunto, no se resuelve por "la última gana".
  Tres cosas que NO se hacen: inventar `watchLink` (sale de TMDB; si no lo hay,
  no hay a dónde mandar a nadie), usar `networks` **solo** como disponibilidad
  (que sea "de Netflix" no dice que se vea en Netflix Argentina) y tocar el
  array cacheado de `providersOf`.
  ⚠️ **Esa regla del medio cambió y conviene leerla bien.** Antes decía
  "`networks` no se usa nunca". Ahora dice **"`networks` nunca se usa SOLA"**:
  en SERIES, acompañada de un enlace oficial de la misma plataforma a ese título
  concreto y sin contradicción fuerte, sí sirve. **En PELÍCULAS sigue sin usarse
  nunca** — TMDB no lo publica para películas, y ahí decide sólo el enlace. Ver
  "Disponibilidad" abajo.
  **UNA consulta por MISS**, filtrada por fecha: el corte sale del reloj, no de
  una consulta previa que pregunte cuál es la última semana. La primera versión
  hacía esas dos y por eso el techo real era 24 lecturas por hora, no 12.
  Medido: tres fichas con proveedores de TMDB cuestan **0** consultas, y cinco
  visitas seguidas a una ficha sin proveedores más una sexta ficha vacía
  distinta cuestan **1** (clave fija, la comparten todas). Con el TTL de 5 min,
  el techo es **12 consultas por hora**, haya el tráfico que haya.
  **La resolución título→TMDB vive en `lib/netflix-resolver.ts`**, sin
  `server-only` para poder probarla sin red; `netflix-top10.ts` sólo le enchufa
  las dos puertas (`buscar`, `enNetflixAR`). Las tres reglas de siempre no
  cambiaron y hay un **cuarto paso**: si ninguna aceptó y el título trae
  subtítulo, se repite la búsqueda con la parte anterior a los dos puntos.
  Nació de "Operation Safed Sagar: The Highest Air Force Mission", donde TMDB
  devuelve **cero** resultados para el título completo y uno solo para
  "Operation Safed Sagar" (`tv/284753`, con Netflix en AR y otro subtítulo).
  **Ese paso es más desconfiado que los otros tres, y tiene que serlo**: exige
  que TMDB devuelva **un único** resultado —ése es el criterio de "coincidencia
  dudosa", y reemplaza cualquier cuenta de palabras: "Monster: The Ed Gein
  Story" reduce a "Monster" y entre varios "Monster" alguno va a estar en
  Netflix AR—, mira **primero el proveedor y después el título** (al revés que
  la consulta completa, porque acá el título se compara contra un prefijo) y
  marca **todo** con `needs_review`. Exige dos puntos **seguidos de espacio**:
  de 1969 títulos del TSV argentino, 209 tienen `:` y el único sin espacio es
  "3:10 to Yuma", donde reducir a "3" sería la peor consulta posible. Una caída
  de la búsqueda completa aborta **sin** intentar la reducida: un error no es
  "no encontré", es "no sé".
  El cron escribe con `supabaseAdmin()`
  (service role, bypassa RLS, en `lib/supabase-admin.ts` — aparte de
  `lib/supabase.ts`, que sí llega al bundle del navegador), porque `netflix_top10` solo
  tiene policy de lectura: necesita `SUPABASE_SERVICE_ROLE_KEY` en el entorno de
  Next. Sin esa variable la ingesta no corre y el bloque de Netflix cae a
  popularidad como los otros cinco — la app no se rompe.
- **La disponibilidad se resuelve en UN solo lugar** (`lib/disponibilidad.ts` →
  `resolverDisponibilidad`, con el adaptador `disponibilidadDe` en `enrich.ts`).
  Ficha, cards, búsqueda, relacionados, listas y Home pasan todos por ahí.
  **Antes cada superficie decidía sola**, y por eso el arreglo de Moria quedó
  atado a la ficha mientras las cards del mismo título seguían en gris. Un
  barrido (`lib/disponibilidad-barrido.test.ts`) falla si una superficie nueva
  lee `watchProviders` y se saltea el resolvedor.
  **Prioridad de evidencia**, y sólo se AGREGA cuando TMDB no sabe nada:
  1. `watch/providers` de TMDB para AR, `flatrate` → `tmdb-ar`.
  2. Top oficial reciente de Netflix → `top-oficial` (reglas de ventana y
     `needs_review` intactas).
  3. **Evidencia oficial de alta probabilidad** → `oficial-probable`.
     Seis plataformas en series, cuatro en películas.
  4. Registro manual versionado (`lib/excepciones-disponibilidad.ts`, hoy
     **vacío**) → `manual`.
  🔴 **Los respaldos nunca contradicen a TMDB.** Si TMDB ubica el título en otra
  plataforma, el dato en conflicto es el nuestro. Y **un fallo nunca es una
  ausencia**: si Supabase o TMDB se caen se devuelve lo de TMDB y **no se
  cachea** (`fallo` viaja hasta `cachedIf`).
- **Un fallo de disponibilidad NO se congela en las cachés de afuera**
  (`lib/fallos-disponibilidad.ts`). `disponibilidadDe` no guardaba su `disp:`
  cuando la evidencia fallaba, pero devolvía sólo el array de plataformas y la
  señal moría ahí: **más afuera sí se guardaba**, así que una caída de dos
  segundos dejaba títulos en gris por un día. La señal viaja por **contexto
  async**, como `withCacheMetrics`: si se pasara por parámetro habría que
  enhebrarla por `toUITitle` → `enrichRaw` → `listByCategory` → cada llamador, y
  alcanzaría con que uno se la olvidara. Se responde con lo que hay, no se
  guarda, y el pedido siguiente reintenta.
  🔴 **EL CONTEXTO ANIDA, y esa fue la segunda mitad del bug.** La primera
  versión creaba un contador por llamada y `registrar` tocaba sólo el más
  interno: en la composición real —`homePayload` envuelve, y adentro la card y
  los tramos de la lista vuelven a envolver— el hijo no guardaba su caché pero
  **el padre no se enteraba y el Home se guardaba igual**. Ahora cada contador
  conoce a su padre y le suma al salir, en `finally`: se cuenta una sola vez por
  nivel, un hijo que lanza igual propaga, y la excepción no se toca.
  **Siete superficies lo abren** —card, Home, búsqueda, Top por popularidad,
  riel de recomendaciones y los dos tramos de "Últimos"—; el inventario completo
  de qué caché necesita el contexto y cuál no (con el motivo escrito) lo fija
  `lib/cache-disponibilidad-inventario.test.ts`, que falla si aparece un
  `cachedLoc` sin clasificar.
- **"TMDB no sabe nada" y "TMDB sabe algo que no mapeamos" NO son lo mismo**
  (`hayFlatrateAR`). `providersOf` descarta los `provider_id` argentinos que no
  están en `providers-ar.ts`, así que un título que TMDB ubica en una plataforma
  no soportada llegaba con `codes` vacío — indistinguible del caso que los
  respaldos cubren, y la regla de enlace podía inferir Disney+ **contradiciendo a
  TMDB**. Con la señal, el resultado visible sigue vacío (no hay código que
  mostrar) pero **ningún respaldo se consulta ni se aplica**.
- **El selector de un riel no existe hasta que entra en `TOGGLE_KEYS`**
  (`hooks/home-types-nucleo.ts`). El riel puede declarar `typeToggle` en el
  composer y el botón puede cambiar en pantalla: si la clave no está en la lista
  del hook, el `t` que viaja a `/api/home` no cambia y el Home nunca se rearma.
  Pasó con `ultimos`. El inventario, los defaults y la serialización viven en un
  módulo **puro** justamente para poder probar el parámetro, que es lo único que
  decide si hay refetch. El default de `ultimos` está **declarado** (`movie`), no
  heredado de `defaultTypeFor`, que alterna por posición de género.
- **El problema que resuelve: el catálogo regional de TMDB está incompleto.**
  Medido el 2026-08-30 sobre las series de la red Disney+ estrenadas en 60 días:
  **15 candidatos, 4 con proveedor AR y 11 sin ninguno**. El caso testigo es
  `tv:275224` (Gutiérrez Is mai neim), #1 de Disney+ en JustWatch AR, del que
  TMDB sólo conoce ID, MY y US. **No es cache.** El arreglo de Moria fue
  correcto pero no general: dependía del top oficial de Netflix, que sólo existe
  para Netflix. Informe: `docs/medidas/2026-08-30-disponibilidad-informe.md`.
- **La evidencia oficial cubre SEIS plataformas en series y CUATRO en
  películas** (`lib/enlace-oficial.ts` → `ADAPTADORES_OFICIALES`).

  | | Netflix | Disney+ | Prime | Max | Paramount+ | Apple TV+ |
  |---|:--:|:--:|:--:|:--:|:--:|:--:|
  | Series | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
  | Películas | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |

  **Las series exigen red + enlace** de la misma plataforma. **Las películas
  deciden sólo por el enlace**: TMDB no publica `networks` para películas, y si
  algo lo poblara tampoco se usaría — hay un test que lo fija. Max y Paramount+
  no se infieren para películas porque midieron **0 de 30** con dominio oficial:
  habilitarlas sería aparentar una cobertura que no existe.

  🔴 **EL CRITERIO ES COBERTURA, no certeza.** Decisión del dueño: es preferible
  mostrar de vez en cuando un título que no esté, antes que ocultar muchos que sí
  están. Por eso la regla admite un riesgo pequeño y sólo rechaza contradicciones
  fuertes. Medida contra verdad de campo —tapando el dato de AR de títulos que sí
  lo tienen— dio **144 aciertos en series y 22 en películas, con CERO falsos
  positivos**. Ver `docs/medidas/2026-08-31-medicion-regla-final.md`.

  **`networks` nunca se usa sola y `homepage` tampoco** (en series). El host se
  compara completo, nunca con `includes`: `netflix.com.evil.ru` y
  `netflix-ar.com` contienen la cadena y no son el dominio.

  ⚠️ **`hbo.com` vale para Max, y es evidencia PROBABLE, no estructural.** El
  argumento de que es "el canal, no el servicio" era razonable y los datos lo
  desmintieron: 43 casos medidos, 35 en Max AR, 0 en otra plataforma. Si HBO
  licenciara una serie a otra plataforma en AR, esta regla se equivocaría.

  ⚠️ **`amazon.com/dp/` queda afuera**: es la tienda, no el servicio — un ASIN
  puede ser un alquiler, una compra o un DVD. Cuesta 12 series de la muestra.

  ⚠️ **Se acepta CUALQUIER locale** en una URL de título. Rechazar los
  extranjeros costaba 4 series y el 100% de la señal de películas, y evitaba 0
  falsos positivos: el locale identifica la tienda que generó el enlace, no dónde
  está disponible. Quitar el prefijo **no** afloja la ruta: `/br/browse` sigue
  siendo una portada.

  ⚠️ **No hay tope de regiones.** Se propuso uno (≤3) y habría aceptado CERO
  títulos sin evitar un solo error.

  ⚠️ Los `idsGlobales` **no son** los `tmdbIds` de `providers-ar.ts` y no hay que
  unificarlos: allá definen qué considera cada plataforma el discover argentino.
- **Cada ruta oficial VALIDA Y EXTRAE a la vez: el grupo 1 es el identificador.**
  De ahí sale `identidadOficial()`, que devuelve `"<plataforma>:<id de la
  plataforma>"`. Tenerlas separadas dejaría que la identidad y la regla
  divergieran; un test falla si alguna ruta pierde su grupo de captura.
  **`netflix.com/browse?jbv=<n>` cuenta como ruta de título** (`porQuery`), y es
  la única excepción por query que hay. `/browse` pelado se sigue rechazando —
  es una portada—, y el parámetro exige ruta exacta, un único valor y forma
  numérica: `?jbv=1&jbv=2` es ambiguo y se rechaza. Medido: de 80 series de
  Netflix con `homepage`, 71 usan `/title/<n>` y **1** usa `?jbv=`. El `n` es el
  mismo número en las dos formas, y eso es lo que hace que se puedan deduplicar
  entre sí.
- **La búsqueda deduplica por identidad oficial, NUNCA por parecido**
  (`dedupePorIdentidad`, cableado en `search()`). TMDB a veces carga el mismo
  programa **dos veces, una como serie y otra como película**, y salían dos
  cards del mismo título — una en color y otra en gris. El caso medido son dos
  entradas con el mismo id de Netflix (`/title/<n>` en una, `?jbv=<n>` en la
  otra).
  🔴 **No se compara título, fecha, productora, sinopsis ni similitud textual.**
  Esas señales esconden obras legítimamente distintas: secuelas, remakes,
  documentales homónimos. Se compara el identificador que publica la
  plataforma, que es un dato comprobable. **Lo que no tiene identidad oficial no
  se toca.** Gana el primero, que no es un criterio nuevo: la lista ya viene
  ordenada por relevancia. Medido sobre 540 títulos de las seis plataformas:
  366 con identidad y **0 colisiones**, o sea que no junta nada que no sea el
  mismo título.
  **No paga ninguna llamada cuando TMDB ya informa proveedores argentinos**: se
  corta antes de tocar el detalle. Para el resto reusa `pv3:` y `oficial:`, que
  el camino de disponibilidad ya pidió.
  Se hace **sólo en la búsqueda**, que es donde el usuario ve las dos entradas
  una al lado de la otra; el dedup del Home es otro y es por `tipo:id`.
  ⚠️ **`homepage` es un campo LOCALIZADO de TMDB** y la clave `oficial:` está en
  `CLAVES_SIN_HUELLA`. Medido: 1 de 240 series cambia de `homepage` entre `es-ES`
  y `es-MX` (0,4%), y el caso de Moria es justamente uno — en `es-MX` viene
  vacío. Con el idioma actual (`es-ES`) la evidencia existe; **si algún día se
  cambia `IDIOMA_TITULOS`, esa clave hay que pasarla a las familias con huella**,
  o durante 8 h se sirve el `homepage` del idioma anterior. Sin decidir.
- **Corregir la ficha no alcanzaba: el `discover` por proveedor nunca devuelve
  el título.** Medido: 1152 series en Disney+/AR y el caso testigo en ninguna.
  Por eso "Últimos lanzamientos · Series" mezcla la fuente regional con
  candidatos traídos por las **redes oficiales** (`lib/ultimos.ts`).
  🔴 **`with_watch_monetization_types` es lo que rompía la consulta por red**, no
  `watch_region`: medido, 304 resultados con ese parámetro y 440 sin él, y el
  caso testigo sólo aparece sin él. De ahí sale `sinMonetizacion` en `tmdb.ts`.
  **El catálogo regional se pagina de verdad; lo acotado es SÓLO el suplemento
  por redes.** Una primera versión mezclaba 3 páginas fijas por fuente y ahí
  terminaba: con Netflix, Max o Prime la página 4 salía vacía aunque TMDB tuviera
  cientos de resultados — una regresión contra la lista que ya existía. Ahora se
  traen páginas regionales hasta cubrir la pedida (cada una **cacheada por
  separado**, así pedir la 2 no rearma la 1), se mezclan con el suplemento —que
  se calcula una vez por día y combinación— y se ordena con un orden TOTAL (fecha
  desc, id desc como desempate estable). `hayMasRegional` es lo que impide que la
  lista se corte donde termina lo que se trajo.
- **"Últimos lanzamientos" tiene selector Películas/Series** (`shelfKey:
  "ultimos"`, `typeToggle: "refetch"`). **El default sigue siendo Películas**, así
  que el Home inicial no cambió. El tipo entra en el `t` y por lo tanto en la
  clave del payload: la versión subió a **`v6`** justamente porque un payload
  `v5` cacheado no trae el selector y el cambio "no se vería" durante 6 h.
  "Ver todas" lleva `?tipo=`, y `/lista/ultimos` lo recibe **desde el server**
  (no con `useSearchParams`, que forzaría un `<Suspense>`). **Al volver atrás
  manda el snapshot, no la URL**, igual que en `/categoria`.
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
| `GET /api/hacete-cargo` | "No gustaron" (votos malaso, `top_voted` 1-1). La ruta y la clave siguen diciendo `hacete-cargo`: cambió el rótulo, no el riel |
| `GET /api/search` | búsqueda (títulos + personas). `providers` **ordena, no filtra** |
| `GET /api/latest` | últimos estrenos por fecha. `?tipo=movie` (default) o `tv`; en `tv` mezcla el catálogo regional con candidatos por red oficial. `?page=` se normaliza (entero ≥ 1, o 1) |
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
- **Búsqueda predictiva.** Debounce real (250ms, desde 2 caracteres). No filtra
  por plataforma —si buscás por nombre querés verlo aunque no lo tengas, y la
  card indica disponibilidad— pero **sí ordena: lo que está en tus plataformas
  va primero y el resto sigue abajo**.
  Ojo con el diagnóstico si algo no aparece: **TMDB sí busca por prefijo** (con
  "spielb" encuentra a Spielberg). Lo que hace mal es el ORDEN — rankea primero
  los match exactos, así que la página 1 de "ste" son diez personas llamadas
  literalmente "Ste" y Spielberg está en el puesto 49. Por eso `search()` pide
  varias páginas de `/search/person`, `/search/movie` y `/search/tv` por
  separado (en `/search/multi` las personas y los títulos compiten por los
  mismos 20 lugares) y **reordena por popularidad**. El nivel de "match exacto"
  se aplica a títulos y **no** a personas, a propósito: un título se busca por su
  nombre completo, a una persona se la busca tecleando de a poco, y premiar el
  nombre completo ahí devolvía cuatro desconocidos llamados "Coco".
  El resultado se cachea 1 h por consulta + plataformas (`TTL.search`).
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
  "No gustaron" (1, antes rotulado "Hacete cargo"). **No hay nada que ejecutar**:
  Producción ya tiene `top_voted(p_days integer, p_limit integer, p_min integer,
  p_max integer)`, o sea la firma de 4 argumentos. La instrucción de re-correr el
  schema quedó obsoleta y se sacó — correr el schema completo por eso sería
  innecesario.
- ~~**"Películas que viste" + "Perfil de usuario / 5ta pestaña"**~~ — YA CONSTRUIDO. Área de usuario completa: hub con rieles (Mi lista, Me gustaron, Vistos recientemente), perfil con edición de nombre y picker de avatar (**31 avatares propios de Yump** en `/avatars/`, ver `lib/avatares.ts` y `docs/AVATARES.md` — sin librería de terceros ni petición saliente para generar o servir un avatar; la semilla sí se guarda en Supabase, que es proveedor de servicio), historial de vistas (`view_history`), Mi lista y Ya la vi (`user_items`). Próximos módulos: **Mis amigos** y **Mis emblemas** (placeholders en el hub). **El módulo de avatares NO requiere ejecutar SQL ni tocar Producción**: funciona con el esquema que ya está aplicado — ver `docs/AVATARES.md`.
  **Lo que decide qué avatar se muestra es la SEMILLA, no la columna de estilo.**
  Una elección guarda el id del catálogo en `avatar_seed` y
  `avatar_style = "adventurer-neutral"`, que es una **etiqueta de
  compatibilidad**: el código nuevo ni la lee, pero el lector anterior
  (`lib/avatar.ts` en `origin/main`) la interpolaba en una URL de DiceBear, así
  que con `"yump"` —lo que se guardaba antes— un rollback dejaba la imagen rota
  (404 verificado). Con el estilo compatible muestra otro dibujo, y al volver al
  código nuevo **reaparece la elección exacta sin migración**. La ambigüedad
  entre elección y semilla heredada no existe porque **ningún id del catálogo
  tiene formato uuid** y todas las semillas viejas sí. Los dos valores los arma
  un solo lugar, `eleccionAvatar()`; ningún componente los escribe a mano. La
  cadena `adventurer-neutral` tiene **una sola aparición autorizada** en código
  ejecutable, con allowlist textual en `scripts/barrido-dicebear.mjs`.

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
  depuración). Para probarlo: `npm run build && npx next start`. **`npm run`, no
  `npx next build`**: el stamp del fallback offline se aplica en el hook
  `prebuild`, que npx no dispara, así que con `npx next build` el SW queda con el
  hash anterior y la actualización no se propaga.
- **Al cambiar cualquier archivo del SW, subir `SC_CACHE_VERSION`** en
  `public/sw.js` — **no** en `public/sw/config.js`, que es justamente el bug que
  se corrigió (el navegador compara los bytes del script principal, no los de los
  `importScripts`). Si no, `activate` no limpia los caches viejos.
  **La excepción es `offline.html`**: no necesita bump porque se versiona por su
  propio hash (`SC_OFFLINE_URL`, ver `docs/PWA.md`) y `activate` borra las
  revisiones viejas.
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
