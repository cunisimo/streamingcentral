# Filmografía de personas — medición antes/después (27/09/2026)

Rama `fix/filmografia-persona` (worktree `wt-filmografia`, desde `origin/main`
`2af1a37`). **Sin merge, sin push, sin deploy.** Nada de lo de acá está en
Producción.

## Qué se midió y con qué

- Instrumento: `scripts/medir-filmografia.mjs`, que llama a
  `personFilmography()` en proceso (`scripts/cargar-lib.mjs`) dentro de
  `withMetricas`. Una persona por proceso: la primera llamada es la **fría**
  (caché en memoria vacía) y la segunda, en el mismo proceso, la **caliente**.
- Sin credenciales `KV_*`: caché en **memoria**. No escribe en el Redis de
  Producción; sólo lee TMDB y Supabase (`publishedIds`).
- **Mismo instrumento para las dos versiones**: el script entiende la forma
  vieja (`titles`/`hidden`) y la nueva (secciones). "Antes" corrió sobre el
  código sin tocar (`2af1a37`); "después", sobre la rama.
- ⚠️ Los **tiempos** son de una máquina local contra TMDB real, corridas
  secuenciales (MANTENIMIENTO, "TMDB se degrada bajo concurrencia"): sirven
  como orden de magnitud, no como p95. Los **conteos** (títulos, llamadas,
  bytes) son los que valen. Antes y después se midieron con ~40 min de
  diferencia: la deriva de TMDB puede mover una o dos obras.

## Resultados

| Persona (`providers`) | | Obras evaluadas | Mostradas | Llamadas TMDB (fría) | Tiempo frío | Tiempo caliente | JSON |
|---|---|---|---|---|---|---|---|
| Denis Villeneuve (`m`) | antes | 16 | 2 (sólo Max) | 29 | 7,5 s | 0,20 s | 679 B |
| | después | 28 distintas | Dirección 24 (4 en Max) + Actuación 5 | 51 | 5,0 s | 0,16 s | 8,5 KB (1,9 KB gzip) |
| Steven Spielberg (`n`) | antes | 40 | 6 | 57 | 6,0 s | 0,29 s | 1,8 KB |
| | después | 66 distintas | Dirección 52 (5 en Netflix) + Actuación 18 | 106 | 6,7 s | 0,28 s | 19,7 KB (4,0 KB gzip) |
| Tom Hanks (`n,d,m`) | antes | 40 | 20 | 50 | 4,3 s | 0,26 s | 5,2 KB |
| | después | 123 distintas | Actuación 121 + Dirección 8 | 194 | 9,2 s | 0,26 s | 42,3 KB (7,0 KB gzip) |
| Samuel L. Jackson (`n,d,m`) | antes | 40 | 29 | 44 | 5,0 s | 0,29 s | 8,0 KB |
| | después | 229 | Actuación 229 (61 en tus plataformas) | 352 | 13,5 s | 0,26 s | 75,1 KB (15,6 KB gzip) |

"Caliente" son siempre **2** llamadas a TMDB (`/person/{id}` y
`combined_credits`, que no se cachean ni antes ni ahora); todo lo demás sale
de `pv3:`/`disp:`. Con Redis de verdad, cada título son lecturas en MGET por
lotes (`lib/cache.ts`): **no medido acá**, porque sin `KV_*` no hay comandos que
contar.

Las llamadas en frío por encima de "1 por obra" son las del resolvedor de
disponibilidad (`datosTituloDe`) para las obras que TMDB no ubica en AR: el
mismo camino que el resto de la app, sin atajos propios. **Cero 429, cero
timeouts** en las corridas del "después". Una corrida de Samuel L. Jackson
del "después" falló por un timeout de TMDB en `/person/2231` (la llamada de
detalle, previa al enriquecido y que no cambió); se repitió sola y es la que
figura en la tabla.

## Lo que se pierde hoy (causa raíz 1), medido sobre TMDB real

Simulando el índice viejo sobre `combined_credits` de Spielberg:
**sobreviven 38 de sus 52 créditos de Director** en `es-MX` y 46 de 52 en
`es-ES`. Los que se pierden son las obras donde tiene otro crédito de equipo
posterior en la lista (productor, guion).

Villeneuve: 24 créditos `Director` en `es-MX` el 27/09 (el dueño contó 25 en su
consulta; la diferencia es deriva de TMDB o idioma). Antes quedaban 16 obras
evaluadas; ahora las 24 de dirección.

⚠️ **`1941` (Spielberg, Netflix) NO cayó fuera del puesto 40 en esta medición:**
con el orden viejo quedó en el puesto 25 (`es-MX`) / 28 (`es-ES`), y "antes"
ya aparecía con `providers=n`. El dueño la había visto cerca del 41 en
Producción; hoy no se reprodujo (deriva de TMDB o de idioma). El recorte a 40
sí descartaba obras en silencio: Samuel L. Jackson tiene 229 créditos de
actuación y se evaluaban 40; Tom Hanks, 123 obras y se evaluaban 40. El caso
"después del puesto 40" queda probado con datos sintéticos (test 5).

## TDD: los tests fallaban antes del arreglo

Primero se extrajo la lógica VIEJA tal cual a `lib/filmografia.ts` y se
corrieron los 19 tests nuevos: **6 ok / 13 fallos**, cada uno por el motivo
esperado. Extracto:

```
✖ varios trabajos en el mismo título conservan Director, Producer y Screenplay
    actual:   [ [Screenplay, Writing], [Screenplay, Writing], [Screenplay, Writing] ]
    expected: [ [Director, Directing], [Producer, Production], [Screenplay, Writing] ]
✖ un título posterior al puesto 40 sigue siendo accesible
    actual: 0,  expected: 60
✖ elegir sólo Max no elimina lo que no está en Max: sólo cambia el orden
    actual: [],  expected: [438631, 693134, 329865, 335984]
```

El test `control:` conserva una copia del algoritmo viejo y verifica que
**pierde** el Director de Duna (MANTENIMIENTO §8.b): si alguien lo "arregla"
hasta que pase con las dos versiones, deja de probar algo.

Después del arreglo: **19/19**. Suite completa: 2131 tests, 2113 ok, 0 fallos,
18 omitidos (artefactos opcionales). `npx tsc --noEmit` limpio;
`npm run build` OK.

## Verificado en local con el build (`next start`, caché en memoria)

- `GET /api/person/137427?providers=m` → Dirección 24; primeras: La llegada,
  Blade Runner 2049, Duna (`mv,m,un`), Duna: Parte dos (`m,un`); después el
  resto en gris. Legado `titles` = 4, `hidden` = 24.
- `GET /api/person/488?providers=n` → Dirección 52, `1941` en el puesto 5
  (bloque de Netflix); Actuación 18 (cameos reales: "Alien on TV Monitor",
  voces sin acreditar), separada.
- `GET /api/person/31?providers=n,d,m` → Actuación primero (profesión
  conocida), *Toy Story* (voz) en el puesto 1.
- `GET /api/person/2231?providers=n,d,m` → sólo Actuación (229), *Los
  increíbles* (voz de Frozone) presente.
- Navegador a 375 px: secciones con conteo, "N en tus plataformas", cards
  fuera de tus plataformas en gris con "No está en tus plataformas", sin
  scroll horizontal. "Ver más" de a 24. Abrir la card 56 de Samuel L. Jackson
  y volver: 72 cards y el mismo scroll (9763 px), **sin volver a pedir**
  `/api/person`.
