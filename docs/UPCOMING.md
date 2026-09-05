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
| Elementos | 100 | **96** |
| Rango | 05/09 → 09/09 — **5 días de 50** | 05/09 → 01/12 — **50 días** |
| Películas | 0 | 1 |
| Estrenos de temporada | 1 | 70 |
| Episodios semanales | 99 | 25 |
| **Anime** | **51 (51%)** | **8 (8,3%)** |
| Crunchyroll | 47% | 3,1% |

⚠️ El diagnóstico original se midió el **04/09** y la columna "Después" está
remedida el **05/09** con el algoritmo final. Los totales no son comparables al
dígito entre dos días: el catálogo de TMDB deriva solo (238 filas vigentes contra
239) y el sync corre a las 6am. Lo que no cambia entre corridas son las
proporciones y los invariantes.

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

Se aplica sobre el **acumulado de cada tanda**, no sólo sobre el total. Y lo que
entra es el conjunto de **máxima popularidad** que cumple eso — las dos mitades
de la regla aprobada, sin ceder ninguna.

**El despeje es lo que lo vuelve tratable.** Sea `m` la cantidad de no-anime que
van antes de un título en el orden cronológico final. Ese número es **fijo**: no
depende de qué anime se elijan, porque los anime no se cuentan entre sí. Si ese
título termina siendo el `j`-ésimo anime, su posición es `m + j`, y el tope pide:

```
j / (m + j) ≤ 1/5   ⟺   5j ≤ m + j   ⟺   4j ≤ m   ⟺   j ≤ ⌊m/4⌋
```

O sea que **cada anime tiene un puesto máximo** y no hay que simular nada: un
conjunto cumple el tope en todas las tandas acumuladas si y sólo si, ordenado
cronológicamente, el `j`-ésimo tiene puesto máximo ≥ `j`.

Eso es exactamente la condición de factibilidad de un **scheduling con plazos**,
cuyos conjuntos factibles forman un **matroide**. Sobre un matroide, el greedy
por peso descendente devuelve la base de peso máximo, así que recorrer los
candidatos por popularidad descendente y quedarse con cada uno que siga siendo
factible da el conjunto **óptimo**, no simplemente uno bueno. Comprobado contra
fuerza bruta en 3.000 casos al azar: 0 sub-óptimos.

⚠️ **La decisión se toma con la fracción `1/5`, no con `0.20`.** No es
duplicación decorativa: con 172 no-anime antes y puesto 43, `43 ≤ 172·0,20/0,80`
es **falsa** en coma flotante y `4·43 ≤ 172` es verdadera. Barrido de 400.080
combinaciones: la versión con flotantes discrepa en 1, la entera en 0. Un test
ata las dos constantes para que no puedan divergir.

Un anime que no entra se **descarta**, no se posterga: moverlo de fecha rompería
el orden cronológico y reintentarlo lo haría aparecer en dos páginas. La lista
queda más corta, que es lo correcto — rellenarla violaría el tope en silencio.

⚠️ **El tope del 20% NO es lo que baja el ruido.** Medido: el cupo por fecha
**solo**, sin ningún tope de anime, ya deja la lista en 10,5%; con el tope queda
en 8,3%. El valor real del tope es ser una **garantía** para el día que TMDB
publique una tanda grande de estrenos de anime.

#### La versión anterior era incorrecta

Elegía un cupo global por popularidad y después lo gastaba recorriendo la lista
en orden cronológico, así que los anime del medio consumían el tope antes de que
llegara uno posterior más popular. Con 10 fechas de un anime cada una y
popularidad creciente entraban los de los días 6 a 9 y **el del día 10 —el más
popular de todos— se rechazaba**. Cumplía el tope y no cumplía "conservar los más
populares". Hay un test con ese caso exacto que ahora exige `anime7..anime10`.

⚠️ **Un anime puede seguir quedando afuera por su FECHA, y eso no es el mismo
problema.** Medido el 2026-09-05: *Bleach* (popularidad 142, el más popular de la
agenda) cae el **primer día**, con sólo 2 no-anime delante, así que su puesto
máximo es `⌊2/4⌋ = 0` — ni siquiera puede ser el primer anime de la lista, porque
1 de 3 elementos es el 33%. Es **imposible** bajo la regla del 20%, no una
displacement: ningún conjunto que lo contenga es factible. Todos los demás
candidatos —los 8 desde el 07/09— entraron.

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

### "Cargar más": la página confirmada no avanza hasta que la tanda llegó

🔴 **`tanda.confirmada` es la página que YA LLEGÓ, no la que se pidió.** La
primera versión hacía

```js
const more = () => { const next = page + 1; setPage(next); load(f, next); };
```

o sea que adelantaba la página **antes** de conocer el resultado. Si la tanda 2
fallaba, `page` ya valía 2 y el siguiente toque pedía la 3: la tanda 2 quedaba
salteada para siempre y la lista tenía un **hueco invisible** —`[1..20, 41..60]`—
que ninguna cantidad de reintentos recuperaba. Y el snapshot que se guardaba decía
"voy en la página 2" con los items de la 1, así que volver de una ficha heredaba
el hueco.

Con la página confirmada, **reintentar y avanzar son la misma cuenta**: pedir
`confirmada + 1`. No hay que recordar qué falló.

Qué pasa cuando una tanda adicional falla:

| | |
|---|---|
| Los elementos ya visibles | **se conservan** — no se borra nada |
| La página confirmada | **no se mueve** |
| El reintento | pide **exactamente la misma** página |
| Lo que se muestra | aviso discreto al pie: "No se pudo cargar el resto · Reintentar" |
| El estado de error a pantalla completa | **sólo** si falló la primera carga y no hay nada que mostrar |
| Una respuesta repetida | `unir` deduplica por `tipo:id`; `alLlegarLaTanda` usa `Math.max` y no retrocede |

La lógica vive en `hooks/filtro-paginado-nucleo.ts` —`EstadoTanda`,
`paginaAPedir`, `alLlegarLaTanda`, `alFallarLaTanda`, `unir`— y no suelta dentro
del componente, por el mismo motivo que el arreglo del selector: este proyecto no
tiene arnés de DOM, así que un bug de coordinación sólo se descubriría usando la
app. El test recorre la secuencia completa: página 1 bien, 2 falla, reintento de
la 2 bien, después la 3 → los 9 elementos en orden, sin huecos ni repetidos, con
la secuencia de páginas pedidas en `[1, 2, 2, 3]`.

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

### El cambio de filtro es un HANDLER, no un efecto

🔴 **Restaurar un snapshot y que el usuario toque un botón no se pueden distinguir
comparando estado.** Mientras el cambio de filtro vivió en un efecto, la decisión
salía de comparar el `filtro` del cierre contra `estadoFiltro.current`, que el
efecto de arranque acaba de escribir en la misma ronda. Y un efecto ve los valores
del render en el que se creó: cuando el arranque restaura un snapshot de Series y
hace `setFiltro("tv")`, el efecto de abajo sigue viendo `filtro === "all"` mientras
`aplicado` ya dice `"tv"`. Eso es `tv → all`, indistinguible de un clic en Todos:
reiniciaba la vista, pedía la página 1 de Todos, y en el render siguiente volvía a
pedir Series. Dos peticiones que no había que hacer y la restauración del scroll
pisada — justo lo contrario de "si restauró, no se pide nada".

**Hoy eso no se dispara, y conviene decirlo con precisión.** El efecto no llegaba
a correr en esa ronda porque sus dependencias —`[filtro, load, reiniciar]`— no
habían cambiado: `filtro` todavía es el viejo y los dos callbacks son estables. O
sea que la corrección dependía de la **estabilidad referencial** de `useCallback`,
que nada verifica. Alcanzaba con agregarle una dependencia a `reiniciar` para que
el efecto corriera en cada render y el bug apareciera.

Como handler el problema no existe: la restauración escribe estado y nada más, y
lo único que pide es un clic. Sin temporizadores y sin depender del orden de las
respuestas. **Queda un solo efecto en la vista** —el de arranque— y sale por
`return` sin llamar a `load` cuando restauró.

#### Peticiones por escenario

| Escenario | Peticiones |
|---|---|
| Entrada nueva por link | **1** (`all:1`) |
| Vuelta con snapshot `all` | **0** |
| Vuelta con snapshot `movie` | **0** |
| Vuelta con snapshot `tv` | **0** |
| Primer clic manual después de restaurar | **1** (sólo ese filtro) |
| Clic en el filtro que ya estaba restaurado | **0** |

#### La tabla sale de un MODELO, y hay que saber qué cubre y qué no

`hooks/arranque-restauracion.test.ts` modela el runtime de efectos con las cuatro
reglas que importan: corren en orden de declaración, sólo si cambió una
dependencia (comparación por identidad), **con el cierre del render en curso** — o
sea que no ven los `set*` que otro efecto acaba de hacer en la misma ronda — y los
refs sobreviven sin disparar renders.

Con eso hace tres cosas que probar `iniciar()` y `decidirCambioDeFiltro()` por
separado no puede: confirma que la versión con efecto **anda** mientras
`reiniciar` sea estable, **reproduce la falla** —`["all:1", "tv:1"]` y la
restauración borrada— en cuanto deja de serlo, y fija los conteos de la tabla de
arriba para la versión con handler, con la identidad estable y con la inestable.

🔴 **Pero es un modelo de la coordinación, no una prueba del componente**, y no hay
que leerle más de lo que dice:

| | |
|---|---|
| Monta `UpcomingAllView` | **no** — sus efectos están reescritos en el test, así que el componente puede cambiar sin que el modelo se entere |
| Ejecuta `useListaPaginada` / `sessionStorage` | **no** — la restauración y la marca de vuelta están simuladas |
| Ejecuta React | **no** — el planificador, el batching y el orden de renders son una aproximación |
| Prueba la restauración del **scroll** | **no** — el modelo hace `scrollY = e.scrollY`, o sea que verifica su propia contabilidad. El `requestAnimationFrame` doble del hook, la altura real de la grilla y el scroll del navegador no participan |

Lo que fija es la **decisión** de pedir o no pedir bajo un orden de efectos fiel.
La verificación de punta a punta es la del navegador —paso 6 de
`docs/medidas/2026-09-05-proximamente-salida.md`— y el modelo **no la reemplaza**.

#### Lo que SÍ se verificó en un navegador real (2026-09-05)

Con el dev server corriendo sobre esta rama (`next dev` apuntado al worktree,
puerto 3098) y midiendo con `performance.getEntriesByType("resource")`, que se
reinicia en cada navegación:

| Comprobación | Resultado | Cómo |
|---|---|---|
| Strict Mode activo en dev | **sí** | el chunk `main-app.js` servido contiene `StrictModeIfEnabled = true ? _react.default.StrictMode : 0` |
| Entrada nueva a `/proximamente` | **1** llamada, `?page=1` | Performance API tras un reload limpio |
| Strict Mode duplica el arranque | **no** | la medición de arriba se tomó con Strict Mode activo |
| El 500 por la columna faltante | **reproducido** | `{"error":"Error: column upcoming_content.original_language does not exist","items":[]}` |

Ese último confirma el orden de despliegue con el código real, no por deducción.

#### 🔴 Lo que queda PENDIENTE, y por qué

**No se pudo probar en el navegador**: la restauración al volver de una ficha
(filtro, tarjetas, páginas y scroll con cero llamadas), el primer clic manual
después de restaurar, y el clic sobre el filtro ya activo.

**No es por falta de ganas ni de herramientas: está bloqueado por el orden de
despliegue del propio cambio.** La cadena, verificada:

1. La migración `008` no está aplicada, así que `/api/upcoming` devuelve 500.
2. Sin respuesta no hay items, y con `failed` y la lista vacía la vista renderiza
   `OfflineState`: **los botones de filtro no se dibujan** (medido:
   `document.querySelectorAll(".tipo-toggle .tt").length === 0`), así que no hay
   nada que clickear.
3. `useListaPaginada` no guarda snapshot sin items (`if (!items.length) return`),
   así que tampoco hay nada que restaurar (medido:
   `sessionStorage.getItem("yump:lista-paginada") === null`).

**Qué lo desbloquea:** el paso 1 de este runbook. Con la columna creada, la prueba
del paso 6 se puede correr entera — en local contra la misma base, sin esperar al
deploy del paso 5.

⚠️ **Esta evidencia no la reemplaza el modelo de
`hooks/arranque-restauracion.test.ts`**, que no monta el componente, no ejecuta
`useListaPaginada` ni React, y no prueba el scroll. Los conteos de restauración
que ese test fija son del modelo; los del navegador siguen pendientes.

#### Strict Mode

En el App Router de Next, **Strict Mode está activo en desarrollo** cuando
`next.config.mjs` no dice lo contrario (`__NEXT_STRICT_MODE_APP`: *"When
next.config.js does not have reactStrictMode it's enabled by default"*). React
invoca los efectos dos veces al montar, y las dos cosas que podrían romperse están
cubiertas:

- **La petición de arranque no se duplica**: la segunda pasada sale por
  `arrancado.current`, que es un ref y sobrevive.
- **La restauración no se pierde**, y por un detalle de `useListaPaginada` que vale
  la pena conocer: la segunda pasada vuelve a llamar a `consumirVuelta`, que ya
  gastó la marca, así que decide "no restaurar" — pero el hook hace
  `if (e) { setInicial(e); … }`, o sea que con `e` en `null` **no** llama a
  `setInicial` y el valor de la primera pasada queda. Escrito como `setInicial(e)`
  a secas, la segunda pasada borraría la restauración y pediría la página 1.

Las dos están fijadas por tests.

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
