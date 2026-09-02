# Evidencia oficial general — resultado de la implementación

Rama `feat/evidencia-oficial`, desde `main` = `3b075b7`.
Medido sobre el build de producción corrido en local, cache en memoria.

## Los dos casos testigo

| Título | Antes | Después | Procedencia |
|---|---|---|---|
| **Moria** (`tv:322428`) | `[]` | **`["n"]`** | `oficial-probable` — **sin Top 10** |
| **Gutiérrez** (`tv:275224`) | `["d"]` | `["d"]` | `oficial-probable` |

`watchLink` sigue en `null` en los dos: no se inventa un enlace de reproducción.

## Sin regresiones

| Ficha | Plataformas |
|---|---|
| `movie:278` Cadena perpetua | `n, m` |
| `tv:1396` Breaking Bad | `n` |
| `movie:238` El padrino | `pp, mv` |

## Cobertura real en una corrida

**38 títulos** resueltos por `oficial-probable`, contra **7** cuando sólo estaba
Disney+ habilitada:

| Plataforma | Títulos |
|---|--:|
| Disney+ | 14 |
| Max | 12 |
| Netflix | 11 |
| Paramount+ | 1 |

## Costo

| Escenario | Tiempo | Comandos Redis | Llamadas TMDB |
|---|--:|--:|--:|
| Home frío (con migración de `pv3:`) | 22.715 ms | 664 | 648 claves, 624 miss |
| Home segundo (otra combinación de toggle) | **748 ms** | — | reusa `pv3:` |
| **Home caliente** | **154 ms** | **1** | **0** |
| Últimos · Series, frío | 3,7–4,5 s | — | por plataforma |

⚠️ **El Home frío de 22,7 s es el costo de la migración `pv2:` → `pv3:`**, no el
estado estable: es un espacio de claves nuevo, así que todos los proveedores se
vuelven a pedir. El segundo Home, que ya comparte esas entradas, tarda **748 ms**.
Es el mismo arranque frío que tuvo `pv:` → `pv2:`.

## Bytes de `pv3:`

Medido en la investigación sobre 20 títulos con 93,4 regiones de promedio:

| | B/título | Home de 230 |
|---|--:|--:|
| `pv2:` (ids deduplicados) | 197 | 44,3 KB |
| **`pv3:` (tres contadores)** | **170 (−14%)** | **38,2 KB (−6,1 KB)** |
| Mapa completo | 1214 | 279 KB (descartado) |

`pv3:` es **más chico** que `pv2:`: los contadores son a lo sumo seis, mientras
el array de ids crecía con los proveedores distintos de 93 regiones.

## Verificación

Suite **788/788** · `tsc --noEmit --incremental false` **0** · build **exit 0** ·
`git diff --check` limpio.

Sin dependencias nuevas, sin tablas, sin migraciones, sin crons.
