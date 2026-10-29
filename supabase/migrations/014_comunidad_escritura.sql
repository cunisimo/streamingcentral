-- Reseñas de la comunidad, entrega E3a: escritura de reseñas, ediciones,
-- borrado y votos de utilidad, con idempotencia y la matriz de autorización.
-- Plan: docs/superpowers/plans/2026-10-22-resenas-comunidad.md (E3a).
-- Diseño: docs/superpowers/specs/2026-10-21-resenas-comunidad-revision.md
-- (§2.1.2 matriz, §2.2.4 protocolo, §3.3 decisiones, §3.4.1 ediciones).
--
-- QUÉ HACE.
--   - Términos comunitarios versionados: `config.terminos_version` y, por
--     participante, la versión aceptada. Aceptar es lo único que crea la
--     identidad comunitaria (proto_cuenta con crear).
--   - `comunidad.intentos`: idempotencia por (participante, acción,
--     id_intento) con el hash del cuerpo normalizado. Mismo id y mismo hash →
--     el resultado guardado; mismo id con otro hash → conflicto genérico, sin
--     revelar el resultado anterior. Retención: 7 días (E8, purga).
--   - Funciones de API, SÓLO service_role (la ruta corre las reglas de E1 y
--     pasa la decisión; un JWT de usuario no las puede llamar):
--       comunidad_aceptar_terminos, comunidad_publicar, comunidad_editar,
--       comunidad_borrar, comunidad_votar, comunidad_retirar_voto,
--       comunidad_textos_recientes (contexto de las reglas) y
--       comunidad_leer_titulo (lectura PROVISIONAL mínima para la interfaz
--       de E3a; E5a la reemplaza con visibilidad, bloqueos y paginación).
--
-- PROTOCOLO (§2.2.4, primitivas de 013). Cada escritura: proto_cuenta (sin
-- bloquear la fila del actor) → proto_participantes → proto_resena →
-- proto_versiones → proto_votos → proto_suspensiones → proto_contadores →
-- RELECTURA de todo lo bloqueado → proto_marca → mutación. Nada se escribe
-- antes de la marca, así que un rechazo, un conflicto o un error no dejan
-- nada. Bloqueos implícitos de las escrituras (KEY SHARE de las FK): caen
-- sobre filas ya bloqueadas en un nivel anterior (participantes, versiones)
-- o sobre la propia fila de auth.users del actor; ninguno sobre filas de
-- otro actor que no estén ya tomadas en orden.
--
-- 🔴 TRIGGERS DIFERIDOS. Los de vigencia de 011 (`resenas_vigencia`,
-- `versiones_vigencia`) y la FK diferida de la vigente corren al CONFIRMAR,
-- ya fuera de la función `security definer`, con el rol de la sesión. Para
-- service_role eso es `permission denied for schema comunidad` (comprobado
-- en E3a). Por eso publicar y editar terminan con `set constraints all
-- immediate`: las comprobaciones corren dentro de la función, con el dueño,
-- y siguen siendo obligatorias. No se le da a la API ningún permiso sobre el
-- esquema.
--
-- MATRIZ (§2.1.2). Fila A (publicar, editar, votar): módulo activo,
-- publicación no pausada, sin suspensión vigente, correo confirmado,
-- términos vigentes aceptados, límite del día. Fila B (borrar la propia,
-- retirar el propio voto): sólo propiedad; nada más las impide. La baja en
-- curso (marcador, E2b) rechaza todo con CB001 dentro de proto_cuenta.
--
-- Rollback: 014_comunidad_escritura_down.sql.

begin;

-- ------------------------------------------------------------------
-- Términos versionados. El texto es un BORRADOR LOCAL (sin aprobar: revisión
-- §5, "términos comunitarios versionados", a validar por alguien competente).
-- ------------------------------------------------------------------
alter table comunidad.config
  add column if not exists terminos_version text not null default 'borrador-local-1';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'config_terminos_forma'
                  and conrelid = 'comunidad.config'::regclass) then
    alter table comunidad.config add constraint config_terminos_forma
      check (char_length(terminos_version) between 1 and 40);
  end if;
end;
$$;

alter table comunidad.participantes
  add column if not exists terminos_version text,
  add column if not exists terminos_aceptados_en timestamptz;

-- ------------------------------------------------------------------
-- Idempotencia (auditoría e34c53e; plan E3a).
-- ------------------------------------------------------------------
create table if not exists comunidad.intentos (
  participante_id  uuid not null references comunidad.participantes (id),
  accion           text not null check (accion in ('publicar', 'editar')),
  id_intento       uuid not null,
  hash_peticion    text not null check (hash_peticion ~ '^[0-9a-f]{64}$'),
  resultado        jsonb not null,
  creado_en        timestamptz not null default now(),
  primary key (participante_id, accion, id_intento)
);
alter table comunidad.intentos enable row level security;
revoke all on comunidad.intentos from public, anon, authenticated, service_role;

-- ==================================================================
-- Auxiliares internas (esquema comunidad: nadie de la API).
-- ==================================================================

-- El día argentino de un instante (límites por día, §2.1.2).
create or replace function comunidad.dia_ar(p_t timestamptz)
returns date
language sql
immutable
set search_path = ''
as $$
  select (p_t at time zone 'America/Argentina/Buenos_Aires')::date;
$$;

-- Condiciones de la fila A, sobre lo ya bloqueado. Devuelve el motivo del
-- rechazo de cuenta o null. El orden de los motivos sólo decide cuál se
-- informa cuando hay varios.
create or replace function comunidad.condiciones_a(p_uid uuid, p_part uuid)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  c comunidad.config;
  v_terminos text;
begin
  select * into c from comunidad.config;
  if not c.modulo_activo then return 'modulo_apagado'; end if;
  if not c.publicacion_activa then return 'publicacion_pausada'; end if;
  if exists (select 1 from comunidad.suspensiones s
              where s.participante_id = p_part and s.desde <= clock_timestamp()
                and (s.hasta is null or s.hasta > clock_timestamp())) then
    return 'suspendida';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_uid and u.email_confirmed_at is not null) then
    return 'correo_pendiente';
  end if;
  select terminos_version into v_terminos from comunidad.participantes where id = p_part;
  if v_terminos is distinct from c.terminos_version then return 'terminos_pendientes'; end if;
  return null;
end;
$$;

-- ¿Queda cupo hoy para la acción? (contador ya bloqueado por proto_contadores)
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

create or replace function comunidad.consumir_cupo(p_part uuid, p_accion text, p_dia date)
returns void
language sql
set search_path = ''
as $$
  update comunidad.contadores set cantidad = cantidad + 1
   where participante_id = p_part and accion = p_accion and dia = p_dia;
$$;

-- La decisión de reglas que manda la ruta (§3.3). Sólo tres resultados
-- llegan a la base: los rechazos de formato y los errores se responden en la
-- ruta sin tocarla. Cualquier otra forma es un error, nunca un "publicar".
create or replace function comunidad.decision_valida(p jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p is null or jsonb_typeof(p) <> 'object'
     or (p->>'resultado') is null or (p->>'resultado') not in ('publicar', 'retener', 'rechazo_contenido')
     or coalesce(char_length(p->>'version_reglas'), 0) not between 1 and 40
     or jsonb_typeof(coalesce(p->'reglas', '[]'::jsonb)) <> 'array' then
    raise exception 'decision_invalida' using errcode = '22023';
  end if;
  if (p->>'resultado') <> 'publicar' and jsonb_array_length(coalesce(p->'reglas', '[]'::jsonb)) = 0 then
    raise exception 'decision_invalida' using errcode = '22023', detail = 'un rechazo o una retención sin regla';
  end if;
  return p->>'resultado';
end;
$$;

-- Resultado guardado de un intento, o null. Mismo id con otro hash: conflicto.
create or replace function comunidad.intento_previo(p_part uuid, p_accion text, p_id uuid, p_hash text)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  i comunidad.intentos;
begin
  if p_id is null or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'intento_invalido' using errcode = '22023';
  end if;
  select * into i from comunidad.intentos
   where participante_id = p_part and accion = p_accion and id_intento = p_id;
  if not found then return null; end if;
  if i.hash_peticion <> p_hash then
    -- Genérico: no revela qué pasó con el primero.
    return jsonb_build_object('resultado', 'conflicto', 'motivo', 'intento');
  end if;
  return i.resultado || jsonb_build_object('repetido', true);
end;
$$;

create or replace function comunidad.rechazo_cuenta(p_motivo text, p_extra jsonb default '{}'::jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('resultado', 'rechazo_cuenta', 'motivo', p_motivo) || p_extra;
$$;

-- ==================================================================
-- API (sólo service_role). `lock_timeout` corto: si vence, la operación
-- falla entera (nada se escribe antes de la marca) y se reintenta.
-- ==================================================================

-- Aceptar los términos vigentes. Crea la identidad comunitaria si no existe.
create or replace function public.comunidad_aceptar_terminos(p_uid uuid, p_version text)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  c comunidad.config;
  v_part uuid;
  m timestamptz;
begin
  select * into c from comunidad.config;
  if not c.modulo_activo then return comunidad.rechazo_cuenta('modulo_apagado'); end if;
  if p_version is distinct from c.terminos_version then
    return comunidad.rechazo_cuenta('terminos_desactualizados', jsonb_build_object('vigente', c.terminos_version));
  end if;
  v_part := comunidad.proto_cuenta(p_uid, true);
  perform 1 from comunidad.proto_participantes(array[v_part]);
  m := comunidad.proto_marca();
  update comunidad.participantes
     set terminos_version = p_version, terminos_aceptados_en = m
   where id = v_part;
  return jsonb_build_object('resultado', 'terminos_aceptados', 'version', p_version);
end;
$$;

-- Reseña nueva (fila A).
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

-- Edición (fila A, §3.4.1).
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

-- Borrar la propia (fila B: nada más la impide). Idempotente.
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

-- "Me sirvió" (true) / "No me sirvió" (false). Fila A. Una vigente por
-- evaluador y versión; nunca la propia.
create or replace function public.comunidad_votar(p_uid uuid, p_version bigint, p_util boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_part uuid;
  v_autor uuid;
  v_resena_id bigint;
  r comunidad.resenas;
  v comunidad.versiones;
  v_motivo text;
  v_vig comunidad.evaluaciones;
  v_dia date := comunidad.dia_ar(clock_timestamp());
  m timestamptz;
begin
  if p_util is null then raise exception 'voto_invalido' using errcode = '22023'; end if;
  v_part := comunidad.proto_cuenta(p_uid, false);
  if v_part is null then return comunidad.rechazo_cuenta('terminos_pendientes'); end if;
  -- Autor y reseña de una versión son inmutables (trigger de 011): leerlos
  -- antes de bloquear no cambia nada; el estado se relee después.
  select autor_participante, resena_id into v_autor, v_resena_id from comunidad.versiones where id = p_version;
  if not found then return comunidad.rechazo_cuenta('version_no_disponible'); end if;
  perform 1 from comunidad.proto_participantes(array(select distinct x from unnest(array[v_part, v_autor]) x));
  select * into r from comunidad.proto_resena(v_resena_id);
  select * into v from comunidad.proto_versiones(array[p_version]);
  perform 1 from comunidad.proto_votos(array[v_part], array[p_version]);
  perform 1 from comunidad.proto_suspensiones(array[v_part]);
  perform 1 from comunidad.proto_contadores(v_part, array['evaluacion'], v_dia);

  v_motivo := comunidad.condiciones_a(p_uid, v_part);
  if v_motivo is not null then return comunidad.rechazo_cuenta(v_motivo); end if;
  if v_autor = v_part then return comunidad.rechazo_cuenta('propia'); end if;
  if v.estado <> 'publicada' or r.version_vigente_id is distinct from p_version or r.borrada_en is not null then
    return comunidad.rechazo_cuenta('version_no_disponible');
  end if;
  select * into v_vig from comunidad.evaluaciones
   where evaluador_participante = v_part and version_id = p_version and retirada_en is null;
  if found and v_vig.util = p_util then
    return jsonb_build_object('resultado', 'sin_cambios', 'util', p_util);
  end if;
  if not comunidad.hay_cupo(v_part, 'evaluacion', v_dia) then return comunidad.rechazo_cuenta('limite_diario'); end if;

  m := comunidad.proto_marca();
  perform comunidad.consumir_cupo(v_part, 'evaluacion', v_dia);
  if v_vig.id is null then
    insert into comunidad.evaluaciones (version_id, autor_participante, evaluador_participante, util, creada_en, actualizada_en)
    values (p_version, v_autor, v_part, p_util, m, m);
  else
    update comunidad.evaluaciones set util = p_util, actualizada_en = m where id = v_vig.id;
  end if;
  if p_util then
    if not exists (select 1 from comunidad.tramos where evaluador_participante = v_part and version_id = p_version
                     and vigente_hasta is null) then
      insert into comunidad.tramos (evaluador_participante, autor_participante, version_id, mes_primera_positiva, vigente_desde)
      values (v_part, v_autor, p_version,
              coalesce((select min(t.mes_primera_positiva) from comunidad.tramos t
                         where t.evaluador_participante = v_part and t.version_id = p_version),
                       comunidad.mes_ar(m)),
              m);
    end if;
  else
    update comunidad.tramos set vigente_hasta = m
     where evaluador_participante = v_part and version_id = p_version and vigente_hasta is null;
  end if;
  return jsonb_build_object('resultado', 'voto_registrado', 'util', p_util);
end;
$$;

-- Retirar el propio voto (fila B). Idempotente.
create or replace function public.comunidad_retirar_voto(p_uid uuid, p_version bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_part uuid;
  v_vig bigint;
  m timestamptz;
begin
  v_part := comunidad.proto_cuenta(p_uid, false);
  if v_part is null then return jsonb_build_object('resultado', 'sin_efecto'); end if;
  perform 1 from comunidad.proto_participantes(array[v_part]);
  perform 1 from comunidad.proto_versiones(array[p_version]);
  perform 1 from comunidad.proto_votos(array[v_part], array[p_version]);
  select id into v_vig from comunidad.evaluaciones
   where evaluador_participante = v_part and version_id = p_version and retirada_en is null;
  if not found then return jsonb_build_object('resultado', 'sin_efecto'); end if;
  m := comunidad.proto_marca();
  update comunidad.evaluaciones set retirada_en = m, actualizada_en = m where id = v_vig;
  update comunidad.tramos set vigente_hasta = m
   where evaluador_participante = v_part and version_id = p_version and vigente_hasta is null;
  return jsonb_build_object('resultado', 'voto_retirado');
end;
$$;

-- Contexto de las reglas (contacto partido, §3.4): hasta 3 textos propios de
-- las últimas 24 h, el más reciente primero. Sin locks: es un aviso previo;
-- la decisión la vuelve a validar la función que escribe.
create or replace function public.comunidad_textos_recientes(p_uid uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array(
    select v.texto from comunidad.versiones v
      join comunidad.participantes p on p.id = v.autor_participante
     where p.user_id = p_uid and v.creada_en > now() - interval '24 hours'
     order by v.creada_en desc limit 3), '{}');
$$;

-- LECTURA PROVISIONAL MÍNIMA de un título (sólo para la interfaz local de
-- E3a). La de E5a la reemplaza: filtro de bloqueos y suspensiones,
-- paginación y orden. Con el módulo apagado no devuelve nada.
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

-- ==================================================================
-- Permisos.
-- ==================================================================
revoke all on function comunidad.dia_ar(timestamptz)                         from public, anon, authenticated, service_role;
revoke all on function comunidad.condiciones_a(uuid, uuid)                   from public, anon, authenticated, service_role;
revoke all on function comunidad.hay_cupo(uuid, text, date)                  from public, anon, authenticated, service_role;
revoke all on function comunidad.consumir_cupo(uuid, text, date)             from public, anon, authenticated, service_role;
revoke all on function comunidad.decision_valida(jsonb)                      from public, anon, authenticated, service_role;
revoke all on function comunidad.intento_previo(uuid, text, uuid, text)      from public, anon, authenticated, service_role;
revoke all on function comunidad.rechazo_cuenta(text, jsonb)                 from public, anon, authenticated, service_role;

revoke all on function public.comunidad_aceptar_terminos(uuid, text)                                  from public, anon, authenticated;
revoke all on function public.comunidad_publicar(uuid, text, integer, text, jsonb, uuid, text)        from public, anon, authenticated;
revoke all on function public.comunidad_editar(uuid, bigint, bigint, text, jsonb, uuid, text)         from public, anon, authenticated;
revoke all on function public.comunidad_borrar(uuid, bigint)                                          from public, anon, authenticated;
revoke all on function public.comunidad_votar(uuid, bigint, boolean)                                  from public, anon, authenticated;
revoke all on function public.comunidad_retirar_voto(uuid, bigint)                                    from public, anon, authenticated;
revoke all on function public.comunidad_textos_recientes(uuid)                                        from public, anon, authenticated;
revoke all on function public.comunidad_leer_titulo(uuid, text, integer)                              from public, anon, authenticated;
grant execute on function public.comunidad_aceptar_terminos(uuid, text)                               to service_role;
grant execute on function public.comunidad_publicar(uuid, text, integer, text, jsonb, uuid, text)     to service_role;
grant execute on function public.comunidad_editar(uuid, bigint, bigint, text, jsonb, uuid, text)      to service_role;
grant execute on function public.comunidad_borrar(uuid, bigint)                                       to service_role;
grant execute on function public.comunidad_votar(uuid, bigint, boolean)                               to service_role;
grant execute on function public.comunidad_retirar_voto(uuid, bigint)                                 to service_role;
grant execute on function public.comunidad_textos_recientes(uuid)                                     to service_role;
grant execute on function public.comunidad_leer_titulo(uuid, text, integer)                           to service_role;

commit;
