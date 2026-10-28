-- Quita el registro de propiedad del recorrido E9a. SÓLO LOCAL. Lo corre
-- `recorrido-e9a.mjs limpiar` DESPUÉS de verificar la limpieza (con una
-- discrepancia, el registro se conserva para reintentar). Idempotente.
begin;
drop trigger if exists recorrido_e9a_cuenta on auth.users;
drop trigger if exists recorrido_e9a_participante on comunidad.participantes;
drop trigger if exists recorrido_e9a_version on comunidad.versiones;
drop schema if exists recorrido_e9a cascade;
commit;
