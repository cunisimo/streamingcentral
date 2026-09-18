-- Auditoría del pool curado para las salas compartidas. SÓLO LECTURA.
--
-- Se pega en el SQL Editor de Supabase (corre como postgres) y el resultado se
-- copia a docs/medidas/<fecha>-salas-pool.md. No escribe nada.
--
-- Los filtros son EXACTAMENTE los de `sala_candidatos` (plan de salas, Tarea
-- 1.4): película, con "por qué verla" (`razon` con texto real), con duración
-- comprobable, no apta para chicos, sin `requiere_contexto`, y con
-- disponibilidad en AR.
--
-- CRITERIO DE TEXTO PRESENTE, el mismo en todo el archivo y en la RPC:
--   "hay razón"  = nullif(btrim(razon), '') is not null
--   "con pero"   = nullif(btrim(advertencia), '') is not null
--   "sin pero"   = NULL, '' o sólo espacios
-- Coincide con `sala_publicar_ronda`, que normaliza una advertencia vacía a
-- NULL, y con la interfaz, que no la muestra.
--
-- El "pero" (`advertencia`) es OPCIONAL desde el 2026-09-18 por decisión del
-- dueño: una película sin advertencia entra igual y la card simplemente no
-- muestra esa sección. No se genera ningún texto de reemplazo.
--
-- Criterio de go de la Etapa 1 (plan, Tarea 0.2): `cualquiera >= 20` en
-- n,d,m / n,d / n,d,m,p y `>= 10` en n sola.

-- 1. Tamaño del pool servible (sin plataformas)
select
  count(*)                                                                as total_movie,
  count(*) filter (where nullif(btrim(razon), '') is not null)            as con_razon,
  count(*) filter (where nullif(btrim(razon), '') is not null
                   and nullif(btrim(advertencia), '') is not null)        as con_razon_y_pero,
  count(*) filter (where nullif(btrim(razon), '') is not null
                   and runtime is not null and runtime > 0)               as con_razon_y_duracion,
  count(*) filter (where nullif(btrim(razon), '') is not null
                   and runtime > 0 and not apto_chicos
                   and not requiere_contexto)                             as servibles_sala,
  count(*) filter (where nullif(btrim(razon), '') is not null
                   and runtime > 0 and not apto_chicos
                   and not requiere_contexto and runtime <= 90)           as cortas,
  count(*) filter (where nullif(btrim(razon), '') is not null
                   and runtime > 0 and not apto_chicos
                   and not requiere_contexto and runtime > 90)            as largas
from roulette_titles
where media_type = 'movie';

-- 2. Antigüedad de la disponibilidad. `sala_candidatos` NO filtra por
--    `checked_at`: usa `title_availability` tal cual esté, así que su
--    antigüedad es la del último refresco manual (MANTENIMIENTO §2 / Apéndice A
--    del plan). Después, la card se revalida con cardsByIds, cuyas cachés
--    (`card:` 24 h, `pv3:` 8 h) pueden tener hasta 24 h de antigüedad. Los tres
--    conteos dicen cuánto del pool está más viejo que cada umbral.
select
  min(checked_at)                                                   as mas_vieja,
  max(checked_at)                                                   as mas_nueva,
  count(*)                                                          as filas,
  count(*) filter (where checked_at < now() - interval '24 hours')  as mas_de_24h,
  count(*) filter (where checked_at < now() - interval '7 days')    as mas_de_7d,
  count(*) filter (where checked_at < now() - interval '30 days')   as mas_de_30d
from title_availability
where region = 'AR';

-- 3. Servibles por unión de plataformas. Los nombres son los de
--    title_availability (ver lib/roulette-providers.ts), no los códigos.
with u(nombre, plats) as (values
  ('n,d,m',   array['Netflix','Disney Plus','HBO Max']),
  ('n',       array['Netflix']),
  ('n,d',     array['Netflix','Disney Plus']),
  ('n,p',     array['Netflix','Amazon Prime Video']),
  ('n,d,m,p', array['Netflix','Disney Plus','HBO Max','Amazon Prime Video']),
  ('d',       array['Disney Plus']),
  ('m',       array['HBO Max']),
  ('p',       array['Amazon Prime Video']),
  ('mb',      array['MUBI','MUBI Amazon Channel'])
)
select u.nombre,
  count(*)                                                              as cualquiera,
  count(*) filter (where rt.runtime <= 90)                              as corta,
  count(*) filter (where rt.runtime > 90)                               as larga,
  count(*) filter (where nullif(btrim(rt.advertencia), '') is null)     as sin_pero
from u
join title_availability ta on ta.region = 'AR' and ta.providers && u.plats
join roulette_titles rt on rt.tmdb_id = ta.tmdb_id and rt.media_type = ta.media_type
where rt.media_type = 'movie'
  and nullif(btrim(rt.razon), '') is not null
  and rt.runtime is not null and rt.runtime > 0
  and not rt.apto_chicos
  and not rt.requiere_contexto
group by u.nombre
order by u.nombre;

-- 4. Nombres de plataforma presentes en AR. Cada uno tiene que estar en el
--    mapa de lib/roulette-providers.ts o en su lista de exclusiones
--    deliberadas (docs/MANTENIMIENTO.md §5). Un nombre nuevo es un título
--    invisible para la ruleta Y para las salas.
select distinct unnest(providers) as nombre
from title_availability
where region = 'AR'
order by 1;

-- 5. Control: cuánto pesa cada filtro por separado (para leer la consulta 1 sin
--    adivinar). `con_razon_sin_pero` son títulos que las salas ADMITEN (la card
--    va sin la sección "Pero"); los demás son los que sí se descartan.
--    `sin_razon` cuenta NULL, '' y sólo espacios; `razon_null` y `razon_vacia`
--    lo desglosan para diagnosticar los datos.
select
  count(*) filter (where nullif(btrim(razon), '') is not null
                   and nullif(btrim(advertencia), '') is null)             as con_razon_sin_pero,
  count(*) filter (where nullif(btrim(razon), '') is null)                 as sin_razon,
  count(*) filter (where razon is null)                                    as razon_null,
  count(*) filter (where razon is not null and btrim(razon) = '')          as razon_vacia,
  count(*) filter (where advertencia is not null and btrim(advertencia) = '') as pero_vacio,
  count(*) filter (where runtime is null or runtime <= 0)                  as sin_duracion,
  count(*) filter (where apto_chicos)                                      as aptas_chicos,
  count(*) filter (where requiere_contexto)                                as con_contexto,
  count(*) filter (where media_type = 'tv')                                as series
from roulette_titles;
