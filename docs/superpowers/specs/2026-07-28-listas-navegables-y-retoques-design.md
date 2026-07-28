# Listas navegables + retoques de UX — diseño

Fecha: 2026-07-28
Estado: aprobado (brainstorming), pendiente de plan.
Continuación de la tanda de retoques (A/B/C ya mergeados).

## Objetivo

Tres grupos de cambios sobre lo recién mergeado (grupo C):

- **G1 — arreglos rápidos:** alto de la card "Ver todas", sacar el autofocus del
  cursor, "Ver todo" en directores, y títulos ingeniosos en los cruces de género.
- **G2 — Directores navegable:** buscador por nombre + 20 + "Cargar más".
- **G3 — Últimos navegable:** filtro Películas/Series + paginado "Cargar más".

Sin cambios de schema, modelo de votos ni Service Worker.

## G1 — Arreglos rápidos

### 1.1 Card "Ver todas" del tamaño del póster

Hoy `.seeall-card` (`app/globals.css:211`) es `align-self:stretch; width:120px` →
se estira a todo el alto de la card (póster + texto) y es más angosta. Debe medir
igual que el **póster** de las cards hermanas:

- En rieles de título (`.track`): `flex:0 0 158px` (140px en `max-width:620px`,
  igual que `.track .card`), `aspect-ratio:2/3` (igual que `.poster`),
  `align-self:flex-start`, `border-radius:var(--radius-sm)`. Así ocupa el alto de
  la imagen, no el del bloque con texto.
- En el riel de directores (`.people-row`): variante `.people-row .seeall-card`
  que matchee el ancho/alto de la card de persona (`.pcard`).

### 1.2 Sacar el autofocus (cursor/teclado que salta solo)

- `components/desempate/DesempateManualSearch.tsx:48`: quitar `autoFocus` del input.
- `components/SearchView.tsx:23`: quitar `useEffect(() => inputRef.current?.focus(), [])`.

En móvil el teclado ya no se despliega solo; el usuario enfoca al tocar. (Si más
adelante se quiere autofocus solo en desktop, es otra iteración; por ahora se saca.)

### 1.3 "Ver todo" en directores

`PersonRail` gana una prop `seeAllLabel?: string` (default "Ver todas"); en
`CatalogView` el riel de Directores la pasa como `"Ver todo"`. (Los rieles de
título siguen con "Ver todas".)

### 1.4 Títulos ingeniosos de los cruces

En `CategoryView`, el título del sub-slider deja de ser `"{Principal} + {Secundario}"`
y pasa a `"{Principal} {frase(secundario)}"`. Mapa `secundario→frase` (aprobado):

| slug secundario | frase |
|---|---|
| comedia | con risas |
| terror | con sustos |
| suspenso | con tensión |
| crimen | con delito |
| romance | con amor |
| scifi | del futuro |
| aventura | a pura aventura |
| drama | para llorar |
| animacion | en dibujos |
| misterio | con enigmas |
| documental | — (excluido de cruces, no aplica) |

El mapa vive como const exportada en `lib/categories.ts` (`CROSS_PHRASE`), y
`CategoryView` arma `${categoryLabel(slug)} ${CROSS_PHRASE[c.slug] ?? "+ " + c.label}`.
La fila principal sigue "Populares en {Género}".

## G2 — Directores navegable

### Datos: lista curada ampliada

`DIRECTOR_IDS` (`lib/enrich.ts:153`) se amplía de ~11 a ~45 directores elegidos a
mano. **Cada TMDB id se resuelve y verifica** (que corresponda al director
correcto) durante la implementación — vía TMDB `/person/[id]` o la búsqueda de la
app; no se agregan ids "a ojo". `/api/directores` sigue devolviendo `{ people }`
con toda la lista curada (cacheada), sin paginación de servidor.

### UI: `DirectoresView`

- **Buscador por nombre**: input controlado; filtra la lista por `name` (case/acentos
  insensible) del lado del cliente.
- **Paginado cliente**: estado `visible` (arranca en 20); botón **"Cargar más"**
  revela +20; se oculta cuando `visible >= filtrados.length`. Al cambiar el texto
  del buscador, `visible` vuelve a 20.
- Grilla `.people-grid` de `PersonCard` (ya existe). Sin buscador/autofocus (G1.2).

## G3 — Últimos navegable

### API: `/api/latest` con `tipo` + `page`

- `app/api/latest/route.ts` lee `tipo` (movie|tv, default movie) y `page` (default 1).
- `lib/enrich.ts` `latestReleases(providers, tipo, page)` branchea por tipo:
  - movie: `sortBy: "primary_release_date.desc"`, `extra: { "primary_release_date.lte": today() }`.
  - tv: `sortBy: "first_air_date.desc"`, `extra: { "first_air_date.lte": today() }`.
  - `minVotes: 5`, `page` pasado a `listByCategory`.

### UI: vista de Últimos con filtro + paginado

`/lista/ultimos` monta un `UltimosView` (dedicado) en vez del `ListaView` genérico:

- **Toggle Películas/Series** (mismo patrón `.tipo-toggle` que `CategoryView`),
  default Películas.
- **Paginado "Cargar más"**: estado `page` + acumulación de items. Cada "Cargar más"
  pide `page+1` y **appendea** a la grilla. Cambiar el toggle resetea a page 1.
  El botón se oculta cuando una página vuelve con < 20 items (fin del catálogo).
- Grilla `.grid` de `TitleCard`, estado offline, contador.

`Lo más votados` y `Hacete cargo` siguen usando el `ListaView` simple (acotados por
votos, sin paginación).

## Componentes / archivos

Modificar:
- `app/globals.css` — `.seeall-card` (tamaño póster) + variante people-row.
- `components/desempate/DesempateManualSearch.tsx` — quitar `autoFocus`.
- `components/SearchView.tsx` — quitar el `.focus()`.
- `components/PersonRail.tsx` — prop `seeAllLabel`.
- `components/CatalogView.tsx` — pasar `seeAllLabel="Ver todo"` a Directores.
- `lib/categories.ts` — `CROSS_PHRASE`.
- `components/CategoryView.tsx` — títulos con `CROSS_PHRASE`.
- `components/DirectoresView.tsx` — buscador + paginado cliente.
- `lib/enrich.ts` — `DIRECTOR_IDS` ampliado (ids verificados) + `latestReleases(tipo, page)`.
- `app/api/latest/route.ts` — params `tipo`/`page`.

Crear:
- `components/UltimosView.tsx` — toggle + paginado.
- `app/lista/[key]/page.tsx` — que `ultimos` monte `UltimosView` (los otros keys, `ListaView`).

Fuera de alcance: schema, votos, SW, y paginación de mas-votados/hacete-cargo.

## Verificación

- `npx tsc --noEmit` sin errores.
- Card "Ver todas" al alto del póster (no del bloque con texto), mismo ancho.
- Abrir Desempate / ir a Buscar: NO salta el teclado ni aparece el cursor solo.
- Directores: tile "Ver todo"; `/directores` con buscador que filtra, 20 iniciales,
  "Cargar más" revela +20; cada director linkea a `/persona/[id]`.
- `/categoria/accion`: sub-sliders "Acción con risas", "Acción del futuro", etc.
- `/lista/ultimos`: toggle pelis/series; "Cargar más" appendea sin recargar; en tv
  muestra series recientes.
- IDs de directores nuevos: cada uno resuelve al director correcto (verificado).
