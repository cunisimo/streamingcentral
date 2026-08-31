# Identidad oficial: `?jbv=` y deduplicación de la búsqueda — 2026-08-31

## El caso

TMDB tiene el mismo programa cargado **dos veces**: `tv:322428` y
`movie:1752041`. La búsqueda mostraba dos cards, una en color y otra en gris.

| | `tv:322428` | `movie:1752041` |
|---|---|---|
| `homepage` (es-ES) | `netflix.com/title/81958141` | `netflix.com/browse?jbv=81958141` |
| Identidad | `n:81958141` | `n:81958141` |
| `networks` | `[213]` | `[]` (TMDB no lo publica en películas) |
| Regiones con flatrate | 0 | 0 |
| Evidencia, antes | `n` | `null` (ruta `/browse` rechazada) |
| Evidencia, ahora | `n` | `n` |

**Las dos identidades coinciden**, así que la deduplicación se demuestra sin
heurística: es el mismo id que publica Netflix, no un parecido de nombre.

## Frecuencia de `?jbv=`

De **80 series de Netflix con `homepage`**: 71 usan `/title/<n>`, **1** usa
`/browse?jbv=<n>`, 0 usan `/browse` pelado, 2 otro dominio, 6 sin homepage.

## Colisiones de identidad (¿esconde obras distintas?)

Muestra de **540 títulos** de las seis plataformas (3 páginas por red en series,
3 por proveedor en películas):

| | |
|---|---|
| Títulos únicos | 540 |
| Con `homepage` | 447 |
| Con identidad oficial | 366 |
| Identidades distintas | 366 |
| **Colisiones** | **0** |

Cero colisiones: en esa muestra la deduplicación no junta nada. El único par que
comparte identidad es el duplicado real de arriba, que no está en la muestra
porque ninguna de sus dos entradas tiene proveedor en ninguna región.

## Hallazgo lateral: `homepage` es localizado

| Consulta | `movie:1752041` |
|---|---|
| sin `language` | `""` |
| `es-ES` | `netflix.com/browse?jbv=81958141` |
| `es-MX` | `""` |
| `en-US` | `""` |

Medido sobre **240 series**: **1 cambia de `homepage` entre `es-ES` y `es-MX`**
(0,4%), siempre en la dirección de perderlo.

La app corre `es-ES`, así que hoy la evidencia existe. Pero la clave `oficial:`
está en `CLAVES_SIN_HUELLA`, y esto muestra que su contenido **sí** depende del
idioma: si alguna vez se cambia `IDIOMA_TITULOS`, hay que pasarla a las familias
con huella o durante 8 h se sirve el `homepage` del idioma anterior.
**No se corrigió**: queda como decisión.
