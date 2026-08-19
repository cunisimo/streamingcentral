-- "No es para mí" del riel "Elegidas para vos": descartar UN título exacto sin
-- marcarlo visto, sin votarlo Malaso y sin rechazar su temática.
--
-- Va como kind nuevo de `user_items` y no como tabla propia: la clave única
-- `(user_id, tmdb_id, tipo, kind)` es exactamente la que hace falta, y la
-- policy de RLS no menciona `kind` —es `for all using (auth.uid() = user_id)`—
-- así que cubre el valor nuevo SIN cambios. Verificado en pg_constraint y
-- pg_policies, no asumido.
--
-- POR QUÉ UNA MIGRACIÓN Y NO RE-CORRER schema.sql: la tabla se declara con
-- `create table if not exists`, así que sobre una base que ya existe re-correr
-- el schema NO toca el constraint y el error aparecería recién al primer
-- descarte, en producción.
alter table user_items drop constraint if exists user_items_kind_check;
alter table user_items add constraint user_items_kind_check
  check (kind in ('list', 'watched', 'dismissed'));
