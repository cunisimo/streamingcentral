-- Reseñas de la comunidad, entrega E8: retención y purga.
-- Plan: docs/superpowers/plans/2026-10-22-resenas-comunidad.md (E8).
-- Diseño: docs/superpowers/specs/2026-10-21-resenas-comunidad-revision.md
-- §5 (retención interna) y §2.5 (planificador).
--
-- PLAZOS: decisiones de producto del dueño (27/10/2026), NO validadas
-- legalmente (P3 sigue pendiente). Cargados acá como valores por defecto de
-- `comunidad.purga_config`, ajustables sin migración:
--   - reseñas publicadas y votos: mientras sigan vigentes (sin plazo);
--   - órdenes de "Más útiles": al vencer sus 2 horas (`vence_en`);
--   - intentos de recuperación de envíos (`intentos`): 7 días;
--   - versiones reemplazadas y textos retirados: 30 días, salvo denuncia
--     pendiente. "Retirados" se lee como DOS casos, cada uno con su columna:
--     el retiro de moderación (`oculta`) y el borrado del autor
--     (`borrada_en`). Ver el informe de E8: la segunda lectura es una
--     interpretación a confirmar;
--   - contenido retenido y denuncias abiertas: hasta resolverlos; NUNCA por
--     antigüedad (no hay columna: no se pueden purgar);
--   - denuncias resueltas (cerradas: `descartada` o `resuelta`, y el
--     historial mínimo de `denuncias_cerradas`): 30 días después del cierre;
--   - historial de moderación sin texto (`decisiones`): 12 meses;
--   - rankings mensuales consolidados: 12 meses desde el corte del mes;
--   - historial para reconstruir puntos (tramos e intervalos de suspensión):
--     después de consolidar el mes, con 30 días de margen.
-- SIN CONFIGURAR (null o sin columna, y por lo tanto sin purga propia):
--   - huellas antispam (`plazo_huellas` null). Siguen cayendo, como hasta
--     ahora, con su versión (FK en cascada, §5: "con la versión") y con la
--     baja;
--   - versiones rechazadas, retenidas y con revisión pedida, votos
--     retirados, contadores, bloqueos, excedentes, corroboraciones, marcadores
--     de baja y este mismo registro de ejecuciones.
-- PENDIENTE Y DESACTIVADO: conservar el texto denunciado después de borrar
-- una cuenta. No está aprobado (P3). `conservar_texto_denunciado_baja` lo
-- identifica y un CHECK lo deja en false: activarlo exige una migración y una
-- decisión. La baja sigue borrando ese texto (016) y acá no hay ningún
-- archivo adicional de textos.
--
-- QUÉ HACE.
--   - `comunidad.purgar(alcance, ahora)`: PROCEDIMIENTO. 'hora' = órdenes
--     vencidas; 'dia' = el resto; o una sola categoría. Interruptor propio
--     `purga_activa`, APAGADO: apagado no hace nada. Lotes acotados
--     (`lote`), cada uno en SU transacción (COMMIT entre lotes): no hay
--     transacciones largas y una interrupción deja confirmados los lotes
--     anteriores y revierte entero el que estaba en curso. Idempotente: lo
--     que ya se borró no vuelve a estar entre los candidatos. Una corrida
--     por vez (lock consultivo de sesión 7320; la segunda queda registrada
--     como `ocupada`). `ahora` sirve para probar con reloj controlado y no
--     puede ser futuro.
--   - `comunidad.purga_lote(categoria, ahora, lote)`: un lote, una
--     transacción (la del llamador).
--   - Registro mínimo `comunidad.purga_ejecuciones`: alcance, instante,
--     estado y, por categoría, cantidades y el SQLSTATE de un error. Sin
--     textos, nombres, correos, tokens ni ids de filas.
--   - Ventana del Top Yumpers: un mes cuyo ranking ya venció no se lee ni se
--     consolida (`mes_conservado`). Si no, la primera lectura de un mes
--     purgado lo reconstruiría VACÍO desde un historial ya borrado.
--     `consolidar_mes` y `comunidad_top_yumpers` (020) se redefinen sólo
--     para eso.
--   - A1 (auditoría 95c09b2): la ventana sola no alcanzaba, porque depende
--     del plazo de HOY; ampliarlo (o dejarlo en null) volvía a habilitar un
--     mes ya purgado, que se reconstruía vacío o incompleto. Ahora cada
--     borrado de un ranking o de historial marca el mes en
--     `comunidad.meses_sin_historial` (permanente, en la misma transacción)
--     y `consolidar_mes` lo rechaza siempre. Cubre también meses que nunca
--     se consolidaron. Un mes ya consolidado y conservado se sigue leyendo.
--
-- PROTECCIONES (cada una con su prueba en pruebas-purga.mjs):
--   - nunca la vigente visible, ni retenidas, ni con revisión pedida, ni
--     rechazadas; nada con una denuncia abierta, ni con una denuncia cerrada
--     que todavía no venció (la cascada la borraría antes de su plazo);
--   - una denuncia cerrada no se borra si su versión tiene otra abierta;
--   - decisiones: se conservan las de un caso abierto (versión retenida,
--     con revisión pedida, retirada o con denuncias abiertas), la suspensión
--     que todavía rige y la última pausa/reanudación de la publicación;
--   - tramos: sólo cerrados y de un mes ya liberado (consolidado hace más
--     que el margen, o fuera de la conservación de rankings). Mientras la
--     versión pueda volver a recibir votos o restaurarse (publicada,
--     retenida, con revisión pedida u oculta; reseña viva; evaluador con
--     cuenta), se conserva UN tramo por par: votar y restaurar toman el MES
--     DE LA PRIMERA POSITIVA de los tramos anteriores del par (014, 016), y
--     todos los tramos de un par llevan el mismo mes;
--   - suspensiones: sólo cerradas, vencido el plazo de moderación desde su
--     fin, y con TODOS los meses cuyo corte cae dentro del intervalo
--     liberados;
--   - participantes: sólo desvinculados (baja) y sin ninguna fila que los
--     referencie (incluidos bloqueos de otros y tramos conservados).
--
-- LOCKS. La purga no espera locks de filas: o los toma en el acto
-- (`for update nowait`, una reseña o versión por subtransacción) o salta la
-- fila (`skip locked`), así que nunca entra en un ciclo de espera con una
-- operación real; lo que salta queda para la corrida siguiente. Excepciones
-- que sí esperan, acotadas por `lock_timeout`:
--   - rankings, tramos y suspensiones: K_CORTE COMPARTIDO (7301, 0), como
--     el admin; la consolidación (exclusivo) vuelve a mirar la ventana y la
--     marca con el lock tomado, así que no recrea un mes que la purga acaba
--     de borrar ni lee su historial a medio borrar;
--   - órdenes: el lock del generador del título (7311), con `try`: un
--     título que se está regenerando se saltea.
-- Tramos, suspensiones cerradas y denuncias cerradas no los modifica nadie
-- (sólo se cierran filas abiertas), así que borrarlos no compite con votos,
-- retiros ni ediciones.
--
-- NO PROGRAMA NADA: los jobs están en supabase/cron-comunidad.sql, que no
-- se ejecuta sin autorización (Producción).
--
-- Rollback: 021_comunidad_purga_down.sql. 🔴 Lo purgado NO vuelve con el
-- rollback ni con ninguna otra cosa: la purga borra físicamente.

begin;

-- ------------------------------------------------------------------
-- Configuración: UNA fila. Interruptor apagado.
-- ------------------------------------------------------------------
create table if not exists comunidad.purga_config (
  id                              boolean primary key default true check (id),
  purga_activa                    boolean not null default false,
  lote                            integer not null default 200 check (lote between 1 and 5000),
  plazo_intentos                  interval default interval '7 days',
  plazo_reemplazadas              interval default interval '30 days',
  plazo_retiradas                 interval default interval '30 days',
  plazo_borradas                  interval default interval '30 days',
  plazo_denuncias_cerradas        interval default interval '30 days',
  plazo_decisiones                interval default interval '12 months',
  plazo_rankings                  interval default interval '12 months',
  margen_historial_puntos         interval default interval '30 days',
  plazo_huellas                   interval,
  conservar_texto_denunciado_baja boolean not null default false,
  actualizada_en                  timestamptz not null default now(),
  constraint purga_plazos_positivos check (
        coalesce(plazo_intentos, interval '1 second') > interval '0'
    and coalesce(plazo_reemplazadas, interval '1 second') > interval '0'
    and coalesce(plazo_retiradas, interval '1 second') > interval '0'
    and coalesce(plazo_borradas, interval '1 second') > interval '0'
    and coalesce(plazo_denuncias_cerradas, interval '1 second') > interval '0'
    and coalesce(plazo_decisiones, interval '1 second') > interval '0'
    and coalesce(plazo_rankings, interval '1 second') > interval '0'
    and coalesce(margen_historial_puntos, interval '1 second') >= interval '0'
    and coalesce(plazo_huellas, interval '1 second') > interval '0'),
  -- P3 pendiente: la excepción no está aprobada. Activarla es una migración.
  constraint purga_sin_excepcion_baja check (not conservar_texto_denunciado_baja)
);
insert into comunidad.purga_config default values on conflict (id) do nothing;

comment on column comunidad.purga_config.plazo_huellas is
  'Sin configurar: plazo no definido por el dueño. Las huellas caen con su versión y con la baja.';
comment on column comunidad.purga_config.conservar_texto_denunciado_baja is
  'Decisión pendiente (P3): conservar el texto denunciado tras borrar una cuenta. NO aprobada; el CHECK la mantiene desactivada.';

-- ------------------------------------------------------------------
-- Registro mínimo de ejecución. Sin textos, nombres, correos, tokens ni ids.
-- ------------------------------------------------------------------
create table if not exists comunidad.purga_ejecuciones (
  id            bigint generated always as identity primary key,
  alcance       text not null check (alcance ~ '^[a-z]{3,20}$'),
  ahora         timestamptz not null,
  iniciada_en   timestamptz not null,
  terminada_en  timestamptz,
  estado        text not null check (estado in ('en_curso', 'completa', 'con_errores', 'apagada_en_curso', 'ocupada')),
  resumen       jsonb not null default '{}'::jsonb
);

-- ------------------------------------------------------------------
-- A1 (auditoría 95c09b2): meses cuyo cómputo ya no se puede reconstruir.
-- Una fila por mes al que la purga le borró el ranking consolidado o parte
-- del historial (tramos del mes; suspensiones cuyo intervalo cruza su
-- corte), escrita en la misma transacción que el borrado. Es PERMANENTE y
-- no depende de ningún plazo: ampliar `plazo_rankings` o dejarlo en null no
-- rehabilita el mes. Sólo frena la CONSOLIDACIÓN: un mes que ya está en
-- `top_meses` se sigue leyendo. Sin datos de nadie: sólo el mes.
-- ------------------------------------------------------------------
create table if not exists comunidad.meses_sin_historial (
  mes         date primary key check (extract(day from mes) = 1),
  marcado_en  timestamptz not null default now()
);

alter table comunidad.purga_config        enable row level security;
alter table comunidad.purga_ejecuciones   enable row level security;
alter table comunidad.meses_sin_historial enable row level security;
revoke all on comunidad.purga_config, comunidad.purga_ejecuciones, comunidad.meses_sin_historial
  from public, anon, authenticated, service_role;
revoke all on all sequences in schema comunidad from public, anon, authenticated, service_role;

-- Apoyos de los candidatos.
create index if not exists intentos_por_creacion   on comunidad.intentos (creado_en);
create index if not exists decisiones_por_creacion on comunidad.decisiones (creada_en);
create index if not exists tramos_cerrados_por_par on comunidad.tramos (evaluador_participante, version_id, id);
create index if not exists suspensiones_por_hasta  on comunidad.suspensiones (hasta) where hasta is not null;
create index if not exists ordenes_utiles_por_vencimiento on comunidad.ordenes_utiles (vence_en);
create index if not exists denuncias_cerradas_por_cierre on comunidad.denuncias_cerradas (cerrada_en);

-- ==================================================================
-- Auxiliares (comunidad: nadie de la API).
-- ==================================================================

-- t + plazo en hora argentina (un "mes" es el argentino, como todo acá).
create or replace function comunidad.mas_plazo(p_t timestamptz, p_plazo interval)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select ((p_t at time zone 'America/Argentina/Buenos_Aires') + p_plazo)
           at time zone 'America/Argentina/Buenos_Aires';
$$;

-- Vencido EN el instante del plazo (justo antes, no). Sin plazo: nunca.
create or replace function comunidad.vencido(p_t timestamptz, p_plazo interval, p_ahora timestamptz)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_plazo is not null and p_t is not null and comunidad.mas_plazo(p_t, p_plazo) <= p_ahora;
$$;

-- ¿El ranking del mes sigue dentro de la conservación? Vence a los
-- `plazo_rankings` del corte T(M). Sin plazo: siempre.
create or replace function comunidad.mes_conservado(p_mes date, p_ahora timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select not comunidad.vencido(comunidad.corte_de_mes(p_mes),
                               (select c.plazo_rankings from comunidad.purga_config c), p_ahora);
$$;

-- A1: marca los meses (idempotente). La llama la purga, en la transacción
-- del borrado.
create or replace function comunidad.marcar_sin_historial(p_meses date[])
returns void
language sql
set search_path = ''
as $$
  insert into comunidad.meses_sin_historial (mes)
  select distinct x from unnest(p_meses) x where x is not null order by 1
  on conflict (mes) do nothing;
$$;

-- ¿El historial del mes (tramos y suspensiones que cruzan su corte) ya no
-- hace falta? Sí, si el mes se consolidó hace al menos el margen, o si su
-- ranking ya venció (no se puede leer ni consolidar: ver la ventana).
create or replace function comunidad.historial_libre(p_mes date, p_ahora timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from comunidad.top_meses m
                  where m.mes = p_mes
                    and comunidad.vencido(m.consolidado_en,
                          (select c.margen_historial_puntos from comunidad.purga_config c), p_ahora))
      or not comunidad.mes_conservado(p_mes, p_ahora);
$$;

-- ¿El par (evaluador, versión) todavía puede producir tramos? Votar
-- (publicada vigente), publicar/restaurar (retenida, revisión pedida,
-- oculta) toman el mes de la primera positiva de los tramos anteriores.
-- Rechazada y reemplazada son finales; una reseña borrada no vuelve; un
-- evaluador dado de baja no vota y sus votos ya se borraron.
create or replace function comunidad.par_con_memoria(p_evaluador uuid, p_version bigint)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from comunidad.versiones v
                   join comunidad.resenas r on r.id = v.resena_id
                  where v.id = p_version
                    and v.estado in ('publicada', 'retenida', 'revision_solicitada', 'oculta')
                    and r.borrada_en is null)
     and exists (select 1 from comunidad.participantes p
                  where p.id = p_evaluador and p.user_id is not null);
$$;

-- Una versión con una denuncia abierta, o cerrada y todavía no vencida, no
-- se borra (la cascada borraría la denuncia).
create or replace function comunidad.version_protegida(p_version bigint, p_ahora timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from comunidad.denuncias d
                  where d.version_id = p_version
                    and (d.estado = 'abierta'
                         or not comunidad.vencido(d.cerrada_en,
                                  (select c.plazo_denuncias_cerradas from comunidad.purga_config c), p_ahora)));
$$;

-- ¿La reseña se puede borrar entera? Retirada por moderación (vigente oculta
-- desde hace el plazo) o borrada por el autor (desde hace el plazo), y
-- ninguna versión en un estado sin plazo ni protegida.
create or replace function comunidad.resena_purgable(p_resena bigint, p_ahora timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  with c as (select * from comunidad.purga_config)
  select exists (
    select 1 from comunidad.resenas r
      join comunidad.versiones vig on vig.id = r.version_vigente_id
     where r.id = p_resena
       and (
             (r.borrada_en is null and vig.estado = 'oculta'
              and comunidad.vencido(vig.decidida_en, (select plazo_retiradas from c), p_ahora)
              and not exists (select 1 from comunidad.versiones v
                               where v.resena_id = r.id and v.estado not in ('oculta', 'reemplazada')))
          or (r.borrada_en is not null
              and comunidad.vencido(r.borrada_en, (select plazo_borradas from c), p_ahora)
              and not exists (select 1 from comunidad.versiones v
                               where v.resena_id = r.id and v.estado not in ('publicada', 'oculta', 'reemplazada')))
           )
       and not exists (select 1 from comunidad.versiones v
                        where v.resena_id = r.id and comunidad.version_protegida(v.id, p_ahora)));
$$;

-- Toma, sin esperar, todo lo que borra la cascada de esas versiones (y la
-- reseña, si se pasa). Si algo está tomado: 55P03 (lock_not_available).
create or replace function comunidad.purga_tomar(p_resena bigint, p_versiones bigint[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_resena is not null then
    perform 1 from comunidad.resenas where id = p_resena for update nowait;
  end if;
  perform 1 from comunidad.versiones where id = any(p_versiones) order by id for update nowait;
  perform 1 from comunidad.evaluaciones where version_id = any(p_versiones) order by id for update nowait;
  perform 1 from comunidad.denuncias where version_id = any(p_versiones) order by id for update nowait;
  perform 1 from comunidad.huellas where version_id = any(p_versiones) order by version_id for update nowait;
  perform 1 from comunidad.denuncias_excedentes where version_id = any(p_versiones) order by version_id, hora for update nowait;
  perform 1 from comunidad.corroboraciones where version_id = any(p_versiones) order by version_id for update nowait;
end;
$$;

-- ==================================================================
-- Un lote de una categoría. Devuelve {borrados, omitidos, seguir}.
-- `seguir` = el lote se llenó y borró algo: puede haber más.
-- ==================================================================
create or replace function comunidad.purga_lote(p_categoria text, p_ahora timestamptz, p_lote integer)
returns jsonb
language plpgsql
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  c comunidad.purga_config;
  v_borrados integer := 0;
  v_omitidos integer := 0;
  v_n integer := 0;
  v_m integer := 0;
  v_candidatos integer := 0;
  v_id bigint;
  v_versiones bigint[];
  v_meses date[];
  v_titulo record;   -- ojo: no `t`, que es alias de tablas en las consultas
begin
  select * into c from comunidad.purga_config;
  if p_lote is null or p_lote < 1 then raise exception 'lote_invalido' using errcode = '22023'; end if;

  if p_categoria = 'ordenes' then
    -- Por título, con el lock del generador (018) en modo `try`.
    for v_titulo in select o.tipo, o.tmdb_id from comunidad.ordenes_utiles o
                     where o.vence_en <= p_ahora group by o.tipo, o.tmdb_id order by o.tipo, o.tmdb_id limit p_lote loop
      v_candidatos := v_candidatos + 1;
      if pg_try_advisory_xact_lock(7311, hashtext(v_titulo.tipo || ':' || v_titulo.tmdb_id)) then
        delete from comunidad.ordenes_utiles o
         where o.tipo = v_titulo.tipo and o.tmdb_id = v_titulo.tmdb_id and o.vence_en <= p_ahora;
        get diagnostics v_n = row_count;
        v_borrados := v_borrados + v_n;
      else
        v_omitidos := v_omitidos + 1;
      end if;
    end loop;

  elsif p_categoria = 'intentos' then
    with x as (
      select i.participante_id, i.accion, i.id_intento from comunidad.intentos i
       where comunidad.vencido(i.creado_en, c.plazo_intentos, p_ahora)
       order by i.creado_en limit p_lote for update skip locked)
    delete from comunidad.intentos i using x
     where i.participante_id = x.participante_id and i.accion = x.accion and i.id_intento = x.id_intento;
    get diagnostics v_borrados = row_count;
    v_candidatos := v_borrados;

  elsif p_categoria = 'denuncias' then
    -- Cerradas y vencidas, salvo que su versión tenga otra abierta (caso abierto).
    with x as (
      select d.id from comunidad.denuncias d
       where d.estado <> 'abierta'
         and comunidad.vencido(d.cerrada_en, c.plazo_denuncias_cerradas, p_ahora)
         and not exists (select 1 from comunidad.denuncias a where a.version_id = d.version_id and a.estado = 'abierta')
       order by d.id limit p_lote for update skip locked)
    delete from comunidad.denuncias d using x where d.id = x.id;
    get diagnostics v_n = row_count;
    -- El historial mínimo de las cerradas por una baja (016): mismo plazo.
    with x as (
      select y.id from comunidad.denuncias_cerradas y
       where comunidad.vencido(y.cerrada_en, c.plazo_denuncias_cerradas, p_ahora)
       order by y.id limit p_lote for update skip locked)
    delete from comunidad.denuncias_cerradas y using x where y.id = x.id;
    get diagnostics v_m = row_count;
    v_borrados := v_n + v_m;
    v_candidatos := greatest(v_n, v_m);

  elsif p_categoria = 'decisiones' then
    with x as (
      select d.id from comunidad.decisiones d
       where comunidad.vencido(d.creada_en, c.plazo_decisiones, p_ahora)
         -- caso abierto sobre la versión
         and not exists (select 1 from comunidad.versiones v
                          where v.id = d.version_id
                            and (v.estado in ('retenida', 'revision_solicitada', 'oculta')
                                 or exists (select 1 from comunidad.denuncias a
                                             where a.version_id = v.id and a.estado = 'abierta')))
         -- la suspensión que todavía rige (o está por regir)
         and not (d.accion = 'suspender'
                  and exists (select 1 from comunidad.suspensiones s
                               where s.participante_id = d.participante_id
                                 and (s.hasta is null or s.hasta > p_ahora)))
         -- el estado vigente de la publicación
         and not (d.accion in ('pausar_publicacion', 'reanudar_publicacion')
                  and d.id = (select max(z.id) from comunidad.decisiones z
                               where z.accion in ('pausar_publicacion', 'reanudar_publicacion')))
       order by d.id limit p_lote for update skip locked)
    delete from comunidad.decisiones d using x where d.id = x.id;
    get diagnostics v_borrados = row_count;
    v_candidatos := v_borrados;

  elsif p_categoria = 'huellas' then
    if c.plazo_huellas is not null then
      with x as (
        select h.version_id from comunidad.huellas h
         where comunidad.vencido(h.creada_en, c.plazo_huellas, p_ahora)
         order by h.version_id limit p_lote for update skip locked)
      delete from comunidad.huellas h using x where h.version_id = x.version_id;
      get diagnostics v_borrados = row_count;
      v_candidatos := v_borrados;
    end if;

  elsif p_categoria = 'reemplazadas' then
    for v_id in select v.id from comunidad.versiones v
                 where v.estado = 'reemplazada'
                   and comunidad.vencido(v.decidida_en, c.plazo_reemplazadas, p_ahora)
                   and not comunidad.version_protegida(v.id, p_ahora)
                 order by v.id limit p_lote loop
      v_candidatos := v_candidatos + 1;
      begin
        perform comunidad.purga_tomar(null, array[v_id]);
        -- Relectura con todo tomado.
        if exists (select 1 from comunidad.versiones v
                    where v.id = v_id and v.estado = 'reemplazada'
                      and comunidad.vencido(v.decidida_en, c.plazo_reemplazadas, p_ahora)
                      and not comunidad.version_protegida(v.id, p_ahora)) then
          delete from comunidad.versiones where id = v_id;
          v_borrados := v_borrados + 1;
        end if;
      exception when lock_not_available then
        v_omitidos := v_omitidos + 1;
      end;
    end loop;

  elsif p_categoria in ('retiradas', 'borradas') then
    for v_id in select r.id from comunidad.resenas r
                 where (case p_categoria when 'borradas' then r.borrada_en is not null else r.borrada_en is null end)
                   and comunidad.resena_purgable(r.id, p_ahora)
                 order by r.id limit p_lote loop
      v_candidatos := v_candidatos + 1;
      begin
        select coalesce(array_agg(v.id order by v.id), '{}') into v_versiones
          from comunidad.versiones v where v.resena_id = v_id;
        perform comunidad.purga_tomar(v_id, v_versiones);
        -- Relectura con todo tomado (una versión nueva tomaría antes la reseña).
        if comunidad.resena_purgable(v_id, p_ahora) then
          delete from comunidad.resenas where id = v_id;
          v_borrados := v_borrados + 1;
        end if;
      exception when lock_not_available then
        v_omitidos := v_omitidos + 1;
      end;
    end loop;

  elsif p_categoria = 'rankings' then
    -- K_CORTE compartido: la consolidación, con el exclusivo, vuelve a mirar
    -- la ventana y la marca, y no recrea un mes que se está borrando.
    perform pg_advisory_xact_lock_shared(7301, 0);
    select coalesce(array_agg(y.mes order by y.mes), '{}') into v_meses
      from (select m.mes from comunidad.top_meses m
             where not comunidad.mes_conservado(m.mes, p_ahora)
             order by m.mes limit p_lote) y;
    -- A1: lo consolidado se pierde → el mes queda marcado, en la MISMA
    -- transacción que el borrado (ningún plazo posterior lo rehabilita).
    perform comunidad.marcar_sin_historial(v_meses);
    delete from comunidad.top_resultados t where t.mes = any(v_meses);
    delete from comunidad.top_meses m where m.mes = any(v_meses);
    get diagnostics v_n = row_count;
    v_borrados := v_n;
    v_candidatos := v_n;

  elsif p_categoria = 'tramos' then
    -- K_CORTE compartido (A1): una consolidación (exclusivo) no puede leer el
    -- historial a medio borrar; la marca y el borrado confirman juntos.
    perform pg_advisory_xact_lock_shared(7301, 0);
    with x as (
      select t.id from comunidad.tramos t
       where t.vigente_hasta is not null
         and comunidad.historial_libre(t.mes_primera_positiva, p_ahora)
         and not (t.id = (select max(z.id) from comunidad.tramos z
                           where z.evaluador_participante = t.evaluador_participante and z.version_id = t.version_id)
                  and comunidad.par_con_memoria(t.evaluador_participante, t.version_id))
       order by t.id limit p_lote for update skip locked
    ), b as (
      delete from comunidad.tramos t using x where t.id = x.id returning t.mes_primera_positiva as mes
    )
    select count(*), coalesce(array_agg(distinct b.mes), '{}') into v_borrados, v_meses from b;
    -- A1: un tramo sólo cuenta para el mes de su primera positiva.
    perform comunidad.marcar_sin_historial(v_meses);
    v_candidatos := v_borrados;

  elsif p_categoria = 'suspensiones' then
    perform pg_advisory_xact_lock_shared(7301, 0);   -- como tramos (A1)
    with x as (
      select s.id from comunidad.suspensiones s
       where s.hasta is not null and s.hasta <= p_ahora
         and comunidad.vencido(s.hasta, c.plazo_decisiones, p_ahora)
         and not exists (
           select 1 from generate_series(comunidad.mes_ar(s.desde)::timestamp, comunidad.mes_ar(s.hasta)::timestamp,
                                         interval '1 month') g(m)
            where comunidad.corte_de_mes(g.m::date) > s.desde
              and comunidad.corte_de_mes(g.m::date) <= s.hasta
              and not comunidad.historial_libre(g.m::date, p_ahora))
       order by s.id limit p_lote for update skip locked
    ), b as (
      delete from comunidad.suspensiones s using x where s.id = x.id returning s.desde, s.hasta
    )
    select count(*), coalesce((select array_agg(distinct g.m::date)
                                 from b b2, generate_series(comunidad.mes_ar(b2.desde)::timestamp, comunidad.mes_ar(b2.hasta)::timestamp,
                                                            interval '1 month') g(m)
                                where comunidad.corte_de_mes(g.m::date) > b2.desde
                                  and comunidad.corte_de_mes(g.m::date) <= b2.hasta), '{}')
      into v_borrados, v_meses from b;
    -- A1: una suspensión cuenta para los meses cuyo corte cae en su intervalo.
    perform comunidad.marcar_sin_historial(v_meses);
    v_candidatos := v_borrados;

  elsif p_categoria = 'participantes' then
    with x as (
      select p.id from comunidad.participantes p
       where p.user_id is null
         and not exists (select 1 from comunidad.resenas r where r.autor_participante = p.id)
         and not exists (select 1 from comunidad.versiones v where v.autor_participante = p.id)
         and not exists (select 1 from comunidad.evaluaciones e where e.evaluador_participante = p.id or e.autor_participante = p.id)
         and not exists (select 1 from comunidad.tramos t where t.evaluador_participante = p.id or t.autor_participante = p.id)
         and not exists (select 1 from comunidad.suspensiones s where s.participante_id = p.id)
         and not exists (select 1 from comunidad.denuncias d where d.denunciante_participante = p.id or d.autor_participante = p.id)
         and not exists (select 1 from comunidad.bloqueos b where b.bloqueador_participante = p.id or b.bloqueado_participante = p.id)
         and not exists (select 1 from comunidad.contadores k where k.participante_id = p.id)
         and not exists (select 1 from comunidad.intentos i where i.participante_id = p.id)
       order by p.id limit p_lote for update skip locked)
    delete from comunidad.participantes p using x where p.id = x.id;
    get diagnostics v_borrados = row_count;
    v_candidatos := v_borrados;

  else
    raise exception 'categoria_invalida' using errcode = '22023';
  end if;

  return jsonb_build_object('borrados', v_borrados, 'omitidos', v_omitidos,
                            'seguir', v_borrados > 0 and v_candidatos >= p_lote);
end;
$$;

-- ==================================================================
-- La corrida. PROCEDIMIENTO: confirma cada lote. Sin cláusula SET (un
-- procedimiento con SET no puede confirmar): todo va calificado.
-- ==================================================================
create or replace procedure comunidad.purgar(p_alcance text, p_ahora timestamptz default null)
language plpgsql
as $$
declare
  v_categorias text[];
  v_cat text;
  v_ahora timestamptz;
  v_lote integer;
  v_activa boolean;
  v_id bigint;
  v_r jsonb;
  v_err text;
  v_borrados integer;
  v_omitidos integer;
  v_lotes integer;
  v_estado text := 'completa';
begin
  v_categorias := case p_alcance
    when 'hora' then array['ordenes']
    -- Orden: lo que libera va antes de lo que protege. Las denuncias vencidas
    -- liberan versiones; el contenido purgado libera decisiones (un caso
    -- abierto deja de serlo) y tramos (un par sin versión no guarda memoria);
    -- los rankings vencidos liberan historial; los participantes, al final.
    -- Así una segunda corrida con el mismo `ahora` no encuentra nada más.
    when 'dia' then array['denuncias', 'reemplazadas', 'retiradas', 'borradas', 'decisiones', 'huellas',
                          'intentos', 'rankings', 'tramos', 'suspensiones', 'participantes']
    else case when p_alcance in ('ordenes', 'denuncias', 'decisiones', 'reemplazadas', 'retiradas', 'borradas',
                                 'huellas', 'intentos', 'rankings', 'tramos', 'suspensiones', 'participantes')
              then array[p_alcance] end
  end;
  if v_categorias is null then raise exception 'alcance_invalido' using errcode = '22023'; end if;
  v_ahora := coalesce(p_ahora, pg_catalog.clock_timestamp());
  if v_ahora > pg_catalog.clock_timestamp() then
    raise exception 'ahora_futuro' using errcode = '22023', detail = 'La purga no se adelanta al reloj.';
  end if;

  select c.purga_activa, c.lote into v_activa, v_lote from comunidad.purga_config c;
  if v_activa is not true then return; end if;   -- apagada (o sin fila): no hace nada

  if not pg_catalog.pg_try_advisory_lock(7320, 0) then
    insert into comunidad.purga_ejecuciones (alcance, ahora, iniciada_en, terminada_en, estado)
    values (p_alcance, v_ahora, pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp(), 'ocupada');
    commit;
    return;
  end if;

  insert into comunidad.purga_ejecuciones (alcance, ahora, iniciada_en, estado)
  values (p_alcance, v_ahora, pg_catalog.clock_timestamp(), 'en_curso')
  returning id into v_id;
  commit;

  <<categorias>>
  foreach v_cat in array v_categorias loop
    v_borrados := 0; v_omitidos := 0; v_lotes := 0; v_err := null;
    loop
      -- Releer el interruptor entre lotes: apagarlo detiene la corrida.
      select c.purga_activa into v_activa from comunidad.purga_config c;
      if v_activa is not true then
        v_estado := 'apagada_en_curso';
        exit categorias;
      end if;
      begin
        v_r := comunidad.purga_lote(v_cat, v_ahora, v_lote);
      exception when others then
        v_err := sqlstate;   -- sólo el código: el mensaje puede llevar datos
      end;
      if v_err is not null then
        v_estado := 'con_errores';
      else
        v_lotes := v_lotes + 1;
        v_borrados := v_borrados + (v_r->>'borrados')::integer;
        v_omitidos := v_omitidos + (v_r->>'omitidos')::integer;
      end if;
      update comunidad.purga_ejecuciones
         set resumen = resumen || jsonb_build_object(v_cat, jsonb_build_object(
               'borrados', v_borrados, 'omitidos', v_omitidos, 'lotes', v_lotes, 'error', v_err))
       where id = v_id;
      commit;   -- el lote y su progreso, juntos
      exit when v_err is not null or not (v_r->>'seguir')::boolean or v_lotes >= 10000;
    end loop;
  end loop;

  update comunidad.purga_ejecuciones
     set estado = v_estado, terminada_en = pg_catalog.clock_timestamp()
   where id = v_id;
  commit;
  perform pg_catalog.pg_advisory_unlock(7320, 0);
end;
$$;

-- ==================================================================
-- Ventana del Top Yumpers (020, con la conservación de rankings).
-- ==================================================================
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
  -- E8: un mes fuera de la conservación no se reconstruye (su historial pudo purgarse).
  if not comunidad.mes_conservado(v_mes, clock_timestamp()) then
    raise exception 'mes_invalido' using errcode = '22023', detail = 'Mes fuera de la conservación de rankings.';
  end if;
  -- E8 A1: ni uno cuyo historial ya se purgó, cualquiera sea el plazo de hoy.
  if exists (select 1 from comunidad.meses_sin_historial where mes = v_mes) then
    raise exception 'mes_invalido' using errcode = '22023', detail = 'El historial de ese mes ya se purgó.';
  end if;
  -- 2. El exclusivo (READ COMMITTED, ningún otro lock: lo hace cumplir 013).
  perform comunidad.proto_corte_exclusivo();
  -- 3. Nueva comprobación: otro pudo consolidar mientras esperábamos.
  if exists (select 1 from comunidad.top_meses where mes = v_mes) then return false; end if;
  -- E8: y la purga pudo borrarlo mientras esperábamos (tenía K_CORTE compartido).
  if not comunidad.mes_conservado(v_mes, clock_timestamp()) then
    raise exception 'mes_invalido' using errcode = '22023', detail = 'Mes fuera de la conservación de rankings.';
  end if;
  -- E8 A1: la marca se confirma con el borrado, que también toma K_CORTE compartido.
  if exists (select 1 from comunidad.meses_sin_historial where mes = v_mes) then
    raise exception 'mes_invalido' using errcode = '22023', detail = 'El historial de ese mes ya se purgó.';
  end if;
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
  -- E8: ni un mes cuyo ranking venció (se purga: no se lee ni se reconstruye vacío).
  if not comunidad.mes_conservado(v_mes, clock_timestamp()) then
    raise exception 'mes_invalido' using errcode = '22023', detail = 'Mes fuera de la conservación de rankings.';
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

-- ==================================================================
-- Permisos. Cada objeto nuevo repite su revoke (ver 011). Nadie de la API
-- ejecuta la purga: la corre el dueño (postgres), desde pg_cron o a mano.
-- ==================================================================
revoke all on function comunidad.mas_plazo(timestamptz, interval) from public, anon, authenticated, service_role;
revoke all on function comunidad.vencido(timestamptz, interval, timestamptz) from public, anon, authenticated, service_role;
revoke all on function comunidad.mes_conservado(date, timestamptz) from public, anon, authenticated, service_role;
revoke all on function comunidad.historial_libre(date, timestamptz) from public, anon, authenticated, service_role;
revoke all on function comunidad.par_con_memoria(uuid, bigint) from public, anon, authenticated, service_role;
revoke all on function comunidad.version_protegida(bigint, timestamptz) from public, anon, authenticated, service_role;
revoke all on function comunidad.resena_purgable(bigint, timestamptz) from public, anon, authenticated, service_role;
revoke all on function comunidad.purga_tomar(bigint, bigint[]) from public, anon, authenticated, service_role;
revoke all on function comunidad.marcar_sin_historial(date[]) from public, anon, authenticated, service_role;
revoke all on function comunidad.purga_lote(text, timestamptz, integer) from public, anon, authenticated, service_role;
revoke all on procedure comunidad.purgar(text, timestamptz) from public, anon, authenticated, service_role;
revoke all on function comunidad.consolidar_mes(date) from public, anon, authenticated, service_role;
revoke all on function public.comunidad_top_yumpers(date) from public, anon, authenticated, service_role;
grant execute on function public.comunidad_top_yumpers(date) to authenticated;

commit;
