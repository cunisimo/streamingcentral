-- Reseñas de la comunidad, entrega E5a: lectura protegida y "Recientes".
-- Plan: docs/superpowers/plans/2026-10-22-resenas-comunidad.md (E5a).
-- Diseño: docs/superpowers/specs/2026-10-21-resenas-comunidad-revision.md
-- (§2.1.2 lecturas ejecutables por `authenticated`, nunca `anon`; matriz de
-- autorización, fila "Leer"; §2.3 "Recientes": cursor por clave, primera
-- publicación desc e id desc, sin tope y sin snapshot; T1: /api/title intacto).
--
-- QUÉ HACE.
--   - `public.comunidad_resenas(tipo, tmdb_id, orden, cursor, limite)`:
--     reemplaza la lectura PROVISIONAL de E3a/E3b (`comunidad_leer_titulo`,
--     de `service_role` con un `p_uid` que pasaba la ruta). La ejecuta SÓLO
--     `authenticated` y lee al usuario de su propio JWT (`auth.uid()`): no
--     recibe uid, así que nadie lee "como" otro. `anon` no tiene EXECUTE y
--     `service_role` tampoco (sin `auth.uid()` no hay lector).
--   - Una página de "Recientes": hasta `limite` (1–20, por defecto 5)
--     reseñas VISIBLES PARA ESE LECTOR, con el cursor de la última. Visible:
--     reseña viva, versión vigente publicada, con primera publicación, que no
--     es la propia, cuyo autor no está bloqueado POR QUIEN LEE (el bloqueo
--     personal sólo oculta para quien bloquea) ni suspendido ahora.
--   - La visibilidad se calcula de nuevo en CADA página, sobre el estado
--     confirmado: una reseña retirada, borrada, de un autor suspendido o
--     recién bloqueado no aparece en las páginas siguientes. La clave
--     (primera publicación, id) no cambia al editar, así que una edición
--     entre páginas no duplica ni saltea: es la misma reseña con otra
--     versión.
--   - Sólo en la PRIMERA página (sin cursor): la propia (en cualquier estado,
--     para el editor), el estado de la cuenta para los avisos del editor y
--     el total visible para ese lector.
--   - `orden = 'utiles'` todavía no existe (E5b): responde 22023.
--   - Con el módulo apagado: `{activo: false}` y nada más (matriz, fila
--     "Leer").
--   - `public.comunidad_modulo_activo()`: sólo el interruptor, para que la
--     ruta decida si muestra la invitación a registrarse SIN sesión. Es de
--     `service_role` (la llama la ruta); no dice nada de ningún título.
--   - Un índice para la clave de "Recientes".
--   - `comunidad_leer_titulo` se borra: ya no la usa nada.
--
-- Rollback: 017_comunidad_lectura_down.sql.

begin;

create index if not exists resenas_recientes
  on comunidad.resenas (tipo, tmdb_id, primera_publicacion_en desc, id desc)
  where borrada_en is null and primera_publicacion_en is not null;

drop function if exists public.comunidad_leer_titulo(uuid, text, integer);

-- Lo que la lista muestra de una reseña visible, para ese lector.
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

-- Sólo el interruptor (fila "Leer": con el módulo apagado no se muestra
-- nada, tampoco la invitación). Sin datos de ningún título ni cuenta.
create or replace function public.comunidad_modulo_activo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select modulo_activo from comunidad.config;
$$;

revoke all on function comunidad.item_lectura(comunidad.resenas, comunidad.versiones, uuid) from public, anon, authenticated, service_role;
revoke all on function public.comunidad_resenas(text, integer, text, jsonb, integer) from public, anon, authenticated, service_role;
revoke all on function public.comunidad_modulo_activo()                             from public, anon, authenticated, service_role;
grant execute on function public.comunidad_resenas(text, integer, text, jsonb, integer) to authenticated;
grant execute on function public.comunidad_modulo_activo()                             to service_role;

commit;
