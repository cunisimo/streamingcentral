-- Rollback de 021 (E8): quita la purga y su configuración, y devuelve la
-- ventana del Top Yumpers a la de 020.
--
-- 🔴 LO PURGADO NO VUELVE. Este rollback quita funciones, el procedimiento,
-- la configuración y el registro de ejecuciones; las filas que una purga ya
-- borró (textos, denuncias, decisiones, tramos, rankings, participantes) no
-- se recuperan con esto ni con ninguna otra cosa. Antes de bajar con datos
-- reales: desprogramar los jobs (supabase/cron-comunidad.sql, sección
-- "Desprogramar"), si se programaron.
--
-- consolidar_mes y comunidad_top_yumpers vuelven EXACTAMENTE a 020 (sin la
-- comprobación de la conservación). Ojo: con meses ya purgados, la lectura de
-- 020 los reconstruiría vacíos; por eso se baja antes de activar la purga.
begin;

drop procedure if exists comunidad.purgar(text, timestamptz);
drop function if exists comunidad.purga_lote(text, timestamptz, integer);
drop function if exists comunidad.purga_tomar(bigint, bigint[]);
drop function if exists comunidad.resena_purgable(bigint, timestamptz);
drop function if exists comunidad.version_protegida(bigint, timestamptz);
drop function if exists comunidad.par_con_memoria(uuid, bigint);

-- 020, sin cambios.
create or replace function comunidad.consolidar_mes(p_mes date)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_mes date := date_trunc('month', p_mes)::date;
  v_corte timestamptz := comunidad.corte_de_mes(v_mes);
begin
  if clock_timestamp() < v_corte then
    raise exception 'mes_abierto' using errcode = '22023', detail = 'El mes todavía no cerró.';
  end if;
  -- 1. Comprobación rápida, sin lock: un mes consolidado no toma el exclusivo.
  if exists (select 1 from comunidad.top_meses where mes = v_mes) then return false; end if;
  -- 2. El exclusivo (READ COMMITTED, ningún otro lock: lo hace cumplir 013).
  perform comunidad.proto_corte_exclusivo();
  -- 3. Nueva comprobación: otro pudo consolidar mientras esperábamos.
  if exists (select 1 from comunidad.top_meses where mes = v_mes) then return false; end if;
  -- 4. UNA sentencia, con instantánea posterior al lock: mes y resultados juntos.
  with puntos as (
    select x.autor, x.puntos from comunidad.puntos_al_corte(v_mes, v_corte) x
  ), mes as (
    insert into comunidad.top_meses (mes, corte, consolidado_en, autores)
    select v_mes, v_corte, clock_timestamp(), count(*) from puntos
    returning mes
  )
  insert into comunidad.top_resultados (mes, posicion, puntos, participante_id)
  select (select m.mes from mes m),
         dense_rank() over (order by p.puntos desc)::integer,
         p.puntos,
         case when pa.user_id is null then null else pa.id end
    from puntos p
    join comunidad.participantes pa on pa.id = p.autor
   order by p.puntos desc, p.autor;
  return true;
end;
$$;

create or replace function public.comunidad_top_yumpers(p_mes date)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set lock_timeout = '10s'
as $$
declare
  v_uid uuid := auth.uid();
  c comunidad.config;
  v_lector uuid;
  v_ultimo date := (comunidad.mes_ar(clock_timestamp()) - interval '1 month')::date;
  v_mes date := coalesce(date_trunc('month', p_mes)::date, (comunidad.mes_ar(clock_timestamp()) - interval '1 month')::date);
  m comunidad.top_meses;
  v_items jsonb;
  v_mia jsonb;
begin
  if v_uid is null then
    raise exception 'sin_sesion' using errcode = '42501', detail = 'El Top Yumpers exige sesión.';
  end if;
  if v_mes > v_ultimo or v_mes < date '2026-01-01' then
    raise exception 'mes_invalido' using errcode = '22023', detail = 'Sólo meses cerrados desde enero de 2026.';
  end if;
  select * into c from comunidad.config;
  if not c.modulo_activo or not c.top_yumpers_activo then return jsonb_build_object('activo', false); end if;

  perform comunidad.consolidar_mes(v_mes);
  select * into m from comunidad.top_meses where mes = v_mes;
  select id into v_lector from comunidad.participantes where user_id = v_uid;

  select coalesce(jsonb_agg(
           case
             when x.eliminada then jsonb_build_object('posicion', x.posicion, 'puntos', x.puntos, 'estado', 'eliminada')
             when x.bloqueado then jsonb_build_object('posicion', x.posicion, 'puntos', x.puntos, 'estado', 'bloqueado')
             else jsonb_build_object('posicion', x.posicion, 'puntos', x.puntos, 'estado', 'activo',
                                     'id', x.participante_id, 'nombre', x.nombre,
                                     'avatar', comunidad.avatar_publico(x.seed), 'propio', x.participante_id = v_lector)
           end order by x.posicion, x.id), '[]'::jsonb)
    into v_items
    from (
      select r.id, r.posicion, r.puntos, r.participante_id, pa.nombre_comunitario as nombre,
             (select pr.avatar_seed from public.profiles pr where pr.id = pa.user_id) as seed,
             (r.participante_id is null or pa.user_id is null
              or exists (select 1 from comunidad.bajas_en_curso b where b.user_id = pa.user_id and b.cancelada_en is null)) as eliminada,
             (v_lector is not null and r.participante_id is distinct from v_lector
              and exists (select 1 from comunidad.bloqueos b
                           where b.bloqueador_participante = v_lector and b.bloqueado_participante = r.participante_id)) as bloqueado
        from comunidad.top_resultados r
        left join comunidad.participantes pa on pa.id = r.participante_id
       where r.mes = v_mes
       order by r.posicion, r.id
       limit 50
    ) x;

  select jsonb_build_object('posicion', r.posicion, 'puntos', r.puntos) into v_mia
    from comunidad.top_resultados r where r.mes = v_mes and r.participante_id = v_lector;

  return jsonb_build_object('activo', true, 'mes', to_char(v_mes, 'YYYY-MM'), 'corte', m.corte,
                            'autores', m.autores, 'items', v_items, 'mia', v_mia);
end;
$$;

revoke all on function comunidad.consolidar_mes(date) from public, anon, authenticated, service_role;
revoke all on function public.comunidad_top_yumpers(date) from public, anon, authenticated, service_role;
grant execute on function public.comunidad_top_yumpers(date) to authenticated;

drop function if exists comunidad.historial_libre(date, timestamptz);
drop function if exists comunidad.mes_conservado(date, timestamptz);
drop function if exists comunidad.vencido(timestamptz, interval, timestamptz);
drop function if exists comunidad.mas_plazo(timestamptz, interval);

drop index if exists comunidad.intentos_por_creacion;
drop index if exists comunidad.decisiones_por_creacion;
drop index if exists comunidad.tramos_cerrados_por_par;
drop index if exists comunidad.suspensiones_por_hasta;
drop index if exists comunidad.ordenes_utiles_por_vencimiento;
drop index if exists comunidad.denuncias_cerradas_por_cierre;

drop table if exists comunidad.purga_ejecuciones;
drop table if exists comunidad.purga_config;

commit;
