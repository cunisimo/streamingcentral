# Recomendador "¿Qué te inspira hoy?" — rediseño de chips

Fecha: 2026-08-03
Estado: diseño aprobado, pendiente plan de implementación

## Problema / objetivo

El bloque recomendador del Home (`IndecisoHero`) hoy tiene 7 chips de ánimo +
un buscador de texto que simula IA (mapea palabras a un género). Sin IA real, el
buscador no aporta. Se rediseña el bloque:

1. Cambiar el título a **"¿Qué te inspira hoy?"**.
2. **Eliminar el buscador de texto** (input + botón "Buscar") y todo su código
   muerto asociado.
3. Mantener el diseño de chips con emojis, pero **pasar de 7 a 16 chips**,
   agrupados en dos filas etiquetadas: **Estados de ánimo** (7) y
   **Temáticas** (9).
4. Cada chip llama al contenido correcto vía el pipeline existente
   (`/api/recomendaciones?genre=<slug>` → `recommendations` → `listByCategory`
   → `discover`), mapeando cada chip a géneros/keywords de TMDB.

## Decisiones (aprobadas)

- **Dos grupos etiquetados**, cada uno una fila scrolleable (reusa
  `.chip-slider`/`.chip`).
- **Ambos tipos (movie + tv)** para todos los chips (se mantiene `tipo=all`).
- El chip de romance se llama **"A fuego lento" 💖** (sin la palabra "amor").
- El chip **Aventura familiar** incluye **Animación** además de Familia/Aventura.
- Región **AR + flatrate** siguen fijos (fuera de alcance; es Fase 2 multi-región).

## Arquitectura

El mecanismo NO cambia: un chip setea `genre = <slug>` y eso alimenta
`/api/recomendaciones`. Agregar un chip = agregar (o reusar) una `Category` en
`lib/categories.ts`. Las categorías nuevas son **aditivas**: no se tocan las que
usan las páginas de género (`components/data.ts` → `GENRES`/`SHELVES`), solo se
suman entradas a `CATEGORIES`.

### Componente `IndecisoHero`

- **Título:** el texto del `.finder-head` pasa a "¿Qué te inspira hoy?" (se
  mantiene el ícono sparkle). Se quita el sufijo "· Recomendador".
- **Se elimina** el bloque `.finder-box` (input + botón "Buscar"), y con él:
  el estado `query`, `KEYWORDS`, `resolveQuery`, `runSearch`.
- **Chips en dos grupos:** el array `MOODS` pasa a tener un campo `group`
  (`"animo" | "tematica"`), y el render agrupa en dos `.chip-slider`, cada uno
  precedido por una etiqueta (`.chip-group-label`): "Estados de ánimo" y
  "Temáticas".
- Se mantiene sin cambios: `pickMood`, `reset`, el offset ("Mostrame otras"),
  "Restablecer", el título "Resultados: {label} {emoji}", y el pool "6 para hoy".
- El campo `hint` de cada Mood ya no se usa para el input (se eliminó); se retira
  del tipo `Mood`.

### Chips y mapeo a TMDB

Cada fila define `{ slug, label, emoji, group }`. El `slug` resuelve contra
`CATEGORIES`. "reusa" = usa una categoría ya existente; el resto son entradas
nuevas en `CATEGORIES`.

**Estados de ánimo (group: "animo")**

| Emoji | Label | slug | movie | tv |
|---|---|---|---|---|
| 🍿 | Palomitas | `palomitas` (nueva) | genres `[28,12]` | genres `[10759]` |
| 😭 | Drama intenso | `drama` (reusa) | `[18]` | `[18]` |
| 🔍 | Misterio intrincado | `misterio-intrincado` (nueva) | genres `[9648,53]` | genres `[9648]` |
| 😂 | Para reír | `comedia` (reusa) | `[35]` | `[35]` |
| 👻 | Terror siniestro | `terror` (reusa) | genres `[27]` | kw `[315058]` |
| 🛸 | Sci-fi épico | `scifi` (reusa) | `[878]` | `[10765]` |
| 👨‍👩‍👧‍👦 | Aventura familiar | `familiar` (nueva) | genres `[10751,12,16]` | genres `[10751,10762,16]` |

**Temáticas (group: "tematica")**

| Emoji | Label | slug | movie | tv |
|---|---|---|---|---|
| 💖 | A fuego lento | `romance` (reusa) | genres `[10749]` | genres `[18]` |
| 🎄 | Magia navideña | `navidad` (nueva) | kw `[207317]` | kw `[207317]` |
| ⚔️ | Fuego cruzado | `guerra` (nueva) | genres `[10752]` | genres `[10768]` |
| 👽 | Contacto extraterrestre | `aliens` (nueva) | kw `[9951,14909,9739]` | kw `[9951,14909,9739]` |
| 🌌 | Odisea espacial | `espacio` (nueva) | kw `[9882,3801,1612]` | kw `[9882,3801,1612]` |
| 🧠 | Historias reales | `reales` (nueva) | genres `[99]` | genres `[99]` |
| 🧙‍♂️ | Mundos fantásticos | `fantasia` (nueva) | genres `[14]` | genres `[10765]` |
| 🕵️‍♂️ | Crimen y mafia | `crimen` (reusa) | genres `[80]` | genres `[80]` |
| 🏔️ | Supervivencia extrema | `supervivencia` (nueva) | kw `[10349,10617,5096]` | kw `[10349,10617,5096]` |

**IDs de género: confirmados** (28 Acción, 12 Aventura, 10759 Action&Adventure
tv, 18 Drama, 9648 Misterio, 53 Suspenso, 35 Comedia, 27 Terror, 878 Sci-fi,
10765 Sci-Fi&Fantasy tv, 10751 Familia, 10762 Kids tv, 16 Animación, 10749
Romance, 10752 Guerra, 10768 War&Politics tv, 99 Documental, 14 Fantasía, 80
Crimen).

**IDs de keyword: confirmados contra TMDB** (`GET /search/keyword`):
christmas `207317`; alien `9951` / alien invasion `14909` / extraterrestrial
`9739`; space `9882` / space travel `3801` / spacecraft `1612`; survival
`10349` / disaster `10617` / natural disaster `5096`.

**Limitación TMDB — género y keyword se combinan con AND, no OR:** `discover`
manda `with_genres` y `with_keywords` como params separados, que TMDB cruza con
AND. Por eso ningún chip mezcla género + keyword en una misma regla (daría casi
vacío). "Historias reales" queda como género Documental `[99]` solo (documentales
+ docuseries); no incluye biopics/based-on-true-story por esta limitación.

### Layout / CSS

- Nueva estructura en `.finder`: `.finder-head` (título) + dos bloques, cada uno
  con `.chip-group-label` (texto) + `.chip-slider` (los chips del grupo).
- Clase nueva `.chip-group-label` en `app/globals.css` (texto chico, en
  mayúsculas/`--faint`, alineado con el estilo del `.finder-head`). Sin
  CSS-in-JS; reusa `.chip-slider` y `.chip`.

## No-objetivos / YAGNI

- No se agrega IA ni búsqueda por texto.
- No se toca `components/data.ts` (`GENRES`/`SHELVES`/páginas de género).
- No se filtra por certificación de edad estricta (movie-only e incompleta en
  AR — limitación conocida). "ATP" en Familiar se cubre por género
  (Familia/Kids/Animación).
- No se cambia el motor determinístico del pool ni "Mostrame otras".

## Limitaciones (no son bugs)

- **AR + flatrate fijos:** algunos temas pueden traer pocos resultados según las
  plataformas del usuario (ej. "Magia navideña" fuera de temporada). El pool
  muestra lo que exista + "Mostrame otras" (mismo comportamiento actual).
- Los chips por **keyword** dependen del etiquetado de TMDB (taxonomía
  imperfecta); se eligen los keywords que mejor cubran cada tema.

## Verificación

- `npx tsc --noEmit` sin errores.
- Chequeo visual/funcional en el Home:
  - Título "¿Qué te inspira hoy?", sin buscador de texto.
  - Dos grupos etiquetados con 7 y 9 chips.
  - Click en cada chip carga contenido acorde (spot-check de varios, incluidos
    los de keyword: navidad, aliens, espacio, supervivencia).
  - "Mostrame otras", "Restablecer" y el toggle activo siguen funcionando.
