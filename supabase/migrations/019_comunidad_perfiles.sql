-- Reseñas de la comunidad, entrega E6: nombre comunitario y perfil mínimo
-- del autor.
-- Plan: docs/superpowers/plans/2026-10-22-resenas-comunidad.md (E6).
-- Diseño: docs/superpowers/specs/2026-10-21-resenas-comunidad-design.md §3.1
-- (perfil por identificador no sensible, proyección específica, bloqueo,
-- cuenta eliminada) y la revisión §2.1.2 (fila A), §2.1.3 (nombre en su
-- propia columna), §3.4 (nombre con las mismas reglas; `display_name` fuera).
--
-- QUÉ HACE.
--   - `comunidad_cambiar_nombre(uid, nombre, decisión, id_intento, hash)`,
--     SÓLO service_role:
--     la ruta corre las reglas de nombre de E1 y pasa la decisión, como en
--     publicar. Fila A de la matriz (módulo, publicación, suspensión, correo,
--     términos) y el límite del día `limite_nombres` (3, hipótesis). Escribe
--     SÓLO `participantes.nombre_comunitario`, que tiene su CHECK de forma
--     desde 011 (2–24, NFC, sin bordes ni controles). `profiles.display_name`
--     no participa en nada comunitario: cambiarlo directo no cambia este
--     nombre. Un nombre que las reglas RETENDRÍAN no se guarda (no hay cola
--     de revisión de nombres): cuenta para el límite y se informa. Repetir el
--     mismo nombre es `sin_cambios` y no consume límite.
--     IDEMPOTENCIA (A1 de la auditoría de E6 sobre 8cbe0cd): cada envío lleva
--     un `id_intento` del cliente y el hash del pedido normalizado, como
--     publicar y editar (014, `comunidad.intentos`, acción 'nombre'). Todo
--     resultado posterior a la relectura queda registrado en la MISMA
--     transacción que su efecto; un reintento con el mismo intento devuelve
--     ese resultado (`repetido`) sin escribir ni consumir cupo, aunque otra
--     sesión haya cambiado el nombre en el medio. Mismo id con otro hash:
--     `conflicto`. El intento NO guarda ningún nombre (ni el aceptado: la
--     baja no borra intentos y una cuenta eliminada no conserva su nombre);
--     el hash del pedido es un HMAC con el secreto del servidor, así que un
--     nombre corto no se puede adivinar desde él.
--   - `comunidad_perfil(participante, cursor, límite)`, SÓLO authenticated:
--     el lector sale de `auth.uid()` (sin uid en el pedido). Devuelve la
--     proyección: nombre comunitario, un avatar DEL CATÁLOGO, dos agregados
--     (reseñas visibles y "Me sirvió" recibidos en ellas) y las reseñas
--     visibles para quien mira, de a 5 con cursor (primera publicación, id).
--     Nunca correo, `user_id`, `display_name`, listas, plataformas ni
--     historial. Estados: `eliminada` (sin nombre, avatar ni reseñas),
--     `bloqueado` (quien mira bloqueó al autor: sin nombre, avatar ni
--     reseñas), `no_existe` y `sin_participante` (pedido del propio perfil
--     sin identidad comunitaria). Con el autor suspendido, sus reseñas no se
--     ven (como en la ficha) salvo para él mismo; no se informa la suspensión.
--     `participante = null` es el perfil propio.
--   - `comunidad.avatar_publico(semilla)`: convierte `profiles.avatar_seed`
--     en un id del catálogo de lib/avatares.ts y NUNCA devuelve la semilla
--     guardada (las heredadas son uuid). Mismo mapeo que `resolverAvatar`:
--     id del catálogo → ese; otra semilla → FNV-1a sobre LEGADO_V1; vacía →
--     null (el cliente usa el de por defecto). Un test compara las dos.
--   - `item_lectura` suma `autor: {id, nombre}` (el id del participante, no
--     el de la cuenta) para enlazar el perfil desde la ficha.
--
-- Rollback: 019_comunidad_perfiles_down.sql (restaura `item_lectura` de 017).

begin;

-- ------------------------------------------------------------------
-- La idempotencia de 014 suma la acción 'nombre' (A1).
-- ------------------------------------------------------------------
alter table comunidad.intentos drop constraint if exists intentos_accion_check;
alter table comunidad.intentos add constraint intentos_accion_check check (accion in ('publicar', 'editar', 'nombre'));

-- ------------------------------------------------------------------
-- Avatar público: sólo ids del catálogo. LEGADO_V1 congelado (lib/avatares.ts).
-- ------------------------------------------------------------------
create or replace function comunidad.avatar_publico(p_seed text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  catalogo constant text[] := array[
    'buitracio', 'buitracia', 'coco', 'dontito', 'fini', 'jipi', 'juanpalomo',
    'lola', 'pocho', 'rico', 'cat', 'monster', 'witch', 'bot', 'astronauta',
    'tv', 'reproductor', 'control', 'claqueta', 'ticket', 'popcorn', 'sillon',
    'auriculares', 'book', 'lupa', 'brujula', 'crown', 'pocion', 'rocket',
    'planet', 'moon'];
  s text := btrim(coalesce(p_seed, ''));
  h bigint := 2166136261;
  i integer;
begin
  if s = '' then return null; end if;
  if s = any(catalogo) then return s; end if;
  -- FNV-1a de 32 bits sobre las unidades de la cadena, como `hashCadena`.
  -- Las semillas heredadas son uuid (ASCII); fuera del plano básico la base
  -- cuenta puntos de código y el navegador unidades UTF-16 (ver la prueba).
  for i in 1 .. char_length(s) loop
    h := ((h # ascii(substr(s, i, 1))::bigint) * 16777619) & 4294967295;
  end loop;
  return catalogo[(h % 31) + 1];
end;
$$;

-- ------------------------------------------------------------------
-- La lectura de la ficha suma el autor (id de participante y nombre).
-- Cuenta desvinculada (baja): sin nombre.
-- ------------------------------------------------------------------
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
                           where d.version_id = v.id and d.denunciante_participante = p_lector),
    'autor', (select jsonb_build_object('id', p.id, 'nombre', case when p.user_id is not null then p.nombre_comunitario end)
                from comunidad.participantes p where p.id = r.autor_participante));
$$;

-- ------------------------------------------------------------------
-- Cambiar el nombre comunitario (fila A). Protocolo de 013: cuenta →
-- participante → suspensiones → contador → relectura (intento previo
-- incluido) → marca → escritura del efecto Y del intento.
-- ------------------------------------------------------------------
-- La firma anterior (sin intento, 8cbe0cd) no queda como sobrecarga.
drop function if exists public.comunidad_cambiar_nombre(uuid, text, jsonb);
create or replace function public.comunidad_cambiar_nombre(
  p_uid uuid, p_nombre text, p_decision jsonb, p_id_intento uuid, p_hash text)
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
  v_actual text;
  v_cant integer;
  v_limite integer;
  v_dia date := comunidad.dia_ar(clock_timestamp());
  v_cupo boolean := false;
  v_res jsonb;
  m timestamptz;
begin
  if p_nombre is null then
    raise exception 'nombre_invalido' using errcode = '22023';
  end if;
  v_part := comunidad.proto_cuenta(p_uid, false);
  -- Sin identidad comunitaria no hay dónde registrar el intento ni nada que
  -- cambiar: un reintento devuelve lo mismo.
  if v_part is null then return comunidad.rechazo_cuenta('terminos_pendientes'); end if;
  perform 1 from comunidad.proto_participantes(array[v_part]);
  perform 1 from comunidad.proto_suspensiones(array[v_part]);
  perform 1 from comunidad.proto_contadores(v_part, array['nombre'], v_dia);

  -- Relectura, con todo bloqueado. Un intento ya resuelto se devuelve tal
  -- cual: recuperar una confirmación nunca es otra escritura.
  v_prev := comunidad.intento_previo(v_part, 'nombre', p_id_intento, p_hash);
  if v_prev is not null then return v_prev; end if;
  v_motivo := comunidad.condiciones_a(p_uid, v_part);
  select nombre_comunitario into v_actual from comunidad.participantes where id = v_part;
  select limite_nombres into v_limite from comunidad.config;
  select cantidad into v_cant from comunidad.contadores
   where participante_id = v_part and accion = 'nombre' and dia = v_dia;

  if v_motivo is not null then
    v_res := comunidad.rechazo_cuenta(v_motivo);
  elsif v_dec = 'publicar' and v_actual is not distinct from p_nombre then
    v_res := jsonb_build_object('resultado', 'sin_cambios', 'nombre', v_actual);
  elsif coalesce(v_cant, 0) >= v_limite then
    v_res := comunidad.rechazo_cuenta('limite_diario');
  elsif v_dec = 'publicar' then
    v_res := jsonb_build_object('resultado', 'nombre_cambiado', 'nombre', p_nombre);
    v_cupo := true;
  elsif v_dec = 'retener' then
    v_res := jsonb_build_object('resultado', 'nombre_no_admitido');
    v_cupo := true;
  else
    v_res := jsonb_build_object('resultado', 'rechazo_contenido');
    v_cupo := true;
  end if;

  m := comunidad.proto_marca();
  if v_cupo then perform comunidad.consumir_cupo(v_part, 'nombre', v_dia); end if;
  if (v_res->>'resultado') = 'nombre_cambiado' then
    -- El CHECK de 011 (forma) rige igual: un nombre mal formado revierte todo,
    -- cupo e intento incluidos.
    update comunidad.participantes set nombre_comunitario = p_nombre, nombre_cambiado_en = m where id = v_part;
  end if;
  -- El intento guarda el hash del pedido y el resultado SIN el nombre.
  insert into comunidad.intentos (participante_id, accion, id_intento, hash_peticion, resultado)
  values (v_part, 'nombre', p_id_intento, p_hash, v_res - 'nombre');
  return v_res;
end;
$$;

-- ------------------------------------------------------------------
-- El perfil comunitario, con la sesión de quien mira.
-- ------------------------------------------------------------------
create or replace function public.comunidad_perfil(p_participante uuid, p_cursor jsonb, p_limite integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  c comunidad.config;
  v_lector uuid;
  v_id uuid := p_participante;
  o comunidad.participantes;
  v_propio boolean;
  v_suspendido boolean;
  v_seed text;
  v_lim integer := least(greatest(coalesce(p_limite, 5), 1), 20);
  v_t timestamptz;
  v_rid bigint;
  v_items jsonb;
  v_n integer;
  v_ultimo jsonb;
  v_resenas integer;
  v_utiles integer;
begin
  if v_uid is null then
    raise exception 'sin_sesion' using errcode = '42501', detail = 'El perfil comunitario exige sesión.';
  end if;
  if p_cursor is not null then
    begin
      v_t := (p_cursor->>'t')::timestamptz;
      v_rid := (p_cursor->>'id')::bigint;
      if v_t is null or v_rid is null then raise exception 'x'; end if;
    exception when others then
      raise exception 'cursor_invalido' using errcode = '22023';
    end;
  end if;

  select * into c from comunidad.config;
  if not c.modulo_activo then return jsonb_build_object('activo', false); end if;
  select id into v_lector from comunidad.participantes where user_id = v_uid;
  if v_id is null then
    if v_lector is null then return jsonb_build_object('activo', true, 'estado', 'sin_participante'); end if;
    v_id := v_lector;
  end if;

  select * into o from comunidad.participantes where id = v_id;
  if not found then return jsonb_build_object('activo', true, 'estado', 'no_existe'); end if;
  if o.user_id is null or exists (select 1 from comunidad.bajas_en_curso b
                                   where b.user_id = o.user_id and b.cancelada_en is null) then
    return jsonb_build_object('activo', true, 'estado', 'eliminada', 'id', o.id);
  end if;
  v_propio := o.id is not distinct from v_lector;
  if not v_propio and exists (select 1 from comunidad.bloqueos b
                               where b.bloqueador_participante = v_lector and b.bloqueado_participante = o.id) then
    return jsonb_build_object('activo', true, 'estado', 'bloqueado', 'id', o.id);
  end if;
  v_suspendido := exists (select 1 from comunidad.suspensiones s
                           where s.participante_id = o.id and s.desde <= now() and (s.hasta is null or s.hasta > now()));
  select pr.avatar_seed into v_seed from public.profiles pr where pr.id = o.user_id;

  -- Visibles: vivas, con la versión vigente publicada; si el autor está
  -- suspendido, sólo para él.
  select count(*), coalesce(sum((select count(*) from comunidad.evaluaciones e
                                  where e.version_id = v.id and e.retirada_en is null and e.util)), 0)
    into v_resenas, v_utiles
    from comunidad.resenas r
    join comunidad.versiones v on v.id = r.version_vigente_id
   where r.autor_participante = o.id and r.borrada_en is null and r.primera_publicacion_en is not null
     and v.estado = 'publicada' and (v_propio or not v_suspendido);

  with visibles as (
    select r, v
      from comunidad.resenas r
      join comunidad.versiones v on v.id = r.version_vigente_id
     where r.autor_participante = o.id and r.borrada_en is null and r.primera_publicacion_en is not null
       and v.estado = 'publicada' and (v_propio or not v_suspendido)
       and (p_cursor is null or (r.primera_publicacion_en, r.id) < (v_t, v_rid))
     order by r.primera_publicacion_en desc, r.id desc
     limit v_lim + 1
  ), numeradas as (
    select x.r, x.v, row_number() over (order by (x.r).primera_publicacion_en desc, (x.r).id desc) as k from visibles x
  )
  select coalesce(jsonb_agg(comunidad.item_lectura(n.r, n.v, v_lector)
                            || jsonb_build_object('tipo', (n.r).tipo, 'tmdb_id', (n.r).tmdb_id)
                            order by n.k) filter (where n.k <= v_lim), '[]'::jsonb),
         count(*)
    into v_items, v_n
    from numeradas n;
  v_ultimo := v_items -> (jsonb_array_length(v_items) - 1);

  return jsonb_build_object(
    'activo', true, 'estado', 'activo', 'orden', 'perfil', 'id', o.id, 'propio', v_propio,
    'nombre', o.nombre_comunitario, 'avatar', comunidad.avatar_publico(v_seed),
    'resenas', v_resenas, 'utiles_recibidos', v_utiles,
    'items', v_items, 'hay_mas', v_n > v_lim,
    'cursor', case when v_n > v_lim then jsonb_build_object('t', v_ultimo->'publicada_en', 'id', v_ultimo->'resena_id') end);
end;
$$;

-- ==================================================================
-- Permisos. Cada objeto nuevo repite su revoke (ver 011).
-- ==================================================================
revoke all on function comunidad.avatar_publico(text) from public, anon, authenticated, service_role;
revoke all on function comunidad.item_lectura(comunidad.resenas, comunidad.versiones, uuid) from public, anon, authenticated, service_role;
revoke all on function public.comunidad_cambiar_nombre(uuid, text, jsonb, uuid, text) from public, anon, authenticated;
revoke all on function public.comunidad_perfil(uuid, jsonb, integer) from public, anon, authenticated, service_role;
grant execute on function public.comunidad_cambiar_nombre(uuid, text, jsonb, uuid, text) to service_role;
grant execute on function public.comunidad_perfil(uuid, jsonb, integer) to authenticated;

commit;
