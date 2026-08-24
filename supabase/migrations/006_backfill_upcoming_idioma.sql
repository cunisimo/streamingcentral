-- Tanda 3 del idioma: backfill de `upcoming_content` a es-MX.
--
-- QUÉ RESUELVE. La Edge Function `tmdb-sync` pasa a escribir en es-MX, pero solo
-- reescribe lo que redescubre: mira 3 páginas de discover ordenadas por
-- popularidad, así que una fila fuera de ese top no se refresca nunca. Sin este
-- backfill, "Próximamente" queda mezclado en dos idiomas para siempre.
--
-- SOLO TRES COLUMNAS: `title`, `overview`, `episode_name`. No se tocan
-- `original_title` (no es localizado), `tv_status` ni `status` (enums en inglés),
-- ninguna fecha, ni `updated_at` — que en esta tabla NO tiene trigger y es el
-- único diagnóstico de frescura que hay. Bumpearlo haría parecer fresca una fila
-- de hace dos semanas.
--
-- ============================================================================
-- POR QUÉ `security invoker` Y NO `security definer`
-- ============================================================================
-- El resto de las funciones del proyecto (`get_roulette_picks`, `top_voted`,
-- `get_chip_titles`) son `security definer` porque las llama `anon` y necesitan
-- elevar permisos para leer tablas que `anon` no puede leer.
--
-- Esta NO. Su único llamador es el script de backfill con `service_role`, que ya
-- tiene UPDATE sobre la tabla y ya bypassa RLS. `security definer` acá sería
-- privilegio regalado: una función que corre como su dueño y que cualquiera que
-- consiguiera invocarla usaría con permisos que no tiene.
--
-- El `revoke` de abajo va IGUAL, y no es redundante: `create function` concede
-- `execute` a `public` por default, y PostgREST publica como endpoint RPC todo
-- lo que viva en el esquema `public`. Sin el revoke, `anon` puede POSTear a
-- `/rest/v1/rpc/backfill_upcoming_idioma`. Fallaría por permisos sobre la tabla,
-- pero es mejor que rebote en la puerta.
--
-- `search_path = ''` y todo calificado con esquema: con `invoker` no es una
-- defensa contra escalada, pero evita que la función dependa del search_path de
-- quien la llame.
-- ============================================================================

create or replace function public.backfill_upcoming_idioma(
  -- Un elemento por fila a tocar:
  --   { "tmdb_id": 1399, "media_type": "tv",
  --     "esperado_title": "…", "esperado_overview": "…", "esperado_episode_name": "…",
  --     "nuevo_title": "…",    "nuevo_overview": "…",    "nuevo_episode_name": "…" }
  --
  -- Los `esperado_*` son el estado que el snapshot vio. Los `nuevo_*` describen
  -- la fila COMPLETA después: en un campo que no cambia, `nuevo_` es igual a
  -- `esperado_`. Así el payload describe el resultado entero y no hay que
  -- interpretar qué campos venían "vacíos a propósito".
  p_filas     jsonb,
  -- Cuántas filas TIENEN que actualizarse. Si no coinciden, se aborta.
  p_esperadas integer,
  -- true = tabla espejo del ensayo. El nombre sale de un literal de esta misma
  -- función, nunca del llamador.
  p_ensayo    boolean default false
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  -- Dos literales fijos elegidos por un booleano. `%s` y no `%I`: `%I` citaría
  -- "ensayo.upcoming_content" como UN identificador y rompería el nombre
  -- calificado. Como el valor no viene del llamador, no hay inyección posible.
  v_tabla text := case when p_ensayo
                       then 'ensayo.upcoming_content'
                       else 'public.upcoming_content' end;
  v_n integer;
begin
  if p_filas is null or pg_catalog.jsonb_typeof(p_filas) <> 'array' then
    raise exception 'backfill: p_filas tiene que ser un array jsonb';
  end if;

  -- UNA sola sentencia. Una sentencia es una transacción, así que no existe el
  -- estado parcial: o se actualizan las N filas o no se actualiza ninguna. Es
  -- más fuerte que compensar después de un fallo a mitad de camino.
  --
  -- El `is not distinct from` de las tres columnas es el bloqueo optimista: si
  -- el cron corrió entre el snapshot y esta llamada, la fila que tocó deja de
  -- matchear, el row_count baja y el `raise` de abajo tira todo abajo.
  -- `is not distinct from` y no `=` porque `overview` y `episode_name` pueden
  -- ser NULL, y `null = null` es null, no true.
  execute pg_catalog.format($sql$
    update %s u
       set title        = f.nuevo_title,
           overview     = f.nuevo_overview,
           episode_name = f.nuevo_episode_name
      from pg_catalog.jsonb_to_recordset($1) as f(
             tmdb_id               integer,
             media_type            text,
             esperado_title        text,
             esperado_overview     text,
             esperado_episode_name text,
             nuevo_title           text,
             nuevo_overview        text,
             nuevo_episode_name    text)
     where u.tmdb_id    = f.tmdb_id
       and u.media_type = f.media_type
       and u.title        is not distinct from f.esperado_title
       and u.overview     is not distinct from f.esperado_overview
       and u.episode_name is not distinct from f.esperado_episode_name
  $sql$, v_tabla)
  using p_filas;

  get diagnostics v_n = row_count;

  if v_n <> p_esperadas then
    raise exception
      'backfill abortado: se actualizaron % filas y se esperaban %. Alguna fila cambió desde el snapshot (¿corrió el sync?). No se escribió nada.',
      v_n, p_esperadas;
  end if;

  return v_n;
end
$fn$;

comment on function public.backfill_upcoming_idioma(jsonb, integer, boolean) is
  'Backfill de idioma de upcoming_content. Atómica y con bloqueo optimista: '
  'solo actualiza filas cuyas tres columnas localizadas siguen coincidiendo con '
  'el snapshot. Sirve para ida y para rollback — el rollback pasa `antes` como '
  'nuevo y `después` como esperado.';

-- Solo el service_role. Ver el bloque de arriba.
revoke execute on function public.backfill_upcoming_idioma(jsonb, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.backfill_upcoming_idioma(jsonb, integer, boolean)
  to service_role;

-- Verificación después de correr esto:
--   select proname, prosecdef, proconfig from pg_proc
--    where proname = 'backfill_upcoming_idioma';
--   -- prosecdef tiene que ser false (invoker) y proconfig {search_path=}
--   select grantee, privilege_type from information_schema.routine_privileges
--    where routine_name = 'backfill_upcoming_idioma';
--   -- solo service_role
