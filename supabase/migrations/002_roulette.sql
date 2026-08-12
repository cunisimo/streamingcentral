-- ═══════════════════════════════════════════════════════════════════════════
-- Ruleta "no sé qué ver"
--
-- Reutiliza title_availability (creada en 001) — la disponibilidad es
-- propiedad del título, no de la feature.
--
-- El pool entero entra a la tabla, con o sin texto. La ruleta sólo sirve
-- los que tienen razon, así que las pasadas futuras de generación son un
-- UPDATE y no una carga nueva.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists roulette_titles (
  tmdb_id      integer     not null,
  media_type   text        not null default 'movie' check (media_type in ('movie','tv')),

  title        text        not null,   -- snapshot de auditoría, no para mostrar
  year         integer,
  runtime      integer,
  genres       text[]      not null default '{}',

  -- Clasificación por edad, normalizada. TMDB devuelve tres sistemas
  -- mezclados (US, AR y números sueltos); esto es la escala unificada.
  edad         text        not null default 'desconocido'
                           check (edad in ('todos','guia','adolescentes','adultos','desconocido')),
  -- En AR animación y familia se doblan siempre: es el proxy de doblaje
  -- que TMDB no informa.
  apto_chicos  boolean     not null default false,

  vote_count   integer     not null default 0,
  vote_average numeric(3,1),

  -- Texto editorial. NULL = todavía no generado; la ruleta lo ignora.
  razon        text,
  advertencia  text,
  atencion     text        check (atencion in ('alta','media','fondo')),

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  primary key (tmdb_id, media_type)
);
-- Estas dos las agregaba data/carga-contexto.sql, un archivo que el pipeline
-- reescribe en cada corrida. Acá para que un clon limpio reproduzca el esquema.
alter table roulette_titles add column if not exists requiere_contexto boolean not null default false;
alter table roulette_titles add column if not exists collection_name text;

comment on column roulette_titles.razon is
  'NULL mientras no se generó. get_roulette_picks filtra por razon is not null.';
comment on column roulette_titles.advertencia is
  'Opcional por diseño: mejor vacía que inventada.';

-- Sólo los que tienen texto son servibles: el índice parcial es el que importa.
create index if not exists roulette_titles_servibles_idx
  on roulette_titles (atencion, edad, apto_chicos)
  where razon is not null;

drop trigger if exists roulette_titles_touch on roulette_titles;
create trigger roulette_titles_touch
  before update on roulette_titles
  for each row execute function touch_updated_at();

alter table roulette_titles enable row level security;

drop policy if exists roulette_titles_read on roulette_titles;
create policy roulette_titles_read on roulette_titles
  for select using (true);

-- ── Selección ──────────────────────────────────────────────────────────────
--
-- Devuelve un puñado de candidatos, no uno solo: el botón "otra" consume de
-- esa lista sin volver a consultar la base.
--
-- p_excluir recibe los tmdb_id ya vistos por el usuario. Se pasa desde la
-- app en vez de resolverlo acá para no acoplar la función al esquema de
-- usuarios.

create or replace function get_roulette_picks(
  p_providers text[],
  p_escenario text default 'larga',
  p_excluir   integer[] default '{}',
  p_region    text default 'AR',
  p_seed      text default '',
  p_limit     integer default 20
)
returns table (
  tmdb_id      integer,
  media_type   text,
  title        text,
  year         integer,
  runtime      integer,
  genres       text[],
  edad         text,
  razon        text,
  advertencia  text,
  atencion     text,
  vote_average numeric,
  providers    text[]
)
language sql
stable
as $$
  select
    rt.tmdb_id, rt.media_type, rt.title, rt.year, rt.runtime, rt.genres,
    rt.edad, rt.razon, rt.advertencia, rt.atencion, rt.vote_average,
    ta.providers
  from roulette_titles rt
  join title_availability ta
    on  ta.tmdb_id    = rt.tmdb_id
    and ta.media_type = rt.media_type
    and ta.region     = p_region
  where rt.razon is not null
    -- El bloque "pero" es el diferencial de la tarjeta: sin él se parece
    -- a cualquier otra app. Mejor catálogo más chico que tarjeta a medias.
    and rt.advertencia is not null
    and not rt.requiere_contexto
    and ta.providers && p_providers
    and not (rt.tmdb_id = any(p_excluir))
    and case p_escenario
      -- Definidos por duración, que es un hecho de TMDB y no una inferencia.
      -- Así quedan mutuamente excluyentes: "solo" y "pareja" se pisaban
      -- porque ninguna de las dos era un atributo real de la película.
      when 'corta'  then coalesce(rt.runtime, 999) <= 90 and not rt.apto_chicos
      when 'larga'  then coalesce(rt.runtime, 0) > 90 and not rt.apto_chicos
      when 'chicos' then rt.apto_chicos
      else true
    end
  order by md5(p_seed || rt.tmdb_id::text)
  limit p_limit;
$$;

comment on function get_roulette_picks is
  'p_seed: usar la misma semilla por día que el resto de la app, para que el cache compartido siga sirviendo.';
