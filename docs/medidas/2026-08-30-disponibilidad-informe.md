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

Medido con `providers=n` (Netflix, sin suplemento por red), servidor recién
levantado, cache en memoria, **después del rediseño de la paginación**:

| Pedido | Tiempo | Qué costó |
|---|--:|---|
| p1 fría | **3390 ms** | 1 página regional + su enriquecido |
| **p2 primera vez** | **588 ms** | **sólo la página regional 2** |
| p2 repetida | **266 ms** | todo HIT: lectura y mezcla |
| p3 primera vez | 590 ms | una página más |
| **p13 primera vez** | **10093 ms** | las 12 páginas que faltaban, de una |

**La página 13 devuelve sus 20 títulos.** Antes volvía vacía: primero por la
ventana de 3 páginas y después por el tope de 12. Cuesta 10 s la primera vez
porque trae doce páginas nuevas de golpe; cada una queda cacheada por separado,
así que las páginas intermedias que se pidan después ya están.

**Integridad, contra TMDB real:** páginas 1 a 6 con `n` y con `d` → **120
títulos, 120 únicos, 0 repetidos** en las dos, y el caso testigo presente en
`d`.

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

## Paginación — sin ventana fija, y estable entre pedidos

Hubo **dos** intentos fallidos antes de éste:

1. Mezclar 3 páginas por fuente y terminar ahí. La página 4 salía vacía.
2. Un tope de `ULTIMOS_MAX_PAGINAS = 12` "de seguridad". Era lo mismo con otro
   nombre: la página 13 no podía juntar 260 resultados.

**Ahora el único límite es `total_pages` de TMDB.** Una página enriquecida que
queda vacía —porque el filtrado se la llevó entera— no corta el bucle si la
fuente declara páginas posteriores.

### El bug de estabilidad, que era más sutil

La página pedida se clasificaba sobre una ventana **creciente**: la 1 con una
página regional y la 2 con dos. Al ordenar todo por `(fecha, id desc)`, un
título de la segunda página **empatado en fecha con el borde** y con id más alto
se colaba ANTES del borde, lo empujaba a la página siguiente y producía un
repetido y un salteo.

Se arregló con dos reglas:

- **El orden regional es el de TMDB**, estabilizado. Una página nueva sólo puede
  agregar al final, nunca insertarse en el medio.
- **Un extra por red entra sólo cuando el stream regional ya pasó su fecha.**
  Antes de eso su posición no está decidida —una página regional posterior puede
  traer títulos más nuevos que él y correrlo—, así que se retiene. Al agotarse
  TMDB entran todos los que queden.

### Verificado

| Prueba | Resultado |
|---|---|
| 300 resultados regionales, página **13** | **20 títulos** |
| Empate en el borde entre p1 y p2 | 40 títulos, **0 repetidos**, el borde de p1 no se movió |
| Concatenar 7 páginas vs. clasificación completa | **idénticas** (137 títulos) |
| Página enriquecida vacía en el medio | **no corta**: pide la siguiente |
| Agotamiento real de TMDB | corta, y no pide páginas inexistentes |
| Página después del final | **vacía**, `hayMas: false` |
| Extra viejo a lo largo de 6 páginas | aparece **una sola vez** |
| Pedir p2 dos veces | **no vuelve a pedir** a la fuente |
| En vivo, `n` y `d`, páginas 1-6 | 120 títulos, 120 únicos, **0 repetidos** |

⚠️ **No se afirma "paginación indefinida"**: se pagina hasta donde llega
`total_pages` de TMDB, que es el límite de la fuente, no nuestro. El suplemento
por redes sigue acotado a 3 páginas y eso es deliberado — es un suplemento de
estrenos recientes, no la lista.

## Guardas de entrada y contrato de `page`

Dos agujeros que quedaban después del rediseño de la paginación, medidos contra
el build local **antes y después**:

| Entrada | Antes | Después |
|---|--:|--:|
| `providers=` (ninguna) | **88.440 ms**, 0 ítems | **671 ms**, 0 ítems |
| `providers=zz` (código inválido) | recorría el catálogo | **330 ms**, 0 ítems |
| `page=x` (`NaN`) | **74.790 ms**, **0 ítems** | **2389 ms**, **20 ítems** (página 1) |
| `page=0` | 0 ítems | **328 ms**, 20 ítems |
| `page=9999` | recorrido completo | **276 ms**, 0 ítems |

**Llamadas observadas** (contadas en los tests con la fuente inyectada):

| Entrada | `traerRegional` | `traerExtras` |
|---|--:|--:|
| Sin plataformas válidas | **0** | **0** |
| `page` inválida (`NaN`, 0, negativa, ±∞) | **1** | 1 |
| `page` enorme (9999 sobre 1000 resultados) | **1** | 1 |

Antes, sin plataformas se pedían las **50** páginas de la fuente para devolver
cero.

**El contrato de `page`**: un entero finito ≥ 1, o la página 1. Ausente, `NaN`,
cero, negativa, infinita y fraccionaria caen todas en esa regla —la fraccionaria
se trunca—. Vive en `normalizarPagina` (`lib/ultimos.ts`) y lo aplica tanto la
ruta como la orquestación.

**La cota superior** sale de `total_results` de TMDB más la cantidad de extras,
por eso se agregó `totalResultados` al contrato de `PaginaRegional`: con
`total_pages` sola no se puede saber cuántos títulos hay. Es una cota —el
filtrado sólo saca— así que **nunca descarta una página que sí podría traer
resultados**: verificado con la página 15 sobre 300 resultados, que se intenta.

## 🔴 Riesgo residual de la paginación

**Un salto en frío a una página válida y profunda sigue costando el prefijo.**
Para mezclar de forma estable hay que haber traído las páginas 1..N, así que
pedir la 13 sin cache pide trece páginas: medido, **6222 ms**. Cada una queda
cacheada por separado, así que se paga una vez y las páginas intermedias que se
pidan después ya están — pero **el costo del salto no desapareció**.

Quitarlo exigiría rediseñar la paginación (por ejemplo con un cursor por fecha
en vez de por número de página), y **eso no se hizo**. No se afirma paginación
barata en profundidad ni paginación indefinida: se pagina hasta `total_pages`,
que es el límite de TMDB.

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
