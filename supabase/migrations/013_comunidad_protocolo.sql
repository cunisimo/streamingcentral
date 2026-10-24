-- Reseñas de la comunidad, entrega E2c: orden de locks y concurrencia base.
-- Plan: docs/superpowers/plans/2026-10-22-resenas-comunidad.md (E2c).
-- Diseño: docs/superpowers/specs/2026-10-21-resenas-comunidad-revision.md
-- (§2.2.2 cómputo al corte, §2.2.4 orden fijo en cada transacción que muta).
--
-- QUÉ HACE. Las primitivas internas del protocolo, una por paso. TODA
-- función de escritura posterior (E3a, E3b, E4, E6, E7) las usa en este
-- orden y en ningún otro:
--   1. proto_cuenta(uid, crear)  K_CORTE compartido → K_CUENTA → marcador
--                                (reusa resolver_participante de E2b);
--   2. locks de entidades, cada nivel UNA vez y en orden creciente:
--        2 proto_participantes(ids)   por id
--        3 proto_resena(id)
--        4 proto_versiones(ids)       por id
--        5 proto_votos(evaluadores, versiones)   evaluaciones y tramos
--                                     abiertos, por (evaluador, versión)
--        6 proto_suspensiones(participantes)     por (participante, id)
--        7 proto_contadores(participante, acciones, día)
--   3. relectura: la hace quien llama, sobre lo que acaba de bloquear;
--   4. proto_marca(): clock_timestamp() DESPUÉS de todos los locks; desde
--      ahí no se piden más;
--   5. mutación y confirmación.
-- La consolidación (E7) usa proto_corte_exclusivo() y ningún otro lock.
-- Además, dos primitivas del cómputo al corte: corte_de_mes y rige_antes_de
-- (y mes_ar), que E7 va a usar para consolidar.
--
-- 🔴 EL ORDEN SE HACE CUMPLIR, NO SE CONFÍA. Cada primitiva lee el nivel
-- alcanzado en la transacción (GUC local `comunidad.nivel_locks`) y lanza
-- CB002 `orden_de_locks` si se la llama fuera de orden: sin el paso 1, dos
-- veces el mismo nivel, un nivel menor después de uno mayor, o cualquier
-- lock después de la marca. Una función que viole el orden falla en el acto,
-- en vez de producir un deadlock esporádico bajo carga. Lo que el guardián
-- NO ve: locks tomados por fuera de estas primitivas (un `select … for
-- update` escrito a mano). Por eso las funciones de escritura no pueden
-- tomar locks de filas comunitarias por su cuenta (inventario en cada
-- entrega, plan §5.0).
--
-- Nadie de la API ejecuta estas funciones (revoke a PUBLIC, anon,
-- authenticated y service_role): sólo las funciones `security definer` del
-- dueño que lleguen en E3 en adelante.
--
-- Rollback: 013_comunidad_protocolo_down.sql.

begin;

-- ------------------------------------------------------------------
-- El guardián de nivel. 0 = nada tomado; 1 = paso 1; 2–7 = entidades;
-- 8 = marca tomada; 100 = consolidación.
-- ------------------------------------------------------------------
create or replace function comunidad.proto_nivel()
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(nullif(current_setting('comunidad.nivel_locks', true), '')::integer, 0);
$$;

create or replace function comunidad.proto_avanzar(p_nivel integer, p_paso text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_actual integer := comunidad.proto_nivel();
begin
  if p_nivel = 1 and v_actual <> 0 then
    raise exception 'orden_de_locks' using errcode = 'CB002',
      detail = format('%s: el paso 1 va primero y una sola vez (nivel actual %s)', p_paso, v_actual);
  end if;
  if p_nivel between 2 and 8 and (v_actual < 1 or v_actual >= p_nivel or v_actual >= 8) then
    raise exception 'orden_de_locks' using errcode = 'CB002',
      detail = format('%s: nivel %s pedido con el nivel %s ya alcanzado', p_paso, p_nivel, v_actual);
  end if;
  if p_nivel = 100 and v_actual <> 0 then
    raise exception 'orden_de_locks' using errcode = 'CB002',
      detail = format('%s: la consolidación no toma ningún otro lock (nivel actual %s)', p_paso, v_actual);
  end if;
  -- Local a la transacción: se borra al confirmar o revertir, y una
  -- subtransacción revertida lo restaura.
  perform set_config('comunidad.nivel_locks', p_nivel::text, true);
end;
$$;

-- ------------------------------------------------------------------
-- resolver_participante SIN bloquear la fila del actor (auditoría de E2c,
-- A1). La versión de 012 terminaba con `select … for update` sobre el
-- participante del actor: el paso 1 retenía ESA fila antes del bloqueo
-- ordenado de proto_participantes, y dos actores cruzados (A evalúa la
-- reseña de B mientras B evalúa la de A) quedaban cada uno con la suya y
-- pidiendo la del otro → 40P01, aunque los dos siguieran el protocolo.
--
-- Ahora el paso 1 sólo toma K_CORTE compartido y K_CUENTA (locks
-- consultivos) y LEE el participante. Lo que el lock de fila daba ya lo da
-- K_CUENTA, que se toma antes de leer y se retiene hasta confirmar:
--   - marcador: se relee con K_CUENTA tomado (B2, B3b);
--   - serialización por cuenta y creación de identidad: dos operaciones de
--     la misma cuenta se excluyen por K_CUENTA, así que no se pueden crear
--     dos participantes ni cambiar el vínculo en el medio;
--   - baja: aplicar_baja toma K_CUENTA antes de tocar la fila (B3a, B4);
--   - cancelación con sanción: igual que antes (B14).
-- La fila se bloquea recién en el nivel 2, en el orden global por id. Quien
-- llama la relee ahí (paso 3). Bloqueos implícitos del paso 1: el INSERT de
-- un participante nuevo retiene su propia fila (invisible para los demás
-- hasta confirmar) y un KEY SHARE sobre su fila de auth.users (FK). Con la
-- sanción copiada, el INSERT de la suspensión toma KEY SHARE sobre ese
-- mismo participante nuevo. Ninguno toca filas de otro actor.
--
-- 013_down restaura la definición de 012, sin cambios.
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

  -- Sin FOR UPDATE: K_CUENTA ya excluye a toda otra operación de esta
  -- cuenta, y el lock de fila va en el nivel 2, en orden.
  select id into v_id from comunidad.participantes where user_id = p_uid;
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
revoke all on function comunidad.resolver_participante(uuid, boolean) from public, anon, authenticated, service_role;

-- ------------------------------------------------------------------
-- Paso 1: K_CORTE compartido → K_CUENTA → relectura del marcador. Devuelve
-- el participante (o null si no existe y p_crear es falso), SIN bloquear su
-- fila: eso es del nivel 2. Con baja en curso lanza CB001 (E2b).
-- ------------------------------------------------------------------
create or replace function comunidad.proto_cuenta(p_uid uuid, p_crear boolean)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v uuid;
begin
  perform comunidad.proto_avanzar(1, 'proto_cuenta');
  v := comunidad.resolver_participante(p_uid, p_crear);
  return v;
end;
$$;

-- ------------------------------------------------------------------
-- Paso 2: entidades, en el orden global. Cada una devuelve lo que bloqueó,
-- para que quien llama RELEA el estado ya bloqueado (paso 3).
-- ------------------------------------------------------------------
create or replace function comunidad.proto_participantes(p_ids uuid[])
returns setof comunidad.participantes
language plpgsql
set search_path = ''
as $$
begin
  perform comunidad.proto_avanzar(2, 'proto_participantes');
  return query
    select * from comunidad.participantes where id = any(p_ids) order by id for update;
end;
$$;

create or replace function comunidad.proto_resena(p_id bigint)
returns setof comunidad.resenas
language plpgsql
set search_path = ''
as $$
begin
  perform comunidad.proto_avanzar(3, 'proto_resena');
  return query select * from comunidad.resenas where id = p_id for update;
end;
$$;

create or replace function comunidad.proto_versiones(p_ids bigint[])
returns setof comunidad.versiones
language plpgsql
set search_path = ''
as $$
begin
  perform comunidad.proto_avanzar(4, 'proto_versiones');
  return query
    select * from comunidad.versiones where id = any(p_ids) order by id for update;
end;
$$;

-- Votos y tramos abiertos de los pares (evaluador ∈ p_evaluadores, versión ∈
-- p_versiones), en orden (evaluador, versión). Un voto que todavía no existe
-- no tiene fila: lo protegen el lock del participante evaluador (nivel 2) y
-- el de la versión (nivel 4), que toda operación sobre ese par toma antes.
create or replace function comunidad.proto_votos(p_evaluadores uuid[], p_versiones bigint[])
returns table (evaluacion_id bigint, tramo_id bigint)
language plpgsql
set search_path = ''
as $$
begin
  perform comunidad.proto_avanzar(5, 'proto_votos');
  return query
    with e as (
      select ev.id, ev.evaluador_participante, ev.version_id from comunidad.evaluaciones ev
       where ev.evaluador_participante = any(p_evaluadores) and ev.version_id = any(p_versiones)
       order by ev.evaluador_participante, ev.version_id, ev.id
       for update
    ), t as (
      select tr.id, tr.evaluador_participante, tr.version_id from comunidad.tramos tr
       where tr.vigente_hasta is null
         and tr.evaluador_participante = any(p_evaluadores) and tr.version_id = any(p_versiones)
       order by tr.evaluador_participante, tr.version_id, tr.id
       for update
    )
    select e.id, null::bigint from e
    union all
    select null::bigint, t.id from t;
end;
$$;

create or replace function comunidad.proto_suspensiones(p_participantes uuid[])
returns setof comunidad.suspensiones
language plpgsql
set search_path = ''
as $$
begin
  perform comunidad.proto_avanzar(6, 'proto_suspensiones');
  return query
    select * from comunidad.suspensiones where participante_id = any(p_participantes)
     order by participante_id, id for update;
end;
$$;

-- Contadores del día argentino: crea las filas que falten (cantidad 0) y
-- las bloquea, en orden (participante, acción, día).
create or replace function comunidad.proto_contadores(p_participante uuid, p_acciones text[], p_dia date)
returns setof comunidad.contadores
language plpgsql
set search_path = ''
as $$
begin
  perform comunidad.proto_avanzar(7, 'proto_contadores');
  insert into comunidad.contadores (participante_id, accion, dia)
  select p_participante, a, p_dia from unnest(p_acciones) a order by a
  on conflict do nothing;
  return query
    select * from comunidad.contadores
     where participante_id = p_participante and accion = any(p_acciones) and dia = p_dia
     order by accion for update;
end;
$$;

-- ------------------------------------------------------------------
-- Paso 4: la marca, después de todos los locks. Después de esto no se
-- toma ningún lock más (cualquier primitiva lanza CB002).
-- ------------------------------------------------------------------
create or replace function comunidad.proto_marca()
returns timestamptz
language plpgsql
set search_path = ''
as $$
begin
  perform comunidad.proto_avanzar(8, 'proto_marca');
  return clock_timestamp();
end;
$$;

-- ------------------------------------------------------------------
-- La consolidación: K_CORTE exclusivo y ningún otro lock. Devuelve el
-- instante L en que lo obtuvo. El cálculo va en UNA sentencia posterior en
-- READ COMMITTED (§2.2.4, "Aislamiento"): con REPEATABLE READ o
-- SERIALIZABLE la instantánea quedaría fijada antes de obtener el lock, y
-- por eso esta función lo rechaza.
-- ------------------------------------------------------------------
create or replace function comunidad.proto_corte_exclusivo()
returns timestamptz
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'la consolidación corre en READ COMMITTED (actual: %)', current_setting('transaction_isolation')
      using errcode = 'CB002';
  end if;
  perform comunidad.proto_avanzar(100, 'proto_corte_exclusivo');
  perform pg_advisory_xact_lock(7301, 0);
  return clock_timestamp();
end;
$$;

-- ------------------------------------------------------------------
-- Cómputo al corte (§2.2.2). T(M) = 00:00 del día 1 del mes siguiente en
-- America/Argentina/Buenos_Aires. Un intervalo [desde, hasta) rige en el
-- instante inmediatamente anterior a T(M) si y sólo si desde < T(M) y
-- (hasta nulo o T(M) ≤ hasta). La misma condición para tramos y
-- suspensiones.
-- ------------------------------------------------------------------
create or replace function comunidad.corte_de_mes(p_mes date)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select (date_trunc('month', p_mes) + interval '1 month')::timestamp
           at time zone 'America/Argentina/Buenos_Aires';
$$;

create or replace function comunidad.rige_antes_de(p_desde timestamptz, p_hasta timestamptz, p_corte timestamptz)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_desde < p_corte and (p_hasta is null or p_corte <= p_hasta);
$$;

-- El mes argentino de un instante (para `mes_primera_positiva`).
create or replace function comunidad.mes_ar(p_t timestamptz)
returns date
language sql
immutable
set search_path = ''
as $$
  select date_trunc('month', p_t at time zone 'America/Argentina/Buenos_Aires')::date;
$$;

-- ==================================================================
-- Permisos: ninguna es de la API.
-- ==================================================================
revoke all on function comunidad.proto_nivel()                                from public, anon, authenticated, service_role;
revoke all on function comunidad.proto_avanzar(integer, text)                  from public, anon, authenticated, service_role;
revoke all on function comunidad.proto_cuenta(uuid, boolean)                   from public, anon, authenticated, service_role;
revoke all on function comunidad.proto_participantes(uuid[])                   from public, anon, authenticated, service_role;
revoke all on function comunidad.proto_resena(bigint)                          from public, anon, authenticated, service_role;
revoke all on function comunidad.proto_versiones(bigint[])                     from public, anon, authenticated, service_role;
revoke all on function comunidad.proto_votos(uuid[], bigint[])                 from public, anon, authenticated, service_role;
revoke all on function comunidad.proto_suspensiones(uuid[])                    from public, anon, authenticated, service_role;
revoke all on function comunidad.proto_contadores(uuid, text[], date)          from public, anon, authenticated, service_role;
revoke all on function comunidad.proto_marca()                                 from public, anon, authenticated, service_role;
revoke all on function comunidad.proto_corte_exclusivo()                       from public, anon, authenticated, service_role;
revoke all on function comunidad.corte_de_mes(date)                            from public, anon, authenticated, service_role;
revoke all on function comunidad.rige_antes_de(timestamptz, timestamptz, timestamptz) from public, anon, authenticated, service_role;
revoke all on function comunidad.mes_ar(timestamptz)                           from public, anon, authenticated, service_role;

commit;
