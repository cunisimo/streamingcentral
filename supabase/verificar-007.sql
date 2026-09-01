-- Verificación REAL de la migración 007. No es una migración: no se aplica sola.
--
-- ============================================================================
-- PARA QUÉ EXISTE
-- ============================================================================
-- Los tests de `npm test` barren el TEXTO del SQL: comprueban que una
-- protección no desaparezca del archivo, no que Postgres se comporte. Este
-- script es lo otro — corre consultas de verdad contra una base con la 007
-- aplicada y falla ruidosamente si algo no hace lo que dice.
--
-- 🔴 NO CORRERLO EN PRODUCCIÓN. Escribe y borra filas de `top_rankings`. Va en
-- un Supabase local (`supabase start`) o en una rama/proyecto descartable.
--
-- ============================================================================
-- CÓMO SE USA
-- ============================================================================
--   1. Aplicar `007_top_manual.sql` en la base descartable.
--   2. Correr este archivo entero.
--   3. Termina con "VERIFICACIÓN COMPLETA" o revienta en el primer problema.
--
-- ⚠️ Los bloques marcados COMO ADMIN necesitan una sesión real con `aal2` y dos
-- factores TOTP: `is_admin_mfa()` mira `auth.uid()` y `auth.jwt()`, que en el
-- SQL editor no existen. Están escritos como comprobaciones a ejecutar desde la
-- app, no desde acá, y el script lo dice en vez de fingir que los cubrió.

-- ⚠️ SIN `\set ON_ERROR_STOP`: es una metaorden de `psql`, no SQL, y en el
-- editor de Supabase da error de sintaxis. No hace falta — un `DO` falla entero
-- ante una excepción no capturada, que es exactamente el comportamiento que se
-- busca acá.
do $$
declare
  r_pub   uuid;
  r_bor   uuid;
  u_admin uuid;
  ok      boolean;
begin
  -- 🔴 UN UUID INVENTADO NO SIRVE: `revisado_por` tiene FK contra `auth.users`,
  -- así que asignarlo a mano rompe con violación de clave ajena y el script
  -- muere en el paso 2 sin llegar a probar nada. Se toma un usuario real.
  select id into u_admin from auth.users limit 1;
  if u_admin is null then
    raise exception
      'No hay ningún usuario en auth.users. Creá primero el administrador de prueba (Authentication -> Users) y volvé a correr esto.';
  end if;
  raise notice 'Usando el usuario % como revisor de prueba', u_admin;

  -- El script crea un borrador de `n/movie` y el índice parcial sólo admite
  -- uno por bloque: con la tabla ya poblada choca en el paso 2 con un error
  -- de unicidad que parece un fallo de la migración y no lo es.
  if exists (select 1 from top_rankings) then
    raise exception
      'top_rankings ya tiene filas. Este verificador necesita la tabla vacía: corrélo en una base descartable recién migrada, antes de cargar bloques.';
  end if;

  raise notice '--- 1. PRIVILEGIOS DE COLUMNA ---';
  -- Lo que la tercera auditoría encontró: `revoke select (columna)` no alcanza
  -- porque los privilegios son aditivos.
  if has_column_privilege('anon', 'public.top_rankings', 'creado_por', 'select')
     or has_column_privilege('anon', 'public.top_rankings', 'revisado_por', 'select')
     or has_column_privilege('authenticated', 'public.top_rankings', 'creado_por', 'select')
     or has_column_privilege('authenticated', 'public.top_rankings', 'revisado_por', 'select') then
    raise exception 'FALLA: la autoría es legible';
  end if;
  if not has_column_privilege('anon', 'public.top_rankings', 'plataforma', 'select')
     or not has_column_privilege('anon', 'public.top_rankings', 'revisado', 'select') then
    raise exception 'FALLA: se revocó de más y la app no puede leer';
  end if;
  raise notice 'OK: autoría oculta, columnas públicas legibles';

  raise notice '--- 2. LA COLUMNA DERIVADA ---';
  insert into top_rankings (plataforma, tipo) values ('n', 'movie') returning id into r_bor;
  select revisado into ok from top_rankings where id = r_bor;
  if ok then raise exception 'FALLA: un borrador nuevo nace revisado'; end if;
  update top_rankings set revisado_por = u_admin where id = r_bor;
  select revisado into ok from top_rankings where id = r_bor;
  if not ok then raise exception 'FALLA: `revisado` no sigue a `revisado_por`'; end if;
  raise notice 'OK: `revisado` deriva de `revisado_por`';

  raise notice '--- 3. TOCAR UNA ENTRADA INVALIDA LA REVISIÓN ---';
  insert into top_ranking_entries (ranking_id, posicion, tipo, tmdb_id, titulo)
  values (r_bor, 1, 'movie', 603, 'Matrix');
  select revisado into ok from top_rankings where id = r_bor;
  if ok then raise exception 'FALLA: insertar una entrada no desmarcó la revisión'; end if;

  update top_rankings set revisado_por = u_admin where id = r_bor;
  update top_ranking_entries set titulo = 'Otro' where ranking_id = r_bor and posicion = 1;
  select revisado into ok from top_rankings where id = r_bor;
  if ok then raise exception 'FALLA: modificar una entrada no desmarcó'; end if;

  update top_rankings set revisado_por = u_admin where id = r_bor;
  delete from top_ranking_entries where ranking_id = r_bor and posicion = 1;
  select revisado into ok from top_rankings where id = r_bor;
  if ok then raise exception 'FALLA: borrar una entrada no desmarcó'; end if;
  raise notice 'OK: INSERT, UPDATE y DELETE desmarcan';

  raise notice '--- 4. LA FECHA DE CAPTURA TAMBIÉN DESMARCA ---';
  update top_rankings set revisado_por = u_admin where id = r_bor;
  update top_rankings set captured_at = captured_at + 7 where id = r_bor;
  select revisado into ok from top_rankings where id = r_bor;
  if ok then raise exception 'FALLA: cambiar la fecha dejó la revisión puesta'; end if;
  raise notice 'OK: cambiar `captured_at` desmarca';

  raise notice '--- 5. UN SOLO BORRADOR POR BLOQUE ---';
  begin
    insert into top_rankings (plataforma, tipo) values ('n', 'movie');
    raise exception 'FALLA: entraron dos borradores del mismo bloque';
  exception when unique_violation then
    raise notice 'OK: el índice parcial rechaza el segundo borrador';
  end;

  raise notice '--- 6. LO PUBLICADO ES INMUTABLE ---';
  -- Se publica a mano: `publicar_top` exige `is_admin_mfa()`, que acá no aplica.
  insert into top_ranking_entries (ranking_id, posicion, tipo, tmdb_id, titulo)
  select r_bor, g, 'movie', 600 + g, 'T' || g from generate_series(1, 10) g;
  -- Se publica con la revisión puesta, como lo haría `publicar_top`: así el
  -- paso 7 limpia una publicación con `revisado_por` NO nulo, que es el caso
  -- real. La versión anterior lo dejaba en null por casualidad y la limpieza
  -- pasaba por un motivo que no era el correcto.
  update top_rankings
     set revisado_por = u_admin, estado = 'publicado', published_at = now()
   where id = r_bor;
  r_pub := r_bor;

  begin
    update top_rankings set captured_at = captured_at + 1 where id = r_pub;
    raise exception 'FALLA: se modificó una publicación';
  exception when raise_exception then
    if sqlerrm like 'FALLA%' then raise; end if;
    raise notice 'OK: no se puede modificar una publicación';
  end;

  begin
    delete from top_rankings where id = r_pub;
    raise exception 'FALLA: se borró una publicación';
  exception when raise_exception then
    if sqlerrm like 'FALLA%' then raise; end if;
    raise notice 'OK: no se puede borrar una publicación';
  end;

  begin
    delete from top_ranking_entries where ranking_id = r_pub and posicion = 1;
    raise exception 'FALLA: se vació una publicación posición por posición';
  exception when raise_exception then
    if sqlerrm like 'FALLA%' then raise; end if;
    raise notice 'OK: no se pueden borrar las entradas publicadas';
  end;

  raise notice '--- 7. LIMPIEZA ---';
  -- La publicación es inmutable a propósito, así que para limpiar hay que
  -- desactivar los triggers. Es la prueba final de que están puestos.
  alter table top_rankings disable trigger top_rankings_sin_delete;
  alter table top_ranking_entries disable trigger top_entries_sin_delete;
  delete from top_ranking_entries where ranking_id = r_pub;
  delete from top_rankings where id = r_pub;
  alter table top_rankings enable trigger top_rankings_sin_delete;
  alter table top_ranking_entries enable trigger top_entries_sin_delete;

  raise notice '=== VERIFICACIÓN COMPLETA ===';
end $$;

-- ============================================================================
-- LO QUE ESTE SCRIPT **NO** PUEDE PROBAR, Y HAY QUE HACER DESDE LA APP
-- ============================================================================
-- Todo lo que depende de una sesión real: `auth.uid()` y `auth.jwt()` son nulos
-- en el SQL editor, así que `is_admin_mfa()` da false y `publicar_top` y
-- `reemplazar_entradas` cortan en su primera línea. No se puede simular sin
-- inventar un JWT, y un test que inventa el JWT no prueba la puerta.
--
--   a. `factores_totp_verificados()` cuenta los factores reales — con UN factor
--      verificado, `is_admin_mfa()` tiene que dar false y el dashboard rechazar.
--   b. Con DOS factores y `aal2`, publicar tiene que funcionar.
--   c. `publicar_top` deja el borrador siguiente con las diez posiciones y con
--      `copiado_de` apuntando a la publicación.
--   d. `reemplazar_entradas` es atómica: con un `p_entradas` inválido, el
--      borrador conserva las diez viejas.
--   e. Publicar cuatro bloques no toca los otros ocho.
--   f. `creado_por` queda registrado en los doce borradores iniciales
--      (`default auth.uid()`), y por lo tanto en la primera publicación.
--
-- Se prueban entrando al dashboard con la sesión del admin y mirando la base
-- después. La secuencia está en `docs/ESTADO.md`.
