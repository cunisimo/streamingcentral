-- Rollback de 018_comunidad_utilidad.sql (E5b): deja la base como con 017.
--   - borra el orden congelado (tablas y funciones) y Wilson;
--   - restaura la lectura de 017 (sólo "Recientes"), COPIA LITERAL de 017
--     (generada de ese archivo), con sus permisos.
-- ⚠️ Borra los órdenes congelados (datos derivados, se regeneran solos).
begin;

drop table if exists comunidad.ordenes_utiles_tramos;
drop table if exists comunidad.ordenes_utiles;
drop function if exists comunidad.orden_utiles(text, integer);
drop function if exists comunidad.wilson(bigint, bigint);

-- 017
create or replace function public.comunidad_resenas(p_tipo text, p_tmdb_id integer, p_orden text, p_cursor jsonb, p_limite integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  c comunidad.config;
  v_part uuid;
  v_terminos text;
  v_lim integer := least(greatest(coalesce(p_limite, 5), 1), 20);
  v_t timestamptz;
  v_id bigint;
  v_items jsonb;
  v_n integer;
  v_ultimo jsonb;
  v_res jsonb;
begin
  if v_uid is null then
    raise exception 'sin_sesion' using errcode = '42501', detail = 'Leer reseñas de la comunidad exige sesión.';
  end if;
  if p_tipo is null or p_tipo not in ('movie', 'tv') or p_tmdb_id is null or p_tmdb_id <= 0 then
    raise exception 'titulo_invalido' using errcode = '22023';
  end if;
  if p_orden is distinct from 'recientes' then
    raise exception 'orden_no_disponible' using errcode = '22023', detail = 'Por ahora sólo existe el orden "recientes" (E5b agrega "utiles").';
  end if;
  if p_cursor is not null then
    begin
      v_t := (p_cursor->>'t')::timestamptz;
      v_id := (p_cursor->>'id')::bigint;
    exception when others then
      raise exception 'cursor_invalido' using errcode = '22023';
    end;
    if v_t is null or v_id is null then raise exception 'cursor_invalido' using errcode = '22023'; end if;
  end if;

  select * into c from comunidad.config;
  if not c.modulo_activo then return jsonb_build_object('activo', false); end if;
  select id, terminos_version into v_part, v_terminos from comunidad.participantes where user_id = v_uid;

  with visibles as (
    select r, v
      from comunidad.resenas r
      join comunidad.versiones v on v.id = r.version_vigente_id
     where r.tipo = p_tipo and r.tmdb_id = p_tmdb_id
       and r.borrada_en is null and r.primera_publicacion_en is not null
       and v.estado = 'publicada'
       and r.autor_participante is distinct from v_part
       and not exists (select 1 from comunidad.bloqueos b
                        where b.bloqueador_participante = v_part and b.bloqueado_participante = r.autor_participante)
       and not exists (select 1 from comunidad.suspensiones s
                        where s.participante_id = r.autor_participante
                          and s.desde <= now() and (s.hasta is null or s.hasta > now()))
       and (p_cursor is null or (r.primera_publicacion_en, r.id) < (v_t, v_id))
     order by r.primera_publicacion_en desc, r.id desc
     limit v_lim + 1
  ), numeradas as (
    select x.r, x.v, row_number() over (order by (x.r).primera_publicacion_en desc, (x.r).id desc) as k from visibles x
  )
  select coalesce(jsonb_agg(comunidad.item_lectura(n.r, n.v, v_part) order by n.k) filter (where n.k <= v_lim), '[]'::jsonb),
         count(*)
    into v_items, v_n
    from numeradas n;

  v_ultimo := v_items -> (jsonb_array_length(v_items) - 1);
  v_res := jsonb_build_object(
    'activo', true,
    'orden', 'recientes',
    'items', v_items,
    'hay_mas', v_n > v_lim,
    'cursor', case when v_n > v_lim then jsonb_build_object('t', v_ultimo->'publicada_en', 'id', v_ultimo->'resena_id') end);

  if p_cursor is null then
    v_res := v_res || jsonb_build_object(
      'publicacion_activa', c.publicacion_activa,
      'terminos', jsonb_build_object('vigente', c.terminos_version,
                                     'aceptada', v_part is not null and v_terminos is not distinct from c.terminos_version),
      'correo_confirmado', exists (select 1 from auth.users u where u.id = v_uid and u.email_confirmed_at is not null),
      'baja_en_curso', exists (select 1 from comunidad.bajas_en_curso b where b.user_id = v_uid and b.cancelada_en is null),
      'suspendida', v_part is not null and exists (select 1 from comunidad.suspensiones s where s.participante_id = v_part
                      and s.desde <= now() and (s.hasta is null or s.hasta > now())),
      'mia', (select jsonb_build_object('resena_id', r.id, 'version_id', v.id, 'texto', v.texto, 'estado', v.estado,
                'utiles', (select count(*) from comunidad.evaluaciones e where e.version_id = v.id and e.retirada_en is null and e.util),
                'total', (select count(*) from comunidad.evaluaciones e where e.version_id = v.id and e.retirada_en is null))
                from comunidad.resenas r join comunidad.versiones v on v.id = r.version_vigente_id
               where v_part is not null and r.autor_participante = v_part and r.tipo = p_tipo and r.tmdb_id = p_tmdb_id
                 and r.borrada_en is null),
      'total', (select count(*)
                  from comunidad.resenas r join comunidad.versiones v on v.id = r.version_vigente_id
                 where r.tipo = p_tipo and r.tmdb_id = p_tmdb_id
                   and r.borrada_en is null and r.primera_publicacion_en is not null and v.estado = 'publicada'
                   and r.autor_participante is distinct from v_part
                   and not exists (select 1 from comunidad.bloqueos b
                                    where b.bloqueador_participante = v_part and b.bloqueado_participante = r.autor_participante)
                   and not exists (select 1 from comunidad.suspensiones s
                                    where s.participante_id = r.autor_participante
                                      and s.desde <= now() and (s.hasta is null or s.hasta > now()))));
  end if;
  return v_res;
end;
$$;

revoke all on function public.comunidad_resenas(text, integer, text, jsonb, integer) from public, anon, authenticated, service_role;
grant execute on function public.comunidad_resenas(text, integer, text, jsonb, integer) to authenticated;

commit;
