-- AYUDAS SÓLO LOCALES para las baterías de reseñas (plan §4). NUNCA va en una
-- migración: scripts/comunidad/local.test.mjs falla si algún archivo de
-- supabase/migrations/ contiene `solo_local`.
--
-- Falla inyectada REAL del borrado de Auth (E2b, casos B1 y el recorrido
-- visible): un trigger BEFORE DELETE sobre auth.users que aborta el borrado
-- de las cuentas listadas en `solo_local.borrado_falla`. GoTrue recibe el
-- error de la base y `deleteUser` responde 500: no se simula la respuesta, se
-- hace fallar la transacción de verdad. Sólo afecta a los uid de la lista.
--
-- Lo instala y lo quita scripts/comunidad/pruebas-baja.mjs (o
-- solo-local-quitar.sql a mano): la base local es compartida y esto no debe
-- quedar instalado.
begin;

create schema if not exists solo_local;
revoke all on schema solo_local from public, anon, authenticated, service_role;

create table if not exists solo_local.borrado_falla (user_id uuid primary key);
revoke all on solo_local.borrado_falla from public, anon, authenticated, service_role;

create or replace function solo_local.falla_borrado_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from solo_local.borrado_falla where user_id = old.id) then
    raise exception 'solo_local: borrado de Auth forzado a fallar para %', old.id;
  end if;
  return old;
end;
$$;
revoke all on function solo_local.falla_borrado_auth() from public, anon, authenticated, service_role;

drop trigger if exists solo_local_falla_borrado on auth.users;
create trigger solo_local_falla_borrado
  before delete on auth.users
  for each row execute function solo_local.falla_borrado_auth();

commit;
