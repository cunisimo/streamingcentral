-- ============================================================
-- ACTIVO: perfiles de usuario + gate de admin
-- Todo usuario (auth.users) tiene una fila en profiles, creada
-- automáticamente al registrarse. is_admin separa al dueño del
-- proyecto (que edita reseñas editoriales) del público general.
-- ============================================================
create table if not exists profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text,
  is_admin      boolean     not null default false,
  created_at    timestamptz not null default now()
);

-- Avatar. Los dibujos son ARCHIVOS PROPIOS de Yump, servidos desde /avatars/,
-- o sea desde el propio origen: no hay librería de terceros ni petición saliente
-- para generar ni servir un avatar.
--
-- Estas dos columnas guardan únicamente CUÁL eligió cada persona. Ojo con la
-- redacción: `avatar_seed` SE RECOPILA Y SE GUARDA ACÁ, con Supabase como
-- proveedor de servicio — para Data Safety es "recopilado, no compartido". Lo
-- que se eliminó es el envío a DiceBear o a otro tercero.
--
-- QUÉ SIGNIFICA CADA VALOR (lo resuelve lib/avatares.ts → resolverAvatar):
--
--   avatar_style = 'yump'  + avatar_seed = un id del catálogo
--       → elección explícita. Es lo único que escribe la app, y sólo cuando la
--         persona toca Guardar en el selector.
--
--   cualquier otro estilo (incluido NULL) + avatar_seed con algo
--       → mapeo LOCAL y determinístico sobre LEGADO_V1, una lista congelada de
--         31 ids. La misma semilla da siempre el mismo dibujo, en todos los
--         dispositivos, SIN escribir nada en la base. Acá caen los perfiles
--         anteriores al cambio y los que crea el trigger de abajo.
--
--   sin semilla utilizable
--       → el avatar por defecto del catálogo.
--
-- QUÉ SE SACÓ DE ACÁ Y POR QUÉ. Este archivo es RERUNNABLE, y antes tenía dos
-- sentencias que reimponían DiceBear en cada corrida:
--
--   alter table profiles alter column avatar_style set default 'adventurer-neutral';
--   update profiles set avatar_style = 'adventurer-neutral' where avatar_style is null;
--
-- Las dos se eliminaron. El `update` además sobrescribía perfiles existentes.
--
-- LO QUE **NO** SE HACE ACÁ: quitar el default que Producción ya tiene. Un
-- `alter column avatar_style drop default` sería una operación destructiva sobre
-- el esquema vivo, y ESTE archivo no es el lugar para una migración que no está
-- autorizada. El comportamiento buscado es:
--
--   · base NUEVA      → `add column if not exists` crea la columna SIN default.
--   · PRODUCCIÓN      → volver a correr el schema NO toca el default existente
--                       (`'adventurer-neutral'`), porque la columna ya existe y
--                       el `if not exists` no hace nada.
--   · si algún día se decide quitarlo → migración explícita y autorizada, aparte.
--
-- Y no hace falta quitarlo para que el sistema funcione: cualquier estilo
-- distinto de `yump` —incluido `'adventurer-neutral'`, incluido NULL— se resuelve
-- LOCALMENTE por `LEGADO_V1` (lib/avatares.ts). El nombre del estilo viejo quedó
-- como una etiqueta inerte y NO dispara ninguna conexión a DiceBear.
alter table profiles add column if not exists avatar_seed text;
alter table profiles add column if not exists avatar_style text;

-- Backfill de la semilla, y sólo de la semilla. Toca EXCLUSIVAMENTE filas con
-- `avatar_seed` en NULL, así que no pisa la elección de nadie; en una base ya
-- inicializada es un no-op. Sin semilla, todos esos perfiles caerían en el mismo
-- avatar por defecto; con el id como semilla, cada uno recibe uno distinto y
-- estable.
--
-- La semilla es un dato GUARDADO ACÁ, o sea recopilado fuera del dispositivo,
-- con Supabase como proveedor de servicio. Lo que cambió es que ya no se envía a
-- DiceBear ni a terceros para generar ni servir la imagen: el hash que la
-- convierte en un avatar corre en el dispositivo y los WebP salen del propio
-- origen de Yump.
update profiles set avatar_seed = id::text where avatar_seed is null;

alter table profiles enable row level security;

-- Cada uno lee y edita su propio perfil.
drop policy if exists "lectura de perfil propio" on profiles;
create policy "lectura de perfil propio" on profiles
  for select using (auth.uid() = id);

drop policy if exists "edicion de perfil propio" on profiles;
create policy "edicion de perfil propio" on profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- El perfil se crea por trigger (security definer), no desde el cliente,
-- así el usuario nunca elige su propio id ni su is_admin.
--
-- El trigger NO CAMBIÓ y no hace falta ninguna migración. Escribe una semilla
-- aleatoria (`gen_random_uuid()`) y no menciona `avatar_style`, que toma el
-- default de la columna.
--
-- EN PRODUCCIÓN ESE DEFAULT SIGUE SIENDO `'adventurer-neutral'`, así que una
-- cuenta creada hoy nace con ese valor, NO con NULL. Da igual: entra al mapeo
-- local descrito arriba y muestra un avatar propio DESDE EL PRIMER RENDER.
--
-- Migración OPCIONAL, no aplicada y sin autorización: se podría hacer que
-- escriba `avatar_style = 'yump'` y un id del catálogo. No hace falta para que
-- funcione. Ver docs/AVATARES.md.
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, avatar_seed)
  values (new.id, new.raw_user_meta_data ->> 'display_name', gen_random_uuid()::text);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Blindaje: un usuario común no puede auto-promocionarse a admin.
-- Si el UPDATE viene de un cliente logueado (rol 'authenticated', que es el
-- único vector de escalada), is_admin queda como estaba. Desde el SQL editor
-- de Supabase (sin JWT) o service_role sí se puede cambiar, para poder
-- designar admins a mano.
-- `set search_path = public` no es decorativo: sin él, una función
-- `security definer` resuelve los nombres con el search_path de quien la
-- llama, y quien pueda crear objetos en un esquema anterior puede secuestrar
-- lo que la función usa adentro. En Supabase un rol `authenticated` no puede
-- crear objetos, así que hoy no es explotable — pero esta es JUSTO la función
-- que impide la escalada a admin, y sus dos hermanas (`handle_new_user` e
-- `is_admin`) ya lo fijan. La inconsistencia era el problema.
create or replace function protect_is_admin()
returns trigger as $$
begin
  if auth.role() = 'authenticated' then
    new.is_admin := old.is_admin;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists profiles_protect_is_admin on profiles;
create trigger profiles_protect_is_admin
  before update on profiles
  for each row execute function protect_is_admin();

-- Helper reusable para las policies: ¿el usuario actual es admin?
create or replace function is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin
  );
$$ language sql stable security definer set search_path = public;

-- Onboarding: se completa una vez. Los usuarios EXISTENTES se marcan como
-- completado (no deben ver el onboarding); los nuevos arrancan en false.
alter table profiles add column if not exists onboarding_completed boolean;
update profiles set onboarding_completed = true where onboarding_completed is null;
alter table profiles alter column onboarding_completed set default false;
alter table profiles alter column onboarding_completed set not null;

-- Plataformas elegidas como provider_id de TMDB (fase 2 filtra por esto).
alter table profiles add column if not exists platforms integer[] not null default '{}';

-- País (prep multi-región; el onboarding MVP no lo pide).
alter table profiles add column if not exists country_code text not null default 'AR';

-- ============================================================
-- ACTIVO: reseñas editoriales (tu diferencial)
-- ============================================================
create table if not exists editorial_reviews (
  id          uuid primary key default gen_random_uuid(),
  tmdb_id     integer     not null,
  tipo        text        not null check (tipo in ('movie','tv')),
  titulo      text        not null,
  texto       text        not null,
  rating      numeric(3,1) check (rating between 1 and 10),
  publicado   boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tmdb_id, tipo)
);

alter table editorial_reviews enable row level security;

drop policy if exists "lectura publica publicadas" on editorial_reviews;
create policy "lectura publica publicadas" on editorial_reviews
  for select using (publicado = true);

-- Antes: cualquier usuario autenticado. Ahora: solo admin. Esto es lo que
-- impide que un usuario del público (que también es 'authenticated') toque
-- las reseñas editoriales una vez abierto el registro.
drop policy if exists "escritura autenticada" on editorial_reviews;
drop policy if exists "escritura solo admin" on editorial_reviews;
create policy "escritura solo admin" on editorial_reviews
  for all using (is_admin())
  with check (is_admin());

-- ============================================================
-- ACTIVO: voto de usuario (alimenta "Lo más votados" en Home)
-- Cada fila = el voto de un usuario a un título. Votar requiere login.
-- rating: 1=malaso, 2=ta buena, 3=petacular. "Más votados" = más votos.
-- ============================================================
create table if not exists votes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  tmdb_id     integer     not null,
  tipo        text        not null check (tipo in ('movie','tv')),
  rating      smallint    not null default 2,
  created_at  timestamptz not null default now(),
  unique (user_id, tmdb_id, tipo)
);
-- Migraciones idempotentes: sirve venga la tabla del schema viejo (rating 1-5)
-- o de una versión sin rating. Deja la columna en el rango 1-3.
alter table votes add column if not exists rating smallint;
update votes set rating = 2 where rating is null;
alter table votes alter column rating set default 2;
alter table votes alter column rating set not null;
alter table votes drop constraint if exists votes_rating_check;
alter table votes drop constraint if exists votes_rating_range;
alter table votes add constraint votes_rating_range check (rating between 1 and 3);

alter table votes enable row level security;
drop policy if exists "cada uno gestiona sus votos" on votes;
create policy "cada uno gestiona sus votos" on votes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Agregado de votos por polaridad. Como la policy solo deja ver los votos
-- propios, el conteo global se expone con una función security definer (el
-- cruce por plataforma se resuelve en la app contra el provider cacheado en
-- Redis). p_min/p_max acotan el rating: 2-3 (ta buena + petacular) alimenta
-- "Lo más votados"; 1-1 (malaso) alimenta "Hacete cargo".
-- Se dropea la firma vieja de 2 args para que no quede un overload ambiguo
-- que PostgREST resolvería contando todos los ratings juntos.
drop function if exists top_voted(int, int);
create or replace function top_voted(
  p_days  int default 7,
  p_limit int default 60,
  p_min   int default 1,
  p_max   int default 3
)
returns table (tmdb_id integer, tipo text, votos bigint) as $$
  select v.tmdb_id, v.tipo, count(*) as votos
  from votes v
  where v.created_at > now() - make_interval(days => p_days)
    and v.rating between p_min and p_max
  group by v.tmdb_id, v.tipo
  order by votos desc, max(v.created_at) desc
  limit p_limit;
$$ language sql stable security definer set search_path = public;
grant execute on function top_voted(int, int, int, int) to anon, authenticated;

-- Conteo de votos por rating para un título (alimenta el contador de la ficha:
-- malaso / ta buena / petacular). Los votos son privados por RLS; el total se
-- expone con security definer y es de lectura pública (anon).
create or replace function vote_counts(p_tmdb_id integer, p_tipo text)
returns table (rating smallint, votos bigint) as $$
  select v.rating, count(*)::bigint as votos
  from votes v
  where v.tmdb_id = p_tmdb_id and v.tipo = p_tipo
  group by v.rating;
$$ language sql stable security definer set search_path = public;
grant execute on function vote_counts(integer, text) to anon, authenticated;

-- ============================================================
-- SEAM DORMIDO: críticas de usuario (distinto de editorial_reviews)
-- ============================================================
create table if not exists user_reviews (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  tmdb_id     integer     not null,
  tipo        text        not null check (tipo in ('movie','tv')),
  texto       text        not null,
  estado      text        not null default 'pendiente' check (estado in ('pendiente','aprobada','rechazada')),
  created_at  timestamptz not null default now(),
  unique (user_id, tmdb_id, tipo)
);
alter table user_reviews enable row level security;
drop policy if exists "lectura publica aprobadas" on user_reviews;
create policy "lectura publica aprobadas" on user_reviews
  for select using (estado = 'aprobada');
drop policy if exists "el autor gestiona la suya" on user_reviews;
create policy "el autor gestiona la suya" on user_reviews
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Blindaje de `estado`, mismo caso que is_admin en profiles: la policy de
-- arriba ata la fila a su autor, pero NO dice nada sobre las columnas. Sin
-- esto, el autor puede insertar su reseña directamente con estado='aprobada'
-- contra la API REST y saltearse la moderación entera — que es justo lo que
-- esa columna existe para evitar. La lectura pública es `estado = 'aprobada'`,
-- así que se autopublicaría.
-- Desde el SQL editor o con service_role sí se puede mover: así se modera.
create or replace function protect_review_estado()
returns trigger as $$
begin
  if auth.role() = 'authenticated' then
    if tg_op = 'INSERT' then
      new.estado := 'pendiente';
    else
      new.estado := old.estado;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists user_reviews_protect_estado on user_reviews;
create trigger user_reviews_protect_estado
  before insert or update on user_reviews
  for each row execute function protect_review_estado();

-- ============================================================
-- ACTIVO: items del usuario. kind='list' = Mi lista;
-- kind='watched' = "Ya la vi" (base de emblemas futuros).
-- ============================================================
create table if not exists user_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  tmdb_id    integer     not null,
  tipo       text        not null check (tipo in ('movie','tv')),
  -- 'dismissed' = "No es para mí" del riel "Elegidas para vos": descarta ese
  -- título exacto, sin marcarlo visto ni votarlo. Sobre una base que YA existe
  -- este archivo no lo agrega (`create table if not exists`): eso lo hace
  -- migrations/005_dismissed.sql.
  kind       text        not null check (kind in ('list','watched','dismissed')),
  created_at timestamptz not null default now(),
  unique (user_id, tmdb_id, tipo, kind)
);
alter table user_items enable row level security;
drop policy if exists "cada uno gestiona sus items" on user_items;
create policy "cada uno gestiona sus items" on user_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- ACTIVO: historial de fichas abiertas. Upsert por título
-- actualizando viewed_at; se lee por recencia.
-- ============================================================
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

-- ============================================================
-- ACTIVO: Agenda de Estrenos (upcoming). Lo escribe SOLO la Edge
-- Function tmdb-sync (service role, que bypassa RLS); lectura pública.
-- Esquema normalizado: catálogo de providers + join título↔plataforma.
-- ============================================================

-- Catálogo de plataformas AR. PK = provider_id de TMDB (fuente de verdad):
-- si TMDB cambia el nombre/logo de una plataforma, se actualiza una sola fila.
create table if not exists providers (
  id               integer primary key,      -- TMDB provider_id
  name             text not null,
  logo_path        text,
  display_priority integer,
  updated_at       timestamptz not null default now()
);

-- Fuente ÚNICA de plataformas para el header + onboarding + filtros. `enabled`
-- controla cuáles se muestran; `sort_order`, el orden. Etapa 1: solo las
-- soportadas por la app (las que tienen código+logo+filtro en providers-ar).
-- Default false: una plataforma nueva que traiga el sync NO aparece hasta
-- habilitarla acá (o, a futuro, desde una config). El sync hace upsert solo de
-- (id, name, logo_path, display_priority, updated_at), así que no pisa estos flags.
alter table providers add column if not exists enabled boolean not null default false;
alter table providers add column if not exists sort_order integer;
-- Habilita y ordena las plataformas soportadas (provider_id de TMDB). Idempotente;
-- las que todavía no estén en la tabla (p.ej. MUBI/Star+ sin estreno) se habilitan
-- solas al re-correr esto luego de syncProviders.
update providers set enabled = true, sort_order = v.ord from (values
  (8, 1),      -- Netflix
  (337, 2),    -- Disney+
  (1899, 3),   -- Max
  (384, 3),    -- Max (alt)
  (119, 4),    -- Prime Video
  (9, 4),      -- Prime Video (alt)
  (531, 5),    -- Paramount+
  (350, 6),    -- Apple TV
  (2, 6),      -- Apple TV (alt)
  (283, 7),    -- Crunchyroll
  (11, 8),     -- MUBI
  (619, 9)     -- Star+
) as v(pid, ord) where providers.id = v.pid;

-- Un registro por título. Idempotente por (tmdb_id, media_type).
create table if not exists upcoming_content (
  id             uuid primary key default gen_random_uuid(),
  tmdb_id        integer     not null,
  media_type     text        not null check (media_type in ('movie','tv')),
  title          text        not null,
  original_title text,
  overview       text,
  poster_path    text,        -- path crudo TMDB (la app arma la URL con TMDB_IMG)
  backdrop_path  text,
  release_date   date        not null,  -- movie: estreno; tv: air_date del próximo episodio
  -- campos TV (null en movies)
  season_number      integer,
  episode_number     integer,
  episode_name       text,
  is_season_premiere boolean,
  tv_status          text,              -- ej. "Returning Series"
  -- metadata
  genre_ids      integer[]   not null default '{}',
  popularity     numeric,
  vote_average   numeric,
  status         text,                  -- status TMDB del título
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tmdb_id, media_type)
);

-- Join normalizado título ↔ plataforma (providers disponibles en AR).
create table if not exists upcoming_content_providers (
  upcoming_id uuid    references upcoming_content (id) on delete cascade,
  provider_id integer references providers (id),
  primary key (upcoming_id, provider_id)
);

create index if not exists idx_upcoming_release       on upcoming_content (release_date);
create index if not exists idx_upcoming_type_release  on upcoming_content (media_type, release_date);
create index if not exists idx_upcoming_genres        on upcoming_content using gin (genre_ids);
create index if not exists idx_ucp_provider           on upcoming_content_providers (provider_id);

-- RLS: lectura pública (catálogo, no personal). Sin políticas de escritura:
-- solo el service_role de la Edge Function escribe (bypassa RLS).
alter table providers                  enable row level security;
alter table upcoming_content           enable row level security;
alter table upcoming_content_providers enable row level security;
drop policy if exists "lectura pública" on providers;
drop policy if exists "lectura pública" on upcoming_content;
drop policy if exists "lectura pública" on upcoming_content_providers;
create policy "lectura pública" on providers                  for select using (true);
create policy "lectura pública" on upcoming_content           for select using (true);
create policy "lectura pública" on upcoming_content_providers for select using (true);

-- ---------------------------------------------------------------------------
-- Top 10 semanal de Netflix en Argentina.
-- Fuente: https://www.netflix.com/tudum/top10/data/all-weeks-countries.tsv
-- (público, sin auth, se actualiza los martes con la semana cerrada el domingo)
--
-- La tabla cumple DOS funciones: es el ranking y es el mapa título→TMDB. El TSV
-- solo trae el título en inglés, sin id ni año, así que resolverlo cuesta 1-2
-- búsquedas en TMDB por título nuevo. Como los títulos duran varias semanas en
-- el top, consultando acá primero se resuelven 2-4 por semana en vez de 20.
-- Efecto buscado: una corrección manual de `tmdb_id` queda fija para siempre.
create table if not exists netflix_top10 (
  week         date    not null,
  category     text    not null check (category in ('movie','tv')),
  rank         int     not null check (rank between 1 and 10),
  raw_title    text    not null,   -- el título tal cual viene del TSV
  tmdb_id      int,                -- null si no se pudo resolver
  needs_review boolean not null default false,
  updated_at   timestamptz not null default now(),
  primary key (week, category, rank)
);

create index if not exists netflix_top10_raw_title_idx on netflix_top10 (raw_title, category);

-- RLS: lectura pública (es catálogo, no dato personal). Sin políticas de
-- escritura: solo el service_role del cron escribe, y bypassa RLS.
alter table netflix_top10 enable row level security;
drop policy if exists "lectura pública" on netflix_top10;
create policy "lectura pública" on netflix_top10 for select using (true);
