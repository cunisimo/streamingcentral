# Reparación de idioma: matriz de cobertura

**2026-08-23 · tanda 1.** Qué superficies producen títulos localizados, cuáles
pasan por la reparación y qué pasa si el respaldo falla.

El mecanismo es **uno solo**: `repararLote` / `repararUno` en `lib/idioma.ts`.
Ninguna superficie implementa su propia variante — esa era la forma segura de
que divergieran.

---

## Las diez familias de claves localizadas

| Familia | Origen TMDB | ¿Repara? | Dónde | Campos | Coste extra |
|---|---|---|---|---|---|
| `disc:` (pool) | `/discover` por plataforma y página | **sí** | `pool()` dentro del `cached()` | título, sinopsis | 1 llamada por página con algún roto |
| `disc:` (combinada) | `/discover` con todas las plataformas | **sí** | `candidatosCombinados()` dentro del `cached()` | título, sinopsis | ídem |
| `card:` | `/movie\|tv/{id}` | **sí** | `titleCard()` → `detalleReparado()` | título, sinopsis | 1 llamada por título roto |
| `top:pop:` | `listByCategory()` → `/discover` | **sí** (heredado) | `listByCategory` | título, sinopsis | 1 por consulta con algún roto |
| `reco:v2:` | cards ya reparadas | **sí** (heredado) | se arma con `card:` y pools | — | 0 |
| `reco:mismo:` | `titleDetails().recommendations` | **sí** | `recomendadosDe()` | título, sinopsis | 1 por lista con algún roto |
| `reco:cruce:` | `/discover` por keywords | **sí** | `cruzadosDe()` | título, sinopsis | 1 por consulta con algún roto |
| `reco:perfil:` | `titleDetails()` (`titulo`) | **sí** | `perfilDe()` | título, sinopsis | 1 por título roto |
| `people:popular:` | `/person/popular` (`known_for`) | **sí** | `popularPeople()` | título, sinopsis | 1 por página con algún roto |
| `home:` | todo lo de arriba, compuesto | **sí** (heredado) | — | — | 0 |

## Superficies sin clave propia

| Superficie | Origen | ¿Repara? | Nota |
|---|---|---|---|
| Ficha (`detail`) | `titleDetails()` | **sí** | `detalleReparado()`. No está cacheada: se paga por visita, 5,6% de las veces |
| **Relacionados de la ficha** | `recommendations` dentro del mismo detalle | **sí** | Se reparan como lote y **comparten la llamada de respaldo** con la ficha: el detalle en es-ES trae las dos cosas |
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

**Se devuelve la base intacta, siempre.** El fallback es una mejora opcional:
una página válida en `es-MX` con una sinopsis faltante es mejor que ninguna
página. El `try/catch` vive en `repararLote`/`repararUno`, o sea en un solo
lugar, y no en cada superficie.

| Caso | Resultado |
|---|---|
| El respaldo rechaza (500, red) | base intacta, `console.error`, `fallos++` |
| El respaldo hace timeout | ídem |
| El respaldo devuelve `null` / lista vacía | base intacta |
| El respaldo trae el título igual de roto | no se pisa nada: mejor el original que un vacío |
| Un id del lote no viene en el respaldo | ese título queda sin reparar; el resto sí |

Cubierto por tests en `lib/idioma.test.ts`, incluida la **consulta paginada**:
`candidatosCombinados` arma `{ candidatos, totalPaginas, total }` **después** de
reparar, así que un fallo del respaldo no puede perder la paginación.

---

## Por qué por lote y no por título

Medido sobre un Home frío de `n,d,m` (`docs/medidas/2026-08-23-idioma-fallback.json`):
1021 títulos, 57 rotos (5,6%) repartidos en 32 de 107 páginas.

| Estrategia | Llamadas extra |
|---|---|
| Pedir siempre los dos idiomas | +107 |
| Reparar título por título | +57 |
| **Pedir el respaldo solo si la página tiene algún roto** | **+32** |

Un `discover` repara hasta 20 títulos de una sola vez. Por eso `repararLote`
recibe la lista entera y **nunca** hay que llamar por título cuando la misma
respuesta permite reparar el lote.

---

## Cómo verificar la inercia

Con `IDIOMA_TITULOS` sin definir (o en `es-ES`), un Home frío tiene que loguear:

```
[idioma] fallback: 0 llamadas | 0 lotes | 0 títulos reparados | 0 fallos
```

Medido el 2026-08-23 sobre un Home frío de `n,d,m` (632 claves, 615 misses):
**0 llamadas**. La guarda mira la **configuración**, no si hay títulos rotos —
que con `es-ES` no los haya es una propiedad de los datos y podría dejar de
cumplirse.
