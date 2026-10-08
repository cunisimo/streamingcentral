-- Reversión de 010_ruleta_exclusiones.sql: vuelve get_roulette_picks a la
-- versión de 003_lock_roulette.sql (sin el filtro de exclusión). Las columnas
-- excluido_motivo / excluido_at QUEDAN (con su registro): borrarlas perdería
-- el motivo de cada exclusión. Si se quiere quitarlas, es un paso aparte.

begin;

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

revoke execute on function get_roulette_picks(text[], text, integer[], text, text, integer) from public;
grant  execute on function get_roulette_picks(text[], text, integer[], text, text, integer) to anon, authenticated;

commit;
