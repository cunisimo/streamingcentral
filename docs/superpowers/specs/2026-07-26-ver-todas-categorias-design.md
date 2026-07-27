# "Ver todas" + páginas de categoría (estilo Netflix) — diseño

Fecha: 2026-07-26
Estado: aprobado (brainstorming), pendiente de plan.
Grupo C de la tanda de retoques (A y B ya mergeados). Incluye C1 (páginas de
categoría ricas) + C2 (páginas simples de especiales y directores).

## Objetivo

Cada slider del home suma una card final **"Ver todas →"** que lleva a una
sección dedicada:

- **Sliders de género** (Acción, Drama, …) → página de categoría **rica**:
  filtro pelis/series + sub-sliders estilo Netflix armados por **cruce de
  género** (Acción + Comedia, + Sci-fi, …).
- **Sliders especiales** (Últimos lanzamientos, Lo más votados, Hacete cargo) →
  página **simple**: grilla con la lista completa del endpoint.
- **Riel de Directores** → página **simple**: grilla de directores (personas).

Sin cambios de schema. Región AR y filtro por plataformas se mantienen (todo
pasa por `/api/discover` + `listByCategory`, que ya filtran).

## Decisiones tomadas (brainstorming)

- Alcance: **rico solo en géneros**; especiales y directores → páginas simples.
- Subcategorías = **cruces de género** (genérico para las 12 categorías; los
  cruces sin catálogo se auto-ocultan).

## 1. Tile "Ver todas" en los sliders

`components/Shelf.tsx` y `components/PersonRail.tsx` reciben una prop
`seeAllHref?: string`. Cuando está seteada, renderizan una card final
**"Ver todas →"** dentro del track (misma medida que las cards; estilo nuevo
`.seeall-card` en `globals.css`). `CatalogView` pasa el href por slider:

- Género: `/categoria/${slug}?tipo=${tipo}` (el home alterna movie/tv; se pasa
  el tipo que se está mostrando como default de la página).
- Especiales: `/lista/ultimos`, `/lista/mas-votados`, `/lista/hacete-cargo`.
- Directores: `/directores`.

Los sub-sliders **dentro** de una página de categoría no llevan "Ver todas".

## 2. Página de categoría rica — `/categoria/[slug]`

`app/categoria/[slug]/page.tsx` (server, valida el slug contra `CATEGORIES`,
404 si no existe) monta `components/CategoryView.tsx` (client).

**CategoryView:**
- Header: `categoryLabel(slug)` + subtítulo corto.
- **Filtro Películas / Series**: toggle de 2 estados. Default = `tipo` de la
  query (`?tipo=`), fallback `movie`. Cambiar el toggle re-renderiza los
  sliders con el nuevo `tipo`.
- **Primera fila** "Populares en {Categoría}": `<Shelf tipo genre={slug}>` (sin
  `genre2`), orden por popularidad (default de discover).
- **Sub-sliders por cruce**: por cada otra categoría `Y` en `CATEGORIES`
  (excluyendo el slug actual y `documental`), un `<Shelf>` con título
  `"{Categoría} + {Y.label}"` apuntando a
  `/api/discover?tipo=${tipo}&genre=${slug}&genre2=${Y.slug}`. Cada `Shelf` se
  auto-oculta si trae < 2 títulos (comportamiento existente), así que cada
  categoría muestra solo los cruces con catálogo en las plataformas del usuario.
- Reusa `Shelf` (que ya acepta `url` custom y agrega `providers`). Estado
  offline: el primer `Shelf` reporta con `onOffline` (patrón de CatalogView).

Orden de cruces: el de `CATEGORIES` (accion, drama, comedia, terror, scifi,
suspenso, crimen, aventura, animacion, misterio, romance), saltando el propio y
documental → hasta ~9 sub-sliders, la mayoría auto-ocultándose por categoría.

## 3. Extensión de `/api/discover` — `genre2` (cruce con AND)

Punto técnico clave: **`discover` une `with_genres` con `|` (OR)**
(`lib/tmdb.ts:79`). Un cruce "Acción + Comedia" necesita **AND**
(`with_genres=28,35`). Reglas del combine:

- `resolveCategory(slug, tipo)` y `resolveCategory(genre2, tipo)` devuelven cada
  uno `{ genres?, keywords? }`.
- **genre + genre** (ambos aportan `genres`, ej. movie 28 + 35): pasar
  `with_genres` **coma-separado (AND)**. Como `discover` arma el `|` desde
  `o.genres`, el combine se pasa vía `extra: { with_genres: [...g1, ...g2].join(",") }`
  (el `Object.assign(p, o.extra)` de `discover` pisa el `with_genres` OR).
- **genre + keyword** (ej. Acción tv 10759 + Terror tv keyword 315058):
  `with_genres` y `with_keywords` son params separados y se aplican juntos (AND
  natural). Se mergean `genres` y `keywords` de ambos rules sin coma-join
  especial (un solo id de cada lado → el `|` no cambia el resultado).
- **keyword + keyword**: mergear keywords con el `|` existente (**OR**). Es un
  caso rarísimo (terror+suspenso en TV, ambos por keyword); se acepta OR ahí —
  no se agrega coma-join de keywords.

Implementación: `listByCategory` acepta `genre2?: string`; calcula el rule
combinado y arma el `extra` de AND cuando ambos aportan géneros.
`app/api/discover/route.ts` lee `genre2` y lo pasa. El resto de la cadena
(providers, slice 20, filtro por plataforma) no cambia.

## 4. Páginas simples (C2)

### Especiales — `/lista/[key]`

`app/lista/[key]/page.tsx` (server, valida `key`) → `components/ListaView.tsx`
(client). Mapa `key → { endpoint, title }`:

- `ultimos` → `/api/latest`, "Últimos lanzamientos"
- `mas-votados` → `/api/mas-votados`, "Lo más votados"
- `hacete-cargo` → `/api/hacete-cargo`, "Hacete cargo"

`ListaView` hace `useApi` sobre el endpoint (con `providers`) y muestra los
títulos en `.grid` (patrón de `FilterGrid`), con estado offline y "N títulos".

**Limitación honesta:** estos endpoints cap­ean en ~20 títulos
(`listByCategory` hace `slice(0,20)`), así que "Ver todas" muestra la lista
completa **actual** del endpoint, no una paginación infinita. No se agrega
paginación a esos endpoints en este alcance.

### Directores — `/directores`

`app/directores/page.tsx` → grilla de personas desde `/api/directores`
(devuelve `{ people }`). Reusa `PersonCard` en un `.people-grid` (grilla, no
riel). Estado de carga simple.

## Componentes / archivos

Crear:
- `app/categoria/[slug]/page.tsx`, `components/CategoryView.tsx`
- `app/lista/[key]/page.tsx`, `components/ListaView.tsx`
- `app/directores/page.tsx` (+ grilla de PersonCard; puede ir inline o un
  `PersonGrid.tsx` chico)

Modificar:
- `components/Shelf.tsx` — prop `seeAllHref` + card "Ver todas".
- `components/PersonRail.tsx` — prop `seeAllHref` + card "Ver todas".
- `components/CatalogView.tsx` — pasar `seeAllHref` a cada slider del home.
- `app/api/discover/route.ts` — param `genre2`.
- `lib/enrich.ts` — `listByCategory` acepta `genre2` (combine con AND).
- `app/globals.css` — `.seeall-card`, estilos de la página de categoría (toggle,
  grillas), `.people-grid`.

Fuera de alcance: schema, modelo de votos, SW (rutas nuevas same-origin: el SW
las trata como navegación Network First, sin cambios).

## Verificación

- `npx tsc --noEmit` sin errores.
- Home: cada slider de género/especial y el riel de directores muestran la card
  "Ver todas" al final.
- `/categoria/accion?tipo=movie`: header "Acción", toggle pelis/series, fila
  "Populares en Acción", y sub-sliders "Acción + X" (los con catálogo). Cambiar
  a Series recarga los sliders con tv.
- Cruce AND real: "Acción + Comedia" trae títulos que son de ambos géneros (no
  la unión).
- `/lista/mas-votados`, `/lista/ultimos`, `/lista/hacete-cargo`: grilla con la
  lista del endpoint.
- `/directores`: grilla de directores; cada uno linkea a `/persona/[id]`.
- Ningún cambio en el modelo de votos ni en los shelves del home (solo se les
  agrega el tile).
