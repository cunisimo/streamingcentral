# Filmografía de personas — medición (issue #25)

## Vigente: entrega integrada (28/09) — contrato v1/v2

Rama `fix/yumpea-filmografia-entrega` (worktree `wt-yumpea-filmografia`, desde
`origin/main` `2af1a37`, árbol `ac9715d`). Código medido: commit `771301f`
(árbol `8dc25f5`). El código final (`40bbfdd`) sólo difiere en los escapes de la
regex de la invitación de Yumpeá: nada de filmografía. **Sin merge, sin push, sin deploy.** Nada de esto está en
Producción.

La ruta tiene dos contratos (lib/filmografia-ruta.ts) y se midieron los dos,
con el instrumento de abajo (`--contrato=v1|v2`), TMDB real y Redis = el doble
del banco. Las tres variantes se corrieron **alternadas por persona en la misma
ventana**; antes de cada variante se vació el Redis. Cero 429 en todas.

- **antes**: `2af1a37`, lo que hoy recibe cualquier cliente.
- **v1**: sin `filmografia=v2`, lo que recibe un bundle Android viejo después de
  la entrega. Evalúa como máximo tantas obras como evaluaba `2af1a37` para esa
  misma persona (≤ 40).
- **v2**: `filmografia=v2`, la web y todo AAB nuevo. 12 obras al abrir, 24 por
  "Ver más".

### Peticiones HTTP reales a TMDB, apertura con caché vacía

| Persona (`providers`) | antes | v1 | v2 | v2 "Ver más" (obras) |
|---|---|---|---|---|
| Denis Villeneuve (`m`) | 23 (2 + 13 + 8) | **21** (2 + 13 + 6) | **20** (2 + 12 + 6) | 29 (15) |
| Steven Spielberg (`n`) | 60 (2 + 40 + 18) | **55** (2 + 40 + 13) | **22** (2 + 12 + 8) | 33 (24) |
| Tom Hanks (`n,d,m`) | 50 (2 + 40 + 8) | **50** (2 + 40 + 8) | **22** (2 + 12 + 8) | 35 (24) |
| Samuel L. Jackson (`n,d,m`) | 44 (2 + 40 + 2) | **44** (2 + 40 + 2) | **22** (2 + 12 + 8) | 30 (24) |

(base persona+créditos + `watch/providers` + detalle de la evidencia oficial.)

**Criterios cumplidos:** v1 ≤ antes y v2 ≤ antes en los cuatro casos.

### Invocaciones al enriquecedor, Redis y tiempos

| Persona | Variante | Obras enriquecidas | Redis hit / miss / cmd (fría) | ms fría | ms Redis caliente | JSON |
|---|---|---|---|---|---|---|
| Villeneuve | antes / v1 / v2 | 13 / 13 / 12 | 2/44/81 · 0/38/67 · 0/37/66 | 3746 · 2919 · 2719 | 905 · 894 · 892 | 679 B · 1,2 KB · 8,7 KB |
| Spielberg | antes / v1 / v2 | 40 / 40 / 12 | 6/107/184 · 8/85/142 · 0/45/82 | 4044 · 3402 · 2870 | 1076 · 1121 · 1305 | 2,0 · 1,8 · 20,4 KB |
| Tom Hanks | antes / v1 / v2 | 40 / 40 / 12 | 3/70/107 · 3/70/107 · 2/43/80 | 3097 · 3437 · 2874 | 1023 · 1074 · 1039 | 5,2 · 5,2 · 36,6 KB |
| Samuel L. Jackson | antes / v1 / v2 | 40 / 40 / 12 | 0/49/62 · 0/49/62 · 0/45/82 | 3108 · 3173 · 2900 | 1168 · 1124 · 1040 | 8,0 · 8,0 · 65,1 KB |

**Con Redis caliente** (proceso nuevo, Redis lleno), todas las variantes y
personas: **2 peticiones reales** (persona y créditos, que no se cachean en
ninguna versión) y **0 misses**; "Ver más" en caliente: **0** peticiones, 16–40 ms.

**Cambio de plataformas: 0 peticiones** (ni persona, ni créditos, ni
disponibilidad). No es una medición de TMDB sino de diseño, y está fijado por
test (`lib/filmografia-cliente.test.ts`, transporte que cuenta): el contrato v2
no recibe plataformas y el cliente ya no usa `useApi`; cambiarlas reordena lo
cargado al dibujar. Verificado además en navegador (ver ESTADO).

### El primer intento de v1 no cumplía, y por qué

Con sólo el techo de 40, v1 costaba en frío **51** peticiones para Villeneuve
contra **23** de antes (Spielberg 55 ≤ 60, Hanks 50 = 50, Jackson 44 = 44). El
"antes" es barato porque el bug de los roles le dejaba 13 obras evaluadas; v1
reparado evaluaba sus 28. La corrección no ajusta un número a la medición: v1
evalúa la misma **cantidad** de obras que el código viejo para esa persona
(réplica del índice viejo, sin consultar nada), elegidas por votos de la lista
reparada. Villeneuve: 13 obras, 21 peticiones, y "en tus plataformas" pasa de 2
títulos a 4 (entran las dos Dune).

⚠️ Deriva: el "antes" de Villeneuve dio 29 peticiones / 16 obras el 27/09 y 23 /
13 el 28/09, con el mismo código. Es el catálogo de TMDB (MANTENIMIENTO,
"Comparar dos corridas"); por eso todo se compara dentro de la misma ventana.

---

## Antecedente: primera y segunda corrección (27–28/09, rama `fix/filmografia-persona`)

Lo que sigue es la medición de los commits `706fb7a` y `c9b6119`, integrados en
esta entrega. Se conserva como antecedente; la tabla vigente es la de arriba.

Tres versiones medidas con el MISMO instrumento:

| Versión | Qué hace al abrir la ficha | Estado |
|---|---|---|
| `2af1a37` ("antes") | índice que pisa roles + `slice(0, 40)` + filtro por plataformas | en Producción |
| `706fb7a` (1ª corrección) | arregla roles y recorte, pero **enriquece la carrera entera** | 🔴 **RECHAZADA** por el dueño (28/09) |
| 2ª corrección (`c9b6119`) | datos básicos de todo + disponibilidad sólo del bloque visible | auditada; ⚠️ su legado `titles` salía sólo de las 12 obras iniciales (degradaba los bundles Android viejos) y cambiar plataformas volvía a pedir todo: corregido en la entrega integrada (v1/v2) |

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
