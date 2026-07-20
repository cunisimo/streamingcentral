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

-- Avatar generado (DiceBear). Se guarda solo la semilla; el SVG se arma en el
-- cliente. Backfill determinístico para perfiles viejos: semilla = id.
alter table profiles add column if not exists avatar_seed text;
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
create or replace function protect_is_admin()
returns trigger as $$
begin
  if auth.role() = 'authenticated' then
    new.is_admin := old.is_admin;
  end if;
  return new;
end;
$$ language plpgsql security definer;

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

-- ============================================================
-- ACTIVO: items del usuario. kind='list' = Mi lista;
-- kind='watched' = "Ya la vi" (base de emblemas futuros).
-- ============================================================
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
