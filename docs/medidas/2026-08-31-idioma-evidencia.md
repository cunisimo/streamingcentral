# El idioma no puede mover la disponibilidad — 2026-08-31

## La causa

`homepage` es un campo **localizado** de TMDB, y el lector de evidencia oficial
(`datosTituloDe`) lo pedía con el idioma base de la app. Resultado: cambiar
`IDIOMA_TITULOS` —una variable que existe para elegir cómo se escriben títulos y
sinopsis— cambiaba la **disponibilidad** de un título.

Caso testigo, `movie:1752041`:

| Consulta | `homepage` |
|---|---|
| `?language=es-ES` | `netflix.com/browse?jbv=81958141` |
| `?language=es-AR` | `netflix.com/browse?jbv=81958141` |
| `?language=es-MX` | `""` |
| `?language=en-US` | `""` |
| sin `language` | `""` |

## Cobertura por idioma

Muestra de **360 títulos** (240 series por red + 120 películas por proveedor) de
las seis plataformas soportadas:

| Idioma | Con `homepage` | Con identidad oficial |
|---|---|---|
| `es-ES` | 248 | **217** |
| `es-MX` | 247 | 217 |
| `en-US` | 296 | **248** |
| sin `language` | 296 | 248 |

Diferencias respecto de `es-ES`:

| | Pierde | Gana | Identidad distinta |
|---|---|---|---|
| `es-MX` | 3 | 3 | 0 |
| `en-US` | 1 | **32** | 0 |

Lo que gana `en-US`: 22 de Netflix y 10 de Disney+, todos enlaces de plataforma
reales. Lo que pierde: `movie:1242434`, cuyo `homepage` en `es-ES` es
`tv.apple.com/es/movie/umc.cmc.3rbg43tt2brl2cp5wwacfrmhx`.

**Ninguna identidad se contradice entre idiomas.** Las diferencias son siempre
tener el enlace o no tenerlo, nunca apuntar a títulos distintos.

## La decisión

`IDIOMA_EVIDENCIA = "es-ES"`, literal, sin leer el entorno.

Se eligió sabiendo que **`en-US` daría 31 identidades más**:

1. `es-ES` es lo que la app resuelve hoy, así que fijarlo **no mueve ni un
   título**. Esta corrección es de independencia, no de cobertura.
2. Los casos que `en-US` pierde son justamente los del tipo del caso testigo.

Pasar a `en-US` es una mejora medida y disponible, y queda como decisión abierta.

## Lo que NO se hizo, y por qué

Ponerle huella de idioma a la clave `oficial:` **arregla la caché y deja el
bug**: seguirían existiendo dos respuestas distintas para el mismo título, y la
app elegiría una según el idioma visual. La misma película en Netflix o en gris.

Se arregló la **fuente**. Con una sola respuesta posible por título, `oficial:`
puede seguir sin huella — y esa es la única razón por la que puede. Hay un test
que ata las dos mitades.

## Costo

**Cero llamadas nuevas.** Es la misma llamada de detalle que ya hacía el lector,
con el idioma explícito. Un test falla si aparece un segundo `titleDetails` ahí.

## Invariante verificada

Con `IDIOMA_TITULOS` en `(sin definir)`, `es-MX`, `en-US` y `pt-BR`:

| | |
|---|---|
| `IDIOMA_EVIDENCIA` | `es-ES` en los cuatro |
| `tv:322428` | identidad `n:81958141`, evidencia `n` en los cuatro |
| `movie:1752041` | identidad `n:81958141`, evidencia `n` en los cuatro |
| Título visible | leído del idioma base, sin tocar |
