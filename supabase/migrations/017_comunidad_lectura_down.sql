-- Rollback de 017_comunidad_lectura.sql (E5a): deja la base como con 016.
--   - borra la lectura protegida, el interruptor para la ruta y el índice;
--   - restaura la lectura PROVISIONAL de E3a/E3b (comunidad_leer_titulo),
--     COPIA LITERAL de 015 (generada de ese archivo), con sus permisos.
-- No toca datos.
begin;

drop function if exists public.comunidad_resenas(text, integer, text, jsonb, integer);
drop function if exists public.comunidad_modulo_activo();
drop function if exists comunidad.item_lectura(comunidad.resenas, comunidad.versiones, uuid);
drop index if exists comunidad.resenas_recientes;

-- 015
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

revoke all on function public.comunidad_leer_titulo(uuid, text, integer)                              from public, anon, authenticated;
grant execute on function public.comunidad_leer_titulo(uuid, text, integer)                           to service_role;

commit;
