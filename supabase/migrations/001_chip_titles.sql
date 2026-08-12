-- ═══════════════════════════════════════════════════════════════════════════
-- Chips curados — esquema base
--
-- Tres tablas con responsabilidades separadas:
--   chip_titles        qué títulos pertenecen a cada chip (curación editorial)
--   title_availability dónde se puede ver cada título (dato volátil, por región)
--   chip_blocklist     exclusiones para los chips que siguen usando TMDB
--
-- La disponibilidad NO va dentro de chip_titles: es propiedad del título, no
-- del chip. Un mismo título puede estar en varios chips y su disponibilidad
-- se refresca con otra cadencia (semanal vs trimestral).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Curación ───────────────────────────────────────────────────────────────

create table if not exists chip_titles (
  chip_slug    text        not null,
  tmdb_id      integer     not null,
  media_type   text        not null check (media_type in ('movie', 'tv')),

  title        text        not null,   -- para debug y auditoría, no para mostrar
  year         integer,                -- necesario para estratificar por década

  priority     integer     not null default 100,
  source       text        not null default 'curated'
                           check (source in ('curated', 'auto')),

  -- Trazabilidad del pipeline de curado
  confianza    text        check (confianza in ('alta', 'media', 'baja')),
  revisado     boolean     not null default false,
  notes        text,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  primary key (chip_slug, tmdb_id, media_type)
);

comment on column chip_titles.title is
  'Snapshot del título al curar. Para mostrar, usar siempre TMDB: cambia por idioma y región.';
comment on column chip_titles.revisado is
  'true sólo cuando un humano confirmó el veredicto. Los de confianza alta sin revisar quedan en false.';

create index if not exists chip_titles_slug_priority_idx
  on chip_titles (chip_slug, priority);

-- ── Disponibilidad ─────────────────────────────────────────────────────────

create table if not exists title_availability (
  tmdb_id      integer     not null,
  media_type   text        not null check (media_type in ('movie', 'tv')),
  region       text        not null,

  providers    text[]      not null default '{}',  -- suscripción + gratis
  rent_only    boolean     not null default false, -- sólo alquiler/compra
  checked_at   timestamptz not null default now(),

  primary key (tmdb_id, media_type, region)
);

comment on column title_availability.providers is
  'Sólo flatrate/free/ads. Alquiler y compra NO cuentan como disponible.';

-- GIN habilita el operador && (solapamiento de arrays), que es como se
-- pregunta "¿alguna de las plataformas del usuario tiene este título?"
create index if not exists title_availability_providers_idx
  on title_availability using gin (providers);

create index if not exists title_availability_region_idx
  on title_availability (region, checked_at);

-- ── Exclusiones ────────────────────────────────────────────────────────────
-- Para los chips que siguen resolviéndose con TMDB y sólo necesitan
-- sacar falsos positivos puntuales (ej. Shazam en "Historias de amor").

create table if not exists chip_blocklist (
  chip_slug    text        not null,
  tmdb_id      integer     not null,
  media_type   text        not null check (media_type in ('movie', 'tv')),
  reason       text,
  created_at   timestamptz not null default now(),

  primary key (chip_slug, tmdb_id, media_type)
);

-- ── updated_at automático ──────────────────────────────────────────────────

create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists chip_titles_touch on chip_titles;
create trigger chip_titles_touch
  before update on chip_titles
  for each row execute function touch_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────────────
-- Catálogo público: cualquiera lee, nadie escribe desde el cliente.
-- La carga se hace con service_role, que saltea RLS.

alter table chip_titles       enable row level security;
alter table title_availability enable row level security;
alter table chip_blocklist    enable row level security;

drop policy if exists chip_titles_read on chip_titles;
create policy chip_titles_read on chip_titles
  for select using (true);

drop policy if exists title_availability_read on title_availability;
create policy title_availability_read on title_availability
  for select using (true);

drop policy if exists chip_blocklist_read on chip_blocklist;
create policy chip_blocklist_read on chip_blocklist
  for select using (true);

-- ── Función de servido ─────────────────────────────────────────────────────
--
-- Devuelve los títulos elegibles de un chip para un set de plataformas,
-- con orden pseudoaleatorio determinístico por semilla y una etiqueta de
-- estrato. La INTERCALACIÓN (cuántos clásicos por tanda) se hace en la app:
-- es una regla de producto que va a cambiar, y en TypeScript se lee y se
-- testea mejor que en SQL.

create or replace function get_chip_titles(
  p_chip      text,
  p_providers text[],
  p_region    text default 'AR',
  p_seed      text default '',
  p_limit     integer default 200
)
returns table (
  tmdb_id    integer,
  media_type text,
  title      text,
  year       integer,
  priority   integer,
  source     text,
  stratum    text,
  providers  text[]
)
language sql
stable
as $$
  select
    ct.tmdb_id,
    ct.media_type,
    ct.title,
    ct.year,
    ct.priority,
    ct.source,
    case when ct.year is not null and ct.year < 2000 then 'clasico' else 'moderno' end as stratum,
    ta.providers
  from chip_titles ct
  join title_availability ta
    on  ta.tmdb_id    = ct.tmdb_id
    and ta.media_type = ct.media_type
    and ta.region     = p_region
  where ct.chip_slug = p_chip
    and ta.providers && p_providers          -- solapamiento con las del usuario
    and not exists (
      select 1 from chip_blocklist bl
      where bl.chip_slug  = ct.chip_slug
        and bl.tmdb_id    = ct.tmdb_id
        and bl.media_type = ct.media_type
    )
  -- Orden estable dentro de una semilla, distinto entre semillas.
  order by md5(p_seed || ct.tmdb_id::text)
  limit p_limit;
$$;

comment on function get_chip_titles is
  'p_seed fija la rotación: usar algo como user_id || semana_iso para que sea estable dentro de la sesión y cambie entre semanas.';
