-- Reseñas de la comunidad, entrega E4: moderación administrativa.
-- Plan: docs/superpowers/plans/2026-10-22-resenas-comunidad.md (E4).
-- Diseño: docs/superpowers/specs/2026-10-21-resenas-comunidad-revision.md
-- (§2.1.2 acciones de moderación, §2.2.3 cancelación de la baja, §2.2.4
-- protocolo, §3.3 colas, §3.3.2 denuncias, §3.3.3 revisión, §3.5 muestreo) y
-- diseño de Codex §3.4–§3.5 (restaurar, suspender, decisiones registradas).
--
-- QUÉ HACE.
--   - `comunidad.decisiones`: el registro de cada decisión administrativa
--     (admin, acción, versión o participante o cuenta, motivo, resultado),
--     sin texto de reseñas. Idempotente por `id_intento`: un reintento
--     devuelve el resultado ya registrado y no agrega otra fila.
--   - Acciones (funciones `public.comunidad_admin_*` y
--     `public.comunidad_quitar_marcador_baja`), EJECUTABLES POR
--     `authenticated` con `is_admin_mfa()` (007) comprobado ADENTRO, igual
--     que el Top: la ruta las llama con la sesión del admin, nunca con
--     `service_role` (que acá no tiene `auth.uid()` y queda denegado):
--       publicar o rechazar un retenido, retirar o restaurar una publicada,
--       descartar o cerrar las denuncias de una versión, suspender y levantar
--       la suspensión de un participante, quitar el marcador de baja (B10,
--       B14) y pausar o reanudar la publicación (T4).
--   - Lecturas del panel, también sólo para admin con MFA: resumen, cola de
--     retenidos, cola de denuncias (sobre `comunidad.cola_denuncias`),
--     cuentas (suspensiones vigentes y bajas pendientes), registro y el
--     muestreo (apagado: `config.muestreo_activo = false`, P6).
--   - Denuncias RECIBIDAS en la baja (pendiente de E2b, ver abajo).
--   - Dos ajustes de invariantes: una versión rechazada puede ser
--     REEMPLAZADA por una edición del autor (antes era final y la reseña
--     quedaba sin poder corregirse), y una suspensión con plazo puede
--     ACORTARSE hacia el futuro (levantarla antes), nunca reescribir el pasado.
--
-- PROTOCOLO (§2.2.4). El paso 1 del admin es `proto_admin`: comprueba
-- `is_admin_mfa()` y toma K_CORTE compartido; con una cuenta objetivo (quitar
-- el marcador) toma además su K_CUENTA. NO toma el K_CUENTA del admin: el
-- admin no actúa como participante. Después, las entidades en el orden
-- global (participantes → reseña → versiones → votos/tramos → suspensiones),
-- relectura, marca y mutación. Una decisión se ata a UNA versión y relee su
-- estado ya bloqueado: si la versión dejó de ser la vigente, la reseña se
-- borró o la cuenta se dio de baja, no cambia nada (conflicto o no
-- disponible). Nunca publica otra versión, nunca resucita una reseña borrada
-- y nunca toca una baja.
--
-- VOTOS Y TRAMOS (diseño §3.4). Retirar (y rechazar) cierra los tramos
-- abiertos de esa versión: lo que no se ve no suma. Publicar un retenido y
-- restaurar una retirada REABREN el tramo sólo de los votos positivos que
-- siguen vigentes y que ya tenían tramo en esa misma versión, con su mes de
-- primera positiva ORIGINAL (no se trasladan de mes ni se reabren meses
-- cerrados). Un retenido que nunca se publicó no tiene votos: no se inventa
-- ninguno. El índice `tramos_uno_abierto` impide duplicarlos.
--
-- SUSPENSIÓN. Es un intervalo [desde, hasta) en `suspensiones`; no cierra
-- tramos: el cómputo al corte (§2.2.2) ya excluye los pares con una
-- suspensión que rige, y levantarla no tiene que reabrir nada.
--
-- 🔴 DENUNCIAS RECIBIDAS EN LA BAJA (pendiente de E2b, auditorías de E3b).
-- Hasta acá, borrar la cuenta borraba sus reseñas y, en cascada, las
-- denuncias que OTROS habían hecho sobre ellas, también las abiertas, sin
-- rastro. Ahora `limpiar_participante`, antes de borrar las reseñas, copia
-- cada denuncia recibida a `comunidad.denuncias_cerradas` con lo MÍNIMO:
-- quién denunció (seudónimo), categoría, estado final (las abiertas quedan
-- `cerrada_por_baja`) y fechas. SIN texto de la reseña, SIN comentario de
-- quien denunció y SIN vínculo con el autor dado de baja. Sirve para que una
-- denuncia no desaparezca en silencio y para que el peso de quien denuncia
-- (sus descartadas) no cambie porque se borró otra cuenta. Se borra con la
-- baja de quien denunció. El TEXTO denunciado se borra con la cuenta, como
-- siempre: conservarlo sería una excepción de preservación que exige una
-- decisión del dueño (P3) y no se toma acá (propuesta en el informe de E4).
-- Plazos: ninguno nuevo; quedan para P3/E8.
--
-- Rollback: 016_comunidad_admin_down.sql.

begin;

-- ------------------------------------------------------------------
-- Configuración: el muestreo (§3.5) nace APAGADO hasta P6.
-- ------------------------------------------------------------------
alter table comunidad.config
  add column if not exists muestreo_activo boolean not null default false;

-- ------------------------------------------------------------------
-- Registro de decisiones. Sin texto de reseñas. `version_id` y
-- `participante_id` SIN FK: el registro sobrevive a la versión (baja,
-- purga) y el participante es un seudónimo (con la baja queda sin vínculo a
-- la cuenta). `cuenta_id` sólo en la cancelación de una baja: cae (set null)
-- con la cuenta.
-- ------------------------------------------------------------------
create table if not exists comunidad.decisiones (
  id               bigint generated always as identity primary key,
  id_intento       uuid not null unique,
  admin_id         uuid references auth.users (id) on delete set null,
  accion           text not null check (accion in (
                     'publicar', 'rechazar', 'retirar', 'restaurar', 'descartar', 'cerrar',
                     'suspender', 'levantar_suspension', 'quitar_marcador_baja',
                     'pausar_publicacion', 'reanudar_publicacion')),
  version_id       bigint,
  participante_id  uuid,
  cuenta_id        uuid references auth.users (id) on delete set null,
  motivo           text not null check (char_length(motivo) between 3 and 300 and motivo is nfc normalized),
  detalle          jsonb not null default '{}'::jsonb,
  creada_en        timestamptz not null
);
create index if not exists decisiones_por_version      on comunidad.decisiones (version_id) where version_id is not null;
create index if not exists decisiones_por_participante on comunidad.decisiones (participante_id) where participante_id is not null;

-- ------------------------------------------------------------------
-- Denuncias recibidas por contenido que se borró con la baja del autor.
-- Mínimo y sin vínculo con el autor (ver arriba). Sin FK al participante a
-- propósito: el INSERT dentro de la baja tomaría KEY SHARE sobre filas de
-- OTROS participantes después de la marca, fuera del orden del protocolo.
-- ------------------------------------------------------------------
create table if not exists comunidad.denuncias_cerradas (
  id                        bigint generated always as identity primary key,
  denunciante_participante  uuid not null,
  categoria                 text not null check (categoria in (
                              'phishing_estafa', 'spam', 'acoso_amenazas', 'odio',
                              'datos_personales', 'sexual_explotacion', 'otro')),
  estado                    text not null check (estado in ('descartada', 'resuelta', 'cerrada_por_baja')),
  creada_en                 timestamptz not null,
  cerrada_en                timestamptz not null
);
create index if not exists denuncias_cerradas_por_denunciante on comunidad.denuncias_cerradas (denunciante_participante);

alter table comunidad.decisiones         enable row level security;
alter table comunidad.denuncias_cerradas enable row level security;
revoke all on comunidad.decisiones, comunidad.denuncias_cerradas from public, anon, authenticated, service_role;
revoke all on all sequences in schema comunidad from public, anon, authenticated, service_role;

-- ==================================================================
-- Invariantes ajustadas.
-- ==================================================================

-- Transiciones (011), con UN cambio: rechazada → reemplazada. Un rechazo del
-- admin no publica nada, pero el autor tiene que poder corregir su reseña
-- ("puede corregir o eliminar", diseño §3.2); antes la edición fallaba con
-- 23514 porque `rechazada` era final. Sigue sin poder volver a publicada.
create or replace function comunidad.versiones_transicion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.estado not in ('publicada', 'retenida', 'revision_solicitada') then
      raise exception 'una versión no nace en estado %', new.estado
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
     or new.resena_id is distinct from old.resena_id
     or new.autor_participante is distinct from old.autor_participante
     or new.texto is distinct from old.texto
     or new.version_reglas is distinct from old.version_reglas
     or new.id_intento is distinct from old.id_intento
     or new.creada_en is distinct from old.creada_en then
    raise exception 'la versión % es inmutable salvo su estado', old.id
      using errcode = '23514';
  end if;

  if new.estado <> old.estado and not (
       (old.estado = 'publicada'           and new.estado in ('retenida', 'oculta', 'reemplazada'))
    or (old.estado = 'retenida'            and new.estado in ('publicada', 'rechazada', 'reemplazada'))
    or (old.estado = 'revision_solicitada' and new.estado in ('publicada', 'rechazada', 'reemplazada'))
    or (old.estado = 'oculta'              and new.estado in ('publicada', 'reemplazada'))
    or (old.estado = 'rechazada'           and new.estado = 'reemplazada')
  ) then
    raise exception 'transición no permitida: % → % (versión %)', old.estado, new.estado, old.id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Suspensiones (011): se cierran una vez; y una con plazo FUTURO puede
-- acortarse (levantarla antes), siempre a un instante ≥ ahora y < su fin.
-- Nunca se reescribe el pasado: el cómputo al corte depende de él.
create or replace function comunidad.suspensiones_integridad()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.participante_id is distinct from old.participante_id
     or new.desde is distinct from old.desde
     or new.creada_en is distinct from old.creada_en then
    raise exception 'una suspensión sólo cambia su fin (suspensión %)', old.id
      using errcode = '23514';
  end if;
  if new.hasta is distinct from old.hasta and not (
       (old.hasta is null and new.hasta is not null)
    or (old.hasta > clock_timestamp() and new.hasta is not null
        and new.hasta >= clock_timestamp() - interval '1 second' and new.hasta < old.hasta)
  ) then
    raise exception 'una suspensión sólo se cierra o se acorta hacia el futuro (suspensión %)', old.id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

-- ==================================================================
-- Baja (012), con las denuncias recibidas (ver el encabezado). Igual que
-- antes salvo dos líneas marcadas con «E4».
-- ==================================================================
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
  v_recibidas   integer;
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
  -- E4 (A2 de la auditoría sobre 9340da9): las denuncias que HIZO y las que
  -- RECIBIÓ, por id, al final de los locks. Sin esto, dos bajas simultáneas
  -- (autor y quien lo denunció) recreaban el historial de quien denunció
  -- después de su baja: la del autor copiaba la denuncia con su foto mientras
  -- la del denunciante la borraba sin confirmar. Con el lock, la baja que
  -- llega segunda espera a la primera y relee: si confirmó la de quien
  -- denunció, la denuncia ya no existe y no se copia; si confirmó la del
  -- autor, la del denunciante borra su historial DESPUÉS de esperar (otra
  -- sentencia, otra foto) y ve la copia recién confirmada. Las dos bajas toman
  -- el mismo conjunto en el mismo orden, y nadie más bloquea estas filas antes
  -- de las de votos y tramos (las decisiones del admin y la denuncia nueva las
  -- tocan después de la marca, con la versión ya bloqueada).
  perform 1 from comunidad.denuncias
   where denunciante_participante = p_part or autor_participante = p_part
   order by id for update;

  v_marca := clock_timestamp();

  update comunidad.tramos set vigente_hasta = v_marca
   where vigente_hasta is null
     and (evaluador_participante = p_part or autor_participante = p_part);
  get diagnostics v_tramos = row_count;

  delete from comunidad.evaluaciones where evaluador_participante = p_part;
  get diagnostics v_votos = row_count;
  delete from comunidad.denuncias where denunciante_participante = p_part;
  get diagnostics v_denuncias = row_count;
  -- E4: el historial mínimo de las denuncias que HIZO también se borra.
  delete from comunidad.denuncias_cerradas where denunciante_participante = p_part;
  -- E4: las denuncias RECIBIDAS se cierran en el historial mínimo (sin
  -- texto, sin comentario, sin el autor) antes de que caigan en cascada.
  insert into comunidad.denuncias_cerradas (denunciante_participante, categoria, estado, creada_en, cerrada_en)
  select d.denunciante_participante, d.categoria,
         case when d.estado = 'abierta' then 'cerrada_por_baja' else d.estado end,
         d.creada_en, coalesce(d.cerrada_en, v_marca)
    from comunidad.denuncias d
   where d.autor_participante = p_part
   order by d.id;
  get diagnostics v_recibidas = row_count;
  -- Las reseñas arrastran en cascada sus versiones y lo que colgaba de ellas.
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
    'denuncias_borradas', v_denuncias, 'denuncias_recibidas_cerradas', v_recibidas,
    'resenas_borradas', v_resenas, 'bloqueos_borrados', v_bloqueos,
    'contadores_borrados', v_contadores);
end;
$$;

-- La cola de denuncias (015) con el historial: las descartadas de quien
-- denuncia cuentan igual aunque el contenido se haya borrado con una baja.
create or replace function comunidad.cola_denuncias()
returns table (version_id bigint, grave boolean, peso numeric, denunciantes integer, primera timestamptz)
language sql
stable
set search_path = ''
as $$
  with abiertas as (
    select d.version_id, d.categoria, d.creada_en,
           1.0 / (1 + (select count(*) from comunidad.denuncias x
                        where x.denunciante_participante = d.denunciante_participante and x.estado = 'descartada')
                    + (select count(*) from comunidad.denuncias_cerradas y
                        where y.denunciante_participante = d.denunciante_participante and y.estado = 'descartada')) as w
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
-- Auxiliares internas del admin.
-- ==================================================================

-- La puerta, en la base. Un JWT sin admin, sin aal2 o sin dos factores, la
-- anon key o service_role (sin `auth.uid()`): 42501, antes de cualquier lock.
create or replace function comunidad.exigir_admin()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_admin_mfa() then
    raise exception 'no_autorizado' using errcode = '42501',
      detail = 'Moderación: hace falta una sesión de administrador con segundo factor.';
  end if;
  return auth.uid();
end;
$$;

-- Paso 1 del admin: K_CORTE compartido y, si hay una cuenta objetivo, su
-- K_CUENTA (serializa con su baja y con sus escrituras). Sin el marcador:
-- quitarlo es justamente lo que hace una de las acciones.
create or replace function comunidad.proto_admin(p_cuenta uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform comunidad.proto_avanzar(1, 'proto_admin');
  perform pg_advisory_xact_lock_shared(7301, 0);
  if p_cuenta is not null then
    perform pg_advisory_xact_lock(7302, hashtext(p_cuenta::text));
  end if;
end;
$$;

-- El motivo: obligatorio, NFC, 3–300, sin controles (lo normaliza la ruta).
create or replace function comunidad.motivo_valido(p text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p is null or char_length(p) not between 3 and 300 or p is not nfc normalized
     or p ~ '[\u0001-\u0009\u000B-\u001F\u007F-\u009F]' then
    raise exception 'motivo_invalido' using errcode = '22023';
  end if;
  return p;
end;
$$;

-- Idempotencia: el mismo intento sobre el mismo objetivo devuelve la
-- respuesta registrada; sobre otro objetivo u otra acción, conflicto.
create or replace function comunidad.decision_previa(p_intento uuid, p_accion text, p_version bigint, p_participante uuid, p_cuenta uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  d comunidad.decisiones;
begin
  if p_intento is null then raise exception 'intento_invalido' using errcode = '22023'; end if;
  select * into d from comunidad.decisiones where id_intento = p_intento;
  if not found then return null; end if;
  if d.accion is distinct from p_accion
     or (p_version is not null and d.version_id is distinct from p_version)
     or (p_participante is not null and d.participante_id is distinct from p_participante)
     or (p_cuenta is not null and d.cuenta_id is distinct from p_cuenta) then
    return jsonb_build_object('resultado', 'conflicto', 'motivo', 'intento');
  end if;
  return (d.detalle->'respuesta') || jsonb_build_object('repetido', true);
end;
$$;

-- Lo mínimo que el panel muestra del autor de un caso (seudónimo).
create or replace function comunidad.antecedentes(p_part uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'participante', p_part,
    'cuenta_eliminada', (select user_id is null from comunidad.participantes where id = p_part),
    'publicadas', (select count(*) from comunidad.versiones v join comunidad.resenas r on r.version_vigente_id = v.id
                    where v.autor_participante = p_part and r.borrada_en is null and v.estado = 'publicada'),
    'retenidas',  (select count(*) from comunidad.versiones v where v.autor_participante = p_part and v.estado in ('retenida', 'revision_solicitada')),
    'rechazadas', (select count(*) from comunidad.versiones v where v.autor_participante = p_part and v.estado = 'rechazada'),
    'retiradas',  (select count(*) from comunidad.versiones v where v.autor_participante = p_part and v.estado = 'oculta'),
    'denuncias_abiertas', (select count(*) from comunidad.denuncias d where d.autor_participante = p_part and d.estado = 'abierta'),
    'suspendida', exists (select 1 from comunidad.suspensiones s where s.participante_id = p_part
                           and s.desde <= clock_timestamp() and (s.hasta is null or s.hasta > clock_timestamp())),
    'suspensiones', (select count(*) from comunidad.suspensiones s where s.participante_id = p_part));
$$;

-- Dónde está una versión respecto de su reseña.
create or replace function comunidad.situacion(v comunidad.versiones, r comunidad.resenas)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when r.borrada_en is not null then 'borrada'
    when r.version_vigente_id is distinct from v.id then 'reemplazada'
    when v.estado = 'publicada' then 'visible'
    else v.estado end;
$$;

-- Reabre los tramos de una versión que vuelve a verse (ver el encabezado).
create or replace function comunidad.reabrir_tramos(p_version bigint, p_autor uuid, m timestamptz)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  n integer;
begin
  insert into comunidad.tramos (evaluador_participante, autor_participante, version_id, mes_primera_positiva, vigente_desde)
  select e.evaluador_participante, p_autor, p_version,
         (select min(t.mes_primera_positiva) from comunidad.tramos t
           where t.evaluador_participante = e.evaluador_participante and t.version_id = p_version),
         m
    from comunidad.evaluaciones e
   where e.version_id = p_version and e.retirada_en is null and e.util
     and exists (select 1 from comunidad.tramos t
                  where t.evaluador_participante = e.evaluador_participante and t.version_id = p_version)
     and not exists (select 1 from comunidad.tramos t
                      where t.evaluador_participante = e.evaluador_participante and t.version_id = p_version
                        and t.vigente_hasta is null)
   order by e.evaluador_participante;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function comunidad.registrar(p_intento uuid, p_accion text, p_version bigint, p_participante uuid,
                                               p_cuenta uuid, p_motivo text, p_respuesta jsonb, p_extra jsonb, m timestamptz)
returns void
language sql
set search_path = ''
as $$
  insert into comunidad.decisiones (id_intento, admin_id, accion, version_id, participante_id, cuenta_id, motivo, detalle, creada_en)
  values (p_intento, auth.uid(), p_accion, p_version, p_participante, p_cuenta, p_motivo,
          jsonb_build_object('respuesta', p_respuesta) || coalesce(p_extra, '{}'::jsonb), m);
$$;

-- ==================================================================
-- API de moderación: `authenticated` + is_admin_mfa() adentro.
-- ==================================================================

-- Decisiones sobre UNA versión:
--   publicar  retenida | revision_solicitada → publicada (vigente, reseña viva)
--   rechazar  retenida | revision_solicitada → rechazada
--   retirar   publicada → oculta
--   restaurar oculta → publicada
--   descartar sus denuncias abiertas → descartada (la denuncia no procedía)
--   cerrar    sus denuncias abiertas → resuelta, sólo si la versión YA no se
--             ve (borrada, reemplazada, retenida, oculta, rechazada)
-- Rechazar y retirar resuelven además las denuncias abiertas de esa versión.
create or replace function public.comunidad_admin_decidir(p_accion text, p_version bigint, p_motivo text, p_id_intento uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_motivo text;
  v_autor uuid;
  v_resena_id bigint;
  v_prev jsonb;
  r comunidad.resenas;
  v comunidad.versiones;
  v_sit text;
  v_abiertas integer;
  v_votos integer;
  m timestamptz;
  v_n integer := 0;
  v_den integer := 0;
  v_res jsonb;
begin
  perform comunidad.exigir_admin();
  if p_accion is null or p_accion not in ('publicar', 'rechazar', 'retirar', 'restaurar', 'descartar', 'cerrar') then
    raise exception 'accion_invalida' using errcode = '22023';
  end if;
  v_motivo := comunidad.motivo_valido(p_motivo);
  if p_id_intento is null or p_version is null then raise exception 'pedido_invalido' using errcode = '22023'; end if;

  perform comunidad.proto_admin(null);
  -- Autor y reseña de una versión son inmutables (011).
  select autor_participante, resena_id into v_autor, v_resena_id from comunidad.versiones where id = p_version;
  if not found then
    v_prev := comunidad.decision_previa(p_id_intento, p_accion, p_version, null, null);
    return coalesce(v_prev, jsonb_build_object('resultado', 'no_disponible', 'situacion', 'eliminada'));
  end if;
  perform 1 from comunidad.proto_participantes(array[v_autor]);
  select * into r from comunidad.proto_resena(v_resena_id);
  select * into v from comunidad.proto_versiones(array[p_version]);
  if p_accion in ('publicar', 'restaurar', 'retirar', 'rechazar') then
    perform 1 from comunidad.proto_votos(
      coalesce((select array_agg(distinct x.ev) from (
                  select e.evaluador_participante as ev from comunidad.evaluaciones e where e.version_id = p_version
                  union select t.evaluador_participante from comunidad.tramos t where t.version_id = p_version) x),
               '{}'::uuid[]),
      array[p_version]);
  end if;

  -- Relectura, con todo bloqueado.
  v_prev := comunidad.decision_previa(p_id_intento, p_accion, p_version, null, null);
  if v_prev is not null then return v_prev; end if;
  if v.id is null or r.id is null then
    return jsonb_build_object('resultado', 'no_disponible', 'situacion', 'eliminada');
  end if;
  v_sit := comunidad.situacion(v, r);
  select count(*) into v_abiertas from comunidad.denuncias d where d.version_id = p_version and d.estado = 'abierta';

  if p_accion in ('publicar', 'rechazar') and not (v_sit in ('retenida', 'revision_solicitada')) then
    return jsonb_build_object('resultado', 'conflicto', 'situacion', v_sit, 'estado', v.estado);
  end if;
  if p_accion = 'retirar' and v_sit <> 'visible' then
    return jsonb_build_object('resultado', 'conflicto', 'situacion', v_sit, 'estado', v.estado);
  end if;
  if p_accion = 'restaurar' and v_sit <> 'oculta' then
    return jsonb_build_object('resultado', 'conflicto', 'situacion', v_sit, 'estado', v.estado);
  end if;
  if p_accion in ('descartar', 'cerrar') and v_abiertas = 0 then
    return jsonb_build_object('resultado', 'sin_efecto', 'situacion', v_sit);
  end if;
  if p_accion = 'cerrar' and v_sit = 'visible' then
    -- Contenido visible: se decide (retirar o descartar), no se archiva.
    return jsonb_build_object('resultado', 'conflicto', 'situacion', v_sit, 'motivo', 'visible');
  end if;

  m := comunidad.proto_marca();
  if p_accion in ('publicar', 'restaurar') then
    update comunidad.versiones set estado = 'publicada', decidida_en = m where id = p_version;
    update comunidad.resenas set primera_publicacion_en = coalesce(primera_publicacion_en, m) where id = r.id;
    v_n := comunidad.reabrir_tramos(p_version, v_autor, m);
  elsif p_accion in ('rechazar', 'retirar') then
    update comunidad.versiones set estado = case p_accion when 'rechazar' then 'rechazada' else 'oculta' end,
           decidida_en = m where id = p_version;
    update comunidad.tramos set vigente_hasta = m where version_id = p_version and vigente_hasta is null;
    get diagnostics v_n = row_count;
  end if;
  if p_accion in ('rechazar', 'retirar', 'cerrar') then
    update comunidad.denuncias set estado = 'resuelta', cerrada_en = m where version_id = p_version and estado = 'abierta';
    get diagnostics v_den = row_count;
  elsif p_accion = 'descartar' then
    update comunidad.denuncias set estado = 'descartada', cerrada_en = m where version_id = p_version and estado = 'abierta';
    get diagnostics v_den = row_count;
  end if;
  select count(*) into v_votos from comunidad.evaluaciones e where e.version_id = p_version and e.retirada_en is null;

  v_res := jsonb_build_object('resultado', 'aplicada', 'accion', p_accion, 'version_id', p_version,
    'estado', (select estado from comunidad.versiones where id = p_version),
    'tramos', v_n, 'denuncias', v_den, 'votos_vigentes', v_votos);
  perform comunidad.registrar(p_id_intento, p_accion, p_version, v_autor, null, v_motivo, v_res,
    jsonb_build_object('estado_previo', v.estado, 'situacion_previa', v_sit,
                       'falso_positivo', p_accion = 'publicar' and v.estado = 'revision_solicitada'), m);
  set constraints all immediate;   -- ver 014: los diferidos corren acá, con el dueño
  return v_res;
end;
$$;

-- Suspender a un participante (impide publicar, editar, evaluar y cambiar el
-- nombre: fila A; no impide B–E). Sin plazo: hasta que se levante.
create or replace function public.comunidad_admin_suspender(p_participante uuid, p_motivo text, p_id_intento uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_motivo text;
  p comunidad.participantes;
  v_prev jsonb;
  m timestamptz;
  v_res jsonb;
begin
  perform comunidad.exigir_admin();
  v_motivo := comunidad.motivo_valido(p_motivo);
  if p_id_intento is null or p_participante is null then raise exception 'pedido_invalido' using errcode = '22023'; end if;
  perform comunidad.proto_admin(null);
  select * into p from comunidad.proto_participantes(array[p_participante]);
  perform 1 from comunidad.proto_suspensiones(array[p_participante]);

  v_prev := comunidad.decision_previa(p_id_intento, 'suspender', null, p_participante, null);
  if v_prev is not null then return v_prev; end if;
  if p.id is null then return jsonb_build_object('resultado', 'no_disponible', 'situacion', 'inexistente'); end if;
  if p.user_id is null then return jsonb_build_object('resultado', 'no_disponible', 'situacion', 'cuenta_eliminada'); end if;
  if exists (select 1 from comunidad.suspensiones s where s.participante_id = p_participante
              and s.desde <= clock_timestamp() and (s.hasta is null or s.hasta > clock_timestamp())) then
    return jsonb_build_object('resultado', 'sin_efecto', 'situacion', 'ya_suspendida');
  end if;

  m := comunidad.proto_marca();
  insert into comunidad.suspensiones (participante_id, desde) values (p_participante, m);
  v_res := jsonb_build_object('resultado', 'aplicada', 'accion', 'suspender', 'participante', p_participante, 'desde', m);
  perform comunidad.registrar(p_id_intento, 'suspender', null, p_participante, null, v_motivo, v_res, '{}'::jsonb, m);
  return v_res;
end;
$$;

-- Levantar la suspensión vigente (la cierra o la acorta a ahora).
create or replace function public.comunidad_admin_levantar_suspension(p_participante uuid, p_motivo text, p_id_intento uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_motivo text;
  p comunidad.participantes;
  v_susp bigint;
  v_prev jsonb;
  m timestamptz;
  v_res jsonb;
begin
  perform comunidad.exigir_admin();
  v_motivo := comunidad.motivo_valido(p_motivo);
  if p_id_intento is null or p_participante is null then raise exception 'pedido_invalido' using errcode = '22023'; end if;
  perform comunidad.proto_admin(null);
  select * into p from comunidad.proto_participantes(array[p_participante]);
  perform 1 from comunidad.proto_suspensiones(array[p_participante]);

  v_prev := comunidad.decision_previa(p_id_intento, 'levantar_suspension', null, p_participante, null);
  if v_prev is not null then return v_prev; end if;
  if p.id is null then return jsonb_build_object('resultado', 'no_disponible', 'situacion', 'inexistente'); end if;
  select s.id into v_susp from comunidad.suspensiones s
   where s.participante_id = p_participante and s.desde <= clock_timestamp()
     and (s.hasta is null or s.hasta > clock_timestamp())
   order by s.id desc limit 1;
  if not found then return jsonb_build_object('resultado', 'sin_efecto', 'situacion', 'sin_suspension'); end if;

  m := comunidad.proto_marca();
  update comunidad.suspensiones set hasta = m where id = v_susp;
  v_res := jsonb_build_object('resultado', 'aplicada', 'accion', 'levantar_suspension', 'participante', p_participante, 'hasta', m);
  perform comunidad.registrar(p_id_intento, 'levantar_suspension', null, p_participante, null, v_motivo, v_res, '{}'::jsonb, m);
  return v_res;
end;
$$;

-- Quitar el marcador de baja (§2.2.3, B10 y B14): la cuenta vuelve a poder
-- participar, pero NADA se restaura: lo borrado en el paso 1 no vuelve y el
-- participante viejo no se revincula; la próxima identidad nace nueva. Si la
-- copia de la sanción sigue vigente, nace suspendida hasta ahí
-- (resolver_participante, 012/013). El marcador no se borra: se marca
-- cancelado (la copia de la sanción sobrevive).
create or replace function public.comunidad_quitar_marcador_baja(p_user uuid, p_motivo text, p_id_intento uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_motivo text;
  b comunidad.bajas_en_curso;
  v_prev jsonb;
  m timestamptz;
  v_res jsonb;
begin
  perform comunidad.exigir_admin();
  v_motivo := comunidad.motivo_valido(p_motivo);
  if p_id_intento is null or p_user is null then raise exception 'pedido_invalido' using errcode = '22023'; end if;
  -- K_CORTE → K_CUENTA de la cuenta: serializa con su baja y sus escrituras.
  perform comunidad.proto_admin(p_user);
  select * into b from comunidad.bajas_en_curso where user_id = p_user for update;

  v_prev := comunidad.decision_previa(p_id_intento, 'quitar_marcador_baja', null, null, p_user);
  if v_prev is not null then return v_prev; end if;
  if b.user_id is null then return jsonb_build_object('resultado', 'sin_efecto', 'situacion', 'sin_marcador'); end if;
  if b.cancelada_en is not null then return jsonb_build_object('resultado', 'sin_efecto', 'situacion', 'ya_cancelado'); end if;

  m := comunidad.proto_marca();
  update comunidad.bajas_en_curso set cancelada_en = m where user_id = p_user;
  v_res := jsonb_build_object('resultado', 'aplicada', 'accion', 'quitar_marcador_baja', 'cuenta', p_user,
                              'sancion_hasta', b.sancion_hasta);
  perform comunidad.registrar(p_id_intento, 'quitar_marcador_baja', null, null, p_user, v_motivo, v_res,
                              jsonb_build_object('iniciada_en', b.iniciada_en, 'origen', b.origen), m);
  return v_res;
end;
$$;

-- Pausar o reanudar la publicación (T4, sólo manual). No toca el módulo: con
-- la publicación pausada se sigue leyendo, borrando, denunciando y bloqueando.
-- Una escritura que ya leyó la configuración antes de esta confirmación puede
-- terminar con el valor anterior (no la bloquea).
create or replace function public.comunidad_admin_publicacion(p_activa boolean, p_motivo text, p_id_intento uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_motivo text;
  c comunidad.config;
  v_accion text;
  v_prev jsonb;
  m timestamptz;
  v_res jsonb;
begin
  perform comunidad.exigir_admin();
  v_motivo := comunidad.motivo_valido(p_motivo);
  if p_id_intento is null or p_activa is null then raise exception 'pedido_invalido' using errcode = '22023'; end if;
  v_accion := case when p_activa then 'reanudar_publicacion' else 'pausar_publicacion' end;
  perform comunidad.proto_admin(null);
  select * into c from comunidad.config for update;

  v_prev := comunidad.decision_previa(p_id_intento, v_accion, null, null, null);
  if v_prev is not null then return v_prev; end if;
  if c.publicacion_activa = p_activa then
    return jsonb_build_object('resultado', 'sin_efecto', 'publicacion_activa', c.publicacion_activa);
  end if;
  m := comunidad.proto_marca();
  -- Con WHERE: las sesiones de PostgREST cargan `safeupdate`, que rechaza un
  -- UPDATE sin condición (21000), aunque la tabla tenga una sola fila.
  update comunidad.config set publicacion_activa = p_activa, actualizada_en = m where id;
  v_res := jsonb_build_object('resultado', 'aplicada', 'accion', v_accion, 'publicacion_activa', p_activa);
  perform comunidad.registrar(p_id_intento, v_accion, null, null, null, v_motivo, v_res, '{}'::jsonb, m);
  return v_res;
end;
$$;

-- ------------------------------------------------------------------
-- Lecturas del panel. Sin locks.
-- ------------------------------------------------------------------
create or replace function public.comunidad_admin_resumen()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c comunidad.config;
  v_ret integer;
begin
  perform comunidad.exigir_admin();
  select * into c from comunidad.config;
  v_ret := comunidad.retenidos_sin_resolver(null, null);
  return jsonb_build_object(
    'modulo_activo', c.modulo_activo,
    'publicacion_activa', c.publicacion_activa,
    'muestreo_activo', c.muestreo_activo,
    'retenidos', v_ret,
    'admision_global', c.admision_global,
    'admision_cerrada', v_ret >= c.admision_global,
    'denuncias_casos', (select count(*) from comunidad.cola_denuncias()),
    'denuncias_graves', (select count(*) from comunidad.cola_denuncias() q where q.grave),
    'bajas_pendientes', (select count(*) from comunidad.bajas_en_curso where cancelada_en is null),
    'suspensiones_vigentes', (select count(*) from comunidad.suspensiones s
                               where s.desde <= clock_timestamp() and (s.hasta is null or s.hasta > clock_timestamp())));
end;
$$;

-- Cola de retenidos por prioridad: 0 retenida por corroboración (estaba
-- visible y la denunciaron), 1 revisión pedida, 2 retenida al enviar; dentro,
-- la más antigua primero. Cursor por clave: {p, t, v}.
create or replace function public.comunidad_admin_retenidos(p_limite integer, p_despues jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lim integer := least(greatest(coalesce(p_limite, 20), 1), 50);
  v_items jsonb;
  v_n integer;
begin
  perform comunidad.exigir_admin();
  with cola as (
    select v.*, r.tipo, r.tmdb_id, c.version_reglas as corr_version, c.reglas as corr_reglas,
           case when c.version_id is not null then 0 when v.estado = 'revision_solicitada' then 1 else 2 end as prioridad,
           coalesce(c.creada_en, v.creada_en) as desde
      from comunidad.versiones v
      join comunidad.resenas r on r.version_vigente_id = v.id and r.borrada_en is null
      left join comunidad.corroboraciones c on c.version_id = v.id
     where v.estado in ('retenida', 'revision_solicitada')
  ), pagina as (
    select * from cola
     where p_despues is null
        or (prioridad, desde, id) > ((p_despues->>'p')::integer, (p_despues->>'t')::timestamptz, (p_despues->>'v')::bigint)
     order by prioridad, desde, id
     limit v_lim + 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'version_id', x.id, 'resena_id', x.resena_id, 'tipo', x.tipo, 'tmdb_id', x.tmdb_id,
           'texto', x.texto, 'estado', x.estado, 'regla', x.regla, 'version_reglas', x.version_reglas,
           'prioridad', x.prioridad, 'en_cola_desde', x.desde, 'creada_en', x.creada_en,
           'corroboracion', case when x.corr_version is null then null
                                 else jsonb_build_object('version_reglas', x.corr_version, 'reglas', x.corr_reglas) end,
           'es_edicion', exists (select 1 from comunidad.versiones o where o.resena_id = x.resena_id and o.id <> x.id),
           'votos_vigentes', (select count(*) from comunidad.evaluaciones e where e.version_id = x.id and e.retirada_en is null),
           'denuncias_abiertas', (select count(*) from comunidad.denuncias d where d.version_id = x.id and d.estado = 'abierta'),
           'autor', comunidad.antecedentes(x.autor_participante),
           'cursor', jsonb_build_object('p', x.prioridad, 't', x.desde, 'v', x.id))
         order by x.prioridad, x.desde, x.id), '[]'::jsonb),
         count(*)
    into v_items, v_n
    from pagina x;
  return jsonb_build_object(
    'items', case when v_n > v_lim then v_items - v_lim else v_items end,
    'hay_mas', v_n > v_lim,
    'total', comunidad.retenidos_sin_resolver(null, null));
end;
$$;

-- Cola de denuncias: casos agrupados por versión, en el orden de
-- `cola_denuncias` (grave, peso, más antigua). Cursor {g, w, t, v}. Muestra la
-- situación ACTUAL de la versión: un caso puede seguir abierto aunque el
-- autor la haya borrado o editado (se cierra con «cerrar»).
create or replace function public.comunidad_admin_denuncias(p_limite integer, p_despues jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lim integer := least(greatest(coalesce(p_limite, 20), 1), 50);
  v_items jsonb;
  v_n integer;
begin
  perform comunidad.exigir_admin();
  with q as (select * from comunidad.cola_denuncias()),
  pagina as (
    select q.* from q
     where p_despues is null
        or q.grave < (p_despues->>'g')::boolean
        or (q.grave = (p_despues->>'g')::boolean and q.peso < (p_despues->>'w')::numeric)
        or (q.grave = (p_despues->>'g')::boolean and q.peso = (p_despues->>'w')::numeric
            and (q.primera, q.version_id) > ((p_despues->>'t')::timestamptz, (p_despues->>'v')::bigint))
     order by q.grave desc, q.peso desc, q.primera asc, q.version_id asc
     limit v_lim + 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'version_id', p.version_id, 'grave', p.grave, 'peso', round(p.peso, 2), 'denunciantes', p.denunciantes,
           'primera', p.primera, 'resena_id', v.resena_id, 'tipo', r.tipo, 'tmdb_id', r.tmdb_id,
           'texto', v.texto, 'estado', v.estado, 'situacion', comunidad.situacion(v, r),
           'categorias', (select jsonb_object_agg(k.categoria, k.n) from (
                            select d.categoria, count(*) as n from comunidad.denuncias d
                             where d.version_id = p.version_id and d.estado = 'abierta' group by d.categoria) k),
           'comentarios', (select coalesce(jsonb_agg(jsonb_build_object('categoria', d.categoria, 'comentario', d.comentario,
                                                                       'creada_en', d.creada_en) order by d.creada_en), '[]'::jsonb)
                             from comunidad.denuncias d
                            where d.version_id = p.version_id and d.estado = 'abierta' and d.comentario is not null),
           'excedente', (select coalesce(sum(x.cantidad), 0) from comunidad.denuncias_excedentes x where x.version_id = p.version_id),
           'votos_vigentes', (select count(*) from comunidad.evaluaciones e where e.version_id = p.version_id and e.retirada_en is null),
           'autor', comunidad.antecedentes(v.autor_participante),
           'cursor', jsonb_build_object('g', p.grave, 'w', p.peso, 't', p.primera, 'v', p.version_id))
         order by p.grave desc, p.peso desc, p.primera asc, p.version_id asc), '[]'::jsonb),
         count(*)
    into v_items, v_n
    from pagina p
    join comunidad.versiones v on v.id = p.version_id
    join comunidad.resenas r on r.id = v.resena_id;
  return jsonb_build_object(
    'items', case when v_n > v_lim then v_items - v_lim else v_items end,
    'hay_mas', v_n > v_lim,
    'total', (select count(*) from comunidad.cola_denuncias()));
end;
$$;

-- Cuentas: suspensiones vigentes (con el motivo de la decisión) y bajas
-- pendientes (marcador activo; con Auth borrado el marcador ya no existe).
create or replace function public.comunidad_admin_cuentas()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform comunidad.exigir_admin();
  return jsonb_build_object(
    'suspensiones', coalesce((
      select jsonb_agg(jsonb_build_object(
               'participante', s.participante_id, 'desde', s.desde, 'hasta', s.hasta,
               'cuenta_eliminada', p.user_id is null,
               'motivo', (select d.motivo from comunidad.decisiones d
                           where d.participante_id = s.participante_id and d.accion = 'suspender'
                           order by d.id desc limit 1))
             order by s.desde desc)
        from comunidad.suspensiones s join comunidad.participantes p on p.id = s.participante_id
       where s.desde <= clock_timestamp() and (s.hasta is null or s.hasta > clock_timestamp())), '[]'::jsonb),
    'bajas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'cuenta', b.user_id, 'iniciada_en', b.iniciada_en, 'intentos', b.intentos,
               'ultimo_error', b.ultimo_error, 'origen', b.origen, 'sancion_hasta', b.sancion_hasta)
             order by b.iniciada_en)
        from comunidad.bajas_en_curso b where b.cancelada_en is null), '[]'::jsonb));
end;
$$;

-- El registro, del más nuevo al más viejo. Cursor: el id anterior.
create or replace function public.comunidad_admin_registro(p_limite integer, p_antes bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lim integer := least(greatest(coalesce(p_limite, 30), 1), 100);
  v_items jsonb;
  v_n integer;
begin
  perform comunidad.exigir_admin();
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id, 'accion', d.accion, 'version_id', d.version_id, 'participante', d.participante_id,
           'cuenta', d.cuenta_id, 'motivo', d.motivo, 'admin_propio', d.admin_id = auth.uid(),
           'resultado', d.detalle->'respuesta', 'estado_previo', d.detalle->>'estado_previo',
           'falso_positivo', coalesce((d.detalle->>'falso_positivo')::boolean, false), 'creada_en', d.creada_en)
         order by d.id desc), '[]'::jsonb),
         count(*)
    into v_items, v_n
    from (select * from comunidad.decisiones
           where p_antes is null or id < p_antes
           order by id desc limit v_lim + 1) d;
  return jsonb_build_object(
    'items', case when v_n > v_lim then v_items - v_lim else v_items end,
    'hay_mas', v_n > v_lim);
end;
$$;

-- A1 (auditoría de E4 sobre 9340da9): restaurar desde el panel. Retirar
-- resuelve las denuncias y la versión sale de las dos colas; sin esto el
-- admin no podía volver a encontrarla. Dos lecturas, sólo para admin con MFA:
-- la lista de retiradas y la situación ACTUAL de una versión (la abre el
-- Registro). Ninguna decide nada: restaurar sigue siendo
-- `comunidad_admin_decidir('restaurar', …)`, que relee con todo bloqueado y
-- rechaza una versión reemplazada, borrada o de una cuenta dada de baja.

-- Los votos que volverían a contar al restaurar o publicar: exactamente los
-- que `reabrir_tramos` reabriría (positivos, vigentes, con tramo en esta
-- versión y ninguno abierto). Es el número del aviso previo.
create or replace function comunidad.votos_recuperables(p_version bigint)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer
    from comunidad.evaluaciones e
   where e.version_id = p_version and e.retirada_en is null and e.util
     and exists (select 1 from comunidad.tramos t
                  where t.evaluador_participante = e.evaluador_participante and t.version_id = p_version)
     and not exists (select 1 from comunidad.tramos t
                      where t.evaluador_participante = e.evaluador_participante and t.version_id = p_version
                        and t.vigente_hasta is null);
$$;

-- Lo que el panel muestra de una versión, en su situación actual. Sin texto
-- si la reseña está borrada (el autor la borró: no se vuelve a mostrar).
create or replace function comunidad.ficha_version(v comunidad.versiones, r comunidad.resenas)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'version_id', v.id, 'resena_id', v.resena_id, 'tipo', r.tipo, 'tmdb_id', r.tmdb_id,
    'texto', case when r.borrada_en is null then v.texto end,
    'estado', v.estado, 'situacion', comunidad.situacion(v, r), 'decidida_en', v.decidida_en,
    'retiro', (select jsonb_build_object('motivo', d.motivo, 'creada_en', d.creada_en, 'admin_propio', d.admin_id = auth.uid())
                 from comunidad.decisiones d where d.version_id = v.id and d.accion = 'retirar'
                order by d.id desc limit 1),
    'votos_vigentes', (select count(*) from comunidad.evaluaciones e where e.version_id = v.id and e.retirada_en is null),
    'votos_recuperables', comunidad.votos_recuperables(v.id),
    'denuncias_abiertas', (select count(*) from comunidad.denuncias d where d.version_id = v.id and d.estado = 'abierta'),
    'autor', comunidad.antecedentes(v.autor_participante));
$$;

-- Retiradas que se pueden restaurar: vigentes, reseña viva, de la más
-- reciente a la más vieja. Cursor por clave {t, v}.
create or replace function public.comunidad_admin_retiradas(p_limite integer, p_despues jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lim integer := least(greatest(coalesce(p_limite, 20), 1), 50);
  v_items jsonb;
  v_n integer;
begin
  perform comunidad.exigir_admin();
  with pagina as (
    select v, r
      from comunidad.versiones v
      join comunidad.resenas r on r.version_vigente_id = v.id and r.borrada_en is null
     where v.estado = 'oculta'
       and (p_despues is null
            or (v.decidida_en, v.id) < ((p_despues->>'t')::timestamptz, (p_despues->>'v')::bigint))
     order by v.decidida_en desc, v.id desc
     limit v_lim + 1
  )
  select coalesce(jsonb_agg(comunidad.ficha_version(x.v, x.r)
                            || jsonb_build_object('cursor', jsonb_build_object('t', (x.v).decidida_en, 'v', (x.v).id))
                            order by (x.v).decidida_en desc, (x.v).id desc), '[]'::jsonb),
         count(*)
    into v_items, v_n
    from pagina x;
  return jsonb_build_object(
    'items', case when v_n > v_lim then v_items - v_lim else v_items end,
    'hay_mas', v_n > v_lim,
    'total', (select count(*) from comunidad.versiones v
                join comunidad.resenas r on r.version_vigente_id = v.id and r.borrada_en is null
               where v.estado = 'oculta'));
end;
$$;

-- La situación ACTUAL de una versión (desde el Registro). Una versión que ya
-- no existe (baja de la cuenta) es `eliminada`, sin más datos.
create or replace function public.comunidad_admin_version(p_version bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v comunidad.versiones;
  r comunidad.resenas;
begin
  perform comunidad.exigir_admin();
  if p_version is null then raise exception 'pedido_invalido' using errcode = '22023'; end if;
  select * into v from comunidad.versiones where id = p_version;
  if not found then return jsonb_build_object('version_id', p_version, 'situacion', 'eliminada'); end if;
  select * into r from comunidad.resenas where id = v.resena_id;
  return comunidad.ficha_version(v, r);
end;
$$;

-- Muestreo (§3.5): APAGADO hasta P6. Encendido, hasta 5 publicaciones al
-- azar (vigentes, reseña viva). No certifica eficacia.
create or replace function public.comunidad_admin_muestreo()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform comunidad.exigir_admin();
  if not (select muestreo_activo from comunidad.config) then
    return jsonb_build_object('activo', false, 'items', '[]'::jsonb);
  end if;
  return jsonb_build_object('activo', true, 'items', coalesce((
    select jsonb_agg(jsonb_build_object('version_id', x.id, 'resena_id', x.resena_id, 'tipo', x.tipo,
                                        'tmdb_id', x.tmdb_id, 'texto', x.texto, 'creada_en', x.creada_en,
                                        'autor', comunidad.antecedentes(x.autor_participante)))
      from (select v.*, r.tipo, r.tmdb_id from comunidad.versiones v
              join comunidad.resenas r on r.version_vigente_id = v.id and r.borrada_en is null
             where v.estado = 'publicada' order by random() limit 5) x), '[]'::jsonb));
end;
$$;

-- ==================================================================
-- Permisos. Internas para nadie; las del admin, SÓLO `authenticated` (la
-- comprobación de admin + MFA es la primera línea de cada una).
-- ==================================================================
revoke all on function comunidad.versiones_transicion()                         from public, anon, authenticated, service_role;
revoke all on function comunidad.suspensiones_integridad()                      from public, anon, authenticated, service_role;
revoke all on function comunidad.limpiar_participante(uuid)                     from public, anon, authenticated, service_role;
revoke all on function comunidad.cola_denuncias()                               from public, anon, authenticated, service_role;
revoke all on function comunidad.exigir_admin()                                 from public, anon, authenticated, service_role;
revoke all on function comunidad.proto_admin(uuid)                              from public, anon, authenticated, service_role;
revoke all on function comunidad.motivo_valido(text)                            from public, anon, authenticated, service_role;
revoke all on function comunidad.decision_previa(uuid, text, bigint, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function comunidad.antecedentes(uuid)                             from public, anon, authenticated, service_role;
revoke all on function comunidad.situacion(comunidad.versiones, comunidad.resenas) from public, anon, authenticated, service_role;
revoke all on function comunidad.reabrir_tramos(bigint, uuid, timestamptz)      from public, anon, authenticated, service_role;
revoke all on function comunidad.registrar(uuid, text, bigint, uuid, uuid, text, jsonb, jsonb, timestamptz) from public, anon, authenticated, service_role;
revoke all on function comunidad.votos_recuperables(bigint)                    from public, anon, authenticated, service_role;
revoke all on function comunidad.ficha_version(comunidad.versiones, comunidad.resenas) from public, anon, authenticated, service_role;

revoke all on function public.comunidad_admin_decidir(text, bigint, text, uuid)          from public, anon, authenticated, service_role;
revoke all on function public.comunidad_admin_suspender(uuid, text, uuid)                from public, anon, authenticated, service_role;
revoke all on function public.comunidad_admin_levantar_suspension(uuid, text, uuid)      from public, anon, authenticated, service_role;
revoke all on function public.comunidad_quitar_marcador_baja(uuid, text, uuid)           from public, anon, authenticated, service_role;
revoke all on function public.comunidad_admin_publicacion(boolean, text, uuid)           from public, anon, authenticated, service_role;
revoke all on function public.comunidad_admin_resumen()                                  from public, anon, authenticated, service_role;
revoke all on function public.comunidad_admin_retenidos(integer, jsonb)                  from public, anon, authenticated, service_role;
revoke all on function public.comunidad_admin_denuncias(integer, jsonb)                  from public, anon, authenticated, service_role;
revoke all on function public.comunidad_admin_cuentas()                                  from public, anon, authenticated, service_role;
revoke all on function public.comunidad_admin_registro(integer, bigint)                  from public, anon, authenticated, service_role;
revoke all on function public.comunidad_admin_muestreo()                                 from public, anon, authenticated, service_role;
revoke all on function public.comunidad_admin_retiradas(integer, jsonb)                 from public, anon, authenticated, service_role;
revoke all on function public.comunidad_admin_version(bigint)                            from public, anon, authenticated, service_role;
grant execute on function public.comunidad_admin_decidir(text, bigint, text, uuid)       to authenticated;
grant execute on function public.comunidad_admin_suspender(uuid, text, uuid)             to authenticated;
grant execute on function public.comunidad_admin_levantar_suspension(uuid, text, uuid)   to authenticated;
grant execute on function public.comunidad_quitar_marcador_baja(uuid, text, uuid)        to authenticated;
grant execute on function public.comunidad_admin_publicacion(boolean, text, uuid)        to authenticated;
grant execute on function public.comunidad_admin_resumen()                               to authenticated;
grant execute on function public.comunidad_admin_retenidos(integer, jsonb)               to authenticated;
grant execute on function public.comunidad_admin_denuncias(integer, jsonb)               to authenticated;
grant execute on function public.comunidad_admin_cuentas()                               to authenticated;
grant execute on function public.comunidad_admin_registro(integer, bigint)               to authenticated;
grant execute on function public.comunidad_admin_muestreo()                              to authenticated;
grant execute on function public.comunidad_admin_retiradas(integer, jsonb)              to authenticated;
grant execute on function public.comunidad_admin_version(bigint)                         to authenticated;

commit;
