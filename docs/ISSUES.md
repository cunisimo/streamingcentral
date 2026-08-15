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

**Estado:** abierto · **Prioridad:** media · **Abierto:** 2026-08-15

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
