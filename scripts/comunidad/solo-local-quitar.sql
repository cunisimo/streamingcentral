-- Quita las ayudas de solo-local.sql de la base local compartida.
begin;
drop trigger if exists solo_local_falla_borrado on auth.users;
drop schema if exists solo_local cascade;
commit;
