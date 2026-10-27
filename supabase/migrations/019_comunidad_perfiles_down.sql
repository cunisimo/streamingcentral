-- Rollback de 019 (E6): quita el cambio de nombre, el perfil y el avatar
-- público, y restaura `comunidad.item_lectura` de 017 (copia literal, sin el
-- autor). No toca `participantes.nombre_comunitario` (es de 011): los
-- nombres elegidos se conservan y vuelven a verse al subir 019.
begin;

drop function if exists public.comunidad_perfil(uuid, jsonb, integer);
drop function if exists public.comunidad_cambiar_nombre(uuid, text, jsonb);
drop function if exists comunidad.avatar_publico(text);

-- Copia literal de 017_comunidad_lectura.sql.
create or replace function comunidad.item_lectura(r comunidad.resenas, v comunidad.versiones, p_lector uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'resena_id', r.id, 'version_id', v.id, 'texto', v.texto,
    'publicada_en', r.primera_publicacion_en, 'editada', v.creada_en > r.primera_publicacion_en,
    'utiles', (select count(*) from comunidad.evaluaciones e where e.version_id = v.id and e.retirada_en is null and e.util),
    'total', (select count(*) from comunidad.evaluaciones e where e.version_id = v.id and e.retirada_en is null),
    'mi_voto', (select case when e.util then 'util' else 'no_util' end from comunidad.evaluaciones e
                 where e.version_id = v.id and e.evaluador_participante = p_lector and e.retirada_en is null),
    'denunciada', exists (select 1 from comunidad.denuncias d
                           where d.version_id = v.id and d.denunciante_participante = p_lector));
$$;

revoke all on function comunidad.item_lectura(comunidad.resenas, comunidad.versiones, uuid) from public, anon, authenticated, service_role;

commit;
