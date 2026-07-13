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
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name');
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
-- SEAM DORMIDO: votos de usuario (para "más votados de la semana")
-- Votar requiere login. No se usa todavía en la app.
-- ============================================================
create table if not exists votes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  tmdb_id     integer     not null,
  tipo        text        not null check (tipo in ('movie','tv')),
  rating      smallint    not null check (rating between 1 and 5),
  created_at  timestamptz not null default now(),
  unique (user_id, tmdb_id, tipo)
);
alter table votes enable row level security;
drop policy if exists "cada uno gestiona sus votos" on votes;
create policy "cada uno gestiona sus votos" on votes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- "Más votados de la semana" (agregado cacheable; el cruce por plataforma se
-- resuelve en la app contra el provider enriquecido en Redis):
--   select tmdb_id, tipo, count(*) votos, avg(rating) promedio
--   from votes where created_at > now() - interval '7 days'
--   group by tmdb_id, tipo order by votos desc limit 100;

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
