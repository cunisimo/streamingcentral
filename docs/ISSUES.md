# Issues abiertos

Pendientes con dueño, causa identificada y criterio de cierre. Si algo se
resuelve, se borra de acá (no se marca "hecho" y se deja).

---

## #1 — Lighthouse Performance 61 en móvil (objetivo: >90)

**Estado:** abierto · **Prioridad:** media · **Abierto:** 2026-07-21

### Medición

Lighthouse 13.4.1, form-factor mobile, throttling simulate, contra
`next start` en local:

| Categoría | Score |
|---|---|
| Performance | **61** |
| Accessibility | 96 |
| Best Practices | 100 |
| SEO | 100 |

`FCP 1.6s · LCP 5.9s · TBT 600ms · CLS 0.054`

> Contexto: venía de 47. Subió a 61 al eliminar una recarga automática en
> `controllerchange` del Service Worker (ver `docs/PWA.md` §4). Ese era el único
> culpable atribuible al trabajo de PWA; lo que queda es preexistente.

### Culpables identificados

1. **`next/image` no se usa en ningún lado.** Es el principal. Hoy hay:
   - 10 lugares con `backgroundImage` en CSS: `TitleCard.tsx:13`,
     `DetailView.tsx:27`, `PersonCard.tsx:9`, `SearchView.tsx:70` y los 5 de
     `components/desempate/`.
   - 4 `<img>` crudos: `AvatarPicker.tsx:27`, `PlatformLogo.tsx`,
     `TopBar.tsx:36`, `UserHub.tsx:16`.

   Consecuencias: sin AVIF/WebP, sin `srcset` por densidad, sin `width`/`height`
   explícitos, sin lazy nativo, sin `priority` en el LCP. El
   `remotePatterns` de `next.config.mjs` está configurado pero no lo usa nadie.

2. **Cadena larga hasta el LCP.** Las páginas son shells estáticos que hidratan,
   recién ahí piden `/api/*`, y esas rutas a su vez pegan a TMDB. El póster que
   define el LCP no puede empezar a bajar hasta que se completa esa cadena. Por
   eso LCP 5.9s con FCP 1.6s: el contenido pinta rápido, la imagen grande no.

3. **Trabajo de main thread alto.** ~2s de ejecución de JS. La Home hidrata 21
   rieles más el resto de client components.

### Posibles líneas de trabajo (sin decidir)

- Migrar `TitleCard` a `next/image` con `sizes` correcto y `priority` en las
  primeras cards. Es el cambio de mayor impacto por unidad de esfuerzo.
- Dar `width`/`height` a todo lo que hoy es `backgroundImage` para reservar
  espacio (también ayuda a CLS).
- Evaluar server-side de la primera pantalla (RSC + streaming) para acortar la
  cadena del LCP. Es el cambio más grande y toca arquitectura.
- Reducir el número de rieles montados de entrada en la Home.

### Criterio de cierre

Performance > 90 en Lighthouse mobile contra un build de producción, sin haber
roto las estrategias de caché del SW (`/api/*` sigue Network Only).

### No confundir con

Esto **no** es un problema de PWA. Las estrategias del Service Worker no afectan
estas métricas: Lighthouse corre con perfil limpio, sin SW previo.

---

## #2 — `--faint` no cumple contraste WCAG AA

**Estado:** abierto · **Prioridad:** baja · **Abierto:** 2026-07-21

`--faint: #9A9EA6` sobre `--bg: #F5F5F2` da **2.46:1**. WCAG AA exige 4.5:1 para
texto normal. Es el **único** ítem que Lighthouse marca en accesibilidad
(`color-contrast`), y por eso el score queda en 96 y no en 100.

Se usa en textos secundarios y contadores (`globals.css`, buscar `var(--faint)`).

**Criterio de cierre:** el audit `color-contrast` pasa y Accessibility llega a
100, sin que el token pierda su rol visual de "texto atenuado".

---

## #3 — Caminos de red sin ejercitar en la verificación de la PWA

**Estado:** abierto · **Prioridad:** media · **Abierto:** 2026-07-21

Toda la verificación offline se hizo **apagando el servidor**, nunca la red. Eso
deja dos zonas sin ejercitar:

### 3.a — `navigator.onLine` y el listener `online`

Con el servidor caído, `navigator.onLine` sigue en `true`. Nunca se ejecutaron:

- La rama `!online` de `CatalogView` (el estado offline por modo avión). Lo que sí
  se probó es la otra señal, `fetchFailed`, que es la que disparó en las pruebas.
- El listener `online` de `hooks/useOnline.ts`.
- El reintento automático de `OfflineState` en la transición offline→online
  (`prevOnline.current` false → true).

**Cómo cerrarlo:** dispositivo real en modo avión, o DevTools → Network →
Offline (que sí fuerza `navigator.onLine = false`, a diferencia de matar el
servidor).

### 3.b — Lie-fi más allá del timeout

`networkFirst` tiene una carrera contra 4s verificada con una ruta que cuelga 30s
(sirvió `offline.html` a los 4019ms). Lo que **no** está cubierto:

- Conexión que entrega bytes muy lentamente en vez de colgarse del todo: el
  `fetch` resuelve headers rápido y el body gotea. El timeout actual corre contra
  la resolución de la promesa de `fetch`, no contra la descarga del body.
- `cacheFirst` (assets de Next, imágenes TMDB) **no tiene timeout**. En lie-fi, un
  asset no cacheado puede colgar indefinidamente. No rompe la navegación (el
  documento sí tiene timeout) pero puede dejar la página a medio pintar.
- Elegir 4000ms fue un criterio, no una medición. Sin datos de red real no se
  sabe si es agresivo o permisivo para el usuario típico en Argentina.

**Criterio de cierre:** decidir si `cacheFirst` necesita timeout, y validar el
valor de `NETWORK_TIMEOUT_MS` contra una traza de red real (DevTools → Slow 3G o
mejor, un dispositivo en condiciones malas).

---

## #4 — Fechas calculadas en UTC: la app se adelanta 3 horas

**Estado:** abierto · **Prioridad:** media · **Abierto:** 2026-08-15

`dailySeed()` ya se pasó a `America/Argentina/Buenos_Aires` (commit `4289677`),
pero quedaron otros cálculos de fecha en UTC. Todos comparten el mismo defecto:
entre las **21:00 y la medianoche** de Argentina, la app cree que ya es mañana.

Esa franja es justo cuando la gente elige qué ver, así que el bug cae en el peor
horario posible.

### Lugares y efecto de cada uno

| Dónde | Qué hace | Efecto entre las 21 y las 24 |
|---|---|---|
| [`DetailView.tsx:52`](../components/DetailView.tsx) | `porEstrenar` compara `releaseDate > hoy(UTC)` | **El más visible.** Un estreno de mañana pasa a contar como de hoy, así que "Recordarme" desaparece de la ficha tres horas antes de tiempo — justo la noche anterior, que es cuando más sentido tiene agendarlo |
| [`enrich.ts:34`](../lib/enrich.ts) | `today()`, usado para acotar listados por fecha | Un título que estrena mañana puede entrar o salir del listado antes de tiempo. Impacto menor: cambia el borde de un listado, no un dato que el usuario se lleve |
| [`sync-upcoming.ts:11`](../supabase/functions/tmdb-sync/jobs/sync-upcoming.ts) | `iso()` para la ventana de estrenos que se ingesta | Corre en la edge function de Supabase, **otro runtime**: hay que verificar qué zona horaria tiene antes de asumir que se arregla igual que el resto |

### Lo que se revisó y NO es un problema

`lib/calendar-links.ts` y `lib/ics.ts` **no tienen el bug**, y conviene dejarlo
escrito para no volver a investigarlo:

- La fecha del evento (`e.fecha`) es un `YYYY-MM-DD` que viene tal cual de TMDB
  (`release_date` / `first_air_date`). Es un día de calendario, no un instante,
  y `/api/recordatorio` lo pasa sin tocarlo: no hay ningún `new Date()` en el
  camino que decida el día del evento.
- `diaSiguiente()` hace aritmética en UTC (`T00:00:00Z` + 1 día), pero sobre un
  valor que ya es solo-fecha y en un huso sin horario de verano: sumar un día da
  el día siguiente exacto, sin corrimiento posible.
- Los dos generadores emiten eventos de **día completo** (`DTSTART;VALUE=DATE` en
  el .ics, `dates=AAAAMMDD/AAAAMMDD` en Google). Un valor de tipo DATE no lleva
  huso: el calendario lo muestra en ese día calendario, sea cual sea la zona del
  usuario y la hora a la que lo haya agregado.
- El único valor en UTC es `DTSTAMP`, que el RFC 5545 **exige** en UTC.

O sea: agregar un recordatorio a las 23:00 guarda el evento en el día correcto.
No hay dato erróneo escapando a un calendario ajeno.

**Criterio de cierre:** que `porEstrenar` y `today()` calculen con la fecha
argentina (el helper de `dailySeed()` en `lib/cache.ts` ya la resuelve, pero es
`server-only` y `DetailView` es cliente: hace falta un helper compartido), y que
se verifique la zona horaria del runtime de la edge function antes de tocar
`sync-upcoming`.

---

## #5 — ¿"Próximamente" muestra el estreno en cine o la llegada a streaming?

**Estado:** abierto · **Prioridad:** alta · **Abierto:** 2026-08-15
**Tipo:** decisión de producto, no bug de implementación

### La pregunta

Yump es una app de streaming: no muestra cine ni TV abierta. Entonces la agenda
debería contestar *"¿cuándo puedo verla?"*, no *"¿cuándo se estrena en el
mundo?"*. Si la respuesta es la primera —y todo indica que sí—, hoy la agenda
está contestando la pregunta equivocada, y eso arrastra dos consecuencias que
hay que decidir explícitamente:

1. **Una película no debería aparecer en la agenda hasta su fecha digital.**
   *The Fantastic 4* tiene estreno en cine el 2025-07-23 y llegada a digital en
   AR el 2025-11-05. Con el criterio actual entra a la agenda en julio y el
   recordatorio apunta a julio: **tres meses y medio antes** de que se pueda ver.
2. **Cambia qué se ingesta.** El sync descubre películas con
   `primary_release_date`, así que la ventana de la agenda es de estrenos de
   cine. Cambiar el criterio cambia el contenido de `upcoming_content`.

### De dónde sale la fecha hoy

| Camino | Campo | Qué es |
|---|---|---|
| Agenda (principal) | `upcoming_content.release_date`, que el sync llena con `discover(primary_release_date.*)` **sin `region`** | La fecha más temprana del mundo: normalmente premiere o estreno en cine |
| Ficha (fallback) | `titleDetails().release_date` **sin `region`** | Lo mismo |
| Series | `next_episode_to_air.air_date` | El episodio real. En originales de plataforma el estreno es simultáneo mundial, así que suele coincidir |

Comprobado contra TMDB:

| Título | Lo que usa la app | AR cine | AR digital |
|---|---|---|---|
| Superman | 2025-07-09 | 2025-07-10 | — |
| The Fantastic 4 | 2025-07-23 | 2025-07-24 | 2025-11-05 |

### El problema que hay que resolver, no solo el que hay que arreglar

**La fecha digital de TMDB falta seguido** — mirá que Superman ni siquiera la
tiene. Así que no alcanza con "usar el tipo 4": hay que decidir qué pasa cuando
ese dato no existe. Tres caminos, y ninguno es obviamente mejor:

- **Mostrar la de cine igual**, aclarando en la UI que es el estreno en cine y
  no la llegada a streaming. Mantiene el catálogo lleno; el costo es que la
  agenda mezcla dos cosas distintas y el usuario tiene que leer la letra chica.
- **No mostrar fecha**, solo el título como "próximamente, sin fecha". Honesto,
  pero un ítem de agenda sin fecha no se puede agendar y sirve poco.
- **Excluir el título** hasta que TMDB publique la digital. Es lo más fiel a
  "app de streaming", y el costo es una agenda bastante más chica — con qué
  frecuencia, hay que medirlo antes de decidir.

Medir cuántos títulos de la ventana actual tienen fecha digital AR es el primer
paso: sin ese número, elegir entre las tres opciones es a ciegas.

### Mitigación ya aplicada (no cierra el issue)

Para que el problema no llegue a producción mientras se decide:

- **Ficha**: en películas, "Recordarme" solo aparece si TMDB da la fecha digital
  argentina (`digitalAR` en `UITitleDetail`, tipo 4 de `release_dates`). No
  cuesta requests extra: `titleDetails` ya traía `release_dates` para la
  certificación por edad.
- **Agenda**: en películas no se ofrece "Recordarme" y punto, porque el payload
  de `upcoming_content` no tiene con qué validar la fecha. Es deliberadamente
  conservador. Hoy no oculta nada: la agenda son 41 series y ninguna película.

- **Lo que se agenda**: cuando el botón sí aparece, tanto el link de Google como
  el `.ics` usan la fecha digital argentina. La ruta `/api/recordatorio` la
  resuelve por su cuenta —no confía en `upcoming_content`, que guarda la del
  sync— y devuelve 404 si no existe. Verificado: *The Fantastic 4* agenda
  `20251105` y no `20250723`; *Superman*, sin fecha digital, da 404; las series
  no cambian.

**Ojo con lo que la mitigación NO hace**: no toca el sync ni la semántica de la
agenda. `upcoming_content` se sigue llenando con fechas de cine, así que una
película puede aparecer en "Próximamente" meses antes de que se pueda ver —
simplemente ya no se puede agendar con la fecha equivocada. Eso es lo que
resuelve este issue.

**Criterio de cierre:** decidir qué fecha representa "Próximamente", medir la
cobertura real de la fecha digital AR en la ventana de ingesta, y aplicar la
decisión en el sync, en la agenda y en el `.ics` a la vez.

---

## #6 — "Próximamente" mezcla estrenos con episodios semanales

**Estado:** abierto · **Prioridad:** media · **Abierto:** 2026-08-15
**Tipo:** decisión de producto · **Familia:** issue #5

### La pregunta

*Star Trek: Strange New Worlds* y *La Patrulla Canina* no son estrenos: son
series al aire con un episodio nuevo. Hoy conviven en el mismo riel con
películas que sí se estrenan. **¿"Próximamente" significa "esto es nuevo" o
"esto tiene episodio esta semana"?**

Son dos listas distintas con dos usos distintos:

- *"Esto es nuevo"* responde **qué empieza**: estrenos de película y de
  temporada. Es una agenda de descubrimiento; se mira una vez por semana.
- *"Esto tiene episodio"* responde **qué sale hoy** de lo que ya sigo. Es
  seguimiento, no descubrimiento; se mira a diario, y sin saber qué mira el
  usuario es ruido.

Mezcladas, la sección no contesta bien ninguna de las dos: un episodio 148 de
*Gran hermano* ocupa el mismo lugar visual que el estreno de una película.

### Datos para decidir

El sync ya distingue `is_season_premiere`, así que separar estreno de temporada
de episodio suelto **no requiere datos nuevos**: la columna está. Medido el
2026-08-15, de 41 filas de `upcoming_content` **41 eran series** y ninguna
película, así que hoy el riel es 100% seguimiento y 0% descubrimiento — que es
exactamente lo contrario de lo que promete el título de la sección.

Ojo con la interacción con el issue #5: si la agenda pasa a mostrar películas
por fecha digital, la mezcla se corrige sola en parte. Conviene decidir los dos
juntos.

### Opciones

- **Dos rieles**: "Estrenos" (películas + estrenos de temporada, vía
  `is_season_premiere`) y "Episodios de esta semana". El costo es más superficie
  en el Home.
- **Un riel, solo estrenos**: los episodios sueltos salen. Lo más simple; el
  costo es que hoy dejaría la sección casi vacía hasta que entren películas.
- **Un riel, con el episodio como dato secundario**: se muestra igual pero la
  card distingue visualmente estreno de episodio.

**Criterio de cierre:** decidir qué pregunta contesta la sección, y si los
episodios semanales merecen su propio lugar o dependen de que el usuario siga la
serie (lo que los ata al módulo de listas del usuario).

---

## #7 — `upcoming_content`: las filas que ya están se quedan viejas

**Estado:** abierto · **Prioridad:** alta · **Abierto:** 2026-08-15

Una fila deja de refrescarse y queda con datos **equivocados**, no solo vencidos.
Medido el 2026-08-15: la tabla decía que *Star Trek: Strange New Worlds* daba
T4 E4 el 13, cuando TMDB ya daba T4 E5 el 20. `updated_at` era del 8, con el
sync habiendo corrido ese mismo día a las 06:00.

Pasa porque el sync solo escribe lo que **descubre**, y el descubrimiento no
garantiza volver a pasar por un título que ya está en la tabla (ver #8).

**Arreglo propuesto:** una pasada de refresco aparte del descubrimiento, que para
cada fila existente vuelva a pedir su `next_episode_to_air` y actualice fecha,
temporada y episodio. Son ~41 llamadas con el volumen actual.

**Lo que este arreglo NO resuelve:** traer títulos que nunca entraron. Eso es #8,
y por eso están separados: si se hacen juntos, se implementa el refresco y se da
el problema por cerrado.

**Criterio de cierre:** ninguna fila de `upcoming_content` con `updated_at`
anterior a la última corrida del sync.

---

## #8 — `upcoming_content`: sesgo permanente hacia lo popular

**Estado: CORREGIDO el 2026-08-31** en `fix/proximamente-sin-popularidad`, sin
mergear al escribir esto · **Abierto:** 2026-08-15

### El arreglo

El descubrimiento **ya no ordena ni corta por popularidad**. Se recorre la
ventana entera hasta `total_pages`, ordenando por fecha, y el filtro de
proveedor argentino se aplica dentro del propio `discover`.

🔴 **Lo que NO cambió, y es la decisión del dueño:** la exigencia de un
`flatrate` confirmado para Argentina se conserva intacta. No se usa
`oficial-probable` para títulos futuros, no se infiere disponibilidad por
`network + homepage`, y no entra nada que TMDB todavía no asocie a un proveedor
argentino. Esto corrige **qué se mira**, no qué califica.

**Por qué el filtro va en el `discover` y no después.** Recorrer la ventana sin
filtrar costaría 95 páginas + 1900 `tvDetails` + 1900 `watch/providers`. Con el
filtro adentro son 13 páginas y 259 títulos. Sólo vale si no pierde nada, así
que se midió contra el camino viejo: de las 36 series que conservaba pierde
**0**, y de un muestreo de la COLA que el código viejo no miraba nunca —páginas
20, 40, 60, 80 y 95— pierde **0** de las 20 con proveedor AR.

⚠️ La lista de proveedores se le pide a TMDB en cada corrida (58 ids de AR), no
se toma de `lib/providers-ar.ts`: el filtro final acepta CUALQUIER `flatrate`
argentino, y usar los 20 ids que Yump mapea dejaría afuera 7 series y 1 película.

### Costo medido (2026-08-31, ventana de 90 días)

| | Antes | Ahora |
|---|---|---|
| Páginas de discover | 6 (3 + 3) | **14** (1 + 13) |
| Llamadas a TMDB | ~186 | **530** |
| Títulos crudos | 120 | 261 |
| Únicos tras dedup | 120 | 255 |
| **Filas escritas** | **36** | **255** |
| Duración | — | **26,7 s** |

Siete veces más agenda por 2,8 veces más llamadas. El filtro final aceptó
**255 de 255**: no rechaza nada porque el `discover` ya filtró, pero no es
redundante — es de donde salen los proveedores de cada fila para el join.

### Limitación residual de la fuente

- **TMDB rechaza `page` por encima de 500.** Es límite de la fuente, no una
  decisión nuestra. Con la ventana actual sobra (13 páginas), pero **ampliar
  `SYNC_WINDOW_DAYS` escala esto de forma lineal**: si alguna vez la ventana
  llegara al tope habría que particionar por fechas, no subir un número.
- **El filtro temprano depende del índice de proveedores del `discover`.** Si
  TMDB atrasa ese índice respecto de `watch/providers`, se perderían títulos. Se
  midieron 56 casos con proveedor AR (36 + 20) y **0 pérdidas**, pero no hay
  forma de descartarlo del todo.
- **Las películas siguen casi vacías, y NO es culpa de la paginación**: de 120
  muestreadas a lo largo de las 130 páginas de la ventana, **0** tenían proveedor
  argentino. La ventana entera tiene 2. Es el catálogo de TMDB, y es el mismo
  agujero del issue #16.

### `tv:310290` sigue AFUERA, y está bien

"Mis muertos tristes" **no se resolvió** y no hay que presentarla como
resuelta. Su popularidad (1.761) ya no la deja afuera —ese corte no existe más—
pero **TMDB no le informa `flatrate` en ninguna región**, así que el filtro que
el dueño decidió conservar la descarta. El día que TMDB publique su proveedor
argentino entra sola, sin tocar una línea. Hay un test que usa sus datos como
fixture para fijar las dos mitades; **no hay ningún id hardcodeado** en el
código productivo.

`collectSeries` descubre con `discover/tv` ordenado por **popularidad** y
`MAX_PAGES = 3`. Medido el 2026-08-15 con la consulta exacta del sync:

```
1696 series elegibles en 85 páginas · el sync mira 3 (= 60)
Star Trek: Strange New Worlds → fuera del top 60
Doctor Who                    → fuera del top 60
```

**Una serie que nunca estuvo en el top 60 no entra nunca**, y la pasada de
refresco de #7 no la va a traer, porque solo refresca lo que ya está.

La consecuencia de fondo es sobre qué ES la tabla: no es "la agenda de
estrenos", es **lo que estaba en el top 60 el día en que se escribió cada fila**.
Las filas son sedimento de días distintos, no una foto coherente, y como el
ranking de popularidad fluctúa a diario, los títulos entran y salen sin patrón.

Es justo lo contrario de lo que se busca en el pipeline de curado, donde el
criterio es la calidad y la cobertura, no la popularidad.

**Lo que NO es el arreglo:** subir `MAX_PAGES` a 85. Serían 1696 llamadas de
detalle por corrida, porque cada serie descubierta necesita su propio
`tvDetails` para el `next_episode_to_air`.

### La SEGUNDA causa, medida el 2026-08-31 — son dos, no una

Arreglar el descubrimiento **no alcanza**, y esto se confirmó siguiendo un caso
concreto (`tv:310290`, "Mis muertos tristes") que no aparecía en la agenda:

1. **Descubrimiento** — lo de arriba. Su popularidad es **1.761** contra un corte
   de **69.99** en la página 3. No entra ni pidiendo la página 50 de 95.
2. **Filtrado** — `sync-upcoming.ts:224`: `if (!provs[j].length) continue`. Un
   título **sin proveedor `AR` en `watch/providers` se descarta**, y éste no
   tiene `flatrate` en ninguna región.

🔴 **La segunda causa es la misma que el issue #16**, y por eso importa: el
catálogo regional de TMDB llega tarde en los estrenos, que es exactamente cuando
la agenda de "Próximamente" tiene que mostrarlos. La resolución de
disponibilidad ya sabe recuperar estos casos con evidencia oficial; **el sync no
la usa**, porque corre en una Edge Function aparte.

**Sigue abierto y no se tocó** — la corrección de disponibilidad del 2026-08-31
no lo alcanza.

**Criterio de cierre:** definir qué debería contener la agenda —¿todo lo que
estrena en las plataformas soportadas? ¿un recorte con criterio?— y que la
pertenencia no dependa del ranking de popularidad del día.

---

## #9 — La popularidad es el orden por defecto en toda la app, sin haberlo decidido

**Estado:** abierto · **Prioridad:** media · **Abierto:** 2026-08-15

`discover()` tiene `sort_by: popularity.desc` como default
([`lib/tmdb.ts:122`](../lib/tmdb.ts)). Cada superficie que no eligió un orden
explícito quedó siendo, sin decidirlo, un listado de lo más popular — y como
además casi todas piden **una sola página**, terminan mostrando el top 20 de un
catálogo de cientos.

Es el mismo patrón que causó los superhéroes en Sci-fi (#ver historial) y el
sesgo de `upcoming_content` (#8). Auditado el 2026-08-15:

| Superficie | Orden | Páginas | Universo real |
|---|---|---|---|
| Carruseles de audiencia (`audienceTitles`) | popularidad (default) | **1** | top 20 por tipo, sin mezcla ni paginado |
| Hero / recomendador (`recommendations`) | popularidad (default) | **1** | 40 enriquecidos → se muestran 6 |
| Chips curados, tramo de relleno | popularidad (default) | **1** | top 20 |
| Rieles de género del Home | popularidad (default) | 3 + mezcla del día | 60 de ~406 |
| Sync de series (`collectSeries`) | popularidad explícita | 3 | 60 de 1696 |
| `/categoria/[slug]` | popularidad (default) | paginado por el usuario | cobertura completa |
| `top:pop:` | popularidad **explícita** | 1 | correcto: la sección ES un ranking |
| `latestReleases` | fecha explícita | 1-2 | correcto |
| Sync de películas (`collectMovies`) | fecha explícita | 3 | correcto para una agenda |

Los dos últimos bloques muestran que el problema no es la popularidad en sí:
donde se eligió un orden a propósito, está bien. El problema es el **default
silencioso**: nadie decidió que "Para toda la familia" fuera un ranking de
popularidad, quedó así porque nadie eligió otra cosa.

### Prioridad: los carruseles de audiencia primero

Por encima de los rieles de género, aunque el bug de los superhéroes se haya
visto ahí antes. La diferencia es que **"Para toda la familia" no cambia nunca**:
es el top 20 de la página 1, sin mezcla diaria y sin paginado, así que muestra lo
mismo hoy que mañana y lo mismo a todos los usuarios con las mismas plataformas.
Los rieles de género, con sus tres páginas y la mezcla del día, al menos barajan
60 títulos y rotan.

Un carrusel que no rota es peor que uno mal ordenado: el usuario que vuelve ve
exactamente la misma pantalla, que es el problema que la app dice resolver.

### Regla de decisión sobre la calidad, escrita ANTES de medir

Rotar el eje de extracción baja el promedio de nota, y eso **no significa que el
Home haya empeorado**: lo de antes eran los 20 más populares, una lista angosta
y por definición bien puntuada. Comparar contra ese promedio castiga cualquier
apertura del catálogo.

Queda fijada así, para no discutirla con el número a la vista:

> **El promedio de nota es orientativo. El guardarraíl es cuánto queda bajo 6.0.**
> Se acepta una caída del promedio mayor al 5 % mientras lo que está bajo 6.0 no
> supere el **8 %** de las tarjetas. Si lo supera, se revisan los ejes — no se
> ajusta el umbral.

**Criterio de cierre:** que `sort_by` deje de tener valor por defecto en
`discover()` y pase a ser un parámetro **obligatorio**. Una convención de "que
cada superficie declare su orden" se olvida en el próximo agregado; un parámetro
requerido no se puede saltear — el compilador obliga a decidir. Y que las
superficies de descubrimiento (audiencia, hero, chips) muestreen de un pool más
profundo en vez del top 20 de la página 1.

---

## #10 — La rotación de ejes no le llega a los chips angostos

**Estado:** abierto · **Prioridad:** baja · **Abierto:** 2026-08-16

El guard de `candidatosConEje` ([`lib/pools.ts`](../lib/pools.ts)) evita que un
eje que no puede llenar deje una superficie vacía, cayendo a `pop` páginas 1-3.
Eso arregla el bug, pero deja una limitación que conviene tener escrita antes de
que alguien lea "cobertura semanal 236" y crea que vale para todo.

### La medición

En la corrida de 16 chips × 7 días (112 casillas), el guard **saltó 18 veces**:
uno de cada seis días de chip termina en `pop`. Y no está repartido parejo — se
concentra siempre en los mismos:

| Superficie | Por qué cae |
|---|---|
| `aliens`, `espacio`, `guerra` | 15-72 títulos por plataforma: `hondo` (página 4) vuelve vacío |
| `scifi/tv`, `fantasia/tv`, `terror/tv` | 4-22 títulos: caen por `hondo` y por `top` |
| `espacio/tv`, `aliens/tv` | 9 y 13 sobre el piso de 300 votos: caen por `top` |

O sea que los chips que **más** necesitarían variedad —porque su catálogo es
chico y se agota rápido— son justamente los que menos rotación reciben. Los días
que caen a `pop` muestran lo mismo que mostrarían sin el mecanismo de ejes.

> **"Cobertura semanal: 236 títulos distintos" vale para el hero base y las
> superficies grandes, no para los chips angostos.** No hay una medición de
> cobertura por chip; si alguien la necesita, hay que hacerla.

### Por qué está bien así por ahora

Un chip que muestra siempre lo mismo es un problema mucho menor que uno que no
muestra nada, y `pop` sobre un catálogo de 19 títulos igual baraja con la semilla
del día. El costo de no hacer nada es bajo.

### Los rieles de género tienen el mismo techo

Al sumar los ejes a los rieles (2026-08-16) apareció el mismo caso, y conviene
tenerlo escrito para que nadie lea una mejora de cobertura y suponga que aplica
a todo el Home:

| riel/tipo | candidatos con el mejor eje |
|---|---|
| `scifi/tv` | **24** (22 con `pop`, 16 con `top`, 0 con `hondo`) |
| `terror/tv` | 53 (0 con `hondo`) |

**`scifi/tv` no puede mejorar su cobertura semanal**: su catálogo entero en
n,d,m son ~22 títulos, y el riel muestra 20. Rote lo que rote, va a mostrar casi
lo mismo todos los días. El guard evita que quede vacío, que es lo único que se
puede hacer sin material.

### Si algún día se ataca

La idea **no** es bajar el piso ni hacer que `hondo` pagine distinto: el material
no existe y ningún ajuste lo va a inventar. La idea es que el respaldo **conserve
algo de rotación** en vez de caer siempre al mismo lado.

Los cinco ejes de hoy se distinguen por dos cosas: **profundidad** (`hondo`
arranca en la página 4) y **selectividad** (`top` pide 300 votos). Las dos
fallan por lo mismo en un catálogo chico. Lo que sí sobrevive ahí son los ejes
que solo cambian el **orden** sobre el mismo conjunto: `taquilla`
(`revenue.desc` / `vote_count.desc`) y `nuevo` (por fecha) andan con 19 títulos
igual que con 5000, porque reordenan en vez de recortar.

Entonces el respaldo no debería ser `pop` fijo sino **el eje del día entre los
que no dependen de profundidad**, y solo caer a `pop` si tampoco eso llena. Con
eso un chip angosto seguiría rotando entre tres criterios en vez de quedarse
clavado en uno.

**Criterio de cierre:** que las 18 casillas degradadas de la semana bajen, y que
ninguna quede vacía (o sea, sin perder lo que arregló el guard). La medición ya
está: `medir-hero.mjs chips`, contando los `[ejes] ... se cae a` del log.


---

## #11 — "Últimos lanzamientos" tiene 35% de títulos bajo 6.0

**Estado:** abierto · **Prioridad:** baja · **Abierto:** 2026-08-16

Medido al fotografiar el Home antes de rotar los ejes de los rieles
(`docs/medidas/2026-08-16-rieles-antes.json`): de los 20 títulos del riel,
**el 35% tiene nota TMDB menor a 6.0** — con diferencia el peor del Home. El
segundo es Terror con 20%, y el resto está entre 0% y 15%.

No es un bug ni una regresión: es consecuencia directa de una decisión tomada a
propósito. `latestReleases` pide `minVotes: 0` **explícito** (ver el comentario
en `lib/enrich.ts`) porque exigir votos dejaba fuera los estrenos hasta que
juntaran unos cuantos, o sea días. El criterio pasó a ser "ficha completa"
(póster + sinopsis). El costo es este: un estreno con 12 votos y nota 4,8 entra.

**Lo que NO hay que hacer:** ponerle un piso de nota. Ver el principio en
`CLAUDE.md` — el puntaje de TMDB no se usa como filtro de exclusión en esta app,
y menos en el riel de estrenos, donde la nota temprana es ruido estadístico
(veinte votos no dicen nada) y además llegaría sesgada al cine local.

Direcciones posibles, ninguna evaluada todavía:

- Ordenar dentro del riel para que lo malo no encabece, sin sacarlo.
- Un piso de votos bajo (5-10) en vez de 0, que saca lo que literalmente nadie
  vio sin esperar a que junte 60.
- Aceptarlo: es el riel de novedades, y las novedades son irregulares.

**Criterio de cierre:** que se decida cuál de las tres, con el número medido
antes y después. Hoy el número existe (35%) y la decisión no.


---

## #12 — El piso de 60 votos de `discover()` excluye cine regional en toda la app

**Estado:** abierto · **Prioridad:** alta · **Abierto:** 2026-08-17
**No tocar todavía:** el dueño quiere decidirlo viendo qué aparece si se saca.

`discover()` tiene `"vote_count.gte": String(o.minVotes ?? 60)`
([`lib/tmdb.ts`](../lib/tmdb.ts)). **Toda superficie que no pise `minVotes`
hereda ese 60**, y nadie lo decidió por superficie: es un default silencioso,
igual que el `sort_by: popularity.desc` del **issue #9**. Los dos salieron de la
misma línea de código y del mismo descuido.

Es el único piso de la app que va **en contra** de lo que el producto busca. La
app es un agregador argentino y esto saca, sin avisar, buena parte del cine
argentino y latinoamericano: una película local con 40 votos en TMDB no existe
para ninguna de las superficies de abajo, aunque esté en Netflix AR.

### Quiénes lo heredan (sin decidirlo)

| Superficie | Vía |
|---|---|
| `/categoria/[slug]` y los modos de navegación del buscador | `/api/discover` → `listByCategory` sin `minVotes` |
| Recomendador, ruta angosta (`reales`, `supervivencia`) | `listByCategory` sin `minVotes` |
| Relleno de los chips curados cuando no llegan al piso | `listByCategory` sin `minVotes` |

### Quiénes NO lo heredan (lo declaran)

| Superficie | Piso | Por qué |
|---|---|---|
| `latestReleases` | **0** explícito | un estreno no juntó votos todavía |
| eje `nuevo` | 10 | mismo motivo, más laxo |
| ejes `pop`, `taquilla`, `hondo` | 60 explícito | mismo valor, pero elegido |
| eje `top` | 300 | medido: con 60 el ranking se llena de nicho |
| `genreCovers()` | 300 | elegir UN póster representativo |
| `lib/top.ts` | 60 explícito | medido contra Netflix AR |

`supabase/functions/tmdb-sync` tiene su propia implementación de `discover` (es
una edge function de Deno, aparte) y no comparte este default. Hay que revisarla
por separado.

### Lo que NO es la solución

Bajar el piso a un número más chico elegido a ojo. Y **jamás** reemplazarlo por
un piso de nota: ver el principio en `CLAUDE.md` — el puntaje de TMDB no se usa
nunca para excluir títulos en esta app, solo para medir.

### Cómo decidirlo

Medir qué APARECE con el piso en 0, no razonar sobre qué debería aparecer. Las
preguntas: cuántos títulos nuevos entran por superficie, qué proporción son cine
regional, y cuánto ruido real (títulos sin traducir, sin sinopsis, sin póster)
se cuela. `latestReleases` ya resolvió ese ruido sin votos, con
`soloCompletos` (póster + sinopsis), y ese es el camino a evaluar primero.

**Criterio de cierre:** que `minVotes` sea una decisión explícita por superficie
—idealmente un parámetro obligatorio, como propone #9 para `sort_by`— y que el
número de cada una salga de una medición y no del default.

---

## #13 — El cron semanal del Top 10 de Netflix nunca disparó

**Detectado el 2026-08-25, reportado por el dueño**: "el Top 10 de Netflix me
trae lo más popular; hasta hace dos días estaba bien".

**No es un bug del código: es que dejaron de entrar datos.** `latestWeekRows()`
devuelve `null` si la semana guardada tiene más de `SEMANA_VIEJA_MS` (14 días), y
el bloque cae a popularidad. Esa guarda es deliberada — no sostener datos viejos
bajo el sello "dato oficial" — e hizo exactamente lo que tenía que hacer.

| | |
|---|---|
| Última semana guardada | **2026-08-09**, escrita el 2026-08-12 18:10 UTC |
| Antigüedad al detectarlo | **16,4 días** (cruzó los 14 hace ~2,4) |
| Última semana publicada por Netflix | **2026-08-16**, disponible desde el ~18/08 |

### La causa raíz

El cron es `0 12 * * 2` (martes 12:00 UTC), pero las dos escrituras que existen
en la tabla son **fuera de horario**:

- semana `2026-08-02` → **domingo** 09/08, 17:27 UTC
- semana `2026-08-09` → **miércoles** 12/08, 18:10 UTC

Ninguna coincide con un martes al mediodía. **Las dos ingestas fueron manuales**:
el cron de Vercel no disparó nunca. La guarda de 14 días lo tapó durante dos
semanas — mientras el dato aguantó, nadie se enteró.

**Sospecha sin confirmar**: el scope de Vercel se llama
`jfgalindez-gmailcom's projects`, que es el nombre de un plan Hobby, y ahí los
cron jobs tienen límites. **No está verificado** y hay que mirarlo en
Vercel → Settings → Cron Jobs, donde se ve si el cron está registrado y sus
últimas ejecuciones. No dar por sentado cómo se comporta la plataforma: es el
tipo de suposición que ya mordió en este proyecto.

### Lo que NO es

- **No tiene relación con el cambio de idioma a es-MX.** `latestWeekRows` no toca
  claves de caché ni idioma. La coincidencia de fechas es casual.
- **La interfaz no miente.** El copy es
  `source === "netflix" ? "Lo más visto esta semana · dato oficial" : "Lo más popular ahora"`,
  así que mientras sirve popularidad lo dice. Degradó con honestidad, y por eso
  se pudo detectar mirando la pantalla.

### Cómo se arregla

Dos cosas separadas:

1. **Recuperar la semana que falta**: una llamada a `/api/cron/netflix-top10`
   con el `CRON_SECRET`. Es un upsert idempotente de 20 filas.
2. **Arreglar el cron**, que es el problema de fondo. Sin eso, el bloque vuelve a
   caer a popularidad en 14 días.

### Lo que este issue enseña, más allá del cron

**Una guarda que degrada en silencio esconde la falla que la disparó.** El bloque
se venía degradando bien, pero nada avisaba que hacía dos semanas que no entraba
un dato. Vale la pena un chequeo de frescura visible —en `/api/health`, por
ejemplo— para las fuentes que dependen de un cron.

### Desenlace parcial — 2026-08-25

**El cron disparó.** La semana `2026-08-16` entró el **martes 2026-08-25 a las
12:58 UTC**: el día que corresponde y dentro de la hora de su `0 12 * * 2`, que
es el margen con el que Vercel dispara los cron. Es la primera escritura de esta
tabla que parece automática. El bloque de Netflix volvió a "dato oficial".

**Lo que sigue sin explicación**: esa semana tendría que haber entrado el martes
**2026-08-18**, no siete días después. O el cron no disparó ese día o disparó y
falló, y desde acá no hay forma de distinguirlo — hay que mirar los logs de
Vercel.

**Y la fragilidad de fondo no se movió**: la guarda mide la antigüedad desde la
FECHA DE LA SEMANA, no desde la ingesta. La semana que tenemos hoy ya nació con
9 días encima, así que **una sola corrida perdida vuelve a degradar el bloque**.
Verificado de paso que no hay un desfase sistemático: el TSV de Netflix todavía
publica `2026-08-16` como su semana más nueva, así que la corrida de hoy se
llevó lo más fresco que había.

### Volvió a vencer — 2026-08-30

Comprobado en la base, no deducido:

| semana | primera escritura | filas |
|---|---|--:|
| `2026-08-16` | **2026-08-25 12:58:03 UTC** (martes) | 20 |
| `2026-08-09` | 2026-08-12 18:10 UTC | 20 |
| `2026-08-02` | 2026-08-09 17:27 UTC | 20 |

**El cron corrió el 25/08 y entró en horario.** La semana `2026-08-16` es la más
nueva que hay, y hoy tiene **exactamente 14 días**: la guarda mide desde `week`,
no desde la ingesta, así que **la evidencia venció otra vez** — por horas.

⚠️ **`week` es la semana del RANKING, no cuándo corrió la ingesta.** Que la fila
diga `2026-08-16` no prueba que hayan faltado corridas: la del 25/08 existe y
está fechada. Una versión anterior de esta nota afirmaba que faltaban las
corridas del 18 y del 25, y **era falso** — salía de leer `week` como si fuera la
fecha de ejecución.

**Consecuencia hoy:** ningún título recibe el respaldo del top oficial, así que
`/api/title/tv/322428` (Moria) devuelve `[]`. **Moria no está resuelta
actualmente**, y no lo está en `main` tampoco: la regla de ventana no cambió.
Esto NO lo arregla la rama `fix/disponibilidad-oficial` y no se intentó ahí — es
este issue, que sigue abierto.

Lo que hay que decidir acá (no en la rama de disponibilidad): si la guarda debe
medir desde `week` o desde `updated_at`. Medir desde `week` es lo honesto para el
rótulo "dato oficial" —el ranking es viejo aunque lo hayamos bajado hoy— pero
condena al bloque a degradarse cada dos semanas mientras Netflix publique con 9
días de retraso.


---

## #14 — El avatar propio parpadea en cada carga

**Estado:** abierto, **POSTERGADO** · **Prioridad:** baja · **Abierto:** 2026-08-27

> **Postergado el 29/08/2026, por decisión del dueño.** Antes figuraba como
> "se arregla antes del empaquetado nativo". **Ya no**: no bloquea el prototipo
> Android, ni la adaptación de la capa web, ni la publicación en Play. Se retoma
> cuando el dueño lo pida. Ver `docs/CAPACITOR.md` §0.a, decisión 8.

**NO es una regresión de la tanda de avatares**, y eso decide cuándo se arregla:
el código anterior tenía exactamente el mismo parpadeo, con otro dibujo.

### Qué se ve

Al cargar cualquier pantalla con el avatar propio —la barra de abajo, el hub de
`/cuenta`, `/cuenta/perfil`— se ve **un avatar que no es el tuyo durante un
instante**, y después aparece el correcto. Reportado por el dueño en la
verificación manual del 27/08, recargando después de guardar.

### Causa

`profile` viaja en `null` hasta que la sesión resuelve, y los tres componentes
pintan igual:

```tsx
<Avatar perfil={profile} … />
```

Con `null`, `resolverAvatar` devuelve `AVATAR_POR_DEFECTO` — que es lo correcto
para esa función, porque siempre tiene que devolver un avatar del catálogo. El
problema no es la resolución: es **pedirle una respuesta antes de tener el
dato**.

**El código anterior hacía lo mismo**: `getAvatarUrl(undefined)` caía al estilo
y la semilla por defecto y pintaba un DiceBear fijo. Cambió el dibujo del
parpadeo, no el parpadeo.

### Por qué no se arregló en `feat/avatares-propios`

Decisión del dueño, 27/08: **se resuelve en una rama aparte**, después de
desplegar los avatares. *(El "y antes del empaquetado nativo" que decía acá se
levantó el 29/08: ver el encabezado de este issue.)* Meter un cambio en la
nav y en el hub adentro de una rama que ya estaba verificada a mano habría
obligado a repetir la verificación entera por algo que ya estaba pasando en
producción.

### Criterio de cierre

`AuthContext` ya expone `ready`. Mientras sea `false`, los tres puntos que
muestran el avatar propio no tienen que resolver ninguno: va un hueco neutro del
mismo tamaño —para no mover el layout, que sería cambiar un parpadeo por un
salto— y recién con `ready` en `true` se pinta el avatar.

**Cerrado cuando**: recargando `/cuenta`, `/cuenta/perfil` y cualquier pantalla
con la barra de abajo, **no aparece ningún avatar que no sea el del perfil**, y
el CLS no empeora.

**Ojo con el alcance**: son tres llamadores (`AvatarPicker`, `BottomNav`,
`UserHub`). El componente `Avatar` y `resolverAvatar` **no se tocan** — su
contrato de devolver siempre uno del catálogo es correcto y hay tests que lo
fijan.


---

## #15 — Selector de avatares: círculos vacíos (corregido) y una demora aislada (aceptada)

**Estado:** el bug, **corregido**. La demora, **limitación aceptada** por decisión
del dueño · **Abierto:** 2026-08-27 · Reportado sobre Producción

### El bug: círculos vacíos — CORREGIDO

Al abrir "Elegí tu avatar" aparecían uno o varios círculos **vacíos**, y al
cerrar y volver a abrir eran **otros**.

**Causa: no eran archivos que faltaran ni peticiones que fallaran. Eran imágenes
que nunca se pedían.** Los tres estados de un `<img>` lo separan:

| Estado | `complete` | `naturalWidth` |
|---|---|---|
| carga diferida no iniciada | `false` | 0 |
| petición fallida | `true` | 0 |
| petición correcta | `true` | >0 |

Medido en un banco que replica el DOM y el CSS del modal, con los WebP reales de
Producción:

```
lazy   (como estaba):   10/31 OK · 21 SIN INICIAR (complete=false) · 0 fallos
eager  (la corrección): 31/31 OK · 31 peticiones                   · 0 fallos
```

Las 21 vacías eran **exactamente** las 21 con `loading="lazy"`
(`ANSIOSAS = 10`), en cinco aperturas seguidas. `avatar-moon.webp` responde
`200 image/webp`, así que el archivo nunca fue el problema.
`CastRail.tsx` ya documentaba lo mismo en rieles y modales: fue la segunda vez.

**La corrección:** las 31 se piden al montar el modal —no antes: entra por
`next/dynamic`—, y la prop `lazy` de `Avatar` se eliminó entera para que no
vuelva por descuido. Como defensa se agregó **un** reintento acotado con marca
fija en la URL y, si tampoco carga, un respaldo visible en lugar del hueco
(`lib/reintento-imagen.ts`, con tests).

**Verificado por el dueño en el Preview: diez aperturas, cero círculos vacíos.**

### La demora aislada — LIMITACIÓN ACEPTADA, no se sigue investigando

En esas mismas diez aperturas, **dos** mostraron una demora: en una, tres
avatares tardaron ~6 s en aparecer; en otra, uno tardó ~4 s. **Sin throttling y
con caché caliente.**

**No hay causa demostrada, y no se afirma ninguna.** Se descartó explícitamente
la explicación fácil: con los recursos ya pedidos, el peso de la primera descarga
**no** explica una demora que aparece en la sexta apertura. Una medición previa
que decía *"segunda apertura: 0 ms"* se tomó en un banco con la pestaña oculta y
**no describe el comportamiento real** — queda retirada.

Quedaron cinco hipótesis sin separar: red o CDN, lectura del service worker,
decodificación por exceso de resolución, planificación del navegador, y fallo de
transporte.

**Decisión del dueño, 27/08: no se sigue investigando ahora, y esto no bloquea el
merge.** El bug reportado —círculos permanentemente vacíos— está corregido y
verificado; lo que queda es una demora ocasional que no deja la interfaz rota.

**Si se retoma**, lo que haría falta es una traza por imagen de una apertura
lenta: instante de creación del `<img>`, `load`/`error`, `complete`,
`naturalWidth`, duración del recurso, los tres tamaños, `workerStart` y el tiempo
de `decode()` — con las **duraciones** separadas de los instantes, porque el
tiempo humano hasta el clic contamina cualquier instante medido desde el inicio.
Y el candidato más barato de probar sería servir en la grilla una variante de
160 px en vez de los 512 px actuales, conservando los 512 para los usos
individuales.

### Lo que NO se tocó, a propósito

- **`cacheFirst` del service worker.** Su falta de timeout es un problema real y
  **general** —afecta chunks, íconos y todo lo demás— y sigue en el **issue #3**,
  apartado b, que es donde corresponde decidirlo con una traza de red real.
- **`next/image`.** No corresponde: los archivos ya vienen en el tamaño y el
  formato correctos.
- **Variantes reducidas.** No se generaron: sin saber la capa responsable habrían
  sido una apuesta.

### Ojo: NO confundir con el issue #14

| | #14 | #15 |
|---|---|---|
| Qué se ve | **un** avatar equivocado, un instante, al cargar la página | círculos vacíos dentro del selector |
| Dónde | nav, hub, perfil | sólo el selector |
| Causa | `profile` en `null` mientras resuelve la sesión | `loading="lazy"` |
| ¿Regresión de la tanda de avatares? | **no**, el código anterior hacía lo mismo | **sí**, la introdujo `ANSIOSAS` |

### Criterio de cierre

El del bug **ya se cumplió**: 31 botones, 31 imágenes con `complete === true` y
`naturalWidth > 0`, sin errores en consola ni peticiones a terceros, en diez
aperturas.

Este issue queda abierto **sólo** por la demora, y se cierra el día que se
midan diez aperturas calientes seguidas sin que ninguna imagen pase de un
segundo — o el día que se decida que no vale la pena y se borre.

## #16 — TMDB no publica el catálogo regional completo, y no hay forma de saber cuánto falta

**Estado: MITIGADO, NO RESUELTO.** Integrado desde
`fix/disponibilidad-oficial` (prueba manual aprobada por el dueño el
2026-08-30). Ver `docs/medidas/2026-08-30-disponibilidad-informe.md`.

⚠️ **Mitigado no es cerrado, y la diferencia importa acá.** De los 11 títulos sin
proveedor `AR` de la muestra, la resolución recupera **4**. Los otros 7 siguen
sin aparecer como disponibles, y ninguna medición dice cuántos títulos más
faltan fuera de la red que se midió. Este issue **queda abierto**.

**Actualización 2026-08-31 (`feat/evidencia-oficial`, prueba manual aprobada).**
La regla se generalizó a **seis plataformas en series y cuatro en películas**,
con criterio de **cobertura sobre certeza** por decisión del dueño. Medido contra
verdad de campo: **144 + 22 aciertos, cero falsos positivos**. El punto 1 de "lo
que sigue abierto" quedó resuelto; **los puntos 2 y 3 no**, y el issue **sigue
abierto** por el 2: no hay forma de medir el agujero completo.

Medido el 2026-08-30 sobre la red Disney+, 60 días de estrenos: **11 de 15
series no tenían proveedor `AR`** en `watch/providers`, incluida una que
JustWatch mostraba como #1 del país (`tv:275224`). La resolución centralizada
recupera **4 de esas 11** con evidencia oficial estricta; las otras 7 no tienen
enlace oficial, o lo tienen de otra región o de otro dominio, y **no se
fuerzan**.

**Lo que sigue abierto:**

1. ~~**Sólo Disney+ está habilitada** para la regla de enlace oficial.~~
   **RESUELTO el 2026-08-31**: seis plataformas en series (Netflix, Disney+,
   Prime Video, Max, Paramount+, Apple TV+) y cuatro en películas. Cada
   combinación de red, dominio, ruta e ids globales se midió antes de entrar, y
   un test falla si se agrega una sin actualizar el número.
2. **No se puede medir el agujero completo.** Sabemos cuántas series de una red
   conocida no tienen dato regional; no sabemos cuántos títulos faltan de redes
   que ni siquiera consultamos.
3. **El suplemento por redes tiene ventana fija.** El catálogo regional sí
   pagina indefinidamente, pero los candidatos que llegan por red salen de una
   ventana acotada: un título de red más viejo que esa ventana no aparece.

**Lo que NO es una salida:** usar `networks` sola, o el `homepage` solo. Las dos
producen afirmaciones falsas y hay tests que las rechazan.
