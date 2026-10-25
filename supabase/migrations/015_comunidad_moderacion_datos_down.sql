-- Rollback de 015_comunidad_moderacion_datos.sql: deja la base como con 014
-- aplicada. Va ANTES de 014_down. Antes de activar no hay datos reales; si
-- los hubiera, se pierden las huellas, los excedentes de denuncias, las
-- corroboraciones y el origen de los bloqueos (los bloqueos y denuncias
-- quedan, en sus tablas de 011).
--
-- Las funciones que 015 redefinió vuelven a su definición de 013 y 014,
-- COPIA LITERAL (generada de esos archivos; up-down-up lo compara).
begin;

drop function if exists public.comunidad_bloqueados(uuid);
drop function if exists public.comunidad_desbloquear(uuid, bigint);
drop function if exists public.comunidad_bloquear(uuid, bigint);
drop function if exists public.comunidad_retener_por_regla(bigint, jsonb);
drop function if exists public.comunidad_denunciar(uuid, bigint, text, text);
drop function if exists comunidad.cola_denuncias();
drop function if exists comunidad.reglas_texto(jsonb, text);
drop function if exists comunidad.admision(uuid, bigint);
drop function if exists comunidad.retenidos_sin_resolver(uuid, bigint);
drop function if exists comunidad.duplicado(uuid, bigint, jsonb);
drop function if exists comunidad.huella_valida(jsonb);
drop function if exists comunidad.proto_cola(text);
drop function if exists comunidad.proto_huella(text);

drop table if exists comunidad.corroboraciones;
drop table if exists comunidad.denuncias_excedentes;
drop table if exists comunidad.huellas;
drop function if exists comunidad.shingles_forma(text[]);
drop index if exists comunidad.versiones_en_cola;
drop index if exists comunidad.denuncias_por_creacion;

do $$
begin
  if to_regclass('comunidad.bloqueos') is not null then
    alter table comunidad.bloqueos
      drop constraint if exists bloqueos_id_unico,
      drop column if exists id,
      drop column if exists origen_tipo,
      drop column if exists origen_tmdb_id;
  end if;
  if to_regclass('comunidad.config') is not null then
    alter table comunidad.config
      drop column if exists admision_por_autor,
      drop column if exists admision_global,
      drop column if exists denuncias_filas_por_version,
      drop column if exists denuncias_por_hora;
  end if;
end;
$$;

-- 013, tal cual.
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


-- 014, tal cual.
create or replace function comunidad.hay_cupo(p_part uuid, p_accion text, p_dia date)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  c comunidad.config;
  v_limite integer;
  v_cant integer;
begin
  select * into c from comunidad.config;
  v_limite := case p_accion
    when 'resena' then c.limite_resenas when 'edicion' then c.limite_ediciones
    when 'evaluacion' then c.limite_evaluaciones end;
  select cantidad into v_cant from comunidad.contadores
   where participante_id = p_part and accion = p_accion and dia = p_dia;
  return coalesce(v_cant, 0) < v_limite;
end;
$$;

create or replace function public.comunidad_publicar(
  p_uid uuid, p_tipo text, p_tmdb_id integer, p_texto text, p_decision jsonb,
  p_id_intento uuid, p_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_dec text := comunidad.decision_valida(p_decision);
  v_part uuid;
  v_prev jsonb;
  v_motivo text;
  v_existente bigint;
  v_dia date := comunidad.dia_ar(clock_timestamp());
  m timestamptz;
  v_resena bigint;
  v_version bigint;
  v_res jsonb;
begin
  v_part := comunidad.proto_cuenta(p_uid, false);
  if v_part is null then return comunidad.rechazo_cuenta('terminos_pendientes'); end if;
  perform 1 from comunidad.proto_participantes(array[v_part]);
  perform 1 from comunidad.proto_suspensiones(array[v_part]);
  perform 1 from comunidad.proto_contadores(v_part, array['resena'], v_dia);

  -- Relectura, con todo bloqueado.
  v_prev := comunidad.intento_previo(v_part, 'publicar', p_id_intento, p_hash);
  if v_prev is not null then return v_prev; end if;
  v_motivo := comunidad.condiciones_a(p_uid, v_part);
  if v_motivo is not null then return comunidad.rechazo_cuenta(v_motivo); end if;
  select id into v_existente from comunidad.resenas
   where autor_participante = v_part and tipo = p_tipo and tmdb_id = p_tmdb_id and borrada_en is null;
  if found then return comunidad.rechazo_cuenta('resena_existente', jsonb_build_object('resena_id', v_existente)); end if;
  if not comunidad.hay_cupo(v_part, 'resena', v_dia) then return comunidad.rechazo_cuenta('limite_diario'); end if;

  m := comunidad.proto_marca();
  perform comunidad.consumir_cupo(v_part, 'resena', v_dia);

  if v_dec = 'rechazo_contenido' then
    -- No se guarda el texto (§5); sí cuenta para el límite y queda el intento.
    v_res := jsonb_build_object('resultado', 'rechazo_contenido');
  else
    insert into comunidad.resenas (autor_participante, tipo, tmdb_id, primera_publicacion_en)
    values (v_part, p_tipo, p_tmdb_id, case when v_dec = 'publicar' then m end)
    returning id into v_resena;
    insert into comunidad.versiones (resena_id, autor_participante, texto, estado, version_reglas, regla, id_intento, creada_en)
    values (v_resena, v_part, p_texto, case when v_dec = 'publicar' then 'publicada' else 'retenida' end,
            p_decision->>'version_reglas',
            nullif(left(array_to_string(array(select jsonb_array_elements_text(p_decision->'reglas')), ','), 80), ''),
            p_id_intento, m)
    returning id into v_version;
    update comunidad.resenas set version_vigente_id = v_version where id = v_resena;
    v_res := jsonb_build_object('resultado', case when v_dec = 'publicar' then 'publicada' else 'retenida' end,
                                'resena_id', v_resena, 'version_id', v_version);
  end if;
  insert into comunidad.intentos (participante_id, accion, id_intento, hash_peticion, resultado)
  values (v_part, 'publicar', p_id_intento, p_hash, v_res);
  -- Las comprobaciones DIFERIDAS de vigencia (011) se corren acá, dentro de la
  -- función y con el rol del dueño. Al confirmar correrían con el rol de la
  -- sesión (service_role), que no tiene USAGE sobre `comunidad`.
  set constraints all immediate;
  return v_res;
end;
$$;

create or replace function public.comunidad_editar(
  p_uid uuid, p_resena bigint, p_version_esperada bigint, p_texto text, p_decision jsonb,
  p_id_intento uuid, p_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_dec text := comunidad.decision_valida(p_decision);
  v_part uuid;
  v_prev jsonb;
  v_motivo text;
  r comunidad.resenas;
  v comunidad.versiones;
  v_dia date := comunidad.dia_ar(clock_timestamp());
  m timestamptz;
  v_nueva bigint;
  v_votos integer;
  v_res jsonb;
begin
  v_part := comunidad.proto_cuenta(p_uid, false);
  if v_part is null then return comunidad.rechazo_cuenta('terminos_pendientes'); end if;
  perform 1 from comunidad.proto_participantes(array[v_part]);
  select * into r from comunidad.proto_resena(p_resena);
  if not found or r.autor_participante <> v_part or r.borrada_en is not null then
    return comunidad.rechazo_cuenta('no_encontrada');
  end if;
  select * into v from comunidad.proto_versiones(array[r.version_vigente_id]);
  perform 1 from comunidad.proto_votos(
    coalesce((select array_agg(distinct e.evaluador_participante) from comunidad.evaluaciones e
               where e.version_id = r.version_vigente_id), '{}'::uuid[]),
    array[r.version_vigente_id]);
  perform 1 from comunidad.proto_suspensiones(array[v_part]);
  perform 1 from comunidad.proto_contadores(v_part, array['edicion'], v_dia);

  v_prev := comunidad.intento_previo(v_part, 'editar', p_id_intento, p_hash);
  if v_prev is not null then return v_prev; end if;
  v_motivo := comunidad.condiciones_a(p_uid, v_part);
  if v_motivo is not null then return comunidad.rechazo_cuenta(v_motivo); end if;
  if r.version_vigente_id is distinct from p_version_esperada then
    return jsonb_build_object('resultado', 'conflicto', 'motivo', 'version', 'version_vigente', r.version_vigente_id);
  end if;
  if v.texto = p_texto then
    -- Sin cambios: nada se persiste, los votos quedan (§3.4.1). No consume cupo.
    return jsonb_build_object('resultado', 'sin_cambios', 'resena_id', r.id, 'version_id', v.id);
  end if;
  if not comunidad.hay_cupo(v_part, 'edicion', v_dia) then return comunidad.rechazo_cuenta('limite_diario'); end if;

  m := comunidad.proto_marca();
  perform comunidad.consumir_cupo(v_part, 'edicion', v_dia);

  if v_dec = 'rechazo_contenido' then
    -- La anterior sigue intacta, con sus votos (§3.4.1).
    v_res := jsonb_build_object('resultado', 'rechazo_contenido', 'resena_id', r.id, 'version_id', v.id);
  else
    update comunidad.versiones set estado = 'reemplazada', decidida_en = m where id = v.id;
    insert into comunidad.versiones (resena_id, autor_participante, texto, estado, version_reglas, regla, id_intento, creada_en)
    values (r.id, v_part, p_texto, case when v_dec = 'publicar' then 'publicada' else 'retenida' end,
            p_decision->>'version_reglas',
            nullif(left(array_to_string(array(select jsonb_array_elements_text(p_decision->'reglas')), ','), 80), ''),
            p_id_intento, m)
    returning id into v_nueva;
    update comunidad.resenas
       set version_vigente_id = v_nueva,
           primera_publicacion_en = coalesce(primera_publicacion_en, case when v_dec = 'publicar' then m end)
     where id = r.id;
    -- Reinicio de votos: UNA vez, en la misma transacción que guarda la nueva.
    update comunidad.evaluaciones set retirada_en = m, actualizada_en = m
     where version_id = v.id and retirada_en is null;
    get diagnostics v_votos = row_count;
    update comunidad.tramos set vigente_hasta = m where version_id = v.id and vigente_hasta is null;
    v_res := jsonb_build_object('resultado', case when v_dec = 'publicar' then 'publicada' else 'retenida' end,
                                'resena_id', r.id, 'version_id', v_nueva, 'votos_reiniciados', v_votos);
  end if;
  insert into comunidad.intentos (participante_id, accion, id_intento, hash_peticion, resultado)
  values (v_part, 'editar', p_id_intento, p_hash, v_res);
  set constraints all immediate;   -- ver comunidad_publicar
  return v_res;
end;
$$;

create or replace function public.comunidad_borrar(p_uid uuid, p_resena bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_part uuid;
  r comunidad.resenas;
  v_versiones bigint[];
  m timestamptz;
begin
  v_part := comunidad.proto_cuenta(p_uid, false);
  if v_part is null then return comunidad.rechazo_cuenta('no_encontrada'); end if;
  perform 1 from comunidad.proto_participantes(array[v_part]);
  select * into r from comunidad.proto_resena(p_resena);
  if not found or r.autor_participante <> v_part then return comunidad.rechazo_cuenta('no_encontrada'); end if;
  select coalesce(array_agg(id order by id), '{}') into v_versiones from comunidad.versiones where resena_id = r.id;
  perform 1 from comunidad.proto_versiones(v_versiones);
  perform 1 from comunidad.proto_votos(
    coalesce((select array_agg(distinct e.evaluador_participante) from comunidad.evaluaciones e
               where e.version_id = any(v_versiones)), '{}'::uuid[]),
    v_versiones);
  if r.borrada_en is not null then
    return jsonb_build_object('resultado', 'borrada', 'resena_id', r.id, 'repetido', true);
  end if;
  m := comunidad.proto_marca();
  update comunidad.resenas set borrada_en = m where id = r.id;
  -- Borrar la reseña cierra sus tramos (§2.2.2); no los borra.
  update comunidad.tramos set vigente_hasta = m where version_id = any(v_versiones) and vigente_hasta is null;
  return jsonb_build_object('resultado', 'borrada', 'resena_id', r.id);
end;
$$;

create or replace function public.comunidad_leer_titulo(p_uid uuid, p_tipo text, p_tmdb_id integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c comunidad.config;
  v_part uuid;
  v_terminos text;
  v_mia jsonb;
  v_otras jsonb;
begin
  select * into c from comunidad.config;
  if not c.modulo_activo then return jsonb_build_object('activo', false); end if;
  select id, terminos_version into v_part, v_terminos from comunidad.participantes where user_id = p_uid;

  select jsonb_build_object('resena_id', r.id, 'version_id', v.id, 'texto', v.texto, 'estado', v.estado,
           'utiles', (select count(*) from comunidad.evaluaciones e where e.version_id = v.id and e.retirada_en is null and e.util),
           'total', (select count(*) from comunidad.evaluaciones e where e.version_id = v.id and e.retirada_en is null))
    into v_mia
    from comunidad.resenas r join comunidad.versiones v on v.id = r.version_vigente_id
   where r.autor_participante = v_part and r.tipo = p_tipo and r.tmdb_id = p_tmdb_id and r.borrada_en is null;

  select coalesce(jsonb_agg(x order by (x->>'creada_en') desc), '[]'::jsonb) into v_otras from (
    select jsonb_build_object('resena_id', r.id, 'version_id', v.id, 'texto', v.texto, 'creada_en', v.creada_en,
             'utiles', (select count(*) from comunidad.evaluaciones e where e.version_id = v.id and e.retirada_en is null and e.util),
             'total', (select count(*) from comunidad.evaluaciones e where e.version_id = v.id and e.retirada_en is null),
             'mi_voto', (select case when e.util then 'util' else 'no_util' end from comunidad.evaluaciones e
                          where e.version_id = v.id and e.evaluador_participante = v_part and e.retirada_en is null)) as x
      from comunidad.resenas r join comunidad.versiones v on v.id = r.version_vigente_id
     where r.tipo = p_tipo and r.tmdb_id = p_tmdb_id and r.borrada_en is null and v.estado = 'publicada'
       and r.autor_participante is distinct from v_part
     order by v.creada_en desc limit 20) t;

  return jsonb_build_object(
    'activo', true,
    'publicacion_activa', c.publicacion_activa,
    'terminos', jsonb_build_object('vigente', c.terminos_version, 'aceptada', v_terminos is not distinct from c.terminos_version and v_part is not null),
    'correo_confirmado', exists (select 1 from auth.users u where u.id = p_uid and u.email_confirmed_at is not null),
    'baja_en_curso', exists (select 1 from comunidad.bajas_en_curso b where b.user_id = p_uid and b.cancelada_en is null),
    'suspendida', v_part is not null and exists (select 1 from comunidad.suspensiones s where s.participante_id = v_part
                    and s.desde <= now() and (s.hasta is null or s.hasta > now())),
    'mia', v_mia,
    'otras', v_otras);
end;
$$;


revoke all on function comunidad.proto_avanzar(integer, text) from public, anon, authenticated, service_role;
revoke all on function comunidad.proto_marca()               from public, anon, authenticated, service_role;
revoke all on function comunidad.hay_cupo(uuid, text, date)  from public, anon, authenticated, service_role;

commit;
