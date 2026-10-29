-- Rollback de 016_comunidad_admin.sql (E4). Vuelve a 015 tal cual:
--   - borra las funciones del admin y las auxiliares nuevas;
--   - restaura, con copias LITERALES, las definiciones anteriores de
--     versiones_transicion y suspensiones_integridad (011),
--     limpiar_participante (012) y cola_denuncias (015);
--   - borra el registro de decisiones, el historial mínimo de denuncias y la
--     columna muestreo_activo.
-- ⚠️ Borra el registro de decisiones y `denuncias_cerradas`: correr sólo en
-- local o antes de activar el módulo.
-- Generado por el script de E4 a partir de 011, 012 y 015 (no a mano).

begin;

drop function if exists public.comunidad_admin_decidir(text, bigint, text, uuid);
drop function if exists public.comunidad_admin_suspender(uuid, text, uuid);
drop function if exists public.comunidad_admin_levantar_suspension(uuid, text, uuid);
drop function if exists public.comunidad_quitar_marcador_baja(uuid, text, uuid);
drop function if exists public.comunidad_admin_publicacion(boolean, text, uuid);
drop function if exists public.comunidad_admin_resumen();
drop function if exists public.comunidad_admin_retenidos(integer, jsonb);
drop function if exists public.comunidad_admin_denuncias(integer, jsonb);
drop function if exists public.comunidad_admin_cuentas();
drop function if exists public.comunidad_admin_registro(integer, bigint);
drop function if exists public.comunidad_admin_muestreo();
drop function if exists public.comunidad_admin_retiradas(integer, jsonb);
drop function if exists public.comunidad_admin_version(bigint);
drop function if exists comunidad.exigir_admin();
drop function if exists comunidad.proto_admin(uuid);
drop function if exists comunidad.motivo_valido(text);
drop function if exists comunidad.decision_previa(uuid, text, bigint, uuid, uuid);
drop function if exists comunidad.antecedentes(uuid);
drop function if exists comunidad.situacion(comunidad.versiones, comunidad.resenas);
drop function if exists comunidad.reabrir_tramos(bigint, uuid, timestamptz);
drop function if exists comunidad.ficha_version(comunidad.versiones, comunidad.resenas);
drop function if exists comunidad.votos_recuperables(bigint);
drop function if exists comunidad.registrar(uuid, text, bigint, uuid, uuid, text, jsonb, jsonb, timestamptz);

-- 011
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
  ) then
    raise exception 'transición no permitida: % → % (versión %)', old.estado, new.estado, old.id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function comunidad.suspensiones_integridad()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.participante_id is distinct from old.participante_id
     or new.desde is distinct from old.desde
     or new.creada_en is distinct from old.creada_en
     or old.hasta is not null then
    raise exception 'una suspensión sólo se cierra, y una sola vez (suspensión %)', old.id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

-- 012
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

-- 015
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

drop table if exists comunidad.decisiones;
drop table if exists comunidad.denuncias_cerradas;
alter table comunidad.config drop column if exists muestreo_activo;

revoke all on function comunidad.versiones_transicion()    from public, anon, authenticated, service_role;
revoke all on function comunidad.suspensiones_integridad() from public, anon, authenticated, service_role;
revoke all on function comunidad.limpiar_participante(uuid) from public, anon, authenticated, service_role;
revoke all on function comunidad.cola_denuncias()          from public, anon, authenticated, service_role;

commit;
