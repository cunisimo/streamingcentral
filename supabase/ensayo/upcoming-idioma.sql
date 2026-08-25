-- ENSAYO del backfill de idioma. NO es una migración: no va en supabase/migrations
-- a propósito, porque nada de esto tiene que quedar en la base.
--
-- ANTES DE CORRER ESTE ARCHIVO, mirar que hay (es solo lectura):
--
--   select n.nspname, c.relname, c.relkind
--     from pg_namespace n left join pg_class c on c.relnamespace = n.oid
--    where n.nspname = 'ensayo';
--   select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'ensayo' or p.proname like 'ensayo_%';
--
-- Lo esperado es CERO filas en las dos. El archivo igual trae la guarda que
-- frena solo si encuentra algo ajeno, pero mirar primero cuesta diez segundos.
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

-- ============================================================================
-- GUARDA: el esquema `ensayo` tiene que no existir, o contener SOLO lo de esta
-- prueba. Va ANTES de cualquier `drop`, y ese orden es el punto.
-- ============================================================================
-- El archivo arrancaba con `drop table if exists ensayo.upcoming_content`. Si
-- alguien hubiera creado un esquema `ensayo` para otra cosa —y adentro una
-- tabla con ese nombre—, el drop se la llevaba puesta antes de que nadie mirara
-- nada. Un esquema llamado "ensayo" es exactamente el nombre que otra persona
-- elegiria para otra prueba.
--
-- Si esto levanta la excepcion: NO seguir, NO borrar nada, y reportar que hay
-- adentro. La decision de que hacer con objetos ajenos no es de este script.
do $$
declare
  v_existe  boolean;
  v_ajenos  text;
begin
  select exists (select 1 from pg_namespace where nspname = 'ensayo') into v_existe;
  if not v_existe then
    raise notice 'El esquema `ensayo` no existe: se crea limpio.';
    return;
  end if;

  raise notice 'El esquema `ensayo` YA existe: revisando que no haya nada ajeno.';

  -- Relaciones que no sean nuestra tabla espejo.
  select string_agg(format('%s (%s)', c.relname, c.relkind), ', ')
    into v_ajenos
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'ensayo'
     and c.relkind in ('r', 'v', 'm', 'f', 'p')      -- tablas y vistas, no indices
     and c.relname <> 'upcoming_content';
  if v_ajenos is not null then
    raise exception 'FRENAR: el esquema `ensayo` tiene objetos ajenos a esta prueba: %. No se borro nada.', v_ajenos;
  end if;

  -- Funciones dentro del esquema.
  select string_agg(p.proname, ', ') into v_ajenos
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'ensayo';
  if v_ajenos is not null then
    raise exception 'FRENAR: el esquema `ensayo` tiene funciones ajenas: %. No se borro nada.', v_ajenos;
  end if;

  raise notice 'El esquema `ensayo` solo tiene lo de esta prueba: se puede seguir.';
end $$;

create schema if not exists ensayo;

drop table if exists ensayo.upcoming_content;
create table ensayo.upcoming_content
  (like public.upcoming_content including all);

-- `LIKE ... INCLUDING ALL` NO copia RLS: es una de las tres cosas que se quedan
-- afuera, junto con las foreign keys y las policies. Se activa a mano por dos
-- motivos: acerca el espejo a la tabla real, que sí lo tiene, y cierra la
-- advertencia del SQL Editor de verdad en vez de con un argumento.
--
-- No afecta al ensayo: el unico rol que toca esta tabla es `service_role`, que
-- bypassa RLS. Y sin policies, cualquier otro rol no ve nada — que es lo que se
-- quiere para una tabla de prueba.
alter table ensayo.upcoming_content enable row level security;

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

-- Devuelve TAMBIÉN las coordenadas del episodio. No es un detalle: sin ellas el
-- script no puede pedir /tv/{id}/season/{n}/episode/{m} y termina tratando cada
-- serie como un 404. La primera versión las omitía y las completaba cruzando con
-- la tabla real — que funciona para las filas copiadas y falla justo para los
-- títulos SINTÉTICOS, que no están en la tabla real. O sea que el ensayo
-- integral probaba el camino del 404 y nunca el del episodio exacto: exactamente
-- el camino que más importa verificar.
create or replace function public.ensayo_leer()
returns table (tmdb_id integer, media_type text, title text, overview text,
               episode_name text, season_number integer, episode_number integer)
language sql
security invoker
set search_path = ''
as $$
  select e.tmdb_id, e.media_type, e.title, e.overview, e.episode_name,
         e.season_number, e.episode_number
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
