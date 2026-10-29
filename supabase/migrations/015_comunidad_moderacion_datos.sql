-- Reseñas de la comunidad, entrega E3b: admisión a la cola de retenidos,
-- duplicados, denuncias, bloqueos y "Pedir revisión" de un rechazo.
-- Plan: docs/superpowers/plans/2026-10-22-resenas-comunidad.md (E3b).
-- Diseño: docs/superpowers/specs/2026-10-21-resenas-comunidad-revision.md
-- (§2.1.2 matriz filas C y D, §3.3 colas y admisión, §3.3.1 duplicados,
-- §3.3.2 denuncias, §3.3.3 revisión de un rechazo, §3.3.4 bloqueos, §3.4.1).
--
-- QUÉ HACE.
--   - Límites nuevos en `comunidad.config`, todos HIPÓTESIS ajustables sin
--     migración (no son valores aprobados; P6): admisión por autor (2) y
--     global (50), filas de denuncia por versión (50, después sólo un
--     contador) e ingreso global de denuncias por hora (100).
--   - Protocolo (013): dos niveles nuevos ANTES de la marca. 8 = huella
--     (lock consultivo por hash de texto: los duplicados entre cuentas se
--     comparan sin carrera), 9 = cola (lock consultivo de la cola de
--     retenidos o de denuncias: los topes globales se cumplen bajo
--     concurrencia). La marca pasa al nivel 10. Las funciones de 014 no
--     cambian de orden: siguen siendo 1–7 → marca.
--   - `comunidad.huellas`: hash HMAC del texto plegado y hashes HMAC de los
--     shingles de 3 palabras, por versión guardada. Nunca fragmentos en
--     claro: un CHECK exige hex. El secreto vive SÓLO en el servidor
--     (lib/comunidad/duplicados.ts); la base nunca lo ve. Se borran con la
--     versión (cascada) y al borrar la reseña.
--   - publicar y editar (014, redefinidas): duplicados, admisión a la cola y
--     revisión pedida (`revision_solicitada`). Lo que pasa las reglas se
--     publica aunque la cola esté llena; lo que sería retenido y no entra
--     NO se guarda ("probá más tarde"). Nada se publica por vencimiento.
--   - Denuncias (fila C): una por denunciante y versión, como mucho N filas
--     por versión y después un contador por hora (`denuncias_excedentes`),
--     tope global por hora. Ninguna oculta contenido; la cantidad sólo
--     ORDENA (`comunidad.cola_denuncias`, para E4). La corroboración (la
--     ruta vuelve a correr las reglas) retiene POR LA REGLA, no por la
--     denuncia (`comunidad_retener_por_regla`).
--   - Bloqueos (fila D): bloquear desde una versión, desbloquear por id,
--     listar los propios. La lectura provisional del título oculta al
--     bloqueado para quien bloquea (sólo eso: el resto de la visibilidad es
--     E5a).
--   - Borrar (014, redefinida): borra también las huellas de la reseña.
--
-- 🔴 NO RESUELVE el pendiente de las denuncias RECIBIDAS que caen en cascada
-- al borrar una cuenta (012, limpiar_participante): sigue explícito para su
-- entrega (antes de E4, E8 y la publicación). Las tablas nuevas que cuelgan
-- de una versión (huellas, excedentes, corroboraciones) caen con ella, igual
-- que las denuncias hoy. Tampoco fija plazos de retención (E8).
--
-- Rollback: 015_comunidad_moderacion_datos_down.sql (vuelve a 014 tal cual).

begin;

-- ------------------------------------------------------------------
-- Límites (HIPÓTESIS, §3.3 y auditoría e34c53e). Ajustables sin migración.
-- ------------------------------------------------------------------
alter table comunidad.config
  add column if not exists admision_por_autor           integer not null default 2   check (admision_por_autor >= 0),
  add column if not exists admision_global              integer not null default 50  check (admision_global >= 0),
  add column if not exists denuncias_filas_por_version  integer not null default 50  check (denuncias_filas_por_version >= 0),
  add column if not exists denuncias_por_hora           integer not null default 100 check (denuncias_por_hora >= 0);

-- ------------------------------------------------------------------
-- Huellas de duplicados (§3.3.1). Hex o nada.
-- ------------------------------------------------------------------
create or replace function comunidad.shingles_forma(p text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is not null and cardinality(p) between 1 and 600
     and coalesce((select bool_and(x ~ '^[0-9a-f]{16}$') from unnest(p) x), false);
$$;

create table if not exists comunidad.huellas (
  version_id          bigint primary key,
  resena_id           bigint not null,
  autor_participante  uuid not null,
  hash_texto          text not null check (hash_texto ~ '^[0-9a-f]{64}$'),
  shingles            text[] not null check (comunidad.shingles_forma(shingles)),
  creada_en           timestamptz not null,
  constraint huellas_version_autor_fk foreign key (version_id, autor_participante)
    references comunidad.versiones (id, autor_participante) on delete cascade,
  constraint huellas_version_resena_fk foreign key (version_id, resena_id)
    references comunidad.versiones (id, resena_id) on delete cascade
);
create index if not exists huellas_por_hash  on comunidad.huellas (hash_texto, creada_en);
create index if not exists huellas_por_autor on comunidad.huellas (autor_participante, creada_en desc);

-- Retenidos sin resolver: la admisión los cuenta en cada envío que iría a la cola.
create index if not exists versiones_en_cola on comunidad.versiones (id)
  where estado in ('retenida', 'revision_solicitada');

-- ------------------------------------------------------------------
-- Denuncias: excedente por versión y hora (después de N filas) e índice del
-- ingreso por hora. Corroboraciones: qué regla retuvo una versión ya
-- publicada al revalidarla tras una denuncia (`version_reglas` de la versión
-- es inmutable: la de la retención va acá).
-- ------------------------------------------------------------------
create table if not exists comunidad.denuncias_excedentes (
  version_id          bigint not null,
  autor_participante  uuid not null,
  hora                timestamptz not null,
  cantidad            integer not null check (cantidad >= 1),
  graves              integer not null check (graves between 0 and cantidad),
  primary key (version_id, hora),
  constraint excedentes_version_autor_fk foreign key (version_id, autor_participante)
    references comunidad.versiones (id, autor_participante) on delete cascade
);
create index if not exists denuncias_por_creacion on comunidad.denuncias (creada_en);
create index if not exists excedentes_por_hora on comunidad.denuncias_excedentes (hora);

create table if not exists comunidad.corroboraciones (
  version_id          bigint primary key,
  autor_participante  uuid not null,
  version_reglas      text not null check (char_length(version_reglas) between 1 and 40),
  reglas              text not null check (char_length(reglas) between 1 and 200),
  creada_en           timestamptz not null,
  constraint corroboraciones_version_autor_fk foreign key (version_id, autor_participante)
    references comunidad.versiones (id, autor_participante) on delete cascade
);

-- ------------------------------------------------------------------
-- Bloqueos: id para desbloquear sin exponer participantes, y el título desde
-- el que se bloqueó (para reconocerlo en la cuenta; dato de quien bloquea).
-- ------------------------------------------------------------------
alter table comunidad.bloqueos
  add column if not exists id bigint generated always as identity,
  add column if not exists origen_tipo text check (origen_tipo is null or origen_tipo in ('movie', 'tv')),
  add column if not exists origen_tmdb_id integer check (origen_tmdb_id is null or origen_tmdb_id > 0);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bloqueos_id_unico'
                  and conrelid = 'comunidad.bloqueos'::regclass) then
    alter table comunidad.bloqueos add constraint bloqueos_id_unico unique (id);
  end if;
end;
$$;

alter table comunidad.huellas              enable row level security;
alter table comunidad.denuncias_excedentes enable row level security;
alter table comunidad.corroboraciones      enable row level security;
revoke all on comunidad.huellas, comunidad.denuncias_excedentes, comunidad.corroboraciones
  from public, anon, authenticated, service_role;
revoke all on all sequences in schema comunidad from public, anon, authenticated, service_role;

-- ==================================================================
-- Protocolo: niveles 8 (huella) y 9 (cola); la marca pasa a 10.
-- ==================================================================
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
  if p_nivel between 2 and 10 and (v_actual < 1 or v_actual >= p_nivel or v_actual >= 10) then
    raise exception 'orden_de_locks' using errcode = 'CB002',
      detail = format('%s: nivel %s pedido con el nivel %s ya alcanzado', p_paso, p_nivel, v_actual);
  end if;
  if p_nivel = 100 and v_actual <> 0 then
    raise exception 'orden_de_locks' using errcode = 'CB002',
      detail = format('%s: la consolidación no toma ningún otro lock (nivel actual %s)', p_paso, v_actual);
  end if;
  perform set_config('comunidad.nivel_locks', p_nivel::text, true);
end;
$$;

-- Nivel 8: el hash del texto. Dos envíos con el mismo texto (de cualquier
-- cuenta) se serializan acá, así el conteo de cuentas distintas no tiene
-- carrera. Una colisión de `hashtext` sólo serializa de más.
create or replace function comunidad.proto_huella(p_hash text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform comunidad.proto_avanzar(8, 'proto_huella');
  perform pg_advisory_xact_lock(7303, hashtext(p_hash));
end;
$$;

-- Nivel 9: la cola. Sólo lo toma quien va a ENTRAR a una cola (un envío
-- que sería retenido, una denuncia): lo que se publica no espera acá.
create or replace function comunidad.proto_cola(p_cola text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_cola is null or p_cola not in ('retenidos', 'denuncias') then
    raise exception 'proto_cola: cola desconocida %', p_cola using errcode = '22023';
  end if;
  perform comunidad.proto_avanzar(9, 'proto_cola');
  perform pg_advisory_xact_lock(7304, case p_cola when 'retenidos' then 1 else 2 end);
end;
$$;

create or replace function comunidad.proto_marca()
returns timestamptz
language plpgsql
set search_path = ''
as $$
begin
  perform comunidad.proto_avanzar(10, 'proto_marca');
  return clock_timestamp();
end;
$$;

-- ==================================================================
-- Auxiliares internas.
-- ==================================================================

-- Límites por día: suma denuncias y bloqueos a los de 014.
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
    when 'evaluacion' then c.limite_evaluaciones when 'denuncia' then c.limite_denuncias
    when 'bloqueo' then c.limite_bloqueos end;
  select cantidad into v_cant from comunidad.contadores
   where participante_id = p_part and accion = p_accion and dia = p_dia;
  return coalesce(v_cant, 0) < v_limite;
end;
$$;

-- La huella que manda la ruta: { texto: hex64, shingles: [hex16…] }.
-- Cualquier otra forma es un error (nunca "sin huella, publicar").
create or replace function comunidad.huella_valida(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p is not null and jsonb_typeof(p) = 'object'
     and coalesce(p->>'texto', '') ~ '^[0-9a-f]{64}$'
     and jsonb_typeof(p->'shingles') = 'array'
     and comunidad.shingles_forma(array(select jsonb_array_elements_text(p->'shingles')));
end;
$$;

-- ¿Es duplicado (§3.3.1)? Devuelve la regla o null. "Otra versión de la
-- misma cuenta" se lee como de OTRA reseña: una edición de la misma reseña
-- se parece por definición a su versión anterior y no es spam.
--   - hash igual a otra reseña propia → duplicado_propio;
--   - Jaccard de shingles ≥ 0,8 con una de las últimas 50 versiones propias
--     (de otras reseñas) → casi_duplicado_propio;
--   - el mismo hash en 3 o más cuentas distintas en 7 días → duplicado_coordinado.
-- Corre con el hash ya bloqueado (nivel 8) y la cuenta serializada (paso 1).
create or replace function comunidad.duplicado(p_part uuid, p_resena bigint, p_huella jsonb)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_hash text := p_huella->>'texto';
  v_sh text[] := array(select distinct x from jsonb_array_elements_text(p_huella->'shingles') x);
begin
  if exists (select 1 from comunidad.huellas h
              where h.autor_participante = p_part and h.hash_texto = v_hash
                and h.resena_id is distinct from p_resena) then
    return 'duplicado_propio';
  end if;
  if exists (
    select 1 from (
      select h.shingles from comunidad.huellas h
       where h.autor_participante = p_part and h.resena_id is distinct from p_resena
       order by h.creada_en desc limit 50) u
     where (select count(*) from (select unnest(u.shingles) intersect select unnest(v_sh)) i)::numeric
         / nullif((select count(*) from (select unnest(u.shingles) union select unnest(v_sh)) j), 0) >= 0.8) then
    return 'casi_duplicado_propio';
  end if;
  if (select count(distinct h.autor_participante) from comunidad.huellas h
       where h.hash_texto = v_hash and h.autor_participante <> p_part
         and h.creada_en > clock_timestamp() - interval '7 days') >= 3 then
    return 'duplicado_coordinado';
  end if;
  return null;
end;
$$;

-- Retenidos sin resolver: vigentes, retenidos o con revisión pedida, de
-- reseñas no borradas. p_part null = todos. p_excluir: la reseña que esta
-- misma escritura va a reemplazar (su vigente deja de estar en la cola).
create or replace function comunidad.retenidos_sin_resolver(p_part uuid, p_excluir bigint)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer
    from comunidad.versiones v
    join comunidad.resenas r on r.version_vigente_id = v.id
   where v.estado in ('retenida', 'revision_solicitada') and r.borrada_en is null
     and (p_part is null or r.autor_participante = p_part)
     and r.id is distinct from p_excluir;
$$;

-- Admisión a la cola de retenidos (§3.3). Con la cola ya bloqueada (nivel 9).
create or replace function comunidad.admision(p_part uuid, p_excluir bigint)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  c comunidad.config;
begin
  select * into c from comunidad.config;
  if comunidad.retenidos_sin_resolver(p_part, p_excluir) >= c.admision_por_autor then return 'admision_autor'; end if;
  if comunidad.retenidos_sin_resolver(null, p_excluir) >= c.admision_global then return 'admision_global'; end if;
  return null;
end;
$$;

-- Las reglas de una decisión, más la de duplicado, en la columna `regla` (≤ 80).
create or replace function comunidad.reglas_texto(p_decision jsonb, p_extra text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(left(array_to_string(
    array(select jsonb_array_elements_text(coalesce(p_decision->'reglas', '[]'::jsonb))) || p_extra, ','), 80), '');
$$;

-- ==================================================================
-- API (sólo service_role).
-- ==================================================================

-- Reseña nueva (fila A). Como 014, más duplicados, admisión y revisión.
-- `p_decision.revision = true` sólo vale con `rechazo_contenido` (§3.3.3):
-- el autor envía el mismo texto a revisión, que se guarda retenido con
-- estado `revision_solicitada`, pasa por la admisión y cuenta para el límite.
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
  v_revision boolean := coalesce(p_decision->>'revision', 'false') = 'true';
  v_guarda boolean;
  v_dup text;
  v_estado text;
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
  if v_revision and v_dec <> 'rechazo_contenido' then
    raise exception 'decision_invalida' using errcode = '22023', detail = 'revisión sin rechazo de contenido';
  end if;
  v_guarda := v_dec in ('publicar', 'retener') or v_revision;
  if v_guarda and not comunidad.huella_valida(p_decision->'huella') then
    raise exception 'decision_invalida' using errcode = '22023', detail = 'falta la huella de duplicados';
  end if;

  v_part := comunidad.proto_cuenta(p_uid, false);
  if v_part is null then return comunidad.rechazo_cuenta('terminos_pendientes'); end if;
  perform 1 from comunidad.proto_participantes(array[v_part]);
  perform 1 from comunidad.proto_suspensiones(array[v_part]);
  perform 1 from comunidad.proto_contadores(v_part, array['resena'], v_dia);

  v_prev := comunidad.intento_previo(v_part, 'publicar', p_id_intento, p_hash);
  if v_prev is not null then return v_prev; end if;
  v_motivo := comunidad.condiciones_a(p_uid, v_part);
  if v_motivo is not null then return comunidad.rechazo_cuenta(v_motivo); end if;
  select id into v_existente from comunidad.resenas
   where autor_participante = v_part and tipo = p_tipo and tmdb_id = p_tmdb_id and borrada_en is null;
  if found then return comunidad.rechazo_cuenta('resena_existente', jsonb_build_object('resena_id', v_existente)); end if;
  if not comunidad.hay_cupo(v_part, 'resena', v_dia) then return comunidad.rechazo_cuenta('limite_diario'); end if;

  if v_guarda then
    perform comunidad.proto_huella(p_decision->'huella'->>'texto');
    v_dup := comunidad.duplicado(v_part, null, p_decision->'huella');
    v_estado := case when v_revision then 'revision_solicitada'
                     when v_dec = 'retener' or v_dup is not null then 'retenida' else 'publicada' end;
    if v_estado <> 'publicada' then
      perform comunidad.proto_cola('retenidos');
      v_motivo := comunidad.admision(v_part, null);
      -- No entra: no se guarda, no consume límite, no queda el intento.
      if v_motivo is not null then return comunidad.rechazo_cuenta(v_motivo); end if;
    end if;
  end if;

  m := comunidad.proto_marca();
  perform comunidad.consumir_cupo(v_part, 'resena', v_dia);

  if not v_guarda then
    v_res := jsonb_build_object('resultado', 'rechazo_contenido');
  else
    insert into comunidad.resenas (autor_participante, tipo, tmdb_id, primera_publicacion_en)
    values (v_part, p_tipo, p_tmdb_id, case when v_estado = 'publicada' then m end)
    returning id into v_resena;
    insert into comunidad.versiones (resena_id, autor_participante, texto, estado, version_reglas, regla, id_intento, creada_en)
    values (v_resena, v_part, p_texto, v_estado, p_decision->>'version_reglas',
            comunidad.reglas_texto(p_decision, v_dup), p_id_intento, m)
    returning id into v_version;
    update comunidad.resenas set version_vigente_id = v_version where id = v_resena;
    insert into comunidad.huellas (version_id, resena_id, autor_participante, hash_texto, shingles, creada_en)
    values (v_version, v_resena, v_part, p_decision->'huella'->>'texto',
            array(select distinct x from jsonb_array_elements_text(p_decision->'huella'->'shingles') x), m);
    v_res := jsonb_build_object('resultado', case v_estado when 'publicada' then 'publicada'
                                  when 'retenida' then 'retenida' else 'revision_solicitada' end,
                                'resena_id', v_resena, 'version_id', v_version);
  end if;
  insert into comunidad.intentos (participante_id, accion, id_intento, hash_peticion, resultado)
  values (v_part, 'publicar', p_id_intento, p_hash, v_res);
  set constraints all immediate;   -- ver 014
  return v_res;
end;
$$;

-- Edición (fila A, §3.4.1). Como 014, más duplicados (contra OTRAS reseñas),
-- admisión (sin contar la vigente que se reemplaza) y revisión: una edición
-- enviada a revisión reemplaza la publicada, que deja de verse (la ruta pide
-- la confirmación antes).
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
  v_revision boolean := coalesce(p_decision->>'revision', 'false') = 'true';
  v_guarda boolean;
  v_dup text;
  v_estado text;
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
  if v_revision and v_dec <> 'rechazo_contenido' then
    raise exception 'decision_invalida' using errcode = '22023', detail = 'revisión sin rechazo de contenido';
  end if;
  v_guarda := v_dec in ('publicar', 'retener') or v_revision;
  if v_guarda and not comunidad.huella_valida(p_decision->'huella') then
    raise exception 'decision_invalida' using errcode = '22023', detail = 'falta la huella de duplicados';
  end if;

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
    return jsonb_build_object('resultado', 'sin_cambios', 'resena_id', r.id, 'version_id', v.id);
  end if;
  if not comunidad.hay_cupo(v_part, 'edicion', v_dia) then return comunidad.rechazo_cuenta('limite_diario'); end if;

  if v_guarda then
    perform comunidad.proto_huella(p_decision->'huella'->>'texto');
    v_dup := comunidad.duplicado(v_part, r.id, p_decision->'huella');
    v_estado := case when v_revision then 'revision_solicitada'
                     when v_dec = 'retener' or v_dup is not null then 'retenida' else 'publicada' end;
    if v_estado <> 'publicada' then
      perform comunidad.proto_cola('retenidos');
      v_motivo := comunidad.admision(v_part, r.id);
      -- No entra: la anterior queda intacta, con sus votos (§3.4.1).
      if v_motivo is not null then return comunidad.rechazo_cuenta(v_motivo); end if;
    end if;
  end if;

  m := comunidad.proto_marca();
  perform comunidad.consumir_cupo(v_part, 'edicion', v_dia);

  if not v_guarda then
    v_res := jsonb_build_object('resultado', 'rechazo_contenido', 'resena_id', r.id, 'version_id', v.id);
  else
    update comunidad.versiones set estado = 'reemplazada', decidida_en = m where id = v.id;
    insert into comunidad.versiones (resena_id, autor_participante, texto, estado, version_reglas, regla, id_intento, creada_en)
    values (r.id, v_part, p_texto, v_estado, p_decision->>'version_reglas',
            comunidad.reglas_texto(p_decision, v_dup), p_id_intento, m)
    returning id into v_nueva;
    update comunidad.resenas
       set version_vigente_id = v_nueva,
           primera_publicacion_en = coalesce(primera_publicacion_en, case when v_estado = 'publicada' then m end)
     where id = r.id;
    update comunidad.evaluaciones set retirada_en = m, actualizada_en = m
     where version_id = v.id and retirada_en is null;
    get diagnostics v_votos = row_count;
    update comunidad.tramos set vigente_hasta = m where version_id = v.id and vigente_hasta is null;
    insert into comunidad.huellas (version_id, resena_id, autor_participante, hash_texto, shingles, creada_en)
    values (v_nueva, r.id, v_part, p_decision->'huella'->>'texto',
            array(select distinct x from jsonb_array_elements_text(p_decision->'huella'->'shingles') x), m);
    v_res := jsonb_build_object('resultado', case v_estado when 'publicada' then 'publicada'
                                  when 'retenida' then 'retenida' else 'revision_solicitada' end,
                                'resena_id', r.id, 'version_id', v_nueva, 'votos_reiniciados', v_votos);
  end if;
  insert into comunidad.intentos (participante_id, accion, id_intento, hash_peticion, resultado)
  values (v_part, 'editar', p_id_intento, p_hash, v_res);
  set constraints all immediate;
  return v_res;
end;
$$;

-- Borrar la propia (fila B). Como 014, y además borra las huellas de la
-- reseña (§3.3.1: los hashes se borran con la reseña).
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
  update comunidad.tramos set vigente_hasta = m where version_id = any(v_versiones) and vigente_hasta is null;
  delete from comunidad.huellas where version_id = any(v_versiones);
  return jsonb_build_object('resultado', 'borrada', 'resena_id', r.id);
end;
$$;

-- Denunciar (fila C): sesión; no la propia; la suspensión, la pausa y los
-- términos NO impiden; el módulo apagado sí (no hay nada visible); exige
-- correo; límite propio por día. Sólo contenido visible: la vigente
-- publicada de una reseña no borrada. Una por denunciante y versión: la
-- segunda devuelve el mismo resultado (`repetido`), sin consumir límite.
-- Hasta `denuncias_filas_por_version` filas por versión; después sólo suma
-- al excedente de la hora (sin fila por denunciante: puede contar dos veces
-- a una cuenta, acotado por su límite diario; sólo ORDENA). Con el ingreso
-- global de la última hora en el tope, no se recibe ("No podemos recibir
-- más denuncias ahora"). Nada de esto oculta la reseña. Devuelve el texto
-- de la versión sólo a la ruta, para la corroboración (la ruta no lo
-- reenvía al cliente).
create or replace function public.comunidad_denunciar(p_uid uuid, p_version bigint, p_categoria text, p_comentario text)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  c comunidad.config;
  v_part uuid;
  v_autor uuid;
  v_resena_id bigint;
  r comunidad.resenas;
  v comunidad.versiones;
  v_dia date := comunidad.dia_ar(clock_timestamp());
  v_hora integer;
  v_filas integer;
  v_grave boolean := p_categoria in ('phishing_estafa', 'sexual_explotacion', 'datos_personales', 'acoso_amenazas');
  m timestamptz;
begin
  if p_categoria is null or p_categoria not in ('phishing_estafa', 'spam', 'acoso_amenazas', 'odio',
                                                'datos_personales', 'sexual_explotacion', 'otro')
     or (p_comentario is not null and (char_length(p_comentario) not between 1 and 300 or p_comentario is not nfc normalized)) then
    raise exception 'denuncia_invalida' using errcode = '22023';
  end if;
  -- Antes de crear la identidad comunitaria: lo que rechaza sin efecto. Se
  -- vuelve a comprobar con todo bloqueado.
  select * into c from comunidad.config;
  if not c.modulo_activo then return comunidad.rechazo_cuenta('modulo_apagado'); end if;
  if not exists (select 1 from auth.users u where u.id = p_uid and u.email_confirmed_at is not null) then
    return comunidad.rechazo_cuenta('correo_pendiente');
  end if;
  -- Autor y reseña de una versión son inmutables (trigger de 011).
  select autor_participante, resena_id into v_autor, v_resena_id from comunidad.versiones where id = p_version;
  if not found then return comunidad.rechazo_cuenta('version_no_disponible'); end if;

  -- C no exige términos: puede crear la identidad (sin texto ni nombre).
  v_part := comunidad.proto_cuenta(p_uid, true);
  perform 1 from comunidad.proto_participantes(array(select distinct x from unnest(array[v_part, v_autor]) x));
  select * into r from comunidad.proto_resena(v_resena_id);
  select * into v from comunidad.proto_versiones(array[p_version]);
  perform 1 from comunidad.proto_contadores(v_part, array['denuncia'], v_dia);

  select * into c from comunidad.config;
  if not c.modulo_activo then return comunidad.rechazo_cuenta('modulo_apagado'); end if;
  if not exists (select 1 from auth.users u where u.id = p_uid and u.email_confirmed_at is not null) then
    return comunidad.rechazo_cuenta('correo_pendiente');
  end if;
  if v_autor = v_part then return comunidad.rechazo_cuenta('propia'); end if;
  if v.estado <> 'publicada' or r.version_vigente_id is distinct from p_version or r.borrada_en is not null then
    return comunidad.rechazo_cuenta('version_no_disponible');
  end if;
  if exists (select 1 from comunidad.denuncias d where d.denunciante_participante = v_part and d.version_id = p_version) then
    return jsonb_build_object('resultado', 'denuncia_registrada', 'repetido', true);
  end if;
  if not comunidad.hay_cupo(v_part, 'denuncia', v_dia) then return comunidad.rechazo_cuenta('limite_diario'); end if;

  perform comunidad.proto_cola('denuncias');
  -- Ingreso de la última hora: filas por ventana móvil; el excedente, por
  -- las dos horas que la ventana toca (cuenta de más, nunca de menos).
  v_hora := (select count(*) from comunidad.denuncias d where d.creada_en > clock_timestamp() - interval '1 hour')
          + (select coalesce(sum(x.cantidad), 0) from comunidad.denuncias_excedentes x
              where x.hora >= date_trunc('hour', clock_timestamp()) - interval '1 hour');
  if v_hora >= c.denuncias_por_hora then return comunidad.rechazo_cuenta('cola_denuncias_llena'); end if;

  m := comunidad.proto_marca();
  perform comunidad.consumir_cupo(v_part, 'denuncia', v_dia);
  select count(*) into v_filas from comunidad.denuncias d where d.version_id = p_version;
  if v_filas < c.denuncias_filas_por_version then
    insert into comunidad.denuncias (version_id, autor_participante, denunciante_participante, categoria, comentario, creada_en)
    values (p_version, v_autor, v_part, p_categoria, p_comentario, m);
    return jsonb_build_object('resultado', 'denuncia_registrada', 'nueva', true, 'texto', v.texto);
  end if;
  insert into comunidad.denuncias_excedentes (version_id, autor_participante, hora, cantidad, graves)
  values (p_version, v_autor, date_trunc('hour', m), 1, v_grave::integer)
  on conflict (version_id, hora) do update
    set cantidad = comunidad.denuncias_excedentes.cantidad + 1,
        graves = comunidad.denuncias_excedentes.graves + excluded.graves;
  return jsonb_build_object('resultado', 'denuncia_registrada', 'nueva', true, 'agrupada', true, 'texto', v.texto);
end;
$$;

-- Corroboración (§3.3.2, punto 1): la ruta volvió a correr las reglas
-- VIGENTES sobre una versión denunciada y ahora la rechazarían o retendrían.
-- La versión pasa a retenida POR LA REGLA (con la versión de reglas de la
-- retención en `corroboraciones`), nunca por la denuncia. Sin admisión: no
-- es un envío del autor. Sólo si sigue siendo la vigente publicada; si no,
-- `sin_efecto` (idempotente). Los tramos de puntos se cierran: lo retenido
-- no suma mientras no se ve (E4 decide al publicar).
create or replace function public.comunidad_retener_por_regla(p_version bigint, p_decision jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_dec text := comunidad.decision_valida(p_decision);
  v_autor uuid;
  v_resena_id bigint;
  v_uid uuid;
  r comunidad.resenas;
  v comunidad.versiones;
  m timestamptz;
begin
  if v_dec = 'publicar' then return jsonb_build_object('resultado', 'sin_efecto'); end if;
  select autor_participante, resena_id into v_autor, v_resena_id from comunidad.versiones where id = p_version;
  if not found then return jsonb_build_object('resultado', 'sin_efecto'); end if;
  select user_id into v_uid from comunidad.participantes where id = v_autor;
  if v_uid is null then return jsonb_build_object('resultado', 'sin_efecto'); end if;   -- autor dado de baja

  -- Paso 1 con la cuenta del AUTOR: serializa con sus propias escrituras.
  perform comunidad.proto_cuenta(v_uid, false);
  perform 1 from comunidad.proto_participantes(array[v_autor]);
  select * into r from comunidad.proto_resena(v_resena_id);
  select * into v from comunidad.proto_versiones(array[p_version]);
  perform 1 from comunidad.proto_votos(
    coalesce((select array_agg(distinct t.evaluador_participante) from comunidad.tramos t
               where t.version_id = p_version and t.vigente_hasta is null), '{}'::uuid[]),
    array[p_version]);
  if v.estado <> 'publicada' or r.version_vigente_id is distinct from p_version or r.borrada_en is not null then
    return jsonb_build_object('resultado', 'sin_efecto');
  end if;
  m := comunidad.proto_marca();
  update comunidad.versiones set estado = 'retenida', decidida_en = m,
         regla = left('corroboracion:' || coalesce(comunidad.reglas_texto(p_decision, null), ''), 80)
   where id = p_version;
  update comunidad.tramos set vigente_hasta = m where version_id = p_version and vigente_hasta is null;
  insert into comunidad.corroboraciones (version_id, autor_participante, version_reglas, reglas, creada_en)
  values (p_version, v_autor, p_decision->>'version_reglas',
          left(coalesce(array_to_string(array(select jsonb_array_elements_text(p_decision->'reglas')), ','), ''), 200), m);
  set constraints all immediate;
  return jsonb_build_object('resultado', 'retenida_por_regla');
end;
$$;

-- Bloquear al autor de una versión (fila D): sesión; no a sí mismo; nada
-- más lo impide (ni suspensión, ni pausa, ni módulo, ni términos, ni
-- correo); tope amplio por día. Idempotente.
create or replace function public.comunidad_bloquear(p_uid uuid, p_version bigint)
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
  v_tipo text;
  v_tmdb integer;
  v_id bigint;
  v_dia date := comunidad.dia_ar(clock_timestamp());
  m timestamptz;
begin
  select autor_participante, resena_id into v_autor, v_resena_id from comunidad.versiones where id = p_version;
  if not found then return comunidad.rechazo_cuenta('version_no_disponible'); end if;
  select tipo, tmdb_id into v_tipo, v_tmdb from comunidad.resenas where id = v_resena_id;   -- inmutables

  v_part := comunidad.proto_cuenta(p_uid, true);
  perform 1 from comunidad.proto_participantes(array(select distinct x from unnest(array[v_part, v_autor]) x));
  perform 1 from comunidad.proto_contadores(v_part, array['bloqueo'], v_dia);

  if v_autor = v_part then return comunidad.rechazo_cuenta('propio'); end if;
  select id into v_id from comunidad.bloqueos where bloqueador_participante = v_part and bloqueado_participante = v_autor;
  if found then return jsonb_build_object('resultado', 'bloqueado', 'bloqueo_id', v_id, 'repetido', true); end if;
  if not comunidad.hay_cupo(v_part, 'bloqueo', v_dia) then return comunidad.rechazo_cuenta('limite_diario'); end if;

  m := comunidad.proto_marca();
  perform comunidad.consumir_cupo(v_part, 'bloqueo', v_dia);
  insert into comunidad.bloqueos (bloqueador_participante, bloqueado_participante, creado_en, origen_tipo, origen_tmdb_id)
  values (v_part, v_autor, m, v_tipo, v_tmdb)
  returning id into v_id;
  return jsonb_build_object('resultado', 'bloqueado', 'bloqueo_id', v_id);
end;
$$;

-- Desbloquear (fila D): sólo un bloqueo propio. Idempotente; no consume límite.
create or replace function public.comunidad_desbloquear(p_uid uuid, p_bloqueo bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_part uuid;
  v_otro uuid;
  n integer;
begin
  v_part := comunidad.proto_cuenta(p_uid, false);
  if v_part is null then return jsonb_build_object('resultado', 'sin_efecto'); end if;
  select bloqueado_participante into v_otro from comunidad.bloqueos where id = p_bloqueo and bloqueador_participante = v_part;
  if not found then return jsonb_build_object('resultado', 'sin_efecto'); end if;
  perform 1 from comunidad.proto_participantes(array(select distinct x from unnest(array[v_part, v_otro]) x));
  perform comunidad.proto_marca();
  delete from comunidad.bloqueos where id = p_bloqueo and bloqueador_participante = v_part;
  get diagnostics n = row_count;
  return jsonb_build_object('resultado', case when n = 1 then 'desbloqueado' else 'sin_efecto' end);
end;
$$;

-- Los bloqueos propios, para la cuenta. Lectura: no exige nada más que la
-- sesión (fila D) y funciona con el módulo apagado (para poder deshacerlos).
create or replace function public.comunidad_bloqueados(p_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'activo', (select modulo_activo from comunidad.config),
    'bloqueados', coalesce((
      select jsonb_agg(jsonb_build_object('bloqueo_id', b.id, 'creado_en', b.creado_en,
               'origen_tipo', b.origen_tipo, 'origen_tmdb_id', b.origen_tmdb_id) order by b.creado_en desc, b.id desc)
        from comunidad.bloqueos b join comunidad.participantes p on p.id = b.bloqueador_participante
       where p.user_id = p_uid), '[]'::jsonb));
$$;

-- LECTURA PROVISIONAL (014), con lo mínimo de E3b: oculta a los autores que
-- quien lee bloqueó y marca las que ya denunció. El resto (suspensiones,
-- orden, paginación) sigue siendo E5a.
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
                          where e.version_id = v.id and e.evaluador_participante = v_part and e.retirada_en is null),
             'denunciada', exists (select 1 from comunidad.denuncias d
                                    where d.version_id = v.id and d.denunciante_participante = v_part)) as x
      from comunidad.resenas r join comunidad.versiones v on v.id = r.version_vigente_id
     where r.tipo = p_tipo and r.tmdb_id = p_tmdb_id and r.borrada_en is null and v.estado = 'publicada'
       and r.autor_participante is distinct from v_part
       and not exists (select 1 from comunidad.bloqueos b
                        where b.bloqueador_participante = v_part and b.bloqueado_participante = r.autor_participante)
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

-- ------------------------------------------------------------------
-- La cola de denuncias por prioridad (§3.3.2). Interna: la expone E4 al
-- admin con MFA. Agrupada por versión, sólo con denuncias abiertas:
--   1. si alguna es de una categoría grave;
--   2. el peso: cada denunciante vale 1/(1 + sus denuncias descartadas), más
--      el excedente (que no tiene denunciante). La cantidad ORDENA;
--   3. la más antigua primero.
-- Ninguna columna de acá cambia el estado de una versión.
-- ------------------------------------------------------------------
create or replace function comunidad.cola_denuncias()
returns table (version_id bigint, grave boolean, peso numeric, denunciantes integer, primera timestamptz)
language sql
stable
set search_path = ''
as $$
  with abiertas as (
    select d.version_id, d.categoria, d.creada_en,
           1.0 / (1 + (select count(*) from comunidad.denuncias x
                        where x.denunciante_participante = d.denunciante_participante and x.estado = 'descartada')) as w
      from comunidad.denuncias d where d.estado = 'abierta'
  ), ex as (
    select x.version_id, sum(x.cantidad) as cantidad, sum(x.graves) as graves
      from comunidad.denuncias_excedentes x group by x.version_id
  )
  select a.version_id,
         bool_or(a.categoria in ('phishing_estafa', 'sexual_explotacion', 'datos_personales', 'acoso_amenazas'))
           or coalesce(max(ex.graves), 0) > 0,
         sum(a.w) + coalesce(max(ex.cantidad), 0),
         count(*)::integer,
         min(a.creada_en)
    from abiertas a left join ex on ex.version_id = a.version_id
   group by a.version_id
   order by 2 desc, 3 desc, 5 asc;
$$;

-- ==================================================================
-- Permisos.
-- ==================================================================
revoke all on function comunidad.shingles_forma(text[])                      from public, anon, authenticated, service_role;
revoke all on function comunidad.proto_huella(text)                          from public, anon, authenticated, service_role;
revoke all on function comunidad.proto_cola(text)                            from public, anon, authenticated, service_role;
revoke all on function comunidad.proto_avanzar(integer, text)                from public, anon, authenticated, service_role;
revoke all on function comunidad.proto_marca()                               from public, anon, authenticated, service_role;
revoke all on function comunidad.hay_cupo(uuid, text, date)                  from public, anon, authenticated, service_role;
revoke all on function comunidad.huella_valida(jsonb)                        from public, anon, authenticated, service_role;
revoke all on function comunidad.duplicado(uuid, bigint, jsonb)              from public, anon, authenticated, service_role;
revoke all on function comunidad.retenidos_sin_resolver(uuid, bigint)        from public, anon, authenticated, service_role;
revoke all on function comunidad.admision(uuid, bigint)                      from public, anon, authenticated, service_role;
revoke all on function comunidad.reglas_texto(jsonb, text)                   from public, anon, authenticated, service_role;
revoke all on function comunidad.cola_denuncias()                            from public, anon, authenticated, service_role;

revoke all on function public.comunidad_publicar(uuid, text, integer, text, jsonb, uuid, text)        from public, anon, authenticated;
revoke all on function public.comunidad_editar(uuid, bigint, bigint, text, jsonb, uuid, text)         from public, anon, authenticated;
revoke all on function public.comunidad_borrar(uuid, bigint)                                          from public, anon, authenticated;
revoke all on function public.comunidad_leer_titulo(uuid, text, integer)                              from public, anon, authenticated;
revoke all on function public.comunidad_denunciar(uuid, bigint, text, text)                           from public, anon, authenticated;
revoke all on function public.comunidad_retener_por_regla(bigint, jsonb)                              from public, anon, authenticated;
revoke all on function public.comunidad_bloquear(uuid, bigint)                                        from public, anon, authenticated;
revoke all on function public.comunidad_desbloquear(uuid, bigint)                                     from public, anon, authenticated;
revoke all on function public.comunidad_bloqueados(uuid)                                              from public, anon, authenticated;
grant execute on function public.comunidad_publicar(uuid, text, integer, text, jsonb, uuid, text)     to service_role;
grant execute on function public.comunidad_editar(uuid, bigint, bigint, text, jsonb, uuid, text)      to service_role;
grant execute on function public.comunidad_borrar(uuid, bigint)                                       to service_role;
grant execute on function public.comunidad_leer_titulo(uuid, text, integer)                           to service_role;
grant execute on function public.comunidad_denunciar(uuid, bigint, text, text)                        to service_role;
grant execute on function public.comunidad_retener_por_regla(bigint, jsonb)                           to service_role;
grant execute on function public.comunidad_bloquear(uuid, bigint)                                     to service_role;
grant execute on function public.comunidad_desbloquear(uuid, bigint)                                  to service_role;
grant execute on function public.comunidad_bloqueados(uuid)                                           to service_role;

commit;
