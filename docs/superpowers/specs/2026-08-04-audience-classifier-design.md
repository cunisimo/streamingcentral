# Clasificación de audiencia (family/adulto) — capa de negocio backend

Fecha: 2026-08-04
Estado: diseño aprobado, pendiente plan de implementación

## Objetivo

TMDB mezcla contenido infantil con adulto dentro de los carruseles de género
(ej. en Comedia aparecen Deadpool y Peppa Pig juntos). Se agrega una capa de
clasificación de audiencia en el backend que:

1. Excluye contenido `family` de los carruseles de géneros general/adulto.
2. Agrega dos carruseles nuevos: 🍿 Para toda la familia y 🎬 Animación para adultos.
3. Vive en un único módulo (`lib/audience.ts`), sin reglas duplicadas ni lógica
   en React.

Enfoque elegido (opción A): la audiencia es una **capa de negocio a nivel query**
(recetas de filtros TMDB), NO un atributo por título guardado en Supabase. Se
respeta la arquitectura actual ("TMDB es la fuente, no se replica"): cero
replicación de catálogo, cero costo por título (TMDB filtra server-side), cero
tabla nueva.

## Decisiones (aprobadas)

- **Módulo único** `lib/audience.ts` = fuente de verdad. Cambiar el criterio de
  qué es family/adulto se hace en un solo lugar.
- **Exclusión de family por tipo de sección, no global.** Aplica a géneros
  general/adulto (Acción, Terror, Drama, Comedia, Sci-Fi, Suspenso, Crimen,
  Aventura, Misterio, Documental, Romance). NO aplica a categorías de naturaleza
  animación/familiar (`animacion`, `familiar`, y las audiencias) para que un
  futuro carrusel de Animación no pierda su contenido familiar.
- **Alcance:** todo el browsing de género pasa por `listByCategory`, así que la
  exclusión se aplica ahí (un solo punto): Home shelves, `/categoria`,
  recomendador (con género), grids del buscador. Las queries sin género
  (`todos`, latest) NO se tocan.
- **Home:** se agregan los 2 carruseles tras los rieles de género; **se saca el
  riel Directores** (accesible por el chip Directores del buscador).
- `content_type` (anime/reality/standup/…) se difiere: en este enfoque no hay
  nada que persistir; serán recetas futuras en el mismo módulo, sin rework.

## Arquitectura

### `lib/audience.ts` (nuevo, fuente de verdad)

```
FAMILY_GENRES = [10751, 10762]   // Family (movie+tv), Kids (tv)

// Géneros/categorías EXENTOS de la exclusión de family (naturaleza animación/familiar).
EXEMPT = new Set(["animacion", "familiar"])

// ¿Este slug de género excluye family? true para adultos/general; false para
// exentos, "todos" y sin género.
excludeFamilyFor(slug?: string): boolean
  = !!slug && slug !== "todos" && !EXEMPT.has(slug)

// Recetas de los carruseles de audiencia, por tipo. Rule reutiliza el shape de
// discover: { genres?, keywords?, withoutGenres?, certLte?, certGte? }
AUDIENCES: Record<"family" | "adult-anime", { movie: Rule; tv: Rule }>
```

Recetas (IDs validados contra TMDB):

| Audiencia | movie | tv |
|---|---|---|
| `family` | `genres=[10751]` + `cert.lte=PG` | `genres=[10762]` |
| `adult-anime` | `genres=[16]` `without_genres=[10751]` `cert.gte=PG-13` | `genres=[16]` `without_genres=[10762]` |

Exclusión en géneros adultos: `without_genres = [10751, 10762]`.

### Integración en el pipeline existente

- **`lib/tmdb.ts` `DiscoverOpts` + `discover()`:** agregar soporte para
  `withoutGenres?: number[]` → `without_genres` (join con coma = AND de
  exclusión). (Hoy solo hay genres/keywords/originCountry/extra.)
- **`lib/enrich.ts` `listByCategory`:** al armar la query, si
  `excludeFamilyFor(opts.genre)` → pasar `withoutGenres: FAMILY_GENRES` a
  `discover`. Es el único punto; cubre Home/categoria/recomendador/buscador.
- **`lib/enrich.ts` `audienceTitles(slug, providers)` (nuevo):** para los
  carruseles de audiencia. Consulta movie+tv con la receta de `AUDIENCES[slug]`
  (vía `discover` con genres/withoutGenres/cert), mergea y filtra a plataformas
  (mismo patrón que `recommendations`/`mostVoted`). Devuelve `UITitle[]`.
- **`GET /api/audience?a=family|adult-anime` (nuevo, `force-dynamic`):** parsea
  `a` + `providers`, llama `audienceTitles`. Igual de fino que las otras rutas.

### Frontend (mínimo, sin reglas de negocio)

- **`components/CatalogView.tsx` (Home):** tras el `SHELVES.map`, agregar dos
  `<Shelf>` (mismo componente):
  - `<Shelf title="Para toda la familia" url="/api/audience?a=family" seeAllHref="/lista/familia" />`
  - `<Shelf title="Animación para adultos" url="/api/audience?a=adult-anime" seeAllHref="/lista/anime-adulto" />`
    (los `seeAllHref` son opcionales; si no hay página de lista, se omiten.)
  - **Quitar** el `<PersonRail title="Directores" …>`.
- Los títulos de los carruseles pueden llevar emoji en el string
  ("🍿 Para toda la familia", "🎬 Animación para adultos").

## Extensibilidad (sin cambiar arquitectura)

- **Perfiles (Family/Adulto/Infantil):** un perfil = un set de modificadores de
  query definidos en `lib/audience.ts` (ej. perfil Infantil = solo family;
  perfil Adulto = excluir family siempre). Se aplican en `listByCategory` según
  el perfil activo. No requiere tabla ni cambio de pipeline.
- **`content_type` / secciones futuras (Anime, Reality, Stand-up, Conciertos):**
  nuevas entradas en `AUDIENCES` (o un `SECTIONS` análogo) con su receta de
  discover. Cada sección nueva = un `<Shelf url="/api/audience?a=…">`. Sin sync,
  sin tabla, sin tocar el motor.

## No-objetivos / YAGNI

- No se replica el catálogo en Supabase ni se crea tabla de clasificación.
- No se toca el orden de las secciones existentes del Home.
- No se persiste `content_type` ahora (no hay store; sería recetas futuras).
- No se cambia el comportamiento de queries sin género (latest, recomendador
  "todos").

## Verificación

- `npx tsc --noEmit` sin errores.
- Recetas validadas contra TMDB (curls): family (Toy Story/Peppa),
  adult-anime (Rick y Morty/Demon Slayer), comedia sin family (Deadpool, sin
  Peppa). Re-verificar por endpoint tras implementar.
- Chequeo visual en el Home:
  - Comedia/Terror/etc. sin dibujos infantiles.
  - Aparecen "🍿 Para toda la familia" y "🎬 Animación para adultos" tras los
    géneros; usan el mismo card/riel.
  - No está el riel Directores.
  - `/categoria/animacion` conserva su contenido familiar (exento).
  - recomendador "todos" y últimos lanzamientos sin cambios.
