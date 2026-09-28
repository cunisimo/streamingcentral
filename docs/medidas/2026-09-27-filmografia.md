# Filmografía de personas — medición (issue #25)

Rama `fix/filmografia-persona` (worktree `wt-filmografia`, desde `origin/main`
`2af1a37`). **Sin merge, sin push, sin deploy.** Nada de esto está en
Producción.

Tres versiones medidas con el MISMO instrumento:

| Versión | Qué hace al abrir la ficha | Estado |
|---|---|---|
| `2af1a37` ("antes") | índice que pisa roles + `slice(0, 40)` + filtro por plataformas | en Producción |
| `706fb7a` (1ª corrección) | arregla roles y recorte, pero **enriquece la carrera entera** | 🔴 **RECHAZADA** por el dueño (28/09) |
| 2ª corrección (commit siguiente) | datos básicos de todo + disponibilidad sólo del bloque visible | en rama |

🔴 **El enriquecido completo y anticipado de `706fb7a` se rechazó y no es un
resultado aceptable.** 352 peticiones a TMDB y 10–13 s en frío para abrir una
ficha no se justifican con un `maxDuration` más alto (la 2ª corrección lo sacó).

## Instrumento

`scripts/medir-filmografia.mjs` corre `personFilmography()` en proceso
(`scripts/cargar-lib.mjs`) y separa:

- **Peticiones HTTP reales a TMDB**, contadas interceptando `fetch` hacia
  `api.themoviedb.org` (el cable), por familia: **base** (`/person/{id}` y
  `/person/{id}/combined_credits`), **proveedores** (`/watch/providers`) y
  **detalle** (la evidencia oficial de `disponibilidadDe` para obras que TMDB
  no ubica en AR). Una lectura servida por Redis **no** es una petición a TMDB.
- **Invocaciones lógicas al enriquecedor**: obras por las que se resolvió
  disponibilidad, salgan o no a la red.
- **Redis**: hits y misses por clave, y comandos (lo que factura Upstash).

Redis: el **doble REST de Upstash del banco** (`scripts/banco/dobles.mjs`,
puerto propio) vía `UPSTASH_REDIS_REST_URL`. Nunca el de Producción. Por cada
versión y persona: se vacía el Redis, una corrida **fría** (proceso nuevo) y
otra **caliente** (otro proceso nuevo, sin nada en memoria, con el Redis ya
lleno). TMDB y Supabase (`publishedIds`, sólo lectura) reales.

Las tres versiones se corrieron **alternadas por persona en la misma ventana**
(28/09), como pide MANTENIMIENTO ("Comparar dos corridas"). Los "antes" viejos
se corrieron desde una copia de `2af1a37`/`706fb7a` extraída con `git archive`
en un directorio temporal, sin worktrees extra. Cero 429 en todas las corridas.

⚠️ El instrumento se equivocó una vez y se corrigió antes de publicar números
(§8.b): identificaba la respuesta nueva por la presencia de secciones, y
`706fb7a` también las tiene; contaba 0 obras enriquecidas para la versión
rechazada. Ahora distingue las tres formas de respuesta por lo que traen.

⚠️ Tiempos: una máquina local contra TMDB real, corridas secuenciales. Sirven
como orden de magnitud; los **conteos** son los que valen.

## Apertura de la ficha (criterio: peticiones reales después ≤ antes)

| Persona (`providers`) | Versión | Base | Proveedores | Detalle | **TMDB reales** | Enriquecedor | Redis hit / miss / cmd | ms (vacía) | JSON |
|---|---|---|---|---|---|---|---|---|---|
| Villeneuve (`m`) | antes | 2 | 16 | 11 | **29** | 16 | 0 / 61 / 110 | 4172 | 679 B |
| | 706fb7a 🔴 | 2 | 28 | 21 | 51 | 28 | 11 / 102 / 191 | 3350 | 8,5 KB |
| | **después** | 2 | 12 | 6 | **20** | 12 | 0 / 37 / 66 | 2801 | 9,7 KB (2,4 KB gzip) |
| Spielberg (`n`) | antes | 2 | 40 | 18 | **60** | 40 | 11 / 102 / 179 | 3960 | 2,0 KB |
| | 706fb7a 🔴 | 2 | 66 | 38 | 106 | 66 | 31 / 188 / 347 | 7000 | 19,7 KB |
| | **después** | 2 | 12 | 8 | **22** | 12 | 3 / 42 / 79 | 3077 | 20,7 KB |
| Tom Hanks (`n,d,m`) | antes | 2 | 40 | 8 | **50** | 40 | 4 / 69 / 106 | 4053 | 5,2 KB |
| | 706fb7a 🔴 | 2 | 123 | 69 | 194 | 123 | 114 / 286 / 570 | 5256 | 42,3 KB |
| | **después** | 2 | 12 | 8 | **22** | 12 | 0 / 45 / 82 | 3256 | 37,7 KB |
| Samuel L. Jackson (`n,d,m`) | antes | 2 | 40 | 2 | **44** | 40 | 0 / 49 / 62 | 4153 | 8,0 KB |
| | 706fb7a 🔴 | 2 | 229 | 121 | 352 | 229 | 204 / 510 / 1006 | 10222 | 75,1 KB |
| | **después** | 2 | 12 | 8 | **22** | 12 | 0 / 45 / 82 | 3536 | 65,9 KB (15,9 KB gzip) |

**Criterio cumplido en los cuatro casos:** 20 ≤ 29, 22 ≤ 60, 22 ≤ 50, 22 ≤ 44.

**Con Redis caliente** (proceso nuevo, Redis lleno), las tres versiones y las
cuatro personas: **2 peticiones reales a TMDB** (persona y créditos, que no se
cachean en ninguna versión), 0 misses. Duración: antes 0,7–1,4 s, después
1,1–2,0 s. El enriquecedor sigue invocándose (12), pero todo sale de Redis.

El JSON crece porque ahora viaja la filmografía ENTERA como datos básicos
(título, póster, fecha, votos, géneros, roles), que es lo que permite
recorrerla sin volver a pedir créditos. Es lo único que escala con la carrera,
y cuesta 0 peticiones a TMDB.

## "Ver más" (el bloque siguiente de la primera sección)

| Persona | Obras pedidas | TMDB reales (frío) | Redis hit / miss / cmd | ms (frío) | ms (Redis caliente) | JSON |
|---|---|---|---|---|---|---|
| Villeneuve (Dirección) | 15 | 29 (15 + 14) | 28 / 43 / 101 | 801 | 21 | 312 B |
| Spielberg (Dirección) | 24 | 33 (24 + 9) | 18 / 42 / 80 | 1033 | 35 | 562 B |
| Tom Hanks (Actuación) | 24 | 35 (24 + 11) | 22 / 46 / 93 | 2410 | 21 | 532 B |
| Samuel L. Jackson (Actuación) | 24 | 30 (24 + 6) | 12 / 36 / 62 | 864 | 27 | 530 B |

Villeneuve pide 15 y no 16: la obra restante ya estaba resuelta desde la otra
sección. "Ver más" no vuelve a pedir la persona ni los créditos (base 0).

## Por qué la apertura es de 12 y no de 24

El pedido del dueño fija la apertura en "como máximo 24" y el criterio
obligatorio en "peticiones reales iniciales después ≤ antes". Con una apertura
de 24 obras (primer intento de esta corrección, 28/09, mismo instrumento),
Villeneuve midió **43** peticiones reales (2 + 24 + 17) contra **29** del
antes: el "antes" es barato porque el bug le descartaba 8 obras dirigidas.
Con 12, el **peor caso** es 2 + 12 × 2 = 26 (27 con el respaldo de idioma),
por debajo de 29 sin depender de cuántas obras caigan al respaldo. "Ver más"
sigue siendo de 24. Es un desvío del contrato pedido ("apertura: posiciones
0–23") y está a decisión del dueño.

## Causa raíz 1, sobre datos reales

Simulando el índice viejo sobre `combined_credits` de Spielberg (27/09):
sobreviven **38 de 52** créditos de Director (`es-MX`), 46 de 52 (`es-ES`).
Villeneuve: el "antes" evaluaba 16 obras de sus 24 dirigidas.

⚠️ `1941` (Spielberg) **no** quedó fuera del puesto 40 en la medición del
27/09 (puesto 25–28 con el orden viejo); el dueño la vio cerca del 41 en
Producción. No se reprodujo. Con la carga progresiva, está en la filmografía
básica de todas formas y se alcanza con "Ver más".

## Tests

- 1ª corrección: los 19 tests nuevos daban **13 fallos** contra la lógica vieja
  extraída tal cual (motivos esperados: roles `[Screenplay ×3]`, 0 de 60 obras
  tras el puesto 40, filtro por Max).
- 2ª corrección: `lib/filmografia.test.ts` (22) + `lib/filmografia-bloques.test.ts`
  (8). Además del **control** con el algoritmo viejo (pierde el Director en 4
  de los 6 órdenes posibles de Director/Producer/Screenplay), se hicieron dos
  **mutaciones** temporales para ver que los tests muerden: con la apertura
  enriqueciendo la carrera entera fallan 2 tests (el de 229 obras entre ellos);
  con "el último rol gana" fallan 5 (Dune, órdenes, Villeneuve, Max,
  secciones). Restaurado el código: 30/30.

## Verificado en local (build de producción con `next start` y el Redis del banco)

- `/api/person/137427?providers=m`: 24 obras de Dirección y 5 de Actuación
  como datos básicos, 12 consultadas (`inicial` 8 + 4). Dirección, por fecha:
  Dune: Parte tres (2026-12-15, sin plataformas), Dune: Parte dos `[m, un]`,
  Dune `[mv, m, un]`, Blade Runner 2049 `[mv, m]`, La llegada `[mv, m]`…; Dune
  con roles Director/Producer/Screenplay.
- En navegador a 375 px: las cuatro de Max arriba del primer bloque, roles en
  castellano bajo cada card ("Dirección · Guion · Producción"), voz como
  "(voz)", sin scroll horizontal. "Ver más" de Dirección → UNA petición
  `?items=` con 15 claves y el bloque aparece completo.
- Samuel L. Jackson: 229 obras básicas, 12 consultadas; dos "Ver más", abrir la
  card 41 y volver: 60 cards y el mismo scroll (7700 px). Peticiones a la
  persona en toda la prueba: la apertura y los dos `?items=`; **la vuelta no
  pidió nada**.
