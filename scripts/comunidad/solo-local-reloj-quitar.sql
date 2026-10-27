-- Quita el reloj forzado de solo-local-reloj.sql: restaura
-- `comunidad.proto_marca()` EXACTAMENTE como la deja 015 y borra la tabla del
-- reloj. El esquema `solo_local` se borra sólo si quedó vacío (lo comparte
-- con solo-local.sql, de E2b).
begin;

create or replace function comunidad.proto_marca()
returns timestamptz
language plpgsql
set search_path = ''
as $$
begin
  perform comunidad.proto_avanzar(10, 'proto_marca');
  return clock_timestamp();
end;
$$;

drop table if exists solo_local.reloj;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'solo_local')
     and not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'solo_local')
     and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'solo_local') then
    drop schema solo_local;
  end if;
end;
$$;

commit;
