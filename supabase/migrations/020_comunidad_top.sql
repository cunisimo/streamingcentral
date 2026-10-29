-- Reseñas de la comunidad, entrega E7: Top Yumpers mensual.
-- Plan: docs/superpowers/plans/2026-10-22-resenas-comunidad.md (E7).
-- Diseño: docs/superpowers/specs/2026-10-21-resenas-comunidad-revision.md
-- §2.2.2 (tramos y cómputo al corte, con la conciliación del 25/10: la
-- suspensión es un intervalo y NO cierra tramos), §2.2.3 (huérfanos sin id),
-- §2.2.4 (corte consistente) y §2.2.5 (consolidación).
--
-- QUÉ HACE.
--   - `comunidad.puntos_al_corte(mes, corte)`: el cómputo, en UNA consulta.
--     Cuenta los pares (evaluador, autor) DISTINTOS con un tramo que cumple:
--       · primera evaluación positiva del mes (`mes_primera_positiva = mes`,
--         que es el mes argentino de esa primera positiva, [T(M-1), T(M)));
--       · el tramo rige antes del corte: desde < T y (hasta nulo o T ≤ hasta);
--       · ninguna suspensión del evaluador ni del autor rige antes del corte
--         (misma condición).
--     Un punto por evaluador distinto y autor: varios positivos de la misma
--     persona al mismo autor no suman más. Publicar no da puntos (no hay
--     tramo) y un negativo no resta (cierra el tramo de ESE evaluador, nada
--     más). Ediciones, retiros, restauraciones y bajas ya se reflejan en los
--     intervalos de los tramos (014–016); la suspensión, en su intervalo.
--   - `comunidad.consolidar_mes(mes)`: comprobación rápida SIN lock; si el
--     mes ya está consolidado, devuelve sin tomar nada. Si no, toma el
--     exclusivo K_CORTE (`proto_corte_exclusivo`, 013: READ COMMITTED y
--     ningún otro lock), VUELVE a comprobar y escribe mes y resultados en UNA
--     sentencia, cuya instantánea es posterior al lock. Los resultados son
--     posición densa y puntos; un autor huérfano (cuenta eliminada al
--     consolidar) se guarda SIN id. Un mes consolidado no se recalcula: lo
--     que pase después del corte no lo cambia. Bloqueos implícitos: el INSERT
--     sólo toca `top_meses` y `top_resultados` (FK entre ellas, filas de esta
--     misma sentencia); `top_resultados.participante_id` NO tiene FK, así que
--     la consolidación no toma locks de filas de participantes.
--   - `comunidad_top_yumpers(mes)`, SÓLO authenticated: el ranking de un mes
--     cerrado (por defecto, el último), consolidándolo en la primera lectura.
--     Proyección: posición, puntos y, por autor, nombre comunitario y avatar
--     del catálogo (E6). Cuenta eliminada: sin id, nombre ni avatar.
--     Bloqueado por quien mira: «Usuario bloqueado», sin id, nombre ni avatar
--     (la puntuación es global, revisión §3.1). Más la posición propia.
--   - `comunidad_top_yumpers_activo()`, SÓLO service_role: los interruptores,
--     para que la ruta decida si muestra el selector a quien no tiene sesión.
--
-- No programa ningún job (E8) ni purga nada.
--
-- Rollback: 020_comunidad_top_down.sql (borra lo consolidado: es derivado y
-- se puede volver a calcular desde los tramos mientras no haya purga).

begin;

-- ------------------------------------------------------------------
-- Resultados consolidados.
-- ------------------------------------------------------------------
create table if not exists comunidad.top_meses (
  mes             date primary key check (extract(day from mes) = 1),
  corte           timestamptz not null,
  consolidado_en  timestamptz not null,
  autores         integer not null check (autores >= 0),
  constraint top_meses_despues_del_corte check (consolidado_en >= corte)
);

create table if not exists comunidad.top_resultados (
  id               bigint generated always as identity primary key,
  mes              date not null references comunidad.top_meses (mes),
  posicion         integer not null check (posicion >= 1),
  puntos           integer not null check (puntos >= 1),
  -- null = autor huérfano al consolidar (§2.2.3): el ranking histórico no lo identifica.
  -- 🔴 SIN FK a participantes, a propósito: la FK haría que el INSERT de la
  -- consolidación tomara KEY SHARE sobre la fila de cada autor (un lock
  -- implícito), y la consolidación tiene que tomar K_CORTE y NINGÚN otro lock
  -- (§2.2.4). Medido en B8: con la FK, la red de seguridad de Auth (que tiene
  -- la fila del participante y pide K_CORTE compartido) y la consolidación
  -- (que tiene el exclusivo y pedía la fila) se bloqueaban en ciclo y
  -- Postgres abortaba la consolidación 5 de 5 veces. Un id que ya no existe
  -- (purga de E8) se lee como cuenta eliminada.
  participante_id  uuid
);
create unique index if not exists top_resultados_uno_por_autor
  on comunidad.top_resultados (mes, participante_id) where participante_id is not null;
create index if not exists top_resultados_por_mes on comunidad.top_resultados (mes, posicion, id);
-- Para el cómputo: los tramos de un mes.
create index if not exists tramos_por_mes on comunidad.tramos (mes_primera_positiva);

alter table comunidad.top_meses      enable row level security;
alter table comunidad.top_resultados enable row level security;
revoke all on comunidad.top_meses, comunidad.top_resultados from public, anon, authenticated, service_role;
revoke all on sequence comunidad.top_resultados_id_seq from public, anon, authenticated, service_role;

-- ------------------------------------------------------------------
-- El cómputo al corte (§2.2.2).
-- ------------------------------------------------------------------
create or replace function comunidad.puntos_al_corte(p_mes date, p_corte timestamptz)
returns table (autor uuid, puntos integer)
language sql
stable
set search_path = ''
as $$
  with pares as (
    select distinct t.evaluador_participante as evaluador, t.autor_participante as autor
      from comunidad.tramos t
     where t.mes_primera_positiva = date_trunc('month', p_mes)::date
       and comunidad.rige_antes_de(t.vigente_desde, t.vigente_hasta, p_corte)
       and not exists (select 1 from comunidad.suspensiones s
                        where s.participante_id in (t.evaluador_participante, t.autor_participante)
                          and comunidad.rige_antes_de(s.desde, s.hasta, p_corte))
  )
  select p.autor, count(*)::integer from pares p group by p.autor;
$$;

-- ------------------------------------------------------------------
-- La consolidación (§2.2.5). Devuelve true si calculó en esta llamada.
-- ------------------------------------------------------------------
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

-- ------------------------------------------------------------------
-- La lectura del ranking, con la sesión de quien mira.
-- ------------------------------------------------------------------
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

-- Los interruptores, para la ruta sin sesión (sólo dice si hay Top Yumpers).
create or replace function public.comunidad_top_yumpers_activo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select modulo_activo and top_yumpers_activo from comunidad.config;
$$;

-- ==================================================================
-- Permisos. Cada objeto nuevo repite su revoke (ver 011).
-- ==================================================================
revoke all on function comunidad.puntos_al_corte(date, timestamptz) from public, anon, authenticated, service_role;
revoke all on function comunidad.consolidar_mes(date) from public, anon, authenticated, service_role;
revoke all on function public.comunidad_top_yumpers(date) from public, anon, authenticated, service_role;
revoke all on function public.comunidad_top_yumpers_activo() from public, anon, authenticated, service_role;
grant execute on function public.comunidad_top_yumpers(date) to authenticated;
grant execute on function public.comunidad_top_yumpers_activo() to service_role;

commit;
