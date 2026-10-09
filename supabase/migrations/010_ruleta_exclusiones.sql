-- ═══════════════════════════════════════════════════════════════════════════
-- APLICADA A MANO en Producción (SQL Editor) por el dueño el 2026-10-08, como
-- 001–009: el proyecto no usa el historial de migraciones del CLI
-- (config.toml → [db.migrations] enabled = false; nunca "supabase db push").
-- NO volver a correrla.
-- ═══════════════════════════════════════════════════════════════════════════
-- Ruleta "No sé qué ver": exclusión editorial reversible (dueño, 2026-10-07)
--
-- Regla: la ruleta no sirve anime (aunque el usuario tenga Crunchyroll), ni
-- stand-up, ni especiales no narrativos. Para los títulos YA cargados.
--
-- Mecanismo mínimo, elegido así a propósito:
--   - NO se borran filas ni textos editoriales: se MARCA el título.
--   - NO se usa la disponibilidad (vaciar providers sería un mecanismo
--     indirecto que la próxima actualización de disponibilidad desharía).
--   - Sobrevive a las cargas: ningún generador de SQL de la ruleta menciona
--     estas columnas (test en scripts/ruleta/exclusiones-produccion.test.mjs),
--     así que un upsert nunca las resetea.
--   - Motivo registrado (con valores controlados) y fecha.
--   - Reversible por título: `excluido_motivo = null`.
--
-- ⚠️ ANTES DE APLICAR: verificar que get_roulette_picks en Producción sea la
-- de 003_lock_roulette.sql (esta migración la reescribe entera con UN filtro
-- más). Ver la consulta de verificación en
-- supabase/propuestas/2026-10-07-exclusiones-ruleta.sql.
--
-- ⚠️ YUMPEÁ (sala_candidatos, 009) lee la misma tabla y NO se toca acá: la
-- regla se pidió para "No sé qué ver". Si se quiere también en las salas, es
-- un cambio aparte en sala_candidatos (mismo filtro).
-- ═══════════════════════════════════════════════════════════════════════════

begin;

alter table roulette_titles
  add column if not exists excluido_motivo text
  check (excluido_motivo in ('anime', 'stand-up', 'especial-no-narrativo'));
alter table roulette_titles
  add column if not exists excluido_at timestamptz;

comment on column roulette_titles.excluido_motivo is
  'Exclusión editorial de la ruleta (NULL = servible). Reversible por título. Ver supabase/migrations/010.';

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
security definer
set search_path = public, pg_temp
as $$
  select
    rt.tmdb_id, rt.media_type, rt.title, rt.year, rt.runtime, rt.genres,
    rt.edad, rt.razon, rt.advertencia, rt.atencion, rt.vote_average,
    ta.providers
  from public.roulette_titles rt
  join public.title_availability ta
    on  ta.tmdb_id    = rt.tmdb_id
    and ta.media_type = rt.media_type
    and ta.region     = p_region
  where rt.razon is not null
    and rt.advertencia is not null
    and not rt.requiere_contexto
    -- Exclusión editorial (anime, stand-up, especial no narrativo).
    and rt.excluido_motivo is null
    and ta.providers && p_providers
    and not (rt.tmdb_id = any(p_excluir))
    and case p_escenario
      when 'corta'  then coalesce(rt.runtime, 999) <= 90 and not rt.apto_chicos
      when 'larga'  then coalesce(rt.runtime, 0) > 90 and not rt.apto_chicos
      when 'chicos' then rt.apto_chicos
      else true
    end
  order by md5(p_seed || rt.tmdb_id::text)
  limit least(greatest(coalesce(p_limit, 20), 1), 40);
$$;

comment on function get_roulette_picks is
  'security definer: es la única vía de lectura de roulette_titles. El limit está capado a 40 a propósito. Excluye excluido_motivo no nulo (010).';

revoke execute on function get_roulette_picks(text[], text, integer[], text, text, integer) from public;
grant  execute on function get_roulette_picks(text[], text, integer[], text, text, integer) to anon, authenticated;

commit;
