# Reparación de idioma: matriz de cobertura

**2026-08-23 · tanda 2.** Qué superficies producen títulos localizados, cuáles
pasan por la reparación y qué pasa si el respaldo falla.

**Desde la tanda 2 las once familias llevan la huella en la clave**
(`card:es-MX+f.r1:movie:278`). En la tanda 1 corrían en modo compatible, con la
huella vacía. Lo que decide el espacio de claves es la configuración
—`IDIOMA_TITULOS` y `FALLBACK_IDIOMA`—, así que un rollback selecciona otro
espacio en vez de esperar a que expiren TTLs de hasta 30 h.

El mecanismo es **uno solo**: `repararLote` / `repararUno` en `lib/idioma.ts`.
Ninguna superficie implementa su propia variante — esa era la forma segura de
que divergieran.

---

## Las ONCE familias de claves localizadas

| Familia | Origen TMDB | ¿Repara? | Dónde | Campos | Coste extra |
|---|---|---|---|---|---|
| `disc:` (pool) | `/discover` por plataforma y página | **sí** | `pool()` dentro del `cached()` | título, sinopsis | 1 llamada por página con algún roto |
| `disc:` (combinada) | `/discover` con todas las plataformas | **sí** | `candidatosCombinados()` dentro del `cached()` | título, sinopsis | ídem |
| `card:` | `/movie\|tv/{id}` | **sí** | `titleCard()` → `detalleReparado()` | título, sinopsis | 1 llamada por título roto |
| `top:pop:` | `listByCategoryCacheable()` → `/discover` | **sí** | la señal es **obligatoria por tipo**: no se puede omitir | título, sinopsis | 1 por consulta con algún roto |
| `reco:v2:` | cards y pools ya reparados | **sí** | `recomendaciones()` abre su **propio** `withMetricasIdioma` | — | 0 |
| `reco:mismo:` | `titleDetails().recommendations` | **sí** | `recomendadosDe()` | título, sinopsis | 1 por lista con algún roto |
| `reco:cruce:` | `/discover` por keywords | **sí** | `cruzadosDe()` | título, sinopsis | 1 por consulta con algún roto |
| `reco:perfil:` | `titleDetails()` (`titulo`) | **sí** | `perfilDe()` | título, sinopsis | 1 por título roto |
| `people:popular:` | `/person/popular` (`known_for`) | **sí** | `popularPeople()` | título, sinopsis | 1 por página con algún roto |
| **`search:v2:`** | `searchDeTipo` (es-MX) **+** `searchPersonas` (idioma base) | **sí** | `search()` | `knownFor` de las personas | 1 por búsqueda con algún roto |
| `home:` | todo lo de arriba, compuesto | **sí** (heredado) | — | — | 0 |

**`search:v2` es la familia que la primera auditoría dejó afuera.** Se la miró
solo por el lado de los títulos —que están clavados en es-MX y no cambian— y se
pasó por alto que el resultado también trae personas, y que su `knownFor` sale
del **idioma base**. Con es-MX, medio payload cambia.
En la tanda 1 conserva sus bytes exactos (`search:v2:<q>:<plats>`); la huella
entra en la tanda 2 como en las otras diez (once en total, contándola).

## Superficies sin clave propia

| Superficie | Origen | ¿Repara? | Nota |
|---|---|---|---|
| Ficha (`detail`) | `titleDetails()` | **sí** | `detalleYRelacionadosReparados()`. No está cacheada: se paga por visita, 5,6% de las veces |
| **Relacionados de la ficha** | `recommendations` dentro del mismo detalle | **sí** | Lote **mixto** (`claveMixta`). **Comparten la llamada de respaldo** con la ficha |
| **Filmografía** (`/persona/[id]`) | `personCombinedCredits()` | **sí** | Lote **mixto**: `cast` y `crew` mezclan películas y series. Sin cachear |
| **Personas del buscador** | `searchPersonas().known_for` | **sí** | Lote **mixto**, dentro de `search:v2` |
| **Recordarme, camino directo** | `detalleReparado()` | **sí** | La afirmación anterior —"hereda el título de la ficha"— era **falsa**: la ruta llamaba a `titleDetails()` crudo. Corregido |
| **Recordarme, vía `upcoming_content`** | `upcoming_content.title` | **no — TANDA 3** | Ese contenido persistido sigue en `es-ES`. Hasta el backfill, un recordatorio de Próximamente puede traer el título español aunque la ficha muestre otro: inconsistencia **conocida y acotada a esa tabla** |
| **Búsqueda del admin** (`/api/admin-search`) | `searchMulti()` | **no, y a propósito** | Es el buscador del dashboard editorial, lo usa solo el dueño para elegir un id. El nombre que ve ahí no lo ve ningún usuario, y el módulo está en standby |
| `/categoria`, exploración | `listByCategory()` → `/discover` ×2 | **sí** | Las dos consultas (base y la `alt` de `lib/categories.ts`) se reparan por separado |
| Carruseles de audiencia | pools, o `/discover` si `POOL_CACHE=0` | **sí** | **Los dos caminos.** Apagar el cache de pools no puede apagar la reparación de idioma |
| Superficie genérica con `POOL_CACHE=0` | `/discover` directo | **sí** | ídem |
| Ruleta | `roulette_titles` → `cardsByIds` → `card:` | **sí** (heredado) | El texto editorial es propio y no pasa por TMDB |
| Votos ("Lo más votados", "No gustaron") | `titleCard()` → `card:` | **sí** (heredado) | |
| Buscador | `searchDeTipo()`, clavado en **es-MX** | **no, y a propósito** | Ya está en es-MX y no se toca: es lo que hace que "Duro de matar" encuentre la 562 |
| Próximamente | `upcoming_content` (Supabase) | **no todavía** | Es la **tanda 3**: el fallback corre en la Edge Function antes de escribir |
| Top 10 de Netflix | `netflix_top10.raw_title` | **no, y a propósito** | Está en inglés porque es lo que matchea el TSV. Lo que se muestra sale de `card:` |

## Superficies que NO producen títulos

`pv:` (códigos de plataforma), `videos:` (key de YouTube), `genre:covers:`
(rutas de póster), `people:directors` (`knownFor` siempre vacío), `ed:pub:`
(ids), `blocklist:` (ids).

---

## Qué pasa si el respaldo falla

**Se devuelve la base intacta, y NO se cachea.** El fallback es una mejora
opcional: una página válida en `es-MX` con una sinopsis faltante es mejor que
ninguna página. El `try/catch` vive en `repararLote`/`repararUno`, o sea en un
solo lugar.

**Pero devolver la base no alcanza.** Si el llamador guardara ese resultado bajo
una clave `es-MX+f`, los títulos sin reparar quedarían congelados de 6 a 30
horas y nadie volvería a intentar. Por eso el mecanismo devuelve
`{ items, fallo }` y **cada superficie usa `cachedLocIf` con `() => !fallo`**:

- el usuario recibe la respuesta base;
- ninguna clave localizada la guarda como si estuviera reparada;
- el **Home entero** se marca `degradado`, y `cachedIf` ya no guarda los
  payloads degradados;
- el **próximo request vuelve a entrar al fetcher y reintenta**.

Hay un test que lo fija: primer respaldo falla → `fallo: true` y sin reparar;
segundo intento → vuelve a llamar y repara.

| Caso | Resultado |
|---|---|
| El respaldo rechaza (500, red) | base intacta, `console.error`, `fallos++` |
| El respaldo hace timeout | ídem |
| El respaldo devuelve `null` o `undefined` | base intacta, **cuenta como fallo**, no se cachea |
| El respaldo devuelve una **lista vacía válida** | base intacta, **NO es fallo**, y **sí se cachea**: TMDB respondió bien, simplemente no había con qué reparar |
| El respaldo trae el título igual de roto | no se pisa nada: mejor el original que un vacío |
| Un elemento del lote no viene en el respaldo | ese título queda sin reparar; el resto sí, y **no** cuenta como fallo |

## Lotes mixtos: películas y series con el mismo número

TMDB **reutiliza los ids entre tipos**: la película 1399 y la serie 1399 existen
las dos. En los lotes que mezclan —`known_for`, filmografías, relacionados— hay
que emparejar por `media_type:id` (`claveMixta`) y no por `id`, o una recibe el
título de la otra. `repararLote` recibe la función de clave y la reconstrucción
posterior usa **exactamente la misma**.

| Lote | Clave |
|---|---|
| Pools, categorías, `reco:cruce` | `clavePorId` — un solo tipo por consulta |
| `known_for` (buscador y `people:popular`), filmografías, relacionados | **`claveMixta`** |

Cubierto por `lib/reparar-y-cachear.test.ts`, que **no simula el caché**: llama
a `resolverConCache` —la misma función que usa `cachedIf`/`cachedLocIf` en
producción— con un backend en memoria, y a los adaptadores reales de
`lib/idioma-adaptadores.ts` con TMDB falso. La versión anterior de esos tests
reimplementaba la semántica del caché adentro del propio test, y por eso tres
bugs reales quedaron verdes.

Incluye la **consulta paginada**: `adaptadorPaginaCombinada` arma
`{ candidatos, totalPaginas, total }` **después** de reparar, así que un fallo
del respaldo no puede perder la paginación.

---

## Por qué por lote y no por título

Dos mediciones, de instrumentos distintos. **No hay que mezclarlas en la misma
frase** — es lo que hacía la primera versión de este documento:

| Artefacto | Qué mide | Números |
|---|---|---|
| `-idioma-fallback.json` | modelo de 72 páginas de discover | 1021 títulos, **57 rotos (5,6%)** en **21 de 72 páginas (29,2%)** |
| `-idioma-home-e2e.json` | el composer REAL, antes de la tanda 1 | **107** páginas de discover, **32** de fallback, 612 → 643 llamadas (+5,1%) |
| `-idioma-tanda2-e2e.json` | el composer REAL, **con la tanda 2 puesta** | **39 llamadas de respaldo** = 37 páginas de `discover` + 2 detalles; 613 → 651 llamadas (+6,2%), 58 títulos reparados, 0 fallos |

**"Páginas" y "llamadas" no son lo mismo, y la primera redacción las mezcló.**
Lo que cuenta `lib/idioma.ts` son *llamadas* de respaldo; de esas, 37 son páginas
de `discover` y 2 son detalles de ficha (`/tv/:id`).

**Y son más que las ~32 que estimó la tanda 1, por una razón conocida:** aquel
número salió de un banco que tenía el fallback implementado a mano y cableado
**solo en `pool()`**. La implementación real repara además la consulta combinada,
las categorías, el recomendador, el top, las personas y la ficha. Más superficies
reparadas, más páginas: 37 de 107 páginas de `discover` (34,6%), consistente con
el 30,6% que da el modelo de 72 páginas.

La línea de base es **613**, no 612: la tanda 1 movió el número y la base se
rehízo antes de comparar. Los 612 son referencia histórica.

El modelo da la **tasa**; el end-to-end da el **coste**. Sobre el modelo:

| Estrategia | Llamadas extra |
|---|---|
| Pedir siempre los dos idiomas | +72 |
| Reparar título por título | +57 |
| **Pedir el respaldo solo si la página tiene algún roto** | **+21** |

Un `discover` repara hasta 20 títulos de una sola vez. Por eso `repararLote`
recibe la lista entera y **nunca** hay que llamar por título cuando la misma
respuesta permite reparar el lote.

---

## Peor caso de "Elegidas para vos" — antes y después

Cada origen del recomendador dispara **tres caminos en paralelo** y los tres
piden el **mismo** `titleDetails`:

| Camino | Pide |
|---|---|
| `recomendadosDe()` | `titleDetails(tipo, id)` |
| `cruzadosDe()` → `perfilDe()` | `titleDetails(tipo, id)` |
| `perfilDe()` | `titleDetails(tipo, id)` |

`cached()` **no hace single-flight**: en un MISS concurrente los tres salen a
TMDB. Con `MAX_ORIGENES` orígenes, el peor caso era **3 llamadas por origen**, y
con el fallback de idioma encendido cada una podía además pagar su propio
respaldo: **hasta 6**.

| | Por origen | Con 4 orígenes |
|---|---|---|
| Antes | 3 `titleDetails` (+3 de respaldo en el peor caso) | 12 (hasta 24) |
| **Ahora** | **1** (+1 de respaldo) | **4 (hasta 8)** |

`lib/single-flight.ts` comparte la **promesa** y la borra al resolverse.

**La clave es `idioma:tipo:id`.** El tipo, porque TMDB reutiliza los números
entre películas y series. El **idioma**, porque la llamada base y la de respaldo
son dos pedidos distintos al mismo título: sin él, el respaldo en `es-ES`
recibiría la promesa del pedido en `es-MX`.

**Sí se comparte entre requests simultáneos, y eso es deseable**: dos usuarios
pidiendo la misma ficha al mismo tiempo son un solo pedido a TMDB. Lo que **no**
hace es guardar entre requests — la entrada se borra al resolverse o rechazarse,
así que nunca sirve datos viejos.

Cubierto por `lib/single-flight.test.ts`, incluida la promesa rechazada: sin el
`finally` que borra la clave, un fallo de TMDB dejaría ese título imposible de
pedir en lo que le queda de vida al proceso.

---

## Quién cuenta cada llamada de respaldo

**Un solo punto: `pedirRespaldoIdioma()` en `lib/idioma.ts`.** Es lo que hace
que la métrica `llamadas` signifique *requests de respaldo* y no "llamadas a
TMDB" ni "intentos lógicos".

| Camino | Clave del pedido | Quién lo llama |
|---|---|---|
| Pool por plataforma | `pool:<tipo>:<plat>:<receta>:p<n>` | `lib/pools.ts` |
| Consulta combinada | `combo:<tipo>:<plats>:<receta>:p<n>` | `lib/pools.ts` |
| Categoría / `top:pop` / audiencia | `categoria:…`, `categoria-alt:…` | `lib/enrich.ts` |
| Sin pools (`POOL_CACHE=0`) | `audiencia:…`, `superficie:…` | `lib/enrich.ts` |
| Ficha y relacionados | `detalle:<tipo>:<id>` | `lib/enrich.ts` |
| `reco:mismo` y `reco:perfil` | `detalle:<tipo>:<id>` | `lib/reco.ts` |
| `reco:cruce` | `cruce:<tipo>:<id>` | `lib/reco.ts` |
| `people:popular` | `people:popular:p<n>` | `lib/enrich.ts` |
| Personas del buscador | `search:personas:<q>` | `lib/enrich.ts` |
| Filmografía | `filmografia:<id>` | `lib/enrich.ts` |

Dos reglas que antes no se cumplían:

1. **La llamada base NO se cuenta.** El contador estaba en el single-flight de
   detalles del recomendador, que sirve a los dos idiomas, así que cada pedido
   base se anotaba como si fuera un respaldo.
2. **Varios consumidores de la misma promesa cuentan UNA vez.** El conteo va en
   `alPedir`, que el single-flight invoca solo cuando de verdad sale a la red.

La ficha y sus relacionados comparten la clave `detalle:<tipo>:<id>`, así que
pagan **un** respaldo entre los dos.

---

## Quién abre el contexto de métricas de `reco:v2`

**`recomendaciones()`, dentro del fetcher de `reco:v2`.** No la route.

Antes se leía `metricasIdiomaActuales()` confiando en que alguien más hubiera
abierto el scope: `/api/home` lo hacía y **`/api/te-va-a-gustar` no**, así que
ahí volvía `null` y el riel se guardaba 6 h con los fallos adentro.

Ahora el fetcher hace `withMetricasIdioma(() => armar(opts))` y decide el
`fallo` **al terminar**, mirando `metricas.fallos`. Con eso quedan cubiertos los
retornos tempranos —`sin-candidatos`, `filtrado`— sin tener que acordarse de
marcar nada antes de cada `return`, y ninguna route necesita recordar abrir
nada.

---

## Cómo verificar la inercia

Con `IDIOMA_TITULOS` sin definir (o en `es-ES`), un Home frío tiene que loguear:

```
[idioma] fallback: 0 llamadas | 0 lotes con rotos | 0 títulos reparados | 0 fallos
```

Medido el 2026-08-23 sobre un Home frío de `n,d,m` (634 claves, 618 misses):
**0 llamadas**. La guarda mira la **configuración**, no si hay títulos rotos —
que con `es-ES` no los haya es una propiedad de los datos y podría dejar de
cumplirse.
