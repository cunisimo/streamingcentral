-- Reseñas de la comunidad, entrega E2b: contrato de baja de cuenta.
-- Plan: docs/superpowers/plans/2026-10-22-resenas-comunidad.md (E2b).
-- Diseño: docs/superpowers/specs/2026-10-21-resenas-comunidad-revision.md
-- (§2.2.3 contrato de baja, §2.2.4 orden de locks).
--
-- QUÉ HACE.
--   - Completa el marcador `comunidad.bajas_en_curso` (011) con su origen, la
--     copia de la sanción vigente y la cancelación administrativa.
--   - Funciones internas (esquema `comunidad`, nadie de la API las ejecuta):
--     `tomar_cuenta` (K_CORTE compartido → K_CUENTA), `resolver_participante`
--     (la puerta por la que pasa TODA escritura comunitaria futura),
--     `limpiar_participante` y `aplicar_baja` (el paso 1).
--   - Red de seguridad para bajas fuera de la ruta: trigger AFTER UPDATE OF
--     user_id sobre `participantes` (lo dispara el `on delete set null` de
--     Auth) y un BEFORE que impide volver a vincular un participante.
--   - API, sólo `service_role`: `comunidad_baja_comunitaria`,
--     `comunidad_baja_comunitaria_admin` (runbook), `comunidad_estado_baja`
--     y `comunidad_baja_registrar_fallo`.
--
-- LOCKS (§2.2.4). Dos espacios de claves de dos enteros, para no compartir
-- el de una sola clave que usan las salas (`hashtext('sala_crear:'…)`):
--   K_CORTE  = (7301, 0)                     compartido en cada escritura;
--                                             exclusivo sólo en la consolidación (E7)
--   K_CUENTA = (7302, hashtext(uid::text))   exclusivo, por cuenta
-- Orden: K_CORTE → K_CUENTA → participantes → reseñas → versiones →
-- votos/tramos → suspensión → contadores. La única excepción es la red de
-- seguridad, que corre dentro de la transacción de Auth con la fila ya
-- tomada (documentado abajo y en el runbook, docs/MANTENIMIENTO.md).
--
-- QUÉ BORRA LA BAJA Y QUÉ CONSERVA (§2.2.3, §5).
--   Cierra con su marca: los tramos donde la cuenta es evaluadora o autora.
--   Borra: sus reseñas (y en cascada sus versiones, los votos y las denuncias
--   que recibieron), sus votos, sus denuncias hechas, sus bloqueos hechos,
--   sus contadores y su nombre comunitario. Desvincula: user_id = null.
--   Conserva: el participante (seudónimo), los tramos cerrados, las
--   suspensiones (las necesita la reconstrucción del ranking, §2.2.2, y no
--   se quitan) y los bloqueos que OTROS le hicieron (son datos de otros).
--
-- Rollback: 012_comunidad_baja_down.sql.

begin;

-- ------------------------------------------------------------------
-- Marcador: origen, copia de la sanción y cancelación administrativa.
--   - `sancion_hasta`: fin de la suspensión vigente al pedir la baja
--     ('infinity' si era sin plazo). Si el admin cancela el marcador con la
--     sanción todavía vigente, el participante nuevo nace suspendido hasta
--     ahí (B14). Cae con la fila de Auth, como todo el marcador.
--   - `cancelada_en`: la cancelación del admin (E4,
--     `comunidad_quitar_marcador_baja`) NO borra la fila, la marca: así la
--     copia de la sanción sobrevive a la cancelación. Marcador ACTIVO =
--     fila con `cancelada_en is null`.
-- ------------------------------------------------------------------
alter table comunidad.bajas_en_curso
  add column if not exists origen text not null default 'app',
  add column if not exists sancion_hasta timestamptz,
  add column if not exists cancelada_en timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'bajas_origen' and conrelid = 'comunidad.bajas_en_curso'::regclass) then
    alter table comunidad.bajas_en_curso
      add constraint bajas_origen check (origen in ('app', 'admin'));
  end if;
end;
$$;

-- ------------------------------------------------------------------
-- tomar_cuenta: paso 1 del protocolo (§2.2.4). Sin ningún otro lock tomado:
-- K_CORTE compartido y después K_CUENTA exclusivo del uid. Son de
-- transacción: se sueltan al confirmar o revertir. Reentrantes dentro de la
-- misma transacción.
-- ------------------------------------------------------------------
create or replace function comunidad.tomar_cuenta(p_uid uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock_shared(7301, 0);
  perform pg_advisory_xact_lock(7302, hashtext(p_uid::text));
end;
$$;

-- ------------------------------------------------------------------
-- resolver_participante: TODA escritura comunitaria (E3 en adelante) pasa
-- por acá dentro de su propia transacción. Toma K_CORTE y K_CUENTA, y recién
-- con los locks relee el marcador: una escritura que verificó el Bearer
-- antes de la baja pero llega a la base después se rechaza (B3b); una que
-- tomó K_CUENTA antes confirma primero, y la baja espera (B3a).
--   - marcador activo → excepción `baja_en_curso` (SQLSTATE CB001); no se
--     crea participante;
--   - participante vinculado → su id, con la fila bloqueada;
--   - sin participante: con p_crear lo crea (y si un marcador CANCELADO
--     guarda una sanción todavía vigente, nace suspendido hasta ahí, B14);
--     sin p_crear devuelve null.
-- ------------------------------------------------------------------
create or replace function comunidad.resolver_participante(p_uid uuid, p_crear boolean)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id      uuid;
  v_sancion timestamptz;
  v_ahora   timestamptz;
begin
  if p_uid is null then
    raise exception 'resolver_participante: uid nulo' using errcode = '22004';
  end if;
  perform comunidad.tomar_cuenta(p_uid);

  if exists (select 1 from comunidad.bajas_en_curso
              where user_id = p_uid and cancelada_en is null) then
    raise exception 'baja_en_curso' using errcode = 'CB001',
      detail = 'La cuenta tiene una eliminación pendiente: no se aceptan operaciones comunitarias.';
  end if;

  select id into v_id from comunidad.participantes where user_id = p_uid for update;
  if found or not p_crear then
    return v_id;
  end if;

  insert into comunidad.participantes (user_id) values (p_uid) returning id into v_id;

  select sancion_hasta into v_sancion from comunidad.bajas_en_curso
   where user_id = p_uid and cancelada_en is not null;
  v_ahora := clock_timestamp();
  if v_sancion is not null and v_sancion > v_ahora then
    insert into comunidad.suspensiones (participante_id, desde, hasta)
    values (v_id, v_ahora, case when v_sancion = 'infinity' then null else v_sancion end);
  end if;
  return v_id;
end;
$$;

-- ------------------------------------------------------------------
-- limpiar_participante: lo que la baja hace con los datos comunitarios de un
-- participante. Supone K_CORTE y K_CUENTA ya tomados por quien llama. Toma
-- las filas en el orden global y recién después la marca. Idempotente: la
-- segunda vez no encuentra nada y devuelve ceros.
-- ------------------------------------------------------------------
create or replace function comunidad.limpiar_participante(p_part uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_marca       timestamptz;
  v_tramos      integer;
  v_votos       integer;
  v_denuncias   integer;
  v_resenas     integer;
  v_bloqueos    integer;
  v_contadores  integer;
begin
  -- Orden de locks: participante → reseñas → versiones → votos/tramos.
  perform 1 from comunidad.participantes where id = p_part for update;
  perform 1 from comunidad.resenas where autor_participante = p_part order by id for update;
  perform 1 from comunidad.versiones where autor_participante = p_part order by id for update;
  perform 1 from comunidad.evaluaciones
   where evaluador_participante = p_part or autor_participante = p_part
   order by evaluador_participante, version_id for update;
  perform 1 from comunidad.tramos
   where vigente_hasta is null and (evaluador_participante = p_part or autor_participante = p_part)
   order by evaluador_participante, version_id for update;

  v_marca := clock_timestamp();

  -- Tramos: se CIERRAN, nunca se borran (§2.2.2). Primero, antes de borrar
  -- reseñas y votos: los tramos guardan la versión sin FK y sobreviven.
  update comunidad.tramos set vigente_hasta = v_marca
   where vigente_hasta is null
     and (evaluador_participante = p_part or autor_participante = p_part);
  get diagnostics v_tramos = row_count;

  delete from comunidad.evaluaciones where evaluador_participante = p_part;
  get diagnostics v_votos = row_count;
  delete from comunidad.denuncias where denunciante_participante = p_part;
  get diagnostics v_denuncias = row_count;
  -- Las reseñas arrastran en cascada sus versiones y lo que colgaba de ellas
  -- (votos y denuncias de otros sobre ese texto).
  delete from comunidad.resenas where autor_participante = p_part;
  get diagnostics v_resenas = row_count;
  delete from comunidad.bloqueos where bloqueador_participante = p_part;
  get diagnostics v_bloqueos = row_count;
  delete from comunidad.contadores where participante_id = p_part;
  get diagnostics v_contadores = row_count;

  update comunidad.participantes
     set nombre_comunitario = null, nombre_cambiado_en = null
   where id = p_part and (nombre_comunitario is not null or nombre_cambiado_en is not null);

  return jsonb_build_object(
    'tramos_cerrados', v_tramos, 'evaluaciones_borradas', v_votos,
    'denuncias_borradas', v_denuncias, 'resenas_borradas', v_resenas,
    'bloqueos_borrados', v_bloqueos, 'contadores_borrados', v_contadores);
end;
$$;

-- ------------------------------------------------------------------
-- aplicar_baja: el paso 1 (§2.2.3), una transacción, idempotente.
-- Marcador (nuevo, existente o reactivado tras una cancelación) → copia de la
-- sanción vigente → limpieza → user_id = null. Sin participante, sólo el
-- marcador. Si la cuenta ya no existe en Auth, no hace nada (no hay a quién
-- marcar; su participante, si había, ya se desvinculó por la red de
-- seguridad).
-- ------------------------------------------------------------------
create or replace function comunidad.aplicar_baja(p_uid uuid, p_origen text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_marcador   text;
  v_cancelada  timestamptz;
  v_part       uuid;
  v_sancion    timestamptz;
  v_limpieza   jsonb := '{}'::jsonb;
begin
  if p_uid is null then
    raise exception 'aplicar_baja: uid nulo' using errcode = '22004';
  end if;
  perform comunidad.tomar_cuenta(p_uid);

  if not exists (select 1 from auth.users where id = p_uid) then
    return jsonb_build_object('cuenta', 'inexistente');
  end if;

  select cancelada_en into v_cancelada from comunidad.bajas_en_curso
   where user_id = p_uid for update;
  if not found then
    insert into comunidad.bajas_en_curso (user_id, origen) values (p_uid, p_origen);
    v_marcador := 'nuevo';
  elsif v_cancelada is not null then
    update comunidad.bajas_en_curso
       set cancelada_en = null, iniciada_en = now(), origen = p_origen,
           intentos = 0, ultimo_error = null
     where user_id = p_uid;
    v_marcador := 'reactivado';
  else
    v_marcador := 'existente';
  end if;

  select id into v_part from comunidad.participantes where user_id = p_uid for update;
  if found then
    -- La sanción que rige o está por regir: el fin más lejano ('infinity'
    -- si alguna es sin plazo). Las suspensiones NO se tocan.
    select max(coalesce(hasta, 'infinity'::timestamptz)) into v_sancion
      from comunidad.suspensiones
     where participante_id = v_part and (hasta is null or hasta > clock_timestamp());
    if v_sancion is not null then
      update comunidad.bajas_en_curso
         set sancion_hasta = greatest(coalesce(sancion_hasta, v_sancion), v_sancion)
       where user_id = p_uid;
    end if;
    v_limpieza := comunidad.limpiar_participante(v_part);
    -- Dispara la red de seguridad, que no encuentra nada más que hacer.
    update comunidad.participantes set user_id = null where id = v_part;
  end if;

  return jsonb_build_object(
    'cuenta', 'existe', 'marcador', v_marcador, 'origen', p_origen,
    'participante', v_part is not null, 'sancion_hasta', v_sancion) || v_limpieza;
end;
$$;

-- ------------------------------------------------------------------
-- Red de seguridad (§2.2.3, punto 3): una baja que no pasó por la ruta
-- (panel de Supabase, API admin de Auth). El `on delete set null` de
-- `participantes.user_id` es un UPDATE de esa columna y dispara esto DENTRO
-- de la transacción de Auth, que hace lo mismo que el paso 1.
--
-- ⚠️ ORDEN DE LOCKS INVERTIDO: Auth ya tiene la fila de `auth.users` y la de
-- `participantes` cuando esto pide K_CORTE y K_CUENTA. Puede haber deadlock
-- (Postgres aborta una transacción) o vencer `lock_timeout` (5 s acá): si la
-- abortada es la de Auth, el borrado se revierte ENTERO y se reintenta. Por
-- eso el runbook manda correr primero `comunidad_baja_comunitaria_admin`.
--
-- SECURITY DEFINER: corre con el rol de Auth (`supabase_auth_admin`), que no
-- tiene ningún permiso sobre `comunidad`.
-- ------------------------------------------------------------------
create or replace function comunidad.participantes_desvinculado()
returns trigger
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
begin
  perform comunidad.tomar_cuenta(old.user_id);
  perform comunidad.limpiar_participante(old.id);
  return null;
end;
$$;

drop trigger if exists participantes_desvinculado on comunidad.participantes;
create trigger participantes_desvinculado
  after update of user_id on comunidad.participantes
  for each row
  when (old.user_id is not null and new.user_id is null)
  execute function comunidad.participantes_desvinculado();

-- Un participante desvinculado no se vuelve a vincular, y un vínculo no se
-- cambia por otro: la cancelación de una baja NO restaura nada (B10). Si la
-- persona vuelve, nace otro participante.
create or replace function comunidad.participantes_vinculo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is not null and new.user_id is distinct from old.user_id then
    raise exception 'el participante % no se vuelve a vincular', old.id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists participantes_vinculo on comunidad.participantes;
create trigger participantes_vinculo
  before update of user_id on comunidad.participantes
  for each row execute function comunidad.participantes_vinculo();

-- ==================================================================
-- API. Sólo `service_role` (la ruta del servidor y el runbook). El uid lo
-- pone la ruta a partir del Bearer verificado; nunca sale del cliente.
-- `lock_timeout`: si una escritura en vuelo retiene K_CUENTA más de 10 s, la
-- baja falla entera (nada cambió) y se reintenta.
-- ==================================================================
create or replace function public.comunidad_baja_comunitaria(p_uid uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '10s'
as $$
begin
  return comunidad.aplicar_baja(p_uid, 'app');
end;
$$;

-- Runbook (docs/MANTENIMIENTO.md): baja pedida fuera de la app. Mismo paso 1;
-- devuelve además cuántos participantes siguen con ese user_id (tiene que ser 0).
create or replace function public.comunidad_baja_comunitaria_admin(p_uid uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '10s'
as $$
declare
  v jsonb;
begin
  v := comunidad.aplicar_baja(p_uid, 'admin');
  return v || jsonb_build_object('participantes_vinculados',
    (select count(*) from comunidad.participantes where user_id = p_uid));
end;
$$;

-- La ÚNICA vía para que una cuenta sepa que tiene una eliminación pendiente
-- (las tablas están cerradas). La ruta la llama con el uid del Bearer.
create or replace function public.comunidad_estado_baja(p_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object('pendiente', true, 'iniciada_en', b.iniciada_en, 'intentos', b.intentos)
       from comunidad.bajas_en_curso b
      where b.user_id = p_uid and b.cancelada_en is null),
    jsonb_build_object('pendiente', false));
$$;

-- Después de un `deleteUser` fallido con la cuenta confirmada viva.
create or replace function public.comunidad_baja_registrar_fallo(p_uid uuid, p_error text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update comunidad.bajas_en_curso
     set intentos = intentos + 1, ultimo_error = left(p_error, 500)
   where user_id = p_uid and cancelada_en is null;
  return found;
end;
$$;

-- ==================================================================
-- Permisos. Las internas, para nadie; las de API, sólo service_role.
-- (Ver el final de 011: el EXECUTE de PUBLIC es el default de PostgreSQL y
-- se revoca acá, objeto por objeto.)
-- ==================================================================
revoke all on function comunidad.tomar_cuenta(uuid)                       from public, anon, authenticated, service_role;
revoke all on function comunidad.resolver_participante(uuid, boolean)     from public, anon, authenticated, service_role;
revoke all on function comunidad.limpiar_participante(uuid)               from public, anon, authenticated, service_role;
revoke all on function comunidad.aplicar_baja(uuid, text)                 from public, anon, authenticated, service_role;
revoke all on function comunidad.participantes_desvinculado()             from public, anon, authenticated, service_role;
revoke all on function comunidad.participantes_vinculo()                  from public, anon, authenticated, service_role;

revoke all on function public.comunidad_baja_comunitaria(uuid)            from public, anon, authenticated;
revoke all on function public.comunidad_baja_comunitaria_admin(uuid)      from public, anon, authenticated;
revoke all on function public.comunidad_estado_baja(uuid)                 from public, anon, authenticated;
revoke all on function public.comunidad_baja_registrar_fallo(uuid, text)  from public, anon, authenticated;
grant execute on function public.comunidad_baja_comunitaria(uuid)           to service_role;
grant execute on function public.comunidad_baja_comunitaria_admin(uuid)     to service_role;
grant execute on function public.comunidad_estado_baja(uuid)                to service_role;
grant execute on function public.comunidad_baja_registrar_fallo(uuid, text) to service_role;

commit;
