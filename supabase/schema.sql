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

drop policy if exists "escritura autenticada" on editorial_reviews;
create policy "escritura autenticada" on editorial_reviews
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

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
