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

**Ojo con lo que la mitigación NO hace**: cuando el botón sí aparece, el `.ics`
sigue llevando la fecha vieja. Se limitó a esconder el botón donde no se puede
validar, no a corregir la fecha — eso es parte de resolver el issue.

**Criterio de cierre:** decidir qué fecha representa "Próximamente", medir la
cobertura real de la fecha digital AR en la ventana de ingesta, y aplicar la
decisión en el sync, en la agenda y en el `.ics` a la vez.
