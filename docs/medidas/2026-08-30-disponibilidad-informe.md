# Disponibilidad oficial — medición del 2026-08-30

Datos crudos: `2026-08-30-disponibilidad-disney.json`
(generado con `node scripts/medir-disponibilidad.mjs muestra`).

## Diagnóstico, reproducido antes de tocar código

`node scripts/medir-disponibilidad.mjs caso`, contra TMDB en vivo:

| Dato | Valor |
|---|---|
| Título | Gutiérrez Is mai neim (`tv:275224`) |
| `first_air_date` | `2026-08-26` (hoy AR: `2026-08-30`) |
| `networks` | Disney+ (`2739`) |
| `homepage` | `https://www.disneyplus.com/browse/entity-bafb5cb7-…` |
| `watch/providers` | **3 regiones: ID, MY, US. Sin `AR`.** |
| `discover` por proveedor Disney+/AR | 1152 resultados, **no lo trae** |
| `discover` con `with_networks=2739` | 440 resultados, **sí lo trae** |

**No es cache: el dato regional no existe en TMDB.**

### El parámetro que rompía la consulta por red

Medido sobre `with_networks=2739`, misma consulta salvo un parámetro:

| Consulta | Resultados | ¿Trae el caso testigo? |
|---|--:|---|
| red + `watch_region=AR` + `with_watch_monetization_types=flatrate` | 304 | **no** |
| red + `watch_region=AR`, sin monetización | 440 | **sí** |
| red sola | 440 | **sí** |

El que estorba es **`with_watch_monetization_types`**, no `watch_region`: filtra a
lo que TMDB ya sabe que está en flatrate argentino, que es justo el dato que
falta. De ahí sale la opción `sinMonetizacion` de `lib/tmdb.ts`.

## Muestra: red Disney+, estrenos de 60 días (2026-07-01 → 2026-08-30)

| | Cantidad |
|---|--:|
| Candidatos por red | **15** |
| Con proveedor `AR` en TMDB | **4** |
| **Sin** proveedor `AR` | **11** |
| …de ésos, con `homepage` de `disneyplus.com` | **5** |

Reproduce exactamente los números reportados (15 / 11 / 5).

### Qué pasa con los 11 sin `AR`, uno por uno

| Título | Resultado | Por qué |
|---|---|---|
| `tv:275224` Gutiérrez Is mai neim | ✅ **`d`** | red + enlace de entidad + estrenada + US/ID/MY corroboran |
| `tv:331877` Disney+ Hulu Throwbacks Podcast | ✅ `d` | ídem; las redes extra (YouTube, Hulu) no son plataformas soportadas y no crean ambigüedad |
| `tv:330160` 머더클럽 | ✅ `d` | ídem; `IN:JioHotstar` no contradice porque 15 regiones sí tienen Disney+ |
| `tv:328337` Bluey Compilados | ✅ `d` | sin datos en ninguna región: no hay contradicción |
| `tv:325313` Olivia | ❌ | **`/es-es/`**: URL explícita de España |
| `tv:332379` Countdown to Avengers | ❌ | `marvel.com`: no es el dominio de la plataforma |
| `tv:330292` 20/20 Britain's Most Notorious | ❌ | `hulu.com`: Hulu no se ofrece en AR |
| `tv:331370` วารี ๑๐๐ ศพ | ❌ | sin `homepage`: la red sola no alcanza |
| `tv:333146` Pod Meets World | ❌ | sin `homepage` |
| `tv:329903` Mickey Mouse Clubhouse+ | ❌ | sin `homepage` |
| `tv:317374` Locker Diaries: Descendants | ❌ | sin `homepage` |

**4 de 11 recuperados.** Los 7 que quedan afuera es porque la evidencia no
alcanza, no porque falle el mecanismo: 4 no tienen enlace oficial, 1 lo tiene de
otra región y 2 lo tienen de otro dominio. **Ninguno se fuerza.**

## Antes / después, verificado sobre el build local

| Comprobación | Antes | Después |
|---|---|---|
| `/api/title/tv/275224` → `platforms` | `[]` | **`["d"]`** (procedencia `enlace-oficial`) |
| `/api/title/tv/275224` → `watchLink` | `null` | `null` — **no se inventa** |
| `/api/latest?tipo=tv&providers=d` | no lo incluye | **lo incluye, primero por fecha** |
| Ídem con `providers=n` (sin Disney+) | — | **no aparece** |
| `movie:278`, `movie:238`, `tv:1396` | `n,m` / `pp,mv` / `n` | **idénticos** |
| `tv:284753` Operation Safed Sagar | `["n"]` desde TMDB | **`["n"]`, igual** |
| Riel `ultimos` del Home | sin selector | `typeToggle: refetch`, `shelfKey: ultimos`, `activeType` |
| Home con `t=ultimos:tv` | — | 20 items, todos `tv`, con el caso testigo |
| Rieles vacíos · `degradado` · `fallos` | — | **ninguno · false · 0** |

En una corrida completa del Home + listas, **7 títulos** se resolvieron por
`enlace-oficial`, **todos a `d`**. Ninguno por `manual` (el registro está vacío).

## Costo — corregido tras la revisión

### La secuencia que importa: página 1 fría → primera página 2 → repetición

La primera versión metía `page` en la clave pero **cada MISS rearmaba la ventana
entera**, así que "se paga una vez por día y combinación" era falso: se pagaba
una vez por cada página pedida. Ahora cada tramo se cachea por separado —una
clave por página regional, una para el suplemento por redes— y la mezcla es en
memoria.

Medido con `providers=n` (Netflix, sin red oficial habilitada), servidor recién
levantado, cache en memoria:

| Pedido | Tiempo | Qué costó |
|---|--:|---|
| p1 fría | **1586 ms** | 1 discover regional + enriquecido de esa página |
| **p2 primera vez** | **806 ms** | **sólo la página regional 2**; la 1 ya estaba |
| p2 repetida | **420 ms** | todo HIT: sólo lectura y mezcla |
| p3 primera vez | 783 ms | ídem: una página más |
| p5 primera vez | 3393 ms | las páginas 4 y 5, que faltaban |

Con `providers=d` (Disney+, con suplemento por red) la página 1 fría cuesta
además las 3 páginas de `with_networks`, que se cachean una sola vez por día y
combinación y se reusan en todas las páginas.

**Lo que esto corrige:** antes, la primera página 2 repetía las 3 páginas
regionales, las 3 por red y ~120 enriquecidos. Ahora cuesta **una página**.

### Home

| Escenario | Tiempo | Comandos | Claves (hit/miss) |
|---|--:|--:|--:|
| Frío (default, `movie`) | 5586 ms | 664 | 649 (24 / 625) |
| Cambio de toggle a `ultimos:tv` | 1196 ms | 39 | 683 (673 / 10) |
| Segunda vez, misma consulta | **0 ms** | **1** | **1 (1 / 0)** |

**Costo de la resolución**: **cero** para los títulos que TMDB ya ubica —
`disponibilidadDe` corta antes de tocar el cache, y ahora corta también cuando
TMDB informa un flatrate argentino que Yump no mapea.

## Bytes: por qué `pv2:` NO guarda el mapa por región

Medido sobre 20 títulos reales (los más populares de AR en flatrate), que traen
**91,7 regiones en promedio**:

| Representación | B/título | vs. antes | Home frío (~230 títulos) |
|---|--:|--:|--:|
| `pv:` (antes) | **214** | — | 48,0 KB |
| `pv2:` con mapa por región | **1273** | **+495%** | **286,0 KB** (+238 KB) |
| `pv2:` con ids únicos | **296** | **+38%** | **66,4 KB** (+18 KB) |

**Se eligió la representación compacta.** El mapa por región costaba **6× el
valor original** y no compraba nada: `hayContradiccion` sólo deriva dos
booleanos —si hay algún dato regional y si alguno es de esta plataforma— y los
dos salen del conjunto plano de ids de las regiones que no son AR.

⚠️ **Lo que se pierde, dicho explícito:** ya no se sabe QUÉ región dice qué. Si
alguna regla futura lo necesita, hay que volver al mapa **y subir la versión de
la clave**, porque desde el conjunto plano no se reconstruye.

El tamaño de respuesta de `/api/home` **no cambia**: `porRegion`/
`idsOtrasRegiones` viven en el cache de `pv2:` y nunca viajan en el payload —
`UITitle` sólo lleva `platforms`.

## Paginación — sin truncamiento

La primera versión mezclaba **3 páginas fijas por fuente y terminaba ahí**: con
Netflix, Max o Prime la página 4 salía vacía aunque TMDB tuviera cientos de
resultados. Era una **regresión** contra la lista paginada anterior. Se sacó: el
catálogo regional se pagina de verdad y lo único acotado es el suplemento por
redes, que por naturaleza son un puñado de estrenos recientes.

Verificado contra el build local, `providers=n`, páginas 1 a 6:

| | |
|---|--:|
| Títulos servidos | **120** |
| Únicos | **120** |
| Repetidos | **0** |
| Páginas cortas | **0** |

Y en los tests: 137 títulos regionales servidos completos en 7 páginas, las
páginas 1–5 reproducen exactamente la clasificación completa, una plataforma sin
red oficial pagina igual, Disney+ mezcla las dos fuentes a lo largo de 8 páginas
sin perder ninguno de los extras, y una página posterior al final vuelve
realmente vacía con `hayMas: false`.

## 🔴 Lo que esta medición NO pudo verificar

**El respaldo oficial de Netflix no se pudo ejercitar en vivo hoy.** La semana
más nueva de `netflix_top10` es **2026-08-16**, exactamente **14 días** atrás, y
la ventana de evidencia son 14 días: la de Moria venció por horas. Por eso
`/api/title/tv/322428` devuelve `[]` hoy — **en `main` también**, porque la regla
de ventana no se tocó.

No es una regresión de este cambio y está cubierto por tests (23 casos en
`lib/top-plataformas.test.ts`, ahora apuntados al resolvedor central).

⚠️ **Corrección a una versión anterior de este informe.** Decía que "faltaban
las corridas del 18 y del 25 de agosto". **Era falso**: salía de leer `week` como
si fuera la fecha de ejecución. Comprobado en la base, la semana `2026-08-16` se
escribió el **martes 2026-08-25 a las 12:58 UTC** — el cron corrió y entró en
horario. `week` identifica la semana del RANKING, no cuándo corrió la ingesta.

Lo que sí pasa es que la guarda mide 14 días **desde `week`**, y Netflix publica
con ~9 días de retraso: el ranking nace viejo y vence a los pocos días. Es el
issue **#13**, que ya existía, y **no se toca en esta rama**.
