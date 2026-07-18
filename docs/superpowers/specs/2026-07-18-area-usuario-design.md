# Área de usuario — Diseño

Fecha: 2026-07-18
Estado: aprobado para pasar a plan de implementación.

## Objetivo

Convertir `/cuenta` (hoy: un input de nombre suelto) en un **hub de usuario**
real, ahora que el login público está activo. El usuario logueado entra y ve
sus cosas: Mi lista, Me gustaron, Vistos recientemente, y su perfil (nombre +
avatar). "Mis amigos" y "Mis emblemas" quedan como tiles *próximamente* (se
construyen en iteraciones futuras, no en este spec).

## Problema concreto que dispara esto

Al hacer click en el nombre (TopBar → `/cuenta`), el usuario logueado ve
únicamente el componente `Perfil`: un input "Nombre para mostrar" precargado +
botón Guardar. Como no hay nada más, se siente como "me vuelve a pedir el
nombre que ya di al registrarme". No es un bug de datos (el nombre está bien
guardado en `profiles` y en el metadata de auth); es que la pantalla no es un
hub. La edición de nombre se mueve dentro de "Mi perfil" y deja de ser lo
primero (y único) que se ve.

## Alcance

**Dentro de este spec:**
- Hub `/cuenta` (logueado) con header de perfil + rieles + tiles próximamente.
- `/cuenta/perfil`: editar nombre, elegir avatar, cerrar sesión.
- `/cuenta/lista`, `/cuenta/gustaron`, `/cuenta/vistos`: grilla completa ("ver todo").
- "Mi lista" **de verdad** (hoy es `useState` falso en `DetailView`).
- "Ya la vi" (marca explícita, base de los emblemas futuros).
- "Vistos recientemente" (historial automático de fichas abiertas).
- "Me gustaron" (derivado de `votes` con rating 2 o 3, sin tabla nueva).
- Avatares generados por código (DiceBear), random al registrarse, elegibles.

**Fuera (placeholders "próximamente", pedidos pero no construidos):**
- "Mis amigos" (RRSS interna para compartir listas).
- "Mis emblemas" (gamificación por cantidad de vistas, etc.).

## Restricción de arquitectura que manda el diseño

**No hay sesión del lado servidor.** `supabaseServer()` es anónimo y la sesión
vive en `localStorage` del browser (no hay `@supabase/ssr` ni cookies). Una
ruta API **no sabe quién es el usuario**. El `LikeButton` ya opera con esto:
escribe votos directo desde el browser con RLS.

Decisión: **no se reescribe el auth.** Se adopta el patrón que ya existe.

### Enfoque elegido (A): browser escribe, server solo enriquece por ids

- El browser lee/escribe las filas del usuario directo en Supabase (RLS,
  "cada uno lo suyo"), igual que los votos.
- Para pintar cards, el browser junta los `ids` de sus filas y llama a una
  ruta pública `GET /api/cards?items=movie:123,tv:45` que enriquece con TMDB.
- El enriquecido por título ya está cacheado en Redis, así que la ruta se
  comparte entre usuarios sin costo extra.

Descartados: (B) migrar a `@supabase/ssr` con cookies — alto blast radius,
toca auth que funciona; (C) pasar el JWT a cada ruta — mete manejo de tokens
en todas las rutas sin necesidad.

## Modelo de datos (Supabase, RLS "cada uno lo suyo")

Todo va en `supabase/schema.sql`, siguiendo el estilo existente (comentarios en
español, `drop policy if exists` idempotente).

### `profiles` — nueva columna de avatar

```sql
alter table profiles add column if not exists avatar_seed text;
-- Backfill: quien no tenga seed queda con uno determinístico (su id) hasta
-- que elija otro desde Mi perfil.
update profiles set avatar_seed = id::text where avatar_seed is null;
```

El trigger `handle_new_user()` se actualiza para setear un `avatar_seed` random
al crear el perfil (p.ej. `gen_random_uuid()::text`), así el usuario nuevo
arranca con un avatar ya asignado.

### `user_items` — Mi lista + Ya la vi (una tabla, `kind` las separa)

```sql
create table if not exists user_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  tmdb_id    integer     not null,
  tipo       text        not null check (tipo in ('movie','tv')),
  kind       text        not null check (kind in ('list','watched')),
  created_at timestamptz not null default now(),
  unique (user_id, tmdb_id, tipo, kind)
);
alter table user_items enable row level security;
drop policy if exists "cada uno gestiona sus items" on user_items;
create policy "cada uno gestiona sus items" on user_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Una sola tabla porque "list" y "watched" son idénticas en forma; `kind` las
distingue. `kind='watched'` es lo que van a contar los emblemas futuros.

### `view_history` — Vistos recientemente

```sql
create table if not exists view_history (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid        not null references auth.users (id) on delete cascade,
  tmdb_id   integer     not null,
  tipo      text        not null check (tipo in ('movie','tv')),
  viewed_at timestamptz not null default now(),
  unique (user_id, tmdb_id, tipo)
);
alter table view_history enable row level security;
drop policy if exists "cada uno gestiona su historial" on view_history;
create policy "cada uno gestiona su historial" on view_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Separada de `user_items` porque tiene semántica de recencia: al abrir una ficha
se hace `upsert` con `onConflict: user_id,tmdb_id,tipo` actualizando
`viewed_at`. Se lee `order by viewed_at desc` y se cortan las primeras N.

### `votes` (ya existe) — "Me gustaron"

Sin cambios. "Me gustaron" = filas del usuario con `rating in (2,3)`, leídas
por RLS desde el browser. No hace falta tabla ni función nueva.

## Capa de datos del browser: `lib/userdata.ts`

Funciones que usan `supabaseBrowser()` (RLS). Todas requieren usuario logueado;
sin sesión devuelven vacío o no-op.

- `getList()` / `toggleList(tmdb_id, tipo)` → `user_items` kind='list'.
- `getWatched()` / `toggleWatched(tmdb_id, tipo)` → `user_items` kind='watched'.
- `recordView(tmdb_id, tipo)` → upsert en `view_history`.
- `getHistory(limit)` → `view_history` ordenado por `viewed_at` desc.
- `getLiked()` → `votes` con `rating in (2,3)`.

Cada `get*` devuelve `{ tmdb_id, tipo }[]` (los ids); el enriquecido lo hace la
ruta `/api/cards`. Los toggles hacen escritura optimista con rollback si
Supabase devuelve error (patrón `LikeButton`).

## Ruta API: `GET /api/cards`

Fina, como las demás (`force-dynamic`). Parsea `items=movie:123,tv:45` y llama
a `cardsByIds(pairs)` en `enrich.ts`.

- `cardsByIds(pairs)` reusa `titleCard(tipo, id)` (mismo motor que `mostVoted`),
  marca `hasEditorial` con `publishedIds()`, y devuelve `UITitle[]` preservando
  el orden recibido.
- **No filtra por plataforma**: las listas del usuario se muestran completas
  (decisión del dueño). `TitleCard` sigue marcando disponibilidad con el campo
  `platforms` del propio título.
- Ids inválidos se ignoran. Ante error, `{ items: [] }`, nunca un 500 que
  rompa el hub.

## Páginas y componentes

### Páginas (client, con `TopBar` + `BottomNav`)

- `/cuenta` — logueado: `UserHub`. Deslogueado: el `Acceso` (login/registro/
  recuperar) que ya existe hoy.
- `/cuenta/perfil` — `Perfil` reformado: nombre + `AvatarPicker` + cerrar sesión.
- `/cuenta/lista` · `/cuenta/gustaron` · `/cuenta/vistos` — grilla completa.

### Componentes nuevos

- `UserHub.tsx` — header (avatar + "Hola, {nombre}" + "Editar perfil ›"), tres
  `UserShelf`, y los dos tiles próximamente (Amigos / Emblemas, deshabilitados
  con candado).
- `UserShelf.tsx` — recibe una función `loader` (uno de los `get*`), obtiene los
  ids, llama a `/api/cards`, pinta con `TitleCard`. Prop `full` para variante
  grilla (páginas "ver todo").
- `AvatarPicker.tsx` — grilla de ~16 variantes (seeds random) + "más"; al elegir
  guarda el seed vía `updateAvatarSeed`.
- `lib/avatar.ts` — `avatarSvg(seed)` con DiceBear, style fijo `fun-emoji`
  (caritas simpáticas y coloridas; el style es una constante, cambiarlo es una
  línea). SVG generado local (sin red, sin copyright). Se usa en el hub y en
  `TopBar`.

### Cambios en componentes existentes

- `AuthContext.tsx` — agregar `avatar_seed` a `Profile` y a `loadProfile`; agregar
  `updateAvatarSeed(seed)` (update en `profiles` + espejo opcional en metadata).
- `TopBar.tsx` — se mejora el acceso a la cuenta: logueado, en vez del nombre +
  ícono genérico, muestra un **círculo chico con el avatar** del seed (borde
  sutil, clickeable → `/cuenta`). Deslogueado, un chip "Ingresar". Sin texto de
  nombre en la barra.
- `DetailView.tsx` — la barra de acciones: "Mi lista" pasa de `useState` falso a
  `toggleList`/`getList` real; se agrega "Ya la vi" (`toggleWatched`); el voto
  queda igual. Al montar, si hay sesión, dispara `recordView()` (silencioso).
- `app/cuenta/page.tsx` — enruta a `UserHub` (logueado) o `Acceso` (deslogueado);
  el `Perfil` inline actual se muda a `/cuenta/perfil`.

## UX por sección

### Hub

Header con avatar/nombre/editar. Tres rieles (Mi lista, Me gustaron, Vistos
recientemente) con "ver todo". Cada riel se auto-oculta si está vacío, **salvo
Mi lista**, que muestra un empty-state: "Todavía no guardaste nada — tocá 'Mi
lista' en cualquier ficha". Abajo, tiles Amigos/Emblemas en *próximamente*.

### Deslogueado y edge cases

- Mi lista / Ya la vi / voto requieren login (consistente con los votos). El
  botón se muestra pero al tocarlo deslogueado lleva a `/cuenta`.
- `view_history` solo se registra logueado.
- Sin plataformas elegidas: las listas se muestran igual (no se filtran).
- Título de tu lista que ya no está en tus plataformas: aparece igual; la card
  marca disponibilidad.

## Manejo de errores

- Toggles optimistas con rollback ante error de Supabase (patrón `LikeButton`).
- `/api/cards` nunca tira 500 al hub: ids malos se ignoran, error → `items: []`.
- Los `get*` sin sesión devuelven `[]` (no explotan).

## Testing / verificación

- `npx tsc --noEmit` (0 errores) y `npx next build`.
- Prueba manual end-to-end: agregar a Mi lista en una ficha → aparece en el hub
  y en `/cuenta/lista`; marcar "Ya la vi" → persiste al recargar; votar ta
  buena/petacular → aparece en "Me gustaron"; abrir varias fichas → aparecen en
  "Vistos recientemente" ordenadas por recencia; elegir un avatar → se refleja
  en el TopBar y el hub; deslogueado → los botones de acción llevan a login.

## Migración

Requiere re-correr `supabase/schema.sql` en el SQL editor de Supabase (agrega
`avatar_seed`, `user_items`, `view_history` y actualiza `handle_new_user()`).
Idempotente, seguro de re-correr.
