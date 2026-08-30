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

## Costo

`/api/home` con `n,d,m`, cache en memoria (sin Redis):

| Escenario | Tiempo | Comandos | Claves (hit/miss) |
|---|--:|--:|--:|
| Frío (default, `movie`) | 5586 ms | 664 | 649 (24 / 625) |
| Cambio de toggle a `ultimos:tv` | 1196 ms | 39 | 683 (673 / 10) |
| **Segunda vez, misma consulta** | **0 ms** | **1** | **1 (1 / 0)** |

La segunda solicitud equivalente es **HIT con un solo comando** y no repite
ninguna llamada a TMDB. `/api/latest?tipo=tv` responde en **73 ms** la segunda
vez contra varios segundos la primera.

**Costo adicional del descubrimiento por red**, sólo en `tipo=tv`: 3 páginas de
`discover` extra (1 por página de ventana) más el enriquecido de esos candidatos.
Se paga una vez por día y por combinación de plataformas: la clave
`claveUltimosSeries` lleva la fecha argentina y las plataformas ordenadas.

**Costo adicional de la resolución**: **cero** para los títulos que TMDB ya
ubica — `disponibilidadDe` corta antes de tocar el cache. Sólo los que vienen
vacíos pagan `/tv/{id}` (cacheado 8 h) y una lectura de la evidencia de Netflix.

## Paginación

`/api/latest?tipo=tv&providers=d`: página 1 y página 2 traen 20 cada una con
**intersección vacía**. Los tests fijan además que no se saltean elementos y que
la página 2 continúa exactamente donde termina la 1.

## 🔴 Lo que esta medición NO pudo verificar

**El respaldo oficial de Netflix no se pudo ejercitar en vivo hoy.** La semana
más nueva de `netflix_top10` es **2026-08-16**, exactamente **14 días** atrás, y
la ventana de evidencia son 14 días: la de Moria venció por horas. Por eso
`/api/title/tv/322428` devuelve `[]` hoy — **en `main` también**, porque la regla
de ventana no se tocó.

No es una regresión de este cambio y está cubierto por tests (23 casos en
`lib/top-plataformas.test.ts`, ahora apuntados al resolvedor central).

⚠️ **Hallazgo aparte, para el dueño:** el cron es semanal y martes, pero la
última ingesta es del 2026-08-16 — faltan las del 18 y 25 de agosto. Eso es un
problema del cron, no de esta corrección.
