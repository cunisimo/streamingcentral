# Nav (inferior + superior) y buscador unificado

Fecha: 2026-08-03
Estado: diseño aprobado, pendiente plan de implementación

## Objetivo

Reordenar la navegación y unificar todo el "browse" en el buscador:

- **Nav inferior:** sacar Películas/Series, mover ahí "Buscador" (que estaba en el
  nav superior), renombrar Cuenta → "Mi cuenta".
- **Nav superior:** donde estaba la lupa, poner la banderita 🇦🇷 (indicador de
  región, no selector).
- **Buscador (`/buscar`):** único lugar de browse. Título "¿Qué vemos hoy?",
  agregar pastilla "Directores", tiles de "Explorar todo" con imágenes no
  repetidas + lavado de color, y click en un género que lleve a `/categoria/[slug]`
  (igual que "Ver todo" del Home).
- **Eliminar** `/peliculas` y `/series` y limpiar el código que queda huérfano.

## Decisiones (aprobadas)

- Banderita del nav superior: **🇦🇷 estática, informativa** (no selector; la
  región sigue fija en AR, el multi-región es Fase 2 diferida).
- `/peliculas` y `/series`: **eliminar las rutas** (todo el browse vive en el
  buscador).
- El filtro **por país** del buscador sigue mostrando resultados **inline** (como
  hoy); solo los tiles de **género** navegan a `/categoria/[slug]`.

## A. Nav inferior (`components/BottomNav.tsx`)

Queda con 4 ítems, en orden: **Inicio · Buscador · Mi lista · Mi cuenta**.

- Se eliminan los ítems **Series** y **Películas**.
- Se agrega **Buscador**: `href="/buscar"`, ícono lupa (el mismo SVG que hoy usa
  el nav superior), `match` = `p.startsWith("/buscar")`.
- El ítem de cuenta cambia su label **"Cuenta" → "Mi cuenta"** (mantiene avatar
  cuando hay sesión / ícono de persona cuando no; misma lógica `cuentaOn`).

## B. Nav superior (`components/TopBar.tsx`)

En `.topbar-top` (fila superior derecha), reemplazar el `<Link href="/buscar">`
con la lupa por un indicador estático de región:

- Un `<span className="regionflag" aria-label="Región: Argentina" title="Argentina">🇦🇷</span>`
  (no navega). Se retira el import/uso del ícono de búsqueda de este componente.
- CSS: clase `.regionflag` en `app/globals.css` (tamaño del emoji acorde al área
  donde estaba la lupa; sin cambiar el layout de `.topbar-top`).

## C. Buscador unificado (`components/SearchView.tsx`)

### C.1 Título
`<h1 className="buscar-title">` pasa de "Buscar" a **"¿Qué vemos hoy?"**.

### C.2 Pastilla "Directores"
El tipo `Filter` pasa a `"todo" | "movie" | "tv" | "actores" | "directores"`. Se
agrega la pastilla "Directores" al array de chips. Sin query y con
`filter === "directores"`, se renderiza un nuevo `BrowseDirectors` (espejo de
`BrowseActors`): fetch a `/api/directores`, render de `PersonCard` (cada uno → su
filmografía en `/persona/[id]`). Con query, "Directores" no aporta resultados de
texto (igual que "Actores" hoy, que solo muestra personas del endpoint de
búsqueda) — se mantiene el comportamiento actual de `showPeople` para
`todo`/`actores`; `directores` sin query = browse, con query = sin sección propia.

### C.3 Filtro por país
Sin cambios: el slider "Por país" con las pastillas `🏳️ Nombre` sigue igual,
clickear un país sigue mostrando resultados inline (`ExploreList` por país).

### C.4 "Explorar todo" — tiles de género
Tres cambios sobre la grilla actual:

1. **Click → `/categoria/[slug]`.** Cada tile pasa de `<button onClick={setExplore}>`
   a un `<Link href={`/categoria/${slug}`}>` con la misma clase `.explore-tile`.
   Lleva a la página de categoría (cross-shelves + toggle Películas/Series), igual
   que "Ver todo" del Home. Como los géneros ya no usan el estado `explore`,
   `ExploreList` queda solo para país (se simplifica a su rama de país).

2. **Imágenes no repetidas.** Hoy `genreCovers()` (`lib/enrich.ts`) elige un
   póster por género pidiendo `discover(...).find(withPoster)`, y dos géneros
   pueden caer en el mismo título popular. Se cambia a: por cada género traer
   varios candidatos con póster y asignar, de forma **greedy y secuencial**, el
   primer póster que **no** haya usado un género anterior (set de `poster_path`
   usados). Se bumpea la key de cache `"genre:covers:v1"` → `"genre:covers:v2"`
   para invalidar el cacheado viejo.

3. **Lavado de color (imagen más tenue + diferenciación).** El `style` de cada
   tile agrega, sobre el póster, un gradiente semitransparente del color del
   género (`GENRE_COLOR[slug]`), de modo que la imagen se ve más tenue y el color
   distingue cada categoría. Sin póster, cae al color plano actual. El detalle
   exacto de opacidad se ajusta en implementación (objetivo: color como
   diferenciador dominante, imagen como textura sutil).

## D. Eliminar `/peliculas` y `/series` + limpieza

- **Borrar** `app/peliculas/page.tsx` y `app/series/page.tsx` (pasan a 404).
  Verificado: solo `BottomNav` los linkeaba (y esos ítems se eliminan en A), no
  quedan links colgados.
- **`components/CatalogView.tsx`:** se simplifica a Home únicamente. Se retira el
  prop `mode` (y el tipo `Mode`), la rama no-inicio (líneas ~52-75), el estado
  `genre`/`country`/`filtering` y los imports `GenreSlider`, `CountryFilter`,
  `FilterGrid`. `app/page.tsx` pasa a `<CatalogView />` (sin `mode`).
- **Borrar** `components/FilterGrid.tsx` (solo lo usaba `CatalogView` no-inicio).
- **Borrar** `components/CountryGrid.tsx` (ya está huérfano: sin imports, solo
  referenciado en docs).
- **`components/Filters.tsx` se mantiene** (`GenreSlider`/`CountryFilter` los sigue
  usando `SearchView` → `BrowseTitles`).

## No-objetivos / YAGNI

- No se arranca la Fase 2 multi-región (la banderita es estática).
- No se toca la búsqueda por texto ni la paginación de resultados.
- No se agrega ruta de "país" (el país sigue inline).
- No se toca `Filters.tsx` (sigue en uso).

## Verificación

- `npx tsc --noEmit` sin errores; `npx next build` compila (las rutas borradas no
  deben quedar referenciadas).
- Chequeo visual/funcional:
  - Nav inferior: Inicio · Buscador · Mi lista · Mi cuenta (sin Pelis/Series);
    "Buscador" abre `/buscar`.
  - Nav superior: 🇦🇷 donde estaba la lupa; ya no hay lupa arriba.
  - `/buscar`: título "¿Qué vemos hoy?"; pastilla Directores lista directores;
    tiles de "Explorar todo" con imágenes distintas + lavado de color; click en
    un género lleva a `/categoria/[slug]`; país sigue inline; búsqueda por texto
    intacta.
  - `/peliculas` y `/series` → 404.
