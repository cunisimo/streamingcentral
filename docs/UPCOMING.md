# Agenda de Estrenos — infraestructura

Motor que sincroniza los próximos estrenos (películas, nuevas temporadas,
próximos episodios) de TMDB a Supabase una vez por día, para que la app **nunca**
consulte TMDB en vivo por estrenos. Lo consumirán Planner, Home y notificaciones.

## Piezas

- **Schema** (`supabase/schema.sql`, sección "Agenda de Estrenos"): tablas
  normalizadas `providers`, `upcoming_content`, `upcoming_content_providers`.
  RLS de lectura pública; escritura solo con service role.
- **Edge Function** (`supabase/functions/tmdb-sync/`): Deno. Dispatcher por `job`.
  Hoy implementa `syncUpcoming`; `syncProviders/syncTrending/syncPopular/syncGenres`
  son scaffolding (devuelven 501).
- **Cron** (`supabase/cron.sql`): pg_cron diario que invoca la función.
- **Read path** (`lib/upcoming.ts` + `app/api/upcoming/route.ts`): el UpcomingService
  que lee Supabase y expone la Agenda a la app. Es lo único que toca la app; la
  función es backend puro.
- **Selección editorial** (`lib/proximamente.ts`): función PURA que decide qué se
  muestra y en qué orden. Ver la sección "La selección editorial" abajo.

## Regla de negocio

Se guarda **solo** lo que tiene ≥1 proveedor de streaming flatrate en AR. La
lista completa de plataformas queda normalizada en el join.

**Límite de la fuente:** TMDB no publica watch-providers hasta cerca del estreno,
así que la Agenda cubre sobre todo estrenos cercanos y originales de plataforma
ya listados. No es un bug.

## Despliegue (requiere Supabase CLI)

```bash
# 1. Schema: correr la sección nueva de supabase/schema.sql en el SQL editor
#    (o) supabase db push

# 2. Secrets de la función
supabase secrets set TMDB_READ_TOKEN=<token_v4>
# SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY las inyecta Supabase solas.

# 3. Deploy de la función
supabase functions deploy tmdb-sync

# 4. Invocación manual (prueba)
curl -X POST "https://<ref>.supabase.co/functions/v1/tmdb-sync" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"job":"syncUpcoming"}'
# -> { job, candidates, kept, upserted, providers, dropped, deleted, window, durationMs }
#    kept=guardados (≥1 provider AR); dropped=evaluados que perdieron provider y se borraron;
#    deleted=expirados por fecha. upserted cuenta filas afectadas (insert+update juntos).

# 5. Cron diario: correr supabase/cron.sql (reemplazando ref + key)
```

## Parámetros (env de la función, opcionales)

- `SYNC_WINDOW_DAYS` (default 90) — ventana hacia adelante.
- ~~`SYNC_MAX_PAGES`~~ — **eliminada el 2026-08-31.** Era el corte que definía
  el bug del descubrimiento: con 3 páginas ordenadas por popularidad, el sync
  miraba 60 de 1900 series de la ventana. Ahora se recorre hasta `total_pages`.
  Si la variable sigue puesta en el entorno de la función, no hace nada.
- `SYNC_GRACE_DAYS` (default 2) — días de gracia antes de expirar un estreno pasado.

**Versión desplegada:** `tmdb-sync` **v8** (2026-09-01), la primera con el
descubrimiento sin corte por popularidad. Ver el issue #8.

## Read path (app)

`GET /api/upcoming`:
- `?mediaType=movie|tv`
- `?platform=n|d|m|...` (código interno)
- `?month=YYYY-MM`
- `?items=movie:123,tv:456` (cruce con la Watchlist; el browser manda sus refs)

Idempotencia: correr la función N veces el mismo día deja el mismo estado
(upsert por `tmdb_id+media_type`, links reemplazados en bloque, expiración por fecha).

## Seguridad

La función valida `role="service_role"` en el JWT del header Authorization: la
anon key (role="anon") es rechazada con 403. Solo el cron/backend (con la
service role key) puede dispararla.

## Limitación conocida (aceptada v1)

El reemplazo de links por título es delete+insert no transaccional: existe una
ventana de milisegundos (a las 6am, tráfico bajo) donde un título podría leerse
con 0 plataformas. El fix definitivo es un RPC transaccional en Postgres; queda
para un hardening futuro.

## El idioma del sync, y el póster (decidido el 2026-08-24)

El sync escribe en el idioma que diga `IDIOMA_TITULOS` (secret de Edge
Functions, default `es-ES`), con respaldo a `es-ES` cuando TMDB no traduce.

**`poster_path` cambia con el idioma, y es DELIBERADO.** Los pósters de TMDB son
localizados: el de `es-MX` no es el de `es-ES`. La primera corrida en `es-MX`
cambió el póster de 12 de 43 filas. No es un daño ni un efecto colateral que
haya que corregir — acompaña el objetivo de encontrabilidad, que es que el
usuario vea en Yump lo mismo que va a ver en la plataforma.

**El backfill NO comparte ese alcance**: sigue limitado a `title`, `overview` y
`episode_name`. La diferencia no es contradictoria: el sync reescribe la fila
entera porque es su trabajo, y el backfill toca lo mínimo porque corre sobre
filas que nadie está mirando.

### Qué hace el sync cuando el respaldo no alcanza

La decisión es **por campo** y sobre el resultado **ya fusionado** — no sobre si
la fusión cambió algo:

| Situación | Qué pasa | Métrica |
|---|---|---|
| Sinopsis vacía en los dos idiomas | **se escribe** | `sinopsis_sin_mejora` |
| Título sigue roto después de fusionar | **no se escribe**, la fila anterior queda | `titulo_sin_reparar` |
| Episodio sin nombre en los dos idiomas | se conserva vacío | `episodio_sin_nombre` |
| Episodio ilegible sin respaldo útil | **no se escribe** | `episodio_no_reparado` |
| El respaldo se cayó | **no se escribe** | `fallos` |

**Los dos primeros no son problemas.** Una sinopsis vacía en es-MX que también
está vacía en es-ES no la rompió el cambio de idioma: ese título no tiene
sinopsis en español y nunca la tuvo. Descartarlos —que fue la primera versión—
tiró 79 títulos de 120 en la primera corrida real y bajó el descubrimiento a un
tercio.

**Solo `fallos` justifica reintentar.** Los demás son datos sobre el catálogo,
no fallas.

---

# La selección editorial (rediseño del 2026-09-04)

Diagnóstico y mediciones completas: `docs/medidas/2026-09-04-proximamente-diagnostico.md`.

## El problema que resolvió

`/proximamente` pedía 100 filas ordenadas por fecha y mostraba lo que viniera.
Medido sobre las 238 filas vigentes del 2026-09-04, eso era:

| | Antes | Después |
|---|---|---|
| Elementos | 100 | **97** |
| Rango | 04/09 → 08/09 — **5 días de 50** | 04/09 → 01/12 — **50 días** |
| Películas | 0 | 1 |
| Estrenos de temporada | 1 | 71 |
| Episodios semanales | 99 | 25 |
| **Anime** | **51 (51%)** | **6 (6,2%)** |
| Crunchyroll | 47% | 3,1% |

**Los primeros seis días concentran 141 de los 238 elementos**, así que cualquier
corte por fecha se los comía enteros. Por eso la selección va **antes** de
paginar: cortar en el navegador no puede arreglar que los primeros días consuman
el cupo.

## La regla

Por cada fecha, **3 series como máximo**:

1. Un lugar **reservado** para el estreno de temporada más relevante del día.
2. Si hay una **temporada 1**, ese lugar es suyo — aunque su popularidad sea más
   baja. Una serie nueva es la noticia del día.
3. Los lugares que sobran van a las series **más populares** de la fecha, sin
   mirar si son premiere o episodio normal.
4. Sin premieres, los tres lugares son de las tres series más populares.
5. **Las películas con plataforma argentina confirmada entran TODAS** y no
   consumen el cupo de series.

⚠️ **Son 3 series TOTALES, no "3 episodios más las premieres que haya".** Esa fue
la primera versión y cambiaba un ruido por otro: dejaba entrar las 81 premieres
de la agenda, el 34% de las filas, con hasta 5 en un mismo día.

⚠️ **No hay piso absoluto de popularidad**, y es una decisión explícita del dueño:
la popularidad **ordena dentro de cada fecha** y nunca decide que un título deja
de existir. Un día con una sola serie muestra esa serie, tenga la popularidad que
tenga. El caso testigo es el 07/09: *The Real Housewives of London* (popularidad
**3**) se queda con el lugar reservado por delante de 21 episodios, varios con
popularidad de 100+, porque es el único estreno de temporada del día.

⚠️ **Dentro de un mismo día, el orden de pantalla lo decide la POPULARIDAD, no el
nivel editorial.** El lugar reservado del premiere es una regla de *selección*;
usarla también para ordenar hacía que el riel del Home abriera el 07/09 con ese
premiere de popularidad 3 por delante de *WWE Raw* (107). Los dos órdenes
seleccionan exactamente lo mismo. Las películas sí van primero en su día: son el
nivel 1 y lo escaso de la agenda.

## Anime, que no es lo mismo que animación

🔴 **La confusión es el bug que la clasificación existe para no cometer.** De los
100 títulos con género Animación de la agenda, **19 no son anime**: *Los Simpson*,
*South Park*, *Futurama*, *American Dad*, *Teen Titans Go!*, *Masha y el Oso*
(rusa), *Super Wings* (coreana), *Tres Espías Sin Límite* (francesa). Topear
"animación" al 20% habría estado sacando a los Simpson para dejar entrar anime.

Dos señales, cualquiera alcanza:

- **Proveedor Crunchyroll.** Verificado: de los 67 títulos de Crunchyroll en la
  agenda, los 67 tienen género Animación. Cero excepciones, así que es señal de
  precisión perfecta con recall de 67/100.
- **Género Animación + `original_language = "ja"`.** Recupera los 33 de otras
  plataformas, incluidos los tres de título romanizado que ninguna heurística
  sobre el título original puede ver: `BLEACH`, `BEYBLADE X` y `MAO`.

Juntas marcan 81 de 81.

⚠️ **`origin_country` NO se agregó, y no es un olvido.** Se midió: aporta
exactamente **CERO** títulos. La animación cuyo `origin_country` incluye JP son
76, y los que tienen `original_language = "ja"` son los **mismos 76**. Habría
sido una columna sin consumidor.

### El tope del 20%

Se aplica sobre el **acumulado de cada tanda**, no sólo sobre el total. Son dos
mitades y hacen falta las dos:

- **El cupo global** decide cuáles entran: si hay `M` títulos que no son anime,
  la cantidad `a` de anime cumple `a ≤ 0,20·(M + a)`, o sea `a ≤ M·0,25`. Dentro
  de ese cupo se conservan los más populares.
- **El recorrido** garantiza el tope en cada prefijo: un anime entra si además
  `(anime + 1) ≤ 0,20·(total + 1)`.

Un anime rechazado se **descarta**, no se posterga: postergarlo lo movería de
fecha y reintentarlo lo haría aparecer en dos páginas. La lista queda más corta,
que es lo correcto — rellenar violaría el tope en silencio.

⚠️ **El tope del 20% NO es lo que baja el ruido.** Medido: el cupo por fecha
**solo**, sin ningún tope de anime, ya deja la lista en 10,5%; con el tope queda
en 6,2%. El valor real del tope es ser una **garantía** para el día que TMDB
publique una tanda grande de estrenos de anime.

⚠️ **El anime más popular puede quedar afuera.** El cupo mira popularidad y el
recorrido se gasta en orden cronológico, así que si los mejores están al final,
los del medio consumen el tope primero. Lo que sí queda garantizado —y es lo que
importa— es que **ningún anime de baja popularidad entra nunca**. Está fijado por
un test. Se evaluó corregirlo con un intercambio y no se implementó: con 6 anime
en 97 elementos (6,2% contra 20% permitido) los datos reales no lo ejercitan.

## Paginación

20 elementos por tanda, **paginado en el servidor** sobre la selección ya
equilibrada. `GET /api/upcoming?page=2` (con `mediaType` opcional) devuelve
`{ items, hayMas, total, page }`.

`hayMas` sale del largo de la selección, no de si la página vino llena — la misma
lección de `/lista/miniseries`: cortar por "vinieron menos de 20" es un bug
silencioso en cuanto algo pueda achicar una página.

**El filtro de tipo se aplica ANTES de seleccionar.** Al revés, "Películas"
mostraría sólo las que hubieran sobrevivido compitiendo con series. Filtrando
primero, cada solapa tiene su selección y su paginación coherentes: hoy Todos da
97 (5 páginas), Series 96 (5 páginas) y Películas 1.

**Limitación conocida:** la selección se reconstruye en cada pedido. Es
determinística mientras la tabla no cambie, pero **el sync corre a las 6am** y una
página pedida después podría salir de una selección distinta. Es la misma clase de
limitación ya documentada para `/lista/miniseries`. El dedup por `tipo:id` al
concatenar lo cubre.

## El riel del Home

`upcomingHome(15)` son los primeros 15 de la selección. Reemplaza a `upcomingMix`,
que estaba roto de dos formas:

- Pedía `per = ceil(limit/2) + 3` de cada tipo asumiendo que los dos tenían
  oferta. Con **una** película en toda la agenda, devolvía **12** de las 15
  pedidas y no había forma de que llegara a 15.
- El intercalado ponía esa única película —del 30/09— en la **segunda** posición,
  entre dos títulos del 04/09. Un riel que se presenta como cronológico no lo era.

Que el Home no muestre ninguna película es el dato, no una falla: la única de la
agenda es del 30/09 y hay 50 días con contenido antes.

**El Home no espera a esta sección.** `UpcomingSection` se monta fuera del gate de
carga de los rieles y hace su propio fetch, así que mientras carga muestra sus
skeletons y el resto se pinta igual.

## El bug del selector, y por qué el diagnóstico importaba

Tocar Películas podía seguir mostrando Series. **No era una respuesta fuera de
orden: no se emitía ninguna petición.** `filtroPrevio` era un `useRef(null)` que
se inicializaba dentro del efecto que lo leía, y en el render donde ocurría la
carga inicial ese efecto no corría —sus dependencias no habían cambiado—, así que
quedaba en `null` y el primer clic se consumía como "la inicialización".

Determinístico, no intermitente: fallaba siempre que se llegaba con el filtro en
`Todos`, y andaba al volver de una ficha con Películas o Series ya elegido, porque
ahí la restauración cambiaba el filtro y el efecto sí corría. Eso era el "a veces"
del reporte. **`reqId` funcionaba bien**, así que un arreglo dirigido a la carrera
de respuestas no habría cambiado nada.

Tenía una consecuencia peor: mientras el botón decía `movie` y los items eran de
`all`, el mecanismo de restauración persistía ese par —en cada render, porque
`extra` era un objeto literal nuevo—, así que la vuelta siguiente restauraba
series bajo Películas de forma **estable**.

El arreglo vive en `hooks/filtro-paginado-nucleo.ts`, un módulo **puro**: la
lógica estaba suelta entre dos efectos y ahí no se podía probar (este proyecto no
tiene arnés de DOM). `hooks/filtro-paginado-nucleo.test.ts` reproduce la falla
sobre la máquina de estados vieja antes de fijar el contrato nuevo, así que si
alguien vuelve a esa forma, falla.

## Rendimiento: dónde está y dónde no

| | |
|---|---|
| Lectura de la agenda completa (246 filas, 1 consulta con join) | frío 951 ms, mediana **493 ms** |
| Selección + paginado sobre 238 elementos | mediana **0,19 ms**, p95 0,43 ms |
| El join de proveedores | **~3 ms** (268 vs 265 ms con 11 filas) |

**La selección es el 0,04% del costo de la lectura.** Y traer la agenda entera
cuesta lo mismo que traer 100 filas (~490 ms las dos), porque lo que se paga es
el round-trip y no el tamaño: **el rediseño no cuesta más que lo que reemplazó.**

Lo que queda es el **arranque en frío** de la lambda, ~1 s medido contra
Producción (1543 ms la primera llamada contra 499 ms de mediana caliente, con
`/api/health` en 550 ms como piso de latencia). Es de la plataforma, no del
código. **Sin caché**: no arreglaría un arranque en frío.

## 🔴 Orden de despliegue

**La migración `008` va ANTES de deployar el código.** El `SELECT` del read-path
pide `original_language`; sin la columna, PostgREST responde
`400 column upcoming_content.original_language does not exist`, `upcomingList`
lanza y **`/api/upcoming` entero devuelve 500** — no sólo la selección: también el
riel del Home, `?month=` y el cruce con la watchlist. Verificado contra la base
viva.

La migración es incremental y no necesita backfill: es una columna nullable sin
default (sólo metadata, sin reescribir filas), y `syncUpcoming` hace `upsert` de
la fila **entera** para todos los candidatos que descubre, así que la corrida
siguiente del cron diario completa el campo. Mientras esté en NULL, la
clasificación de anime queda sólo con la señal de Crunchyroll: 83% de recall,
degradación y no rotura.
