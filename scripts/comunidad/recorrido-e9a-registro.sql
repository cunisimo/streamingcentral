-- Registro de propiedad del recorrido E9a (auditoría E9a, A1). SÓLO LOCAL.
-- Lo instala `recorrido-e9a.mjs preparar` y lo quita `limpiar` cuando la
-- limpieza se verificó. Idempotente.
--
-- Qué es propio del recorrido, en el momento en que nace (nunca por fecha):
--   - cuenta: una fila de auth.users creada con un correo @recorrido.test
--     mientras el registro está instalado (las de `preparar` y las que el
--     dueño registre a mano);
--   - participante: el que nace vinculado a una cuenta propia. Queda
--     registrado aunque después la baja lo desvincule;
--   - versión: la que escribe un participante propio (también las que una
--     baja borra en cascada).
-- Los triggers sólo INSERTAN en este esquema: no cambian ni rechazan nada de
-- auth ni de comunidad, y sin FK no toman locks sobre filas ajenas.
begin;

create schema if not exists recorrido_e9a;
revoke all on schema recorrido_e9a from public, anon, authenticated, service_role;

create table if not exists recorrido_e9a.cuentas (
  user_id        uuid primary key,
  email          text not null,
  registrada_en  timestamptz not null default clock_timestamp()
);
create table if not exists recorrido_e9a.participantes (
  id             uuid primary key,
  user_id        uuid not null,
  registrado_en  timestamptz not null default clock_timestamp()
);
create table if not exists recorrido_e9a.versiones (
  id             bigint primary key,
  participante   uuid not null
);

create or replace function recorrido_e9a.registrar_cuenta()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email like '%@recorrido.test' then
    insert into recorrido_e9a.cuentas (user_id, email) values (new.id, new.email) on conflict do nothing;
  end if;
  return null;
end;
$$;

create or replace function recorrido_e9a.registrar_participante()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from recorrido_e9a.cuentas where user_id = new.user_id) then
    insert into recorrido_e9a.participantes (id, user_id) values (new.id, new.user_id) on conflict do nothing;
  end if;
  return null;
end;
$$;

create or replace function recorrido_e9a.registrar_version()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from recorrido_e9a.participantes where id = new.autor_participante) then
    insert into recorrido_e9a.versiones (id, participante) values (new.id, new.autor_participante) on conflict do nothing;
  end if;
  return null;
end;
$$;

revoke all on all functions in schema recorrido_e9a from public, anon, authenticated, service_role;

drop trigger if exists recorrido_e9a_cuenta on auth.users;
create trigger recorrido_e9a_cuenta after insert on auth.users
  for each row execute function recorrido_e9a.registrar_cuenta();
drop trigger if exists recorrido_e9a_participante on comunidad.participantes;
create trigger recorrido_e9a_participante after insert on comunidad.participantes
  for each row execute function recorrido_e9a.registrar_participante();
drop trigger if exists recorrido_e9a_version on comunidad.versiones;
create trigger recorrido_e9a_version after insert on comunidad.versiones
  for each row execute function recorrido_e9a.registrar_version();

commit;
