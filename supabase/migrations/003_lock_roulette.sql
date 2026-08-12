-- ═══════════════════════════════════════════════════════════════════════════
-- Cerrar el acceso directo a roulette_titles
--
-- Los textos curados son lo más caro de producir del proyecto y hoy se
-- bajan enteros con la anon key. Se pasa el acceso por la función, que
-- devuelve de a poco y sólo lo que la app necesita.
--
-- APLICAR EN DOS PASOS, verificando entre uno y otro. Ver el final.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── PASO 1 ─────────────────────────────────────────────────────────────────
-- La función pasa a security definer y capa el límite.
-- Después de esto, la app sigue funcionando igual que antes: el select
-- directo todavía está permitido. Si algo se rompe acá, se rompió la
-- función, no los permisos.

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
-- search_path pineado: sin esto, un security definer es un vector de
-- escalada de privilegios y el linter de Supabase lo marca.
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
  -- El tope es lo que hace que cerrar el select sirva de algo. Sin esto,
  -- p_limit = 999999 baja el catálogo entero por el RPC.
  limit least(greatest(coalesce(p_limit, 20), 1), 40);
$$;

comment on function get_roulette_picks is
  'security definer: es la única vía de lectura de roulette_titles. El limit está capado a 40 a propósito.';

revoke execute on function get_roulette_picks(text[], text, integer[], text, text, integer) from public;
grant  execute on function get_roulette_picks(text[], text, integer[], text, text, integer) to anon, authenticated;


-- ── PASO 2 ─────────────────────────────────────────────────────────────────
-- Recién después de verificar que la app anda con el paso 1 aplicado.
-- Esto es lo que puede romper la ruleta si algún camino de la app lee la
-- tabla en vez de llamar a la función.

 revoke select on public.roulette_titles from anon, authenticated;
 drop policy if exists roulette_titles_read on public.roulette_titles;


-- ── Vuelta atrás del paso 2 ────────────────────────────────────────────────
-- Si la ruleta deja de devolver títulos, esto restaura el estado anterior:

-- grant select on public.roulette_titles to anon, authenticated;
-- create policy roulette_titles_read on public.roulette_titles
--   for select using (true);


-- ── Verificación ───────────────────────────────────────────────────────────
--
-- Con la ANON KEY (no desde el SQL Editor, que corre como postgres):
--
-- 1. El RPC responde:
--    curl "$SUPABASE_URL/rest/v1/rpc/get_roulette_picks" \
--      -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
--      -d '{"p_providers":["Netflix"],"p_escenario":"corta","p_limit":5}'
--
-- 2. El límite está capado — pedir 999 tiene que devolver 40:
--    (mismo curl con "p_limit":999 y contar el array)
--
-- 3. Después del paso 2, la tabla no se lee directo:
--    curl "$SUPABASE_URL/rest/v1/roulette_titles?select=razon&limit=1" \
--      -H "apikey: $ANON_KEY"
--    → tiene que dar 401/403, no filas.
--
-- Y en la base, que no queden security definer sin search_path:
--    select p.proname, p.prosecdef, p.proconfig
--    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.prosecdef;
