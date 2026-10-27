-- Reseñas de la comunidad, entrega E5b: orden "Más útiles".
-- Plan: docs/superpowers/plans/2026-10-22-resenas-comunidad.md (E5b).
-- Diseño: docs/superpowers/specs/2026-10-21-resenas-comunidad-revision.md
-- (§2.3 "Más útiles": orden congelado compartido y acotado; T10: Wilson con
-- z = 1,96) y docs/superpowers/specs/2026-10-21-resenas-comunidad-design.md
-- §3.3 (límite inferior de Wilson al 95 % sobre positivos/total; sin votos,
-- cero; desempate por fecha descendente y después id estable).
--
-- QUÉ HACE.
--   - `comunidad.wilson(positivos, total)`: el límite inferior del intervalo
--     de Wilson con z = 1,96. Sin votos, 0.
--   - El ORDEN CONGELADO por título (`ordenes_utiles` + `ordenes_utiles_tramos`):
--     la lista de ids de reseñas en el orden de utilidad, en filas de 100 ids
--     (~800 B, debajo del umbral de TOAST). Una página lee una o dos filas
--     por clave primaria, sin importar cuántas reseñas tenga el título.
--     NO guarda nada de quien lee: el orden es el mismo para todos.
--   - `comunidad.orden_utiles(tipo, tmdb_id)`: devuelve un orden vigente del
--     título. Reutiliza uno creado hace menos de 10 minutos; si no hay, toma
--     un lock consultivo del título (7311, hash del título), VUELVE A BUSCAR
--     (otro lector pudo crearlo mientras se esperaba) y recién entonces lo
--     genera. Al generar borra los vencidos de ese título. Vigencia: 2 horas.
--     No toma locks de filas comunitarias: sólo lee reseñas, versiones y
--     votos, y escribe en sus propias tablas (fuera del protocolo de §2.2.4,
--     que ordena escrituras sobre esas filas).
--   - Qué entra en el orden: las reseñas vivas con su versión vigente
--     publicada y primera publicación, de cualquier autor. Puntaje: Wilson
--     sobre los votos VIGENTES de la versión vigente al generar. Desempate:
--     primera publicación desc, id desc. Lo de cada lector (bloqueos, la
--     propia) y lo que cambie después (retiro, borrado, edición, suspensión)
--     se revalida en cada página.
--   - `comunidad_resenas(…, 'utiles', …)`: cada página recorre COMO MÁXIMO 50
--     posiciones del orden desde el cursor y devuelve hasta 5 reseñas
--     visibles para ese lector. Si en 50 posiciones encuentra menos, devuelve
--     las que encontró y el cursor avanzado 50. El texto se lee recién al
--     revalidar (el orden guarda ids). Cursor: {o: orden, p: posición}.
--   - Vencimiento: si el orden del cursor venció (o ya no existe), responde
--     `orden_actualizado` sin reseñas; la vista ofrece volver a empezar una
--     vez y deduplica lo que ya mostró.
--   - Dentro de un orden congelado, votar actualiza el CONTEO (se lee en
--     cada página) pero no REORDENA: el orden cambia recién con el orden
--     siguiente (reutilización de 10 minutos, vigencia de 2 horas).
--   - El total visible (encabezado) es el mismo que en "Recientes": se
--     calcula al abrir, sobre lo visible para ese lector.
--
-- Cota física: a lo sumo un orden nuevo cada 10 min por título (12 vigentes);
-- los vencidos de un título se borran al generar el siguiente. Un título que
-- deja de leerse conserva sus vencidos hasta una purga (E8, no programada
-- acá). Tamaños medidos: docs/medidas/2026-10-26-e5b-mediciones.md.
--
-- Rollback: 018_comunidad_utilidad_down.sql.

begin;

-- ------------------------------------------------------------------
-- Tablas del orden congelado. Privadas: sin grants y con RLS sin policies.
-- ------------------------------------------------------------------
create table if not exists comunidad.ordenes_utiles (
  id         bigint generated always as identity primary key,
  tipo       text not null check (tipo in ('movie', 'tv')),
  tmdb_id    integer not null check (tmdb_id > 0),
  creado_en  timestamptz not null,
  vence_en   timestamptz not null,
  total      integer not null check (total >= 0),
  check (vence_en > creado_en)
);
create index if not exists ordenes_utiles_por_titulo on comunidad.ordenes_utiles (tipo, tmdb_id, creado_en desc);

create table if not exists comunidad.ordenes_utiles_tramos (
  orden_id   bigint not null references comunidad.ordenes_utiles (id) on delete cascade,
  tramo_no   integer not null check (tramo_no >= 0),
  ids        bigint[] not null check (cardinality(ids) between 1 and 100),
  primary key (orden_id, tramo_no)
);

alter table comunidad.ordenes_utiles        enable row level security;
alter table comunidad.ordenes_utiles_tramos enable row level security;
revoke all on comunidad.ordenes_utiles, comunidad.ordenes_utiles_tramos from public, anon, authenticated, service_role;
revoke all on all sequences in schema comunidad from public, anon, authenticated, service_role;

-- ------------------------------------------------------------------
-- Wilson (T10): límite inferior del intervalo al 95 % (z = 1,96).
-- Con 0 positivos (o sin votos) es EXACTAMENTE 0: la fórmula en coma
-- flotante deja restos de ~1e-17 que, si no, ordenarían "0 de 1" antes que
-- "0 de 3" o que una sin votos más nueva, saltándose el desempate por fecha
-- (medido en local con 0/1 y 0/2). Todo en doble precisión y en el mismo
-- orden de operaciones que lib/comunidad/wilson.ts.
-- ------------------------------------------------------------------
create or replace function comunidad.wilson(p_positivos bigint, p_total bigint)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select case when p_total is null or p_total <= 0 or p_positivos is null or p_positivos <= 0 then 0::double precision else
    (c.p + c.z2 / (2 * c.n) - c.z * sqrt((c.p * (1 - c.p)) / c.n + c.z2 / (4 * c.n * c.n))) / (1 + c.z2 / c.n) end
    from (select p_positivos::double precision / p_total as p, p_total::double precision as n,
                 1.96::double precision as z, 1.96::double precision * 1.96::double precision as z2) c;
$$;

-- ------------------------------------------------------------------
-- Un orden vigente del título: reutiliza (< 10 min) o genera, uno a la vez.
-- ------------------------------------------------------------------
create or replace function comunidad.orden_utiles(p_tipo text, p_tmdb_id integer)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_id bigint;
  v_ahora timestamptz;
begin
  select id into v_id from comunidad.ordenes_utiles
   where tipo = p_tipo and tmdb_id = p_tmdb_id
     and creado_en > clock_timestamp() - interval '10 minutes' and vence_en > clock_timestamp()
   order by creado_en desc limit 1;
  if found then return v_id; end if;

  -- Un generador por título. La segunda búsqueda es una sentencia nueva (READ
  -- COMMITTED): ve el orden que confirmó quien tenía el lock.
  perform pg_advisory_xact_lock(7311, hashtext(p_tipo || ':' || p_tmdb_id));
  select id into v_id from comunidad.ordenes_utiles
   where tipo = p_tipo and tmdb_id = p_tmdb_id
     and creado_en > clock_timestamp() - interval '10 minutes' and vence_en > clock_timestamp()
   order by creado_en desc limit 1;
  if found then return v_id; end if;

  v_ahora := clock_timestamp();
  delete from comunidad.ordenes_utiles where tipo = p_tipo and tmdb_id = p_tmdb_id and vence_en <= v_ahora;
  insert into comunidad.ordenes_utiles (tipo, tmdb_id, creado_en, vence_en, total)
  values (p_tipo, p_tmdb_id, v_ahora, v_ahora + interval '2 hours', 0)
  returning id into v_id;

  with lista as (
    select r.id,
           row_number() over (order by comunidad.wilson(u.positivos, u.total) desc,
                                       r.primera_publicacion_en desc, r.id desc) - 1 as pos
      from comunidad.resenas r
      join comunidad.versiones v on v.id = r.version_vigente_id
      cross join lateral (
        select count(*) filter (where e.util) as positivos, count(*) as total
          from comunidad.evaluaciones e
         where e.version_id = v.id and e.retirada_en is null) u
     where r.tipo = p_tipo and r.tmdb_id = p_tmdb_id
       and r.borrada_en is null and r.primera_publicacion_en is not null
       and v.estado = 'publicada'
  )
  insert into comunidad.ordenes_utiles_tramos (orden_id, tramo_no, ids)
  select v_id, (pos / 100)::integer, array_agg(id order by pos)
    from lista group by pos / 100;

  update comunidad.ordenes_utiles
     set total = coalesce((select sum(cardinality(ids)) from comunidad.ordenes_utiles_tramos where orden_id = v_id), 0)
   where id = v_id;
  return v_id;
end;
$$;

-- ------------------------------------------------------------------
-- La lectura (017) con "Más útiles". "Recientes" no cambia.
-- ------------------------------------------------------------------
create or replace function public.comunidad_resenas(p_tipo text, p_tmdb_id integer, p_orden text, p_cursor jsonb, p_limite integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_uid uuid := auth.uid();
  c comunidad.config;
  v_part uuid;
  v_terminos text;
  v_lim integer := least(greatest(coalesce(p_limite, 5), 1), 20);
  v_t timestamptz;
  v_id bigint;
  v_orden bigint;
  v_desde integer;
  v_total_orden integer;
  v_ultima integer;
  v_items jsonb;
  v_n integer;
  v_ultimo jsonb;
  v_cursor jsonb;
  v_res jsonb;
begin
  if v_uid is null then
    raise exception 'sin_sesion' using errcode = '42501', detail = 'Leer reseñas de la comunidad exige sesión.';
  end if;
  if p_tipo is null or p_tipo not in ('movie', 'tv') or p_tmdb_id is null or p_tmdb_id <= 0 then
    raise exception 'titulo_invalido' using errcode = '22023';
  end if;
  if p_orden is null or p_orden not in ('recientes', 'utiles') then
    raise exception 'orden_invalido' using errcode = '22023';
  end if;
  if p_cursor is not null then
    begin
      if p_orden = 'recientes' then
        v_t := (p_cursor->>'t')::timestamptz;
        v_id := (p_cursor->>'id')::bigint;
        if v_t is null or v_id is null then raise exception 'x'; end if;
      else
        v_orden := (p_cursor->>'o')::bigint;
        v_desde := (p_cursor->>'p')::integer;
        if v_orden is null or v_desde is null or v_desde < 0 then raise exception 'x'; end if;
      end if;
    exception when others then
      raise exception 'cursor_invalido' using errcode = '22023';
    end;
  end if;

  select * into c from comunidad.config;
  if not c.modulo_activo then return jsonb_build_object('activo', false); end if;
  select id, terminos_version into v_part, v_terminos from comunidad.participantes where user_id = v_uid;

  if p_orden = 'recientes' then
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
    v_cursor := case when v_n > v_lim then jsonb_build_object('t', v_ultimo->'publicada_en', 'id', v_ultimo->'resena_id') end;
    v_res := jsonb_build_object('activo', true, 'orden', 'recientes', 'items', v_items, 'hay_mas', v_n > v_lim, 'cursor', v_cursor);
  else
    -- "Más útiles": el orden congelado del título.
    if p_cursor is null then
      v_orden := comunidad.orden_utiles(p_tipo, p_tmdb_id);
      v_desde := 0;
    elsif not exists (select 1 from comunidad.ordenes_utiles o
                       where o.id = v_orden and o.tipo = p_tipo and o.tmdb_id = p_tmdb_id and o.vence_en > clock_timestamp()) then
      -- Venció (o ya se borró): no se mezcla con otro orden.
      return jsonb_build_object('activo', true, 'orden', 'utiles', 'orden_actualizado', true,
                                'items', '[]'::jsonb, 'hay_mas', false, 'cursor', null);
    end if;
    select total into v_total_orden from comunidad.ordenes_utiles where id = v_orden;

    -- Como máximo 50 posiciones [v_desde, v_desde + 49]: una o dos filas de 100.
    with ventana as (
      select t.tramo_no * 100 + (u.ord - 1)::integer as pos, u.rid
        from comunidad.ordenes_utiles_tramos t
        cross join lateral unnest(t.ids) with ordinality as u(rid, ord)
       where t.orden_id = v_orden
         and t.tramo_no between v_desde / 100 and (v_desde + 49) / 100
    ), visibles as (
      select w.pos, r, v
        from ventana w
        join comunidad.resenas r on r.id = w.rid
        join comunidad.versiones v on v.id = r.version_vigente_id
       where w.pos between v_desde and v_desde + 49
         and r.tipo = p_tipo and r.tmdb_id = p_tmdb_id
         and r.borrada_en is null and v.estado = 'publicada'
         and r.autor_participante is distinct from v_part
         and not exists (select 1 from comunidad.bloqueos b
                          where b.bloqueador_participante = v_part and b.bloqueado_participante = r.autor_participante)
         and not exists (select 1 from comunidad.suspensiones s
                          where s.participante_id = r.autor_participante
                            and s.desde <= now() and (s.hasta is null or s.hasta > now()))
       order by w.pos
       limit v_lim
    )
    select coalesce(jsonb_agg(comunidad.item_lectura(x.r, x.v, v_part) order by x.pos), '[]'::jsonb), count(*), max(x.pos)
      into v_items, v_n, v_ultima
      from visibles x;
    -- Con la tanda llena, sigue después de la última mostrada; si no, se
    -- revisaron las 50 posiciones y sigue después de ellas.
    v_desde := case when v_n >= v_lim then v_ultima + 1 else v_desde + 50 end;
    v_cursor := case when v_desde < v_total_orden then jsonb_build_object('o', v_orden, 'p', v_desde) end;
    v_res := jsonb_build_object('activo', true, 'orden', 'utiles', 'items', v_items,
                                'hay_mas', v_desde < v_total_orden, 'cursor', v_cursor);
  end if;

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

revoke all on function comunidad.wilson(bigint, bigint)          from public, anon, authenticated, service_role;
revoke all on function comunidad.orden_utiles(text, integer)     from public, anon, authenticated, service_role;
revoke all on function public.comunidad_resenas(text, integer, text, jsonb, integer) from public, anon, authenticated, service_role;
grant execute on function public.comunidad_resenas(text, integer, text, jsonb, integer) to authenticated;

commit;
