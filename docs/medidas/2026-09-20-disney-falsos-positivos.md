# 2026-09-20 — Disney+ AR: TMDB lista títulos que Disney+ ya no tiene

**Disparador:** el dueño encontró *Los Ángeles al desnudo* (`movie:2118`) marcada
como disponible en Disney+ y comprobó en la plataforma que no está. Preguntó si
era un caso aislado.

## Dónde está el error

No es nuestro. `movie/2118/watch/providers` de TMDB devuelve hoy para `AR`:
`Disney Plus (337), Paramount Plus (531), MovistarTV, Paramount+ Amazon Channel`.
`homepage` viene vacío, así que ninguna regla de inferencia nuestra interviene:
la app muestra Disney+ por la **prioridad 1** del resolvedor (`tmdb-ar`), que es
repetir lo que dice TMDB. Nuestro cache (`pv3:`, 8 h) no cambia nada: TMDB sirve
el dato viejo en vivo.

JustWatch AR —la fuente de TMDB, actualizado el 20/09 02:09— dice: Paramount+,
MovistarTV y Paramount+ Amazon Channel. **El "Prime" que se ve en internet es el
canal de Paramount+ dentro de Prime Video** (add-on pago), no Prime Video.

## Cuánto abarca

Método: `discover/movie` de TMDB con `with_watch_providers=337`, `watch_region=AR`,
`flatrate`, 5 páginas por popularidad (100 títulos). Cada uno se buscó en
JustWatch AR (GraphQL público de su web, desde el navegador) matcheando por
`externalIds.tmdbId`, y se miró si `disneyplus` aparece entre sus ofertas
`FLATRATE`.

| Muestra | Correctos | **Falsos positivos** |
|---|---|---|
| Disney+ AR, 100 películas | 80 | **20** |
| Netflix AR, 60 películas (control, páginas 2-4 por votos) | 59 | 0 (1 sin match) |

Los 20 malos son **todos títulos licenciados**, no producciones Disney: Heat,
The Revenant, Once Upon a Time in America, Unfaithful, Mr. & Mrs. Smith, Birdman,
The Girl Next Door, In Time, A Time to Kill, Fantastic Mr. Fox, L.A.
Confidential, Jumper, Noah, Love & Other Drugs, The Negotiator, Bridget Jones's
Diary, Natural Born Killers, A Cure for Wellness, The Client, This Boy's Life.
Las ~50 producciones propias de Disney de la muestra dan 0 errores, o sea que
**entre lo licenciado la tasa ronda el 40%**.

Cuatro de ellos se cruzaron en AR, MX, BR, CL y CO: TMDB pone Disney+ en las
cinco regiones y JustWatch en ninguna. Es un desfase de TMDB con el catálogo
Disney+ de LatAm entero, no una rareza argentina. Netflix está sincronizado, así
que no es que TMDB haya dejado de sincronizar: parece una baja masiva de
licenciados en Disney+ LatAm que TMDB todavía no incorporó.

## Confirmación manual (mismo día)

**El dueño verificó las 20 a mano dentro de Disney+: ninguna está.** Ya no son
discrepancias con JustWatch sino falsos positivos confirmados, y con eso se
cargaron como supresiones negativas en `lib/supresiones-disponibilidad.ts`
(issue #24). En el Home, las listas y la ficha esas 20 ya no muestran Disney+.

## Qué NO se midió

- Series de Disney+ (sólo películas).
- Las otras plataformas salvo Netflix.
- El sentido inverso (títulos que JustWatch pone en Disney+ y TMDB no).
- Cuánto tarda TMDB en corregirse. El cruce periódico (mensual, desde octubre)
  repite la muestra con los mismos 20 ids: si TMDB los saca de Disney+, las
  supresiones quedan redundantes pero inofensivas; se desactivan sólo con una
  verificación positiva directa.

## Ids de los 20 (para repetir la medición)

949, 281957, 311, 2251, 787, 194662, 10591, 49530, 1645, 10315, 2118, 8247,
86834, 43347, 9631, 634, 241, 340837, 10731, 8092
