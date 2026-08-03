# Toggle Películas/Series por riel en el Home

Fecha: 2026-08-03
Estado: diseño aprobado, pendiente plan de implementación

## Problema

En el Home, los rieles de género muestran un tipo fijo (movie o tv) que alterna
por índice, con un badge estático `· Películas` / `· Series` al lado del título.
El usuario no puede elegir: si el riel de "Terror" es de series, no hay forma de
ver películas de terror en ese mismo riel.

## Objetivo

Reemplazar el badge fijo por un **toggle de dos estados Películas | Series** al
lado del título de cada riel afectado. El tipo activo se muestra resaltado
(coral) y el inactivo en gris; al hacer click, ese riel pasa a mostrar el tipo
elegido. Se comporta y se lee como un par de botones.

## Alcance

Rieles del Home que reciben el toggle:

- **Los 6 rieles de género** (`SHELVES`): acción, sci-fi, terror, drama,
  comedia, documental.
- **Los 2 rieles de votos**: "Lo más votados" (`/api/mas-votados`) y
  "Hacete cargo" (`/api/hacete-cargo`).

**Fuera de alcance** (sin toggle): "Últimos lanzamientos" (solo movie por
diseño), "Directores" (PersonRail, no es catálogo de títulos), y los rieles de
las páginas Películas/Series (ya están acotados por tipo a nivel de página
completa).

## Decisiones de diseño (aprobadas)

1. **Dos estados en todos los rieles con toggle** (Películas | Series). Sin
   estado "Todo", para consistencia visual entre los 8 rieles.
2. **Default = alternancia actual** en los rieles de género: el que hoy nace
   `movie` arranca en Películas, el que nace `tv` arranca en Series. Preserva la
   variedad del Home (mitad pelis, mitad series al cargar).
3. **Default = Películas** en los 2 rieles de votos. (Estos hoy mezclan
   movie+tv por rating; con un toggle de 2 estados arrancan mostrando solo
   películas, y las series votadas aparecen al tocar "Series". Trade-off
   aceptado explícitamente.)
4. **La elección se recuerda** por riel en localStorage. Al volver al Home, cada
   riel recuerda el último tipo elegido.

## Arquitectura

### Componente `ShelfTypeToggle`

Nuevo control chico, ubicado en `.shelf-head`, a la derecha del `<h2>` y a la
izquierda de las flechas (o bajo el título, según se vea mejor en el ajuste
final de CSS).

- `role="group"` con dos `<button type="button">`: "Películas" y "Series".
- Cada botón: `aria-pressed={activo}`, navegable por teclado.
- Clase `.is-active` en el botón del tipo seleccionado (coral vía `--brand`),
  el otro en gris (`--faint`).
- Props: `value: MediaType`, `onChange: (t: MediaType) => void`.
- Sin CSS-in-JS: clases nuevas en `app/globals.css`
  (`.shelf-toggle`, `.shelf-toggle button`, `.shelf-toggle .is-active`).

### Hook `useShelfType`

Encapsula lectura/escritura de la preferencia por riel.

```
useShelfType(shelfKey: string, initial: MediaType): [MediaType, (t: MediaType) => void]
```

- `shelfKey`: identificador estable del riel → el slug del género
  (`terror`, `accion`, …) para los de género, y `mas-votados` /
  `hacete-cargo` para los de votos.
- Estado local inicializado con `initial` (para no romper la hidratación).
- En `useEffect` de montaje lee `localStorage["yump:shelf-type"]` (un objeto
  `{ [shelfKey]: "movie" | "tv" }`); si hay valor guardado para ese `shelfKey`,
  lo aplica.
- El setter actualiza el estado y persiste el objeto mergeado en localStorage.
- Consecuencia aceptada: si hay un valor guardado distinto del `initial`, el
  riel de género puede hacer un segundo fetch al aplicar el guardado. Es
  aceptable (los rieles ya cargan async con "Cargando…").

### Dos mecanismos de cambio dentro de `Shelf`

`Shelf` recibe un prop nuevo `typeToggle?: "refetch" | "filter"`. Cuando está
presente, renderiza el `ShelfTypeToggle` y usa `useShelfType` para el estado.

- **`"refetch"` (rieles de género):** el `tipo` actual entra en la URL de
  `/api/discover?tipo=X` y en las deps de `useApi`. Cambiar el toggle
  reconstruye la URL y `useApi` refetchea. Es obligatorio refetchear porque
  TMDB usa géneros/keywords distintos para movie vs tv (ej. terror en TV se
  resuelve con keyword 9799, ver `lib/categories.ts`).
- **`"filter"` (rieles de votos):** el endpoint devuelve una lista **mixta** con
  `type` por ítem. El toggle **no** refetchea: filtra en cliente los ítems ya
  cargados por `t.type === tipoActual`. Cero fetch extra.

Cuando `typeToggle` no se pasa, `Shelf` se comporta exactamente como hoy
(rieles de las páginas Películas/Series, "Últimos lanzamientos", etc.).

### Cambios en `CatalogView` (modo "inicio")

- Rieles de género: agregar `typeToggle="refetch"` y pasar el `initial` según la
  alternancia por índice (movie → "movie", tv → "tv"). El `tipo` fijo actual
  pasa a ser solo el **default** del toggle. Se retira `showType` de estos
  rieles (el badge lo reemplaza el toggle).
- Rieles de votos: agregar `typeToggle="filter"` con `initial="movie"`
  (default Películas).

## Empty-state (evita una trampa)

Hoy `Shelf` hace `if (!loading && items.length < 2) return null`. Con el toggle,
si el usuario cambia a un tipo que tiene <2 resultados, el riel entero (con su
toggle) desaparecería y no podría volver.

Fix para los rieles con `typeToggle`: cuando ya hubo respuesta pero el tipo
elegido queda con <2 ítems, **mantener visible el header + toggle** y mostrar un
mensaje corto (ej. "No hay series de terror en tus plataformas") en lugar de
desmontar el riel. Los rieles sin toggle conservan el comportamiento actual
(se auto-ocultan).

## No-objetivos / YAGNI

- No se agrega estado "Todo".
- No se cambian los endpoints ni `lib/enrich.ts` (los votos se filtran en
  cliente; discover ya acepta `tipo`).
- No se toca la Fase 2 multi-región ni los rieles fuera de alcance.

## Verificación

- `npx tsc --noEmit` sin errores.
- Chequeo visual/funcional en el Home:
  - El toggle aparece en los 8 rieles, con default correcto (alternancia en
    género, Películas en votos).
  - Click en Series en "Terror" recarga con series de terror; el activo pasa a
    coral.
  - La elección persiste al recargar / volver al Home.
  - Un tipo sin resultados muestra el mensaje y no oculta el riel.
  - Los rieles fuera de alcance quedan igual que antes.
