-- ENSAYO del backfill de idioma. NO es una migración: no va en supabase/migrations
-- a propósito, porque nada de esto tiene que quedar en la base.
--
-- Correr en el SQL editor, con el flujo:
--   1. este archivo            -> crea el espejo y las funciones auxiliares
--   2. el script con --ensayo  -> siembra, dry-run, aplica, --fallar-en, restaura
--   3. LIMPIEZA (al final)     -> borra TODO, incluso si el ensayo falló
--
-- ============================================================================
-- POR QUÉ NO `create table ... as select`
-- ============================================================================
-- `CTAS` copia los DATOS y los tipos, y NADA MÁS: ni `not null`, ni el `check`
-- de `media_type`, ni el `unique (tmdb_id, media_type)`, ni los índices. En un
-- espejo así, la prueba de falla —meter `title = null` y esperar que la
-- transacción reviente— pasaría en verde sin haber probado nada, porque no
-- habría constraint que violar.
--
-- `like ... including all` sí trae defaults, not null, checks, unique e índices.
-- Lo que NO trae son foreign keys (LIKE nunca las copia) ni políticas RLS: no
-- hacen falta, porque la tabla no tiene FK propias y no es alcanzable desde la
-- API — el esquema `ensayo` no está en los esquemas expuestos de PostgREST.
-- ============================================================================

create schema if not exists ensayo;

drop table if exists ensayo.upcoming_content;
create table ensayo.upcoming_content
  (like public.upcoming_content including all);

-- --- VERIFICACIÓN de que los constraints llegaron ---------------------------
-- Si algo de esto no da lo esperado, el ensayo NO vale: frenar acá.
do $$
declare
  v_notnull boolean;
  v_check   integer;
  v_unique  integer;
begin
  select attnotnull into v_notnull
    from pg_attribute
   where attrelid = 'ensayo.upcoming_content'::regclass and attname = 'title';
  if v_notnull is not true then
    raise exception 'ENSAYO INVÁLIDO: title perdió el NOT NULL';
  end if;

  select count(*) into v_check
    from pg_constraint
   where conrelid = 'ensayo.upcoming_content'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%media_type%';
  if v_check < 1 then
    raise exception 'ENSAYO INVÁLIDO: se perdió el check de media_type';
  end if;

  select count(*) into v_unique
    from pg_constraint
   where conrelid = 'ensayo.upcoming_content'::regclass and contype = 'u';
  if v_unique < 1 then
    raise exception 'ENSAYO INVÁLIDO: se perdió el unique (tmdb_id, media_type)';
  end if;

  raise notice 'Espejo OK: not null, check de media_type y unique presentes.';
end $$;

-- Copia de las filas reales, para ensayar sobre datos con la misma forma.
insert into ensayo.upcoming_content select * from public.upcoming_content;

grant usage on schema ensayo to service_role;
grant select, insert, update, delete on ensayo.upcoming_content to service_role;

-- --- Funciones auxiliares ---------------------------------------------------
-- Viven en `public` porque PostgREST solo publica RPC de los esquemas expuestos,
-- pero operan sobre `ensayo`. Así el script maneja el espejo SIN que la tabla
-- tenga endpoint propio.

-- Siembra los dos títulos sintéticos. Los valores los trae el script desde TMDB
-- en es-ES, así que el espejo arranca coherente con "lo que el sync habría
-- escrito ayer" y el backfill tiene algo real que traducir.
--
-- IDs REALES de TMDB, no negativos: con ids inventados las llamadas a
-- /movie/{id} y /tv/{id}/season/{n}/episode/{m} darían 404 y el ensayo probaría
-- el camino de error, no el camino real.
create or replace function public.ensayo_sembrar(p_filas jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare v_n integer;
begin
  insert into ensayo.upcoming_content
    (tmdb_id, media_type, title, original_title, overview, release_date,
     season_number, episode_number, episode_name, genre_ids)
  select f.tmdb_id, f.media_type, f.title, f.original_title, f.overview,
         f.release_date, f.season_number, f.episode_number, f.episode_name, '{}'
    from pg_catalog.jsonb_to_recordset(p_filas) as f(
           tmdb_id integer, media_type text, title text, original_title text,
           overview text, release_date date, season_number integer,
           episode_number integer, episode_name text)
  on conflict (tmdb_id, media_type) do update
    set title = excluded.title, overview = excluded.overview,
        episode_name = excluded.episode_name;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public.ensayo_leer()
returns table (tmdb_id integer, media_type text, title text, overview text, episode_name text)
language sql
security invoker
set search_path = ''
as $$
  select e.tmdb_id, e.media_type, e.title, e.overview, e.episode_name
    from ensayo.upcoming_content e
   order by e.media_type, e.tmdb_id;
$$;

revoke execute on function public.ensayo_sembrar(jsonb) from public, anon, authenticated;
revoke execute on function public.ensayo_leer()        from public, anon, authenticated;
grant  execute on function public.ensayo_sembrar(jsonb) to service_role;
grant  execute on function public.ensayo_leer()         to service_role;

-- ============================================================================
-- LIMPIEZA — correr SIEMPRE al terminar, HAYA FALLADO O NO EL ENSAYO
-- ============================================================================
-- Se deja abajo y comentado para que no se ejecute junto con el setup. Es lo
-- último del runbook y su verificación es parte del ensayo: una tabla de prueba
-- que sobrevive es una tabla que alguien va a confundir con la real.
--
-- drop function if exists public.ensayo_sembrar(jsonb);
-- drop function if exists public.ensayo_leer();
-- drop schema if exists ensayo cascade;
--
-- Verificar que no quedó nada:
--   select count(*) from information_schema.schemata where schema_name = 'ensayo';        -- 0
--   select count(*) from pg_proc where proname in ('ensayo_sembrar','ensayo_leer');       -- 0
